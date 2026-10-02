BEGIN;

DO $$
BEGIN
  IF to_regclass('public.mentis_session_templates') IS NULL
     OR to_regclass('public.mentis_recurrence_rules') IS NULL
     OR to_regclass('public.mentis_session_series') IS NULL THEN
    RAISE NOTICE 'Skipping blueprint seed: session template tables are not yet installed. Run supabase/migrations/0013_session_templates.sql first.';
    RETURN;
  END IF;
END $$;

-- Create blueprint records from the sessions that already exist in the database.
-- This script is additive only and leaves the original session seed/import SQL untouched.
--
-- What it does:
-- 1) groups existing mentis_sessions by organization + venue + session name
-- 2) creates a mentis_session_template for each unique session pattern
-- 3) adds a default lead/sparrer staffing plan
-- 4) copies the currently enrolled members into the template default roster
-- 5) creates a basic weekly recurrence rule + series for each template so the
--    owner has something ready to work from without starting from an empty page.

WITH session_groups AS (
  SELECT
    s.organization_id,
    s.venue_id,
    trim(s.name) AS template_name,
    min(s.start_at::time) AS default_start_time,
    max(s.end_at::time) AS default_end_time,
    min(s.start_at::date) AS first_seen_on,
    max(s.start_at::date) AS last_seen_on,
    count(*) AS instance_count,
    mode() WITHIN GROUP (ORDER BY extract(isodow from s.start_at)::smallint) AS preferred_weekday
  FROM public.mentis_sessions s
  WHERE s.organization_id IS NOT NULL
  GROUP BY s.organization_id, s.venue_id, trim(s.name)
),
new_templates AS (
  INSERT INTO public.mentis_session_templates (
    organization_id,
    code,
    name,
    description,
    venue_id,
    default_start_time,
    default_end_time,
    timezone,
    level_band,
    capacity,
    min_headcount,
    status,
    tags,
    created_at,
    updated_at
  )
  SELECT
    sg.organization_id,
    lower(regexp_replace(sg.template_name, '[^a-z0-9]+', '-', 'g')) || '-' || left(md5(sg.organization_id::text || '|' || coalesce(sg.venue_id::text, 'no-venue') || '|' || sg.template_name), 6),
    sg.template_name,
    'Imported from existing mentis_sessions rows. ' || sg.instance_count || ' instance(s) found between ' || sg.first_seen_on || ' and ' || sg.last_seen_on || '.',
    sg.venue_id,
    sg.default_start_time,
    sg.default_end_time,
    'Europe/London',
    NULL,
    NULL,
    NULL,
    'active',
    ARRAY['imported','session-copy']::text[],
    now(),
    now()
  FROM session_groups sg
  ON CONFLICT (organization_id, name, venue_id) DO NOTHING
  RETURNING id, organization_id, venue_id, name
),
new_staffing AS (
  INSERT INTO public.mentis_session_template_staffing (
    template_id,
    capacity,
    required,
    lead_minutes,
    trail_minutes,
    notes,
    sort_order
  )
  SELECT
    nt.id,
    'lead',
    true,
    15,
    0,
    'Imported lead slot from existing session blueprint.',
    1
  FROM new_templates nt
  ON CONFLICT DO NOTHING
  RETURNING template_id
),
new_members AS (
  INSERT INTO public.mentis_session_template_members (
    template_id,
    member_id
  )
  SELECT DISTINCT
    nt.id,
    e.member_id
  FROM new_templates nt
  JOIN public.mentis_sessions s
    ON s.organization_id = nt.organization_id
   AND s.venue_id = nt.venue_id
   AND s.name = nt.name
  JOIN public.mentis_enrollments e
    ON e.session_id = s.id
  WHERE e.member_id IS NOT NULL
  ON CONFLICT DO NOTHING
  RETURNING template_id
),
new_rules AS (
  INSERT INTO public.mentis_recurrence_rules (
    organization_id,
    template_id,
    label,
    frequency,
    interval_count,
    by_weekday,
    start_time,
    end_time,
    valid_from,
    valid_to,
    horizon_days,
    skip_term_holidays,
    skip_bank_holidays,
    skip_manual_closures,
    is_active,
    created_at,
    updated_at
  )
  SELECT
    nt.organization_id,
    nt.id,
    'Imported weekly recurrence for ' || nt.name,
    'weekly',
    1,
    ARRAY[extract(isodow from min(s.start_at))::smallint],
    min(s.start_at::time),
    max(s.end_at::time),
    min(s.start_at::date),
    max(s.start_at::date),
    90,
    true,
    true,
    true,
    true,
    now(),
    now()
  FROM new_templates nt
  JOIN public.mentis_sessions s
    ON s.organization_id = nt.organization_id
   AND s.venue_id = nt.venue_id
   AND s.name = nt.name
  GROUP BY nt.organization_id, nt.id, nt.name
  ON CONFLICT DO NOTHING
  RETURNING id, template_id
)
INSERT INTO public.mentis_session_series (
  organization_id,
  template_id,
  recurrence_rule_id,
  label,
  venue_id,
  starts_on,
  ends_on,
  status,
  template_version,
  created_at,
  updated_at
)
SELECT
  nt.organization_id,
  nt.id,
  nr.id,
  'Imported series for ' || nt.name,
  nt.venue_id,
  min(s.start_at::date),
  max(s.start_at::date),
  'active',
  1,
  now(),
  now()
FROM new_rules nr
JOIN public.mentis_session_templates nt
  ON nt.id = nr.template_id
JOIN public.mentis_sessions s
  ON s.organization_id = nt.organization_id
 AND s.venue_id = nt.venue_id
 AND s.name = nt.name
GROUP BY nt.organization_id, nt.id, nr.id, nt.name, nt.venue_id
ON CONFLICT DO NOTHING;

COMMIT;
