-- Seed a Thursday season using the template -> series operating model.
--
-- Safe to re-run: creates or updates the Thursday template and its recurrence,
-- then republishes the season without duplicating dates.
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/samples/thursday_series_seed.sql

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mentis_organizations WHERE name = 'Kingfisher Table Tennis Club') THEN
    RAISE EXCEPTION 'Kingfisher Table Tennis Club org not found — apply migrations and seed data first';
  END IF;
END $$;

-- Ensure the venue exists.
INSERT INTO mentis_venues (organization_id, name, concurrent_session_limit)
SELECT o.id, 'Kingfisher Table Tennis Club', 2
FROM mentis_organizations o
WHERE o.name = 'Kingfisher Table Tennis Club'
ON CONFLICT (organization_id, name) DO NOTHING;

-- Ensure the required members exist. Names match the roster used in the season import.
INSERT INTO mentis_members (organization_id, name, date_of_birth)
SELECT o.id, member_name, DATE '2008-01-01'
FROM (
  VALUES
    ('Aeyva Fayaz'),
    ('Anshika Kamath'),
    ('Arjun Tomar'),
    ('Aarav Pahwa'),
    ('Charlie Zeng'),
    ('Daniel Michel Delgado'),
    ('Ethan Zeng'),
    ('Heilam Tse'),
    ('Navya Pathak'),
    ('Noah CLARKE'),
    ('Pak Yiu Andres Lang'),
    ('Prayrit Ahluwalia'),
    ('Rabani Ahluwalia'),
    ('Rishaan SAWANT'),
    ('Sahil Tekurkar'),
    ('Swara Mahabhashyam'),
    ('Kaavya Pathak'),
    ('Ayansh Pahwa'),
    ('Soumyajit Dasgupta')
) AS v(member_name)
CROSS JOIN mentis_organizations o
WHERE o.name = 'Kingfisher Table Tennis Club'
ON CONFLICT (organization_id, name) DO NOTHING;

-- Template: one Thursday blueprint for the season.
WITH org AS (
  SELECT id AS organization_id
  FROM mentis_organizations
  WHERE name = 'Kingfisher Table Tennis Club'
), venue AS (
  SELECT id AS venue_id
  FROM mentis_venues
  WHERE organization_id = (SELECT organization_id FROM org)
    AND name = 'Kingfisher Table Tennis Club'
)
INSERT INTO mentis_sessions (
  organization_id, code, name, description, venue_id,
  default_start_time, default_end_time, timezone,
  capacity, tags, status
)
SELECT
  org.organization_id,
  'KF-THU-4PM',
  'Thurs 4pm',
  'Thursday season template created from the operating model.',
  venue.venue_id,
  '16:00'::time,
  '17:30'::time,
  'Europe/London',
  19,
  ARRAY['roster-import', '2026-27', 'time-inferred'],
  'active'
FROM org
CROSS JOIN venue
WHERE NOT EXISTS (
  SELECT 1
  FROM mentis_sessions t
  WHERE t.organization_id = org.organization_id
    AND t.code = 'KF-THU-4PM'
);

UPDATE mentis_sessions t
SET name = 'Thurs 4pm',
    description = 'Thursday season template created from the operating model.',
    venue_id = v.id,
    default_start_time = '16:00'::time,
    default_end_time = '17:30'::time,
    timezone = 'Europe/London',
    capacity = 19,
    tags = ARRAY['roster-import', '2026-27', 'time-inferred'],
    status = 'active',
    updated_at = now()
FROM mentis_venues v
JOIN mentis_organizations o ON o.id = v.organization_id
WHERE t.organization_id = o.id
  AND o.name = 'Kingfisher Table Tennis Club'
  AND v.name = 'Kingfisher Table Tennis Club'
  AND t.code = 'KF-THU-4PM';

