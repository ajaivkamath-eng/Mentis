create extension if not exists pgcrypto;
create type mentis_role as enum ('SUPER_ADMIN','ADMIN','COACH','SPARRER');
create type attendance_status as enum ('present','absent','late','taster');
create table organizations (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table mentis_staff (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), user_id uuid not null, roles mentis_role[] not null default '{}', display_name text not null, created_at timestamptz not null default now(), unique(organization_id,user_id));
create table venues (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), name text not null, concurrent_session_limit integer not null default 1 check(concurrent_session_limit > 0));
create table customers (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), name text not null, phone text, created_at timestamptz not null default now());
create table members (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), customer_id uuid references customers(id), name text not null, date_of_birth date not null, nok_name text, nok_phone text, special_needs_flag boolean not null default false, special_needs text, created_at timestamptz not null default now());
create table sessions (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), venue_id uuid not null references venues(id), name text not null, start_at timestamptz not null, end_at timestamptz not null, check(end_at > start_at));
create table enrollments (id uuid primary key default gen_random_uuid(), session_id uuid not null references sessions(id) on delete cascade, member_id uuid not null references members(id), status text not null default 'active', expected boolean not null default true, unique(session_id,member_id));
create table attendance_records (id uuid primary key default gen_random_uuid(), session_id uuid not null references sessions(id) on delete cascade, member_id uuid references members(id), taster_name text, status attendance_status not null, recorded_by uuid not null, recorded_at timestamptz not null default now(), offline boolean not null default false, check ((member_id is not null) <> (taster_name is not null)));
create table audit_log (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), actor_id uuid, action text not null, entity text not null, entity_id uuid, field text, created_at timestamptz not null default now(), metadata jsonb not null default '{}');

create or replace function current_staff_roles(org uuid) returns mentis_role[] language sql stable security definer set search_path=public as $$ select coalesce(roles,'{}') from mentis_staff where organization_id=org and user_id=auth.uid() $$;
create or replace function has_mentis_role(org uuid, wanted mentis_role) returns boolean language sql stable security definer set search_path=public as $$ select wanted = any(current_staff_roles(org)) $$;

alter table organizations enable row level security; alter table mentis_staff enable row level security; alter table venues enable row level security; alter table customers enable row level security; alter table members enable row level security; alter table sessions enable row level security; alter table enrollments enable row level security; alter table attendance_records enable row level security; alter table audit_log enable row level security;
create policy org_staff_access on organizations for select using (id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy staff_manage on mentis_staff for all using (has_mentis_role(organization_id,'SUPER_ADMIN') or has_mentis_role(organization_id,'ADMIN'));
create policy staff_self_read on mentis_staff for select using (user_id=auth.uid());
create policy venue_access on venues for all using (has_mentis_role(organization_id,'SUPER_ADMIN') or has_mentis_role(organization_id,'ADMIN') or organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy customer_access on customers for select using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy member_access on members for select using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy member_admin_write on members for all using (has_mentis_role(organization_id,'SUPER_ADMIN') or has_mentis_role(organization_id,'ADMIN'));
create policy session_access on sessions for all using (organization_id in (select organization_id from mentis_staff where user_id=auth.uid()));
create policy enrollment_access on enrollments for all using (session_id in (select id from sessions where organization_id in (select organization_id from mentis_staff where user_id=auth.uid())));
create policy attendance_access on attendance_records for all using (session_id in (select id from sessions where organization_id in (select organization_id from mentis_staff where user_id=auth.uid())));
create policy audit_admin_read on audit_log for select using (has_mentis_role(organization_id,'SUPER_ADMIN') or has_mentis_role(organization_id,'ADMIN'));
