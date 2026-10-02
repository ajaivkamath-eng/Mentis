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
