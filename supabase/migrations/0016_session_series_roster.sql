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

