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

