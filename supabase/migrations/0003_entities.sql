-- Mentis entities: sport profiles, member extensions, tasters, groups, segments, goals.
-- Medical notes move to a dedicated table so RLS can gate them strictly (rule 3).
create table sport_profiles (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  name text not null, rank_system jsonb not null default '{}', feedback_attributes jsonb not null default '{}',
  playing_styles jsonb not null default '[]', preset_chips jsonb not null default '[]',
  equipment_guide text, session_templates jsonb not null default '[]', group_templates jsonb not null default '[]',
  unique(organization_id, name)
);
alter table members add column tte_number text unique;
alter table members add column handedness text check (handedness in ('L','R'));
alter table members add column playing_style text;
alter table members add column equipment_notes text;
alter table members add column photo_ref text;
alter table members add column sports jsonb not null default '[]';
alter table members add column erased_at timestamptz;
alter table venues add column address text;
alter table venues add column phone text;
alter table venues add column working_hours text;
alter table venues add column capacity integer;
alter table venues add column notes text;
alter table members drop column special_needs;
create table member_medical (
  member_id uuid primary key references members(id) on delete cascade,
  notes text not null, updated_by uuid, updated_at timestamptz not null default now()
);
alter table customers add column email text;
alter table customers add column guardian_a text;
alter table customers add column guardian_b text;
alter table customers add column nok_name text;
alter table customers add column nok_phone text;
alter table customers add column consents jsonb not null default '[]';
alter table customers add column is_also_member_id uuid references members(id);
alter table enrollments add column pause_reason text;
alter table enrollments add column auto_resume_date date;
alter table enrollments add column position integer;
alter table enrollments drop constraint if exists enrollments_status_check;
alter table enrollments add constraint enrollments_status_check
  check (status in ('invited','active','paused','waitlisted','completed'));
alter table sessions add column level_band text;
alter table sessions add column capacity integer;
alter table sessions add column notes text;
alter table sessions add column cancel_reason text;
create table session_segments (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references sessions(id) on delete cascade,
  name text not null, position integer not null default 0
);
create table prospects (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  name text not null, age integer check (age >= 0), contact text, consent boolean not null default false,
  preferred_session_id uuid references sessions(id), status text not null default 'requested'
    check (status in ('requested','approved','attended','converted','closed')),
  approved_session_ids uuid[] not null default '{}', created_at timestamptz not null default now()
);
create table groups (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  venue_id uuid references venues(id), name text not null
);
create table group_members (
  group_id uuid not null references groups(id) on delete cascade, member_id uuid references members(id) on delete cascade,
  staff_id uuid references mentis_staff(id) on delete cascade,
  check ((member_id is not null) <> (staff_id is not null))
);
create table member_goals (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references members(id) on delete cascade,
  description text not null, goal_type text not null default 'free' check (goal_type in ('free','rank','competition')),
  target_date date, status text not null default 'inProgress' check (status in ('inProgress','achieved','missed'))
);
create index members_tte_idx on members(tte_number);
create index prospects_status_idx on prospects(organization_id, status);
create index goals_member_idx on member_goals(member_id, status);
