-- Demo seed for Mentis
-- Creates realistic data for one organization with 2 venues, 180 customers, and 200 members.


drop trigger if exists sessions_venue_guard on mentis_sessions;

create or replace function guard_venue_concurrency()
returns trigger
language plpgsql
as $$
declare
  limit_v integer;
  clash integer;
begin
  select concurrent_session_limit
    into limit_v
  from mentis_venues
  where id = new.venue_id;

  select count(*)
    into clash
  from mentis_sessions
  where venue_id = new.venue_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000')
    and status <> 'cancelled'
    and start_at < new.end_at
    and new.start_at < end_at;

  if clash >= coalesce(limit_v, 1) then
    raise exception 'venue concurrency limit (%) exceeded for this time slot', coalesce(limit_v, 1);
  end if;

  return new;
end;
$$;

create trigger sessions_venue_guard
before insert or update on mentis_sessions
for each row
execute function guard_venue_concurrency();


BEGIN;

-- 1) Organization
INSERT INTO public.mentis_organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Kingfisher TTC')
ON CONFLICT (id) DO NOTHING;

-- 2) 2 venues
INSERT INTO public.mentis_venues (id, organization_id, name, concurrent_session_limit, address, phone, working_hours)
VALUES
  ('22222222-2222-2222-2222-222222222201', '00000000-0000-0000-0000-000000000001', 'Woodley Club', 2, '12 Court Lane', '+44 20 7946 0958', 'Mon-Sat 09:00-20:00'),
  ('22222222-2222-2222-2222-222222222202', '00000000-0000-0000-0000-000000000001', 'Reading School', 3, '8 Sports Way', '+44 20 7946 1122', 'Mon-Fri 08:00-18:00')
ON CONFLICT (id) DO NOTHING;

-- 3) 180 customers
INSERT INTO public.mentis_customers (id, organization_id, name, phone, email, guardian_a, guardian_b, nok_name, nok_phone)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'Customer ' || gs,
  '+44' || lpad((gs * 1000000 + 1000000)::text, 10, '0'),
  'customer' || gs || '@example.com',
  'Guardian A ' || gs,
  'Guardian B ' || gs,
  'Parent ' || gs,
  '+44' || lpad(((gs * 2000000) + 5000000)::text, 10, '0')
FROM generate_series(1, 180) AS gs
ON CONFLICT DO NOTHING;

-- 4) 200 members across those 180 customers
INSERT INTO public.mentis_members (
  id,
  organization_id,
  customer_id,
  name,
  date_of_birth,
  nok_name,
  nok_phone,
  special_needs_flag,
  created_at
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  c.id,
  'Member ' || gs,
  CURRENT_DATE - make_interval(
    years => 8 + ((gs - 1) % 18),
    months => ((gs - 1) % 12),
    days => ((gs - 1) % 28)
  ),
  'Guardian ' || gs,
  '+44' || lpad(((gs * 2100000) + 7000000)::text, 10, '0'),
  (gs % 7 = 0),
  NOW()
FROM generate_series(1, 200) AS gs
JOIN LATERAL (
  SELECT id
  FROM public.mentis_customers c
  WHERE c.organization_id = '00000000-0000-0000-0000-000000000001'
  ORDER BY c.id
  LIMIT 1 OFFSET ((gs - 1) % 180)
) AS c ON true
ON CONFLICT DO NOTHING;

-- 5) Sessions using both venues
INSERT INTO public.mentis_sessions (id, organization_id, venue_id, name, start_at, end_at, level_band, capacity, notes)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  CASE
    WHEN (gs % 2 = 0) THEN '22222222-2222-2222-2222-222222222201'::uuid
    ELSE '22222222-2222-2222-2222-222222222202'::uuid
  END,
  'Demo Session ' || gs,
  NOW() + (gs - 1) * interval '2 days' + ((gs % 4) * interval '1 hour'),
  NOW() + (gs - 1) * interval '2 days' + ((gs % 4) * interval '1 hour') + interval '90 minutes',
  CASE WHEN gs % 3 = 0 THEN 'Beginner' WHEN gs % 3 = 1 THEN 'Intermediate' ELSE 'Advanced' END,
  12 + (gs % 10),
  'Seeded session ' || gs
FROM generate_series(1, 12) AS gs
ON CONFLICT DO NOTHING;

-- 6) Enrollments
INSERT INTO public.mentis_enrollments (id, session_id, member_id, status, expected, position)
SELECT
  gen_random_uuid(),
  s.id,
  m.id,
  CASE
    WHEN ((gs - 1) % 7) = 0 THEN 'waitlisted'
    WHEN ((gs - 1) % 5) = 0 THEN 'paused'
    WHEN ((gs - 1) % 4) = 0 THEN 'completed'
    ELSE 'active'
  END,
  true,
  ((gs - 1) % 15) + 1
FROM generate_series(1, 120) AS gs
JOIN public.mentis_sessions s ON s.organization_id = '00000000-0000-0000-0000-000000000001'
JOIN LATERAL (
  SELECT id
  FROM public.mentis_members m
  WHERE m.organization_id = s.organization_id
  ORDER BY m.id
  LIMIT 1 OFFSET ((gs - 1) % 200)
) AS m ON true
ON CONFLICT DO NOTHING;

