DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0027_batch_groupings.sql';
END $$;

-- Cohort / season dimension shared by weekly patterns, program runs and sessions.
create table if not exists mentis_batch_groupings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references mentis_organizations(id) on delete cascade,
  name            text not null check (length(btrim(name)) > 0),
  code            text not null check (length(btrim(code)) between 2 and 20),
  start_date      date not null,
  end_date        date not null,
  status          text not null default 'upcoming'
                    check (status in ('upcoming', 'active', 'completed', 'archived')),
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint batch_grouping_date_window check (end_date >= start_date),
  constraint batch_grouping_org_code_unique unique (organization_id, code)
);

comment on table mentis_batch_groupings is
  'Organization-scoped cohort or season. Program runs, weekly patterns, and generated sessions carry this lineage.';

create index if not exists batch_groupings_org_dates_idx
  on mentis_batch_groupings (organization_id, start_date desc, end_date);

alter table mentis_weekly_schedules
  add column if not exists batch_grouping_id uuid references mentis_batch_groupings(id) on delete restrict;
alter table mentis_recurrence_rules
  add column if not exists batch_grouping_id uuid references mentis_batch_groupings(id) on delete restrict;
alter table mentis_session_series
  add column if not exists batch_grouping_id uuid references mentis_batch_groupings(id) on delete restrict;
alter table mentis_sessions
  add column if not exists batch_grouping_id uuid references mentis_batch_groupings(id) on delete restrict;

-- Give every existing org a stable compatibility grouping. It keeps old rows
-- queryable and means non-program legacy session writers cannot leave sessions
-- without a cohort. New program/pattern flows always send an explicit grouping.
insert into mentis_batch_groupings (
  organization_id, name, code, start_date, end_date, status, description
)
select
  o.id, 'Legacy / Unassigned', 'LEGACY', date '1900-01-01', date '9999-12-31', 'active',
  'Compatibility grouping for records created before cohort tagging was introduced.'
from mentis_organizations o
on conflict (organization_id, code) do nothing;

