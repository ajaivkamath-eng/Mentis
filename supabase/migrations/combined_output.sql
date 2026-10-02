DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0000_reset_public_schema_from_foundation.sql';
END $$;


-- Reset the public schema so the database can be rebuilt from
-- supabase/migrations/0001_foundation.sql.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/samples/reset_public_schema_from_foundation.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_foundation.sql
--
-- This drops everything in public (tables, views, functions, triggers, sequences,
-- constraints, RLS policies, etc.) so the next migration can start cleanly.

BEGIN;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- Dropping the schema also drops Supabase's bootstrap grants and default
-- privileges for the PostgREST roles. Without these every table created by the
-- migrations below is unreachable over the REST API ("permission denied for
-- table ..."), regardless of RLS.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN CONTINUE; END IF;

    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO %I', r);

    -- `anon` is pre-login and has no RLS policies, so it never gets table DML.
    IF r <> 'anon' THEN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON SCHEMA public TO service_role';
  END IF;
END $$;

COMMIT;

-- After this, re-run the foundation migration:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_foundation.sql

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0001_foundation.sql';
END $$;


create extension if not exists pgcrypto;
create type mentis_role as enum ('SUPER_ADMIN','ADMIN','COACH','SPARRER');
create type attendance_status as enum ('present','absent','late','taster');
create table mentis_organizations (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table mentis_staff (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), user_id uuid not null, roles mentis_role[] not null default '{}', display_name text not null, created_at timestamptz not null default now(), unique(organization_id,user_id));
create table mentis_venues (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), name text not null, concurrent_session_limit integer not null default 1 check(concurrent_session_limit > 0));
create table mentis_customers (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), name text not null, phone text, created_at timestamptz not null default now());
create table mentis_members (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), customer_id uuid references mentis_customers(id), name text not null, date_of_birth date not null, nok_name text, nok_phone text, special_needs_flag boolean not null default false, special_needs text, created_at timestamptz not null default now());
create table mentis_sessions (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), venue_id uuid not null references mentis_venues(id), name text not null, start_at timestamptz not null, end_at timestamptz not null, check(end_at > start_at));
create table mentis_enrollments (id uuid primary key default gen_random_uuid(), session_id uuid not null references mentis_sessions(id) on delete cascade, member_id uuid not null references mentis_members(id), status text not null default 'active', expected boolean not null default true, unique(session_id,member_id));
create table mentis_attendance_records (id uuid primary key default gen_random_uuid(), session_id uuid not null references mentis_sessions(id) on delete cascade, member_id uuid references mentis_members(id), taster_name text, status attendance_status not null, recorded_by uuid not null, recorded_at timestamptz not null default now(), offline boolean not null default false, check ((member_id is not null) <> (taster_name is not null)));
create table mentis_audit_log (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), actor_id uuid, action text not null, entity text not null, entity_id uuid, field text, created_at timestamptz not null default now(), metadata jsonb not null default '{}');

create or replace function current_staff_roles(org uuid) returns mentis_role[] language sql stable security definer set search_path=public as $$ select coalesce(roles,'{}') from mentis_staff where organization_id=org and user_id=auth.uid() $$;
create or replace function has_mentis_role(org uuid, wanted mentis_role) returns boolean language sql stable security definer set search_path=public as $$ select wanted = any(current_staff_roles(org)) $$;

alter table mentis_organizations enable row level security; alter table mentis_staff enable row level security; alter table mentis_venues enable row level security; alter table mentis_customers enable row level security; alter table mentis_members enable row level security; alter table mentis_sessions enable row level security; alter table mentis_enrollments enable row level security; alter table mentis_attendance_records enable row level security; alter table mentis_audit_log enable row level security;
create policy org_staff_access on mentis_organizations for select using (id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy staff_manage on mentis_staff for all using (has_mentis_role(organization_id,'SUPER_ADMIN') or has_mentis_role(organization_id,'ADMIN'));
create policy staff_self_read on mentis_staff for select using (user_id=auth.uid());
create policy venue_access on mentis_venues for all using (has_mentis_role(organization_id,'SUPER_ADMIN') or has_mentis_role(organization_id,'ADMIN') or organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy customer_access on mentis_customers for select using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy member_access on mentis_members for select using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy member_admin_write on mentis_members for all using (has_mentis_role(organization_id,'SUPER_ADMIN') or has_mentis_role(organization_id,'ADMIN'));
create policy session_access on mentis_sessions for all using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy enrollment_access on mentis_enrollments for all using (session_id in (select id from mentis_sessions where organization_id in (select organization_id from mentis_staff where user_id=auth.uid())));
create policy attendance_access on mentis_attendance_records for all using (session_id in (select id from mentis_sessions where organization_id in (select organization_id from mentis_staff where user_id=auth.uid())));
create policy audit_admin_read on mentis_audit_log for select using (has_mentis_role(organization_id,'SUPER_ADMIN') or has_mentis_role(organization_id,'ADMIN'));

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0002_scheduling_billing.sql';
END $$;


-- Mentis foundation: scheduling, staffing and auditable billing
create type session_status as enum ('scheduled','cancelled','postponed','completed');
create type holiday_kind as enum ('term_break','bank_holiday','manual');
create type staff_availability_type as enum ('available','on_duty','vacation','duty_outside_club','unavailable_other');
create type time_entry_kind as enum ('planned','actual','standby');
create type invoice_status as enum ('draft','pendingApproval','approved','paid');
create type action_status as enum ('open','breached','closed');

alter table mentis_sessions add column status session_status not null default 'scheduled';
alter table mentis_sessions add column schedule_id uuid;
create table mentis_holiday_calendar (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), name text not null, kind holiday_kind not null, starts_on date not null, ends_on date not null, check(ends_on >= starts_on));
create table mentis_weekly_schedules (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), venue_id uuid not null references mentis_venues(id), name text not null, day_of_week smallint not null check(day_of_week between 0 and 6), valid_from date not null, valid_to date not null, start_time time not null, end_time time not null, check(valid_to >= valid_from), check(end_time > start_time));
create table mentis_rate_cards (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), staff_id uuid not null references mentis_staff(id), label text not null, rate_cents integer not null check(rate_cents >= 0), valid_from date not null, valid_to date, check(valid_to is null or valid_to >= valid_from));
create table mentis_schedule_staff (schedule_id uuid not null references mentis_weekly_schedules(id) on delete cascade, staff_id uuid not null references mentis_staff(id), capacity text not null check(capacity in ('lead','assistant','sparrer')), rate_card_id uuid not null references mentis_rate_cards(id), primary key(schedule_id,staff_id,capacity));
create table mentis_schedule_overrides (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), schedule_id uuid references mentis_weekly_schedules(id), session_id uuid references mentis_sessions(id), starts_at timestamptz not null, ends_at timestamptz not null, venue_id uuid references mentis_venues(id), original_values jsonb not null default '{}', override_values jsonb not null, created_by uuid not null, created_at timestamptz not null default now(), check(ends_at > starts_at), check(schedule_id is not null or session_id is not null));
create table mentis_session_staffing (id uuid primary key default gen_random_uuid(), session_id uuid not null references mentis_sessions(id) on delete cascade, staff_id uuid not null references mentis_staff(id), capacity text not null check(capacity in ('lead','assistant','sparrer')), rate_card_id uuid not null references mentis_rate_cards(id), planned_start timestamptz not null, planned_end timestamptz not null, unique(session_id,staff_id,capacity,planned_start), check(planned_end > planned_start));
create table mentis_staff_availability (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), staff_id uuid not null references mentis_staff(id), starts_at timestamptz not null, ends_at timestamptz not null, available boolean not null, availability_type staff_availability_type not null default 'unavailable_other', reason text, recorded_by uuid not null, recorded_at timestamptz not null default now(), check(ends_at > starts_at));
create table mentis_tasks (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), title text not null, task_type text not null, assignee_id uuid references mentis_staff(id), amount_cents integer check(amount_cents >= 0), approved_at timestamptz, approved_by uuid, work_hours numeric(8,2), due_at timestamptz);
create table mentis_staff_time_entries (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), staff_id uuid not null references mentis_staff(id), session_id uuid references mentis_sessions(id), task_id uuid references mentis_tasks(id), kind time_entry_kind not null, starts_at timestamptz not null, ends_at timestamptz not null, hours numeric(8,2) generated always as (extract(epoch from (ends_at-starts_at))/3600) stored, rate_cents integer not null check(rate_cents >= 0), bill_state text not null default 'unbilled' check(bill_state in ('unbilled','billed')), pending_review boolean not null default false, created_at timestamptz not null default now(), check(ends_at > starts_at), check((session_id is not null) <> (task_id is not null)));
create table mentis_invoices (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), staff_id uuid not null references mentis_staff(id), period_start timestamptz not null, period_end timestamptz not null, status invoice_status not null default 'draft', created_by uuid not null, approved_by uuid, approved_at timestamptz, paid_at timestamptz, payment_reference text, unique(staff_id,period_start,period_end), check(period_end > period_start));
create table mentis_invoice_lines (id uuid primary key default gen_random_uuid(), invoice_id uuid not null references mentis_invoices(id) on delete cascade, time_entry_id uuid unique references mentis_staff_time_entries(id), task_id uuid references mentis_tasks(id), hours numeric(8,2) not null, rate_cents integer not null, amount_cents integer generated always as (round(hours * rate_cents)) stored, check((time_entry_id is not null) <> (task_id is not null)));
create table mentis_action_types (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), name text not null, trigger text not null check(trigger in ('event','activity','manual')), due_offset interval, breach_offset interval, unique(organization_id,name));
create table mentis_pending_actions (id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id), action_type_id uuid not null references mentis_action_types(id), title text not null, assignee_id uuid references mentis_staff(id), linked_entity_type text, linked_entity_id uuid, due_at timestamptz not null, breach_at timestamptz, status action_status not null default 'open');

create index sessions_schedule_idx on mentis_sessions(schedule_id); create index time_entries_staff_date_idx on mentis_staff_time_entries(staff_id,starts_at); create index actions_queue_idx on mentis_pending_actions(organization_id,status,due_at);

-- Prevent changing or deleting approved mentis_invoices and their lines.
create or replace function prevent_locked_invoice_change() returns trigger language plpgsql as $$
begin if exists(select 1 from mentis_invoices where id=case when TG_TABLE_NAME = 'mentis_invoice_lines' then old.invoice_id else old.id end and status in ('approved','paid')) then raise exception '%: approved invoice is locked', '0002_scheduling_billing.sql'; end if; if TG_OP = 'DELETE' then return old; else return new; end if; end $$;
create trigger invoice_lock before update or delete on mentis_invoices for each row execute function prevent_locked_invoice_change();
create trigger invoice_line_lock before update or delete on mentis_invoice_lines for each row execute function prevent_locked_invoice_change();

-- Organization-scoped RLS helper policies. The base migration's role helper remains the security floor.
do $$ declare t text; begin foreach t in array array['mentis_holiday_calendar','mentis_weekly_schedules','mentis_rate_cards','mentis_schedule_staff','mentis_schedule_overrides','mentis_session_staffing','mentis_staff_availability','mentis_tasks','mentis_staff_time_entries','mentis_invoices','mentis_invoice_lines','mentis_action_types','mentis_pending_actions'] loop execute format('alter table %I enable row level security',t); end loop; end $$;
create policy holiday_access on mentis_holiday_calendar for all using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy schedule_access on mentis_weekly_schedules for all using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy rate_access on mentis_rate_cards for all using (has_mentis_role(organization_id,'SUPER_ADMIN') or has_mentis_role(organization_id,'ADMIN'));
create policy schedule_staff_access on mentis_schedule_staff for all using (schedule_id in (select id from mentis_weekly_schedules where organization_id in (select organization_id from mentis_staff where user_id=auth.uid())));
create policy override_access on mentis_schedule_overrides for all using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy staffing_access on mentis_session_staffing for all using (session_id in (select id from mentis_sessions where organization_id in (select organization_id from mentis_staff where user_id=auth.uid())));
create policy availability_access on mentis_staff_availability for all using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy task_access on mentis_tasks for all using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy time_entry_access on mentis_staff_time_entries for all using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy invoice_access on mentis_invoices for all using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy invoice_line_access on mentis_invoice_lines for all using (invoice_id in (select id from mentis_invoices where organization_id in (select organization_id from mentis_staff where user_id=auth.uid())));
create policy action_type_access on mentis_action_types for all using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy action_access on mentis_pending_actions for all using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0003_entities.sql';
END $$;


-- Mentis entities: sport profiles, member extensions, tasters, mentis_groups, segments, goals.
-- Medical notes move to a dedicated table so RLS can gate them strictly (rule 3).
create table mentis_sport_profiles (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id),
  name text not null, rank_system jsonb not null default '{}', feedback_attributes jsonb not null default '{}',
  playing_styles jsonb not null default '[]', preset_chips jsonb not null default '[]',
  equipment_guide text, session_templates jsonb not null default '[]', group_templates jsonb not null default '[]',
  unique(organization_id, name)
);
alter table mentis_members add column tte_number text unique;
alter table mentis_members add column handedness text check (handedness in ('L','R'));
alter table mentis_members add column playing_style text;
alter table mentis_members add column equipment_notes text;
alter table mentis_members add column photo_ref text;
alter table mentis_members add column sports jsonb not null default '[]';
alter table mentis_members add column erased_at timestamptz;
alter table mentis_venues add column address text;
alter table mentis_venues add column phone text;
alter table mentis_venues add column working_hours text;
alter table mentis_venues add column capacity integer;
alter table mentis_venues add column notes text;
alter table mentis_members drop column special_needs;
create table mentis_member_medical (
  member_id uuid primary key references mentis_members(id) on delete cascade,
  notes text not null, updated_by uuid, updated_at timestamptz not null default now()
);
alter table mentis_customers add column email text;
alter table mentis_customers add column guardian_a text;
alter table mentis_customers add column guardian_b text;
alter table mentis_customers add column nok_name text;
alter table mentis_customers add column nok_phone text;
alter table mentis_customers add column consents jsonb not null default '[]';
alter table mentis_customers add column is_also_member_id uuid references mentis_members(id);
alter table mentis_enrollments add column pause_reason text;
alter table mentis_enrollments add column auto_resume_date date;
alter table mentis_enrollments add column position integer;
alter table mentis_enrollments drop constraint if exists enrollments_status_check;
alter table mentis_enrollments add constraint enrollments_status_check
  check (status in ('invited','active','paused','waitlisted','completed'));
alter table mentis_sessions add column level_band text;
alter table mentis_sessions add column capacity integer;
alter table mentis_sessions add column notes text;
alter table mentis_sessions add column cancel_reason text;
create table mentis_session_segments (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references mentis_sessions(id) on delete cascade,
  name text not null, position integer not null default 0
);
create table mentis_prospects (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id),
  name text not null, age integer check (age >= 0), contact text, consent boolean not null default false,
  preferred_session_id uuid references mentis_sessions(id), status text not null default 'requested'
    check (status in ('requested','approved','attended','converted','closed')),
  approved_session_ids uuid[] not null default '{}', created_at timestamptz not null default now()
);
create table mentis_groups (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id),
  venue_id uuid references mentis_venues(id), name text not null
);
create table mentis_group_members (
  group_id uuid not null references mentis_groups(id) on delete cascade, member_id uuid references mentis_members(id) on delete cascade,
  staff_id uuid references mentis_staff(id) on delete cascade,
  check ((member_id is not null) <> (staff_id is not null))
);
create table mentis_member_goals (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references mentis_members(id) on delete cascade,
  description text not null, goal_type text not null default 'free' check (goal_type in ('free','rank','competition')),
  target_date date, status text not null default 'inProgress' check (status in ('inProgress','achieved','missed'))
);
create index members_tte_idx on mentis_members(tte_number);
create index prospects_status_idx on mentis_prospects(organization_id, status);
create index goals_member_idx on mentis_member_goals(member_id, status);

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0004_competition.sql';
END $$;


-- Mentis competition: org-level diary (rule 14), entries, mentis_matches, mentis_rankings, feedback.
create table mentis_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id),
  name text not null, sport_id uuid references mentis_sport_profiles(id),
  starts_on date not null, ends_on date not null, location text, entry_deadline date,
  source text not null default 'manual' check (source in ('tte','ittf_wtt','club','local','manual')),
  external_ref text, status text not null default 'published'
    check (status in ('draft','published','completed','cancelled')),
  check (ends_on >= starts_on)
);
create table mentis_sub_events (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references mentis_events(id) on delete cascade,
  name text not null, age_band text, rank_band text
);
create table mentis_event_entries (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references mentis_events(id) on delete cascade,
  member_id uuid not null references mentis_members(id) on delete cascade, sub_event_id uuid references mentis_sub_events(id),
  status text not null default 'interested'
    check (status in ('suggested','interested','available','confirmed','notAvailable','entered','completed')),
  suggested_by uuid, guardian_confirmed boolean not null default false,
  unique(event_id, member_id, sub_event_id)
);
create table mentis_matches (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references mentis_members(id) on delete cascade,
  played_on date not null, event_id uuid references mentis_events(id), sub_event_id uuid references mentis_sub_events(id),
  session_id uuid references mentis_sessions(id), opponent text not null,
  games_for integer[] not null default '{}', games_against integer[] not null default '{}',
  result text not null check (result in ('W','L','D')),
  source text not null default 'manual' check (source in ('tte','ittf_wtt','club','local','manual')),
  source_ref text,
  check (event_id is not null or sub_event_id is not null or session_id is not null),
  check (cardinality(games_for) = cardinality(games_against))
);
create table mentis_rankings (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references mentis_members(id) on delete cascade,
  platform text not null, rank_value integer not null, as_of date not null, source_ref text,
  unique(member_id, platform, as_of)
);
create table mentis_player_feedback (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references mentis_organizations(id),
  member_id uuid not null references mentis_members(id) on delete cascade, coach_id uuid not null references mentis_staff(id),
  body text not null default '', source_type text not null check (source_type in ('session','event')),
  session_id uuid references mentis_sessions(id), event_id uuid references mentis_events(id),
  sub_source_kind text check (sub_source_kind in ('segment','subEvent','match')),
  sub_source_id uuid, ratings jsonb not null default '{}',
  performed_with_staff uuid[] not null default '{}', performed_with_players uuid[] not null default '{}',
  tags text[] not null default '{}', created_at timestamptz not null default now(),
  check ((source_type = 'session' and session_id is not null) or (source_type = 'event' and event_id is not null))
);
create index events_org_date_idx on mentis_events(organization_id, starts_on);
create index entries_member_idx on mentis_event_entries(member_id, status);
create index matches_member_idx on mentis_matches(member_id, played_on desc);
create index rankings_member_idx on mentis_rankings(member_id, platform, as_of desc);
create index feedback_member_idx on mentis_player_feedback(member_id, created_at desc);

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0005_money_comms.sql';
END $$;


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

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0006_rls_matrix.sql';
END $$;


-- Mentis RLS matrix: per-entity × role × command (§4, rule 15/25).
-- Security floor = UNION of the user's roles; the role switcher only narrows the UI.
-- Drop the broad bootstrap policies first.
drop policy if exists org_staff_access on mentis_organizations;
drop policy if exists staff_manage on mentis_staff;
drop policy if exists staff_self_read on mentis_staff;
drop policy if exists venue_access on mentis_venues;
drop policy if exists customer_access on mentis_customers;
drop policy if exists member_access on mentis_members;
drop policy if exists member_admin_write on mentis_members;
drop policy if exists session_access on mentis_sessions;
drop policy if exists enrollment_access on mentis_enrollments;
drop policy if exists attendance_access on mentis_attendance_records;
drop policy if exists audit_admin_read on mentis_audit_log;
drop policy if exists holiday_access on mentis_holiday_calendar;
drop policy if exists schedule_access on mentis_weekly_schedules;
drop policy if exists rate_access on mentis_rate_cards;
drop policy if exists schedule_staff_access on mentis_schedule_staff;
drop policy if exists override_access on mentis_schedule_overrides;
drop policy if exists staffing_access on mentis_session_staffing;
drop policy if exists availability_access on mentis_staff_availability;
drop policy if exists task_access on mentis_tasks;
drop policy if exists time_entry_access on mentis_staff_time_entries;
drop policy if exists invoice_access on mentis_invoices;
drop policy if exists invoice_line_access on mentis_invoice_lines;
drop policy if exists action_type_access on mentis_action_types;
drop policy if exists action_access on mentis_pending_actions;

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
$$ select exists (select 1 from mentis_session_staffing ss join mentis_staff ms on ms.id = ss.staff_id
    where ss.session_id = session and ms.user_id = auth.uid()) $$;
create or replace function assigned_to_member(member uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from mentis_enrollments e join mentis_session_staffing ss on ss.session_id = e.session_id
    join mentis_staff ms on ms.id = ss.staff_id
    where e.member_id = member and ms.user_id = auth.uid()) $$;
create or replace function in_group(g uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from mentis_group_members gm join mentis_staff ms on ms.id = gm.staff_id
    where gm.group_id = g and ms.user_id = auth.uid()) $$;

-- Enable RLS on the new tables.
do $$ declare t text; begin
  foreach t in array array['mentis_sport_profiles','mentis_member_medical','mentis_session_segments','mentis_prospects','mentis_groups','mentis_group_members',
    'mentis_member_goals','mentis_events','mentis_sub_events','mentis_event_entries','mentis_matches','mentis_rankings','mentis_player_feedback','mentis_billing_ledger',
    'mentis_customer_charges','mentis_communication_log','mentis_booking_slots','mentis_bookings','mentis_progress_reports','mentis_devices']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- Organizations & staff: super-admin manages; staff read own org.
create policy org_select on mentis_organizations for select using (is_staff(id));
create policy org_super_write on mentis_organizations for all using (is_superadmin(id));
create policy staff_select on mentis_staff for select using (is_staff(organization_id));
create policy staff_super_write on mentis_staff for all using (is_superadmin(organization_id));

-- Venues: admin manages; staff view.
create policy venue_select on mentis_venues for select using (is_staff(organization_id));
create policy venue_write on mentis_venues for all using (is_admin(organization_id));

