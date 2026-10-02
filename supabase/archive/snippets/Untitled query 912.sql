drop trigger if exists sessions_venue_guard on mentis_sessions;

create or replace function guard_venue_concurrency()
returns trigger
language plpgsql
as $$
declare
  limit_v integer;
  clash integer;
begin
  select concurrent_session_limit
    into limit_v
  from mentis_venues
  where id = new.venue_id;

  select count(*)
    into clash
  from mentis_sessions
  where venue_id = new.venue_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000')
    and status <> 'cancelled'
    and start_at < new.end_at
    and new.start_at < end_at;

  if clash >= coalesce(limit_v, 1) then
    raise exception 'venue concurrency limit (%) exceeded for this time slot', coalesce(limit_v, 1);
  end if;

  return new;
end;
$$;

create trigger sessions_venue_guard
before insert or update on mentis_sessions
for each row
execute function guard_venue_concurrency();