create or replace function mentis_default_batch_grouping_id(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_organization_id is null then
    raise exception 'A batch grouping requires an organisation';
  end if;

  select id into v_id
    from mentis_batch_groupings
   where organization_id = p_organization_id and code = 'LEGACY';
  if v_id is null then
    insert into mentis_batch_groupings (
      organization_id, name, code, start_date, end_date, status, description
    ) values (
      p_organization_id, 'Legacy / Unassigned', 'LEGACY', date '1900-01-01', date '9999-12-31', 'active',
      'Compatibility grouping for records created before cohort tagging was introduced.'
    )
    on conflict (organization_id, code) do update set code = excluded.code
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Organisations created after this migration get the same safe compatibility
-- row; actual ProgramRun / WeeklyPattern creation still requires an explicit ID.
create or replace function create_organization_default_batch_grouping()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform mentis_default_batch_grouping_id(new.id);
  return new;
end $$;

drop trigger if exists organizations_default_batch_grouping on mentis_organizations;
create trigger organizations_default_batch_grouping
  after insert on mentis_organizations
  for each row execute function create_organization_default_batch_grouping();

-- Backfill with the closest known lineage before falling back to LEGACY.
update mentis_weekly_schedules w
   set batch_grouping_id = mentis_default_batch_grouping_id(w.organization_id)
 where w.batch_grouping_id is null;

update mentis_session_series s
   set batch_grouping_id = mentis_default_batch_grouping_id(s.organization_id)
 where s.batch_grouping_id is null;

update mentis_recurrence_rules r
   set batch_grouping_id = coalesce(
     (select s.batch_grouping_id from mentis_session_series s where s.recurrence_rule_id = r.id limit 1),
     (select w.batch_grouping_id from mentis_weekly_schedules w where w.recurrence_rule_id = r.id limit 1),
     mentis_default_batch_grouping_id(r.organization_id)
   )
 where r.batch_grouping_id is null;

update mentis_sessions s
   set batch_grouping_id = coalesce(
     (select run.batch_grouping_id from mentis_session_series run where run.id = s.series_id),
     (select pattern.batch_grouping_id from mentis_weekly_schedules pattern where pattern.id = s.schedule_id),
     mentis_default_batch_grouping_id(s.organization_id)
   )
 where s.batch_grouping_id is null;

alter table mentis_weekly_schedules alter column batch_grouping_id set not null;
alter table mentis_recurrence_rules alter column batch_grouping_id set not null;
alter table mentis_session_series alter column batch_grouping_id set not null;
alter table mentis_sessions alter column batch_grouping_id set not null;

create index if not exists weekly_schedules_batch_grouping_idx
  on mentis_weekly_schedules (batch_grouping_id, valid_from, valid_to);
create index if not exists recurrence_rules_batch_grouping_idx
  on mentis_recurrence_rules (batch_grouping_id, valid_from, valid_to);
create index if not exists session_series_batch_grouping_idx
  on mentis_session_series (batch_grouping_id, starts_on desc);
create index if not exists sessions_batch_grouping_start_idx
  on mentis_sessions (batch_grouping_id, start_at);

-- Fill the LEGACY grouping for older insert paths, preserve explicitly selected
-- groups, and make a ProgramRun's group authoritative for all child sessions.
create or replace function enforce_batch_grouping_lineage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_parent_group_id uuid;
  v_group_org uuid;
  v_context_group_id uuid;
begin
  v_context_group_id := nullif(current_setting('mentis.batch_grouping_id', true), '')::uuid;

  if tg_table_name = 'mentis_sessions' then
    if new.series_id is not null then
      select batch_grouping_id into v_parent_group_id
        from mentis_session_series where id = new.series_id;
    end if;
    if v_parent_group_id is null and new.schedule_id is not null then
      select batch_grouping_id into v_parent_group_id
        from mentis_weekly_schedules where id = new.schedule_id;
    end if;

    if v_parent_group_id is not null then
      if tg_op = 'INSERT' and new.batch_grouping_id is not null
         and new.batch_grouping_id <> v_parent_group_id then
        raise exception 'A generated session must inherit the batch grouping of its program run or weekly pattern';
      end if;
      new.batch_grouping_id := v_parent_group_id;
    else
      new.batch_grouping_id := coalesce(new.batch_grouping_id, v_context_group_id,
                                        mentis_default_batch_grouping_id(new.organization_id));
    end if;
  else
    new.batch_grouping_id := coalesce(new.batch_grouping_id, v_context_group_id,
                                      mentis_default_batch_grouping_id(new.organization_id));
  end if;

  select organization_id into v_group_org
    from mentis_batch_groupings where id = new.batch_grouping_id;
  if v_group_org is null then
    raise exception 'Batch grouping % does not exist', new.batch_grouping_id;
  end if;
  if v_group_org <> new.organization_id then
    raise exception 'Batch grouping % belongs to another organisation', new.batch_grouping_id;
  end if;
  return new;
end $$;

drop trigger if exists weekly_schedules_batch_grouping_lineage on mentis_weekly_schedules;
create trigger weekly_schedules_batch_grouping_lineage
  before insert or update on mentis_weekly_schedules
  for each row execute function enforce_batch_grouping_lineage();

drop trigger if exists recurrence_rules_batch_grouping_lineage on mentis_recurrence_rules;
create trigger recurrence_rules_batch_grouping_lineage
  before insert or update on mentis_recurrence_rules
  for each row execute function enforce_batch_grouping_lineage();

drop trigger if exists session_series_batch_grouping_lineage on mentis_session_series;
create trigger session_series_batch_grouping_lineage
  before insert or update on mentis_session_series
  for each row execute function enforce_batch_grouping_lineage();

drop trigger if exists sessions_batch_grouping_lineage on mentis_sessions;
create trigger sessions_batch_grouping_lineage
  before insert or update on mentis_sessions
  for each row execute function enforce_batch_grouping_lineage();

-- Preserve the season assignment when a legacy WeeklyPattern is upgraded into
-- a blueprint / recurrence rule / program run.
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
    raise exception '0027_batch_groupings.sql: weekly schedule % not found', p_schedule_id;
  end if;

  if w.template_id is not null then
    select id into v_tpl from mentis_session_templates where id = w.template_id;
    if v_tpl is not null then return v_tpl; end if;
  end if;

  if w.venue_id is null then
    select id into w.venue_id from mentis_venues
     where organization_id = w.organization_id order by name limit 1;
  end if;
  if w.venue_id is null then
    raise exception '0027_batch_groupings.sql: weekly schedule % has no venue', p_schedule_id;
  end if;

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

  insert into mentis_session_template_staffing (template_id, capacity, staff_id, rate_card_id)
  select v_tpl, ss.capacity, ss.staff_id, ss.rate_card_id
    from mentis_schedule_staff ss where ss.schedule_id = w.id
  on conflict (template_id, capacity, staff_id) do nothing;

  insert into mentis_recurrence_rules (
    organization_id, template_id, batch_grouping_id, label, frequency, by_weekday,
    start_time, end_time, valid_from, valid_to
  ) values (
    w.organization_id, v_tpl, w.batch_grouping_id, w.name, 'weekly',
    array[(case when w.day_of_week = 0 then 7 else w.day_of_week end)::smallint],
    w.start_time, w.end_time, w.valid_from, w.valid_to
  ) returning id into v_rule;

  insert into mentis_session_series (
    organization_id, template_id, recurrence_rule_id, batch_grouping_id,
    label, venue_id, starts_on, ends_on, status
  ) values (
    w.organization_id, v_tpl, v_rule, w.batch_grouping_id,
    w.name, w.venue_id, w.valid_from, w.valid_to, 'active'
  ) returning id into v_ser;

  update mentis_weekly_schedules
     set template_id = v_tpl, recurrence_rule_id = v_rule
   where id = w.id;

  update mentis_sessions s
     set template_id = v_tpl,
         series_id = v_ser,
         batch_grouping_id = w.batch_grouping_id,
         occurrence_date = s.start_at::date,
         blueprint = blueprint_snapshot(v_tpl),
         generated_at = coalesce(s.generated_at, now())
   where s.schedule_id = w.id and s.template_id is null;

  return v_tpl;
end $$;

comment on function template_from_weekly_schedule(uuid) is
  'Import a weekly pattern as a blueprint + grouped recurrence rule + program run (idempotent).';

-- Public app entry points require the selected grouping. A transaction-local
-- setting lets the existing generator and its insert triggers tag every row
-- without duplicating its well-tested recurrence implementation.
create or replace function instantiate_grouped_session_series(
  p_template_id uuid,
  p_rule jsonb default '{}'::jsonb,
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_template mentis_session_templates%rowtype;
  v_group mentis_batch_groupings%rowtype;
  v_group_id uuid;
  v_rule_start date;
  v_rule_end date;
  v_result jsonb;
  v_series_id uuid;
  v_previous_context text;
begin
  select * into v_template from mentis_session_templates where id = p_template_id;
  if not found then raise exception 'Program blueprint % not found', p_template_id; end if;

  v_group_id := coalesce(
    nullif(p_options->>'batch_grouping_id', '')::uuid,
    nullif(p_rule->>'batch_grouping_id', '')::uuid
  );
  if v_group_id is null then
    raise exception 'Select a Batch / Season Grouping before generating program runs';
  end if;

  select * into v_group from mentis_batch_groupings
   where id = v_group_id and organization_id = v_template.organization_id;
  if not found then raise exception 'The selected batch grouping is unavailable for this organisation'; end if;
  if v_group.status = 'archived' then
    raise exception 'An archived batch grouping cannot receive a new program run';
  end if;

  v_rule_start := coalesce(nullif(p_rule->>'valid_from', '')::date, current_date);
  v_rule_end := nullif(p_rule->>'valid_to', '')::date;
  if v_rule_end is null then
    v_rule_end := v_rule_start + greatest(coalesce(nullif(p_rule->>'horizon_days', '')::integer, 90), 1) - 1;
  end if;
  if v_rule_start < v_group.start_date or v_rule_end > v_group.end_date then
    raise exception 'The selected grouping (% to %) must contain the full generated run window (% to %)',
      v_group.start_date, v_group.end_date, v_rule_start, v_rule_end;
  end if;

  v_previous_context := current_setting('mentis.batch_grouping_id', true);
  perform set_config('mentis.batch_grouping_id', v_group_id::text, true);
  v_result := instantiate_session_series(
    p_template_id,
    coalesce(p_rule, '{}'::jsonb),
    coalesce(p_options, '{}'::jsonb) || jsonb_build_object('batch_grouping_id', v_group_id)
  );
  v_series_id := nullif(v_result->>'series_id', '')::uuid;
  if v_series_id is null then raise exception 'The generated program run did not return an ID'; end if;

  update mentis_session_series set batch_grouping_id = v_group_id where id = v_series_id;
  update mentis_recurrence_rules set batch_grouping_id = v_group_id
   where id = (select recurrence_rule_id from mentis_session_series where id = v_series_id);
  update mentis_sessions set batch_grouping_id = v_group_id where series_id = v_series_id;
  perform set_config('mentis.batch_grouping_id', coalesce(v_previous_context, ''), true);
  return v_result;
end $$;

create or replace function instantiate_grouped_session(
  p_template_id uuid,
  p_start_at timestamptz default null,
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_template mentis_session_templates%rowtype;
  v_group mentis_batch_groupings%rowtype;
  v_group_id uuid;
  v_result jsonb;
  v_session_id uuid;
  v_previous_context text;
begin
  select * into v_template from mentis_session_templates where id = p_template_id;
  if not found then raise exception 'Program blueprint % not found', p_template_id; end if;
  v_group_id := nullif(p_options->>'batch_grouping_id', '')::uuid;
  if v_group_id is null then raise exception 'Select a Batch / Season Grouping before creating a session'; end if;
  select * into v_group from mentis_batch_groupings
   where id = v_group_id and organization_id = v_template.organization_id;
  if not found then raise exception 'The selected batch grouping is unavailable for this organisation'; end if;
  if v_group.status = 'archived' then raise exception 'An archived batch grouping cannot receive a new session'; end if;

  v_previous_context := current_setting('mentis.batch_grouping_id', true);
  perform set_config('mentis.batch_grouping_id', v_group_id::text, true);
  v_result := instantiate_session(
    p_template_id,
    p_start_at,
    coalesce(p_options, '{}'::jsonb) || jsonb_build_object('batch_grouping_id', v_group_id)
  );
  v_session_id := nullif(v_result->>'session_id', '')::uuid;
  if v_session_id is not null then
    update mentis_sessions set batch_grouping_id = v_group_id where id = v_session_id;
  end if;
  perform set_config('mentis.batch_grouping_id', coalesce(v_previous_context, ''), true);
  return v_result;
end $$;

-- The overview powers blueprint detail and pipeline grouping. Keep the existing
-- columns in their original order and append the cohort metadata for PostgREST.
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
      where i.series_id = s.id and i.status <> 'cancelled' and i.start_at >= now())               as next_occurrence_at,
    s.batch_grouping_id,
    bg.name                               as batch_grouping_name,
    bg.code                               as batch_grouping_code,
    bg.status                             as batch_grouping_status
  from mentis_session_series s
  join mentis_session_templates t on t.id = s.template_id
  left join mentis_venues v on v.id = s.venue_id
  join mentis_recurrence_rules r on r.id = s.recurrence_rule_id
  join mentis_batch_groupings bg on bg.id = s.batch_grouping_id;

comment on view session_series_overview is
  'Program runs with their recurrence, cohort/season lineage, instance/drift counts and next occurrence.';

alter table mentis_batch_groupings enable row level security;
drop policy if exists batch_groupings_select on mentis_batch_groupings;
create policy batch_groupings_select on mentis_batch_groupings
  for select using (is_staff(organization_id));
drop policy if exists batch_groupings_write on mentis_batch_groupings;
create policy batch_groupings_write on mentis_batch_groupings
  for all using (is_admin(organization_id)) with check (is_admin(organization_id));

grant select, insert, update, delete on mentis_batch_groupings to authenticated;
grant execute on function mentis_default_batch_grouping_id(uuid),
  create_organization_default_batch_grouping(),
  enforce_batch_grouping_lineage(),
  instantiate_grouped_session_series(uuid, jsonb, jsonb),
  instantiate_grouped_session(uuid, timestamptz, jsonb)
to authenticated, service_role;
grant select on session_series_overview to authenticated;