-- Customers: admin/coach full view; sparrer register-only (own mentis_sessions' mentis_members).
create policy customer_select on mentis_customers for select using (
  is_admin(organization_id) or has_mentis_role(organization_id, 'COACH') or
  (has_mentis_role(organization_id, 'SPARRER') and exists (
    select 1 from mentis_members m where m.customer_id = mentis_customers.id and assigned_to_member(m.id))));
create policy customer_write on mentis_customers for all using (is_admin(organization_id));

-- Members: admin manage; coach view all; sparrer register-only incl. medical badge.
create policy member_select on mentis_members for select using (
  is_admin(organization_id) or has_mentis_role(organization_id, 'COACH') or
  (has_mentis_role(organization_id, 'SPARRER') and assigned_to_member(mentis_members.id)));
create policy member_write on mentis_members for all using (is_admin(organization_id));

-- Medical notes (rule 3): admin + assigned coach/sparrer only. Reads are audit-logged app-side.
create policy medical_select on mentis_member_medical for select using (
  assigned_to_member(member_id) or exists (
    select 1 from mentis_members m where m.id = member_id and is_admin(m.organization_id)));
create policy medical_write on mentis_member_medical for all using (exists (
  select 1 from mentis_members m where m.id = member_id and is_admin(m.organization_id)));

-- Sessions: admin manages; staff view assigned; coach may edit notes only (trigger-enforced).
create policy session_select on mentis_sessions for select using (is_admin(organization_id) or staffed_on(mentis_sessions.id));
create policy session_admin_write on mentis_sessions for all using (is_admin(organization_id));
create policy session_coach_notes on mentis_sessions for update using (
  has_mentis_role(organization_id, 'COACH') and staffed_on(mentis_sessions.id));
create policy segment_access on mentis_session_segments for select using (session_id in (
  select id from mentis_sessions s where is_admin(s.organization_id) or staffed_on(s.id)));
create policy segment_write on mentis_session_segments for all using (session_id in (
  select id from mentis_sessions s where is_admin(s.organization_id)));

-- Enrollments: admin manages; assigned staff read (drives the register).
create policy enrollment_select on mentis_enrollments for select using (session_id in (
  select id from mentis_sessions s where is_admin(s.organization_id) or staffed_on(s.id)));
create policy enrollment_write on mentis_enrollments for all using (session_id in (
  select id from mentis_sessions s where is_admin(s.organization_id)));

-- Attendance: coach marks own mentis_sessions; sparrer read-only own mentis_sessions; admin all.
create policy attendance_select on mentis_attendance_records for select using (session_id in (
  select id from mentis_sessions s where is_admin(s.organization_id) or staffed_on(s.id)));
create policy attendance_coach_write on mentis_attendance_records for all using (session_id in (
  select id from mentis_sessions s where is_admin(s.organization_id) or
    (has_mentis_role(s.organization_id, 'COACH') and staffed_on(s.id))));

-- Sport profiles: admin manages; staff read.
create policy sport_select on mentis_sport_profiles for select using (is_staff(organization_id));
create policy sport_write on mentis_sport_profiles for all using (is_admin(organization_id));

-- Scheduling core: admin manages; staff read.
create policy holiday_select on mentis_holiday_calendar for select using (is_staff(organization_id));
create policy holiday_write on mentis_holiday_calendar for all using (is_admin(organization_id));
create policy schedule_select on mentis_weekly_schedules for select using (is_staff(organization_id));
create policy schedule_write on mentis_weekly_schedules for all using (is_admin(organization_id));
create policy schedstaff_select on mentis_schedule_staff for select using (schedule_id in (
  select id from mentis_weekly_schedules w where is_staff(w.organization_id)));
create policy schedstaff_write on mentis_schedule_staff for all using (schedule_id in (
  select id from mentis_weekly_schedules w where is_admin(w.organization_id)));
create policy override_select on mentis_schedule_overrides for select using (is_staff(organization_id));
create policy override_write on mentis_schedule_overrides for all using (is_admin(organization_id));
create policy staffing_select on mentis_session_staffing for select using (session_id in (
  select id from mentis_sessions s where is_staff(s.organization_id)));
create policy staffing_write on mentis_session_staffing for all using (session_id in (
  select id from mentis_sessions s where is_admin(s.organization_id)));

-- Rate cards: admin manages; staff read own (rate flows into timesheet/invoice, rule 20).
create policy rate_select on mentis_rate_cards for select using (
  is_admin(organization_id) or staff_id = my_staff_id(organization_id));
create policy rate_write on mentis_rate_cards for all using (is_admin(organization_id));

-- Availability (rule 11): self-record; coach/admin on others' behalf; admin all.
create policy availability_select on mentis_staff_availability for select using (is_staff(organization_id));
create policy availability_write on mentis_staff_availability for all using (
  is_admin(organization_id) or staff_id = my_staff_id(organization_id) or
  has_mentis_role(organization_id, 'COACH'));

-- Tasks: all staff create + view own; admin approves (rule 5: approval is admin-only).
create policy task_select on mentis_tasks for select using (
  is_admin(organization_id) or assignee_id = my_staff_id(organization_id) or
  (group_id is not null and in_group(group_id)) or created_by = auth.uid());
create policy task_insert on mentis_tasks for insert with check (is_staff(organization_id));
create policy task_admin_write on mentis_tasks for update using (is_admin(organization_id));
create policy task_staff_update on mentis_tasks for update using (
  assignee_id = my_staff_id(organization_id)) with check (approved_at is null);
create policy task_delete on mentis_tasks for delete using (is_admin(organization_id));

-- Timesheet: admin all; staff own + session-staff hours view.
create policy time_select on mentis_staff_time_entries for select using (
  is_admin(organization_id) or staff_id = my_staff_id(organization_id) or
  (session_id is not null and staffed_on(session_id)));
create policy time_insert on mentis_staff_time_entries for insert with check (
  is_admin(organization_id) or staff_id = my_staff_id(organization_id));
create policy time_admin_update on mentis_staff_time_entries for update using (is_admin(organization_id));
create policy time_self_update on mentis_staff_time_entries for update using (
  staff_id = my_staff_id(organization_id));
create policy time_delete on mentis_staff_time_entries for delete using (is_admin(organization_id));

-- Invoices: admin all; coach drafts/reads own; approval is admin-only (rules 6-7, 23).
create policy invoice_select on mentis_invoices for select using (
  is_admin(organization_id) or
  (has_mentis_role(organization_id, 'COACH') and staff_id = my_staff_id(organization_id)));
create policy invoice_admin_write on mentis_invoices for all using (is_admin(organization_id));
create policy invoice_coach_draft on mentis_invoices for insert with check (
  has_mentis_role(organization_id, 'COACH') and staff_id = my_staff_id(organization_id));
create policy invoice_coach_update on mentis_invoices for update using (
  has_mentis_role(organization_id, 'COACH') and staff_id = my_staff_id(organization_id))
  with check (status in ('draft', 'pendingApproval'));
create policy invoiceline_select on mentis_invoice_lines for select using (invoice_id in (
  select id from mentis_invoices i where is_admin(i.organization_id) or
    (has_mentis_role(i.organization_id, 'COACH') and i.staff_id = my_staff_id(i.organization_id))));
create policy invoiceline_admin_write on mentis_invoice_lines for all using (invoice_id in (
  select id from mentis_invoices i where is_admin(i.organization_id)));
create policy invoiceline_coach_write on mentis_invoice_lines for insert with check (invoice_id in (
  select id from mentis_invoices i where has_mentis_role(i.organization_id, 'COACH')
    and i.staff_id = my_staff_id(i.organization_id) and i.status in ('draft', 'pendingApproval')));

-- Customer charges: admin manages; coach views own mentis_tasks' charges.
create policy charge_admin on mentis_customer_charges for all using (is_admin(organization_id));
create policy charge_coach_select on mentis_customer_charges for select using (task_id in (
  select id from mentis_tasks t where t.assignee_id = my_staff_id(t.organization_id)));
create policy ledger_admin on mentis_billing_ledger for all using (is_admin(organization_id));
create policy ledger_coach_select on mentis_billing_ledger for select using (
  staff_id = my_staff_id(organization_id));

-- Actions engine: admin closes any; staff close own; all create manual.
create policy atype_select on mentis_action_types for select using (is_staff(organization_id));
create policy atype_write on mentis_action_types for all using (is_admin(organization_id));
create policy action_select on mentis_pending_actions for select using (
  is_admin(organization_id) or assignee_id = my_staff_id(organization_id));
create policy action_insert on mentis_pending_actions for insert with check (is_staff(organization_id));
create policy action_admin_write on mentis_pending_actions for update using (is_admin(organization_id));
create policy action_self_close on mentis_pending_actions for update using (
  assignee_id = my_staff_id(organization_id));
create policy action_delete on mentis_pending_actions for delete using (is_admin(organization_id));

-- Competition: admin + coach manage; sparrer views own mentis_members' rows; diary org-level.
create policy event_select on mentis_events for select using (is_staff(organization_id));
create policy event_write on mentis_events for all using (
  is_admin(organization_id) or has_mentis_role(organization_id, 'COACH'));
create policy subevent_select on mentis_sub_events for select using (event_id in (
  select id from mentis_events e where is_staff(e.organization_id)));
create policy subevent_write on mentis_sub_events for all using (event_id in (
  select id from mentis_events e where is_admin(e.organization_id) or has_mentis_role(e.organization_id, 'COACH')));
create policy entry_select on mentis_event_entries for select using (event_id in (
  select id from mentis_events e where is_admin(e.organization_id) or has_mentis_role(e.organization_id, 'COACH') or
    (has_mentis_role(e.organization_id, 'SPARRER') and assigned_to_member(member_id))));
create policy entry_write on mentis_event_entries for all using (event_id in (
  select id from mentis_events e where is_admin(e.organization_id) or has_mentis_role(e.organization_id, 'COACH')));
create policy match_select on mentis_matches for select using (member_id in (
  select m.id from mentis_members m where is_admin(m.organization_id) or has_mentis_role(m.organization_id, 'COACH') or
    (has_mentis_role(m.organization_id, 'SPARRER') and assigned_to_member(m.id))));
create policy match_write on mentis_matches for all using (member_id in (
  select m.id from mentis_members m where is_admin(m.organization_id) or has_mentis_role(m.organization_id, 'COACH')));
create policy ranking_select on mentis_rankings for select using (member_id in (
  select m.id from mentis_members m where is_admin(m.organization_id) or has_mentis_role(m.organization_id, 'COACH') or
    (has_mentis_role(m.organization_id, 'SPARRER') and assigned_to_member(m.id))));
create policy ranking_write on mentis_rankings for all using (member_id in (
  select m.id from mentis_members m where is_admin(m.organization_id) or has_mentis_role(m.organization_id, 'COACH')));
create policy feedback_select on mentis_player_feedback for select using (
  is_admin(organization_id) or has_mentis_role(organization_id, 'COACH') or
  (has_mentis_role(organization_id, 'SPARRER') and assigned_to_member(member_id)));
create policy feedback_write on mentis_player_feedback for all using (
  is_admin(organization_id) or has_mentis_role(organization_id, 'COACH'));

-- Tasters/mentis_prospects: admin manages; coach views own register's.
create policy prospect_select on mentis_prospects for select using (
  is_admin(organization_id) or has_mentis_role(organization_id, 'COACH'));
create policy prospect_write on mentis_prospects for all using (is_admin(organization_id));

-- Groups: admin manages; staff view own.
create policy group_select on mentis_groups for select using (
  is_admin(organization_id) or in_group(mentis_groups.id));
create policy group_write on mentis_groups for all using (is_admin(organization_id));
create policy groupmember_select on mentis_group_members for select using (group_id in (
  select g.id from mentis_groups g where is_admin(g.organization_id) or in_group(g.id)));
create policy groupmember_write on mentis_group_members for all using (group_id in (
  select g.id from mentis_groups g where is_admin(g.organization_id)));

-- Goals: admin/coach manage; sparrer views own mentis_members.
create policy goal_select on mentis_member_goals for select using (member_id in (
  select m.id from mentis_members m where is_admin(m.organization_id) or has_mentis_role(m.organization_id, 'COACH') or
    (has_mentis_role(m.organization_id, 'SPARRER') and assigned_to_member(m.id))));
create policy goal_write on mentis_member_goals for all using (member_id in (
  select m.id from mentis_members m where is_admin(m.organization_id) or has_mentis_role(m.organization_id, 'COACH')));

-- Comms log: admin reads; edge functions (service role) write.
create policy comms_select on mentis_communication_log for select using (is_admin(organization_id));

-- Phase 6: admin manages; coach owns own slots/mentis_bookings/reports.
create policy slot_select on mentis_booking_slots for select using (
  is_admin(organization_id) or coach_id = my_staff_id(organization_id));
create policy slot_write on mentis_booking_slots for all using (is_admin(organization_id));
create policy booking_select on mentis_bookings for select using (
  is_admin(organization_id) or slot_id in (
    select s.id from mentis_booking_slots s where s.coach_id = my_staff_id(s.organization_id)));
create policy booking_write on mentis_bookings for all using (is_admin(organization_id));
create policy report_select on mentis_progress_reports for select using (
  is_admin(organization_id) or member_id in (
    select e.member_id from mentis_enrollments e join mentis_session_staffing ss on ss.session_id = e.session_id
    join mentis_staff ms on ms.id = ss.staff_id where ms.user_id = auth.uid()));
create policy report_write on mentis_progress_reports for all using (is_admin(organization_id));

-- Devices: staff manage own; admin all (lost-device revocation, rule 27).
create policy device_self on mentis_devices for all using (user_id = auth.uid());
create policy device_admin on mentis_devices for all using (exists (
  select 1 from mentis_staff ms where ms.user_id = auth.uid()
    and (ms.roles @> array['SUPER_ADMIN']::mentis_role[] or ms.roles @> array['ADMIN']::mentis_role[])));

-- Audit log: admin reads; writes via triggers/service role only.
create policy audit_select on mentis_audit_log for select using (is_admin(organization_id));

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0007_seeds.sql';
END $$;


-- Mentis staging seeds: Kingfisher TTC (2 mentis_venues), table-tennis profile,
-- action types, UK bank holidays. Demo users are created in Rally (shared
-- auth); link them via mentis_staff rows — see supabase/seed_staff.sql.
insert into mentis_organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Kingfisher Table Tennis Club')
on conflict (id) do nothing;

insert into mentis_venues (organization_id, name, address, concurrent_session_limit)
select v.organization_id, v.name, v.address, v.concurrent_session_limit
from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Kingfisher Table Tennis Club', '2 Woodlands Ave, Woodley, Reading RG5 3EU', 1),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Reading School', 'Erleigh Road, Reading, Berkshire, RG1 5LW', 1)
) as v(organization_id, name, address, concurrent_session_limit)
where not exists (
  select 1 from mentis_venues x
  where x.organization_id = v.organization_id and x.name = v.name);

insert into mentis_sport_profiles (organization_id, name, rank_system, feedback_attributes, playing_styles, equipment_guide, session_templates, group_templates) values
  ('00000000-0000-0000-0000-000000000001', 'Table Tennis',
   '{"type":"band","levels":["Beginner","Foundation","Intermediate","Advanced","Elite"]}',
   '{"skill":["forehand","backhand","serve","footwork","receiving"],"focus":["concentration","composure under pressure"],"behaviour":["discipline","sportsmanship","coachability","communication/team attitude"],"progression":["improvement vs previous","consistency","response to training","goal achievement"]}',
   '["Attacker","All-round","Defender/Chopper","Pips-out hitter","Left-hand looper","Custom"]',
   'Welcome to Kingfisher TTC! You need: a table-tennis racket (all-round blade to start), non-marking indoor court shoes, comfortable sportswear, and a water bottle. We will help you register with Table Tennis England (TTE) when you are ready to compete.',
   '["Group coaching","1-2-1","Open practice","Squad training","Holiday camp"]',
   '["Beginners","Intermediates","Squad","Adults"]')
on conflict (organization_id, name) do nothing;

insert into mentis_action_types (organization_id, name, trigger, due_offset, breach_offset) values
  ('00000000-0000-0000-0000-000000000001', 'name replacement staff', 'event', make_interval(days => 30), make_interval(days => 7)),
  ('00000000-0000-0000-0000-000000000001', 'confirm staffing', 'event', make_interval(days => 14), make_interval(days => 7)),
  ('00000000-0000-0000-0000-000000000001', 'clear outstanding debit', 'event', make_interval(days => 14), make_interval(days => 7)),
  ('00000000-0000-0000-0000-000000000001', 'backfill missing staff details', 'activity', make_interval(days => 7), make_interval(days => 3)),
  ('00000000-0000-0000-0000-000000000001', 'review unbilled items', 'activity', make_interval(days => 7), make_interval(days => 3))
on conflict (organization_id, name) do nothing;

-- UK bank holidays (admin-editable) + term-holiday week samples.
insert into mentis_holiday_calendar (organization_id, name, kind, starts_on, ends_on)
select h.organization_id, h.name, h.kind, h.starts_on, h.ends_on
from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'New Year''s Day', 'bank_holiday'::holiday_kind, '2026-01-01'::date, '2026-01-01'::date),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Good Friday', 'bank_holiday', '2026-04-03', '2026-04-03'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Easter Monday', 'bank_holiday', '2026-04-06', '2026-04-06'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Early May bank holiday', 'bank_holiday', '2026-05-04', '2026-05-04'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Spring bank holiday', 'bank_holiday', '2026-05-25', '2026-05-25'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Summer bank holiday', 'bank_holiday', '2026-08-31', '2026-08-31'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Christmas Day', 'bank_holiday', '2026-12-25', '2026-12-25'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Boxing Day', 'bank_holiday', '2026-12-28', '2026-12-28'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'February half-term', 'term_break', '2026-02-16', '2026-02-20'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Easter holidays', 'term_break', '2026-03-30', '2026-04-10'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'May half-term', 'term_break', '2026-05-25', '2026-05-29'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Summer holidays', 'term_break', '2026-07-27', '2026-08-28'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'October half-term', 'term_break', '2026-10-26', '2026-10-30'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Christmas holidays', 'term_break', '2026-12-21', '2027-01-01'),
  -- 2026/27 season (03-Sep-2026 → 25-Jul-2027); term dates are typical England dates, adjust per LA.
  ('00000000-0000-0000-0000-000000000001'::uuid, 'New Year''s Day', 'bank_holiday', '2027-01-01', '2027-01-01'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Good Friday', 'bank_holiday', '2027-03-26', '2027-03-26'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Easter Monday', 'bank_holiday', '2027-03-29', '2027-03-29'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Early May bank holiday', 'bank_holiday', '2027-05-03', '2027-05-03'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Spring bank holiday', 'bank_holiday', '2027-05-31', '2027-05-31'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Summer bank holiday', 'bank_holiday', '2027-08-30', '2027-08-30'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Christmas Day', 'bank_holiday', '2027-12-27', '2027-12-27'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Boxing Day', 'bank_holiday', '2027-12-28', '2027-12-28'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'February half-term', 'term_break', '2027-02-15', '2027-02-19'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Easter holidays', 'term_break', '2027-03-29', '2027-04-09'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'May half-term', 'term_break', '2027-05-31', '2027-06-04'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Summer holidays', 'term_break', '2027-07-26', '2027-09-01')
) as h(organization_id, name, kind, starts_on, ends_on)
where not exists (
  select 1 from mentis_holiday_calendar x
  where x.organization_id = h.organization_id and x.name = h.name and x.starts_on = h.starts_on);

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0008_automation.sql';
END $$;


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
    raise exception '%: venue concurrency limit (%) exceeded for this time slot', '0008_automation.sql', coalesce(limit_v, 1);
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
  if clash > 0 then raise exception '%: staff member already has an overlapping session', '0008_automation.sql'; end if;
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
    raise exception '%: session falls on a holiday / no-session day', '0008_automation.sql';
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
    raise exception '%: coaches may only edit session notes', '0008_automation.sql';
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
    raise exception '%: approved invoice is locked', '0008_automation.sql';
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
      select entry.organization_id, 'timeEntry', new.time_entry_id, entry.staff_id, new.invoice_id, 'billed'
      where not exists (
        select 1 from mentis_billing_ledger l
        where l.time_entry_id = new.time_entry_id
          and l.invoice_id = new.invoice_id
          and l.item_type = 'timeEntry'
      );
  else
    insert into mentis_billing_ledger (organization_id, item_type, task_id, staff_id, invoice_id, status)
      select t.organization_id, 'task', new.task_id, t.assignee_id, new.invoice_id, 'billed'
      from mentis_tasks t
      where t.id = new.task_id
        and not exists (
          select 1 from mentis_billing_ledger l
          where l.task_id = new.task_id
            and l.invoice_id = new.invoice_id
            and l.item_type = 'task'
        );
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

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0009_trigger_fix.sql';
END $$;


-- Fix: prevent_locked_invoice_change() referenced old.invoice_id on the mentis_invoices
-- table, where the field does not exist (record fields resolve at plan time,
-- so the CASE branch did not protect it). JSONB extraction is table-agnostic.
create or replace function prevent_locked_invoice_change() returns trigger language plpgsql as $$
declare iid uuid;
begin
  iid := coalesce((to_jsonb(old)->>'invoice_id')::uuid, (to_jsonb(old)->>'id')::uuid);
  if exists (select 1 from mentis_invoices where id = iid and status in ('approved', 'paid')) then
    raise exception '%: approved invoice is locked', '0009_trigger_fix.sql';
  end if;
  if TG_OP = 'DELETE' then return old; else return new; end if;
end $$;

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0010_phase_gaps.sql';
END $$;


-- Mentis phase-gap schema: work notes, review SLA offsets, member self-service
-- codes, device push tokens, and org-level policy key/values.
alter table mentis_tasks add column if not exists work_notes text;
alter table mentis_action_types add column if not exists review_offset interval;
alter table mentis_members add column if not exists member_code text unique;
alter table mentis_devices add column if not exists push_token text;
alter table mentis_devices add column if not exists platform text;

create table if not exists mentis_organization_policies (
  organization_id uuid not null references mentis_organizations(id),
  key text not null,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (organization_id, key)
);
alter table mentis_organization_policies enable row level security;
drop policy if exists opp_select on mentis_organization_policies;
create policy opp_select on mentis_organization_policies for select using (is_staff(organization_id));
drop policy if exists opp_write on mentis_organization_policies;
create policy opp_write on mentis_organization_policies for all using (is_admin(organization_id));

-- Backfill stable 6-char member codes for micro-flow / booking auth.
update mentis_members set member_code = upper(substring(md5(id::text) from 1 for 6))
where member_code is null;

insert into mentis_organization_policies (organization_id, key, value) values
  ('00000000-0000-0000-0000-000000000001', 'escalationFrequencyDays', '7'),
  ('00000000-0000-0000-0000-000000000001', 'breachNotify', 'true'),
  ('00000000-0000-0000-0000-000000000001', 'progressReportDay', '1')
on conflict (organization_id, key) do nothing;

-- Hourly task-reminder scheduler (enable per environment with the real functions URL).
select cron.schedule('mentis-task-reminders', '0 * * * *',
  $$ select net.http_post('https://project.functions.supabase.co/task-reminders',
    '{}', '{"Content-Type":"application/json"}') $$) where false;

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0011_staffing_roles_availability.sql';
END $$;


-- 0011_staffing_roles_availability.sql
-- Add coaching roles (responsible, leading, assisting, sparrers),
-- partial / split session staffing intervals, enriched availability kinds,
-- and conflict detection triggers & views.

-- 1. Add responsible_coach_id to sessions and weekly schedules
alter table mentis_sessions add column if not exists responsible_coach_id uuid references mentis_staff(id);
alter table mentis_sessions add column if not exists leading_coach_id uuid references mentis_staff(id);
alter table mentis_sessions add column if not exists assisting_coach_id uuid references mentis_staff(id);

alter table mentis_weekly_schedules add column if not exists responsible_coach_id uuid references mentis_staff(id);
alter table mentis_weekly_schedules add column if not exists leading_coach_id uuid references mentis_staff(id);
alter table mentis_weekly_schedules add column if not exists assisting_coach_id uuid references mentis_staff(id);

-- 2. Availability categories for staff personal diaries:
-- 'available', 'on_duty', 'holiday', 'vacation', 'duty_outside_club', 'unavailable_other'
do $$ begin
  if not exists (select 1 from pg_type where typname = 'staff_availability_type') then
    create type staff_availability_type as enum (
      'available',
      'on_duty',
      'vacation',
      'duty_outside_club',
      'unavailable_other'
    );
  end if;
end $$;

alter table mentis_staff_availability add column if not exists availability_type staff_availability_type not null default 'unavailable_other';

-- 3. Update mentis_session_staffing uniqueness so multiple coaches can hold 'lead' or 'assistant'
-- during distinct partial time windows within the same session (e.g. 15:00-16:00 Coach A, 16:00-16:30 Coach B).
-- Retain the unique (session_id, staff_id, capacity) while adding planned_start support
alter table mentis_session_staffing drop constraint if exists mentis_session_staffing_window_unique;
alter table mentis_session_staffing add constraint mentis_session_staffing_window_unique
  unique (session_id, staff_id, capacity, planned_start);

-- 4. Update guard_staff_overlap to check the exact planned interval (planned_start -> planned_end)
-- allowing back-to-back and split shifts within the same or different sessions.
create or replace function guard_staff_overlap() returns trigger language plpgsql as $$
declare clash integer;
begin
  select count(*) into clash
    from mentis_session_staffing ss
    join mentis_sessions s on s.id = ss.session_id
    where ss.staff_id = new.staff_id
      and ss.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and s.status <> 'cancelled'
      and ss.planned_start < new.planned_end
      and new.planned_start < ss.planned_end;
  if clash > 0 then
    raise exception '%: staff member already has an overlapping session assignment', '0011_staffing_roles_availability.sql';
  end if;
  return new;
end $$;

-- 5. Helper view to detect coach conflicts with sessions within 30 days
create or replace view mentis_staff_session_conflicts as
select
  ss.id as staffing_id,
  ss.session_id,
  s.name as session_name,
  s.venue_id,
  v.name as venue_name,
  ss.staff_id,
  st.display_name as staff_name,
  ss.capacity as coach_role,
  ss.planned_start,
  ss.planned_end,
  sa.id as availability_id,
  sa.availability_type,
  sa.reason as unavailability_reason,
  sa.starts_at as unavail_starts_at,
  sa.ends_at as unavail_ends_at,
  case when ss.planned_start <= (now() + interval '30 days') then true else false end as is_within_30_days
