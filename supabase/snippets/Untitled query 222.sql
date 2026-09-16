select set_config('request.jwt.claims', '{"sub":"be474d37-90d7-4807-a5ce-28882dff3e2f"}', true);
select auth.uid();


select auth.uid() as current_user;

select * from auth.user;



do $$
declare
  v_user uuid := 'be474d37-90d7-4807-a5ce-28882dff3e2f';
  v_org  uuid := '00000000-0000-0000-0000-000000000001'; -- <-- replace with real org id
begin
  if v_user is null then
    raise exception 'No logged-in auth user detected. Log in to Mentis first.';
  end if;

  if not exists (select 1 from mentis_organizations where id = v_org) then
    raise exception 'Organization % does not exist', v_org;
  end if;

  insert into mentis_staff (organization_id, user_id, roles, display_name)
  values (v_org, v_user, ARRAY['ADMIN']::mentis_role[], 'Current User')
  on conflict (organization_id, user_id) do update
    set roles = excluded.roles,
        display_name = excluded.display_name;

  raise notice 'Current auth user: %', v_user;
  raise notice 'Linked organization: %', v_org;
end $$;

-- 1) Check the current logged-in auth user
select
  auth.uid() as current_auth_user,
  current_setting('request.jwt.claims', true) as jwt_claims;

-- 2) Verify staff link / organization membership
select
  s.id,
  s.organization_id,
  s.user_id,
  s.roles,
  s.display_name
from mentis_staff s
where s.user_id = auth.uid()
order by s.created_at;

-- 3) Confirm the logged-in user can access this organization
select
  exists (
    select 1
    from mentis_staff
    where user_id = auth.uid()
      and organization_id = '00000000-0000-0000-0000-000000000001'
  ) as has_org_membership;

-- 4) Check whether the app should now see data
select
  (
    select count(*)
    from mentis_customers
    where organization_id = '00000000-0000-0000-0000-000000000001'
  ) as customer_count,
  (
    select count(*)
    from mentis_members
    where organization_id = '00000000-0000-0000-0000-000000000001'
  ) as member_count,
  (
    select count(*)
    from mentis_staff
    where organization_id = '00000000-0000-0000-0000-000000000001'
  ) as staff_count,
  (
    auth.uid() is not null
    and exists (
      select 1
      from mentis_staff
      where user_id = auth.uid()
        and organization_id = '00000000-0000-0000-0000-000000000001'
    )
  ) as should_see_data;