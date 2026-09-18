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

insert into mentis_venues (id, organization_id, name) values
  ('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'RLS Hall')
on conflict (id) do nothing;
insert into mentis_customers (id, organization_id, name, phone) values
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'RLS Parent', '07000')
on conflict (id) do nothing;
insert into mentis_members (id, organization_id, customer_id, name, date_of_birth, nok_name, nok_phone, special_needs_flag) values
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'RLS Kid', '2015-06-01', 'RLS Parent', '07000', true)
on conflict (id) do nothing;
insert into mentis_member_medical (member_id, notes) values ('d0000000-0000-0000-0000-000000000001', 'test note')
on conflict (member_id) do nothing;
insert into mentis_sessions (id, organization_id, venue_id, name, start_at, end_at, status) values
  ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'RLS Session', '2026-03-03T18:00:00Z', '2026-03-03T19:00:00Z', 'scheduled')
on conflict (id) do nothing;
insert into mentis_enrollments (session_id, member_id, status, expected) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'active', true)
on conflict (session_id, member_id) do nothing;
insert into mentis_rate_cards (organization_id, staff_id, label, rate_cents, valid_from)
  select '00000000-0000-0000-0000-000000000001', ms.id, 'std', 2000, '2026-01-01'
  from mentis_staff ms
  where ms.user_id in ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004')
    and not exists (select 1 from mentis_rate_cards rc where rc.staff_id = ms.id);
insert into mentis_session_staffing (session_id, staff_id, capacity, rate_card_id, planned_start, planned_end)
  select 'e0000000-0000-0000-0000-000000000001', ms.id,
    case when ms.user_id = 'a0000000-0000-0000-0000-000000000003' then 'lead' else 'sparrer' end,
    (select rc.id from mentis_rate_cards rc where rc.staff_id = ms.id limit 1),
    '2026-03-03T18:00:00Z', '2026-03-03T19:00:00Z'
  from mentis_staff ms
  where ms.user_id in ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004')
on conflict (session_id, staff_id, capacity, planned_start) do nothing;

-- 1. Medical visibility (rule 3) ----------------------------------------------
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000003');
select mentis_test_ok('coach sees assigned medical', exists (select 1 from mentis_member_medical where member_id = 'd0000000-0000-0000-0000-000000000001'));
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000004');
select mentis_test_ok('sparrer sees own-session medical', exists (select 1 from mentis_member_medical where member_id = 'd0000000-0000-0000-0000-000000000001'));
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000002');
select mentis_test_ok('admin sees medical', exists (select 1 from mentis_member_medical));

-- 2. Sparrer register is read-only ---------------------------------------------
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000004');
select mentis_test_must_fail('sparrer cannot write attendance',
  $$ insert into mentis_attendance_records (session_id, member_id, status, recorded_by)
     values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'present', 'a0000000-0000-0000-0000-000000000004') $$);

-- 3. Coach marks own session ----------------------------------------------------
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000003');
insert into mentis_attendance_records (session_id, member_id, status, recorded_by)
  values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'present', 'a0000000-0000-0000-0000-000000000003');
select mentis_test_ok('coach marks own register', exists (
  select 1 from mentis_attendance_records where recorded_by = 'a0000000-0000-0000-0000-000000000003'));

-- 4. Task approval separation (rule 5) -------------------------------------------
select mentis_test_clear_uid();
insert into mentis_tasks (id, organization_id, title, task_type, assignee_id, status)
  values ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'RLS Task', 'other',
    (select id from mentis_staff where user_id = 'a0000000-0000-0000-0000-000000000003'), 'done')
on conflict (id) do nothing;
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000003');
select mentis_test_must_fail('coach cannot self-approve task',
  $$ update mentis_tasks set approved_at = now() where id = 'f0000000-0000-0000-0000-000000000001' $$);
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000002');
update mentis_tasks set approved_at = now() where id = 'f0000000-0000-0000-0000-000000000001';
select mentis_test_ok('admin approves task', exists (
  select 1 from mentis_tasks where id = 'f0000000-0000-0000-0000-000000000001' and approved_at is not null));

-- 5. Billing lock (rule 6) --------------------------------------------------------
select mentis_test_clear_uid();
insert into mentis_invoices (id, organization_id, staff_id, period_start, period_end, status, created_by)
  values ('f0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
    (select id from mentis_staff where user_id = 'a0000000-0000-0000-0000-000000000003'),
    '2026-01-01', '2026-01-10', 'draft', 'a0000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000002');
update mentis_invoices set status = 'approved', approved_by = 'a0000000-0000-0000-0000-000000000002' where id = 'f0000000-0000-0000-0000-000000000002';
select mentis_test_must_fail('approved invoice is locked',
  $$ update mentis_invoices set status = 'draft' where id = 'f0000000-0000-0000-0000-000000000002' $$);