from mentis_session_staffing ss
join mentis_sessions s on s.id = ss.session_id
join mentis_venues v on v.id = s.venue_id
join mentis_staff st on st.id = ss.staff_id
join mentis_staff_availability sa on sa.staff_id = ss.staff_id
where sa.available = false
  and s.status <> 'cancelled'
  and ss.planned_start < sa.ends_at
  and sa.starts_at < ss.planned_end;

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0012_diary_calendar.sql';
END $$;


-- 0012_diary_calendar.sql
-- Calendar-first coach diary:
--   * richer availability vocabulary (sick leave, personal appointment, training…)
--   * audit + provenance fields on every diary entry (source, recurrence, exceptions)
--   * mentis_availability_rules — the Regular Availability Planner pattern
--   * mentis_diary_conflicts — durable conflict records with acknowledgement flow
--   * chargeable-time guard + automatic conflict scan triggers
--   * escalation scheduler hook (email escalation lives in supabase/functions/diary-conflicts)

-- 1. Extend the availability vocabulary --------------------------------------
do $$ begin
  if exists (select 1 from pg_type where typname = 'staff_availability_type') then
    alter type staff_availability_type add value if not exists 'vacation' after 'on_duty';
    alter type staff_availability_type add value if not exists 'holiday' after 'vacation';
    alter type staff_availability_type add value if not exists 'duty_outside_club' after 'vacation';
    alter type staff_availability_type add value if not exists 'sick_leave' after 'duty_outside_club';
    alter type staff_availability_type add value if not exists 'working_elsewhere' after 'sick_leave';
    alter type staff_availability_type add value if not exists 'personal_appointment' after 'working_elsewhere';
    alter type staff_availability_type add value if not exists 'training' after 'personal_appointment';
    alter type staff_availability_type add value if not exists 'club_duty' after 'training';
    alter type staff_availability_type add value if not exists 'out_of_office' after 'club_duty';
    alter type staff_availability_type add value if not exists 'working_hours' after 'available';
    alter type staff_availability_type add value if not exists 'other' after 'unavailable_other';
  end if;
end $$;

