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

