-- Mentis RLS matrix: per-entity × role × command (§4, rule 15/25).
-- Security floor = UNION of the user's roles; the role switcher only narrows the UI.
-- Drop the broad bootstrap policies first.
drop policy if exists org_staff_access on organizations;
drop policy if exists staff_manage on mentis_staff;
drop policy if exists staff_self_read on mentis_staff;
drop policy if exists venue_access on venues;
drop policy if exists customer_access on customers;
drop policy if exists member_access on members;
drop policy if exists member_admin_write on members;
drop policy if exists session_access on sessions;
drop policy if exists enrollment_access on enrollments;
drop policy if exists attendance_access on attendance_records;
drop policy if exists audit_admin_read on audit_log;
drop policy if exists holiday_access on holiday_calendar;
drop policy if exists schedule_access on weekly_schedules;
drop policy if exists rate_access on rate_cards;
drop policy if exists schedule_staff_access on schedule_staff;
drop policy if exists override_access on schedule_overrides;
drop policy if exists staffing_access on session_staffing;
drop policy if exists availability_access on staff_availability;
drop policy if exists task_access on tasks;
drop policy if exists time_entry_access on staff_time_entries;
drop policy if exists invoice_access on invoices;
drop policy if exists invoice_line_access on invoice_lines;
drop policy if exists action_type_access on action_types;
drop policy if exists action_access on pending_actions;

-- Helpers (security definer, org-scoped).
create or replace function is_admin(org uuid) returns boolean language sql stable security definer set search_path = public as
$$ select has_mentis_role(org, 'SUPER_ADMIN') or has_mentis_role(org, 'ADMIN') $$;
create or replace function is_staff(org uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from mentis_staff where organization_id = org and user_id = auth.uid()) $$;
create or replace function my_staff_id(org uuid) returns uuid language sql stable security definer set search_path = public as
$$ select id from mentis_staff where organization_id = org and user_id = auth.uid() limit 1 $$;
create or replace function is_superadmin(org uuid) returns boolean language sql stable security definer set search_path = public as
$$ select has_mentis_role(org, 'SUPER_ADMIN') $$;
create or replace function staffed_on(session uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from session_staffing ss join mentis_staff ms on ms.id = ss.staff_id
    where ss.session_id = session and ms.user_id = auth.uid()) $$;
create or replace function assigned_to_member(member uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from enrollments e join session_staffing ss on ss.session_id = e.session_id
    join mentis_staff ms on ms.id = ss.staff_id
    where e.member_id = member and ms.user_id = auth.uid()) $$;
create or replace function in_group(g uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from group_members gm join mentis_staff ms on ms.id = gm.staff_id
    where gm.group_id = g and ms.user_id = auth.uid()) $$;

-- Enable RLS on the new tables.
do $$ declare t text; begin
  foreach t in array array['sport_profiles','member_medical','session_segments','prospects','groups','group_members',
    'member_goals','events','sub_events','event_entries','matches','rankings','player_feedback','billing_ledger',
    'customer_charges','communication_log','booking_slots','bookings','progress_reports','devices']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- Organizations & staff: super-admin manages; staff read own org.
create policy org_select on organizations for select using (is_staff(id));
create policy org_super_write on organizations for all using (is_superadmin(id));
create policy staff_select on mentis_staff for select using (is_staff(organization_id));
create policy staff_super_write on mentis_staff for all using (is_superadmin(organization_id));

-- Venues: admin manages; staff view.
create policy venue_select on venues for select using (is_staff(organization_id));
create policy venue_write on venues for all using (is_admin(organization_id));