-- 2. Provenance + audit columns on diary entries ------------------------------
-- Every calendar entry keeps its source (manual / planner / session / task /
-- admin / booking), its recurrence rule, and its exception state so generated
-- availability can be reconciled against sessions, approved time and invoices.
alter table mentis_staff_availability add column if not exists source_type text not null default 'manual';
alter table mentis_staff_availability add column if not exists source_id uuid;
alter table mentis_staff_availability add column if not exists rule_id uuid;
alter table mentis_staff_availability add column if not exists occurrence_date date;
alter table mentis_staff_availability add column if not exists exception_of uuid references mentis_staff_availability(id) on delete set null;
alter table mentis_staff_availability add column if not exists exception_status text not null default 'none';
alter table mentis_staff_availability add column if not exists conflict_status text not null default 'none';
alter table mentis_staff_availability add column if not exists visibility text not null default 'staff';
alter table mentis_staff_availability add column if not exists title text;
alter table mentis_staff_availability add column if not exists created_by uuid;
alter table mentis_staff_availability add column if not exists created_at timestamptz not null default now();
alter table mentis_staff_availability add column if not exists updated_by uuid;
alter table mentis_staff_availability add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'staff_availability_source_check') then
    alter table mentis_staff_availability add constraint staff_availability_source_check
      check (source_type in ('manual','planner','session','task','admin','booking'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_availability_exception_check') then
    alter table mentis_staff_availability add constraint staff_availability_exception_check
      check (exception_status in ('none','exception','overridden'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_availability_visibility_check') then
    alter table mentis_staff_availability add constraint staff_availability_visibility_check
      check (visibility in ('private','staff','public'));
  end if;
end $$;

create index if not exists availability_staff_range_idx on mentis_staff_availability(staff_id, starts_at, ends_at);

-- 3. Regular Availability Planner pattern -------------------------------------
-- One row per coach pattern: weekly windows per weekday, effective range,
-- 'scope' captures the UI preset (one_month / indefinite / custom).
create table if not exists mentis_availability_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references mentis_organizations(id),
  staff_id uuid not null references mentis_staff(id) on delete cascade,
  label text not null default 'Regular availability',
  pattern jsonb not null,          -- [{"weekday":1,"windows":[{"start":"12:00","end":"20:00"}]}]
  effective_from date not null,
  effective_to date,               -- null = indefinite
  scope text not null default 'indefinite',
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (scope in ('one_month','indefinite','custom'))
);

create or replace function guard_availability_pattern() returns trigger language plpgsql as $$
declare win jsonb; day jsonb; s text; e text;
begin
  if jsonb_typeof(new.pattern) <> 'array' then
    raise exception '%: availability pattern must be an array of weekday windows', '0012_diary_calendar.sql';
  end if;
  for day in select * from jsonb_array_elements(new.pattern) loop
    if (day->>'weekday')::int not between 1 and 7 then
      raise exception '%: weekday must be 1 (Monday) … 7 (Sunday)', '0012_diary_calendar.sql';
    end if;
    if jsonb_typeof(day->'windows') <> 'array' then
      raise exception '%: each weekday needs a windows array (may be empty)', '0012_diary_calendar.sql';
    end if;
    for win in select * from jsonb_array_elements(day->'windows') loop
      s := win->>'start'; e := win->>'end';
      if s is null or e is null or s !~ '^\d{2}:\d{2}$' or e !~ '^\d{2}:\d{2}$' or e <= s then
        raise exception '%: window %–% is not a valid HH:MM range', '0012_diary_calendar.sql', coalesce(s,'?'), coalesce(e,'?');
      end if;
    end loop;
  end loop;
  return new;
end $$;

drop trigger if exists guard_availability_pattern_trg on mentis_availability_rules;
create trigger guard_availability_pattern_trg before insert or update on mentis_availability_rules
  for each row execute function guard_availability_pattern();

-- 4. Durable conflict records --------------------------------------------------
create table if not exists mentis_diary_conflicts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references mentis_organizations(id),
  staff_id uuid not null references mentis_staff(id) on delete cascade,
  availability_id uuid references mentis_staff_availability(id) on delete cascade,
  session_id uuid references mentis_sessions(id) on delete cascade,
  task_id uuid references mentis_tasks(id) on delete cascade,
  staffing_id uuid references mentis_session_staffing(id) on delete set null,
  overlap_minutes integer not null default 0,
  message text not null,
  status text not null default 'open',
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (status in ('open','acknowledged','resolved')),
  check ((session_id is not null) <> (task_id is not null))
);
create unique index if not exists diary_conflict_unique
  on mentis_diary_conflicts(coalesce(availability_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(task_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(staffing_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status <> 'resolved';

-- 5. RLS -----------------------------------------------------------------------
alter table mentis_availability_rules enable row level security;
alter table mentis_diary_conflicts enable row level security;

drop policy if exists rule_select on mentis_availability_rules;
drop policy if exists rule_write on mentis_availability_rules;
drop policy if exists conflict_select on mentis_diary_conflicts;
drop policy if exists conflict_write on mentis_diary_conflicts;

create policy rule_select on mentis_availability_rules for select using (is_staff(organization_id));
create policy rule_write on mentis_availability_rules for all using (
  is_admin(organization_id) or staff_id = my_staff_id(organization_id) or
  has_mentis_role(organization_id, 'COACH'));

create policy conflict_select on mentis_diary_conflicts for select using (
  is_staff(organization_id));
create policy conflict_write on mentis_diary_conflicts for all using (
  is_admin(organization_id) or staff_id = my_staff_id(organization_id) or
  has_mentis_role(organization_id, 'COACH'));

-- 6. Automatic conflict scan -----------------------------------------------------
-- When a coach marks themselves unavailable and a future session/task assignment
-- overlaps, record the conflict, flag both sides and alert the owner.
-- Labels mirror packages/core/src/diary.ts DIARY_KINDS so UI + DB agree.
create or replace function availability_kind_label(kind text) returns text language sql immutable as $$
  select case kind
    when 'available' then 'Available for coaching'
    when 'working_hours' then 'Regular working hours'
    when 'on_duty' then 'Club duty'
    when 'club_duty' then 'Club duty'
    when 'vacation' then 'Vacation'
    when 'holiday' then 'Vacation'
    when 'sick_leave' then 'Sick leave'
    when 'duty_outside_club' then 'Duty outside club'
    when 'working_elsewhere' then 'Working elsewhere'
    when 'personal_appointment' then 'Personal appointment'
    when 'training' then 'Training / development'
    when 'out_of_office' then 'Out of office'
    when 'unavailable_other' then 'Unavailable'
    else 'Other'
  end
$$;

create or replace function scan_availability_conflicts() returns trigger language plpgsql security definer set search_path = public as $$
declare org uuid; row record; overlap int; msg text; kind text;
begin
  if new.available then
    -- Availability restored: resolve the conflicts this entry caused.
    update mentis_diary_conflicts
      set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
      where availability_id = new.id and status <> 'resolved';
    update mentis_staff_availability set conflict_status = 'none' where id = new.id;
    return new;
  end if;

  org := new.organization_id;
  kind := coalesce(new.availability_type::text, 'unavailable_other');

  for row in
    select ss.id as staffing_id, ss.session_id, ss.staff_id,
      greatest(ss.planned_start, new.starts_at) as o_start,
      least(ss.planned_end, new.ends_at) as o_end,
      s.name as session_name
    from mentis_session_staffing ss
    join mentis_sessions s on s.id = ss.session_id
    where ss.staff_id = new.staff_id
      and s.status <> 'cancelled'
      and ss.planned_end >= now()
      and ss.planned_start < new.ends_at and new.starts_at < ss.planned_end
  loop
    overlap := extract(epoch from (row.o_end - row.o_start)) / 60;
    msg := format('%s is unavailable %s–%s because of %s. %s overlaps this period by %s minutes.',
      (select display_name from mentis_staff where id = new.staff_id),
      to_char(new.starts_at, 'HH24:MI'), to_char(new.ends_at, 'HH24:MI'),
      availability_kind_label(kind), row.session_name, overlap);
    insert into mentis_diary_conflicts (organization_id, staff_id, availability_id, session_id, staffing_id, overlap_minutes, message)
      select org, new.staff_id, new.id, row.session_id, row.staffing_id, overlap, msg
      where not exists (
        select 1 from mentis_diary_conflicts c
        where c.availability_id = new.id
          and c.session_id = row.session_id
          and c.staffing_id = row.staffing_id
          and c.status <> 'resolved'
      );
    update mentis_staff_availability set conflict_status = 'open' where id = new.id;
    if exists (select 1 from mentis_action_types where organization_id = org) then
      insert into mentis_pending_actions (organization_id, action_type_id, title, status, due_at, linked_entity_type, linked_entity_id)
        values (org,
          (select id from mentis_action_types where organization_id = org order by id limit 1),
          'Diary conflict: ' || msg, 'open', row.o_start, 'session', row.session_id);
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists availability_conflict_scan on mentis_staff_availability;
create trigger availability_conflict_scan after insert or update of available, starts_at, ends_at
  on mentis_staff_availability for each row execute function scan_availability_conflicts();

-- 7. Enriched conflict view (overlap minutes + human message) -------------------
drop view if exists mentis_staff_session_conflicts;
create view mentis_staff_session_conflicts as
select
  c.id as conflict_id,
  c.status as conflict_status,
  c.message,
  c.overlap_minutes,
  ss.id as staffing_id,
  ss.session_id,
  s.name as session_name,
  s.venue_id,
  v.name as venue_name,
  ss.staff_id,
  st.display_name as staff_name,
  ss.capacity as coach_role,
  ss.planned_start,
  ss.planned_end,
  sa.id as availability_id,
  sa.availability_type,
  sa.reason as unavailability_reason,
  sa.starts_at as unavail_starts_at,
  sa.ends_at as unavail_ends_at,
  case when ss.planned_start <= (now() + interval '30 days') then true else false end as is_within_30_days
from mentis_diary_conflicts c
join mentis_session_staffing ss on ss.id = c.staffing_id
join mentis_sessions s on s.id = ss.session_id
join mentis_venues v on v.id = s.venue_id
join mentis_staff st on st.id = ss.staff_id
join mentis_staff_availability sa on sa.id = c.availability_id;

-- 8. Chargeable-time integrity guard (§11) --------------------------------------
-- A chargeable record is only valid when the staff member was actually assigned,
-- the time falls inside the assignment window and the rate card covers the date.
create or replace function guard_chargeable_time_entry() returns trigger language plpgsql as $$
declare assignment record; card record; dup int;
begin
  -- Staff must belong to the organisation of the record.
  if not exists (
    select 1 from mentis_staff st
    where st.id = new.staff_id and st.organization_id = new.organization_id
  ) then
    raise exception '%: staff member does not belong to this organisation', '0012_diary_calendar.sql';
  end if;

  if new.session_id is not null then
    select * into assignment from mentis_session_staffing
      where session_id = new.session_id and staff_id = new.staff_id
        and planned_start <= new.starts_at and new.ends_at <= planned_end
      order by planned_start limit 1;
    if assignment.id is null then
      raise exception '%: chargeable time must fall inside an assigned staffing window for this session', '0012_diary_calendar.sql';
    end if;
  elsif new.task_id is not null then
    if not exists (
      select 1 from mentis_tasks t where t.id = new.task_id and t.assignee_id = new.staff_id
    ) then
      raise exception '%: chargeable task time requires an assignment for this staff member', '0012_diary_calendar.sql';
    end if;
  end if;

  -- Rate must come from a rate card valid on the event date (unless zero/non-chargeable).
  if new.rate_cents > 0 then
    select * into card from mentis_rate_cards
      where staff_id = new.staff_id and rate_cents = new.rate_cents
        and valid_from <= (new.starts_at at time zone 'UTC')::date
      order by valid_from desc limit 1;
    if card.id is null then
      raise exception '%: no rate card covers % at rate % for this staff member', '0012_diary_calendar.sql', new.starts_at::date, new.rate_cents;
    end if;
  end if;

  -- Never invoice the same window twice.
  select count(*) into dup from mentis_staff_time_entries
    where staff_id = new.staff_id
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and bill_state = 'billed'
      and coalesce(session_id, task_id) = coalesce(new.session_id, new.task_id)
      and tsrange(starts_at, ends_at) && tsrange(new.starts_at, new.ends_at);
  if dup > 0 then
    raise exception '%: an overlapping time window is already invoiced for this assignment', '0012_diary_calendar.sql';
  end if;
  return new;
end $$;

drop trigger if exists guard_chargeable_time_entry_trg on mentis_staff_time_entries;
create trigger guard_chargeable_time_entry_trg before insert or update on mentis_staff_time_entries
  for each row execute function guard_chargeable_time_entry();

-- 9. Audit trail for planner rules (§15) -----------------------------------------
drop trigger if exists audit_availability_rule on mentis_availability_rules;
create trigger audit_availability_rule after insert or update or delete on mentis_availability_rules
  for each row execute function audit_write('diary.rule');
drop trigger if exists audit_availability_entry on mentis_staff_availability;
create trigger audit_availability_entry after insert or update or delete on mentis_staff_availability
  for each row execute function audit_write('diary.entry');

-- 10. Escalation scheduler hook ---------------------------------------------------
-- Reminders start one month before the session; unresolved conflicts escalate
-- daily to email (supabase/functions/diary-conflicts) as the session approaches.
select cron.schedule('mentis-diary-conflict-escalation', '0 7 * * *',
  $$ select net.http_post('https://project.functions.supabase.co/diary-conflicts',
    '{}', '{"Content-Type":"application/json"}') $$) where false;

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0013_session_templates.sql';
END $$;


-- ============================================================================
-- 0013_session_templates.sql
--
-- Sessions are instances of a blueprint.
--
-- Until now the only way to describe "what a session is" was to create a
-- session and clone it, and the only recurring primitive was
-- mentis_weekly_schedules (a day-of-week + time row). Both made the instance
-- the source of truth.
--
-- This migration introduces the missing entity: a program blueprint
-- that owns venue, slot, time zone, capacity, coaching trio, a staffing plan
-- and a default roster. One-off sessions are single instances of it; recurring
-- program runs are materialised from a recurrence rule (legacy name:
-- mentis_session_series). The dated execution rows stay in mentis_sessions, so
-- every existing reader (register, diary, invoices, staffing, dashboards) keeps
-- working unchanged.
--
-- Layer 1  tables  : mentis_session_templates (+_staffing, +_members),
--                    mentis_recurrence_rules, mentis_session_series and the
--                    provenance columns on mentis_sessions.
-- Layer 2  helpers : expand_recurrence(), session_template_occurrences() — one
--                    implementation of the generation rules, used both for the
--                    UI preview and for the generator.
-- Layer 3  api     : template_completeness, instantiate_session,
--                    instantiate_session_series, extend_session_series,
--                    set_session_series_status, apply_blueprint_to_session,
--                    template_from_weekly_schedule.
-- Layer 4  bridge  : every existing weekly schedule is imported as a blueprint
--                    and its sessions re-pointed to it; new inserts that only
--                    carry schedule_id are linked automatically.
-- Layer 5  views   : session_template_overview, session_series_overview.
-- Layer 6  rls     : staff read the blueprint library, admins author it.
--
-- Operating model (final canonical structure):
--   Program blueprint (starts at version 1) -> mentis_session_templates
--   Program (a concrete run or season)      -> mentis_session_series
--   Session (each actual dated execution)   -> mentis_sessions (series_id + occurrence_date)
--   A program is created deliberately when a new run starts; the session rows are
--   the actual booked/attended execution records for those dates. Each program can
--   generate sessions in bulk (instantiate_session_series with valid_from/valid_to)
--   or one at a time (instantiate_session with series_id). Bank holidays and term
--   breaks are skipped.
--
-- Generation semantics (identical in the TypeScript mirror in
-- packages/core/src/templates.ts, asserted by tests/templates.test.ts):
--   * weekly / fortnightly / monthly / quarterly iterate from valid_from;
--     fortnightly is anchored on the Monday of the week containing valid_from,
--     so a fortnightly pattern is stable regardless of the start weekday.
--   * monthly repeats on the same day of month, clamped to the last day of
--     short months (31 Jan -> 28 Feb -> 31 Mar). When by_weekday is supplied,
--     monthly means "the first matching weekday per interval" instead.
--   * horizon_days (default 90) bounds open-ended rules so a series can be
--     materialised ahead of time instead of forever.
--   * the skip switches classify holiday dates. Note that rule 16
--     (guard_holiday_session) refuses to store *any* session on a no-session
--     day, so a date that is deliberately not skipped is reported back in
--     `conflicts` rather than silently created.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Layer 1 — the blueprint
-- ---------------------------------------------------------------------------

create table if not exists mentis_session_templates (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references mentis_organizations(id) on delete cascade,
  code                   text,
  name                   text not null,
  description            text,
  venue_id               uuid not null references mentis_venues(id) on delete restrict,
  default_start_time     time not null,
  default_end_time       time not null,
  timezone               text not null default 'Europe/London',
  level_band             text,
  capacity               integer,
  min_headcount          integer,
  waitlist_enabled       boolean not null default false,
  default_charge_cents   integer,
  responsible_coach_id   uuid references mentis_staff(id) on delete set null,
  leading_coach_id       uuid references mentis_staff(id) on delete set null,
  assisting_coach_id     uuid references mentis_staff(id) on delete set null,
  tags                   text[] not null default '{}',
  status                 text not null default 'active' check (status in ('draft', 'active', 'archived')),
  version                integer not null default 1,
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint session_template_time_order check (default_end_time > default_start_time),
  constraint session_template_headcount check (min_headcount is null or capacity is null or min_headcount <= capacity),
  unique (organization_id, name, venue_id)
);

comment on table mentis_session_templates is
  'Blueprint for a session: venue, slot, staffing plan and default roster. Sessions are instances of it.';
comment on column mentis_session_templates.version is
  'Bumped on material edits; instances snapshot the version they were generated from.';

create index if not exists session_templates_org_idx on mentis_session_templates (organization_id, status, name);
create index if not exists session_templates_venue_idx on mentis_session_templates (venue_id);

-- The staffing plan: one row per role slot the blueprint expects to fill.
-- A slot may name the staff member and rate card, or stay open ("someone must
-- lead, coach TBD") — generation leaves that slot unstaffed and warns.
create table if not exists mentis_session_template_staffing (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references mentis_session_templates(id) on delete cascade,
  capacity      text not null check (capacity in ('lead', 'assistant', 'sparrer')),
  staff_id      uuid references mentis_staff(id) on delete set null,
  rate_card_id  uuid references mentis_rate_cards(id) on delete set null,
  required      boolean not null default true,
  lead_minutes  integer not null default 15 check (lead_minutes >= 0),
  trail_minutes integer not null default 0 check (trail_minutes >= 0),
  notes         text,
  sort_order    integer not null default 0,
  unique (template_id, capacity, staff_id)
);

comment on table mentis_session_template_staffing is
  'Role slots a blueprint expects. lead_minutes materialises as a staffing lead-in on each instance.';

-- The default roster: who is expected to attend unless the instance is changed.
create table if not exists mentis_session_template_members (
  template_id uuid not null references mentis_session_templates(id) on delete cascade,
  member_id   uuid not null references mentis_members(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (template_id, member_id)
);

-- How a blueprint repeats. Kept separate from the blueprint so the same
-- blueprint can run a Monday series and a Wednesday series at once.
create table if not exists mentis_recurrence_rules (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references mentis_organizations(id) on delete cascade,
  template_id           uuid not null references mentis_session_templates(id) on delete cascade,
  label                 text,
  frequency             text not null default 'weekly'
                          -- 'biweekly' is accepted as an alias of 'fortnightly'
                          check (frequency in ('daily', 'weekly', 'biweekly', 'fortnightly', 'monthly', 'quarterly')),
  interval_count        integer not null default 1 check (interval_count between 1 and 12),
  by_weekday            smallint[] not null default '{}',
  start_time            time not null,
  end_time              time not null,
  valid_from            date not null,
  valid_to              date,
  horizon_days          integer not null default 90 check (horizon_days between 1 and 730),
  max_occurrences       integer check (max_occurrences is null or max_occurrences > 0),
  skip_term_holidays    boolean not null default true,
  skip_bank_holidays    boolean not null default true,
  skip_manual_closures  boolean not null default true,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint recurrence_rule_time_order check (end_time > start_time),
  constraint recurrence_rule_window check (valid_to is null or valid_to >= valid_from),
  constraint recurrence_rule_weekdays check (by_weekday <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
);

comment on table mentis_recurrence_rules is
  'Recurrence pattern for a blueprint: frequency, ISO weekdays, window and the skip switches.';

create index if not exists recurrence_rules_template_idx on mentis_recurrence_rules (template_id);

-- A published run of a blueprint. A program blueprint can spawn many sessions,
-- and each generated program points back at its primary session. The optional
-- link table below is only for cross-context metadata; it is not the recurrence
-- source of truth.
create table if not exists mentis_session_series (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references mentis_organizations(id) on delete cascade,
  template_id        uuid not null references mentis_session_templates(id) on delete restrict,
  recurrence_rule_id uuid not null references mentis_recurrence_rules(id) on delete restrict,
  label              text,
  venue_id           uuid references mentis_venues(id) on delete set null,
  starts_on          date not null,
  ends_on            date,
  status             text not null default 'active' check (status in ('active', 'paused', 'ended')),
  template_version   integer not null default 1,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint session_series_window check (ends_on is null or ends_on >= starts_on)
);

comment on table mentis_session_series is
  'A published run of a blueprint. Each generated session stores its primary series_id; recurrence, extension, and pausing act on this canonical relationship.';

create table if not exists mentis_session_series_links (
  series_id       uuid not null references mentis_session_series(id) on delete cascade,
  session_id      uuid not null references mentis_sessions(id) on delete cascade,
  occurrence_date date,
  primary key (series_id, session_id)
);

comment on table mentis_session_series_links is
  'Optional association table for auxiliary cross-context links. The recurrence contract still lives on mentis_sessions.series_id.';

create index if not exists session_series_template_idx on mentis_session_series (template_id, status);
create index if not exists session_series_org_idx on mentis_session_series (organization_id, starts_on desc);
create unique index if not exists session_series_template_season_uidx on mentis_session_series (template_id, starts_on);
create index if not exists session_series_links_session_idx on mentis_session_series_links (session_id, series_id);
create index if not exists session_series_links_occurrence_idx on mentis_session_series_links (series_id, occurrence_date);

-- Provenance on the instances themselves.
alter table mentis_sessions
  add column if not exists template_id       uuid references mentis_session_templates(id) on delete set null,
  add column if not exists series_id         uuid references mentis_session_series(id) on delete set null,
  add column if not exists occurrence_date   date,
  add column if not exists blueprint         jsonb,
  add column if not exists is_exception      boolean not null default false,
  add column if not exists overridden_fields text[] not null default '{}',
  add column if not exists generated_at      timestamptz;

comment on column mentis_sessions.blueprint is
  'Snapshot of the template values this instance was generated from, so drift is traceable.';
comment on column mentis_sessions.overridden_fields is
  'Fields that currently differ from the blueprint; cleared by apply_blueprint_to_session().';

create index if not exists sessions_series_occurrence_idx on mentis_sessions (series_id, occurrence_date);
create index if not exists sessions_template_idx on mentis_sessions (template_id, start_at);
create index if not exists sessions_series_idx on mentis_sessions (series_id, start_at);

-- Back-compat for legacy callers/tests that still refer to a dedicated
-- mentis_session_occurrences table. The canonical storage remains
-- mentis_sessions, but this view keeps older SQL working while preserving the
-- template/series provenance model.
create or replace view public.mentis_session_occurrences as
select
  id,
  organization_id,
  venue_id,
  name,
  start_at,
  end_at,
  status,
  cancel_reason,
  schedule_id,
  template_id,
  series_id,
  occurrence_date,
  blueprint,
  is_exception,
  overridden_fields,
  generated_at
from public.mentis_sessions;

create or replace function public.mentis_session_occurrences_compat() returns trigger
language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.mentis_sessions (
      id,
      organization_id,
      venue_id,
      name,
      start_at,
      end_at,
      status,
      cancel_reason,
      schedule_id,
      template_id,
      series_id,
      occurrence_date,
      blueprint,
      is_exception,
      overridden_fields,
      generated_at
    ) values (
      coalesce(new.id, gen_random_uuid()),
      new.organization_id,
      new.venue_id,
      new.name,
      new.start_at,
      new.end_at,
      coalesce(new.status, 'scheduled'),
      new.cancel_reason,
      new.schedule_id,
      new.template_id,
      new.series_id,
      new.occurrence_date,
      new.blueprint,
      coalesce(new.is_exception, false),
      coalesce(new.overridden_fields, '{}'),
      new.generated_at
    )
    returning id into new.id;
    return new;
  elsif TG_OP = 'UPDATE' then
    update public.mentis_sessions set
      organization_id = new.organization_id,
      venue_id = new.venue_id,
      name = new.name,
      start_at = new.start_at,
      end_at = new.end_at,
      status = new.status,
      cancel_reason = new.cancel_reason,
      schedule_id = new.schedule_id,
      template_id = new.template_id,
      series_id = new.series_id,
      occurrence_date = new.occurrence_date,
      blueprint = new.blueprint,
      is_exception = new.is_exception,
      overridden_fields = new.overridden_fields,
      generated_at = new.generated_at
    where id = old.id;
    return new;
  elsif TG_OP = 'DELETE' then
    delete from public.mentis_sessions where id = old.id;
    return old;
  end if;

  return null;
end $$;

create trigger mentis_session_occurrences_compat_iud
instead of insert or update or delete on public.mentis_session_occurrences
for each row execute function public.mentis_session_occurrences_compat();

-- Blueprint version bump on material edits: instances generated afterwards are
-- visibly newer than the ones that came before, without rewriting history.
create or replace function touch_session_template() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.name is distinct from old.name
     or new.venue_id is distinct from old.venue_id
     or new.default_start_time is distinct from old.default_start_time
     or new.default_end_time is distinct from old.default_end_time
     or new.timezone is distinct from old.timezone
     or new.capacity is distinct from old.capacity
     or new.level_band is distinct from old.level_band
     or new.default_charge_cents is distinct from old.default_charge_cents
     or new.responsible_coach_id is distinct from old.responsible_coach_id
     or new.leading_coach_id is distinct from old.leading_coach_id
     or new.assisting_coach_id is distinct from old.assisting_coach_id then
    new.version := old.version + 1;
  end if;
  return new;
end $$;

drop trigger if exists session_templates_touch on mentis_session_templates;
create trigger session_templates_touch before update on mentis_session_templates
  for each row execute function touch_session_template();

create or replace function touch_session_series() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists session_series_touch on mentis_session_series;
create trigger session_series_touch before update on mentis_session_series
  for each row execute function touch_session_series();

-- ---------------------------------------------------------------------------
-- Layer 2 — generation helpers
-- ---------------------------------------------------------------------------

-- Expand a rule into occurrence dates. Pure date maths, no table access, so
-- both the preview and the generator call exactly this.
create or replace function expand_recurrence(p_rule jsonb)
returns date[]
language plpgsql
immutable
as $$
declare
  v_frequency   text    := coalesce(p_rule->>'frequency', 'weekly');
  v_interval    integer := coalesce((p_rule->>'interval_count')::integer, 1);
  v_weekdays    smallint[];
  v_from        date    := (p_rule->>'valid_from')::date;
  v_to          date;
  v_horizon     integer := coalesce((p_rule->>'horizon_days')::integer, 90);
  v_max         integer := (p_rule->>'max_occurrences')::integer;
  v_cursor      date;
  v_cap         date;
  v_dates       date[] := '{}';
  v_month_first date;
  v_last_day    date;
  v_day         integer;
  v_candidate   date;
  v_seek        integer;
  v_guard       integer := 0;
begin
  if v_from is null then
    raise exception '%: recurrence rule needs valid_from', '0013_session_templates.sql';
  end if;
  v_interval := greatest(1, v_interval);

  -- horizon_days counts the first day, so an open-ended rule spans
  -- [valid_from, valid_from + horizon_days - 1] — identical to the mirror.
  v_horizon := greatest(1, v_horizon);
  v_to  := least(coalesce((p_rule->>'valid_to')::date, v_from + v_horizon - 1), v_from + v_horizon - 1);
  v_cap := v_to;

  if p_rule ? 'by_weekday' and jsonb_typeof(p_rule->'by_weekday') = 'array' then
    select coalesce(array_agg(distinct value::smallint order by value::smallint), '{}')
      into v_weekdays
      from jsonb_array_elements_text(p_rule->'by_weekday');
  end if;

  if v_frequency = 'daily' then
    v_cursor := v_from;
    while v_cursor <= v_cap loop
      v_dates := v_dates || v_cursor;
      v_cursor := v_cursor + v_interval;
      v_guard := v_guard + 1;
      exit when v_guard > 4000;
    end loop;

  elsif v_frequency in ('weekly', 'fortnightly', 'biweekly') then
    if coalesce(array_length(v_weekdays, 1), 0) = 0 then
      v_weekdays := array[extract(isodow from v_from)::smallint];
    end if;
    -- Anchor on the Monday of valid_from's week so a fortnightly pattern is
    -- stable whichever weekday it starts on.
    v_cursor := v_from - (extract(isodow from v_from)::integer - 1);
    while v_cursor <= v_cap loop
      for v_seek in 1..7 loop
        v_candidate := v_cursor + (v_seek - 1);
        if (extract(isodow from v_candidate)::smallint = any (v_weekdays))
           and v_candidate >= v_from and v_candidate <= v_cap then
          v_dates := v_dates || v_candidate;
        end if;
      end loop;
      v_cursor := v_cursor + (v_interval * (case when v_frequency = 'weekly' then 1 else 2 end) * 7);
      v_guard := v_guard + 1;
      exit when v_guard > 2000;
    end loop;

  elsif v_frequency in ('monthly', 'quarterly') then
    v_interval := v_interval * case when v_frequency = 'quarterly' then 3 else 1 end;
    v_month_first := date_trunc('month', v_from)::date;
    v_day := extract(day from v_from)::integer;
    while v_month_first <= v_cap loop
      -- Same day of month, clamped into short months (31 Jan -> 28 Feb).
      v_last_day := (v_month_first + interval '1 month - 1 day')::date;
      v_candidate := v_month_first + (least(v_day, extract(day from v_last_day)::integer) - 1);

      if coalesce(array_length(v_weekdays, 1), 0) > 0 then
        -- "The first matching weekday on/after that day, still in this month";
        -- a month with no match contributes nothing.
        while v_candidate <= v_last_day
              and not (extract(isodow from v_candidate)::smallint = any (v_weekdays)) loop
          v_candidate := v_candidate + 1;
        end loop;
        if v_candidate > v_last_day then
          v_candidate := null;
        end if;
      end if;

      if v_candidate is not null and v_candidate >= v_from and v_candidate <= v_cap then
        v_dates := v_dates || v_candidate;
      end if;

      v_month_first := (v_month_first + (v_interval || ' month')::interval)::date;
      v_guard := v_guard + 1;
      exit when v_guard > 400;
    end loop;

  else
    raise exception '%: unknown recurrence frequency %', '0013_session_templates.sql', v_frequency;
  end if;

  v_dates := (select coalesce(array_agg(d order by d), '{}')::date[] from unnest(v_dates) as d);
  if v_max is not null and array_length(v_dates, 1) > v_max then
    v_dates := v_dates[1:v_max];
  end if;
  return v_dates;
end $$;

comment on function expand_recurrence(jsonb) is
  'Occurrence dates for a rule (daily/weekly/fortnightly/monthly/quarterly, horizon bounded).';

-- Expansion + holiday classification. `action` is 'generate' or 'skip'; the
-- holiday name is returned so the UI can say why a date was skipped. This is
-- the single source of truth for the preview and the generator.
create or replace function session_template_occurrences(p_rule jsonb)
returns table (
  occurrence_date date,
  action          text,
  holiday_name    text,
  holiday_kind    text,
  starts_at       timestamptz,
  ends_at         timestamptz
)
language plpgsql
stable
as $$
declare
  v_tz   text := coalesce(p_rule->>'timezone', 'Europe/London');
  v_d    date;
  v_name text;
  v_kind text;
  v_org  uuid := nullif(p_rule->>'organization_id', '')::uuid;
  v_skip boolean;
begin
  foreach v_d in array expand_recurrence(p_rule) loop
    v_name := null;
    v_kind := null;
    if v_org is not null then
      -- Latest matching row wins when windows overlap (a closure inside a term).
      select h.name, h.kind into v_name, v_kind
        from mentis_holiday_calendar h
       where h.organization_id = v_org
         and v_d between h.starts_on and h.ends_on
       order by case h.kind::text when 'manual' then 3 when 'bank_holiday' then 2 else 1 end desc,
                h.starts_on desc, h.name
       limit 1;
    end if;

    v_skip := v_name is not null
      and case v_kind
            when 'term_break'   then coalesce((p_rule->>'skip_term_holidays')::boolean, true)
            when 'bank_holiday' then coalesce((p_rule->>'skip_bank_holidays')::boolean, true)
            else coalesce((p_rule->>'skip_manual_closures')::boolean, true)
          end;

    occurrence_date := v_d;
    action          := case when v_skip then 'skip' else 'generate' end;
    holiday_name    := case when v_skip then v_name else null end;
    holiday_kind    := case when v_skip then v_kind else null end;
    starts_at       := (v_d + (p_rule->>'start_time')::time) at time zone v_tz;
    ends_at         := (v_d + (p_rule->>'end_time')::time) at time zone v_tz;
    return next;
  end loop;
end $$;

comment on function session_template_occurrences(jsonb) is
  'Every date a rule produces, flagged generate/skip with the holiday that caused the skip.';

-- ---------------------------------------------------------------------------
-- Layer 3 — provenance, drift and the public API
-- ---------------------------------------------------------------------------

-- Snapshot of the blueprint values an instance was generated from.
create or replace function blueprint_snapshot(p_template_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
           'template_id',  t.id,
           'name',         t.name,
           'version',      t.version,
           'venue_id',     t.venue_id,
           'start_time',   t.default_start_time,
           'end_time',     t.default_end_time,
           'timezone',     t.timezone,
           'capacity',     t.capacity,
           'level_band',   t.level_band,
           'charge_cents', t.default_charge_cents
         )
    from mentis_session_templates t
   where t.id = p_template_id;
$$;

-- Every template version is kept, so a new season can start from an older one.
create table if not exists mentis_session_template_versions (
  template_id uuid not null references mentis_session_templates(id) on delete cascade,
  version     integer not null,
  snapshot    jsonb not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (template_id, version)
);

create or replace function record_session_template_version() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into mentis_session_template_versions (template_id, version, snapshot, created_by)
  values (new.id, new.version,
          to_jsonb(new) - 'created_at' - 'updated_at' - 'created_by',
          auth.uid())
  on conflict (template_id, version) do update set snapshot = excluded.snapshot;
  return new;
end $$;

drop trigger if exists session_templates_version_history on mentis_session_templates;
create trigger session_templates_version_history after insert or update on mentis_session_templates
  for each row execute function record_session_template_version();

insert into mentis_session_template_versions (template_id, version, snapshot)
select t.id, t.version, to_jsonb(t) - 'created_at' - 'updated_at' - 'created_by'
  from mentis_session_templates t
on conflict (template_id, version) do nothing;

-- Which blueprint-derived values differ from the blueprint? Pure comparison of
-- the supplied instance values, so it works from a trigger (new row values) and
-- from a query (stored row).
create or replace function session_blueprint_drift(
  p_template_id     uuid,
  p_name            text,
  p_start_at        timestamptz,
  p_end_at          timestamptz,
  p_venue_id        uuid,
  p_capacity        integer,
  p_level_band      text,
  p_occurrence_date date
)
returns text[]
language sql
stable
as $$
  with t as (select * from mentis_session_templates where id = p_template_id)
  select coalesce(array_agg(f order by f), '{}')
    from (
      select 'name'::text as f
        from t where p_name is distinct from t.name
      union all
      select 'start_at'
        from t where p_occurrence_date is not null
          and p_start_at is distinct from (p_occurrence_date + t.default_start_time) at time zone t.timezone
      union all
      select 'end_at'
        from t where p_occurrence_date is not null
          and p_end_at is distinct from (p_occurrence_date + t.default_end_time) at time zone t.timezone
      union all
      select 'venue_id'
        from t where p_venue_id is distinct from t.venue_id
      union all
      select 'capacity'
        from t where t.capacity is not null and p_capacity is distinct from t.capacity
      union all
      select 'level_band'
        from t where t.level_band is not null and p_level_band is distinct from t.level_band
    ) fields;
$$;

-- Convenience wrapper for the console and tests: drift of a stored instance.
create or replace function blueprint_drift_fields(p_template_id uuid, p_session_id uuid)
returns text[]
language sql
stable
as $$
  select session_blueprint_drift(
           p_template_id, s.name, s.start_at, s.end_at, s.venue_id, s.capacity, s.level_band, s.occurrence_date
         )
    from mentis_sessions s
   where s.id = p_session_id;
$$;

-- Drift is derived state: recomputed from the row on every write, so it is
-- always "what differs right now". Editing an instance back onto the blueprint
-- value simply clears the flag. Named sessions_zz_* so it runs after the other
-- BEFORE triggers and sees their final values.
create or replace function sync_session_blueprint_drift() returns trigger
language plpgsql
as $$
begin
  if new.template_id is null then
    new.overridden_fields := coalesce(new.overridden_fields, '{}');
  else
    new.overridden_fields := session_blueprint_drift(
      new.template_id, new.name, new.start_at, new.end_at,
      new.venue_id, new.capacity, new.level_band, new.occurrence_date
    );
  end if;
  new.is_exception := coalesce(array_length(new.overridden_fields, 1), 0) > 0;
  return new;
end $$;

drop trigger if exists sessions_blueprint_drift on mentis_sessions;
drop trigger if exists sessions_zz_blueprint_drift on mentis_sessions;
create trigger sessions_zz_blueprint_drift before insert or update on mentis_sessions
  for each row execute function sync_session_blueprint_drift();

comment on function sync_session_blueprint_drift() is
  'Keeps is_exception / overridden_fields honest whenever an instance is written.';

-- How usable is this blueprint? One row per problem — the console shows them
-- before publishing; nothing is refused so blueprints can be authored as drafts.
create or replace function template_completeness(p_template_id uuid)
returns table (problem text)
language sql
stable
as $$
  select 'needs a name'::text
   where coalesce((select btrim(name) from mentis_session_templates where id = p_template_id), '') = ''
  union all
  select 'needs a venue'
   where (select venue_id from mentis_session_templates where id = p_template_id) is null
  union all
  select 'session must end after it starts'
   where (select default_end_time <= default_start_time from mentis_session_templates where id = p_template_id)
  union all
  select 'needs at least one lead slot'
   where not exists (
     select 1 from mentis_session_template_staffing
      where template_id = p_template_id and capacity = 'lead' and required
   )
  union all
  select 'an archived blueprint cannot publish'
   where (select status from mentis_session_templates where id = p_template_id) = 'archived';
$$;

-- Materialise one instance. p_start_at is the instant the user asked for; the
-- date part is taken in the blueprint's time zone and the blueprint's slot
-- times are applied, so a one-off lands on the same slot as its series.
create or replace function instantiate_session(
  p_template_id uuid,
  p_start_at    timestamptz default null,
  p_options     jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_tpl      mentis_session_templates%rowtype;
  v_date     date;
  v_start    timestamptz;
  v_end      timestamptz;
  v_session  uuid;
  v_slot     record;
  v_staff    uuid;
  v_card     uuid;
  v_lead     integer;
  v_staffed  integer := 0;
  v_roster   integer := 0;
  v_warnings jsonb := '[]'::jsonb;
  v_series   uuid := nullif(p_options->>'series_id', '')::uuid;
begin
  select * into v_tpl from mentis_session_templates where id = p_template_id;
  if not found then
    raise exception '%: session template % not found', '0013_session_templates.sql', p_template_id;
  end if;
  if v_tpl.status = 'archived' then
    raise exception '%: "%" is archived — reactivate the blueprint before scheduling from it', '0013_session_templates.sql', v_tpl.name;
  end if;
  if not is_admin(v_tpl.organization_id) then
    raise exception '%: only admins can schedule sessions from a blueprint', '0013_session_templates.sql';
  end if;

  if p_start_at is null then
    v_date := coalesce((p_options->>'occurrence_date')::date, current_date);
  else
    v_date := (p_start_at at time zone v_tpl.timezone)::date;
  end if;
  v_start := (v_date + v_tpl.default_start_time) at time zone v_tpl.timezone;
  v_end   := (v_date + v_tpl.default_end_time) at time zone v_tpl.timezone;

  -- Re-publishing a term must not duplicate what is already there: an instance
  -- of the same series (or the same blueprint + slot, for a one-off) is reused.
  select id into v_session
    from mentis_sessions
   where template_id = v_tpl.id
     and coalesce(series_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(v_series, '00000000-0000-0000-0000-000000000000'::uuid)
     and (occurrence_date = v_date or (occurrence_date is null and start_at = v_start));
  if v_session is not null then
    return jsonb_build_object('session_id', v_session, 'occurrence_date', v_date, 'existing', true,
                              'warnings', '[]'::jsonb);
  end if;

  insert into mentis_sessions (
    organization_id, venue_id, template_id, series_id, occurrence_date, blueprint,
    name, start_at, end_at, status, level_band, capacity, notes, generated_at
  ) values (
    v_tpl.organization_id,
    coalesce(nullif(p_options->>'venue_id', '')::uuid, v_tpl.venue_id),
    v_tpl.id, v_series, v_date, blueprint_snapshot(v_tpl.id),
    coalesce(nullif(p_options->>'name', ''), v_tpl.name),
    v_start, v_end,
    coalesce(nullif(p_options->>'status', ''), 'scheduled')::session_status,
    coalesce(nullif(p_options->>'level_band', ''), v_tpl.level_band),
    coalesce((p_options->>'capacity')::integer, v_tpl.capacity),
    coalesce(p_options->>'notes', v_tpl.description),
    coalesce((p_options->>'generated_at')::timestamptz, now())
  ) returning id into v_session;

  -- Fill the staffing plan. A named slot becomes a real staffing row (with the
  -- staff member's latest rate card when the slot does not pin one); an open
  -- slot is reported so the console can ask for a coach.
  if coalesce((p_options->>'assign_staff')::boolean, true) then
    for v_slot in
      select * from mentis_session_template_staffing
       where template_id = v_tpl.id
       order by sort_order, capacity
    loop
      v_staff := coalesce(v_slot.staff_id, case v_slot.capacity
                                                when 'lead' then v_tpl.leading_coach_id
                                                when 'assistant' then v_tpl.assisting_coach_id
                                                else null end);
      if v_staff is null then
        if v_slot.required then
          v_warnings := v_warnings || jsonb_build_object(
            'slot', v_slot.capacity,
            'message', format('%s slot is open — assign a coach', v_slot.capacity)
          );
        end if;
        continue;
      end if;

      v_card := coalesce(
        v_slot.rate_card_id,
        (select rc.id from mentis_rate_cards rc
          where rc.staff_id = v_staff
          order by rc.valid_from desc
          limit 1)
      );
      if v_card is null then
        v_warnings := v_warnings || jsonb_build_object(
          'slot', v_slot.capacity,
          'message', 'no rate card for this coach — staffing left open'
        );
        continue;
      end if;

      v_lead := greatest(0, v_slot.lead_minutes);
      begin
        insert into mentis_session_staffing (
          session_id, staff_id, capacity, rate_card_id, planned_start, planned_end
        ) values (
          v_session, v_staff, v_slot.capacity, v_card,
          v_start - make_interval(mins => v_lead),
          v_end + make_interval(mins => v_slot.trail_minutes)
        );
        v_staffed := v_staffed + 1;
      exception when others then
        v_warnings := v_warnings || jsonb_build_object(
          'slot', v_slot.capacity,
          'message', format('could not staff the %s slot: %s', v_slot.capacity, sqlerrm)
        );
      end;
    end loop;
  end if;

  -- Default roster: the register rows the blueprint expects to be filled.
  if coalesce((p_options->>'enroll_roster')::boolean, true) then
    insert into mentis_enrollments (session_id, member_id)
    select v_session, m.member_id
      from mentis_session_template_members m
     where m.template_id = v_tpl.id
    on conflict (session_id, member_id) do nothing;
    get diagnostics v_roster = row_count;
  end if;

  return jsonb_build_object(
    'session_id', v_session,
    'occurrence_date', v_date,
    'start_at', v_start,
    'end_at', v_end,
    'template_version', v_tpl.version,
    'staffed_slots', v_staffed,
    'roster_size', v_roster,
    'existing', false,
    'warnings', v_warnings
  );
end $$;

comment on function instantiate_session(uuid, timestamptz, jsonb) is
  'Create one session from a blueprint (staffing plan + default roster applied). Idempotent per slot.';

-- Publish a recurring run. Accepts either an inline rule (p_rule) or an existing
-- mentis_recurrence_rules row (p_options.rule_id). Occurrences are created in
-- order; a date that clashes with a scheduling guard is rolled back on its own
-- and reported in `conflicts`, so one bad date cannot abandon a term.
create or replace function instantiate_session_series(
  p_template_id uuid,
  p_rule        jsonb default '{}'::jsonb,
  p_options     jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_tpl       mentis_session_templates%rowtype;
  v_rule      mentis_recurrence_rules%rowtype;
  v_series    uuid := nullif(coalesce(p_options->>'series_id', p_rule->>'series_id'), '')::uuid;
  v_rule_id   uuid := nullif(coalesce(p_options->>'rule_id', p_rule->>'rule_id'), '')::uuid;
  v_label     text := coalesce(nullif(p_options->>'label', ''), nullif(p_rule->>'label', ''));
  v_rule_json jsonb;
  v_expansion jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_warnings  jsonb := '[]'::jsonb;
  v_generated integer := 0;
  v_requested integer := 0;
  v_existing  integer := 0;
  v_skipped_term   integer := 0;
  v_skipped_bank   integer := 0;
  v_skipped_manual integer := 0;
  v_created_at timestamptz := now();
  v_instance  jsonb;
  v_occ       record;
  v_warning   record;
begin
  select * into v_tpl from mentis_session_templates where id = p_template_id;
  if not found then
    raise exception '%: session template % not found', '0013_session_templates.sql', p_template_id;
  end if;
  if v_tpl.status = 'archived' then
    raise exception '%: "%" is archived — reactivate the blueprint before publishing a series', '0013_session_templates.sql', v_tpl.name;
  end if;
  if not is_admin(v_tpl.organization_id) then
    raise exception '%: only admins can publish a session series', '0013_session_templates.sql';
  end if;

  if v_rule_id is not null then
    select * into v_rule from mentis_recurrence_rules where id = v_rule_id;
    if not found then
      raise exception '%: recurrence rule % not found', '0013_session_templates.sql', v_rule_id;
    end if;
    v_rule_json := jsonb_build_object(
      'organization_id', v_rule.organization_id,
      'frequency', v_rule.frequency,
      'interval_count', v_rule.interval_count,
      'by_weekday', to_jsonb(v_rule.by_weekday),
      'start_time', v_rule.start_time,
      'end_time', v_rule.end_time,
      'timezone', v_tpl.timezone,
      'valid_from', v_rule.valid_from,
      'valid_to', v_rule.valid_to,
      'horizon_days', v_rule.horizon_days,
      'max_occurrences', v_rule.max_occurrences,
      'skip_term_holidays', v_rule.skip_term_holidays,
      'skip_bank_holidays', v_rule.skip_bank_holidays,
      'skip_manual_closures', v_rule.skip_manual_closures
    );
    v_rule_json := v_rule_json || coalesce(nullif(p_options->'rule', 'null'::jsonb), '{}'::jsonb);
  else
    v_rule_json := jsonb_build_object(
      'organization_id', v_tpl.organization_id,
      'frequency', 'weekly',
      'interval_count', 1,
      'by_weekday', '[]'::jsonb,
      'start_time', v_tpl.default_start_time,
      'end_time', v_tpl.default_end_time,
      'timezone', v_tpl.timezone,
      'valid_from', current_date,
      'valid_to', null,
      'horizon_days', 90,
      'skip_term_holidays', true,
      'skip_bank_holidays', true,
      'skip_manual_closures', true
    ) || coalesce(p_rule, '{}'::jsonb);
    v_rule_json := jsonb_set(v_rule_json, '{organization_id}', to_jsonb(v_tpl.organization_id));
    v_rule_json := jsonb_set(v_rule_json, '{timezone}', to_jsonb(coalesce(v_rule_json->>'timezone', v_tpl.timezone)));
  end if;

  -- A bounded season must not be truncated by the default 90-day horizon.
  if nullif(v_rule_json->>'valid_to', '') is not null then
    v_rule_json := jsonb_set(v_rule_json, '{horizon_days}', to_jsonb(least(730, greatest(
      coalesce((v_rule_json->>'horizon_days')::integer, 90),
      (v_rule_json->>'valid_to')::date - (v_rule_json->>'valid_from')::date + 1))));
  end if;

  -- One season per template per start date: re-publishing reuses it.
  if v_series is null then
    select s.id, coalesce(v_rule_id, s.recurrence_rule_id) into v_series, v_rule_id
      from mentis_session_series s
     where s.template_id = v_tpl.id and s.starts_on = (v_rule_json->>'valid_from')::date;
    if v_series is null then
      v_rule_id := nullif(coalesce(p_options->>'rule_id', p_rule->>'rule_id'), '')::uuid;
    end if;
  end if;

  if ((v_rule_json->>'start_time')::time >= (v_rule_json->>'end_time')::time) then
    raise exception '%: recurrence rule for template "%" has invalid time order (% -> %); end_time must be later than start_time',
      '0013_session_templates.sql',
      v_tpl.name,
      v_rule_json->>'start_time',
      v_rule_json->>'end_time';
  end if;

  if v_rule_id is null then
    if v_series is null or not exists (select 1 from mentis_session_series where id = v_series) then
      insert into mentis_recurrence_rules (
        organization_id, template_id, label, frequency, interval_count, by_weekday,
        start_time, end_time, valid_from, valid_to, horizon_days, max_occurrences,
        skip_term_holidays, skip_bank_holidays, skip_manual_closures
      ) values (
        (v_rule_json->>'organization_id')::uuid, v_tpl.id, v_label,
        v_rule_json->>'frequency',
        coalesce((v_rule_json->>'interval_count')::integer, 1),
        coalesce(
          (select array_agg(value::smallint order by value::smallint)
             from jsonb_array_elements_text(coalesce(v_rule_json->'by_weekday', '[]'::jsonb))),
          '{}'::smallint[]
        ),
        (v_rule_json->>'start_time')::time,
        (v_rule_json->>'end_time')::time,
        (v_rule_json->>'valid_from')::date,
        nullif(v_rule_json->>'valid_to', '')::date,
        coalesce((v_rule_json->>'horizon_days')::integer, 90),
        (v_rule_json->>'max_occurrences')::integer,
        coalesce((v_rule_json->>'skip_term_holidays')::boolean, true),
        coalesce((v_rule_json->>'skip_bank_holidays')::boolean, true),
        coalesce((v_rule_json->>'skip_manual_closures')::boolean, true)
      ) returning id into v_rule_id;
    else
      select recurrence_rule_id into v_rule_id from mentis_session_series where id = v_series;
    end if;
  end if;

  if v_series is not null and not exists (select 1 from mentis_session_series where id = v_series) then
    v_series := null;
  end if;

  if v_series is null then
    insert into mentis_session_series (
      organization_id, template_id, recurrence_rule_id, label, venue_id, starts_on, ends_on,
      status, template_version, created_by
    ) values (
      v_tpl.organization_id, v_tpl.id, v_rule_id, v_label, v_tpl.venue_id,
      (v_rule_json->>'valid_from')::date,
      nullif(v_rule_json->>'valid_to', '')::date,
      coalesce(nullif(p_options->>'status', ''), 'active'),
      v_tpl.version,
      coalesce((p_options->>'created_by')::uuid, auth.uid())
    ) returning id into v_series;
  else
    update mentis_session_series
       set template_version = v_tpl.version, updated_at = now()
     where id = v_series;
  end if;

  for v_occ in
    select * from session_template_occurrences(v_rule_json || jsonb_build_object('series_id', v_series))
  loop
    v_expansion := v_expansion || jsonb_build_object(
      'date', v_occ.occurrence_date,
      'action', v_occ.action,
      'holiday_name', v_occ.holiday_name,
      'holiday_kind', v_occ.holiday_kind,
      'starts_at', v_occ.starts_at
    );

    if v_occ.action = 'skip' then
      if v_occ.holiday_kind = 'bank_holiday' then
        v_skipped_bank := v_skipped_bank + 1;
      elsif v_occ.holiday_kind = 'term_break' then
        v_skipped_term := v_skipped_term + 1;
      else
        v_skipped_manual := v_skipped_manual + 1;
      end if;
      continue;
    end if;

    v_requested := v_requested + 1;

    if exists (select 1 from mentis_sessions where series_id = v_series and occurrence_date = v_occ.occurrence_date) then
      v_existing := v_existing + 1;
      continue;
    end if;

    -- Each date is materialised in its own sub-transaction: the scheduling
    -- guards (venue concurrency, staff overlap, no-session days) raise, and we
    -- record that date instead of losing the rest of the run.
    begin
      v_instance := instantiate_session(
        v_tpl.id,
        v_occ.starts_at,
        jsonb_build_object(
          'series_id', v_series,
          'occurrence_date', v_occ.occurrence_date,
          'generated_at', v_created_at,
          'assign_staff', coalesce((p_options->>'assign_staff')::boolean, true),
          'enroll_roster', coalesce((p_options->>'enroll_roster')::boolean, true)
        ) || coalesce(p_options->'instance', '{}'::jsonb)
      );
      if v_instance->>'existing' = 'true' then
        v_existing := v_existing + 1;
      else
        v_generated := v_generated + 1;
      end if;
      for v_warning in
        select value from jsonb_array_elements(coalesce(v_instance->'warnings', '[]'::jsonb))
      loop
        v_warnings := v_warnings || (v_warning.value || jsonb_build_object('date', v_occ.occurrence_date));
      end loop;
    exception when others then
      v_conflicts := v_conflicts || jsonb_build_object(
        'date', v_occ.occurrence_date,
        'starts_at', v_occ.starts_at,
        'message', sqlerrm
      );
    end;
  end loop;

  if v_generated > 0 then
    update mentis_session_series
       set ends_on = greatest(coalesce(ends_on, (v_rule_json->>'valid_from')::date),
                              (select max(occurrence_date) from mentis_sessions where series_id = v_series)),
           updated_at = now()
     where id = v_series;
  end if;

  return jsonb_build_object(
    'series_id', v_series,
    'rule_id', v_rule_id,
    'requested', v_requested,
    'generated', v_generated,
    'existing', v_existing,
    'skipped_existing', v_existing,
    'skipped_term_holidays', v_skipped_term,
    'skipped_bank_holidays', v_skipped_bank,
    'skipped_manual_closures', v_skipped_manual,
    'occurrences', v_expansion,
    'conflicts', v_conflicts,
    'warnings', v_warnings
  );
end $$;

comment on function instantiate_session_series(uuid, jsonb, jsonb) is
  'Publish a recurring run of a blueprint: creates/uses the series and materialises its occurrences.';

-- Materialise more of an existing series up to its horizon.
create or replace function extend_session_series(p_series_id uuid, p_options jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_series mentis_session_series%rowtype;
  v_rule   mentis_recurrence_rules%rowtype;
begin
  select * into v_series from mentis_session_series where id = p_series_id;
  if not found then
    raise exception '%: session series % not found', '0013_session_templates.sql', p_series_id;
  end if;
  if v_series.status = 'ended' then
    raise exception '%: this series has ended — resume it before extending', '0013_session_templates.sql';
  end if;

  select * into v_rule from mentis_recurrence_rules where id = v_series.recurrence_rule_id;

  return instantiate_session_series(
    v_series.template_id,
    jsonb_build_object(
      'organization_id', v_series.organization_id,
      'frequency', v_rule.frequency,
      'interval_count', v_rule.interval_count,
      'by_weekday', to_jsonb(v_rule.by_weekday),
      'start_time', v_rule.start_time,
      'end_time', v_rule.end_time,
      'valid_from', v_rule.valid_from,
      'valid_to', v_rule.valid_to,
      'horizon_days', coalesce((p_options->>'horizon_days')::integer, v_rule.horizon_days),
      'max_occurrences', v_rule.max_occurrences,
      'skip_term_holidays', v_rule.skip_term_holidays,
      'skip_bank_holidays', v_rule.skip_bank_holidays,
      'skip_manual_closures', v_rule.skip_manual_closures
    ) || coalesce(p_options->'rule', '{}'::jsonb),
    jsonb_build_object('series_id', p_series_id, 'rule_id', v_rule.id) || coalesce(p_options, '{}'::jsonb)
  );
end $$;

comment on function extend_session_series(uuid, jsonb) is
  'Materialise more occurrences of a series (extends up to the rule horizon).';

-- Pause / resume / end a series. Cancelling future instances is explicit, and
-- ending never touches past or already-cancelled instances.
create or replace function set_session_series_status(
  p_series_id     uuid,
  p_status        text,
  p_cancel_future boolean default false,
  p_reason        text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_series mentis_session_series%rowtype;
  v_cancelled integer := 0;
begin
  if p_status not in ('active', 'paused', 'ended') then
    raise exception '%: unknown series status %', '0013_session_templates.sql', p_status;
  end if;

  select * into v_series from mentis_session_series where id = p_series_id;
  if not found then
    raise exception '%: session series % not found', '0013_session_templates.sql', p_series_id;
  end if;
  if not is_admin(v_series.organization_id) then
    raise exception '%: only admins can change a session series', '0013_session_templates.sql';
  end if;

  update mentis_session_series
     set status = p_status,
         ends_on = case when p_status = 'ended'
                        then coalesce((select max(occurrence_date) from mentis_sessions where series_id = p_series_id), ends_on)
                        else ends_on end,
         updated_at = now()
   where id = p_series_id;

  if p_status = 'ended' and p_cancel_future then
    update mentis_sessions
       set status = 'cancelled',
           cancel_reason = coalesce(nullif(p_reason, ''), cancel_reason, 'series ended')
     where series_id = p_series_id
       and start_at > now()
       and status <> 'cancelled';
    get diagnostics v_cancelled = row_count;
  end if;

  return jsonb_build_object(
    'series_id', p_series_id,
    'status', p_status,
    'cancelled_instances', v_cancelled
  );
end $$;

comment on function set_session_series_status(uuid, text, boolean, text) is
  'Pause, resume or end a published series, optionally cancelling its future instances.';

-- Put a drifted instance back on the blueprint — only the fields that differ,
-- or the ones the caller lists. Attendance, registers, staffing edits and
-- invoices are never touched.
create or replace function apply_blueprint_to_session(
  p_session_id uuid,
  p_fields     text[] default null,
  p_source     text default 'blueprint'
)
returns jsonb
language plpgsql
as $$
declare
  v_session   mentis_sessions%rowtype;
  v_tpl       mentis_session_templates%rowtype;
  v_base      date;
  v_fields    text[];
  v_applied   text[];
  v_remaining text[];
  v_start     timestamptz;
  v_end       timestamptz;
begin
  select * into v_session from mentis_sessions where id = p_session_id;
  if not found then
    raise exception '%: session % not found', '0013_session_templates.sql', p_session_id;
  end if;
  if v_session.template_id is null then
    raise exception '%: this session was not created from a blueprint', '0013_session_templates.sql';
  end if;
  if not is_admin(v_session.organization_id) then
    raise exception '%: only admins can re-apply a blueprint', '0013_session_templates.sql';
  end if;

  select * into v_tpl from mentis_session_templates where id = v_session.template_id;

  v_base := coalesce(v_session.occurrence_date, (v_session.start_at at time zone v_tpl.timezone)::date);
  v_start := (v_base + v_tpl.default_start_time) at time zone v_tpl.timezone;
  v_end   := (v_base + v_tpl.default_end_time) at time zone v_tpl.timezone;

  -- No field list = re-apply exactly what drifted, nothing else.
  v_fields := coalesce(p_fields, v_session.overridden_fields, '{}');
  v_applied := array(select f from unnest(v_fields) as f);
  v_remaining := array(select f from unnest(coalesce(v_session.overridden_fields, '{}')) as f where f <> all (v_applied));

  update mentis_sessions s
     set name        = case when 'name'        = any (v_applied) then v_tpl.name              else s.name end,
         start_at    = case when 'start_at'    = any (v_applied) then v_start               else s.start_at end,
         end_at      = case when 'end_at'      = any (v_applied) then v_end                 else s.end_at end,
         venue_id    = case when 'venue_id'    = any (v_applied) then v_tpl.venue_id        else s.venue_id end,
         capacity    = case when 'capacity'    = any (v_applied) then v_tpl.capacity        else s.capacity end,
         level_band  = case when 'level_band'  = any (v_applied) then v_tpl.level_band      else s.level_band end,
         blueprint   = blueprint_snapshot(v_tpl.id),
         overridden_fields = v_remaining,
         is_exception = coalesce(array_length(v_remaining, 1), 0) > 0
   where s.id = p_session_id;

  return jsonb_build_object(
    'session_id', p_session_id,
    'source', coalesce(p_source, 'blueprint'),
    'template_version', v_tpl.version,
    'applied', to_jsonb(v_applied),
    'remaining_overrides', to_jsonb(coalesce(v_remaining, '{}'))
  );
end $$;

comment on function apply_blueprint_to_session(uuid, text[], text) is
  'Re-apply blueprint values to a drifted instance (defaults to the drifted fields only).';

-- Bring an older version back as the current one (recorded as a new version), so
-- the next season is published from it without rewriting existing seasons.
create or replace function restore_session_template_version(p_template_id uuid, p_version integer)
returns integer
language plpgsql
as $$
declare
  v_org  uuid;
  v_snap jsonb;
  v_ver  integer;
begin
  select organization_id into v_org from mentis_session_templates where id = p_template_id;
  if v_org is null then
    raise exception '%: session template % not found', '0013_session_templates.sql', p_template_id;
  end if;
  if not is_admin(v_org) then
    raise exception '%: only admins can restore a template version', '0013_session_templates.sql';
  end if;

  select snapshot into v_snap from mentis_session_template_versions
   where template_id = p_template_id and version = p_version;
  if v_snap is null then
    raise exception '%: template % has no version %', '0013_session_templates.sql', p_template_id, p_version;
  end if;

  update mentis_session_templates set
    name                 = v_snap->>'name',
    description          = v_snap->>'description',
    venue_id             = (v_snap->>'venue_id')::uuid,
    default_start_time   = (v_snap->>'default_start_time')::time,
    default_end_time     = (v_snap->>'default_end_time')::time,
    timezone             = v_snap->>'timezone',
    level_band           = v_snap->>'level_band',
    capacity             = (v_snap->>'capacity')::integer,
    min_headcount        = (v_snap->>'min_headcount')::integer,
    default_charge_cents = (v_snap->>'default_charge_cents')::integer,
    responsible_coach_id = (v_snap->>'responsible_coach_id')::uuid,
    leading_coach_id     = (v_snap->>'leading_coach_id')::uuid,
    assisting_coach_id   = (v_snap->>'assisting_coach_id')::uuid
  where id = p_template_id
  returning version into v_ver;

  return v_ver;
end $$;

comment on function restore_session_template_version(uuid, integer) is
  'Make an older template version current again (as a new version) before starting a season from it.';

-- ---------------------------------------------------------------------------
-- Layer 4 — bridge from the legacy weekly schedules
-- ---------------------------------------------------------------------------

-- The legacy weekly schedules keep working: they gain a pointer to the
-- blueprint they now describe, so Scheduling can show and edit the same entity.
alter table mentis_weekly_schedules
  add column if not exists template_id       uuid references mentis_session_templates(id) on delete set null,
  add column if not exists recurrence_rule_id uuid references mentis_recurrence_rules(id) on delete set null;

comment on column mentis_weekly_schedules.template_id is
  'Blueprint this legacy weekly pattern was imported into; null until template_from_weekly_schedule() runs.';

-- Import one weekly schedule as blueprint + rule + series and re-point its
-- sessions. Idempotent: a schedule that already has a template is returned.
create or replace function template_from_weekly_schedule(p_schedule_id uuid)
returns uuid
language plpgsql
as $$
declare
  w      mentis_weekly_schedules%rowtype;
  v_tpl  uuid;
  v_rule uuid;
  v_ser  uuid;
begin
  select * into w from mentis_weekly_schedules where id = p_schedule_id;
  if not found then
    raise exception '%: weekly schedule % not found', '0013_session_templates.sql', p_schedule_id;
  end if;

  if w.template_id is not null then
    select id into v_tpl from mentis_session_templates where id = w.template_id;
    if v_tpl is not null then
      return v_tpl;
    end if;
  end if;

  if w.venue_id is null then
    select id into w.venue_id
      from mentis_venues
     where organization_id = w.organization_id
     order by name
     limit 1;
  end if;

  if w.venue_id is null then
    raise exception '%: weekly schedule % has no venue for legacy template import', '0013_session_templates.sql', p_schedule_id;
  end if;

  -- The same schedule can be imported twice in one session; the unique key on
  -- (organization, name, venue) makes the second call reuse the first template.
  select id into v_tpl from mentis_session_templates
   where organization_id = w.organization_id and name = w.name and venue_id = w.venue_id;

  if v_tpl is null then
    insert into mentis_session_templates (
      organization_id, code, name, venue_id, default_start_time, default_end_time,
      responsible_coach_id, leading_coach_id, assisting_coach_id, status
    ) values (
      w.organization_id,
      'WKY-' || upper(substr(replace(w.id::text, '-', ''), 1, 6)),
      w.name, w.venue_id, w.start_time, w.end_time,
      w.responsible_coach_id, w.leading_coach_id, w.assisting_coach_id, 'active'
    ) returning id into v_tpl;
  end if;

  -- Carry the schedule's staffing expectations across as blueprint slots.
  insert into mentis_session_template_staffing (template_id, capacity, staff_id, rate_card_id)
  select v_tpl, ss.capacity, ss.staff_id, ss.rate_card_id
    from mentis_schedule_staff ss
   where ss.schedule_id = w.id
  on conflict (template_id, capacity, staff_id) do nothing;

  insert into mentis_recurrence_rules (
    organization_id, template_id, label, frequency, by_weekday, start_time, end_time, valid_from, valid_to
  ) values (
    w.organization_id, v_tpl, w.name, 'weekly',
    array[(case when w.day_of_week = 0 then 7 else w.day_of_week end)::smallint],
    w.start_time, w.end_time, w.valid_from, w.valid_to
  ) returning id into v_rule;

  insert into mentis_session_series (
    organization_id, template_id, recurrence_rule_id, label, venue_id, starts_on, ends_on, status
  ) values (
    w.organization_id, v_tpl, v_rule, w.name, w.venue_id, w.valid_from, w.valid_to, 'active'
  ) returning id into v_ser;

  update mentis_weekly_schedules
     set template_id = v_tpl, recurrence_rule_id = v_rule
   where id = w.id;

  update mentis_sessions s
     set template_id = v_tpl,
         series_id = v_ser,
         occurrence_date = s.start_at::date,
         blueprint = blueprint_snapshot(v_tpl),
         generated_at = coalesce(s.generated_at, now())
   where s.schedule_id = w.id
     and s.template_id is null;

  return v_tpl;
end $$;

comment on function template_from_weekly_schedule(uuid) is
  'Import a legacy weekly schedule as a blueprint + rule + series (idempotent).';

-- The bridge table is optional metadata for auxiliary context links. It is not
-- part of the recurrence contract: each generated session keeps its canonical
-- series_id on mentis_sessions and is not required to write a row here.
create or replace function sync_session_series_link() returns trigger
language plpgsql
as $$
begin
  return new;
end $$;

-- Instances created the old way (by writing mentis_sessions with a schedule_id)
-- still get the full provenance, so nothing in flight loses its blueprint.
create or replace function link_session_blueprint() returns trigger
language plpgsql
as $$
declare
  v_tpl uuid;
  v_ser uuid;
begin
  if new.template_id is null and new.schedule_id is not null then
    select template_id into v_tpl from mentis_weekly_schedules where id = new.schedule_id;
    if v_tpl is not null then
      select id into v_ser from mentis_session_series
       where template_id = v_tpl
       order by (status = 'active') desc, starts_on desc
       limit 1;
      new.template_id := v_tpl;
      new.series_id := coalesce(new.series_id, v_ser);
    end if;
  end if;

  if new.template_id is not null then
    new.occurrence_date := coalesce(new.occurrence_date, new.start_at::date);
    new.blueprint := coalesce(new.blueprint, blueprint_snapshot(new.template_id));
    new.generated_at := coalesce(new.generated_at, now());
  end if;
  return new;
end $$;

drop trigger if exists sessions_link_blueprint on mentis_sessions;
create trigger sessions_link_blueprint before insert on mentis_sessions
  for each row execute function link_session_blueprint();

drop trigger if exists sessions_sync_series_link on mentis_sessions;

-- Backfill every schedule that exists today.
do $$
declare
  w uuid;
begin
  for w in select id from mentis_weekly_schedules where template_id is null loop
    perform template_from_weekly_schedule(w);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Layer 5 — views
-- ---------------------------------------------------------------------------

create or replace view session_template_overview with (security_invoker = true) as
  select
    t.id,
    t.organization_id,
    t.code,
    t.name,
    t.description,
    t.venue_id,
    v.name                                   as venue_name,
    t.default_start_time,
    t.default_end_time,
    t.timezone,
    t.level_band,
    t.capacity,
    t.min_headcount,
    t.default_charge_cents,
    t.responsible_coach_id,
    t.leading_coach_id,
    t.assisting_coach_id,
    t.status,
    t.version,
    t.tags,
    t.created_at,
    t.updated_at,
    (select count(*) from mentis_session_series s where s.template_id = t.id and s.status = 'active')  as active_series,
    (select count(*) from mentis_session_template_staffing s where s.template_id = t.id)              as staffing_slots,
    (select count(*) from mentis_session_template_members m where m.template_id = t.id)              as roster_size,
    (select count(*) from mentis_sessions i
      where i.template_id = t.id and i.status <> 'cancelled' and i.start_at >= now())                as upcoming_instances,
    (select count(*) from mentis_sessions i where i.template_id = t.id and i.is_exception)           as drifted_instances,
    (select min(i.start_at) from mentis_sessions i
      where i.template_id = t.id and i.status <> 'cancelled' and i.start_at >= now())                as next_occurrence_at
  from mentis_session_templates t
  join mentis_venues v on v.id = t.venue_id;

comment on view session_template_overview is
  'Blueprint + roll-up counts (series, slots, roster, upcoming, drift) for the console rail.';

create or replace view session_series_overview with (security_invoker = true) as
  select
    s.id,
    s.organization_id,
    s.template_id,
    t.name                                as template_name,
    s.label,
    s.venue_id,
    v.name                                as venue_name,
    s.starts_on,
    s.ends_on,
    s.status,
    r.frequency,
    r.interval_count,
    r.by_weekday,
    r.start_time,
    r.end_time,
    s.template_version,
    t.version                             as blueprint_version,
    (select count(*) from mentis_sessions i where i.series_id = s.id)                             as instance_count,
    (select count(*) from mentis_sessions i where i.series_id = s.id and i.is_exception)          as exception_count,
    (select count(*) from mentis_sessions i where i.series_id = s.id and i.status = 'cancelled')  as cancelled_instances,
    (select min(i.start_at) from mentis_sessions i
      where i.series_id = s.id and i.status <> 'cancelled' and i.start_at >= now())               as next_occurrence_at
  from mentis_session_series s
  join mentis_session_templates t on t.id = s.template_id
  left join mentis_venues v on v.id = s.venue_id
  join mentis_recurrence_rules r on r.id = s.recurrence_rule_id;

comment on view session_series_overview is
  'Series + pattern + per-series instance/drift counts, and whether it lags the blueprint version.';

-- ---------------------------------------------------------------------------
-- Layer 6 — RLS
-- ---------------------------------------------------------------------------

alter table mentis_session_templates          enable row level security;
alter table mentis_session_template_staffing  enable row level security;
alter table mentis_session_template_members   enable row level security;
alter table mentis_recurrence_rules           enable row level security;
alter table mentis_session_series             enable row level security;
alter table mentis_session_series_links       enable row level security;
alter table mentis_session_template_versions  enable row level security;

drop policy if exists session_template_versions_select on mentis_session_template_versions;
create policy session_template_versions_select on mentis_session_template_versions
  for select using (is_staff((select t.organization_id from mentis_session_templates t where t.id = template_id)));

-- Blueprints are documentation of how the club runs: any staff member may read
-- them, only admins may change them.
drop policy if exists session_templates_select on mentis_session_templates;
create policy session_templates_select on mentis_session_templates
  for select using (is_staff(organization_id));
drop policy if exists session_templates_write on mentis_session_templates;
create policy session_templates_write on mentis_session_templates
  for all using (is_admin(organization_id)) with check (is_admin(organization_id));

drop policy if exists session_template_staffing_select on mentis_session_template_staffing;
create policy session_template_staffing_select on mentis_session_template_staffing
  for select using (is_staff((select t.organization_id from mentis_session_templates t where t.id = template_id)));
drop policy if exists session_template_staffing_write on mentis_session_template_staffing;
create policy session_template_staffing_write on mentis_session_template_staffing
  for all using (is_admin((select t.organization_id from mentis_session_templates t where t.id = template_id)))
  with check (is_admin((select t.organization_id from mentis_session_templates t where t.id = template_id)));

drop policy if exists session_template_members_select on mentis_session_template_members;
create policy session_template_members_select on mentis_session_template_members
  for select using (is_staff((select t.organization_id from mentis_session_templates t where t.id = template_id)));
drop policy if exists session_template_members_write on mentis_session_template_members;
create policy session_template_members_write on mentis_session_template_members
  for all using (is_admin((select t.organization_id from mentis_session_templates t where t.id = template_id)))
  with check (is_admin((select t.organization_id from mentis_session_templates t where t.id = template_id)));

drop policy if exists recurrence_rules_select on mentis_recurrence_rules;
create policy recurrence_rules_select on mentis_recurrence_rules
  for select using (is_staff(organization_id));
drop policy if exists recurrence_rules_write on mentis_recurrence_rules;
create policy recurrence_rules_write on mentis_recurrence_rules
  for all using (is_admin(organization_id)) with check (is_admin(organization_id));

drop policy if exists session_series_select on mentis_session_series;
create policy session_series_select on mentis_session_series
  for select using (is_staff(organization_id));
drop policy if exists session_series_write on mentis_session_series;
create policy session_series_write on mentis_session_series
  for all using (is_admin(organization_id)) with check (is_admin(organization_id));

drop policy if exists session_series_links_select on mentis_session_series_links;
create policy session_series_links_select on mentis_session_series_links
  for select using (is_staff((select s.organization_id from mentis_session_series s where s.id = series_id)));
drop policy if exists session_series_links_write on mentis_session_series_links;
create policy session_series_links_write on mentis_session_series_links
  for all using (is_admin((select s.organization_id from mentis_session_series s where s.id = series_id)))
  with check (is_admin((select s.organization_id from mentis_session_series s where s.id = series_id)));

grant select on session_template_overview to authenticated;
grant select on mentis_session_template_versions to authenticated;
grant select on session_series_overview to authenticated;
grant select, insert, update, delete on mentis_session_templates,
  mentis_session_template_staffing, mentis_session_template_members,
  mentis_recurrence_rules, mentis_session_series, mentis_session_series_links to authenticated;
grant execute on function
  expand_recurrence(jsonb),
  session_template_occurrences(jsonb),
  blueprint_snapshot(uuid),
  session_blueprint_drift(uuid, text, timestamptz, timestamptz, uuid, integer, text, date),
  blueprint_drift_fields(uuid, uuid),
  template_completeness(uuid),
  instantiate_session(uuid, timestamptz, jsonb),
  instantiate_session_series(uuid, jsonb, jsonb),
  extend_session_series(uuid, jsonb),
  set_session_series_status(uuid, text, boolean, text),
  apply_blueprint_to_session(uuid, text[], text),
  restore_session_template_version(uuid, integer),
  template_from_weekly_schedule(uuid)
to authenticated, service_role;

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0014_session_member_ranges.sql';
END $$;


-- 0014_session_member_ranges.sql
-- Add validity windows for member-to-session/template membership and persist the
-- parent template reference on child sessions so cohort edits can be mapped back
-- to the source template and cascaded when needed.

-- Keep this migration safe on partially-migrated databases: if the template
-- roster table was not created by 0013 (or was dropped during a reset attempt),
-- create the canonical shape first and continue.
do $$
begin
  if to_regclass('public.mentis_session_templates') is null then
    raise exception '%: mentis_session_templates is missing; run migrations from 0001_foundation.sql in order.', '0014_session_member_ranges.sql';
  end if;

  if to_regclass('public.mentis_session_template_members') is null then
    create table mentis_session_template_members (
      template_id uuid not null references mentis_session_templates(id) on delete cascade,
      member_id   uuid not null references mentis_members(id) on delete cascade,
      added_at    timestamptz not null default now(),
      valid_from  date,
      valid_to    date,
      primary key (template_id, member_id)
    );
  end if;
end $$;

alter table mentis_session_template_members
  add column if not exists valid_from date,
  add column if not exists valid_to date;

alter table mentis_enrollments
  add column if not exists valid_from date,
  add column if not exists valid_to date,
  add column if not exists source text not null default 'manual';

alter table mentis_enrollments
  drop constraint if exists enrollment_source_check;

alter table mentis_enrollments
  add constraint enrollment_source_check check (source in ('manual', 'template'));

alter table mentis_sessions
  add column if not exists parent_template_id uuid references mentis_session_templates(id) on delete set null;

update mentis_sessions
set parent_template_id = template_id
where parent_template_id is null and template_id is not null;

alter table mentis_session_template_members
  drop constraint if exists session_template_member_range_check;

alter table mentis_session_template_members
  add constraint session_template_member_range_check
  check (valid_from is null or valid_to is null or valid_to >= valid_from);

alter table mentis_enrollments
  drop constraint if exists enrollment_range_check;

alter table mentis_enrollments
  add constraint enrollment_range_check
  check (valid_from is null or valid_to is null or valid_to >= valid_from);

comment on column mentis_session_template_members.valid_from is
  'Start date for this member being in the default roster for the template.';
comment on column mentis_session_template_members.valid_to is
  'Optional end date for this member being in the default roster for the template.';
comment on column mentis_enrollments.valid_from is
  'Start date for the member being assigned to this session instance.';
comment on column mentis_enrollments.valid_to is
  'Optional end date for the member being assigned to this session instance.';
comment on column mentis_enrollments.source is
  'template = maintained by the template roster sync; manual = added to this class directly and never removed by the sync.';
comment on column mentis_sessions.parent_template_id is
  'Explicit pointer back to the session template that generated this child session.';

drop trigger if exists session_parent_template_sync on mentis_sessions;

drop function if exists sync_session_parent_template_id();

create or replace function sync_session_parent_template_id()
returns trigger
language plpgsql
as $$
begin
  if new.template_id is not null then
    new.parent_template_id := new.template_id;
  elsif old is not null and old.template_id is not null and new.template_id is null then
    new.parent_template_id := old.template_id;
  end if;
  return new;
end $$;

create trigger session_parent_template_sync
before insert or update of template_id on mentis_sessions
for each row
execute function sync_session_parent_template_id();

create index if not exists sessions_parent_template_idx
  on mentis_sessions (parent_template_id, start_at);

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0015_template_member_cascade.sql';
END $$;


-- 0015_template_member_cascade.sql
-- Sync template roster changes to generated child sessions and keep a parent
-- template pointer in place for future cascade operations.

drop function if exists template_member_active_on_date(date, date, date);
drop function if exists sync_template_roster_to_child_sessions(uuid, date, date);
drop function if exists session_template_child_sessions(uuid, date, date);

create or replace function template_member_active_on_date(
  p_valid_from date,
  p_valid_to date,
  p_session_date date
)
returns boolean
language sql
stable
as $$
  select
    (p_valid_from is null or p_session_date >= p_valid_from)
    and (p_valid_to is null or p_session_date <= p_valid_to);
$$;

create or replace function sync_template_roster_to_child_sessions(
  p_template_id uuid,
  p_session_date_from date default null,
  p_session_date_to date default null
)
returns jsonb
language plpgsql
as $$
declare
  v_inserted integer := 0;
  v_updated integer := 0;
  v_deleted integer := 0;
  v_session_date_from date := p_session_date_from;
  v_session_date_to date := p_session_date_to;
begin
  if v_session_date_from is null then
    v_session_date_from := current_date - 365;
  end if;

  if v_session_date_to is null then
    v_session_date_to := current_date + 3650;
  end if;

  with active_members as (
    select
      tm.member_id,
      tm.valid_from,
      tm.valid_to,
      s.id as session_id,
      s.start_at::date as session_date
    from mentis_session_template_members tm
    join mentis_sessions s
      on s.parent_template_id = p_template_id
     and s.start_at::date between v_session_date_from and v_session_date_to
    where tm.template_id = p_template_id
      and template_member_active_on_date(tm.valid_from, tm.valid_to, s.start_at::date)
  ),
  inserted_rows as (
    insert into mentis_enrollments (session_id, member_id, valid_from, valid_to, source)
    select session_id, member_id, valid_from, valid_to, 'template'
    from active_members
    on conflict (session_id, member_id)
    do update set
      valid_from = coalesce(excluded.valid_from, mentis_enrollments.valid_from),
      valid_to = coalesce(excluded.valid_to, mentis_enrollments.valid_to),
      source = 'template',
      expected = true,
      status = coalesce(mentis_enrollments.status, 'active')
    returning 1
  )
  select count(*) into v_inserted from inserted_rows;

  with active_members as (
    select tm.member_id
    from mentis_session_template_members tm
    where tm.template_id = p_template_id
  ),
  stale_rows as (
    select e.session_id, e.member_id
    from mentis_enrollments e
    join mentis_sessions s
      on s.id = e.session_id
    where s.parent_template_id = p_template_id
      and e.source = 'template'
      and e.session_id in (
        select id
        from mentis_sessions
        where parent_template_id = p_template_id
          and start_at::date between v_session_date_from and v_session_date_to
      )
      and not exists (
        select 1
        from active_members am
        where am.member_id = e.member_id
      )
  ),
  deleted_rows as (
    delete from mentis_enrollments e
    using stale_rows sr
    where e.session_id = sr.session_id
      and e.member_id = sr.member_id
      and e.source = 'template'
    returning e.session_id
  )
  select count(*) into v_deleted from deleted_rows;

  with expected_active_members as (
    select
      s.id as session_id,
      tm.member_id,
      tm.valid_from,
      tm.valid_to
    from mentis_sessions s
    join mentis_session_template_members tm
      on tm.template_id = p_template_id
    where s.parent_template_id = p_template_id
      and s.start_at::date between v_session_date_from and v_session_date_to
      and template_member_active_on_date(tm.valid_from, tm.valid_to, s.start_at::date)
  ),
  updated_rows as (
    update mentis_enrollments e
    set valid_from = eam.valid_from,
        valid_to = eam.valid_to,
        source = 'template',
        expected = true
    from expected_active_members eam
    where e.session_id = eam.session_id
      and e.member_id = eam.member_id
      and e.source = 'template'
    returning e.session_id
  )
  select count(*) into v_updated from updated_rows;

  return jsonb_build_object(
    'template_id', p_template_id,
    'session_date_from', v_session_date_from,
    'session_date_to', v_session_date_to,
    'inserted', v_inserted,
    'updated', v_updated,
    'deleted', v_deleted
  );
end $$;

comment on function sync_template_roster_to_child_sessions(uuid, date, date) is
  'Reconcile a template default roster into child sessions generated from that template within the requested date window.';

create or replace function session_template_child_sessions(
  p_template_id uuid,
  p_session_date_from date default null,
  p_session_date_to date default null
)
returns table (
  session_id uuid,
  session_date date,
  member_id uuid,
  member_name text,
  valid_from date,
  valid_to date,
  active boolean
)
language sql
stable
as $$
  select
    s.id as session_id,
    s.start_at::date as session_date,
    tm.member_id,
    m.name as member_name,
    tm.valid_from,
    tm.valid_to,
    template_member_active_on_date(tm.valid_from, tm.valid_to, s.start_at::date) as active
  from mentis_sessions s
  join mentis_session_template_members tm
    on tm.template_id = s.parent_template_id
  join mentis_members m
    on m.id = tm.member_id
  where s.parent_template_id = p_template_id
    and (p_session_date_from is null or s.start_at::date >= p_session_date_from)
    and (p_session_date_to is null or s.start_at::date <= p_session_date_to)
  order by s.start_at, m.name;
$$;

comment on function session_template_child_sessions(uuid, date, date) is
  'List the template roster members as they apply to each child session row, including their active validity window.';

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0016_session_series_roster.sql';
END $$;


-- 0016_session_series_roster.sql
-- Date-aware effective roster logic for template-backed program runs.
--
-- The key rule is: a member is visible for a session occurrence only when the
-- occurrence date falls within the member's active validity window. The program
-- run roster is therefore not a flat list; it is a date-indexed projection of
-- the template roster and the per-instance enrollments.

drop function if exists effective_member_window_active_on_date(date, date, date);
drop function if exists session_series_effective_roster(uuid, date, date);
drop function if exists session_template_effective_roster(uuid, date, date);

create or replace function effective_member_window_active_on_date(
  p_valid_from date,
  p_valid_to date,
  p_occurrence_date date
)
returns boolean
language sql
stable
as $$
  select
    (p_valid_from is null or p_occurrence_date >= p_valid_from)
    and (p_valid_to is null or p_occurrence_date <= p_valid_to);
$$;

comment on function effective_member_window_active_on_date(date, date, date) is
  'Returns true when the given occurrence date falls within a member validity window.';

create or replace function session_series_effective_roster(
  p_series_id uuid,
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  session_id uuid,
  occurrence_date date,
  member_id uuid,
  member_name text,
  valid_from date,
  valid_to date,
  active boolean
)
language sql
stable
as $$
  with session_window as (
    select
      s.id as session_id,
      s.occurrence_date,
      s.template_id,
      s.series_id
    from mentis_sessions s
    where s.series_id = p_series_id
      and (p_date_from is null or s.occurrence_date >= p_date_from)
      and (p_date_to is null or s.occurrence_date <= p_date_to)
  ),
  template_rows as (
    select
      sw.session_id,
      sw.occurrence_date,
      tm.member_id,
      m.name as member_name,
      coalesce(e.valid_from, tm.valid_from) as valid_from,
      coalesce(e.valid_to, tm.valid_to) as valid_to
    from session_window sw
    join mentis_session_template_members tm
      on tm.template_id = sw.template_id
    join mentis_members m
      on m.id = tm.member_id
    left join mentis_enrollments e
      on e.session_id = sw.session_id
     and e.member_id = tm.member_id
  ),
  explicit_rows as (
    select
      sw.session_id,
      sw.occurrence_date,
      e.member_id,
      m.name as member_name,
      coalesce(e.valid_from, tm.valid_from) as valid_from,
      coalesce(e.valid_to, tm.valid_to) as valid_to
    from session_window sw
    join mentis_enrollments e
      on e.session_id = sw.session_id
    join mentis_members m
      on m.id = e.member_id
    left join mentis_session_template_members tm
      on tm.template_id = sw.template_id
     and tm.member_id = e.member_id
    where tm.member_id is null
  ),
  all_rows as (
    select * from template_rows
    union all
    select * from explicit_rows
  )
  select
    session_id,
    occurrence_date,
    member_id,
    member_name,
    valid_from,
    valid_to,
    effective_member_window_active_on_date(valid_from, valid_to, occurrence_date) as active
  from all_rows
  order by occurrence_date, member_name;
$$;

comment on function session_series_effective_roster(uuid, date, date) is
  'Return the effective member roster for a program run over a date window, using validity windows to determine which members are visible on each session occurrence.';

create or replace function session_template_effective_roster(
  p_template_id uuid,
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  session_id uuid,
  occurrence_date date,
  member_id uuid,
  member_name text,
  valid_from date,
  valid_to date,
  active boolean
)
language sql
stable
as $$
  select r.*
  from mentis_sessions s
  join session_series_effective_roster(s.series_id, p_date_from, p_date_to) r
    on r.session_id = s.id
  where s.template_id = p_template_id;
$$;

comment on function session_template_effective_roster(uuid, date, date) is
  'Convenience wrapper for the effective roster over all program-run generated sessions of a template.';

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0017_program_terminology_alignment.sql';
  RAISE NOTICE 'Canonical naming model: Program blueprint -> Program -> Session.';
  RAISE NOTICE 'This migration is intentionally manual-only and safe-by-default for an operator-controlled cutover.';
END $$;

-- ---------------------------------------------------------------------------
-- 0017_program_terminology_alignment.sql
--
-- This migration is a documentation/operation check rather than a destructive
-- database rewrite. The accepted final domain model in the app is:
--
--   Program blueprint  = reusable structure / default rules
--   Program           = concrete scheduled run / recurring program
--   Session           = actual dated execution / attendance record
--
-- The legacy naming "template" and "series" is still present in some internal
-- SQL and helper names and should be treated as older implementation language.
-- Keep all production changes controlled and reviewable: apply this script only
-- when the operator is ready to align the database naming to the user-facing
-- product model.
-- ---------------------------------------------------------------------------

-- This file intentionally performs no automatic schema mutation. The operator
-- should run the final cutover in a controlled migration window on a copy or
-- staging database before applying it to production.
--
-- Recommended operator checklist:
--   1. Confirm the app and route layer are aligned to the final model.
--   2. Review any remaining legacy series/template references.
--   3. Apply rename statements only on a controlled target DB and validate the
--      app reads and writes against the renamed objects before production use.

DO $$
BEGIN
  RAISE NOTICE '0017_program_terminology_alignment.sql: no automatic rename executed. Review-only alignment script for operator-controlled migration cutover.';
END $$;

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0018_session_series_delete.sql';
END $$;


-- Allow admins to remove generated occurrences from a program run without
-- deleting the template or the recurring rule itself. This keeps the run
-- re-publishable while letting a range be trimmed or fully cleared.
-- The project has both the legacy `mentis_session_series` naming and the newer
-- `mentis_programs` naming depending on whether 0017 was applied. Keep the
-- function compatible with both so the migration chain stays re-runnable.
begin;

create or replace function delete_session_series_occurrences(
  p_series_id     uuid,
  p_start_date    date default null,
  p_end_date      date default null,
  p_delete_all    boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_series_table text;
  v_link_table text;
  v_series_fk text;
  v_start_col text;
  v_end_col text;
  v_series record;
  v_start date;
  v_end date;
  v_deleted integer := 0;
begin
  if to_regclass('public.mentis_programs') is not null then
    v_series_table := 'mentis_programs';
    v_link_table := 'mentis_program_session_links';
    v_series_fk := 'program_id';
    v_start_col := 'start_date';
    v_end_col := 'end_date';
  else
    v_series_table := 'mentis_session_series';
    v_link_table := 'mentis_session_series_links';
    v_series_fk := 'series_id';
    v_start_col := 'starts_on';
    v_end_col := 'ends_on';
  end if;

  execute format('select * from %I where id = $1', v_series_table)
    into v_series
    using p_series_id;

  if not found then
    return jsonb_build_object(
      'series_id', p_series_id,
      'delete_all', coalesce(p_delete_all, false),
      'range_start', coalesce(p_start_date, null),
      'range_end', coalesce(p_end_date, null),
      'deleted_instances', 0,
      'skipped', true,
      'note', 'session series not found; nothing to delete'
    );
  end if;

  if not is_admin(v_series.organization_id) then
    raise exception '%: only admins can delete session series occurrences', '0018_session_series_delete.sql';
  end if;

  execute format('select %I from %I where id = $1', v_start_col, v_series_table)
    into v_start
    using p_series_id;
  execute format('select %I from %I where id = $1', v_end_col, v_series_table)
    into v_end
    using p_series_id;

  if p_delete_all then
    v_start := coalesce(v_start, current_date);
    v_end := coalesce(v_end, v_start, current_date);
    execute format('delete from public.mentis_sessions where %I = $1', v_series_fk)
      using p_series_id;
  else
    v_start := coalesce(p_start_date, v_start, current_date);
    v_end := coalesce(p_end_date, v_end, v_start, current_date);
    if v_end < v_start then
      raise exception '%: delete range end date must be on or after the start date', '0018_session_series_delete.sql';
    end if;

    execute format(
      'delete from public.mentis_sessions where %I = $1 and occurrence_date >= $2 and occurrence_date <= $3',
      v_series_fk
    )
      using p_series_id, v_start, v_end;
  end if;

  get diagnostics v_deleted = row_count;

  execute format('delete from %I where %I = $1', v_link_table, v_series_fk)
    using p_series_id;

  return jsonb_build_object(
    'series_id', p_series_id,
    'delete_all', p_delete_all,
    'range_start', v_start,
    'range_end', v_end,
    'deleted_instances', v_deleted,
    'skipped', false
  );
end $$;

comment on function delete_session_series_occurrences(uuid, date, date, boolean) is
  'Delete all occurrences in a program run or only the selected date range while leaving the recurring run itself intact.';

grant execute on function delete_session_series_occurrences(uuid, date, date, boolean) to authenticated;

DO $$
BEGIN
  if to_regclass('public.mentis_session_series') is not null then
    drop trigger if exists session_series_touch on mentis_session_series;
    create trigger session_series_touch before update on mentis_session_series
      for each row execute function touch_session_series();
  elsif to_regclass('public.mentis_programs') is not null then
    drop trigger if exists session_series_touch on mentis_programs;
    create trigger session_series_touch before update on mentis_programs
      for each row execute function touch_session_series();
  end if;
END $$;

commit;

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0019_coach_qualifications.sql';
END $$;

-- Generic certificate/course catalogue and per-coach qualification records.
-- The individual qualification rows are intentionally restricted to the coach
-- themselves and Super Admins via RLS.
create table if not exists mentis_qualification_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references mentis_organizations(id) on delete cascade,
  name text not null,
  category text not null default 'certificate' check (category in ('certificate','course','safeguarding','dbs','first_aid','other')),
  validity_months integer not null default 12 check (validity_months > 0),
  reminder_days integer not null default 30 check (reminder_days >= 0),
  requires_document_upload boolean not null default false,
  is_mandatory boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists mentis_staff_qualifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references mentis_organizations(id) on delete cascade,
  staff_id uuid not null references mentis_staff(id) on delete cascade,
  qualification_type_id uuid not null references mentis_qualification_types(id) on delete restrict,
  title text not null,
  issue_date date,
  expires_at date,
  document_url text,
  document_name text,
  status text not null default 'valid' check (status in ('valid','expiring_soon','expired','renewal_due','pending_review','archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, staff_id, qualification_type_id, title)
);

alter table mentis_qualification_types enable row level security;
alter table mentis_staff_qualifications enable row level security;

create policy qualification_type_select on mentis_qualification_types for select using (
  is_superadmin(organization_id) or is_admin(organization_id)
);
create policy qualification_type_write on mentis_qualification_types for all using (
  is_superadmin(organization_id) or is_admin(organization_id)
);

-- Privacy rule requested by the client: only the coach themselves and a Super Admin
-- may read or manage the actual staff qualification records.
create policy staff_qualification_select on mentis_staff_qualifications for select using (
  is_superadmin(organization_id) or staff_id = my_staff_id(organization_id)
);
create policy staff_qualification_write on mentis_staff_qualifications for all using (
  is_superadmin(organization_id) or staff_id = my_staff_id(organization_id)
);

create index if not exists qualification_types_org_idx on mentis_qualification_types(organization_id, active, category);
create index if not exists staff_qualifications_staff_expiry_idx on mentis_staff_qualifications(staff_id, expires_at, status);
create index if not exists staff_qualifications_org_idx on mentis_staff_qualifications(organization_id, staff_id, expires_at);
 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0020_session_roster_templates_seed.sql';
END $$;


-- 2026/27 season roster expressed as session blueprints (migration 0013 model).
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/samples/session_roster_templates_seed.sql
--
-- Replaces the old "one mentis_session_occurrences row per roster line" import: each roster
-- line becomes a mentis_sessions blueprint + default roster + a weekly
-- mentis_recurrence_rules pattern, and the final block publishes a series so the
-- individual sessions are generated (holidays skipped) instead of hand-inserted.
--
-- Prerequisites: migrations 0001-0016, and supabase/seed_staff.sql for coach
-- matching and for the admin identity the publish step borrows.
-- Safe to re-run: every step is guarded on natural keys, and re-publishing reuses
-- the season (one mentis_session_series per template per 2026-09-03 start).
--
-- Operating model: 1 template -> many sessions across the 2026-09-03..2027-07-25
-- season; each session may be linked to multiple series rules, and the same
-- session is still traced back to the template that owns it.
--
-- Timings come from the roster's "timing" text; every session is 90 minutes.
-- Two lines carry no time of day. "Thursdays" is imported at 16:00 — the slot
-- its cohort uses on Mondays and Wednesdays — and tagged `time-inferred`.
-- "Wednesdays (PDC)" has no comparable cohort, so it stays a `draft` blueprint
-- at a 09:00 placeholder and generates no sessions until the slot is known.
BEGIN;

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('mentis_session_templates', 'mentis_program_blueprints')
  ) then
    raise exception '%: Session roster seed requires the template model from 0013_session_templates.sql. Reset the public schema and run migrations 0001..0018 in order before running this seed.', '0020_session_roster_templates_seed.sql';
  end if;

  if to_regclass('public.mentis_program_blueprints') is not null and to_regclass('public.mentis_session_templates') is null then
    create view public.mentis_session_templates as
      select * from public.mentis_program_blueprints;
  end if;

  if to_regclass('public.mentis_programs') is not null and to_regclass('public.mentis_session_series') is null then
    create view public.mentis_session_series as
      select * from public.mentis_programs;
  end if;

  if to_regclass('public.mentis_program_session_links') is not null and to_regclass('public.mentis_session_series_links') is null then
    create view public.mentis_session_series_links as
      select * from public.mentis_program_session_links;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mentis_session_templates'
      and column_name in ('code', 'default_start_time', 'default_end_time', 'timezone')
      and (select count(*)
           from information_schema.columns c2
           where c2.table_schema = 'public'
             and c2.table_name = 'mentis_session_templates'
             and c2.column_name in ('code', 'default_start_time', 'default_end_time', 'timezone')) >= 4
  ) then
    raise exception '%: mentis_session_templates is not on the template-era schema. This seed expects code/default_start_time/default_end_time/timezone columns. Reset the public schema and run the migration chain first.', '0020_session_roster_templates_seed.sql';
  end if;

  if not exists (select 1 from mentis_organizations where name = 'Kingfisher Table Tennis Club') then
    raise exception '%: Kingfisher Table Tennis Club org not found — apply supabase/migrations first', '0020_session_roster_templates_seed.sql';
  end if;
end $$;

drop table if exists public.tmp_session_roster;
create table public.tmp_session_roster (
  organization_id uuid not null,
  code            text primary key,
  name            text not null,
  venue           text not null,
  timing          text not null,
  weekday         smallint not null,
  start_time      time not null,
  end_time        time not null,
  coach_hint      text,
  valid_from      date not null,
  valid_to        date not null,
  capacity        integer not null,
  tags            text[] not null,
  status          text not null,
  members         jsonb not null
);

insert into tmp_session_roster (
  organization_id, code, name, venue, timing, weekday, start_time, end_time,
  coach_hint, valid_from, valid_to, capacity, tags, status, members
)
select
  (select id from mentis_organizations where name = 'Kingfisher Table Tennis Club' limit 1),
  x.code, x.name, x.venue, x.timing, x.weekday, x.start_time, x.end_time,
  x.coach_hint,
  -- Every template shares the season window so each season has the same starts_on.
  date '2026-09-03', date '2027-07-25', x.capacity,
  array(select jsonb_array_elements_text(x.tags)), x.status, x.members
from jsonb_to_recordset(
  (
    select $$
[
  {
    "code": "RS-SAT-0900", "name": "Sat_9AM", "venue": "Reading School",
    "timing": "Saturdays 09:00 AM", "weekday": 6, "start_time": "09:00", "end_time": "10:30",
    "coach_hint": null, "valid_from": "2026-09-05", "valid_to": "2027-07-24",
    "capacity": 12, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarush Sharma", "Aiden Ku", "Amardeep Sinha", "Arun Pryde", "Ary GAO", "Austin Plaw", "Krish Kopparty", "Matthew Mitchell", "Benedict Nuckley", "Pranav Koushik", "Rory Burt", "Thisas Rubasinghe"]
  },
  {
    "code": "RS-SAT-1030", "name": "Sat_1030", "venue": "Reading School",
    "timing": "Saturdays 10:30 AM", "weekday": 6, "start_time": "10:30", "end_time": "12:00",
    "coach_hint": "Jack", "valid_from": "2026-09-05", "valid_to": "2027-07-24",
    "capacity": 16, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aahan Malakannagari", "Abigail Hawkins", "Aiden Fernandes", "Ary GAO", "Charlie Gibbs", "Gareth Lam", "Jack Tanton Brown", "JASON HE", "Joshua Hibbert", "Lam Hang Lincoln Chan", "Max Suri", "Sharvil Jadav", "Sri Raghav Veerenthiran", "Travis Kelsey", "Tristan Chow", "Isaac Hampson"]
  },
  {
    "code": "RS-SAT-1200", "name": "Sat_12", "venue": "Reading School",
    "timing": "Saturdays 12:00 PM", "weekday": 6, "start_time": "12:00", "end_time": "13:30",
    "coach_hint": "Jack", "valid_from": "2026-09-05", "valid_to": "2027-07-24",
    "capacity": 14, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Avik Gupta", "Carissa Poon", "Chanel Li", "Eva Sebastian", "Fabian Gandhok", "Finn Khoo", "Kavin Murugan", "Lakshmi Thulicheri", "Reuben Gandhok", "Sudharshana Bharathi Babu", "Tim Yong", "Umairah Nawaz", "UTKARSH SINHA", "Benjamin Jackson"]
  },
  {
    "code": "RS-SAT-1400", "name": "Sat_2pm", "venue": "Reading School",
    "timing": "Saturdays 02:00 PM", "weekday": 6, "start_time": "14:00", "end_time": "15:30",
    "coach_hint": "Jack", "valid_from": "2026-09-05", "valid_to": "2027-07-24",
    "capacity": 12, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Alexander Snelling", "Anoop Sibia", "Arjun Sibia", "Charlie Gibbs", "Ethan Ang", "Krishna Ingale", "Maanav Rana", "Moses Choa", "Sophie Hillier", "Spruha Yesi", "Theodore Demetriou", "Rohan Jetha"]
  },
  {
    "code": "RS-SAT-1530", "name": "Sat_330pm", "venue": "Reading School",
    "timing": "Saturdays 03:30 PM", "weekday": 6, "start_time": "15:30", "end_time": "17:00",
    "coach_hint": "Ajai", "valid_from": "2026-09-05", "valid_to": "2027-07-24",
    "capacity": 9, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Ayansh Chittiboyina", "Chellappa Palaniappan", "Deeptayan Mazumder", "Diviksha Gupta", "Felix Oakes", "Nishree Kulkarni", "Rosie Spriggs", "Vasisht Devarapalli", "Zyan S"]
  },
  {
    "code": "RS-SUN-0900", "name": "Sun_9AM", "venue": "Reading School",
    "timing": "Sundays 09:00 AM", "weekday": 7, "start_time": "09:00", "end_time": "10:30",
    "coach_hint": null, "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 15, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarav Muley", "Aiden Fernandes", "Ary GAO", "Edward Engand", "Evan Andries", "Gabriel Goon", "Hugo Piechocki", "Karthik Pakyala", "Shikhar Patil", "Vidhyuth Ragav", "Travis Kelsey", "Maanav Rana", "Daniel Gomez", "Neil Vaida", "Shreyan Konar"]
  },
  {
    "code": "RS-SUN-1030", "name": "Sun_1030", "venue": "Reading School",
    "timing": "Sundays 10:30 AM", "weekday": 7, "start_time": "10:30", "end_time": "12:00",
    "coach_hint": null, "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 13, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Arav Kaushik", "Brayden Liu", "Gabriel Goon", "JATIN SINGH GARHA", "Joel Bellingham", "Marios Tovell", "Matti Floroiu", "Nivaan Kygonahally", "Hayden Wong", "Vidhyuth Ragav", "YAN CHING (EUNICE) LAM", "Sophie Hillier", "Jack Manley"]
  },
  {
    "code": "RS-SUN-1200", "name": "Sun_12", "venue": "Reading School",
    "timing": "Sundays 12:00 PM", "weekday": 7, "start_time": "12:00", "end_time": "13:30",
    "coach_hint": null, "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 4, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aakrish Baral", "Arlo Bertrand", "Atiksh Jha", "Boyue Mi"]
  },
  {
    "code": "RS-SUN-1330", "name": "Sun_130pm", "venue": "Reading School",
    "timing": "Sundays 01:30 PM", "weekday": 7, "start_time": "13:30", "end_time": "15:00",
    "coach_hint": null, "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 12, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarman Guha", "Anoop Sibia", "Anson Lai", "Arj1un Sibia", "Arnie Basra", "Cameron Alderslade", "Nil Diaz Yoshino", "Dhruva Kalva", "Kevin Velkumaran", "Noah Hunt", "Parth Jha", "Viaan Chawla"]
  },
  {
    "code": "RS-SUN-1500", "name": "Sun_3pm", "venue": "Reading School",
    "timing": "Sundays 03:00 PM", "weekday": 7, "start_time": "15:00", "end_time": "16:30",
    "coach_hint": null, "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 16, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Anish Prabhu", "Elliot Banwell", "Frank O'Brien", "Henry Green", "Ho Him Jasher Tsui", "Jacob Handworker-Marton", "Krishna Ingale", "Liam Handworker-Marton", "Luke Wong", "Maddox Thapa", "Mason Jin", "Shaurya Birajdar", "Devansh Bhattacharya", "Arnav Basumatary", "Yogan Suresh", "Shivank Acharya"]
  },
  {
    "code": "RS-SUN-1630", "name": "Sun_430pm", "venue": "Reading School",
    "timing": "Sundays 04:30 PM", "weekday": 7, "start_time": "16:30", "end_time": "18:00",
    "coach_hint": null, "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 12, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Affan Adhoni", "Andy Ju", "Anqi Ju", "Daniel Naylor", "Henry Gardener", "Krish Kopparty", "Luke Wong", "Rylan Arthur", "Tristan Arthur", "Jasper Lubera", "Michael Bogatov", "Khaled Alweisi"]
  },
  {
    "code": "KF-MON-1600", "name": "Mon4pm", "venue": "Kingfisher Table Tennis Club",
    "timing": "Mondays 04:00 PM", "weekday": 1, "start_time": "16:00", "end_time": "17:30",
    "coach_hint": "Richard", "valid_from": "2026-09-07", "valid_to": "2027-07-26",
    "capacity": 19, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Akshara Pillai", "Alexander Snelling", "Dylan Yildirim", "Grace Pau", "Hugo Piechocki", "Ishaan Thakur", "James Cantale", "Joel Hollands", "Keylan White scotts", "Matt Pau", "Navya Pathak", "Parthasarathy Palaniappan", "Sophie Hillier", "Theodore Demetriou", "Valerie Velkumaran", "Vinura Ilangamudalige", "Tin Yu Leung", "Ching Hang Leung", "Edward Robinson"]
  },
  {
    "code": "KF-MON-1730", "name": "Mon530", "venue": "Kingfisher Table Tennis Club",
    "timing": "Mondays 05:30 PM", "weekday": 1, "start_time": "17:30", "end_time": "19:00",
    "coach_hint": "Richard", "valid_from": "2026-09-07", "valid_to": "2027-07-26",
    "capacity": 19, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarav Pahwa", "Aeyva Fayaz", "Anshika Kamath", "Charlie Zeng", "Chloe Kniep", "Daniel Michel Delgado", "Heilam Tse", "Kaavya Pathak", "Lucas Lin", "Noah CLARKE", "Onela Sapumanage", "Pak Yiu Andres Lang", "Pehej Vig", "Prayrit Ahluwalia", "Rabani Ahluwalia", "Samuel Bloomfield", "Samuel Kwok", "Soumyajit Dasgupta", "VIhaan Thakur"]
  },
  {
    "code": "KF-TUE-1600", "name": "Tues4pm", "venue": "Kingfisher Table Tennis Club",
    "timing": "Tuesdays 04:00 PM", "weekday": 2, "start_time": "16:00", "end_time": "17:30",
    "coach_hint": "Raj", "valid_from": "2026-09-08", "valid_to": "2027-07-27",
    "capacity": 15, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Allyson D’silva", "Amaya Ghosh", "Aneeka Iyer", "Chanel Li", "Ching Hang Leung", "Hugo Piechocki", "James Cantale", "Jared Au Yeung", "Rowan Aslett", "Palaash Dhingra", "Reuben Gandhok", "Shanaya Suraj", "Shardul Patil", "VIGHNAV VIGNESH", "Valerie Velkumaran"]
  },
  {
    "code": "KF-TUE-1730", "name": "Tues5.30", "venue": "Kingfisher Table Tennis Club",
    "timing": "Tuesdays 05:30 PM", "weekday": 2, "start_time": "17:30", "end_time": "19:00",
    "coach_hint": "Richard", "valid_from": "2026-09-08", "valid_to": "2027-07-27",
    "capacity": 18, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Alexander Snelling", "Anshika Kamath", "Arjun Tomar", "Ayansh Pahwa", "Charles Dewen Gao", "Kaavya Pathak", "Navya Pathak", "Noah CLARKE", "Onela Sapumanage", "Owen Williams", "Pragnya V Kondagunta", "Rabani Ahluwalia", "Shrey Talpallikar", "Siddharth MAHABHASHYAM", "SPRUHA YESI", "Swara Mahabhashyam", "Tin Yu Leung", "Yanting Zhu"]
  },
  {
    "code": "KF-WED-1600", "name": "Wed_4pm", "venue": "Kingfisher Table Tennis Club",
    "timing": "Wednesdays 04:00 PM", "weekday": 3, "start_time": "16:00", "end_time": "17:30",
    "coach_hint": "Bryan", "valid_from": "2026-09-09", "valid_to": "2027-07-28",
    "capacity": 21, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarav Pahwa", "Aeyva Fayaz", "Ayansh Pahwa", "Charlie Zeng", "Chloe Kniep", "Daniel Michel Delgado", "Ethan Zeng", "Heilam Tse", "Noah CLARKE", "Pehej Vig", "Prayrit Ahluwalia", "Rishaan SAWANT", "Sahil Tekurkar", "Samuel Kwok", "Soumyajit Dasgupta", "Swara Mahabhashyam", "VIhaan Thakur", "Anshika Kamath", "Rabani Ahluwalia", "Navya Pathak", "Andres Lang"]
  },
  {
    "code": "KF-WED-PDC", "name": "Wed_PDC", "venue": "Kingfisher Table Tennis Club",
    "timing": "Wednesdays (PDC)", "weekday": 3, "start_time": "19:00", "end_time": "20:30",
    "coach_hint": null, "valid_from": "2026-09-09", "valid_to": "2027-07-28",
    "capacity": 5, "tags": ["roster-import", "2026-27", "pdc", "time-tbc"], "status": "draft",
    "members": ["Alexander Snelling", "Shrey Talpallikar", "Pak Hei Yung", "Palaash Dhingra", "Valerie Velkumaran"]
  },
  {
    "code": "KF-THU-4PM", "name": "Thur", "venue": "Kingfisher Table Tennis Club",
    "timing": "Thursdays", "weekday": 4, "start_time": "16:00", "end_time": "19:00",
    "coach_hint": null, "valid_from": "2026-09-03", "valid_to": "2027-07-22",
    "capacity": 19, "tags": ["roster-import", "2026-27", "time-inferred"], "status": "active",
    "members": ["Aeyva Fayaz", "Anshika Kamath", "Arjun Tomar", "Aarav Pahwa", "Charlie Zeng", "Daniel Michel Delgado", "Ethan Zeng", "Heilam Tse", "Navya Pathak", "Noah CLARKE", "Pak Yiu Andres Lang", "Prayrit Ahluwalia", "Rabani Ahluwalia", "Rishaan SAWANT", "Sahil Tekurkar", "Swara Mahabhashyam", "Kaavya Pathak", "Ayansh Pahwa", "Soumyajit Dasgupta"]
  },
  {
    "code": "KF-FRI-1600", "name": "Fri4pm", "venue": "Kingfisher Table Tennis Club",
    "timing": "Fridays 04:00 PM", "weekday": 5, "start_time": "16:00", "end_time": "17:30",
    "coach_hint": "Jack", "valid_from": "2026-09-04", "valid_to": "2027-07-23",
    "capacity": 17, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Alexander Spriggs", "Arjun Krishna Bharathi Babu", "Arlo Williams", "Atiksh Jha", "Charlie Spriggs", "Harry Poynter", "Ishaan Thakur", "Man Chung So", "Nived Nikesh", "Pak Yiu Andres Lang", "Palaash Dhingra", "Rupert Poynter", "Saad Chawdhary", "Saatvik Khanna", "Shanaya Suraj", "Valerie Velkumaran", "VIGHNAV VIGNESH"]
  },
  {
    "code": "KF-FRI-1730", "name": "Fri5.30", "venue": "Kingfisher Table Tennis Club",
    "timing": "Fridays 05:30 PM", "weekday": 5, "start_time": "17:30", "end_time": "19:00",
    "coach_hint": "Jack", "valid_from": "2026-09-04", "valid_to": "2027-07-23",
    "capacity": 16, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarav Pahwa", "Chloe Kniep", "Daniel Michel Delgado", "Edward Thomas", "Leo King", "Marios Tovell", "Onela Sapumanage", "Pak Yiu Andres Lang", "Pragnya V Kondagunta", "Prayrit Ahluwalia", "Rishaan SAWANT", "Samuel Kwok", "Soumyajit Dasgupta", "VIhaan Thakur", "Charlie Zeng", "Parthasarathy Palaniappan"]
  },
  {
    "code": "KF-SAT-0900", "name": "Sat9AM", "venue": "Kingfisher Table Tennis Club",
    "timing": "Saturdays 09:00 AM", "weekday": 6, "start_time": "09:00", "end_time": "10:30",
    "coach_hint": "Raj", "valid_from": "2026-09-05", "valid_to": "2027-07-24",
    "capacity": 16, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarav Singh Rawat", "Edmond Peng", "Huxley Lynch", "Jiya Pawar", "Mya Lau", "Nishad Vikram", "Nithin Prasanna", "Noah Ibrahim", "Oisin Scannell", "Pak Hei Yung", "Pak Shun Tung", "Sahej Burande", "Samraat Singh Pawar", "Victor Peng", "Arjun Chadda", "James Lotherington"]
  },
  {
    "code": "KF-SAT-1030", "name": "SAT_1030", "venue": "Kingfisher Table Tennis Club",
    "timing": "Saturdays 10:30 AM", "weekday": 6, "start_time": "10:30", "end_time": "12:00",
    "coach_hint": "Ajai", "valid_from": "2026-09-05", "valid_to": "2027-07-24",
    "capacity": 17, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aditya Mupparapu", "Arav Kaushik", "Arjun Tomar", "Grace Pau", "Ivan Mihalciuc", "JATIN SINGH GARHA", "Marios Tovell", "Matt Pau", "Noah CLARKE", "Onela Sapumanage", "Owen Williams", "Rabani Ahluwalia", "Rohan Jetha", "Svanik Sarangi", "Yanting Zhu", "Yat Hey Lau (Morris)", "Charles Dewen Gao"]
  },
  {
    "code": "KF-SUN-0900", "name": "Sun9AM", "venue": "Kingfisher Table Tennis Club",
    "timing": "Sundays 09:00 AM", "weekday": 7, "start_time": "09:00", "end_time": "10:30",
    "coach_hint": "Raj", "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 15, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarnik Jena", "Adithya Balasubramanian", "Aditya Vignesh", "Alexander Ross", "Charlie Tonks", "Ethan Patel", "Gabriel Gibbs", "Khidash Mardhani", "Krish Yeddula", "Max Pedder", "reyaan chawla", "Ritvik Garine", "Rohan Parbhoo", "Shayan Patel", "Smayan Raina"]
  },
  {
    "code": "KF-SUN-1400", "name": "Sun2pm", "venue": "Kingfisher Table Tennis Club",
    "timing": "Sundays 02:00 PM", "weekday": 7, "start_time": "14:00", "end_time": "15:30",
    "coach_hint": "Raj", "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 19, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aadya Gari", "Aaron Hall", "Aevam Modi", "Akshara Pillai", "Charley Burriss", "Ching Hang Leung", "Hayden Tan", "Karishma Patil", "KAVIN BALAJI", "Kateryna Helei", "Sean Lee", "Shrey Talpallikar", "Simra Sayeed", "Julia Martin", "Tom Griffin", "Will Odell", "Jessica Martin", "Kohana Vemireddy", "Shanaya Vemireddy"]
  }
]
$$::jsonb
  )
) as x(
  code text, name text, venue text, timing text, weekday smallint,
  start_time time, end_time time, coach_hint text,
  valid_from date, valid_to date, capacity integer,
  tags jsonb, status text, members jsonb
);

-- Fail fast if any imported slot is malformed; this surfaces the exact roster
-- code(s) with an invalid range instead of letting Postgres reject the later
-- recurrence-rule insert with the generic check-constraint message.
do $$
declare
  v_offenders text;
begin
  select string_agg(code || ': ' || start_time || ' -> ' || end_time, ', ' order by code)
    into v_offenders
  from tmp_session_roster
  where end_time <= start_time;

  if v_offenders is not null then
    raise exception '%: invalid roster time ranges in recurrence seed: %', '0020_session_roster_templates_seed.sql', v_offenders;
  end if;
end $$;

-- 1. Venues referenced by the roster ----------------------------------------
insert into mentis_venues (organization_id, name, concurrent_session_limit)
select distinct r.organization_id, r.venue, 2
from tmp_session_roster r
where not exists (
  select 1 from mentis_venues v
  where v.organization_id = r.organization_id and v.name = r.venue);

-- 2. Members ------------------------------------------------------------------
-- The roster carries names only; date_of_birth is NOT NULL, so a deterministic
-- placeholder is derived from the name and must be corrected before go-live.
insert into mentis_members (organization_id, name, date_of_birth)
select mr.organization_id, mr.member_name,
       date '2008-01-01' + ((abs(hashtext(mr.member_name)) % 3650) * interval '1 day')
from (
  select distinct r.organization_id, m.member_name
  from tmp_session_roster r
  cross join lateral jsonb_array_elements_text(r.members) as m(member_name)
) mr
where not exists (
  select 1 from mentis_members mm
  where mm.organization_id = mr.organization_id and mm.name = mr.member_name);

-- 3. Blueprints ----------------------------------------------------------------
insert into mentis_session_templates (
  organization_id, code, name, description, venue_id,
  default_start_time, default_end_time, timezone,
  capacity, default_charge_cents, leading_coach_id, tags, status
)
select
  r.organization_id, r.code, r.name,
  'Imported from the season roster (' || r.timing || ', ' || r.venue || ').',
  v.id, r.start_time, r.end_time, 'Europe/London',
  r.capacity, null, coach.id, r.tags, r.status
from tmp_session_roster r
join mentis_venues v
  on v.organization_id = r.organization_id and v.name = r.venue
left join lateral (
  select ms.id from mentis_staff ms
  where r.coach_hint is not null
    and ms.organization_id = r.organization_id
    and ms.display_name ilike r.coach_hint || '%'
  order by ms.display_name limit 1
) coach on true
where not exists (
  select 1 from mentis_session_templates t
  where t.organization_id = r.organization_id and t.name = r.name and t.venue_id = v.id);

-- 3b. Re-align blueprints seeded by an earlier run of this file. Only rows this
--     import owns (tagged `roster-import`) are touched, and only when they drift.
update mentis_session_templates t
   set default_start_time = r.start_time,
       default_end_time   = r.end_time,
       capacity           = r.capacity,
       status             = r.status,
       tags               = r.tags
from tmp_session_roster r
where t.organization_id = r.organization_id
  and t.code = r.code
  and 'roster-import' = any (t.tags)
  and (t.default_start_time, t.default_end_time, t.capacity, t.status, t.tags)
      is distinct from (r.start_time, r.end_time, r.capacity, r.status, r.tags);

update mentis_recurrence_rules rr
   set start_time = r.start_time,
       end_time   = r.end_time,
       by_weekday = array[r.weekday]::smallint[],
       valid_from = r.valid_from,
       valid_to   = r.valid_to,
       horizon_days = least(greatest((r.valid_to - r.valid_from) + 1, 1), 730),
       label      = r.name || ' — season ' || to_char(r.valid_from, 'YYYY') || '/' || to_char(r.valid_to, 'YY'),
       is_active  = (r.valid_to >= current_date),
       updated_at = now()
from tmp_session_roster r
join mentis_session_templates t
  on t.organization_id = r.organization_id and t.code = r.code
where rr.template_id = t.id
  and 'roster-import' = any (t.tags)
  and r.end_time > r.start_time
  and not exists (select 1 from mentis_session_series s where s.recurrence_rule_id = rr.id)
  and (rr.start_time, rr.end_time, rr.by_weekday, rr.valid_from, rr.valid_to)
      is distinct from (r.start_time, r.end_time, array[r.weekday]::smallint[], r.valid_from, r.valid_to);

-- 4. Staffing plan: one lead slot per blueprint, left open where the roster
--    says "Unassigned" / "… to approve".
insert into mentis_session_template_staffing (
  template_id, capacity, staff_id, rate_card_id, required, lead_minutes, trail_minutes, notes
)
select t.id, 'lead', t.leading_coach_id,
  (select rc.id from mentis_rate_cards rc
    where rc.staff_id = t.leading_coach_id order by rc.valid_from desc limit 1),
  true, 15, 0,
  case when t.leading_coach_id is null then 'Lead coach to be confirmed' end
from tmp_session_roster r
join mentis_session_templates t
  on t.organization_id = r.organization_id and t.code = r.code
where not exists (
  select 1 from mentis_session_template_staffing st
  where st.template_id = t.id and st.capacity = 'lead');

-- 5. Default roster -------------------------------------------------------------
insert into mentis_session_template_members (template_id, member_id)
select t.id, m.id
from tmp_session_roster r
join mentis_session_templates t
  on t.organization_id = r.organization_id and t.code = r.code
cross join lateral jsonb_array_elements_text(r.members) as mn(member_name)
join mentis_members m
  on m.organization_id = r.organization_id and m.name = mn.member_name
where not exists (
  select 1 from mentis_session_template_members st
  where st.template_id = t.id and st.member_id = m.id
);

-- 6. Recurrence: weekly on the roster's day, bounded by the season window ---------
insert into mentis_recurrence_rules (
  organization_id, template_id, label, frequency, interval_count, by_weekday,
  start_time, end_time, valid_from, valid_to, horizon_days,
  skip_term_holidays, skip_bank_holidays, skip_manual_closures, is_active
)
select
  r.organization_id, t.id, r.name || ' — season ' || to_char(r.valid_from, 'YYYY') || '/' || to_char(r.valid_to, 'YY'),
  'weekly', 1, array[r.weekday]::smallint[],
  r.start_time, r.end_time, r.valid_from, r.valid_to,
  least(greatest((r.valid_to - r.valid_from) + 1, 1), 730),
  true, true, true,
  r.valid_to >= current_date
from tmp_session_roster r
join mentis_session_templates t
  on t.organization_id = r.organization_id and t.code = r.code
where r.end_time > r.start_time
  and not exists (
    select 1 from mentis_recurrence_rules rr where rr.template_id = t.id);

-- 7. Publish a series per active blueprint ----------------------------------------
-- Generates the individual mentis_session_occurrences rows, skipping term breaks and bank
-- holidays (rule 16 rejects sessions on no-session days outright). Comment this
-- block out to seed blueprints only. `instantiate_session_series` is admin-gated,
-- so the seed borrows a real admin identity the way PostgREST does.
do $$
declare
  t record;
  result jsonb;
  admin_uid uuid;
begin
  select ms.user_id into admin_uid
  from mentis_staff ms
  join mentis_organizations o on o.id = ms.organization_id
  where o.name = 'Kingfisher Table Tennis Club'
    and ms.roles && array['SUPER_ADMIN', 'ADMIN']::mentis_role[]
  order by ms.display_name limit 1;

  if admin_uid is null then
    insert into auth.users (
      id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, aud, role
    ) values (
      'be474d37-90d7-4807-a5ce-28882dff3e2f',
      'ajai@kingfisher.example',
      '',
      now(),
      now(),
      now(),
      '{}'::jsonb,
      '{}'::jsonb,
      'authenticated',
      'authenticated'
    )
    on conflict (id) do nothing;

    insert into mentis_staff (organization_id, user_id, roles, display_name)
    values (
      (select id from mentis_organizations where name = 'Kingfisher Table Tennis Club' limit 1),
      'be474d37-90d7-4807-a5ce-28882dff3e2f',
      array['SUPER_ADMIN']::mentis_role[],
      'Ajai Kamath'
    )
    on conflict (organization_id, user_id)
      do update set roles = excluded.roles, display_name = excluded.display_name;

    select ms.user_id into admin_uid
    from mentis_staff ms
    join mentis_organizations o on o.id = ms.organization_id
    where o.name = 'Kingfisher Table Tennis Club'
      and ms.user_id = 'be474d37-90d7-4807-a5ce-28882dff3e2f';
  end if;

  if admin_uid is null then
    raise exception '%: no KINGFISHER admin staff identity was available; create one or re-run supabase/seed_staff.sql before publishing roster sessions', '0020_session_roster_templates_seed.sql';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_uid::text, 'role', 'authenticated')::text, false);

  for t in
    select tpl.id as template_id, tpl.name, rr.id as rule_id, rr.label
    from tmp_session_roster r
    join mentis_session_templates tpl
      on tpl.organization_id = r.organization_id and tpl.code = r.code
    join mentis_recurrence_rules rr on rr.template_id = tpl.id
    where tpl.status = 'active' and rr.is_active
    order by tpl.name
  loop
    -- Idempotent: reuses the template's season and only generates missing dates.
    result := instantiate_session_series(
      t.template_id,
      '{}'::jsonb,
      jsonb_build_object('rule_id', t.rule_id, 'label', t.label)
    );
    perform sync_template_roster_to_child_sessions(t.template_id);
    raise notice '%: % generated, % existing, % term-break and % bank-holiday dates skipped',
      t.name, result->>'generated', result->>'existing',
      result->>'skipped_term_holidays', result->>'skipped_bank_holidays';
  end loop;

  perform set_config('request.jwt.claims', '{}', false);
end $$;

-- Scratch table only: it holds the raw roster (names, dates of birth) and has no
-- RLS, so it must not survive the seed.
drop table if exists public.tmp_session_roster;

COMMIT;

 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0021_tagging_system.sql';
END $$;

-- Shared taxonomy for member, coach, sparrer, program/template and session tagging.
-- This is the normalized replacement for free-form text[] lists and supports
-- admin-configurable custom categories while keeping system-defined skill levels
-- and age/performance streams locked.

create table if not exists mentis_tag_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references mentis_organizations(id) on delete cascade,
  scope text not null check (scope in ('member', 'coach', 'sparrer', 'program', 'program_template', 'session')),
  code text not null,
  label text not null,
  kind text not null check (kind in ('skill_level', 'performance_stream', 'membership', 'coach_focus', 'sparring_focus', 'custom')),
  allow_multiple boolean not null default true,
  is_system boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, scope, code)
);

create table if not exists mentis_tag_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references mentis_organizations(id) on delete cascade,
  tag_type_id uuid not null references mentis_tag_types(id) on delete cascade,
  code text not null,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tag_type_id, code)
);

create table if not exists mentis_entity_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references mentis_organizations(id) on delete cascade,
  tag_type_id uuid not null references mentis_tag_types(id) on delete cascade,
  tag_value_id uuid not null references mentis_tag_values(id) on delete cascade,
  entity_type text not null check (entity_type in ('member', 'coach', 'sparrer', 'program', 'program_template', 'session')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, tag_type_id, tag_value_id)
);

