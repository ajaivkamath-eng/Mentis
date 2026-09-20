-- ============================================================================
-- Session blueprint suite — the generator, drift, the series lifecycle, the
-- legacy weekly-schedule bridge and the boundary between coach and admin.
-- Run by tests/db.test.ts against a fully migrated PGlite Postgres, and by hand
-- against a local/staging database:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/session_templates.sql
--
-- Everything happens inside one transaction that is rolled back at the end,
-- so the suite leaves no trace and can be re-run at any time. Dates that drive
-- generation are derived from current_date so the suite does not rot, while the
-- rule-level assertions use fixed dates so the DST / month-clamp maths stays
-- pinned.
-- ============================================================================
begin;

create or replace function mentis_tmpl_set_uid(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function mentis_tmpl_clear_uid() returns void language plpgsql as $$
begin
  -- Never reset the claims to '' — auth.uid() casts the GUC to json.
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('role', 'service_role', true);
end $$;

create or replace function mentis_tmpl_ok(p_label text, p_condition boolean) returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'BLUEPRINT FAIL: %', p_label;
  end if;
  raise notice 'blueprint ok: %', p_label;
end $$;

-- Passes only if the statement is refused (used for permission boundaries).
create or replace function mentis_tmpl_must_fail(p_label text, p_statement text) returns void language plpgsql as $$
begin
  execute p_statement;
  raise exception 'BLUEPRINT FAIL (allowed): %', p_label;
exception when others then
  if sqlerrm like 'BLUEPRINT FAIL (allowed)%' then raise; end if;
  raise notice 'blueprint ok (refused): % — %', p_label, sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 0. fixtures
-- ---------------------------------------------------------------------------
select mentis_tmpl_clear_uid();

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'bp-admin@mentis.test'),
  ('a1000000-0000-0000-0000-000000000002', 'bp-coach@mentis.test')
on conflict (id) do nothing;

insert into mentis_staff (organization_id, user_id, display_name, roles) values
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'BP Admin', '{SUPER_ADMIN,ADMIN}'::mentis_role[]),
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'BP Coach', '{COACH}'::mentis_role[])
on conflict (organization_id, user_id) do update set roles = excluded.roles, display_name = excluded.display_name;