-- 7) Attendance records
INSERT INTO public.mentis_attendance_records (id, session_id, member_id, status, recorded_by, recorded_at, offline)
SELECT
  gen_random_uuid(),
  s.id,
  m.id,
  CASE
    WHEN ((gs - 1) % 5) = 0 THEN 'late'::attendance_status
    WHEN ((gs - 1) % 6) = 0 THEN 'absent'::attendance_status
    WHEN ((gs - 1) % 7) = 0 THEN 'taster'::attendance_status
    ELSE 'present'::attendance_status
  END,
  st.id,
  NOW() - ((gs - 1) % 15) * interval '1 day',
  ((gs - 1) % 3 = 0)
FROM generate_series(1, 120) AS gs
JOIN public.mentis_sessions s ON s.organization_id = '00000000-0000-0000-0000-000000000001'
JOIN LATERAL (
  SELECT id
  FROM public.mentis_members m
  WHERE m.organization_id = s.organization_id
  ORDER BY m.id
  LIMIT 1 OFFSET ((gs - 1) % 200)
) AS m ON true
JOIN public.mentis_staff st ON st.organization_id = s.organization_id
WHERE st.roles[1] = 'COACH'
LIMIT 120
ON CONFLICT DO NOTHING;

-- 8) Groups and group membership
INSERT INTO public.mentis_groups (id, organization_id, venue_id, name)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222201', 'Development Squad'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222202', 'Junior Group'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222201', 'Performance Group')
ON CONFLICT DO NOTHING;

INSERT INTO public.mentis_group_members (group_id, member_id, staff_id)
SELECT
  g.id,
  m.id,
  NULL
FROM (
  SELECT id FROM public.mentis_groups WHERE organization_id = '00000000-0000-0000-0000-000000000001'
) AS g
JOIN LATERAL (
  SELECT id
  FROM public.mentis_members m
  WHERE m.organization_id = '00000000-0000-0000-0000-000000000001'
  ORDER BY m.id
  LIMIT 1 OFFSET ((abs(hashtextextended(g.id::text, 0)) % 200))
) AS m ON true
LIMIT 60;

-- 9) Medical notes and goals
INSERT INTO public.mentis_member_medical (member_id, notes, updated_by, updated_at)
SELECT
  m.id,
  'Demo medical note for ' || m.name || '. Monitor warm-up and hydration routines.',
  st.id,
  NOW() - ((gs - 1) % 12) * interval '1 day'
FROM generate_series(1, 60) AS gs
JOIN LATERAL (
  SELECT id, name
  FROM public.mentis_members
  WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  ORDER BY id
  LIMIT 1 OFFSET ((gs - 1) % 200)
) AS m ON true
JOIN public.mentis_staff st ON st.organization_id = '00000000-0000-0000-0000-000000000001'
WHERE st.roles[1] = 'COACH'
LIMIT 60
ON CONFLICT (member_id) DO UPDATE
SET notes = EXCLUDED.notes,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;

INSERT INTO public.mentis_member_goals (id, member_id, description, goal_type, target_date, status)
SELECT
  gen_random_uuid(),
  m.id,
  'Improve ' || CASE
    WHEN gs % 4 = 0 THEN 'serve'
    WHEN gs % 4 = 1 THEN 'backhand'
    WHEN gs % 4 = 2 THEN 'footwork'
    ELSE 'consistency'
  END || ' over the next 6 weeks.',
  CASE WHEN gs % 3 = 0 THEN 'rank' WHEN gs % 3 = 1 THEN 'competition' ELSE 'free' END,
  CURRENT_DATE + ((gs % 45) * interval '1 day'),
  CASE WHEN gs % 4 = 0 THEN 'achieved' WHEN gs % 4 = 1 THEN 'missed' ELSE 'inProgress' END
FROM generate_series(1, 80) AS gs
JOIN LATERAL (
  SELECT id
  FROM public.mentis_members
  WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  ORDER BY id
  LIMIT 1 OFFSET ((gs - 1) % 200)
) AS m ON true
ON CONFLICT DO NOTHING;

-- 10) Prospects
INSERT INTO public.mentis_prospects (id, organization_id, name, age, contact, consent, preferred_session_id, status, approved_session_ids, created_at)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'Prospect ' || gs,
  8 + ((gs - 1) % 18),
  'prospect' || gs || '@example.com',
  true,
  s.id,
  CASE WHEN gs % 5 = 0 THEN 'approved' WHEN gs % 5 = 1 THEN 'attended' WHEN gs % 5 = 2 THEN 'converted' ELSE 'requested' END,
  ARRAY[s.id]::uuid[],
  NOW() - ((gs - 1) % 30) * interval '1 day'
FROM generate_series(1, 25) AS gs
JOIN LATERAL (
  SELECT id
  FROM public.mentis_sessions
  WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  ORDER BY start_at
  LIMIT 1
) AS s ON true
ON CONFLICT DO NOTHING;

COMMIT;
