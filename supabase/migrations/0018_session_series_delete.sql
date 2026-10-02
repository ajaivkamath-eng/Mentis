DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0018_session_series_delete.sql';
END $$;


-- Allow admins to remove generated occurrences from a program run without
-- deleting the template or the recurring rule itself. This keeps the run
-- re-publishable while letting a range be trimmed or fully cleared.
-- The project has both the legacy `mentis_session_series` naming and the newer
-- `mentis_programs` naming depending on whether 0017 was applied. Keep the
-- function compatible with both so the migration chain stays re-runnable.
begin;

create or replace function delete_session_series_occurrences(
  p_series_id     uuid,
  p_start_date    date default null,
  p_end_date      date default null,
  p_delete_all    boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_series_table text;
  v_link_table text;
  v_series_fk text;
  v_start_col text;
  v_end_col text;
  v_series record;
  v_start date;
  v_end date;
  v_deleted integer := 0;
begin
  if to_regclass('public.mentis_programs') is not null then
    v_series_table := 'mentis_programs';
    v_link_table := 'mentis_program_session_links';
    v_series_fk := 'program_id';
    v_start_col := 'start_date';
    v_end_col := 'end_date';
  else
    v_series_table := 'mentis_session_series';
    v_link_table := 'mentis_session_series_links';
    v_series_fk := 'series_id';
    v_start_col := 'starts_on';
    v_end_col := 'ends_on';
  end if;

  execute format('select * from %I where id = $1', v_series_table)
    into v_series
    using p_series_id;

  if not found then
    return jsonb_build_object(
      'series_id', p_series_id,
      'delete_all', coalesce(p_delete_all, false),
      'range_start', coalesce(p_start_date, null),
      'range_end', coalesce(p_end_date, null),
      'deleted_instances', 0,
      'skipped', true,
      'note', 'session series not found; nothing to delete'
    );
  end if;

  if not is_admin(v_series.organization_id) then
    raise exception '%: only admins can delete session series occurrences', '0018_session_series_delete.sql';
  end if;

  execute format('select %I from %I where id = $1', v_start_col, v_series_table)
    into v_start
    using p_series_id;
  execute format('select %I from %I where id = $1', v_end_col, v_series_table)
    into v_end
    using p_series_id;

  if p_delete_all then
    v_start := coalesce(v_start, current_date);
    v_end := coalesce(v_end, v_start, current_date);
    execute format('delete from public.mentis_sessions where %I = $1', v_series_fk)
      using p_series_id;
  else
    v_start := coalesce(p_start_date, v_start, current_date);
    v_end := coalesce(p_end_date, v_end, v_start, current_date);
    if v_end < v_start then
      raise exception '%: delete range end date must be on or after the start date', '0018_session_series_delete.sql';
    end if;

    execute format(
      'delete from public.mentis_sessions where %I = $1 and occurrence_date >= $2 and occurrence_date <= $3',
      v_series_fk
    )
      using p_series_id, v_start, v_end;
  end if;

  get diagnostics v_deleted = row_count;

  execute format('delete from %I where %I = $1', v_link_table, v_series_fk)
    using p_series_id;

  return jsonb_build_object(
    'series_id', p_series_id,
    'delete_all', p_delete_all,
    'range_start', v_start,
    'range_end', v_end,
    'deleted_instances', v_deleted,
    'skipped', false
  );
end $$;

comment on function delete_session_series_occurrences(uuid, date, date, boolean) is
  'Delete all occurrences in a program run or only the selected date range while leaving the recurring run itself intact.';

grant execute on function delete_session_series_occurrences(uuid, date, date, boolean) to authenticated;

DO $$
BEGIN
  if to_regclass('public.mentis_session_series') is not null then
    drop trigger if exists session_series_touch on mentis_session_series;
    create trigger session_series_touch before update on mentis_session_series
      for each row execute function touch_session_series();
  elsif to_regclass('public.mentis_programs') is not null then
    drop trigger if exists session_series_touch on mentis_programs;
    create trigger session_series_touch before update on mentis_programs
      for each row execute function touch_session_series();
  end if;
END $$;

commit;

