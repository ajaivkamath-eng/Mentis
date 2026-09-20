-- ============================================================================
-- 0013_session_templates.sql
--
-- Sessions are instances of a blueprint.
--
-- Until now the only way to describe "what a session is" was to create a
-- session and clone it, and the only recurring primitive was
-- mentis_weekly_schedules (a day-of-week + time row). Both made the instance
-- the source of truth.
--
-- This migration introduces the missing entity: a session template (blueprint)
-- that owns venue, slot, time zone, capacity, coaching trio, a staffing plan
-- and a default roster. One-off sessions are single instances of it; recurring
-- runs are a recurrence rule materialised into a session_series. Instances stay
-- mentis_sessions rows, so every existing reader (register, diary, invoices,
-- staffing, dashboards) keeps working unchanged.
--
-- Layer 1  tables  : mentis_session_templates (+_staffing, +_members),
--                    mentis_recurrence_rules, mentis_session_series and the
--                    provenance columns on mentis_sessions.
-- Layer 2  helpers : expand_recurrence(), session_template_occurrences() — one
--                    implementation of the generation rules, used both for the
--                    UI preview and for the generator.
-- Layer 3  api     : template_completeness, instantiate_session,
--                    instantiate_session_series, extend_session_series,
--                    set_session_series_status, apply_blueprint_to_session,
--                    template_from_weekly_schedule.
-- Layer 4  bridge  : every existing weekly schedule is imported as a blueprint
--                    and its sessions re-pointed to it; new inserts that only
--                    carry schedule_id are linked automatically.
-- Layer 5  views   : session_template_overview, session_series_overview.
-- Layer 6  rls     : staff read the blueprint library, admins author it.
--
-- Generation semantics (identical in the TypeScript mirror in
-- packages/core/src/templates.ts, asserted by tests/templates.test.ts):
--   * weekly / fortnightly / monthly / quarterly iterate from valid_from;
--     fortnightly is anchored on the Monday of the week containing valid_from,
--     so a fortnightly pattern is stable regardless of the start weekday.
--   * monthly repeats on the same day of month, clamped to the last day of
--     short months (31 Jan -> 28 Feb -> 31 Mar). When by_weekday is supplied,
--     monthly means "the first matching weekday per interval" instead.
--   * horizon_days (default 90) bounds open-ended rules so a series can be
--     materialised ahead of time instead of forever.
--   * the skip switches classify holiday dates. Note that rule 16
--     (guard_holiday_session) refuses to store *any* session on a no-session
--     day, so a date that is deliberately not skipped is reported back in
--     `conflicts` rather than silently created.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Layer 1 — the blueprint
-- ---------------------------------------------------------------------------

create table if not exists mentis_session_templates (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references mentis_organizations(id) on delete cascade,
  code                   text,
  name                   text not null,
  description            text,
  venue_id               uuid not null references mentis_venues(id) on delete restrict,
  default_start_time     time not null,
  default_end_time       time not null,
  timezone               text not null default 'Europe/London',
  level_band             text,
  capacity               integer,
  min_headcount          integer,
  waitlist_enabled       boolean not null default false,
  default_charge_cents   integer,
  responsible_coach_id   uuid references mentis_staff(id) on delete set null,
  leading_coach_id       uuid references mentis_staff(id) on delete set null,
  assisting_coach_id     uuid references mentis_staff(id) on delete set null,
  tags                   text[] not null default '{}',
  status                 text not null default 'active' check (status in ('draft', 'active', 'archived')),
  version                integer not null default 1,
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint session_template_time_order check (default_end_time > default_start_time),
  constraint session_template_headcount check (min_headcount is null or capacity is null or min_headcount <= capacity),
  unique (organization_id, name, venue_id)
);

comment on table mentis_session_templates is
  'Blueprint for a session: venue, slot, staffing plan and default roster. Sessions are instances of it.';
comment on column mentis_session_templates.version is
  'Bumped on material edits; instances snapshot the version they were generated from.';

create index if not exists session_templates_org_idx on mentis_session_templates (organization_id, status, name);
create index if not exists session_templates_venue_idx on mentis_session_templates (venue_id);

