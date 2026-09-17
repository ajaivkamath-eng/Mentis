-- Local reset + org alignment + staff link script for Mentis
-- This keeps auth.users intact, clears imported roster data, and re-aligns staff to the Kingfisher org.

BEGIN;

-- 1) Wipe imported roster data and dependent foreign-key references.
TRUNCATE TABLE public.mentis_prospects,
  public.mentis_customer_charges,
  public.mentis_tasks,
  public.mentis_staff_time_entries,
  public.mentis_schedule_overrides,
  public.mentis_session_staffing,
  public.mentis_session_segments,
  public.mentis_matches,
  public.mentis_player_feedback,
  public.mentis_member_goals,
  public.mentis_member_medical,
  public.mentis_progress_reports,
  public.mentis_rankings,
  public.mentis_group_members,
  public.mentis_event_entries,
  public.mentis_bookings,
  public.mentis_attendance_records,
  public.mentis_enrollments,
  public.mentis_sessions,
  public.mentis_members,
  public.mentis_customers,
  public.mentis_venues
CASCADE;

-- 2) Ensure the org exists, then align everything to the Kingfisher club org.
INSERT INTO public.mentis_organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Kingfisher Table Tennis Club')
ON CONFLICT (id) DO NOTHING;

UPDATE public.mentis_staff
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL OR organization_id <> '00000000-0000-0000-0000-000000000001';

-- 3) Re-link staff rows to the org and keep roles consistent.
INSERT INTO public.mentis_staff (organization_id, user_id, roles, display_name) VALUES
  ('00000000-0000-0000-0000-000000000001', '0442d43f-4fd2-4601-9e21-36d76e5f542e', ARRAY['COACH']::public.mentis_role[], 'Jack'),
  ('00000000-0000-0000-0000-000000000001', '171cf5d2-9a8b-4603-83d1-d6d7d035edaf', ARRAY['COACH']::public.mentis_role[], 'Richard'),
  ('00000000-0000-0000-0000-000000000001', '39ddd06f-dd1b-4728-8338-462dcbfec13a', ARRAY['COACH']::public.mentis_role[], 'Ajay'),
  ('00000000-0000-0000-0000-000000000001', '42b5ea6d-599a-43c5-afd8-a1d21c266274', ARRAY['COACH']::public.mentis_role[], 'Daniel'),
  ('00000000-0000-0000-0000-000000000001', '47d0502f-f74e-4ca4-be38-76e0a55f17c2', ARRAY['SPARRER']::public.mentis_role[], 'Jordan'),
  ('00000000-0000-0000-0000-000000000001', '4a081fea-2dc5-4b8b-99a2-3cd301f51303', ARRAY['COACH']::public.mentis_role[], 'Raj'),
  ('00000000-0000-0000-0000-000000000001', '54259e05-3387-4bc5-a523-fe655855c3fd', ARRAY['COACH']::public.mentis_role[], 'Marcel'),
  ('00000000-0000-0000-0000-000000000001', '834541c9-368d-48bc-b0b9-d0fc1c94840d', ARRAY['COACH']::public.mentis_role[], 'Alex'),
  ('00000000-0000-0000-0000-000000000001', '8a317616-c21a-427a-95b0-711c9c1e159a', ARRAY['ADMIN']::public.mentis_role[], 'John'),
  ('00000000-0000-0000-0000-000000000001', 'ab3137ee-aacb-4c31-9884-a6c8dd84c306', ARRAY['SPARRER']::public.mentis_role[], 'Noah'),
  ('00000000-0000-0000-0000-000000000001', 'ae404089-45eb-4b0e-9ded-4572c0ce4be8', ARRAY['COACH']::public.mentis_role[], 'Sam'),
  ('00000000-0000-0000-0000-000000000001', 'be879af1-3ca3-47fb-97c3-105469adefd5', ARRAY['COACH']::public.mentis_role[], 'Liam'),
  ('00000000-0000-0000-0000-000000000001', 'e725980b-f092-422c-8c30-001e559a949a', ARRAY['SPARRER']::public.mentis_role[], 'Ethan'),
  ('00000000-0000-0000-0000-000000000001', 'f03c0e26-7601-4d77-9496-b1bd289980a0', ARRAY['SPARRER']::public.mentis_role[], 'Mason'),
  ('00000000-0000-0000-0000-000000000001', 'fa6f0ced-08dd-43cf-a1d7-4a46b9ba36ff', ARRAY['ADMIN']::public.mentis_role[], 'Martin'),
  ('00000000-0000-0000-0000-000000000001', 'fd2bf0bd-05a5-4a66-be8e-a9a38ac7164d', ARRAY['COACH']::public.mentis_role[], 'Oliver'),
  ('00000000-0000-0000-0000-000000000001', 'be474d37-90d7-4807-a5ce-28882dff3e2f', ARRAY['SUPER_ADMIN']::public.mentis_role[], 'Ajai Kamath'),
ON CONFLICT (organization_id, user_id) DO UPDATE
SET roles = EXCLUDED.roles,
    display_name = EXCLUDED.display_name;

COMMIT;

-- 4) Optional: import the roster again using the existing sample file after this reset.
-- Example:
-- docker exec -i supabase_db_Mentis psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/session_schedule_seed.sql