-- Customers: admin/coach full view; sparrer register-only (own sessions' members).
create policy customer_select on customers for select using (
  is_admin(organization_id) or has_mentis_role(organization_id, 'COACH') or
  (has_mentis_role(organization_id, 'SPARRER') and exists (
    select 1 from members m where m.customer_id = customers.id and assigned_to_member(m.id))));
create policy customer_write on customers for all using (is_admin(organization_id));

-- Members: admin manage; coach view all; sparrer register-only incl. medical badge.
create policy member_select on members for select using (
  is_admin(organization_id) or has_mentis_role(organization_id, 'COACH') or
  (has_mentis_role(organization_id, 'SPARRER') and assigned_to_member(members.id)));
create policy member_write on members for all using (is_admin(organization_id));

-- Medical notes (rule 3): admin + assigned coach/sparrer only. Reads are audit-logged app-side.
create policy medical_select on member_medical for select using (
  assigned_to_member(member_id) or exists (
    select 1 from members m where m.id = member_id and is_admin(m.organization_id)));
create policy medical_write on member_medical for all using (exists (
  select 1 from members m where m.id = member_id and is_admin(m.organization_id)));

-- Sessions: admin manages; staff view assigned; coach may edit notes only (trigger-enforced).
create policy session_select on sessions for select using (is_admin(organization_id) or staffed_on(sessions.id));
create policy session_admin_write on sessions for all using (is_admin(organization_id));
create policy session_coach_notes on sessions for update using (
  has_mentis_role(organization_id, 'COACH') and staffed_on(sessions.id));
create policy segment_access on session_segments for select using (session_id in (
  select id from sessions s where is_admin(s.organization_id) or staffed_on(s.id)));
create policy segment_write on session_segments for all using (session_id in (
  select id from sessions s where is_admin(s.organization_id)));

-- Enrollments: admin manages; assigned staff read (drives the register).
create policy enrollment_select on enrollments for select using (session_id in (
  select id from sessions s where is_admin(s.organization_id) or staffed_on(s.id)));
create policy enrollment_write on enrollments for all using (session_id in (
  select id from sessions s where is_admin(s.organization_id)));

-- Attendance: coach marks own sessions; sparrer read-only own sessions; admin all.
create policy attendance_select on attendance_records for select using (session_id in (
  select id from sessions s where is_admin(s.organization_id) or staffed_on(s.id)));
create policy attendance_coach_write on attendance_records for all using (session_id in (
  select id from sessions s where is_admin(s.organization_id) or
    (has_mentis_role(s.organization_id, 'COACH') and staffed_on(s.id))));

-- Sport profiles: admin manages; staff read.
create policy sport_select on sport_profiles for select using (is_staff(organization_id));
create policy sport_write on sport_profiles for all using (is_admin(organization_id));

-- Scheduling core: admin manages; staff read.
create policy holiday_select on holiday_calendar for select using (is_staff(organization_id));
create policy holiday_write on holiday_calendar for all using (is_admin(organization_id));
create policy schedule_select on weekly_schedules for select using (is_staff(organization_id));
create policy schedule_write on weekly_schedules for all using (is_admin(organization_id));
create policy schedstaff_select on schedule_staff for select using (schedule_id in (
  select id from weekly_schedules w where is_staff(w.organization_id)));
create policy schedstaff_write on schedule_staff for all using (schedule_id in (
  select id from weekly_schedules w where is_admin(w.organization_id)));
create policy override_select on schedule_overrides for select using (is_staff(organization_id));
create policy override_write on schedule_overrides for all using (is_admin(organization_id));
create policy staffing_select on session_staffing for select using (session_id in (
  select id from sessions s where is_staff(s.organization_id)));
create policy staffing_write on session_staffing for all using (session_id in (
  select id from sessions s where is_admin(s.organization_id)));

-- Rate cards: admin manages; staff read own (rate flows into timesheet/invoice, rule 20).
create policy rate_select on rate_cards for select using (
  is_admin(organization_id) or staff_id = my_staff_id(organization_id));
create policy rate_write on rate_cards for all using (is_admin(organization_id));

-- Availability (rule 11): self-record; coach/admin on others' behalf; admin all.
create policy availability_select on staff_availability for select using (is_staff(organization_id));
create policy availability_write on staff_availability for all using (
  is_admin(organization_id) or staff_id = my_staff_id(organization_id) or
  has_mentis_role(organization_id, 'COACH'));

-- Tasks: all staff create + view own; admin approves (rule 5: approval is admin-only).
create policy task_select on tasks for select using (
  is_admin(organization_id) or assignee_id = my_staff_id(organization_id) or
  (group_id is not null and in_group(group_id)) or created_by = auth.uid());
create policy task_insert on tasks for insert with check (is_staff(organization_id));
create policy task_admin_write on tasks for update using (is_admin(organization_id));
create policy task_staff_update on tasks for update using (
  assignee_id = my_staff_id(organization_id)) with check (approved_at is null);
create policy task_delete on tasks for delete using (is_admin(organization_id));

-- Timesheet: admin all; staff own + session-staff hours view.
create policy time_select on staff_time_entries for select using (
  is_admin(organization_id) or staff_id = my_staff_id(organization_id) or
  (session_id is not null and staffed_on(session_id)));
create policy time_insert on staff_time_entries for insert with check (
  is_admin(organization_id) or staff_id = my_staff_id(organization_id));
create policy time_admin_update on staff_time_entries for update using (is_admin(organization_id));
create policy time_self_update on staff_time_entries for update using (
  staff_id = my_staff_id(organization_id));
create policy time_delete on staff_time_entries for delete using (is_admin(organization_id));

-- Invoices: admin all; coach drafts/reads own; approval is admin-only (rules 6-7, 23).
create policy invoice_select on invoices for select using (
  is_admin(organization_id) or
  (has_mentis_role(organization_id, 'COACH') and staff_id = my_staff_id(organization_id)));
create policy invoice_admin_write on invoices for all using (is_admin(organization_id));
create policy invoice_coach_draft on invoices for insert with check (
  has_mentis_role(organization_id, 'COACH') and staff_id = my_staff_id(organization_id));
create policy invoice_coach_update on invoices for update using (
  has_mentis_role(organization_id, 'COACH') and staff_id = my_staff_id(organization_id))
  with check (status in ('draft', 'pendingApproval'));
create policy invoiceline_select on invoice_lines for select using (invoice_id in (
  select id from invoices i where is_admin(i.organization_id) or
    (has_mentis_role(i.organization_id, 'COACH') and i.staff_id = my_staff_id(i.organization_id))));
create policy invoiceline_admin_write on invoice_lines for all using (invoice_id in (
  select id from invoices i where is_admin(i.organization_id)));
create policy invoiceline_coach_write on invoice_lines for insert with check (invoice_id in (
  select id from invoices i where has_mentis_role(i.organization_id, 'COACH')
    and i.staff_id = my_staff_id(i.organization_id) and i.status in ('draft', 'pendingApproval')));

-- Customer charges: admin manages; coach views own tasks' charges.
create policy charge_admin on customer_charges for all using (is_admin(organization_id));
create policy charge_coach_select on customer_charges for select using (task_id in (
  select id from tasks t where t.assignee_id = my_staff_id(t.organization_id)));
create policy ledger_admin on billing_ledger for all using (is_admin(organization_id));
create policy ledger_coach_select on billing_ledger for select using (
  staff_id = my_staff_id(organization_id));

-- Actions engine: admin closes any; staff close own; all create manual.
create policy atype_select on action_types for select using (is_staff(organization_id));
create policy atype_write on action_types for all using (is_admin(organization_id));
create policy action_select on pending_actions for select using (
  is_admin(organization_id) or assignee_id = my_staff_id(organization_id));
create policy action_insert on pending_actions for insert with check (is_staff(organization_id));
create policy action_admin_write on pending_actions for update using (is_admin(organization_id));
create policy action_self_close on pending_actions for update using (
  assignee_id = my_staff_id(organization_id));
create policy action_delete on pending_actions for delete using (is_admin(organization_id));

-- Competition: admin + coach manage; sparrer views own members' rows; diary org-level.
create policy event_select on events for select using (is_staff(organization_id));
create policy event_write on events for all using (
  is_admin(organization_id) or has_mentis_role(organization_id, 'COACH'));
create policy subevent_select on sub_events for select using (event_id in (
  select id from events e where is_staff(e.organization_id)));
create policy subevent_write on sub_events for all using (event_id in (
  select id from events e where is_admin(e.organization_id) or has_mentis_role(e.organization_id, 'COACH')));
create policy entry_select on event_entries for select using (event_id in (
  select id from events e where is_admin(e.organization_id) or has_mentis_role(e.organization_id, 'COACH') or
    (has_mentis_role(e.organization_id, 'SPARRER') and assigned_to_member(member_id))));
create policy entry_write on event_entries for all using (event_id in (
  select id from events e where is_admin(e.organization_id) or has_mentis_role(e.organization_id, 'COACH')));
create policy match_select on matches for select using (member_id in (
  select m.id from members m where is_admin(m.organization_id) or has_mentis_role(m.organization_id, 'COACH') or
    (has_mentis_role(m.organization_id, 'SPARRER') and assigned_to_member(m.id))));
create policy match_write on matches for all using (member_id in (
  select m.id from members m where is_admin(m.organization_id) or has_mentis_role(m.organization_id, 'COACH')));
create policy ranking_select on rankings for select using (member_id in (
  select m.id from members m where is_admin(m.organization_id) or has_mentis_role(m.organization_id, 'COACH') or
    (has_mentis_role(m.organization_id, 'SPARRER') and assigned_to_member(m.id))));
create policy ranking_write on rankings for all using (member_id in (
  select m.id from members m where is_admin(m.organization_id) or has_mentis_role(m.organization_id, 'COACH')));
create policy feedback_select on player_feedback for select using (
  is_admin(organization_id) or has_mentis_role(organization_id, 'COACH') or
  (has_mentis_role(organization_id, 'SPARRER') and assigned_to_member(member_id)));
create policy feedback_write on player_feedback for all using (
  is_admin(organization_id) or has_mentis_role(organization_id, 'COACH'));

-- Tasters/prospects: admin manages; coach views own register's.
create policy prospect_select on prospects for select using (
  is_admin(organization_id) or has_mentis_role(organization_id, 'COACH'));
create policy prospect_write on prospects for all using (is_admin(organization_id));

-- Groups: admin manages; staff view own.
create policy group_select on groups for select using (
  is_admin(organization_id) or in_group(groups.id));
create policy group_write on groups for all using (is_admin(organization_id));
create policy groupmember_select on group_members for select using (group_id in (
  select g.id from groups g where is_admin(g.organization_id) or in_group(g.id)));
create policy groupmember_write on group_members for all using (group_id in (
  select g.id from groups g where is_admin(g.organization_id)));

-- Goals: admin/coach manage; sparrer views own members.
create policy goal_select on member_goals for select using (member_id in (
  select m.id from members m where is_admin(m.organization_id) or has_mentis_role(m.organization_id, 'COACH') or
    (has_mentis_role(m.organization_id, 'SPARRER') and assigned_to_member(m.id))));
create policy goal_write on member_goals for all using (member_id in (
  select m.id from members m where is_admin(m.organization_id) or has_mentis_role(m.organization_id, 'COACH')));

-- Comms log: admin reads; edge functions (service role) write.
create policy comms_select on communication_log for select using (is_admin(organization_id));

-- Phase 6: admin manages; coach owns own slots/bookings/reports.
create policy slot_select on booking_slots for select using (
  is_admin(organization_id) or coach_id = my_staff_id(organization_id));
create policy slot_write on booking_slots for all using (is_admin(organization_id));
create policy booking_select on bookings for select using (
  is_admin(organization_id) or slot_id in (
    select s.id from booking_slots s where s.coach_id = my_staff_id(s.organization_id)));
create policy booking_write on bookings for all using (is_admin(organization_id));
create policy report_select on progress_reports for select using (
  is_admin(organization_id) or member_id in (
    select e.member_id from enrollments e join session_staffing ss on ss.session_id = e.session_id
    join mentis_staff ms on ms.id = ss.staff_id where ms.user_id = auth.uid()));
create policy report_write on progress_reports for all using (is_admin(organization_id));

-- Devices: staff manage own; admin all (lost-device revocation, rule 27).
create policy device_self on devices for all using (user_id = auth.uid());
create policy device_admin on devices for all using (exists (
  select 1 from mentis_staff ms where ms.user_id = auth.uid()
    and (ms.roles @> array['SUPER_ADMIN']::mentis_role[] or ms.roles @> array['ADMIN']::mentis_role[])));

-- Audit log: admin reads; writes via triggers/service role only.
create policy audit_select on audit_log for select using (is_admin(organization_id));