-- The staffing plan: one row per role slot the blueprint expects to fill.
-- A slot may name the staff member and rate card, or stay open ("someone must
-- lead, coach TBD") — generation leaves that slot unstaffed and warns.
create table if not exists mentis_session_template_staffing (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references mentis_session_templates(id) on delete cascade,
  capacity      text not null check (capacity in ('lead', 'assistant', 'sparrer')),
  staff_id      uuid references mentis_staff(id) on delete set null,
  rate_card_id  uuid references mentis_rate_cards(id) on delete set null,
  required      boolean not null default true,
  lead_minutes  integer not null default 15 check (lead_minutes >= 0),
  trail_minutes integer not null default 0 check (trail_minutes >= 0),
  notes         text,
  sort_order    integer not null default 0,
  unique (template_id, capacity, staff_id)
);

comment on table mentis_session_template_staffing is
  'Role slots a blueprint expects. lead_minutes materialises as a staffing lead-in on each instance.';

-- The default roster: who is expected to attend unless the instance is changed.
create table if not exists mentis_session_template_members (
  template_id uuid not null references mentis_session_templates(id) on delete cascade,
  member_id   uuid not null references mentis_members(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (template_id, member_id)
);

-- How a blueprint repeats. Kept separate from the blueprint so the same
-- blueprint can run a Monday series and a Wednesday series at once.
create table if not exists mentis_recurrence_rules (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references mentis_organizations(id) on delete cascade,
  template_id           uuid not null references mentis_session_templates(id) on delete cascade,
  label                 text,
  frequency             text not null default 'weekly'
                          -- 'biweekly' is accepted as an alias of 'fortnightly'
                          check (frequency in ('daily', 'weekly', 'biweekly', 'fortnightly', 'monthly', 'quarterly')),
  interval_count        integer not null default 1 check (interval_count between 1 and 12),
  by_weekday            smallint[] not null default '{}',
  start_time            time not null,
  end_time              time not null,
  valid_from            date not null,
  valid_to              date,
  horizon_days          integer not null default 90 check (horizon_days between 1 and 730),
  max_occurrences       integer check (max_occurrences is null or max_occurrences > 0),
  skip_term_holidays    boolean not null default true,
  skip_bank_holidays    boolean not null default true,
  skip_manual_closures  boolean not null default true,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint recurrence_rule_time_order check (end_time > start_time),
  constraint recurrence_rule_window check (valid_to is null or valid_to >= valid_from),
  constraint recurrence_rule_weekdays check (by_weekday <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
);

comment on table mentis_recurrence_rules is
  'Recurrence pattern for a blueprint: frequency, ISO weekdays, window and the skip switches.';

create index if not exists recurrence_rules_template_idx on mentis_recurrence_rules (template_id);

-- A published run of a blueprint. Instances point back at the series, which is
-- what "extend / pause / end the series" acts on — never the blueprint.
create table if not exists mentis_session_series (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references mentis_organizations(id) on delete cascade,
  template_id        uuid not null references mentis_session_templates(id) on delete restrict,
  recurrence_rule_id uuid not null references mentis_recurrence_rules(id) on delete restrict,
  label              text,
  venue_id           uuid references mentis_venues(id) on delete set null,
  starts_on          date not null,
  ends_on            date,
  status             text not null default 'active' check (status in ('active', 'paused', 'ended')),
  template_version   integer not null default 1,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint session_series_window check (ends_on is null or ends_on >= starts_on)
);

comment on table mentis_session_series is
  'A published run of a blueprint. Instances carry series_id; extending or ending a series never edits the blueprint.';

create index if not exists session_series_template_idx on mentis_session_series (template_id, status);
create index if not exists session_series_org_idx on mentis_session_series (organization_id, starts_on desc);

-- Provenance on the instances themselves.
alter table mentis_sessions
  add column if not exists template_id       uuid references mentis_session_templates(id) on delete set null,
  add column if not exists series_id         uuid references mentis_session_series(id) on delete set null,
  add column if not exists occurrence_date   date,
  add column if not exists blueprint         jsonb,
  add column if not exists is_exception      boolean not null default false,
  add column if not exists overridden_fields text[] not null default '{}',
  add column if not exists generated_at      timestamptz;

comment on column mentis_sessions.blueprint is
  'Snapshot of the template values this instance was generated from, so drift is traceable.';
comment on column mentis_sessions.overridden_fields is
  'Fields that currently differ from the blueprint; cleared by apply_blueprint_to_session().';

create index if not exists sessions_series_occurrence_idx on mentis_sessions (series_id, occurrence_date);
create index if not exists sessions_template_idx on mentis_sessions (template_id, start_at);
create index if not exists sessions_series_idx on mentis_sessions (series_id, start_at);

-- Blueprint version bump on material edits: instances generated afterwards are
-- visibly newer than the ones that came before, without rewriting history.
create or replace function touch_session_template() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.name is distinct from old.name
     or new.venue_id is distinct from old.venue_id
     or new.default_start_time is distinct from old.default_start_time
     or new.default_end_time is distinct from old.default_end_time
     or new.timezone is distinct from old.timezone
     or new.capacity is distinct from old.capacity
     or new.level_band is distinct from old.level_band
     or new.default_charge_cents is distinct from old.default_charge_cents
     or new.responsible_coach_id is distinct from old.responsible_coach_id
     or new.leading_coach_id is distinct from old.leading_coach_id
     or new.assisting_coach_id is distinct from old.assisting_coach_id then
    new.version := old.version + 1;
  end if;
  return new;
end $$;

drop trigger if exists session_templates_touch on mentis_session_templates;
create trigger session_templates_touch before update on mentis_session_templates
  for each row execute function touch_session_template();

create or replace function touch_session_series() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists session_series_touch on mentis_session_series;
create trigger session_series_touch before update on mentis_session_series
  for each row execute function touch_session_series();

-- ---------------------------------------------------------------------------
-- Layer 2 — generation helpers
-- ---------------------------------------------------------------------------

-- Expand a rule into occurrence dates. Pure date maths, no table access, so
-- both the preview and the generator call exactly this.
create or replace function expand_recurrence(p_rule jsonb)
returns date[]
language plpgsql
immutable
as $$
declare
  v_frequency   text    := coalesce(p_rule->>'frequency', 'weekly');
  v_interval    integer := coalesce((p_rule->>'interval_count')::integer, 1);
  v_weekdays    smallint[];
  v_from        date    := (p_rule->>'valid_from')::date;
  v_to          date;
  v_horizon     integer := coalesce((p_rule->>'horizon_days')::integer, 90);
  v_max         integer := (p_rule->>'max_occurrences')::integer;
  v_cursor      date;
  v_cap         date;
  v_dates       date[] := '{}';
  v_month_first date;
  v_last_day    date;
  v_day         integer;
  v_candidate   date;
  v_seek        integer;
  v_guard       integer := 0;
begin
  if v_from is null then
    raise exception 'recurrence rule needs valid_from';
  end if;
  v_interval := greatest(1, v_interval);

  -- horizon_days counts the first day, so an open-ended rule spans
  -- [valid_from, valid_from + horizon_days - 1] — identical to the mirror.
  v_horizon := greatest(1, v_horizon);
  v_to  := least(coalesce((p_rule->>'valid_to')::date, v_from + v_horizon - 1), v_from + v_horizon - 1);
  v_cap := v_to;

  if p_rule ? 'by_weekday' and jsonb_typeof(p_rule->'by_weekday') = 'array' then
    select coalesce(array_agg(distinct value::smallint order by value::smallint), '{}')
      into v_weekdays
      from jsonb_array_elements_text(p_rule->'by_weekday');
  end if;

  if v_frequency = 'daily' then
    v_cursor := v_from;
    while v_cursor <= v_cap loop
      v_dates := v_dates || v_cursor;
      v_cursor := v_cursor + v_interval;
      v_guard := v_guard + 1;
      exit when v_guard > 4000;
    end loop;

  elsif v_frequency in ('weekly', 'fortnightly', 'biweekly') then
    if coalesce(array_length(v_weekdays, 1), 0) = 0 then
      v_weekdays := array[extract(isodow from v_from)::smallint];
    end if;
    -- Anchor on the Monday of valid_from's week so a fortnightly pattern is
    -- stable whichever weekday it starts on.
    v_cursor := v_from - (extract(isodow from v_from)::integer - 1);
    while v_cursor <= v_cap loop
      for v_seek in 1..7 loop
        v_candidate := v_cursor + (v_seek - 1);
        if (extract(isodow from v_candidate)::smallint = any (v_weekdays))
           and v_candidate >= v_from and v_candidate <= v_cap then
          v_dates := v_dates || v_candidate;
        end if;
      end loop;
      v_cursor := v_cursor + (v_interval * (case when v_frequency = 'weekly' then 1 else 2 end) * 7);
      v_guard := v_guard + 1;
      exit when v_guard > 2000;
    end loop;

  elsif v_frequency in ('monthly', 'quarterly') then
    v_interval := v_interval * case when v_frequency = 'quarterly' then 3 else 1 end;
    v_month_first := date_trunc('month', v_from)::date;
    v_day := extract(day from v_from)::integer;
    while v_month_first <= v_cap loop
      -- Same day of month, clamped into short months (31 Jan -> 28 Feb).
      v_last_day := (v_month_first + interval '1 month - 1 day')::date;
      v_candidate := v_month_first + (least(v_day, extract(day from v_last_day)::integer) - 1);

      if coalesce(array_length(v_weekdays, 1), 0) > 0 then
        -- "The first matching weekday on/after that day, still in this month";
        -- a month with no match contributes nothing.
        while v_candidate <= v_last_day
              and not (extract(isodow from v_candidate)::smallint = any (v_weekdays)) loop
          v_candidate := v_candidate + 1;
        end loop;
        if v_candidate > v_last_day then
          v_candidate := null;
        end if;
      end if;

      if v_candidate is not null and v_candidate >= v_from and v_candidate <= v_cap then
        v_dates := v_dates || v_candidate;
      end if;

      v_month_first := (v_month_first + (v_interval || ' month')::interval)::date;
      v_guard := v_guard + 1;
      exit when v_guard > 400;
    end loop;

  else
    raise exception 'unknown recurrence frequency %', v_frequency;
  end if;

  v_dates := (select coalesce(array_agg(d order by d), '{}')::date[] from unnest(v_dates) as d);
  if v_max is not null and array_length(v_dates, 1) > v_max then
    v_dates := v_dates[1:v_max];
  end if;
  return v_dates;
end $$;

comment on function expand_recurrence(jsonb) is
  'Occurrence dates for a rule (daily/weekly/fortnightly/monthly/quarterly, horizon bounded).';

-- Expansion + holiday classification. `action` is 'generate' or 'skip'; the
-- holiday name is returned so the UI can say why a date was skipped. This is
-- the single source of truth for the preview and the generator.
create or replace function session_template_occurrences(p_rule jsonb)
returns table (
  occurrence_date date,
  action          text,
  holiday_name    text,
  holiday_kind    text,
  starts_at       timestamptz,
  ends_at         timestamptz
)
language plpgsql
stable
as $$
declare
  v_tz   text := coalesce(p_rule->>'timezone', 'Europe/London');
  v_d    date;
  v_name text;
  v_kind text;
  v_org  uuid := nullif(p_rule->>'organization_id', '')::uuid;
  v_skip boolean;
begin
  foreach v_d in array expand_recurrence(p_rule) loop
    v_name := null;
    v_kind := null;
    if v_org is not null then
      -- Latest matching row wins when windows overlap (a closure inside a term).
      select h.name, h.kind into v_name, v_kind
        from mentis_holiday_calendar h
       where h.organization_id = v_org
         and v_d between h.starts_on and h.ends_on
       order by case h.kind::text when 'manual' then 3 when 'bank_holiday' then 2 else 1 end desc,
                h.starts_on desc, h.name
       limit 1;
    end if;

    v_skip := v_name is not null
      and case v_kind
            when 'term_break'   then coalesce((p_rule->>'skip_term_holidays')::boolean, true)
            when 'bank_holiday' then coalesce((p_rule->>'skip_bank_holidays')::boolean, true)
            else coalesce((p_rule->>'skip_manual_closures')::boolean, true)
          end;

    occurrence_date := v_d;
    action          := case when v_skip then 'skip' else 'generate' end;
    holiday_name    := case when v_skip then v_name else null end;
    holiday_kind    := case when v_skip then v_kind else null end;
    starts_at       := (v_d + (p_rule->>'start_time')::time) at time zone v_tz;
    ends_at         := (v_d + (p_rule->>'end_time')::time) at time zone v_tz;
    return next;
  end loop;
end $$;

comment on function session_template_occurrences(jsonb) is
  'Every date a rule produces, flagged generate/skip with the holiday that caused the skip.';

-- ---------------------------------------------------------------------------
-- Layer 3 — provenance, drift and the public API
-- ---------------------------------------------------------------------------

-- Snapshot of the blueprint values an instance was generated from.
create or replace function blueprint_snapshot(p_template_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
           'template_id',  t.id,
           'name',         t.name,
           'version',      t.version,
           'venue_id',     t.venue_id,
           'start_time',   t.default_start_time,
           'end_time',     t.default_end_time,
           'timezone',     t.timezone,
           'capacity',     t.capacity,
           'level_band',   t.level_band,
           'charge_cents', t.default_charge_cents
         )
    from mentis_session_templates t
   where t.id = p_template_id;
$$;

-- Which blueprint-derived values differ from the blueprint? Pure comparison of
-- the supplied instance values, so it works from a trigger (new row values) and
-- from a query (stored row).
create or replace function session_blueprint_drift(
  p_template_id     uuid,
  p_name            text,
  p_start_at        timestamptz,
  p_end_at          timestamptz,
  p_venue_id        uuid,
  p_capacity        integer,
  p_level_band      text,
  p_occurrence_date date
)
returns text[]
language sql
stable
as $$
  with t as (select * from mentis_session_templates where id = p_template_id)
  select coalesce(array_agg(f order by f), '{}')
    from (
      select 'name'::text as f
        from t where p_name is distinct from t.name
      union all
      select 'start_at'
        from t where p_occurrence_date is not null
          and p_start_at is distinct from (p_occurrence_date + t.default_start_time) at time zone t.timezone
      union all
      select 'end_at'
        from t where p_occurrence_date is not null
          and p_end_at is distinct from (p_occurrence_date + t.default_end_time) at time zone t.timezone
      union all
      select 'venue_id'
        from t where p_venue_id is distinct from t.venue_id
      union all
      select 'capacity'
        from t where t.capacity is not null and p_capacity is distinct from t.capacity
      union all
      select 'level_band'
        from t where t.level_band is not null and p_level_band is distinct from t.level_band
    ) fields;
$$;

-- Convenience wrapper for the console and tests: drift of a stored instance.
create or replace function blueprint_drift_fields(p_template_id uuid, p_session_id uuid)
returns text[]
language sql
stable
as $$
  select session_blueprint_drift(
           p_template_id, s.name, s.start_at, s.end_at, s.venue_id, s.capacity, s.level_band, s.occurrence_date
         )
    from mentis_sessions s
   where s.id = p_session_id;
$$;

-- Drift is derived state: recomputed from the row on every write, so it is
-- always "what differs right now". Editing an instance back onto the blueprint
-- value simply clears the flag. Named sessions_zz_* so it runs after the other
-- BEFORE triggers and sees their final values.
create or replace function sync_session_blueprint_drift() returns trigger
language plpgsql
as $$
begin
  if new.template_id is null then
    new.overridden_fields := coalesce(new.overridden_fields, '{}');
  else
    new.overridden_fields := session_blueprint_drift(
      new.template_id, new.name, new.start_at, new.end_at,
      new.venue_id, new.capacity, new.level_band, new.occurrence_date
    );
  end if;
  new.is_exception := coalesce(array_length(new.overridden_fields, 1), 0) > 0;
  return new;
end $$;

drop trigger if exists sessions_blueprint_drift on mentis_sessions;
drop trigger if exists sessions_zz_blueprint_drift on mentis_sessions;
create trigger sessions_zz_blueprint_drift before insert or update on mentis_sessions
  for each row execute function sync_session_blueprint_drift();

comment on function sync_session_blueprint_drift() is
  'Keeps is_exception / overridden_fields honest whenever an instance is written.';

-- How usable is this blueprint? One row per problem — the console shows them
-- before publishing; nothing is refused so blueprints can be authored as drafts.
create or replace function template_completeness(p_template_id uuid)
returns table (problem text)
language sql
stable
as $$
  select 'needs a name'::text
   where coalesce((select btrim(name) from mentis_session_templates where id = p_template_id), '') = ''
  union all
  select 'needs a venue'
   where (select venue_id from mentis_session_templates where id = p_template_id) is null
  union all
  select 'session must end after it starts'
   where (select default_end_time <= default_start_time from mentis_session_templates where id = p_template_id)
  union all
  select 'needs at least one lead slot'
   where not exists (
     select 1 from mentis_session_template_staffing
      where template_id = p_template_id and capacity = 'lead' and required
   )
  union all
  select 'an archived blueprint cannot publish'
   where (select status from mentis_session_templates where id = p_template_id) = 'archived';
$$;

-- Materialise one instance. p_start_at is the instant the user asked for; the
-- date part is taken in the blueprint's time zone and the blueprint's slot
-- times are applied, so a one-off lands on the same slot as its series.
create or replace function instantiate_session(
  p_template_id uuid,
  p_start_at    timestamptz default null,
  p_options     jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_tpl      mentis_session_templates%rowtype;
  v_date     date;
  v_start    timestamptz;
  v_end      timestamptz;
  v_session  uuid;
  v_slot     record;
  v_staff    uuid;
  v_card     uuid;
  v_lead     integer;
  v_staffed  integer := 0;
  v_roster   integer := 0;
  v_warnings jsonb := '[]'::jsonb;
  v_series   uuid := nullif(p_options->>'series_id', '')::uuid;
begin
  select * into v_tpl from mentis_session_templates where id = p_template_id;
  if not found then
    raise exception 'session template % not found', p_template_id;
  end if;
  if v_tpl.status = 'archived' then
    raise exception '"%" is archived — reactivate the blueprint before scheduling from it', v_tpl.name;
  end if;
  if not is_admin(v_tpl.organization_id) then
    raise exception 'only admins can schedule sessions from a blueprint';
  end if;

  if p_start_at is null then
    v_date := coalesce((p_options->>'occurrence_date')::date, current_date);
  else
    v_date := (p_start_at at time zone v_tpl.timezone)::date;
  end if;
  v_start := (v_date + v_tpl.default_start_time) at time zone v_tpl.timezone;
  v_end   := (v_date + v_tpl.default_end_time) at time zone v_tpl.timezone;

  -- Re-publishing a term must not duplicate what is already there: an instance
  -- of the same series (or the same blueprint + slot, for a one-off) is reused.
  select id into v_session
    from mentis_sessions
   where template_id = v_tpl.id
     and coalesce(series_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(v_series, '00000000-0000-0000-0000-000000000000'::uuid)
     and (occurrence_date = v_date or (occurrence_date is null and start_at = v_start));
  if v_session is not null then
    return jsonb_build_object('session_id', v_session, 'occurrence_date', v_date, 'existing', true,
                              'warnings', '[]'::jsonb);
  end if;

  insert into mentis_sessions (
    organization_id, venue_id, template_id, series_id, occurrence_date, blueprint,
    name, start_at, end_at, status, level_band, capacity, notes, generated_at
  ) values (
    v_tpl.organization_id,
    coalesce(nullif(p_options->>'venue_id', '')::uuid, v_tpl.venue_id),
    v_tpl.id, v_series, v_date, blueprint_snapshot(v_tpl.id),
    coalesce(nullif(p_options->>'name', ''), v_tpl.name),
    v_start, v_end,
    coalesce(nullif(p_options->>'status', ''), 'scheduled')::session_status,
    coalesce(nullif(p_options->>'level_band', ''), v_tpl.level_band),
    coalesce((p_options->>'capacity')::integer, v_tpl.capacity),
    coalesce(p_options->>'notes', v_tpl.description),
    coalesce((p_options->>'generated_at')::timestamptz, now())
  ) returning id into v_session;

  -- Fill the staffing plan. A named slot becomes a real staffing row (with the
  -- staff member's latest rate card when the slot does not pin one); an open
  -- slot is reported so the console can ask for a coach.
  if coalesce((p_options->>'assign_staff')::boolean, true) then
    for v_slot in
      select * from mentis_session_template_staffing
       where template_id = v_tpl.id
       order by sort_order, capacity
    loop
      v_staff := coalesce(v_slot.staff_id, case v_slot.capacity
                                                when 'lead' then v_tpl.leading_coach_id
                                                when 'assistant' then v_tpl.assisting_coach_id
                                                else null end);
      if v_staff is null then
        if v_slot.required then
          v_warnings := v_warnings || jsonb_build_object(
            'slot', v_slot.capacity,
            'message', format('%s slot is open — assign a coach', v_slot.capacity)
          );
        end if;
        continue;
      end if;

      v_card := coalesce(
        v_slot.rate_card_id,
        (select rc.id from mentis_rate_cards rc
          where rc.staff_id = v_staff
          order by rc.valid_from desc
          limit 1)
      );
      if v_card is null then
        v_warnings := v_warnings || jsonb_build_object(
          'slot', v_slot.capacity,
          'message', 'no rate card for this coach — staffing left open'
        );
        continue;
      end if;

      v_lead := greatest(0, v_slot.lead_minutes);
      begin
        insert into mentis_session_staffing (
          session_id, staff_id, capacity, rate_card_id, planned_start, planned_end
        ) values (
          v_session, v_staff, v_slot.capacity, v_card,
          v_start - make_interval(mins => v_lead),
          v_end + make_interval(mins => v_slot.trail_minutes)
        );
        v_staffed := v_staffed + 1;
      exception when others then
        v_warnings := v_warnings || jsonb_build_object(
          'slot', v_slot.capacity,
          'message', format('could not staff the %s slot: %s', v_slot.capacity, sqlerrm)
        );
      end;
    end loop;
  end if;

  -- Default roster: the register rows the blueprint expects to be filled.
  if coalesce((p_options->>'enroll_roster')::boolean, true) and v_start >= now() then
    insert into mentis_enrollments (session_id, member_id)
    select v_session, m.member_id
      from mentis_session_template_members m
     where m.template_id = v_tpl.id
    on conflict do nothing;
    get diagnostics v_roster = row_count;
  end if;

  return jsonb_build_object(
    'session_id', v_session,
    'occurrence_date', v_date,
    'start_at', v_start,
    'end_at', v_end,
    'template_version', v_tpl.version,
    'staffed_slots', v_staffed,
    'roster_size', v_roster,
    'existing', false,
    'warnings', v_warnings
  );
end $$;

comment on function instantiate_session(uuid, timestamptz, jsonb) is
  'Create one session from a blueprint (staffing plan + default roster applied). Idempotent per slot.';

-- Publish a recurring run. Accepts either an inline rule (p_rule) or an existing
-- mentis_recurrence_rules row (p_options.rule_id). Occurrences are created in
-- order; a date that clashes with a scheduling guard is rolled back on its own
-- and reported in `conflicts`, so one bad date cannot abandon a term.
create or replace function instantiate_session_series(
  p_template_id uuid,
  p_rule        jsonb default '{}'::jsonb,
  p_options     jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_tpl       mentis_session_templates%rowtype;
  v_rule      mentis_recurrence_rules%rowtype;
  v_series    uuid := nullif(coalesce(p_options->>'series_id', p_rule->>'series_id'), '')::uuid;
  v_rule_id   uuid := nullif(coalesce(p_options->>'rule_id', p_rule->>'rule_id'), '')::uuid;
  v_label     text := coalesce(nullif(p_options->>'label', ''), nullif(p_rule->>'label', ''));
  v_rule_json jsonb;
  v_expansion jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_warnings  jsonb := '[]'::jsonb;
  v_generated integer := 0;
  v_requested integer := 0;
  v_existing  integer := 0;
  v_skipped_term   integer := 0;
  v_skipped_bank   integer := 0;
  v_skipped_manual integer := 0;
  v_created_at timestamptz := now();
  v_instance  jsonb;
  v_occ       record;
  v_warning   record;
begin
  select * into v_tpl from mentis_session_templates where id = p_template_id;
  if not found then
    raise exception 'session template % not found', p_template_id;
  end if;
  if v_tpl.status = 'archived' then
    raise exception '"%" is archived — reactivate the blueprint before publishing a series', v_tpl.name;
  end if;
  if not is_admin(v_tpl.organization_id) then
    raise exception 'only admins can publish a session series';
  end if;

  if v_rule_id is not null then
    select * into v_rule from mentis_recurrence_rules where id = v_rule_id;
    if not found then
      raise exception 'recurrence rule % not found', v_rule_id;
    end if;
    v_rule_json := jsonb_build_object(
      'organization_id', v_rule.organization_id,
      'frequency', v_rule.frequency,
      'interval_count', v_rule.interval_count,
      'by_weekday', to_jsonb(v_rule.by_weekday),
      'start_time', v_rule.start_time,
      'end_time', v_rule.end_time,
      'timezone', v_tpl.timezone,
      'valid_from', v_rule.valid_from,
      'valid_to', v_rule.valid_to,
      'horizon_days', v_rule.horizon_days,
      'max_occurrences', v_rule.max_occurrences,
      'skip_term_holidays', v_rule.skip_term_holidays,
      'skip_bank_holidays', v_rule.skip_bank_holidays,
      'skip_manual_closures', v_rule.skip_manual_closures
    );
    v_rule_json := v_rule_json || coalesce(nullif(p_options->'rule', 'null'::jsonb), '{}'::jsonb);
  else
    v_rule_json := jsonb_build_object(
      'organization_id', v_tpl.organization_id,
      'frequency', 'weekly',
      'interval_count', 1,
      'by_weekday', '[]'::jsonb,
      'start_time', v_tpl.default_start_time,
      'end_time', v_tpl.default_end_time,
      'timezone', v_tpl.timezone,
      'valid_from', current_date,
      'valid_to', null,
      'horizon_days', 90,
      'skip_term_holidays', true,
      'skip_bank_holidays', true,
      'skip_manual_closures', true
    ) || coalesce(p_rule, '{}'::jsonb);
    v_rule_json := jsonb_set(v_rule_json, '{organization_id}', to_jsonb(v_tpl.organization_id));
    v_rule_json := jsonb_set(v_rule_json, '{timezone}', to_jsonb(coalesce(v_rule_json->>'timezone', v_tpl.timezone)));

    if v_series is null or not exists (select 1 from mentis_session_series where id = v_series) then
      insert into mentis_recurrence_rules (
        organization_id, template_id, label, frequency, interval_count, by_weekday,
        start_time, end_time, valid_from, valid_to, horizon_days, max_occurrences,
        skip_term_holidays, skip_bank_holidays, skip_manual_closures
      ) values (
        (v_rule_json->>'organization_id')::uuid, v_tpl.id, v_label,
        v_rule_json->>'frequency',
        coalesce((v_rule_json->>'interval_count')::integer, 1),
        coalesce(
          (select array_agg(value::smallint order by value::smallint)
             from jsonb_array_elements_text(coalesce(v_rule_json->'by_weekday', '[]'::jsonb))),
          '{}'::smallint[]
        ),
        (v_rule_json->>'start_time')::time,
        (v_rule_json->>'end_time')::time,
        (v_rule_json->>'valid_from')::date,
        nullif(v_rule_json->>'valid_to', '')::date,
        coalesce((v_rule_json->>'horizon_days')::integer, 90),
        (v_rule_json->>'max_occurrences')::integer,
        coalesce((v_rule_json->>'skip_term_holidays')::boolean, true),
        coalesce((v_rule_json->>'skip_bank_holidays')::boolean, true),
        coalesce((v_rule_json->>'skip_manual_closures')::boolean, true)
      ) returning id into v_rule_id;
    else
      select recurrence_rule_id into v_rule_id from mentis_session_series where id = v_series;
    end if;
  end if;

  if v_series is null then
    insert into mentis_session_series (
      organization_id, template_id, recurrence_rule_id, label, venue_id, starts_on, ends_on,
      status, template_version, created_by
    ) values (
      v_tpl.organization_id, v_tpl.id, v_rule_id, v_label, v_tpl.venue_id,
      (v_rule_json->>'valid_from')::date,
      nullif(v_rule_json->>'valid_to', '')::date,
      coalesce(nullif(p_options->>'status', ''), 'active'),
      v_tpl.version,
      coalesce((p_options->>'created_by')::uuid, auth.uid())
    ) returning id into v_series;
  else
    update mentis_session_series
       set template_version = v_tpl.version, updated_at = now()
     where id = v_series;
  end if;

  for v_occ in
    select * from session_template_occurrences(v_rule_json || jsonb_build_object('series_id', v_series))
  loop
    v_expansion := v_expansion || jsonb_build_object(
      'date', v_occ.occurrence_date,
      'action', v_occ.action,
      'holiday_name', v_occ.holiday_name,
      'holiday_kind', v_occ.holiday_kind,
      'starts_at', v_occ.starts_at
    );

    if v_occ.action = 'skip' then
      if v_occ.holiday_kind = 'bank_holiday' then
        v_skipped_bank := v_skipped_bank + 1;
      elsif v_occ.holiday_kind = 'term_break' then
        v_skipped_term := v_skipped_term + 1;
      else
        v_skipped_manual := v_skipped_manual + 1;
      end if;
      continue;
    end if;

    v_requested := v_requested + 1;

    if exists (select 1 from mentis_sessions where series_id = v_series and occurrence_date = v_occ.occurrence_date) then
      v_existing := v_existing + 1;
      continue;
    end if;

    -- Each date is materialised in its own sub-transaction: the scheduling
    -- guards (venue concurrency, staff overlap, no-session days) raise, and we
    -- record that date instead of losing the rest of the run.
    begin
      v_instance := instantiate_session(
        v_tpl.id,
        v_occ.starts_at,
        jsonb_build_object(
          'series_id', v_series,
          'occurrence_date', v_occ.occurrence_date,
          'generated_at', v_created_at,
          'assign_staff', coalesce((p_options->>'assign_staff')::boolean, true),
          'enroll_roster', coalesce((p_options->>'enroll_roster')::boolean, true)
        ) || coalesce(p_options->'instance', '{}'::jsonb)
      );
      if v_instance->>'existing' = 'true' then
        v_existing := v_existing + 1;
      else
        v_generated := v_generated + 1;
      end if;
      for v_warning in
        select value from jsonb_array_elements(coalesce(v_instance->'warnings', '[]'::jsonb))
      loop
        v_warnings := v_warnings || (v_warning.value || jsonb_build_object('date', v_occ.occurrence_date));
      end loop;
    exception when others then
      v_conflicts := v_conflicts || jsonb_build_object(
        'date', v_occ.occurrence_date,
        'starts_at', v_occ.starts_at,
        'message', sqlerrm
      );
    end;
  end loop;

  if v_generated > 0 then
    update mentis_session_series
       set ends_on = greatest(coalesce(ends_on, (v_rule_json->>'valid_from')::date),
                              (select max(occurrence_date) from mentis_sessions where series_id = v_series)),
           updated_at = now()
     where id = v_series;
  end if;

  return jsonb_build_object(
    'series_id', v_series,
    'rule_id', v_rule_id,
    'requested', v_requested,
    'generated', v_generated,
    'existing', v_existing,
    'skipped_existing', v_existing,
    'skipped_term_holidays', v_skipped_term,
    'skipped_bank_holidays', v_skipped_bank,
    'skipped_manual_closures', v_skipped_manual,
    'occurrences', v_expansion,
    'conflicts', v_conflicts,
    'warnings', v_warnings
  );
end $$;

comment on function instantiate_session_series(uuid, jsonb, jsonb) is
  'Publish a recurring run of a blueprint: creates/uses the series and materialises its occurrences.';

-- Materialise more of an existing series up to its horizon.
create or replace function extend_session_series(p_series_id uuid, p_options jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_series mentis_session_series%rowtype;
  v_rule   mentis_recurrence_rules%rowtype;
begin
  select * into v_series from mentis_session_series where id = p_series_id;
  if not found then
    raise exception 'session series % not found', p_series_id;
  end if;
  if v_series.status = 'ended' then
    raise exception 'this series has ended — resume it before extending';
  end if;

  select * into v_rule from mentis_recurrence_rules where id = v_series.recurrence_rule_id;

  return instantiate_session_series(
    v_series.template_id,
    jsonb_build_object(
      'organization_id', v_series.organization_id,
      'frequency', v_rule.frequency,
      'interval_count', v_rule.interval_count,
      'by_weekday', to_jsonb(v_rule.by_weekday),
      'start_time', v_rule.start_time,
      'end_time', v_rule.end_time,
      'valid_from', v_rule.valid_from,
      'valid_to', v_rule.valid_to,
      'horizon_days', coalesce((p_options->>'horizon_days')::integer, v_rule.horizon_days),
      'max_occurrences', v_rule.max_occurrences,
      'skip_term_holidays', v_rule.skip_term_holidays,
      'skip_bank_holidays', v_rule.skip_bank_holidays,
      'skip_manual_closures', v_rule.skip_manual_closures
    ) || coalesce(p_options->'rule', '{}'::jsonb),
    jsonb_build_object('series_id', p_series_id, 'rule_id', v_rule.id) || coalesce(p_options, '{}'::jsonb)
  );
end $$;

comment on function extend_session_series(uuid, jsonb) is
  'Materialise more occurrences of a series (extends up to the rule horizon).';

-- Pause / resume / end a series. Cancelling future instances is explicit, and
-- ending never touches past or already-cancelled instances.
create or replace function set_session_series_status(
  p_series_id     uuid,
  p_status        text,
  p_cancel_future boolean default false,
  p_reason        text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_series mentis_session_series%rowtype;
  v_cancelled integer := 0;
begin
  if p_status not in ('active', 'paused', 'ended') then
    raise exception 'unknown series status %', p_status;
  end if;

  select * into v_series from mentis_session_series where id = p_series_id;
  if not found then
    raise exception 'session series % not found', p_series_id;
  end if;
  if not is_admin(v_series.organization_id) then
    raise exception 'only admins can change a session series';
  end if;

  update mentis_session_series
     set status = p_status,
         ends_on = case when p_status = 'ended'
                        then coalesce((select max(occurrence_date) from mentis_sessions where series_id = p_series_id), ends_on)
                        else ends_on end,
         updated_at = now()
   where id = p_series_id;

  if p_status = 'ended' and p_cancel_future then
    update mentis_sessions
       set status = 'cancelled',
           cancel_reason = coalesce(nullif(p_reason, ''), cancel_reason, 'series ended')
     where series_id = p_series_id
       and start_at > now()
       and status <> 'cancelled';
    get diagnostics v_cancelled = row_count;
  end if;

  return jsonb_build_object(
    'series_id', p_series_id,
    'status', p_status,
    'cancelled_instances', v_cancelled
  );
end $$;

comment on function set_session_series_status(uuid, text, boolean, text) is
  'Pause, resume or end a published series, optionally cancelling its future instances.';

-- Put a drifted instance back on the blueprint — only the fields that differ,
-- or the ones the caller lists. Attendance, registers, staffing edits and
-- invoices are never touched.
create or replace function apply_blueprint_to_session(
  p_session_id uuid,
  p_fields     text[] default null,
  p_source     text default 'blueprint'
)
returns jsonb
language plpgsql
as $$
declare
  v_session   mentis_sessions%rowtype;
  v_tpl       mentis_session_templates%rowtype;
  v_base      date;
  v_fields    text[];
  v_applied   text[];
  v_remaining text[];
  v_start     timestamptz;
  v_end       timestamptz;
begin
  select * into v_session from mentis_sessions where id = p_session_id;
  if not found then
    raise exception 'session % not found', p_session_id;
  end if;
  if v_session.template_id is null then
    raise exception 'this session was not created from a blueprint';
  end if;
  if not is_admin(v_session.organization_id) then
    raise exception 'only admins can re-apply a blueprint';
  end if;

  select * into v_tpl from mentis_session_templates where id = v_session.template_id;

  v_base := coalesce(v_session.occurrence_date, (v_session.start_at at time zone v_tpl.timezone)::date);
  v_start := (v_base + v_tpl.default_start_time) at time zone v_tpl.timezone;
  v_end   := (v_base + v_tpl.default_end_time) at time zone v_tpl.timezone;

  -- No field list = re-apply exactly what drifted, nothing else.
  v_fields := coalesce(p_fields, v_session.overridden_fields, '{}');
  v_applied := array(select f from unnest(v_fields) as f);
  v_remaining := array(select f from unnest(coalesce(v_session.overridden_fields, '{}')) as f where f <> all (v_applied));

  update mentis_sessions s
     set name        = case when 'name'        = any (v_applied) then v_tpl.name              else s.name end,
         start_at    = case when 'start_at'    = any (v_applied) then v_start               else s.start_at end,
         end_at      = case when 'end_at'      = any (v_applied) then v_end                 else s.end_at end,
         venue_id    = case when 'venue_id'    = any (v_applied) then v_tpl.venue_id        else s.venue_id end,
         capacity    = case when 'capacity'    = any (v_applied) then v_tpl.capacity        else s.capacity end,
         level_band  = case when 'level_band'  = any (v_applied) then v_tpl.level_band      else s.level_band end,
         blueprint   = blueprint_snapshot(v_tpl.id),
         overridden_fields = v_remaining,
         is_exception = coalesce(array_length(v_remaining, 1), 0) > 0
   where s.id = p_session_id;

  return jsonb_build_object(
    'session_id', p_session_id,
    'source', coalesce(p_source, 'blueprint'),
    'template_version', v_tpl.version,
    'applied', to_jsonb(v_applied),
    'remaining_overrides', to_jsonb(coalesce(v_remaining, '{}'))
  );
end $$;

comment on function apply_blueprint_to_session(uuid, text[], text) is
  'Re-apply blueprint values to a drifted instance (defaults to the drifted fields only).';

-- ---------------------------------------------------------------------------
-- Layer 4 — bridge from the legacy weekly schedules
-- ---------------------------------------------------------------------------

-- The legacy weekly schedules keep working: they gain a pointer to the
-- blueprint they now describe, so Scheduling can show and edit the same entity.
alter table mentis_weekly_schedules
  add column if not exists template_id       uuid references mentis_session_templates(id) on delete set null,
  add column if not exists recurrence_rule_id uuid references mentis_recurrence_rules(id) on delete set null;

comment on column mentis_weekly_schedules.template_id is
  'Blueprint this legacy weekly pattern was imported into; null until template_from_weekly_schedule() runs.';

-- Import one weekly schedule as blueprint + rule + series and re-point its
-- sessions. Idempotent: a schedule that already has a template is returned.
create or replace function template_from_weekly_schedule(p_schedule_id uuid)
returns uuid
language plpgsql
as $$
declare
  w      mentis_weekly_schedules%rowtype;
  v_tpl  uuid;
  v_rule uuid;
  v_ser  uuid;
begin
  select * into w from mentis_weekly_schedules where id = p_schedule_id;
  if not found then
    raise exception 'weekly schedule % not found', p_schedule_id;
  end if;

  if w.template_id is not null then
    select id into v_tpl from mentis_session_templates where id = w.template_id;
    if v_tpl is not null then
      return v_tpl;
    end if;
  end if;

  -- The same schedule can be imported twice in one session; the unique key on
  -- (organization, name, venue) makes the second call reuse the first template.
  select id into v_tpl from mentis_session_templates
   where organization_id = w.organization_id and name = w.name and venue_id = w.venue_id;

  if v_tpl is null then
    insert into mentis_session_templates (
      organization_id, code, name, venue_id, default_start_time, default_end_time,
      responsible_coach_id, leading_coach_id, assisting_coach_id, status
    ) values (
      w.organization_id,
      'WKY-' || upper(substr(replace(w.id::text, '-', ''), 1, 6)),
      w.name, w.venue_id, w.start_time, w.end_time,
      w.responsible_coach_id, w.leading_coach_id, w.assisting_coach_id, 'active'
    ) returning id into v_tpl;
  end if;

  -- Carry the schedule's staffing expectations across as blueprint slots.
  insert into mentis_session_template_staffing (template_id, capacity, staff_id, rate_card_id)
  select v_tpl, ss.capacity, ss.staff_id, ss.rate_card_id
    from mentis_schedule_staff ss
   where ss.schedule_id = w.id
  on conflict do nothing;

  insert into mentis_recurrence_rules (
    organization_id, template_id, label, frequency, by_weekday, start_time, end_time, valid_from, valid_to
  ) values (
    w.organization_id, v_tpl, w.name, 'weekly',
    array[(case when w.day_of_week = 0 then 7 else w.day_of_week end)::smallint],
    w.start_time, w.end_time, w.valid_from, w.valid_to
  ) returning id into v_rule;

  insert into mentis_session_series (
    organization_id, template_id, recurrence_rule_id, label, venue_id, starts_on, ends_on, status
  ) values (
    w.organization_id, v_tpl, v_rule, w.name, w.venue_id, w.valid_from, w.valid_to, 'active'
  ) returning id into v_ser;

  update mentis_weekly_schedules
     set template_id = v_tpl, recurrence_rule_id = v_rule
   where id = w.id;

  update mentis_sessions s
     set template_id = v_tpl,
         series_id = v_ser,
         occurrence_date = s.start_at::date,
         blueprint = blueprint_snapshot(v_tpl),
         generated_at = coalesce(s.generated_at, now())
   where s.schedule_id = w.id
     and s.template_id is null;

  return v_tpl;
end $$;

comment on function template_from_weekly_schedule(uuid) is
  'Import a legacy weekly schedule as a blueprint + rule + series (idempotent).';

-- Instances created the old way (by writing mentis_sessions with a schedule_id)
-- still get the full provenance, so nothing in flight loses its blueprint.
create or replace function link_session_blueprint() returns trigger
language plpgsql
as $$
declare
  v_tpl uuid;
  v_ser uuid;
begin
  if new.template_id is null and new.schedule_id is not null then
    select template_id into v_tpl from mentis_weekly_schedules where id = new.schedule_id;
    if v_tpl is not null then
      select id into v_ser from mentis_session_series
       where template_id = v_tpl
       order by (status = 'active') desc, starts_on desc
       limit 1;
      new.template_id := v_tpl;
      new.series_id := coalesce(new.series_id, v_ser);
    end if;
  end if;

  if new.template_id is not null then
    new.occurrence_date := coalesce(new.occurrence_date, new.start_at::date);
    new.blueprint := coalesce(new.blueprint, blueprint_snapshot(new.template_id));
    new.generated_at := coalesce(new.generated_at, now());
  end if;
  return new;
end $$;

drop trigger if exists sessions_link_blueprint on mentis_sessions;
create trigger sessions_link_blueprint before insert on mentis_sessions
  for each row execute function link_session_blueprint();

-- Backfill every schedule that exists today.
do $$
declare
  w uuid;
begin
  for w in select id from mentis_weekly_schedules where template_id is null loop
    perform template_from_weekly_schedule(w);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Layer 5 — views
-- ---------------------------------------------------------------------------

create or replace view session_template_overview with (security_invoker = true) as
  select
    t.id,
    t.organization_id,
    t.code,
    t.name,
    t.description,
    t.venue_id,
    v.name                                   as venue_name,
    t.default_start_time,
    t.default_end_time,
    t.timezone,
    t.level_band,
    t.capacity,
    t.min_headcount,
    t.default_charge_cents,
    t.responsible_coach_id,
    t.leading_coach_id,
    t.assisting_coach_id,
    t.status,
    t.version,
    t.tags,
    t.created_at,
    t.updated_at,
    (select count(*) from mentis_session_series s where s.template_id = t.id and s.status = 'active')  as active_series,
    (select count(*) from mentis_session_template_staffing s where s.template_id = t.id)              as staffing_slots,
    (select count(*) from mentis_session_template_members m where m.template_id = t.id)              as roster_size,
    (select count(*) from mentis_sessions i
      where i.template_id = t.id and i.status <> 'cancelled' and i.start_at >= now())                as upcoming_instances,
    (select count(*) from mentis_sessions i where i.template_id = t.id and i.is_exception)           as drifted_instances,
    (select min(i.start_at) from mentis_sessions i
      where i.template_id = t.id and i.status <> 'cancelled' and i.start_at >= now())                as next_occurrence_at
  from mentis_session_templates t
  join mentis_venues v on v.id = t.venue_id;

comment on view session_template_overview is
  'Blueprint + roll-up counts (series, slots, roster, upcoming, drift) for the console rail.';

create or replace view session_series_overview with (security_invoker = true) as
  select
    s.id,
    s.organization_id,
    s.template_id,
    t.name                                as template_name,
    s.label,
    s.venue_id,
    v.name                                as venue_name,
    s.starts_on,
    s.ends_on,
    s.status,
    r.frequency,
    r.interval_count,
    r.by_weekday,
    r.start_time,
    r.end_time,
    s.template_version,
    t.version                             as blueprint_version,
    (select count(*) from mentis_sessions i where i.series_id = s.id)                             as instance_count,
    (select count(*) from mentis_sessions i where i.series_id = s.id and i.is_exception)          as exception_count,
    (select count(*) from mentis_sessions i where i.series_id = s.id and i.status = 'cancelled')  as cancelled_instances,
    (select min(i.start_at) from mentis_sessions i
      where i.series_id = s.id and i.status <> 'cancelled' and i.start_at >= now())               as next_occurrence_at
  from mentis_session_series s
  join mentis_session_templates t on t.id = s.template_id
  left join mentis_venues v on v.id = s.venue_id
  join mentis_recurrence_rules r on r.id = s.recurrence_rule_id;

comment on view session_series_overview is
  'Series + pattern + per-series instance/drift counts, and whether it lags the blueprint version.';

-- ---------------------------------------------------------------------------
-- Layer 6 — RLS
-- ---------------------------------------------------------------------------

alter table mentis_session_templates          enable row level security;
alter table mentis_session_template_staffing  enable row level security;
alter table mentis_session_template_members   enable row level security;
alter table mentis_recurrence_rules           enable row level security;
alter table mentis_session_series             enable row level security;

-- Blueprints are documentation of how the club runs: any staff member may read
-- them, only admins may change them.
drop policy if exists session_templates_select on mentis_session_templates;
create policy session_templates_select on mentis_session_templates
  for select using (is_staff(organization_id));
drop policy if exists session_templates_write on mentis_session_templates;
create policy session_templates_write on mentis_session_templates
  for all using (is_admin(organization_id)) with check (is_admin(organization_id));

drop policy if exists session_template_staffing_select on mentis_session_template_staffing;
create policy session_template_staffing_select on mentis_session_template_staffing
  for select using (is_staff((select t.organization_id from mentis_session_templates t where t.id = template_id)));
drop policy if exists session_template_staffing_write on mentis_session_template_staffing;
create policy session_template_staffing_write on mentis_session_template_staffing
  for all using (is_admin((select t.organization_id from mentis_session_templates t where t.id = template_id)))
  with check (is_admin((select t.organization_id from mentis_session_templates t where t.id = template_id)));

drop policy if exists session_template_members_select on mentis_session_template_members;
create policy session_template_members_select on mentis_session_template_members
  for select using (is_staff((select t.organization_id from mentis_session_templates t where t.id = template_id)));
drop policy if exists session_template_members_write on mentis_session_template_members;
create policy session_template_members_write on mentis_session_template_members
  for all using (is_admin((select t.organization_id from mentis_session_templates t where t.id = template_id)))
  with check (is_admin((select t.organization_id from mentis_session_templates t where t.id = template_id)));

drop policy if exists recurrence_rules_select on mentis_recurrence_rules;
create policy recurrence_rules_select on mentis_recurrence_rules
  for select using (is_staff(organization_id));
drop policy if exists recurrence_rules_write on mentis_recurrence_rules;
create policy recurrence_rules_write on mentis_recurrence_rules
  for all using (is_admin(organization_id)) with check (is_admin(organization_id));

drop policy if exists session_series_select on mentis_session_series;
create policy session_series_select on mentis_session_series
  for select using (is_staff(organization_id));
drop policy if exists session_series_write on mentis_session_series;
create policy session_series_write on mentis_session_series
  for all using (is_admin(organization_id)) with check (is_admin(organization_id));

grant select on session_template_overview to authenticated;
grant select on session_series_overview to authenticated;
grant select, insert, update, delete on mentis_session_templates,
  mentis_session_template_staffing, mentis_session_template_members,
  mentis_recurrence_rules, mentis_session_series to authenticated;
grant execute on function
  expand_recurrence(jsonb),
  session_template_occurrences(jsonb),
  blueprint_snapshot(uuid),
  session_blueprint_drift(uuid, text, timestamptz, timestamptz, uuid, integer, text, date),
  blueprint_drift_fields(uuid, uuid),
  template_completeness(uuid),
  instantiate_session(uuid, timestamptz, jsonb),
  instantiate_session_series(uuid, jsonb, jsonb),
  extend_session_series(uuid, jsonb),
  set_session_series_status(uuid, text, boolean, text),
  apply_blueprint_to_session(uuid, text[], text),
  template_from_weekly_schedule(uuid)
to authenticated, service_role;
