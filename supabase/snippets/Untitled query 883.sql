insert into mentis_staff (organization_id, user_id, roles, display_name)
values
  ('00000000-0000-0000-0000-000000000001',
   'be474d37-90d7-4807-a5ce-28882dff3e2f',
   array['SUPER_ADMIN']::mentis_role[],
   'Ajai Kamath')
on conflict (organization_id, user_id) do update
set roles = excluded.roles,
    display_name = excluded.display_name;


    select * from  mentis_staff;

    select * from public.mentis_venues;

    
    select * from  mentis_customers;

    select * from  mentis_members;

    select * from  mentis_organizations;
    
    select * from  mentis_sessions;
    