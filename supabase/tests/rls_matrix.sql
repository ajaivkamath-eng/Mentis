-- Mentis RLS matrix tests — run against a migrated local/staging DB as service role:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_matrix.sql
-- Simulates authenticated users via request.jwt.claims (auth.uid()).
-- Any RAISE EXCEPTION = matrix violation. Self-cleaning (rolls back).

begin;

create or replace function mentis_test_set_uid(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function mentis_test_clear_uid() returns void language plpgsql as $$
begin perform set_config('role', 'service_role', true); end $$;

create or replace function mentis_test_ok(label text, cond boolean) returns void language plpgsql as $$
begin
  if not cond then raise exception 'RLS FAIL: %', label; end if;
  raise notice 'RLS ok: %', label;
end $$;

-- Runs `stmt` as the current (simulated) user; PASSES only if it is BLOCKED.
create or replace function mentis_test_must_fail(label text, stmt text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'RLS FAIL (fail-open): %', label;
exception when others then
  if SQLERRM like 'RLS FAIL (fail-open)%' then raise; end if;
  raise notice 'RLS ok (blocked): %', label;
end $$;

select mentis_test_clear_uid();

-- Fixture users + staff -------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
values
  ('a0000000-0000-0000-0000-000000000001', 't-super@example.com', 'x', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000002', 't-admin@example.com', 'x', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000003', 't-coach@example.com', 'x', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000004', 't-sparrer@example.com', 'x', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into mentis_staff (organization_id, user_id, roles, display_name) values
  ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', array['SUPER_ADMIN']::mentis_role[], 'T Super'),
  ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', array['ADMIN']::mentis_role[], 'T Admin'),
  ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', array['COACH']::mentis_role[], 'T Coach'),
  ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', array['SPARRER']::mentis_role[], 'T Sparrer')
on conflict (organization_id, user_id) do update set roles = excluded.roles;

insert into venues (id, organization_id, name) values
  ('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'RLS Hall')
on conflict (id) do nothing;
insert into customers (id, organization_id, name, phone) values
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'RLS Parent', '07000')
on conflict (id) do nothing;
insert into members (id, organization_id, customer_id, name, date_of_birth, nok_name, nok_phone, special_needs_flag) values
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'RLS Kid', '2015-06-01', 'RLS Parent', '07000', true)
on conflict (id) do nothing;
insert into member_medical (member_id, notes) values ('d0000000-0000-0000-0000-000000000001', 'test note')
on conflict (member_id) do nothing;
insert into sessions (id, organization_id, venue_id, name, start_at, end_at, status) values
  ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'RLS Session', '2026-03-03T18:00:00Z', '2026-03-03T19:00:00Z', 'scheduled')
on conflict (id) do nothing;
insert into enrollments (session_id, member_id, status, expected) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'active', true)
on conflict (session_id, member_id) do nothing;
insert into rate_cards (organization_id, staff_id, label, rate_cents, valid_from)
  select '00000000-0000-0000-0000-000000000001', ms.id, 'std', 2000, '2026-01-01'
  from mentis_staff ms
  where ms.user_id in ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004')
    and not exists (select 1 from rate_cards rc where rc.staff_id = ms.id);
insert into session_staffing (session_id, staff_id, capacity, rate_card_id, planned_start, planned_end)
  select 'e0000000-0000-0000-0000-000000000001', ms.id,
    case when ms.user_id = 'a0000000-0000-0000-0000-000000000003' then 'lead' else 'sparrer' end,
    (select rc.id from rate_cards rc where rc.staff_id = ms.id limit 1),
    '2026-03-03T18:00:00Z', '2026-03-03T19:00:00Z'
  from mentis_staff ms
  where ms.user_id in ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004')
on conflict (session_id, staff_id, capacity) do nothing;

-- 1. Medical visibility (rule 3) ----------------------------------------------
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000003');
select mentis_test_ok('coach sees assigned medical', exists (select 1 from member_medical where member_id = 'd0000000-0000-0000-0000-000000000001'));
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000004');
select mentis_test_ok('sparrer sees own-session medical', exists (select 1 from member_medical where member_id = 'd0000000-0000-0000-0000-000000000001'));
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000002');
select mentis_test_ok('admin sees medical', exists (select 1 from member_medical));

-- 2. Sparrer register is read-only ---------------------------------------------
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000004');
select mentis_test_must_fail('sparrer cannot write attendance',
  $$ insert into attendance_records (session_id, member_id, status, recorded_by)
     values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'present', 'a0000000-0000-0000-0000-000000000004') $$);

-- 3. Coach marks own session ----------------------------------------------------
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000003');
insert into attendance_records (session_id, member_id, status, recorded_by)
  values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'present', 'a0000000-0000-0000-0000-000000000003');
select mentis_test_ok('coach marks own register', exists (
  select 1 from attendance_records where recorded_by = 'a0000000-0000-0000-0000-000000000003'));

-- 4. Task approval separation (rule 5) -------------------------------------------
select mentis_test_clear_uid();
insert into tasks (id, organization_id, title, task_type, assignee_id, status)
  values ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'RLS Task', 'other',
    (select id from mentis_staff where user_id = 'a0000000-0000-0000-0000-000000000003'), 'done')
on conflict (id) do nothing;
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000003');
select mentis_test_must_fail('coach cannot self-approve task',
  $$ update tasks set approved_at = now() where id = 'f0000000-0000-0000-0000-000000000001' $$);
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000002');
update tasks set approved_at = now() where id = 'f0000000-0000-0000-0000-000000000001';
select mentis_test_ok('admin approves task', exists (
  select 1 from tasks where id = 'f0000000-0000-0000-0000-000000000001' and approved_at is not null));

-- 5. Billing lock (rule 6) --------------------------------------------------------
select mentis_test_clear_uid();
insert into invoices (id, organization_id, staff_id, period_start, period_end, status, created_by)
  values ('f0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
    (select id from mentis_staff where user_id = 'a0000000-0000-0000-0000-000000000003'),
    '2026-01-01', '2026-01-10', 'draft', 'a0000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000002');
update invoices set status = 'approved', approved_by = 'a0000000-0000-0000-0000-000000000002' where id = 'f0000000-0000-0000-0000-000000000002';
select mentis_test_must_fail('approved invoice is locked',
  $$ update invoices set status = 'draft' where id = 'f0000000-0000-0000-0000-000000000002' $$);

-- 6. Venue concurrency (rule 17) + back-to-back ------------------------------------
select mentis_test_clear_uid();
select mentis_test_must_fail('venue overlap blocked',
  $$ insert into sessions (organization_id, venue_id, name, start_at, end_at)
     values ('00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'RLS Clash', '2026-03-03T18:30:00Z', '2026-03-03T19:30:00Z') $$);
insert into sessions (organization_id, venue_id, name, start_at, end_at)
  values ('00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'RLS BackToBack', '2026-03-03T19:00:00Z', '2026-03-03T20:00:00Z');
select mentis_test_ok('back-to-back allowed', exists (select 1 from sessions where name = 'RLS BackToBack'));

-- 7. Staff management is super-admin-only -------------------------------------------
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000001');
select mentis_test_ok('super admin reads staff', exists (select 1 from mentis_staff));
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000003');
-- Blocked UPDATEs affect 0 rows silently (no raise), so assert on effect:
update mentis_staff set display_name = 'Hacked' where user_id = 'a0000000-0000-0000-0000-000000000003';
select mentis_test_ok('coach cannot edit staff rows', not exists (select 1 from mentis_staff where display_name = 'Hacked'));

select mentis_test_clear_uid();
rollback;