create index if not exists tag_types_org_scope_idx on mentis_tag_types (organization_id, scope, is_active, sort_order);
create index if not exists tag_values_type_idx on mentis_tag_values (tag_type_id, is_active, sort_order);
create index if not exists entity_tags_entity_idx on mentis_entity_tags (organization_id, entity_type, entity_id);

alter table mentis_tag_types enable row level security;
alter table mentis_tag_values enable row level security;
alter table mentis_entity_tags enable row level security;

-- RLS: org staff can read the taxonomy; admins configure it.
create policy tag_type_select on mentis_tag_types for select using (is_staff(organization_id));
create policy tag_type_write on mentis_tag_types for all using (is_admin(organization_id));

create policy tag_value_select on mentis_tag_values for select using (is_staff(organization_id));
create policy tag_value_write on mentis_tag_values for all using (is_admin(organization_id));

create policy entity_tag_select on mentis_entity_tags for select using (is_staff(organization_id));
create policy entity_tag_write on mentis_entity_tags for all using (is_admin(organization_id));

-- Seed the default taxonomy for each organization.
with orgs as (
  select id as organization_id from mentis_organizations
)
insert into mentis_tag_types (organization_id, scope, code, label, kind, allow_multiple, is_system, sort_order)
select o.organization_id, 'member', 'skill_level', 'Skill level', 'skill_level', false, true, 10
from orgs o
on conflict (organization_id, scope, code) do nothing;

