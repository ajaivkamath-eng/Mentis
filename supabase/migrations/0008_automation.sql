-- Mentis automation: conflict guards, billing-ledger sync, audit trail,
-- staffing-status view, storage buckets, scheduled jobs.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Rule 17 — venue concurrency blocked at save (half-open overlap: back-to-back OK).
create or replace function guard_venue_concurrency() returns trigger language plpgsql as $$
declare limit_v integer; clash integer;
begin
  select concurrent_session_limit into limit_v from mentis_venues where id = new.venue_id;
  select count(*) into clash from mentis_sessions
    where venue_id = new.venue_id and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000')
      and status <> 'cancelled' and start_at < new.end_at and new.start_at < end_at;
  if clash >= coalesce(limit_v, 1) then
    raise exception 'venue concurrency limit (%) exceeded for this time slot', coalesce(limit_v, 1);
  end if;
  return new;
end $$;
drop trigger if exists sessions_venue_guard on mentis_sessions;
create trigger sessions_venue_guard before insert or update on mentis_sessions
  for each row execute function guard_venue_concurrency();

-- Rule 18 — staff overlap (any capacity) blocked at save; back-to-back allowed.
create or replace function guard_staff_overlap() returns trigger language plpgsql as $$
declare clash integer;
begin
  select count(*) into clash
    from mentis_session_staffing ss join mentis_sessions s on s.id = ss.session_id
    join mentis_sessions n on n.id = new.session_id
    where ss.staff_id = new.staff_id and ss.session_id <> new.session_id
      and s.status <> 'cancelled' and s.start_at < n.end_at and n.start_at < s.end_at;
  if clash > 0 then raise exception 'staff member already has an overlapping session'; end if;
  return new;
end $$;
drop trigger if exists staffing_overlap_guard on mentis_session_staffing;
create trigger staffing_overlap_guard before insert or update on mentis_session_staffing
  for each row execute function guard_staff_overlap();

-- Rule 16 — new/changed mentis_sessions must not fall on a no-session day.
create or replace function guard_holiday_session() returns trigger language plpgsql as $$
begin
  if exists (select 1 from mentis_holiday_calendar
      where organization_id = new.organization_id
        and daterange(starts_on, ends_on, '[]') && daterange(new.start_at::date, new.end_at::date, '[]')) then
    raise exception 'session falls on a holiday / no-session day';
  end if;
  return new;
end $$;
drop trigger if exists sessions_holiday_guard on mentis_sessions;
create trigger sessions_holiday_guard before insert or update on mentis_sessions
  for each row execute function guard_holiday_session();

-- Coach session edits: notes only (venue/times/status are admin-only).
create or replace function guard_coach_session_edit() returns trigger language plpgsql as $$
begin
  if is_admin(new.organization_id) then return new; end if;
  if new.venue_id <> old.venue_id or new.start_at <> old.start_at or new.end_at <> old.end_at
     or new.status <> old.status or new.organization_id <> old.organization_id then
    raise exception 'coaches may only edit session notes';
  end if;
  return new;
end $$;
drop trigger if exists sessions_coach_guard on mentis_sessions;
create trigger sessions_coach_guard before update on mentis_sessions
  for each row execute function guard_coach_session_edit();

-- Rule 6 — no new lines may be added to a locked (approved/paid) invoice.
create or replace function guard_locked_invoice_insert() returns trigger language plpgsql as $$
begin
  if exists (select 1 from mentis_invoices where id = new.invoice_id and status in ('approved', 'paid')) then
    raise exception 'approved invoice is locked';
  end if;
  return new;
end $$;
drop trigger if exists invoice_line_insert_lock on mentis_invoice_lines;
create trigger invoice_line_insert_lock before insert on mentis_invoice_lines
  for each row execute function guard_locked_invoice_insert();

-- Billing ledger sync: invoicing a time entry marks it billed + writes the ledger row.
create or replace function sync_billing_ledger() returns trigger language plpgsql as $$
declare entry record;
begin
  if new.time_entry_id is not null then
    update mentis_staff_time_entries set bill_state = 'billed' where id = new.time_entry_id;
    select * into entry from mentis_staff_time_entries where id = new.time_entry_id;
    insert into mentis_billing_ledger (organization_id, item_type, time_entry_id, staff_id, invoice_id, status)
      values (entry.organization_id, 'timeEntry', new.time_entry_id, entry.staff_id, new.invoice_id, 'billed')
      on conflict do nothing;
  else
    insert into mentis_billing_ledger (organization_id, item_type, task_id, staff_id, invoice_id, status)
      select t.organization_id, 'task', new.task_id, t.assignee_id, new.invoice_id, 'billed'
      from mentis_tasks t where t.id = new.task_id on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists invoice_line_ledger_sync on mentis_invoice_lines;
