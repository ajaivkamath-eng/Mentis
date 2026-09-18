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
    alter type staff_availability_type add value if not exists 'sick_leave' after 'unavailable_other';
    alter type staff_availability_type add value if not exists 'working_elsewhere' after 'sick_leave';
    alter type staff_availability_type add value if not exists 'personal_appointment' after 'working_elsewhere';
    alter type staff_availability_type add value if not exists 'training' after 'personal_appointment';
    alter type staff_availability_type add value if not exists 'club_duty' after 'training';
    alter type staff_availability_type add value if not exists 'out_of_office' after 'club_duty';
    alter type staff_availability_type add value if not exists 'working_hours' after 'out_of_office';
    alter type staff_availability_type add value if not exists 'other' after 'out_of_office';
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
    raise exception 'availability pattern must be an array of weekday windows';
  end if;
  for day in select * from jsonb_array_elements(new.pattern) loop
    if (day->>'weekday')::int not between 1 and 7 then
      raise exception 'weekday must be 1 (Monday) … 7 (Sunday)';
    end if;
    if jsonb_typeof(day->'windows') <> 'array' then
      raise exception 'each weekday needs a windows array (may be empty)';
    end if;
    for win in select * from jsonb_array_elements(day->'windows') loop
      s := win->>'start'; e := win->>'end';
      if s is null or e is null or s !~ '^\d{2}:\d{2}$' or e !~ '^\d{2}:\d{2}$' or e <= s then
        raise exception 'window %–% is not a valid HH:MM range', coalesce(s,'?'), coalesce(e,'?');
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
    when 'holiday' then 'Holiday / annual leave'
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
      values (org, new.staff_id, new.id, row.session_id, row.staffing_id, overlap, msg)
      on conflict do nothing;
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
    raise exception 'staff member does not belong to this organisation';
  end if;

  if new.session_id is not null then
    select * into assignment from mentis_session_staffing
      where session_id = new.session_id and staff_id = new.staff_id
        and planned_start <= new.starts_at and new.ends_at <= planned_end
      order by planned_start limit 1;
    if assignment.id is null then
      raise exception 'chargeable time must fall inside an assigned staffing window for this session';
    end if;
  elsif new.task_id is not null then
    if not exists (
      select 1 from mentis_tasks t where t.id = new.task_id and t.assignee_id = new.staff_id
    ) then
      raise exception 'chargeable task time requires an assignment for this staff member';
    end if;
  end if;

  -- Rate must come from a rate card valid on the event date (unless zero/non-chargeable).
  if new.rate_cents > 0 then
    select * into card from mentis_rate_cards
      where staff_id = new.staff_id and rate_cents = new.rate_cents
        and valid_from <= (new.starts_at at time zone 'UTC')::date
      order by valid_from desc limit 1;
    if card.id is null then
      raise exception 'no rate card covers % at rate % for this staff member', new.starts_at::date, new.rate_cents;
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
    raise exception 'an overlapping time window is already invoiced for this assignment';
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
