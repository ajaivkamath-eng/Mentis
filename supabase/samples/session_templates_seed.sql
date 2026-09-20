-- Sample blueprints for a local/seed database.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/samples/session_templates_seed.sql
--
-- Creates two blueprints (with staffing plans and default rosters) and
-- publishes a term-time weekly series from each. Safe to re-run: blueprints are
-- matched on (organisation, name, venue) and publishing is idempotent per
-- (series, occurrence date).
BEGIN;

-- Two sample blueprints, built from the seeded Kingfisher org.
insert into mentis_session_templates (
  organization_id, code, name, description, venue_id,
  default_start_time, default_end_time, timezone,
  level_band, capacity, min_headcount, default_charge_cents,
  leading_coach_id, status, tags, created_at
)
select
  o.id, v.code, v.name, v.description, ven.id,
  v.start_time, v.end_time, 'Europe/London',
  v.level_band, v.capacity, 4, v.charge_cents,
  (select ms.id from mentis_staff ms where ms.organization_id = o.id
     and ms.roles && array['COACH','ADMIN','SUPER_ADMIN']::mentis_role[] order by ms.display_name limit 1),
  'active', v.tags, now()
from mentis_organizations o
join mentis_venues ven on ven.organization_id = o.id
cross join (values
  ('U13-MON', 'U13 Development', 'Monday-night development squad for under-13s.', '18:00'::time, '19:30'::time, 'U13', 16, 1200, array['squad','term-time']),
  ('ADULT-WED', 'Adult Beginners', 'Adult beginners course, term time.', '19:30'::time, '21:00'::time, 'Beginner', 12, 1500, array['adult','course'])
) as v(code, name, description, start_time, end_time, level_band, capacity, charge_cents, tags)
where o.name = 'Kingfisher Table Tennis Club'
  and not exists (
    select 1 from mentis_session_templates t
    where t.organization_id = o.id and t.name = v.name and t.venue_id = ven.id
  );

-- Staffing plan: a lead slot (15 minutes either side) and an open sparrer slot.
insert into mentis_session_template_staffing (template_id, capacity, staff_id, rate_card_id, required, lead_minutes, trail_minutes)
select t.id, s.capacity,
  case s.capacity when 'lead' then t.leading_coach_id else null end,
  (select rc.id from mentis_rate_cards rc
     where rc.staff_id = t.leading_coach_id order by rc.valid_from desc limit 1),
  s.required, s.lead_minutes, s.trail_minutes
from mentis_session_templates t
cross join (values ('lead', true, 15, 0), ('sparrer', false, 0, 0)) as s(capacity, required, lead_minutes, trail_minutes)
where t.leading_coach_id is not null
on conflict do nothing;

-- Default roster: the first six members of the organisation.
insert into mentis_session_template_members (template_id, member_id)
select t.id, m.id
from mentis_session_templates t
join lateral (
  select id from mentis_members mm
  where mm.organization_id = t.organization_id and mm.erased_at is null
  order by mm.name limit 6
) m on true
on conflict do nothing;

-- Publish a weekly term-time series per blueprint (90-day rolling horizon).
-- `instantiate_session_series` is admin-gated, so the seed borrows a real
-- admin's identity the same way PostgREST does (JWT claims).
do $$
declare t record; result jsonb; admin_uid uuid;
begin
  select ms.user_id into admin_uid
    from mentis_staff ms
    join mentis_organizations o on o.id = ms.organization_id
    where ms.roles && array['SUPER_ADMIN','ADMIN']::mentis_role[]
    order by ms.display_name limit 1;

  if admin_uid is null then
    raise notice 'no SUPER_ADMIN/ADMIN staff linked — blueprints seeded, series not published (link staff first, then re-run)';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_uid::text)::text, false);

  for t in
    select tp.id, tp.name, tp.status, tp.timezone,
           -- Monday for the U13 blueprint, Wednesday for the adult evening one
           case when tp.default_start_time >= '19:00' then 3 else 1 end as weekday
    from mentis_session_templates tp
    where tp.code in ('U13-MON', 'ADULT-WED') and tp.status <> 'archived'
  loop
    if exists (select 1 from mentis_session_series s where s.template_id = t.id and s.status <> 'ended') then
      continue;  -- already published
    end if;
    result := instantiate_session_series(t.id, jsonb_build_object(
      'label', t.name || ' — sample term',
      'frequency', 'weekly',
      'by_weekday', jsonb_build_array(t.weekday),
      'valid_from', current_date,
      'horizon_days', 90,
      'skip_term_holidays', true,
      'skip_bank_holidays', true,
      'skip_manual_closures', true
    ), '{}'::jsonb);
    raise notice '%: % instances generated (%s term-break dates skipped)',
      t.name, result->>'generated', result->>'skipped_term_holidays';
  end loop;

  perform set_config('request.jwt.claims', '{}', false);
end $$;

COMMIT;