create trigger invoice_line_ledger_sync after insert on mentis_invoice_lines
  for each row execute function sync_billing_ledger();

-- Mandatory audit trail (§4): role changes, approvals, medical writes, charge/debit moves.
create or replace function audit_write() returns trigger language plpgsql security definer set search_path = public as $$
declare org uuid; act text; eid uuid; nj jsonb; oj jsonb;
begin
  act := TG_ARGV[0];
  nj := to_jsonb(new); oj := to_jsonb(old);
  if TG_TABLE_NAME = 'mentis_member_medical' then
    eid := coalesce((nj->>'member_id')::uuid, (oj->>'member_id')::uuid);
    select organization_id into org from mentis_members m where m.id = eid;
  else
    org := coalesce((nj->>'organization_id')::uuid, (oj->>'organization_id')::uuid);
    eid := coalesce((nj->>'id')::uuid, (oj->>'id')::uuid);
  end if;
  insert into mentis_audit_log (organization_id, actor_id, action, entity, entity_id, metadata)
    values (org, auth.uid(), act, TG_TABLE_NAME, eid,
      jsonb_build_object('op', TG_OP, 'old_roles', oj->'roles', 'new_roles', nj->'roles'));
  if TG_OP = 'DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists audit_staff_roles on mentis_staff;
create trigger audit_staff_roles after update or delete on mentis_staff
  for each row execute function audit_write('role.change');
drop trigger if exists audit_medical_write on mentis_member_medical;
create trigger audit_medical_write after insert or update or delete on mentis_member_medical
  for each row execute function audit_write('medical.write');
drop trigger if exists audit_task_approval on mentis_tasks;
create trigger audit_task_approval after update on mentis_tasks
  for each row when (old.approved_at is distinct from new.approved_at)
  execute function audit_write('task.approval');
drop trigger if exists audit_invoice_approval on mentis_invoices;
create trigger audit_invoice_approval after update on mentis_invoices
  for each row when (old.status is distinct from new.status)
  execute function audit_write('invoice.status');
drop trigger if exists audit_charge_move on mentis_customer_charges;
create trigger audit_charge_move after insert or update on mentis_customer_charges
  for each row execute function audit_write('charge.move');

-- Staffing-status view (rule 9): expected vs declared availability → GREEN/AMBER/RED.
create or replace view session_staffing_status with (security_invoker = true) as
  select s.id as session_id,
    case
      when exists (
        select 1 from mentis_session_staffing ss
        left join mentis_staff_availability a on a.staff_id = ss.staff_id
          and a.available = false and a.starts_at < ss.planned_end and ss.planned_start < a.ends_at
        where ss.session_id = s.id and ss.capacity in ('lead', 'assistant') and a.id is not null)
        then 'RED'
      when exists (
        select 1 from mentis_session_staffing ss
        join mentis_staff_availability a on a.staff_id = ss.staff_id
          and a.available = false and a.starts_at < ss.planned_end and ss.planned_start < a.ends_at
        where ss.session_id = s.id and ss.capacity = 'sparrer')
        then 'AMBER'
      else 'GREEN'
    end as colour
  from mentis_sessions s;

-- Private storage buckets (photos, documents, consents).
insert into storage.buckets (id, name, public) values
  ('photos', 'photos', false), ('documents', 'documents', false), ('consents', 'consents', false)
on conflict (id) do nothing;

-- Schedulers (call Edge Functions; URLs configured per environment via vault secrets).
-- Monthly attendance summary: 1st of month 06:00 UTC. Breach evaluator: every 15 min.
select cron.schedule('mentis-monthly-summary', '0 6 1 * *',
  $$ select net.http_post('https://project.functions.supabase.co/monthly-summary',
    '{}', '{"Content-Type":"application/json"}') $$) where false;
select cron.schedule('mentis-breach-eval', '*/15 * * * *',
  $$ select net.http_post('https://project.functions.supabase.co/breach-eval',
    '{}', '{"Content-Type":"application/json"}') $$) where false;
