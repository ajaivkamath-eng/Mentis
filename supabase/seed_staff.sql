-- Link Rally auth users to Mentis roles (run after creating users in Rally).
-- Replace the UUIDs with real auth.users ids, then execute as a service-role admin.
-- Demo set: 2 super admins, 1 admin, 2 coaches (one multi-role coach+sparrer), 1 sparrer.
insert into mentis_staff (organization_id, user_id, roles, display_name) values
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', array['SUPER_ADMIN']::mentis_role[], 'Ada Super'),
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111112', array['SUPER_ADMIN']::mentis_role[], 'Ben Super'),
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111113', array['ADMIN']::mentis_role[], 'Cara Admin'),
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111114', array['COACH']::mentis_role[], 'Dan Coach'),
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111115', array['COACH','SPARRER']::mentis_role[], 'Eli Coach-Sparrer'),
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111116', array['SPARRER']::mentis_role[], 'Fay Sparrer')
on conflict (organization_id, user_id) do update set roles = excluded.roles, display_name = excluded.display_name;
