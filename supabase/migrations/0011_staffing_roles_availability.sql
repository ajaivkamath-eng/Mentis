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
-- 'available', 'on_duty', 'holiday', 'duty_outside_club', 'unavailable_other'
do $$ begin
  if not exists (select 1 from pg_type where typname = 'staff_availability_type') then
    create type staff_availability_type as enum (
      'available',
      'on_duty',
      'holiday',
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
    raise exception 'staff member already has an overlapping session assignment';
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