with orgs as (
  select id as organization_id from mentis_organizations
)
insert into mentis_tag_types (organization_id, scope, code, label, kind, allow_multiple, is_system, sort_order)
select o.organization_id, 'member', 'performance_stream', 'Performance stream', 'performance_stream', true, true, 20
from orgs o
on conflict (organization_id, scope, code) do nothing;

with orgs as (
  select id as organization_id from mentis_organizations
)
insert into mentis_tag_types (organization_id, scope, code, label, kind, allow_multiple, is_system, sort_order)
select o.organization_id, 'member', 'membership', 'Membership', 'membership', true, true, 30
from orgs o
on conflict (organization_id, scope, code) do nothing;

with orgs as (
  select id as organization_id from mentis_organizations
)
insert into mentis_tag_types (organization_id, scope, code, label, kind, allow_multiple, is_system, sort_order)
select o.organization_id, 'coach', 'coach_focus', 'Coaching focus', 'coach_focus', true, true, 10
from orgs o
on conflict (organization_id, scope, code) do nothing;

with orgs as (
  select id as organization_id from mentis_organizations
)
insert into mentis_tag_types (organization_id, scope, code, label, kind, allow_multiple, is_system, sort_order)
select o.organization_id, 'sparrer', 'sparring_focus', 'Sparring focus', 'sparring_focus', true, true, 10
from orgs o
on conflict (organization_id, scope, code) do nothing;

