-- Mentis money trail, comms log, Phase-6 mentis_bookings/reports, device mentis_sessions.
create table mentis_billing_ledger (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id),
  item_type text not null check (item_type in ('timeEntry','task')),
  time_entry_id uuid references mentis_staff_time_entries(id), task_id uuid references mentis_tasks(id),
  staff_id uuid not null references mentis_staff(id), invoice_id uuid references mentis_invoices(id),
  status text not null default 'unbilled' check (status in ('unbilled','billed')),
  check ((time_entry_id is not null) <> (task_id is not null))
);
create table mentis_customer_charges (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id),
  task_id uuid not null references mentis_tasks(id), customer_id uuid not null references mentis_customers(id),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pendingApproval'
    check (status in ('pendingApproval','approved','recovered','outstandingDebit')),
  due_date date, approved_by uuid, recovered_at timestamptz, created_at timestamptz not null default now()
);
create table mentis_communication_log (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id),
  kind text not null check (kind in ('invitation','reminder','alert','broadcast','summary','report')),
  template text not null, recipient text not null, group_id uuid references mentis_groups(id),
  sent_at timestamptz not null default now(), scheduled_for timestamptz
);
create table mentis_booking_slots (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id),
  coach_id uuid not null references mentis_staff(id), venue_id uuid not null references mentis_venues(id),
  weekday smallint not null check (weekday between 0 and 6), start_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  fixed_price_cents integer not null check (fixed_price_cents >= 0),
  status text not null default 'open' check (status in ('open','closed'))
);
create table mentis_bookings (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id),
  slot_id uuid not null references mentis_booking_slots(id), member_id uuid not null references mentis_members(id),
  starts_at timestamptz not null, status text not null default 'booked'
    check (status in ('booked','approved','completed','cancelled')),
  task_id uuid references mentis_tasks(id), cancellation_window_hours integer not null default 24
);
create table mentis_progress_reports (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id),
  member_id uuid not null references mentis_members(id) on delete cascade, period text not null,
  status text not null default 'draft' check (status in ('draft','approved','sent')),
  pdf_ref text, approved_by uuid, sent_at timestamptz, unique(member_id, period)
);
create table mentis_devices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  label text not null, revoked boolean not null default false, last_seen timestamptz
);
alter table mentis_tasks add column group_id uuid references mentis_groups(id);
alter table mentis_tasks add column status text not null default 'todo' check (status in ('todo','inProgress','done'));
alter table mentis_tasks add column priority text not null default 'normal' check (priority in ('low','normal','high'));
alter table mentis_tasks add column customer_id uuid references mentis_customers(id);
alter table mentis_tasks add column chargeable_to_customer boolean not null default false;
alter table mentis_tasks add column session_id uuid references mentis_sessions(id);
alter table mentis_tasks add column recurrence text;
alter table mentis_tasks add column created_by uuid;
create index ledger_staff_idx on mentis_billing_ledger(staff_id, status);
create index charges_customer_idx on mentis_customer_charges(customer_id, status);
create index comms_kind_idx on mentis_communication_log(organization_id, kind, sent_at desc);