-- Default roster derived from template membership.
INSERT INTO mentis_session_template_members (template_id, member_id)
SELECT t.id, m.id
FROM mentis_sessions t
JOIN mentis_organizations o ON o.id = t.organization_id
JOIN mentis_members m ON m.organization_id = o.id
WHERE o.name = 'Kingfisher Table Tennis Club'
  AND t.code = 'KF-THU-4PM'
  AND m.name IN (
    'Aeyva Fayaz', 'Anshika Kamath', 'Arjun Tomar', 'Aarav Pahwa', 'Charlie Zeng',
    'Daniel Michel Delgado', 'Ethan Zeng', 'Heilam Tse', 'Navya Pathak', 'Noah CLARKE',
    'Pak Yiu Andres Lang', 'Prayrit Ahluwalia', 'Rabani Ahluwalia', 'Rishaan SAWANT',
    'Sahil Tekurkar', 'Swara Mahabhashyam', 'Kaavya Pathak', 'Ayansh Pahwa', 'Soumyajit Dasgupta'
  )
ON CONFLICT (template_id, member_id) DO NOTHING;

-- One recurring rule for the season window.
INSERT INTO mentis_recurrence_rules (
  organization_id, template_id, label, frequency, interval_count, by_weekday,
  start_time, end_time, valid_from, valid_to, horizon_days,
  skip_term_holidays, skip_bank_holidays, skip_manual_closures, is_active
)
SELECT
  t.organization_id,
  t.id,
  'Thurs 4pm — season 2026/27',
  'weekly',
  1,
  ARRAY[4]::smallint[],
  '16:00'::time,
  '17:30'::time,
  DATE '2026-09-03',
  DATE '2027-07-22',
  365,
  true,
  true,
  true,
  true
FROM mentis_sessions t
WHERE t.organization_id = (
  SELECT id FROM mentis_organizations WHERE name = 'Kingfisher Table Tennis Club'
)
  AND t.code = 'KF-THU-4PM'
  AND NOT EXISTS (
    SELECT 1
    FROM mentis_recurrence_rules rr
    WHERE rr.template_id = t.id
  );

UPDATE mentis_recurrence_rules rr
SET label = 'Thurs 4pm — season 2026/27',
    frequency = 'weekly',
    interval_count = 1,
    by_weekday = ARRAY[4]::smallint[],
    start_time = '16:00'::time,
    end_time = '17:30'::time,
    valid_from = DATE '2026-09-03',
    valid_to = DATE '2027-07-22',
    horizon_days = 365,
    skip_term_holidays = true,
    skip_bank_holidays = true,
    skip_manual_closures = true,
    is_active = true,
    updated_at = now()
FROM mentis_sessions t
JOIN mentis_organizations o ON o.id = t.organization_id
WHERE rr.template_id = t.id
  AND o.name = 'Kingfisher Table Tennis Club'
  AND t.code = 'KF-THU-4PM';

-- Publish the season from the template; this reuses the same series on rerun.
DO $$
DECLARE
  v_tpl uuid;
  v_rule uuid;
  v_result jsonb;
  v_admin uuid;
BEGIN
  SELECT id INTO v_tpl
  FROM mentis_sessions
  WHERE organization_id = (
      SELECT id FROM mentis_organizations WHERE name = 'Kingfisher Table Tennis Club'
    )
    AND code = 'KF-THU-4PM';

  SELECT id INTO v_rule
  FROM mentis_recurrence_rules
  WHERE template_id = v_tpl;

  SELECT ms.user_id INTO v_admin
  FROM mentis_staff ms
  JOIN mentis_organizations o ON o.id = ms.organization_id
  WHERE o.name = 'Kingfisher Table Tennis Club'
    AND ms.roles && ARRAY['SUPER_ADMIN', 'ADMIN']::mentis_role[]
  ORDER BY ms.display_name
  LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE NOTICE 'No admin user linked to Kingfisher Table Tennis Club; template and rule were created but the season was not published.';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, false);
  v_result := instantiate_session_series(
    v_tpl,
    jsonb_build_object(
      'frequency', 'weekly',
      'by_weekday', jsonb_build_array(4),
      'start_time', '16:00',
      'end_time', '17:30',
      'valid_from', '2026-09-03',
      'valid_to', '2027-07-22',
      'skip_term_holidays', true,
      'skip_bank_holidays', true,
      'skip_manual_closures', true
    ),
    jsonb_build_object('rule_id', v_rule, 'label', 'Thurs 4pm — season 2026/27')
  );
  PERFORM sync_template_roster_to_child_sessions(v_tpl);
  PERFORM set_config('request.jwt.claims', '{}', false);

  RAISE NOTICE 'Thursday season published: %', v_result;
END $$;

COMMIT;
