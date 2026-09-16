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
