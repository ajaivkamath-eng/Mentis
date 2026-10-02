DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0007_seeds.sql';
END $$;


-- Mentis staging seeds: Kingfisher TTC (2 mentis_venues), table-tennis profile,
-- action types, UK bank holidays. Demo users are created in Rally (shared
-- auth); link them via mentis_staff rows — see supabase/seed_staff.sql.
insert into mentis_organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Kingfisher Table Tennis Club')
on conflict (id) do nothing;

insert into mentis_venues (organization_id, name, address, concurrent_session_limit)
select v.organization_id, v.name, v.address, v.concurrent_session_limit
from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Kingfisher Table Tennis Club', '2 Woodlands Ave, Woodley, Reading RG5 3EU', 1),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Reading School', 'Erleigh Road, Reading, Berkshire, RG1 5LW', 1)
) as v(organization_id, name, address, concurrent_session_limit)
where not exists (
  select 1 from mentis_venues x
  where x.organization_id = v.organization_id and x.name = v.name);

insert into mentis_sport_profiles (organization_id, name, rank_system, feedback_attributes, playing_styles, equipment_guide, session_templates, group_templates) values
  ('00000000-0000-0000-0000-000000000001', 'Table Tennis',
   '{"type":"band","levels":["Beginner","Foundation","Intermediate","Advanced","Elite"]}',
   '{"skill":["forehand","backhand","serve","footwork","receiving"],"focus":["concentration","composure under pressure"],"behaviour":["discipline","sportsmanship","coachability","communication/team attitude"],"progression":["improvement vs previous","consistency","response to training","goal achievement"]}',
   '["Attacker","All-round","Defender/Chopper","Pips-out hitter","Left-hand looper","Custom"]',
   'Welcome to Kingfisher TTC! You need: a table-tennis racket (all-round blade to start), non-marking indoor court shoes, comfortable sportswear, and a water bottle. We will help you register with Table Tennis England (TTE) when you are ready to compete.',
   '["Group coaching","1-2-1","Open practice","Squad training","Holiday camp"]',
   '["Beginners","Intermediates","Squad","Adults"]')
on conflict (organization_id, name) do nothing;

insert into mentis_action_types (organization_id, name, trigger, due_offset, breach_offset) values
  ('00000000-0000-0000-0000-000000000001', 'name replacement staff', 'event', make_interval(days => 30), make_interval(days => 7)),
  ('00000000-0000-0000-0000-000000000001', 'confirm staffing', 'event', make_interval(days => 14), make_interval(days => 7)),
  ('00000000-0000-0000-0000-000000000001', 'clear outstanding debit', 'event', make_interval(days => 14), make_interval(days => 7)),
  ('00000000-0000-0000-0000-000000000001', 'backfill missing staff details', 'activity', make_interval(days => 7), make_interval(days => 3)),
  ('00000000-0000-0000-0000-000000000001', 'review unbilled items', 'activity', make_interval(days => 7), make_interval(days => 3))
on conflict (organization_id, name) do nothing;

-- UK bank holidays (admin-editable) + term-holiday week samples.
insert into mentis_holiday_calendar (organization_id, name, kind, starts_on, ends_on)
select h.organization_id, h.name, h.kind, h.starts_on, h.ends_on
from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'New Year''s Day', 'bank_holiday'::holiday_kind, '2026-01-01'::date, '2026-01-01'::date),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Good Friday', 'bank_holiday', '2026-04-03', '2026-04-03'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Easter Monday', 'bank_holiday', '2026-04-06', '2026-04-06'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Early May bank holiday', 'bank_holiday', '2026-05-04', '2026-05-04'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Spring bank holiday', 'bank_holiday', '2026-05-25', '2026-05-25'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Summer bank holiday', 'bank_holiday', '2026-08-31', '2026-08-31'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Christmas Day', 'bank_holiday', '2026-12-25', '2026-12-25'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Boxing Day', 'bank_holiday', '2026-12-28', '2026-12-28'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'February half-term', 'term_break', '2026-02-16', '2026-02-20'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Easter holidays', 'term_break', '2026-03-30', '2026-04-10'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'May half-term', 'term_break', '2026-05-25', '2026-05-29'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Summer holidays', 'term_break', '2026-07-27', '2026-08-28'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'October half-term', 'term_break', '2026-10-26', '2026-10-30'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Christmas holidays', 'term_break', '2026-12-21', '2027-01-01'),
  -- 2026/27 season (03-Sep-2026 → 25-Jul-2027); term dates are typical England dates, adjust per LA.
  ('00000000-0000-0000-0000-000000000001'::uuid, 'New Year''s Day', 'bank_holiday', '2027-01-01', '2027-01-01'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Good Friday', 'bank_holiday', '2027-03-26', '2027-03-26'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Easter Monday', 'bank_holiday', '2027-03-29', '2027-03-29'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Early May bank holiday', 'bank_holiday', '2027-05-03', '2027-05-03'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Spring bank holiday', 'bank_holiday', '2027-05-31', '2027-05-31'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Summer bank holiday', 'bank_holiday', '2027-08-30', '2027-08-30'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Christmas Day', 'bank_holiday', '2027-12-27', '2027-12-27'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Boxing Day', 'bank_holiday', '2027-12-28', '2027-12-28'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'February half-term', 'term_break', '2027-02-15', '2027-02-19'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Easter holidays', 'term_break', '2027-03-29', '2027-04-09'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'May half-term', 'term_break', '2027-05-31', '2027-06-04'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Summer holidays', 'term_break', '2027-07-26', '2027-09-01')
) as h(organization_id, name, kind, starts_on, ends_on)
where not exists (
  select 1 from mentis_holiday_calendar x
  where x.organization_id = h.organization_id and x.name = h.name and x.starts_on = h.starts_on);