insert into mentis_customers (id, organization_id, name) values
  ('c1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'BP Parent')
on conflict (id) do nothing;

insert into mentis_members (id, organization_id, customer_id, name, date_of_birth) values
  ('d1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'BP Mia', '2013-04-02'),
  ('d1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'BP Ravi', '2013-06-11')
on conflict (id) do nothing;

insert into mentis_rate_cards (id, organization_id, staff_id, label, rate_cents, valid_from) values
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   (select id from mentis_staff where display_name = 'BP Coach'), 'BP standard', 2400, '2025-01-01')
on conflict (id) do nothing;

create temp table if not exists tpl_results (key text primary key, value jsonb);

create or replace function mentis_tmpl_uuid(p_key text) returns uuid language sql stable as $$
  select (value #>> '{}')::uuid from tpl_results where key = p_key
$$;

grant select, insert, update on tpl_results to authenticated;
grant execute on function mentis_tmpl_uuid(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. the generator's date maths, pinned to fixed dates
-- ---------------------------------------------------------------------------
select mentis_tmpl_ok('monthly clamps 31 Jan -> 28 Feb -> 31 Mar -> 30 Apr',
  expand_recurrence('{"frequency":"monthly","interval_count":1,"valid_from":"2026-01-31","horizon_days":120}'::jsonb)
    = array[date '2026-01-31', date '2026-02-28', date '2026-03-31', date '2026-04-30']);

select mentis_tmpl_ok('fortnightly steps every other week, anchored on Monday',
  expand_recurrence('{"frequency":"fortnightly","valid_from":"2026-02-04","valid_to":"2026-03-04"}'::jsonb)
    = array[date '2026-02-04', date '2026-02-18', date '2026-03-04']);

select mentis_tmpl_ok('biweekly is accepted as an alias of fortnightly',
  expand_recurrence('{"frequency":"biweekly","valid_from":"2026-02-04","valid_to":"2026-03-04"}'::jsonb)
  = expand_recurrence('{"frequency":"fortnightly","valid_from":"2026-02-04","valid_to":"2026-03-04"}'::jsonb));

select mentis_tmpl_ok('a weekly rule can carry several weekdays',
  expand_recurrence('{"frequency":"weekly","by_weekday":[3,1],"valid_from":"2026-02-02","valid_to":"2026-02-15"}'::jsonb)
    = array[date '2026-02-02', date '2026-02-04', date '2026-02-09', date '2026-02-11']);

select mentis_tmpl_ok('quarterly steps three months at a time',
  expand_recurrence('{"frequency":"quarterly","valid_from":"2026-01-15","horizon_days":270}'::jsonb)
    = array[date '2026-01-15', date '2026-04-15', date '2026-07-15']);

-- The seeded UK calendar (February half-term 16–20 Feb, Easter holidays 30 Mar –
-- 10 Apr) drives the classification, and Europe/London drives the offset.
select mentis_tmpl_ok('a spring term of Mondays skips 3 dates',
  (select count(*) = 13 and count(*) filter (where action = 'skip') = 3
     from session_template_occurrences(
       '{"organization_id":"00000000-0000-0000-0000-000000000001","frequency":"weekly","by_weekday":[1],
         "start_time":"18:00","end_time":"19:30","timezone":"Europe/London",
         "valid_from":"2026-02-02","valid_to":"2026-05-02","horizon_days":90,
         "skip_term_holidays":true,"skip_bank_holidays":true,"skip_manual_closures":true}'::jsonb)));

select mentis_tmpl_ok('the skipped Monday names the holiday that caused it',
  (select holiday_name = 'February half-term'
     from session_template_occurrences(
       '{"organization_id":"00000000-0000-0000-0000-000000000001","frequency":"weekly","by_weekday":[1],
         "start_time":"18:00","end_time":"19:30","timezone":"Europe/London",
         "valid_from":"2026-02-16","valid_to":"2026-02-16","horizon_days":1}'::jsonb)));

select mentis_tmpl_ok('18:00 London is 18:00Z in winter and 17:00Z in summer',
  (select (select starts_at from session_template_occurrences(
              '{"organization_id":"00000000-0000-0000-0000-000000000001","frequency":"weekly","by_weekday":[1],
                "start_time":"18:00","end_time":"19:30","timezone":"Europe/London",
                "valid_from":"2026-02-02","valid_to":"2026-02-02","horizon_days":1}'::jsonb)) = '2026-02-02T18:00:00Z'::timestamptz
       and (select starts_at from session_template_occurrences(
              '{"organization_id":"00000000-0000-0000-0000-000000000001","frequency":"weekly","by_weekday":[1],
                "start_time":"18:00","end_time":"19:30","timezone":"Europe/London",
                "valid_from":"2026-05-11","valid_to":"2026-05-11","horizon_days":1}'::jsonb)) = '2026-05-11T17:00:00Z'::timestamptz));

-- ---------------------------------------------------------------------------
-- 2. author the blueprint
-- ---------------------------------------------------------------------------
do $$
declare
  v_org   uuid := '00000000-0000-0000-0000-000000000001';
  v_venue uuid := (select id from mentis_venues where organization_id = v_org and name = 'Kingfisher Hall A');
  v_hallb uuid := (select id from mentis_venues where organization_id = v_org and name = 'Kingfisher Hall B');
  v_coach uuid := (select id from mentis_staff where display_name = 'BP Coach');
  v_tpl   uuid;
  v_empty uuid;
  v_ver   integer;
begin
  perform mentis_tmpl_set_uid('a1000000-0000-0000-0000-000000000001');

  insert into mentis_session_templates (
    organization_id, code, name, description, venue_id, default_start_time, default_end_time,
    timezone, level_band, capacity, min_headcount, default_charge_cents, leading_coach_id, tags
  ) values (
    v_org, 'BP-U13', 'BP U13 Development', 'Blueprint fixture', v_venue, '18:00', '19:30',
    'Europe/London', 'U13', 16, 6, 1200, v_coach, '{squad,term-time}'
  ) returning id into v_tpl;

  -- the staffing plan: a named lead (with a lead-in) and an open sparrer slot
  insert into mentis_session_template_staffing (template_id, capacity, staff_id, rate_card_id, required, lead_minutes)
  values (v_tpl, 'lead', v_coach, 'e1000000-0000-0000-0000-000000000001', true, 15),
         (v_tpl, 'sparrer', null, null, false, 0);

  insert into mentis_session_template_members (template_id, member_id)
  values (v_tpl, 'd1000000-0000-0000-0000-000000000001'),
         (v_tpl, 'd1000000-0000-0000-0000-000000000002');

  -- a draft with no lead slot, to prove completeness reports it
  insert into mentis_session_templates (
    organization_id, name, venue_id, default_start_time, default_end_time, status
  ) values (v_org, 'BP Incomplete', v_hallb, '18:00', '19:30', 'draft')
  returning id into v_empty;

  insert into tpl_results values
    ('template', to_jsonb(v_tpl)),
    ('incomplete', to_jsonb(v_empty)),
    ('org', to_jsonb(v_org)),
    ('venue', to_jsonb(v_venue)),
    ('hallb', to_jsonb(v_hallb)),
    ('coach', to_jsonb(v_coach)),
    ('start', to_jsonb(date_trunc('week', current_date)::date + 14));
end $$;

select mentis_tmpl_ok('a complete blueprint reports no problems',
  (select count(*) = 0 from template_completeness(mentis_tmpl_uuid('template'))));

select mentis_tmpl_ok('a blueprint with no lead slot is reported incomplete',
  (select bool_or(problem = 'needs at least one lead slot') from template_completeness(mentis_tmpl_uuid('incomplete'))));

select mentis_tmpl_ok('an unknown blueprint is reported incomplete rather than raising',
  (select count(*) >= 2 from template_completeness('00000000-0000-0000-0000-0000000000ff')));

-- ---------------------------------------------------------------------------
-- 3. a material edit bumps the blueprint version, an incidental one does not
-- ---------------------------------------------------------------------------
do $$
declare v_ver integer;
begin
  perform mentis_tmpl_set_uid('a1000000-0000-0000-0000-000000000001');

  update mentis_session_templates set capacity = 18 where id = mentis_tmpl_uuid('template');
  select version into v_ver from mentis_session_templates where id = mentis_tmpl_uuid('template');
  insert into tpl_results values ('version_after_capacity', to_jsonb(v_ver));

  update mentis_session_templates set tags = '{squad,term-time,new}' where id = mentis_tmpl_uuid('template');
  select version into v_ver from mentis_session_templates where id = mentis_tmpl_uuid('template');
  insert into tpl_results values ('version_after_tags', to_jsonb(v_ver));
end $$;

select mentis_tmpl_ok('changing the capacity bumps the blueprint version',
  (select value #>> '{}' from tpl_results where key = 'version_after_capacity') = '2');
select mentis_tmpl_ok('changing tags does not bump the blueprint version',
  (select value #>> '{}' from tpl_results where key = 'version_after_tags') = '2');

-- ---------------------------------------------------------------------------
-- 4. control the holiday window for the generation tests below
--    (rolled back with everything else; dates are relative to today so the
--    suite keeps working in any year)
-- ---------------------------------------------------------------------------
delete from mentis_holiday_calendar where organization_id = '00000000-0000-0000-0000-000000000001';
insert into mentis_holiday_calendar (organization_id, name, kind, starts_on, ends_on) values
  ('00000000-0000-0000-0000-000000000001', 'BP Half Term', 'term_break',
   (select (value #>> '{}')::date + 21 from tpl_results where key = 'start'),
   (select (value #>> '{}')::date + 25 from tpl_results where key = 'start')),
  ('00000000-0000-0000-0000-000000000001', 'BP Bank Holiday', 'bank_holiday',
   (select (value #>> '{}')::date + 35 from tpl_results where key = 'start'),
   (select (value #>> '{}')::date + 35 from tpl_results where key = 'start'));
select mentis_tmpl_ok('the fixture holiday window is in place',
  (select count(*) = 2 from mentis_holiday_calendar where organization_id = '00000000-0000-0000-0000-000000000001'));

-- ---------------------------------------------------------------------------
-- 5. publish a short series from the blueprint — instances are created by the
--    generator, with staffing plan, lead-in and default roster applied
-- ---------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  perform mentis_tmpl_set_uid('a1000000-0000-0000-0000-000000000001');

  v_result := instantiate_session_series(
    mentis_tmpl_uuid('template'),
    jsonb_build_object(
      'frequency', 'weekly',
      'by_weekday', jsonb_build_array(1),
      'start_time', '18:00',
      'end_time', '19:30',
      'timezone', 'Europe/London',
      'valid_from', (select value #>> '{}' from tpl_results where key = 'start'),
      'valid_to', (select (value #>> '{}')::date + 14 from tpl_results where key = 'start'),
      'horizon_days', 120,
      'skip_term_holidays', true,
      'skip_bank_holidays', true
    ),
    jsonb_build_object('label', 'BP Autumn Mondays', 'created_by', 'a1000000-0000-0000-0000-000000000001')
  );
  insert into tpl_results values ('seed', v_result), ('series', to_jsonb(v_result->>'series_id'));
end $$;

select mentis_tmpl_ok('the first three Mondays are materialised',
  (select (value->>'generated')::int = 3 and (value->>'requested')::int = 3
     from tpl_results where key = 'seed'));
select mentis_tmpl_ok('the series exists and is active',
  (select value->>'series_id' is not null from tpl_results where key = 'seed')
  and exists (select 1 from mentis_session_series where id = mentis_tmpl_uuid('series') and status = 'active'));
select mentis_tmpl_ok('every instance points at both the blueprint and the series',
  (select count(*) = 3 from mentis_sessions
    where series_id = mentis_tmpl_uuid('series')
      and template_id = mentis_tmpl_uuid('template')
      and occurrence_date is not null
      and blueprint->>'version' = '2'
      and is_exception = false
      and overridden_fields = '{}'));
select mentis_tmpl_ok('instances land on the blueprint slot in local time',
  (select bool_and((start_at at time zone 'Europe/London')::time = '18:00'
                   and (end_at at time zone 'Europe/London')::time = '19:30')
     from mentis_sessions where series_id = mentis_tmpl_uuid('series')));
select mentis_tmpl_ok('the staffing plan becomes real staffing, with the lead-in',
  (select count(*) = 3
     from mentis_session_staffing ss
     join mentis_sessions s on s.id = ss.session_id
    where s.series_id = mentis_tmpl_uuid('series')
      and ss.capacity = 'lead'
      and ss.staff_id = mentis_tmpl_uuid('coach')
      and ss.rate_card_id = 'e1000000-0000-0000-0000-000000000001'
      and ss.planned_start = s.start_at - interval '15 minutes'));
select mentis_tmpl_ok('the default roster is enrolled on every instance',
  (select count(*) = 6 from mentis_enrollments e
     join mentis_sessions s on s.id = e.session_id
    where s.series_id = mentis_tmpl_uuid('series')));
select mentis_tmpl_ok('the series view reports the run and its pattern',
  (select instance_count = 3 and exception_count = 0 and frequency = 'weekly' and by_weekday = array[1]::smallint[]
     from session_series_overview where id = mentis_tmpl_uuid('series')));
select mentis_tmpl_ok('the blueprint view counts the active series and upcoming instances',
  (select active_series = 1 and upcoming_instances = 3 and drifted_instances = 0
     from session_template_overview where id = mentis_tmpl_uuid('template')));

-- ---------------------------------------------------------------------------
-- 6. re-publishing the same window is idempotent
-- ---------------------------------------------------------------------------
do $$
declare v_again jsonb;
begin
  perform mentis_tmpl_set_uid('a1000000-0000-0000-0000-000000000001');
  v_again := extend_session_series(mentis_tmpl_uuid('series'), '{}'::jsonb);
  insert into tpl_results values ('again', v_again);
end $$;

select mentis_tmpl_ok('extending an already-materialised series creates nothing',
  (select (value->>'generated')::int = 0 and (value->>'existing')::int = 3 from tpl_results where key = 'again'));
select mentis_tmpl_ok('the instance count is unchanged',
  (select count(*) = 3 from mentis_sessions where series_id = mentis_tmpl_uuid('series')));

-- ---------------------------------------------------------------------------
-- 7. one-off session from the blueprint — an instance with no series
-- ---------------------------------------------------------------------------
do $$
declare
  v_result jsonb;
  v_again  jsonb;
begin
  perform mentis_tmpl_set_uid('a1000000-0000-0000-0000-000000000001');

  v_result := instantiate_session(
    mentis_tmpl_uuid('template'),
    ((select (value #>> '{}')::date + 5 from tpl_results where key = 'start')::timestamp + interval '12 hours') at time zone 'UTC'
  );
  v_again := instantiate_session(
    mentis_tmpl_uuid('template'),
    ((select (value #>> '{}')::date + 5 from tpl_results where key = 'start')::timestamp + interval '12 hours') at time zone 'UTC'
  );
  insert into tpl_results values ('oneoff', v_result), ('oneoff_again', v_again);
end $$;

select mentis_tmpl_ok('a one-off is a single instance of the blueprint',
  (select (value->>'series_id') is null from tpl_results where key = 'oneoff')
  and (select count(*) = 1 from mentis_sessions
        where id = (select (value->>'session_id')::uuid from tpl_results where key = 'oneoff')
          and template_id = mentis_tmpl_uuid('template')
          and series_id is null
          and occurrence_date = (select (value #>> '{}')::date + 5 from tpl_results where key = 'start')));
select mentis_tmpl_ok('the one-off picks up the blueprint slot and its staffing',
  (select (s.start_at at time zone 'Europe/London')::time = '18:00'
       and exists (select 1 from mentis_session_staffing ss where ss.session_id = s.id)
     from mentis_sessions s where s.id = (select (value->>'session_id')::uuid from tpl_results where key = 'oneoff')));
select mentis_tmpl_ok('asking twice returns the same instance',
  (select (value->>'existing')::boolean from tpl_results where key = 'oneoff_again')
  and (select (value->>'session_id') from tpl_results where key = 'oneoff')
      = (select (value->>'session_id') from tpl_results where key = 'oneoff'));

-- ---------------------------------------------------------------------------
-- 8. extending a series fills the rest of the window, skips breaks, and
--    reports a date that a booked venue slot blocks instead of failing
-- ---------------------------------------------------------------------------
do $$
declare
  v_manual uuid;
  v_result jsonb;
begin
  perform mentis_tmpl_set_uid('a1000000-0000-0000-0000-000000000001');

  -- book the venue at the blueprint slot on the fifth Monday, so the generator
  -- has to work around it
  insert into mentis_sessions (organization_id, venue_id, name, start_at, end_at)
  values (
    '00000000-0000-0000-0000-000000000001',
    mentis_tmpl_uuid('venue'),
    'BP Private Booking',
    (((select (value #>> '{}')::date + 28 from tpl_results where key = 'start')::timestamp + interval '18 hours') at time zone 'Europe/London'),
    (((select (value #>> '{}')::date + 28 from tpl_results where key = 'start')::timestamp + interval '19 hours 30 minutes') at time zone 'Europe/London')
  ) returning id into v_manual;

  v_result := extend_session_series(
    mentis_tmpl_uuid('series'),
    jsonb_build_object(
      'rule', jsonb_build_object('valid_to', (select (value #>> '{}')::date + 70 from tpl_results where key = 'start')),
      'horizon_days', 365
    )
  );
  insert into tpl_results values ('extended', v_result);
end $$;

select mentis_tmpl_ok('the rest of the run is materialised around the breaks',
  (select (value->>'generated')::int = 5
      and (value->>'skipped_term_holidays')::int = 1
      and (value->>'skipped_bank_holidays')::int = 1
      and jsonb_array_length(value->'conflicts') = 1
     from tpl_results where key = 'extended'));
select mentis_tmpl_ok('the holiday Mondays have no instances',
  (select count(*) = 0 from mentis_sessions
    where series_id = mentis_tmpl_uuid('series')
      and occurrence_date in (
        (select (value #>> '{}')::date + 21 from tpl_results where key = 'start'),
        (select (value #>> '{}')::date + 35 from tpl_results where key = 'start'))));
select mentis_tmpl_ok('the blocked Monday is reported, not silently dropped',
  (select (value->'conflicts'->0->>'message') like '%concurrency%' from tpl_results where key = 'extended'));
select mentis_tmpl_ok('the series now holds every instance it could create',
  (select count(*) = 8 from mentis_sessions where series_id = mentis_tmpl_uuid('series')));
select mentis_tmpl_ok('no instance is duplicated per occurrence',
  (select count(*) = count(distinct occurrence_date) from mentis_sessions where series_id = mentis_tmpl_uuid('series')));

-- ---------------------------------------------------------------------------
-- 9. drift: an edited instance records what it overrode; re-applying the
--    blueprint restores it and clears the flag
-- ---------------------------------------------------------------------------
do $$
declare
  v_session uuid;
  v_result  jsonb;
begin
  perform mentis_tmpl_set_uid('a1000000-0000-0000-0000-000000000001');

  select id into v_session from mentis_sessions
   where series_id = mentis_tmpl_uuid('series') order by start_at limit 1;

  update mentis_sessions
     set name = 'U13 Development (moved)',
         start_at = start_at - interval '30 minutes',
         end_at = end_at - interval '30 minutes'
   where id = v_session;

  insert into tpl_results values ('drifted_session', to_jsonb(v_session));
end $$;

select mentis_tmpl_ok('the edited instance is flagged with the fields that drifted',
  (select overridden_fields @> array['name', 'start_at', 'end_at']
      and is_exception
     from mentis_sessions where id = mentis_tmpl_uuid('drifted_session')));
select mentis_tmpl_ok('the blueprint view counts the drifted instance',
  (select drifted_instances = 1 from session_template_overview where id = mentis_tmpl_uuid('template')));
select mentis_tmpl_ok('the series view counts it too',
  (select exception_count = 1 from session_series_overview where id = mentis_tmpl_uuid('series')));

do $$
declare v_result jsonb;
begin
  perform mentis_tmpl_set_uid('a1000000-0000-0000-0000-000000000001');
  v_result := apply_blueprint_to_session(mentis_tmpl_uuid('drifted_session'));
  insert into tpl_results values ('reapplied', v_result);
end $$;

select mentis_tmpl_ok('re-applying restores the blueprint values',
  (select not is_exception and overridden_fields = '{}' and name = 'BP U13 Development'
     from mentis_sessions where id = mentis_tmpl_uuid('drifted_session')));
select mentis_tmpl_ok('the restored instance sits back on the blueprint slot',
  (select (start_at at time zone 'Europe/London')::time = '18:00' and (end_at at time zone 'Europe/London')::time = '19:30'
     from mentis_sessions where id = mentis_tmpl_uuid('drifted_session')));
select mentis_tmpl_ok('the call reports what it re-applied',
  (select (value->'applied') @> '["name","start_at","end_at"]'::jsonb and value->'remaining_overrides' = '[]'::jsonb
     from tpl_results where key = 'reapplied'));
select mentis_tmpl_ok('the blueprint no longer counts drift',
  (select drifted_instances = 0 from session_template_overview where id = mentis_tmpl_uuid('template')));

-- ---------------------------------------------------------------------------
-- 10. the series lifecycle: pause, resume, end and cancel the future
-- ---------------------------------------------------------------------------
do $$
declare v_result jsonb;
begin
  perform mentis_tmpl_set_uid('a1000000-0000-0000-0000-000000000001');
  v_result := set_session_series_status(mentis_tmpl_uuid('series'), 'paused');
  insert into tpl_results values ('paused', v_result);
end $$;

select mentis_tmpl_ok('a paused series stops being "active" without losing its instances',
  (select value->>'status' = 'paused' from tpl_results where key = 'paused')
  and (select status = 'paused' from mentis_session_series where id = mentis_tmpl_uuid('series'))
  and (select count(*) > 0 from mentis_sessions where series_id = mentis_tmpl_uuid('series')));

do $$
declare v_result jsonb;
begin
  perform mentis_tmpl_set_uid('a1000000-0000-0000-0000-000000000001');
  v_result := set_session_series_status(mentis_tmpl_uuid('series'), 'active');
  insert into tpl_results values ('resumed', v_result);
end $$;

select mentis_tmpl_ok('resuming puts the series back in service',
  (select value->>'status' = 'active' from tpl_results where key = 'resumed')
  and (select status = 'active' from mentis_session_series where id = mentis_tmpl_uuid('series')));

do $$
declare
  v_result jsonb;
  v_before integer;
begin
  perform mentis_tmpl_set_uid('a1000000-0000-0000-0000-000000000001');
  select count(*) into v_before from mentis_sessions
   where series_id = mentis_tmpl_uuid('series') and start_at > now() and status <> 'cancelled';

  v_result := set_session_series_status(mentis_tmpl_uuid('series'), 'ended', true, 'term finished');
  insert into tpl_results values ('ended', v_result), ('cancellable', to_jsonb(v_before));
end $$;

select mentis_tmpl_ok('ending a series cancels every future instance of the run',
  (select status = 'ended' from mentis_session_series where id = mentis_tmpl_uuid('series'))
  and (select (value->>'cancelled_instances')::int = (select (value #>> '{}')::int from tpl_results where key = 'cancellable')
         from tpl_results where key = 'ended')
  and (select count(*) = 0 from mentis_sessions
        where series_id = mentis_tmpl_uuid('series') and start_at > now() and status <> 'cancelled'));
select mentis_tmpl_ok('cancelled instances are kept, with the reason recorded',
  (select count(*) > 0 and bool_and(cancel_reason = 'term finished')
     from mentis_sessions where series_id = mentis_tmpl_uuid('series') and status = 'cancelled'));
select mentis_tmpl_ok('the ended series still reports its whole run',
  (select instance_count > 0 and cancelled_instances > 0
     from session_series_overview where id = mentis_tmpl_uuid('series')));

do $do$
begin
  perform mentis_tmpl_set_uid('a1000000-0000-0000-0000-000000000001');
  perform mentis_tmpl_must_fail('extending an ended series is refused',
    format('select extend_session_series(%L::uuid)', mentis_tmpl_uuid('series')));
end $do$;

-- ---------------------------------------------------------------------------
-- 11. the legacy bridge: a weekly schedule becomes a blueprint, and sessions
--     written the old way are linked to it
-- ---------------------------------------------------------------------------
do $$
declare
  v_schedule uuid;
  v_tpl      uuid;
  v_tpl2     uuid;
  v_session  uuid;
  v_series   uuid;
begin
  perform mentis_tmpl_clear_uid();

  insert into mentis_weekly_schedules (
    organization_id, venue_id, name, day_of_week, valid_from, valid_to, start_time, end_time
  ) values (
    '00000000-0000-0000-0000-000000000001', mentis_tmpl_uuid('hallb'), 'BP Legacy Wednesday',
    3,
    (select (value #>> '{}')::date + 28 from tpl_results where key = 'start'),
    (select (value #>> '{}')::date + 84 from tpl_results where key = 'start'),
    '19:00', '20:30'
  ) returning id into v_schedule;

  insert into mentis_schedule_staff (schedule_id, staff_id, capacity, rate_card_id)
  values (v_schedule, mentis_tmpl_uuid('coach'), 'lead', 'e1000000-0000-0000-0000-000000000001');

  v_tpl  := template_from_weekly_schedule(v_schedule);
  v_tpl2 := template_from_weekly_schedule(v_schedule);

  select s.id into v_series
    from mentis_session_series s
    join mentis_weekly_schedules w on w.recurrence_rule_id = s.recurrence_rule_id
   where w.id = v_schedule;

  -- written the old way: no template, only the weekly schedule it came from
  insert into mentis_sessions (organization_id, venue_id, name, start_at, end_at, schedule_id)
  values (
    '00000000-0000-0000-0000-000000000001', mentis_tmpl_uuid('hallb'), 'BP Legacy Instance',
    ((select (value #>> '{}')::date + 28 from tpl_results where key = 'start')::timestamp + interval '19 hours') at time zone 'Europe/London',
    ((select (value #>> '{}')::date + 28 from tpl_results where key = 'start')::timestamp + interval '20 hours 30 minutes') at time zone 'Europe/London',
    v_schedule
  ) returning id into v_session;

  insert into tpl_results values
    ('legacy_template', to_jsonb(v_tpl)),
    ('legacy_template_again', to_jsonb(v_tpl2)),
    ('legacy_schedule', to_jsonb(v_schedule)),
    ('legacy_session', to_jsonb(v_session)),
    ('legacy_series', to_jsonb(v_series));
end $$;

select mentis_tmpl_ok('a weekly schedule is imported once, then reused',
  (select (value #>> '{}')::uuid from tpl_results where key = 'legacy_template')
   = (select (value #>> '{}')::uuid from tpl_results where key = 'legacy_template_again')
  and (select template_id from mentis_weekly_schedules where id = mentis_tmpl_uuid('legacy_schedule')) = mentis_tmpl_uuid('legacy_template'));
select mentis_tmpl_ok('the imported blueprint carries the schedule slot and staffing',
  (select default_start_time = '19:00' and default_end_time = '20:30' from mentis_session_templates where id = mentis_tmpl_uuid('legacy_template'))
  and (select count(*) = 1 from mentis_session_template_staffing
        where template_id = mentis_tmpl_uuid('legacy_template') and capacity = 'lead'));
select mentis_tmpl_ok('the imported rule keeps the ISO weekday',
  (select by_weekday = array[3]::smallint[] from mentis_recurrence_rules
    where template_id = mentis_tmpl_uuid('legacy_template')));
select mentis_tmpl_ok('a session written the old way is linked to the blueprint and its series',
  (select template_id = mentis_tmpl_uuid('legacy_template')
      and series_id = mentis_tmpl_uuid('legacy_series')
      and occurrence_date = (select (value #>> '{}')::date + 28 from tpl_results where key = 'start')
      and blueprint is not null
     from mentis_sessions where id = mentis_tmpl_uuid('legacy_session')));

-- ---------------------------------------------------------------------------
-- 12. RLS: coaches read the blueprint library, only admins author it
-- ---------------------------------------------------------------------------
do $$
begin
  perform mentis_tmpl_set_uid('a1000000-0000-0000-0000-000000000002');
end $$;

select mentis_tmpl_ok('a coach can read blueprints and their staffing plan',
  (select count(*) >= 1 from session_template_overview)
  and (select count(*) >= 1 from mentis_session_template_staffing));
select mentis_tmpl_ok('a coach can read the series list',
  (select count(*) >= 1 from session_series_overview));

do $do$
begin
  perform mentis_tmpl_set_uid('a1000000-0000-0000-0000-000000000002');
  perform mentis_tmpl_must_fail('a coach cannot author a blueprint',
    $$ insert into mentis_session_templates (organization_id, name, venue_id, default_start_time, default_end_time)
       values ('00000000-0000-0000-0000-000000000001', 'BP Coach Blueprint',
               (select id from mentis_venues where name = 'Kingfisher Hall B'), '09:00', '10:00') $$);
  perform mentis_tmpl_must_fail('a coach cannot publish a series',
    format('select instantiate_session_series(%L::uuid, %L::jsonb)',
      mentis_tmpl_uuid('template'), '{"frequency":"weekly","by_weekday":[1],"start_time":"18:00","end_time":"19:30","valid_from":"2027-01-04","horizon_days":30}'));
  perform mentis_tmpl_must_fail('a coach cannot re-apply a blueprint',
    format('select apply_blueprint_to_session(%L::uuid)', mentis_tmpl_uuid('drifted_session')));
  perform mentis_tmpl_must_fail('a coach cannot end a series',
    format('select set_session_series_status(%L::uuid, %L)', mentis_tmpl_uuid('series'), 'paused'));
end $do$;

select mentis_tmpl_clear_uid();
rollback;
