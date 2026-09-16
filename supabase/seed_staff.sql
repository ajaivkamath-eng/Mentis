-- Link actual Supabase auth users to Mentis roles
-- The users below were created manually in Supabase Auth.
insert into mentis_staff (organization_id, user_id, roles, display_name) values
  ('00000000-0000-0000-0000-000000000001', '0442d43f-4fd2-4601-9e21-36d76e5f542e', array['COACH']::mentis_role[], 'Jack'),
  ('00000000-0000-0000-0000-000000000001', '171cf5d2-9a8b-4603-83d1-d6d7d035edaf', array['COACH']::mentis_role[], 'Richard'),
  ('00000000-0000-0000-0000-000000000001', '39ddd06f-dd1b-4728-8338-462dcbfec13a', array['COACH']::mentis_role[], 'Ajay'),
  ('00000000-0000-0000-0000-000000000001', '42b5ea6d-599a-43c5-afd8-a1d21c266274', array['COACH']::mentis_role[], 'Daniel'),
  ('00000000-0000-0000-0000-000000000001', '47d0502f-f74e-4ca4-be38-76e0a55f17c2', array['SPARRER']::mentis_role[], 'Jordan'),
  ('00000000-0000-0000-0000-000000000001', '4a081fea-2dc5-4b8b-99a2-3cd301f51303', array['COACH']::mentis_role[], 'Raj'),
  ('00000000-0000-0000-0000-000000000001', '54259e05-3387-4bc5-a523-fe655855c3fd', array['COACH']::mentis_role[], 'Marcel'),
  ('00000000-0000-0000-0000-000000000001', '834541c9-368d-48bc-b0b9-d0fc1c94840d', array['COACH']::mentis_role[], 'Alex'),
  ('00000000-0000-0000-0000-000000000001', '8a317616-c21a-427a-95b0-711c9c1e159a', array['ADMIN']::mentis_role[], 'John'),
  ('00000000-0000-0000-0000-000000000001', 'ab3137ee-aacb-4c31-9884-a6c8dd84c306', array['SPARRER']::mentis_role[], 'Noah'),
  ('00000000-0000-0000-0000-000000000001', 'ae404089-45eb-4b0e-9ded-4572c0ce4be8', array['COACH']::mentis_role[], 'Sam'),
  ('00000000-0000-0000-0000-000000000001', 'be879af1-3ca3-47fb-97c3-105469adefd5', array['COACH']::mentis_role[], 'Liam'),
  ('00000000-0000-0000-0000-000000000001', 'e725980b-f092-422c-8c30-001e559a949a', array['SPARRER']::mentis_role[], 'Ethan'),
  ('00000000-0000-0000-0000-000000000001', 'f03c0e26-7601-4d77-9496-b1bd289980a0', array['SPARRER']::mentis_role[], 'Mason'),
  ('00000000-0000-0000-0000-000000000001', 'fa6f0ced-08dd-43cf-a1d7-4a46b9ba36ff', array['ADMIN']::mentis_role[], 'Martin'),
  ('00000000-0000-0000-0000-000000000001', 'fd2bf0bd-05a5-4a66-be8e-a9a38ac7164d', array['COACH']::mentis_role[], 'Oliver'),
  ('00000000-0000-0000-0000-000000000001', 'be474d37-90d7-4807-a5ce-28882dff3e2f', array['ADMIN']::mentis_role[], 'Abdul')
on conflict (organization_id, user_id) do update set roles = excluded.roles, display_name = excluded.display_name;