-- 6. Venue concurrency (rule 17) + back-to-back ------------------------------------
select mentis_test_clear_uid();
select mentis_test_must_fail('venue overlap blocked',
  $$ insert into mentis_sessions (organization_id, venue_id, name, start_at, end_at)
     values ('00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'RLS Clash', '2026-03-03T18:30:00Z', '2026-03-03T19:30:00Z') $$);
insert into mentis_sessions (organization_id, venue_id, name, start_at, end_at)
  values ('00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'RLS BackToBack', '2026-03-03T19:00:00Z', '2026-03-03T20:00:00Z');
select mentis_test_ok('back-to-back allowed', exists (select 1 from mentis_sessions where name = 'RLS BackToBack'));

-- 7. Staff management is super-admin-only -------------------------------------------
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000001');
select mentis_test_ok('super admin reads staff', exists (select 1 from mentis_staff));
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000003');
-- Blocked UPDATEs affect 0 rows silently (no raise), so assert on effect:
update mentis_staff set display_name = 'Hacked' where user_id = 'a0000000-0000-0000-0000-000000000003';
select mentis_test_ok('coach cannot edit staff rows', not exists (select 1 from mentis_staff where display_name = 'Hacked'));

-- 8. Diary calendar: availability rules, conflict scan, conflict records ---------
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000003'); -- coach
insert into mentis_availability_rules (organization_id, staff_id, label, pattern, effective_from, effective_to, scope, created_by)
values (
  '00000000-0000-0000-0000-000000000001',
  (select id from mentis_staff where user_id = 'a0000000-0000-0000-0000-000000000003'),
  'Regular availability',
  '[{"weekday":1,"windows":[{"start":"12:00","end":"20:00"}]},{"weekday":2,"windows":[{"start":"16:00","end":"17:00"}]},{"weekday":6,"windows":[]}]'::jsonb,
  '2026-10-01', '2026-12-31', 'custom', 'a0000000-0000-0000-0000-000000000003');
select mentis_test_ok('coach saves own availability rule', exists (select 1 from mentis_availability_rules where label = 'Regular availability'));
select mentis_test_must_fail('invalid pattern window rejected',
  $$ update mentis_availability_rules set pattern = '[{"weekday":1,"windows":[{"start":"20:00","end":"09:00"}]}]'::jsonb $$);
-- Sparrers (no recordForOthers) may not write other staff's rules.
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000004');
select mentis_test_must_fail('sparrer cannot write another staff member rule',
  $$ insert into mentis_availability_rules (organization_id, staff_id, label, pattern, effective_from, scope)
     values ('00000000-0000-0000-0000-000000000001',
       (select id from mentis_staff where user_id = 'a0000000-0000-0000-0000-000000000003'),
       'Hijack', '[{"weekday":1,"windows":[]}]'::jsonb, '2026-10-01', 'custom') $$);

-- Admin may maintain patterns on behalf of staff.
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000002');
insert into mentis_availability_rules (organization_id, staff_id, label, pattern, effective_from, scope)
values ('00000000-0000-0000-0000-000000000001',
  (select id from mentis_staff where user_id = 'a0000000-0000-0000-0000-000000000003'),
  'Admin-set pattern', '[{"weekday":3,"windows":[{"start":"09:00","end":"13:00"}]}]'::jsonb, '2026-10-01', 'indefinite');
select mentis_test_ok('admin writes rule for coach', exists (select 1 from mentis_availability_rules where label = 'Admin-set pattern'));

-- Conflict scan: an unavailable window overlapping a future session assignment
-- must auto-create a durable conflict with the human message.
select mentis_test_clear_uid();
insert into mentis_sessions (id, organization_id, venue_id, name, start_at, end_at)
  values ('e0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001', 'RLS Diary Clash Session',
    now() + interval '10 days 16 hours', now() + interval '10 days 17 hours')
on conflict (id) do nothing;
insert into mentis_session_staffing (session_id, staff_id, capacity, rate_card_id, planned_start, planned_end)
  values ('e0000000-0000-0000-0000-000000000009',
    (select id from mentis_staff where user_id = 'a0000000-0000-0000-0000-000000000003'),
    'lead',
    (select id from mentis_rate_cards where staff_id = (select id from mentis_staff where user_id = 'a0000000-0000-0000-0000-000000000003') limit 1),
    now() + interval '10 days 16 hours', now() + interval '10 days 17 hours')
on conflict do nothing;
select mentis_test_set_uid('a0000000-0000-0000-0000-000000000003');
insert into mentis_staff_availability (organization_id, staff_id, starts_at, ends_at, available, availability_type, reason, recorded_by)
  values ('00000000-0000-0000-0000-000000000001',
    (select id from mentis_staff where user_id = 'a0000000-0000-0000-0000-000000000003'),
    now() + interval '10 days 16 hours', now() + interval '10 days 18 hours',
    false, 'holiday', 'Family trip', 'a0000000-0000-0000-0000-000000000003');
select mentis_test_ok('conflict scan records diary conflict', exists (
  select 1 from mentis_diary_conflicts c
  join mentis_sessions s on s.id = c.session_id
  where s.name = 'RLS Diary Clash Session' and c.overlap_minutes = 60 and c.status = 'open'));
select mentis_test_ok('availability row flagged with open conflict', exists (
  select 1 from mentis_staff_availability where reason = 'Family trip' and conflict_status = 'open'));
select mentis_test_ok('conflict message names reason and overlap', exists (
  select 1 from mentis_diary_conflicts where message like '%because of Holiday / annual leave%' and message like '%by 60 minutes%'));

-- Restoring availability resolves the conflict.
update mentis_staff_availability set available = true where reason = 'Family trip';
select mentis_test_ok('restoring availability resolves conflict', exists (
  select 1 from mentis_diary_conflicts c join mentis_sessions s on s.id = c.session_id
  where s.name = 'RLS Diary Clash Session' and c.status = 'resolved'));

select mentis_test_clear_uid();
rollback;

