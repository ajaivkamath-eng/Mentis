insert into mentis_staff (organization_id, user_id, roles, display_name)
values (
  '00000000-0000-0000-0000-000000000001',
  '{be474d37-90d7-4807-a5ce-28882dff3e2f}',
  ARRAY['SUPER_ADMIN']::mentis_role[],
  'Ajai Kamath'
)
on conflict (organization_id, user_id) do update
set roles = excluded.roles,
    display_name = excluded.display_name;



-- replace with the real logged-in auth user UUID
-- and the real org id you are using
do $$
declare
  v_user uuid := 'be474d37-90d7-4807-a5ce-28882dff3e2f';
  v_org  uuid := '00000000-0000-0000-0000-000000000001';
begin
  if v_user is null then
    raise exception 'No auth user supplied';
  end if;

  insert into mentis_staff (organization_id, user_id, roles, display_name)
  values (v_org, v_user, ARRAY['ADMIN']::mentis_role[], 'Current User')
  on conflict (organization_id, user_id) do update
    set roles = excluded.roles,
        display_name = excluded.display_name;
end $$;

select
  s.*
from mentis_staff s
where s.user_id = 'be474d37-90d7-4807-a5ce-28882dff3e2f';

select
  exists (
    select 1
    from mentis_staff
    where user_id = 'be474d37-90d7-4807-a5ce-28882dff3e2f'
      and organization_id = '00000000-0000-0000-0000-000000000001'
  ) as has_org_membership;