-- Skill levels 1-10 based on the junior athlete progression described in the brief.
with type_map as (
  select id as tag_type_id, organization_id, scope, code
  from mentis_tag_types
  where scope = 'member' and code = 'skill_level'
), values_seed(code, label, sort_order) as (
  values
    ('1', 'Absolute Novice', 1),
    ('2', 'Beginner', 2),
    ('3', 'Advanced Beginner', 3),
    ('4', 'Intermediate-Novice', 4),
    ('5', 'Intermediate', 5),
    ('6', 'Advanced Intermediate', 6),
    ('7', 'Pre-Advanced', 7),
    ('8', 'Advanced', 8),
    ('9', 'Elite Junior', 9),
    ('10', 'Pre-Professional / Mastery', 10)
)
insert into mentis_tag_values (organization_id, tag_type_id, code, label, sort_order, is_active)
select tm.organization_id, tm.tag_type_id, vs.code, vs.label, vs.sort_order, true
from type_map tm
cross join values_seed vs
on conflict (tag_type_id, code) do nothing;

-- Performance streams.
with type_map as (
  select id as tag_type_id, organization_id
  from mentis_tag_types
  where scope = 'member' and code = 'performance_stream'
), values_seed(code, label, sort_order) as (
  values
    ('under_9', 'Under 9', 10),
    ('under_11', 'Under 11', 20),
    ('u13', 'U13', 30),
    ('u15', 'U15', 40),
    ('u17', 'U17', 50),
    ('u19', 'U19', 60)
)
insert into mentis_tag_values (organization_id, tag_type_id, code, label, sort_order, is_active)
select tm.organization_id, tm.tag_type_id, vs.code, vs.label, vs.sort_order, true
from type_map tm
cross join values_seed vs
on conflict (tag_type_id, code) do nothing;

