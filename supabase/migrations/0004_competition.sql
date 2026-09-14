-- Mentis competition: org-level diary (rule 14), entries, matches, rankings, feedback.
create table events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  name text not null, sport_id uuid references sport_profiles(id),
  starts_on date not null, ends_on date not null, location text, entry_deadline date,
  source text not null default 'manual' check (source in ('tte','ittf_wtt','club','local','manual')),
  external_ref text, status text not null default 'published'
    check (status in ('draft','published','completed','cancelled')),
  check (ends_on >= starts_on)
);
create table sub_events (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id) on delete cascade,
  name text not null, age_band text, rank_band text
);
create table event_entries (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade, sub_event_id uuid references sub_events(id),
  status text not null default 'interested'
    check (status in ('suggested','interested','available','confirmed','notAvailable','entered','completed')),
  suggested_by uuid, guardian_confirmed boolean not null default false,
  unique(event_id, member_id, sub_event_id)
);
create table matches (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references members(id) on delete cascade,
  played_on date not null, event_id uuid references events(id), sub_event_id uuid references sub_events(id),
  session_id uuid references sessions(id), opponent text not null,
  games_for integer[] not null default '{}', games_against integer[] not null default '{}',
  result text not null check (result in ('W','L','D')),
  source text not null default 'manual' check (source in ('tte','ittf_wtt','club','local','manual')),
  source_ref text,
  check (event_id is not null or sub_event_id is not null or session_id is not null),
  check (cardinality(games_for) = cardinality(games_against))
);
create table rankings (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references members(id) on delete cascade,
  platform text not null, rank_value integer not null, as_of date not null, source_ref text,
  unique(member_id, platform, as_of)
);
create table player_feedback (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  member_id uuid not null references members(id) on delete cascade, coach_id uuid not null references mentis_staff(id),
  body text not null default '', source_type text not null check (source_type in ('session','event')),
  session_id uuid references sessions(id), event_id uuid references events(id),
  sub_source_kind text check (sub_source_kind in ('segment','subEvent','match')),
  sub_source_id uuid, ratings jsonb not null default '{}',
  performed_with_staff uuid[] not null default '{}', performed_with_players uuid[] not null default '{}',
  tags text[] not null default '{}', created_at timestamptz not null default now(),
  check ((source_type = 'session' and session_id is not null) or (source_type = 'event' and event_id is not null))
);
create index events_org_date_idx on events(organization_id, starts_on);
create index entries_member_idx on event_entries(member_id, status);
create index matches_member_idx on matches(member_id, played_on desc);
create index rankings_member_idx on rankings(member_id, platform, as_of desc);
create index feedback_member_idx on player_feedback(member_id, created_at desc);
