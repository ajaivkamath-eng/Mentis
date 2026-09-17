-- Remove the records created by session_schedule_seed.sql
-- Keeps auth.users and mentis_staff intact.
-- Target org created by the seed: 00000000-0000-0000-0000-000000000001

BEGIN;

-- Remove session-linked data first.
DELETE FROM public.mentis_enrollments e
WHERE e.session_id IN (
  SELECT s.id
  FROM public.mentis_sessions s
  WHERE s.organization_id = '00000000-0000-0000-0000-000000000001'
);

DELETE FROM public.mentis_attendance_records ar
WHERE ar.session_id IN (
  SELECT s.id
  FROM public.mentis_sessions s
  WHERE s.organization_id = '00000000-0000-0000-0000-000000000001'
);

DELETE FROM public.mentis_sessions
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

-- Remove imported members created by the roster.
DELETE FROM public.mentis_members
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

-- Remove imported venues created by the roster.
DELETE FROM public.mentis_venues
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

-- Remove the club org created by the seed file.
DELETE FROM public.mentis_organizations
WHERE id = '00000000-0000-0000-0000-000000000001';

COMMIT;

-- Optional: if you want a faster, heavier reset for a known local demo environment,
-- you can use this instead:
--
-- BEGIN;
-- TRUNCATE TABLE public.mentis_enrollments,
--   public.mentis_attendance_records,
--   public.mentis_sessions,
--   public.mentis_members,
--   public.mentis_venues,
--   public.mentis_organizations
--   RESTART IDENTITY CASCADE;
-- COMMIT;