-- Membership defaults.
with type_map as (
  select id as tag_type_id, organization_id
  from mentis_tag_types
  where scope = 'member' and code = 'membership'
), values_seed(code, label, sort_order) as (
  values
    ('standard', 'Standard', 10),
    ('gold', 'Gold', 20),
    ('scholarship', 'Scholarship', 30),
    ('trial', 'Trial', 40)
)
insert into mentis_tag_values (organization_id, tag_type_id, code, label, sort_order, is_active)
select tm.organization_id, tm.tag_type_id, vs.code, vs.label, vs.sort_order, true
from type_map tm
cross join values_seed vs
on conflict (tag_type_id, code) do nothing;

-- Coaching / sparring focus defaults.
with coach_focus_types as (
  select id as tag_type_id, organization_id
  from mentis_tag_types
  where scope = 'coach' and code = 'coach_focus'
), values_seed(code, label, sort_order) as (
  values
    ('performance', 'Performance', 10),
    ('development', 'Development', 20),
    ('beginners', 'Beginners', 30)
)
insert into mentis_tag_values (organization_id, tag_type_id, code, label, sort_order, is_active)
select cft.organization_id, cft.tag_type_id, vs.code, vs.label, vs.sort_order, true
from coach_focus_types cft
cross join values_seed vs
on conflict (tag_type_id, code) do nothing;

with sparrer_focus_types as (
  select id as tag_type_id, organization_id
  from mentis_tag_types
  where scope = 'sparrer' and code = 'sparring_focus'
), values_seed(code, label, sort_order) as (
  values
    ('performance', 'Performance', 10),
    ('development', 'Development', 20),
    ('beginners', 'Beginners', 30)
)
insert into mentis_tag_values (organization_id, tag_type_id, code, label, sort_order, is_active)
select sft.organization_id, sft.tag_type_id, vs.code, vs.label, vs.sort_order, true
from sparrer_focus_types sft
cross join values_seed vs
on conflict (tag_type_id, code) do nothing;
 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0022_api_role_grants.sql';
END $$;


-- PostgREST connects as `anon` / `authenticated` / `service_role`, never as the
-- table owner. Table-level privileges are therefore a prerequisite for every
-- API call; RLS (0006_rls_matrix.sql) remains the row-level gate on top.
--
-- 0000_reset_public_schema_from_foundation.sql drops the public schema, which
-- also drops Supabase's bootstrap grants. This migration re-establishes them
-- for everything the chain created and for everything created afterwards. It
-- is idempotent and safe to re-run against an already-migrated database.

-- `anon` gets schema usage only: it has no RLS policies, so it can see nothing.
-- `authenticated` gets DML on tables, filtered by RLS.
-- `service_role` bypasses RLS and is used by edge functions and jobs.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN CONTINUE; END IF;

    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO %I', r);

    IF r <> 'anon' THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', r);
    END IF;
  END LOOP;
END $$;

-- The grants above are only safe because every base table is RLS-protected.
-- A table added without RLS would become readable by any signed-in user, so
-- fail the migration rather than ship the hole.
DO $$
DECLARE unprotected text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO unprotected
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION '%: row level security is disabled on: %', '0022_api_role_grants.sql', unprotected;
  END IF;
END $$;
 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0023_staff_rate_cards_defaults.sql';
END $$;

-- Default rate card tiers for all staff in the organization.
-- Standard rate cards are created for all coaches and sparrers.
-- Premium rate cards are also created for all coaches and sparrers.
-- One of the two tiers is then marked as the active default used by the app.
--
-- Rates:
--   Coaches: Standard 2500 cents/hr, Premium 4000 cents/hr
--   Sparrers: Standard 1000 cents/hr, Premium 1500 cents/hr
--
-- This is intentionally idempotent and safe to re-run.

INSERT INTO mentis_rate_cards (organization_id, staff_id, label, rate_cents, valid_from, valid_to)
SELECT s.organization_id, s.id, 'Standard', 2500, current_date, NULL
FROM mentis_staff s
WHERE 'COACH' = ANY (s.roles)
  AND NOT EXISTS (
    SELECT 1
    FROM mentis_rate_cards r
    WHERE r.organization_id = s.organization_id
      AND r.staff_id = s.id
      AND r.label = 'Standard'
      AND r.rate_cents = 2500
      AND r.valid_from = current_date
      AND r.valid_to IS NULL
  );

INSERT INTO mentis_rate_cards (organization_id, staff_id, label, rate_cents, valid_from, valid_to)
SELECT s.organization_id, s.id, 'Premium', 4000, current_date, NULL
FROM mentis_staff s
WHERE 'COACH' = ANY (s.roles)
  AND NOT EXISTS (
    SELECT 1
    FROM mentis_rate_cards r
    WHERE r.organization_id = s.organization_id
      AND r.staff_id = s.id
      AND r.label = 'Premium'
      AND r.rate_cents = 4000
      AND r.valid_from = current_date
      AND r.valid_to IS NULL
  );

INSERT INTO mentis_rate_cards (organization_id, staff_id, label, rate_cents, valid_from, valid_to)
SELECT s.organization_id, s.id, 'Standard', 1000, current_date, NULL
FROM mentis_staff s
WHERE 'SPARRER' = ANY (s.roles)
  AND NOT EXISTS (
    SELECT 1
    FROM mentis_rate_cards r
    WHERE r.organization_id = s.organization_id
      AND r.staff_id = s.id
      AND r.label = 'Standard'
      AND r.rate_cents = 1000
      AND r.valid_from = current_date
      AND r.valid_to IS NULL
  );

INSERT INTO mentis_rate_cards (organization_id, staff_id, label, rate_cents, valid_from, valid_to)
SELECT s.organization_id, s.id, 'Premium', 1500, current_date, NULL
FROM mentis_staff s
WHERE 'SPARRER' = ANY (s.roles)
  AND NOT EXISTS (
    SELECT 1
    FROM mentis_rate_cards r
    WHERE r.organization_id = s.organization_id
      AND r.staff_id = s.id
      AND r.label = 'Premium'
      AND r.rate_cents = 1500
      AND r.valid_from = current_date
      AND r.valid_to IS NULL
  );

-- Default active rate selection: Standard is treated as the default tier for all staff.
-- This is represented as a database-level business rule so the app can resolve the current
-- default from the valid date window rather than maintaining a separate is_default flag.
-- If you prefer Premium as the default later, update the label below and keep the same date rule.
CREATE OR REPLACE FUNCTION mentis_default_rate_card_id_for_staff(p_staff_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id
  FROM mentis_rate_cards
  WHERE staff_id = p_staff_id
    AND label = 'Standard'
    AND valid_from <= current_date
    AND (valid_to IS NULL OR valid_to >= current_date)
  ORDER BY valid_from DESC, id DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION mentis_default_rate_card_id_for_staff(uuid) IS
  'Returns the active Standard rate card for a staff member based on the current date and valid_from/valid_to window.';

-- Note:
-- The repo's current schema does not include an explicit 'is_default' flag on mentis_rate_cards.
-- The accepted pattern is to keep both tiers and resolve the default via the latest active
-- Standard card in the valid date window. This helper gives the app and DB a single source of truth.
 
DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0024_rate_cards_valid_to.sql';
END $$;

ALTER TABLE mentis_rate_cards
  ADD COLUMN IF NOT EXISTS valid_to date;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'mentis_rate_cards'
      AND column_name = 'valid_to'
  ) THEN
    ALTER TABLE mentis_rate_cards
      DROP CONSTRAINT IF EXISTS mentis_rate_cards_valid_to_check;

    ALTER TABLE mentis_rate_cards
      ADD CONSTRAINT mentis_rate_cards_valid_to_check
      CHECK (valid_to IS NULL OR valid_to >= valid_from);
  END IF;
END $$;

-- Backfill existing rows with a null end date so prior cards remain active indefinitely.
UPDATE mentis_rate_cards
SET valid_to = NULL
WHERE valid_to IS NULL;
 
ALTER TABLE mentis_staff_availability
  DROP CONSTRAINT IF EXISTS staff_availability_no_vacation; 
ALTER TABLE mentis_staff_availability
  DROP CONSTRAINT IF EXISTS staff_availability_no_vacation;

CREATE OR REPLACE FUNCTION availability_kind_label(kind text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE kind
    WHEN 'available' THEN 'Available for coaching'
    WHEN 'working_hours' THEN 'Regular working hours'
    WHEN 'on_duty' THEN 'Club duty'
    WHEN 'club_duty' THEN 'Club duty'
    WHEN 'vacation' THEN 'Vacation'
    WHEN 'sick_leave' THEN 'Sick leave'
    WHEN 'duty_outside_club' THEN 'Duty outside club'
    WHEN 'working_elsewhere' THEN 'Working elsewhere'
    WHEN 'personal_appointment' THEN 'Personal appointment'
    WHEN 'training' THEN 'Training / development'
    WHEN 'out_of_office' THEN 'Out of office'
    WHEN 'unavailable_other' THEN 'Unavailable'
    ELSE 'Other'
  END
$$; 
