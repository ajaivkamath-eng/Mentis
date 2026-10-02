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
