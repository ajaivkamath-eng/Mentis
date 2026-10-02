DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0020_session_roster_templates_seed.sql';
END $$;


-- 2026/27 season roster expressed as session blueprints (migration 0013 model).
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/samples/session_roster_templates_seed.sql
--
-- Replaces the old "one mentis_session_occurrences row per roster line" import: each roster
-- line becomes a mentis_sessions blueprint + default roster + a weekly
-- mentis_recurrence_rules pattern, and the final block publishes a series so the
-- individual sessions are generated (holidays skipped) instead of hand-inserted.
--
-- Prerequisites: migrations 0001-0016, and supabase/seed_staff.sql for coach
-- matching and for the admin identity the publish step borrows.
-- Safe to re-run: every step is guarded on natural keys, and re-publishing reuses
-- the season (one mentis_session_series per template per 2026-09-03 start).
--
-- Operating model: 1 template -> many sessions across the 2026-09-03..2027-07-25
-- season; each session may be linked to multiple series rules, and the same
-- session is still traced back to the template that owns it.
--
-- Timings come from the roster's "timing" text; every session is 90 minutes.
-- Two lines carry no time of day. "Thursdays" is imported at 16:00 — the slot
-- its cohort uses on Mondays and Wednesdays — and tagged `time-inferred`.
-- "Wednesdays (PDC)" has no comparable cohort, so it stays a `draft` blueprint
-- at a 09:00 placeholder and generates no sessions until the slot is known.
BEGIN;

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('mentis_session_templates', 'mentis_program_blueprints')
  ) then
    raise exception '%: Session roster seed requires the template model from 0013_session_templates.sql. Reset the public schema and run migrations 0001..0018 in order before running this seed.', '0020_session_roster_templates_seed.sql';
  end if;

  if to_regclass('public.mentis_program_blueprints') is not null and to_regclass('public.mentis_session_templates') is null then
    create view public.mentis_session_templates as
      select * from public.mentis_program_blueprints;
  end if;

  if to_regclass('public.mentis_programs') is not null and to_regclass('public.mentis_session_series') is null then
    create view public.mentis_session_series as
      select * from public.mentis_programs;
  end if;

  if to_regclass('public.mentis_program_session_links') is not null and to_regclass('public.mentis_session_series_links') is null then
    create view public.mentis_session_series_links as
      select * from public.mentis_program_session_links;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mentis_session_templates'
      and column_name in ('code', 'default_start_time', 'default_end_time', 'timezone')
      and (select count(*)
           from information_schema.columns c2
           where c2.table_schema = 'public'
             and c2.table_name = 'mentis_session_templates'
             and c2.column_name in ('code', 'default_start_time', 'default_end_time', 'timezone')) >= 4
  ) then
    raise exception '%: mentis_session_templates is not on the template-era schema. This seed expects code/default_start_time/default_end_time/timezone columns. Reset the public schema and run the migration chain first.', '0020_session_roster_templates_seed.sql';
  end if;

  if not exists (select 1 from mentis_organizations where name = 'Kingfisher Table Tennis Club') then
    raise exception '%: Kingfisher Table Tennis Club org not found — apply supabase/migrations first', '0020_session_roster_templates_seed.sql';
  end if;
end $$;

drop table if exists public.tmp_session_roster;
create table public.tmp_session_roster (
  organization_id uuid not null,
  code            text primary key,
  name            text not null,
  venue           text not null,
  timing          text not null,
  weekday         smallint not null,
  start_time      time not null,
  end_time        time not null,
  coach_hint      text,
  valid_from      date not null,
  valid_to        date not null,
  capacity        integer not null,
  tags            text[] not null,
  status          text not null,
  members         jsonb not null
);

insert into tmp_session_roster (
  organization_id, code, name, venue, timing, weekday, start_time, end_time,
  coach_hint, valid_from, valid_to, capacity, tags, status, members
)
select
  (select id from mentis_organizations where name = 'Kingfisher Table Tennis Club' limit 1),
  x.code, x.name, x.venue, x.timing, x.weekday, x.start_time, x.end_time,
  x.coach_hint,
  -- Every template shares the season window so each season has the same starts_on.
  date '2026-09-03', date '2027-07-25', x.capacity,
  array(select jsonb_array_elements_text(x.tags)), x.status, x.members
from jsonb_to_recordset(
  (
    select $$
[
  {
    "code": "RS-SAT-0900", "name": "Sat_9AM", "venue": "Reading School",
    "timing": "Saturdays 09:00 AM", "weekday": 6, "start_time": "09:00", "end_time": "10:30",
    "coach_hint": null, "valid_from": "2026-09-05", "valid_to": "2027-07-24",
    "capacity": 12, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarush Sharma", "Aiden Ku", "Amardeep Sinha", "Arun Pryde", "Ary GAO", "Austin Plaw", "Krish Kopparty", "Matthew Mitchell", "Benedict Nuckley", "Pranav Koushik", "Rory Burt", "Thisas Rubasinghe"]
  },
  {
    "code": "RS-SAT-1030", "name": "Sat_1030", "venue": "Reading School",
    "timing": "Saturdays 10:30 AM", "weekday": 6, "start_time": "10:30", "end_time": "12:00",
    "coach_hint": "Jack", "valid_from": "2026-09-05", "valid_to": "2027-07-24",
    "capacity": 16, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aahan Malakannagari", "Abigail Hawkins", "Aiden Fernandes", "Ary GAO", "Charlie Gibbs", "Gareth Lam", "Jack Tanton Brown", "JASON HE", "Joshua Hibbert", "Lam Hang Lincoln Chan", "Max Suri", "Sharvil Jadav", "Sri Raghav Veerenthiran", "Travis Kelsey", "Tristan Chow", "Isaac Hampson"]
  },
  {
    "code": "RS-SAT-1200", "name": "Sat_12", "venue": "Reading School",
    "timing": "Saturdays 12:00 PM", "weekday": 6, "start_time": "12:00", "end_time": "13:30",
    "coach_hint": "Jack", "valid_from": "2026-09-05", "valid_to": "2027-07-24",
    "capacity": 14, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Avik Gupta", "Carissa Poon", "Chanel Li", "Eva Sebastian", "Fabian Gandhok", "Finn Khoo", "Kavin Murugan", "Lakshmi Thulicheri", "Reuben Gandhok", "Sudharshana Bharathi Babu", "Tim Yong", "Umairah Nawaz", "UTKARSH SINHA", "Benjamin Jackson"]
  },
  {
    "code": "RS-SAT-1400", "name": "Sat_2pm", "venue": "Reading School",
    "timing": "Saturdays 02:00 PM", "weekday": 6, "start_time": "14:00", "end_time": "15:30",
    "coach_hint": "Jack", "valid_from": "2026-09-05", "valid_to": "2027-07-24",
    "capacity": 12, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Alexander Snelling", "Anoop Sibia", "Arjun Sibia", "Charlie Gibbs", "Ethan Ang", "Krishna Ingale", "Maanav Rana", "Moses Choa", "Sophie Hillier", "Spruha Yesi", "Theodore Demetriou", "Rohan Jetha"]
  },
  {
    "code": "RS-SAT-1530", "name": "Sat_330pm", "venue": "Reading School",
    "timing": "Saturdays 03:30 PM", "weekday": 6, "start_time": "15:30", "end_time": "17:00",
    "coach_hint": "Ajai", "valid_from": "2026-09-05", "valid_to": "2027-07-24",
    "capacity": 9, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Ayansh Chittiboyina", "Chellappa Palaniappan", "Deeptayan Mazumder", "Diviksha Gupta", "Felix Oakes", "Nishree Kulkarni", "Rosie Spriggs", "Vasisht Devarapalli", "Zyan S"]
  },
  {
    "code": "RS-SUN-0900", "name": "Sun_9AM", "venue": "Reading School",
    "timing": "Sundays 09:00 AM", "weekday": 7, "start_time": "09:00", "end_time": "10:30",
    "coach_hint": null, "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 15, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarav Muley", "Aiden Fernandes", "Ary GAO", "Edward Engand", "Evan Andries", "Gabriel Goon", "Hugo Piechocki", "Karthik Pakyala", "Shikhar Patil", "Vidhyuth Ragav", "Travis Kelsey", "Maanav Rana", "Daniel Gomez", "Neil Vaida", "Shreyan Konar"]
  },
  {
    "code": "RS-SUN-1030", "name": "Sun_1030", "venue": "Reading School",
    "timing": "Sundays 10:30 AM", "weekday": 7, "start_time": "10:30", "end_time": "12:00",
    "coach_hint": null, "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 13, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Arav Kaushik", "Brayden Liu", "Gabriel Goon", "JATIN SINGH GARHA", "Joel Bellingham", "Marios Tovell", "Matti Floroiu", "Nivaan Kygonahally", "Hayden Wong", "Vidhyuth Ragav", "YAN CHING (EUNICE) LAM", "Sophie Hillier", "Jack Manley"]
  },
  {
    "code": "RS-SUN-1200", "name": "Sun_12", "venue": "Reading School",
    "timing": "Sundays 12:00 PM", "weekday": 7, "start_time": "12:00", "end_time": "13:30",
    "coach_hint": null, "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 4, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aakrish Baral", "Arlo Bertrand", "Atiksh Jha", "Boyue Mi"]
  },
  {
    "code": "RS-SUN-1330", "name": "Sun_130pm", "venue": "Reading School",
    "timing": "Sundays 01:30 PM", "weekday": 7, "start_time": "13:30", "end_time": "15:00",
    "coach_hint": null, "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 12, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarman Guha", "Anoop Sibia", "Anson Lai", "Arj1un Sibia", "Arnie Basra", "Cameron Alderslade", "Nil Diaz Yoshino", "Dhruva Kalva", "Kevin Velkumaran", "Noah Hunt", "Parth Jha", "Viaan Chawla"]
  },
  {
    "code": "RS-SUN-1500", "name": "Sun_3pm", "venue": "Reading School",
    "timing": "Sundays 03:00 PM", "weekday": 7, "start_time": "15:00", "end_time": "16:30",
    "coach_hint": null, "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 16, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Anish Prabhu", "Elliot Banwell", "Frank O'Brien", "Henry Green", "Ho Him Jasher Tsui", "Jacob Handworker-Marton", "Krishna Ingale", "Liam Handworker-Marton", "Luke Wong", "Maddox Thapa", "Mason Jin", "Shaurya Birajdar", "Devansh Bhattacharya", "Arnav Basumatary", "Yogan Suresh", "Shivank Acharya"]
  },
  {
    "code": "RS-SUN-1630", "name": "Sun_430pm", "venue": "Reading School",
    "timing": "Sundays 04:30 PM", "weekday": 7, "start_time": "16:30", "end_time": "18:00",
    "coach_hint": null, "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 12, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Affan Adhoni", "Andy Ju", "Anqi Ju", "Daniel Naylor", "Henry Gardener", "Krish Kopparty", "Luke Wong", "Rylan Arthur", "Tristan Arthur", "Jasper Lubera", "Michael Bogatov", "Khaled Alweisi"]
  },
  {
    "code": "KF-MON-1600", "name": "Mon4pm", "venue": "Kingfisher Table Tennis Club",
    "timing": "Mondays 04:00 PM", "weekday": 1, "start_time": "16:00", "end_time": "17:30",
    "coach_hint": "Richard", "valid_from": "2026-09-07", "valid_to": "2027-07-26",
    "capacity": 19, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Akshara Pillai", "Alexander Snelling", "Dylan Yildirim", "Grace Pau", "Hugo Piechocki", "Ishaan Thakur", "James Cantale", "Joel Hollands", "Keylan White scotts", "Matt Pau", "Navya Pathak", "Parthasarathy Palaniappan", "Sophie Hillier", "Theodore Demetriou", "Valerie Velkumaran", "Vinura Ilangamudalige", "Tin Yu Leung", "Ching Hang Leung", "Edward Robinson"]
  },
  {
    "code": "KF-MON-1730", "name": "Mon530", "venue": "Kingfisher Table Tennis Club",
    "timing": "Mondays 05:30 PM", "weekday": 1, "start_time": "17:30", "end_time": "19:00",
    "coach_hint": "Richard", "valid_from": "2026-09-07", "valid_to": "2027-07-26",
    "capacity": 19, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarav Pahwa", "Aeyva Fayaz", "Anshika Kamath", "Charlie Zeng", "Chloe Kniep", "Daniel Michel Delgado", "Heilam Tse", "Kaavya Pathak", "Lucas Lin", "Noah CLARKE", "Onela Sapumanage", "Pak Yiu Andres Lang", "Pehej Vig", "Prayrit Ahluwalia", "Rabani Ahluwalia", "Samuel Bloomfield", "Samuel Kwok", "Soumyajit Dasgupta", "VIhaan Thakur"]
  },
  {
    "code": "KF-TUE-1600", "name": "Tues4pm", "venue": "Kingfisher Table Tennis Club",
    "timing": "Tuesdays 04:00 PM", "weekday": 2, "start_time": "16:00", "end_time": "17:30",
    "coach_hint": "Raj", "valid_from": "2026-09-08", "valid_to": "2027-07-27",
    "capacity": 15, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Allyson D’silva", "Amaya Ghosh", "Aneeka Iyer", "Chanel Li", "Ching Hang Leung", "Hugo Piechocki", "James Cantale", "Jared Au Yeung", "Rowan Aslett", "Palaash Dhingra", "Reuben Gandhok", "Shanaya Suraj", "Shardul Patil", "VIGHNAV VIGNESH", "Valerie Velkumaran"]
  },
  {
    "code": "KF-TUE-1730", "name": "Tues5.30", "venue": "Kingfisher Table Tennis Club",
    "timing": "Tuesdays 05:30 PM", "weekday": 2, "start_time": "17:30", "end_time": "19:00",
    "coach_hint": "Richard", "valid_from": "2026-09-08", "valid_to": "2027-07-27",
    "capacity": 18, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Alexander Snelling", "Anshika Kamath", "Arjun Tomar", "Ayansh Pahwa", "Charles Dewen Gao", "Kaavya Pathak", "Navya Pathak", "Noah CLARKE", "Onela Sapumanage", "Owen Williams", "Pragnya V Kondagunta", "Rabani Ahluwalia", "Shrey Talpallikar", "Siddharth MAHABHASHYAM", "SPRUHA YESI", "Swara Mahabhashyam", "Tin Yu Leung", "Yanting Zhu"]
  },
  {
    "code": "KF-WED-1600", "name": "Wed_4pm", "venue": "Kingfisher Table Tennis Club",
    "timing": "Wednesdays 04:00 PM", "weekday": 3, "start_time": "16:00", "end_time": "17:30",
    "coach_hint": "Bryan", "valid_from": "2026-09-09", "valid_to": "2027-07-28",
    "capacity": 21, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarav Pahwa", "Aeyva Fayaz", "Ayansh Pahwa", "Charlie Zeng", "Chloe Kniep", "Daniel Michel Delgado", "Ethan Zeng", "Heilam Tse", "Noah CLARKE", "Pehej Vig", "Prayrit Ahluwalia", "Rishaan SAWANT", "Sahil Tekurkar", "Samuel Kwok", "Soumyajit Dasgupta", "Swara Mahabhashyam", "VIhaan Thakur", "Anshika Kamath", "Rabani Ahluwalia", "Navya Pathak", "Andres Lang"]
  },
  {
    "code": "KF-WED-PDC", "name": "Wed_PDC", "venue": "Kingfisher Table Tennis Club",
    "timing": "Wednesdays (PDC)", "weekday": 3, "start_time": "19:00", "end_time": "20:30",
    "coach_hint": null, "valid_from": "2026-09-09", "valid_to": "2027-07-28",
    "capacity": 5, "tags": ["roster-import", "2026-27", "pdc", "time-tbc"], "status": "draft",
    "members": ["Alexander Snelling", "Shrey Talpallikar", "Pak Hei Yung", "Palaash Dhingra", "Valerie Velkumaran"]
  },
  {
    "code": "KF-THU-4PM", "name": "Thur", "venue": "Kingfisher Table Tennis Club",
    "timing": "Thursdays", "weekday": 4, "start_time": "16:00", "end_time": "19:00",
    "coach_hint": null, "valid_from": "2026-09-03", "valid_to": "2027-07-22",
    "capacity": 19, "tags": ["roster-import", "2026-27", "time-inferred"], "status": "active",
    "members": ["Aeyva Fayaz", "Anshika Kamath", "Arjun Tomar", "Aarav Pahwa", "Charlie Zeng", "Daniel Michel Delgado", "Ethan Zeng", "Heilam Tse", "Navya Pathak", "Noah CLARKE", "Pak Yiu Andres Lang", "Prayrit Ahluwalia", "Rabani Ahluwalia", "Rishaan SAWANT", "Sahil Tekurkar", "Swara Mahabhashyam", "Kaavya Pathak", "Ayansh Pahwa", "Soumyajit Dasgupta"]
  },
  {
    "code": "KF-FRI-1600", "name": "Fri4pm", "venue": "Kingfisher Table Tennis Club",
    "timing": "Fridays 04:00 PM", "weekday": 5, "start_time": "16:00", "end_time": "17:30",
    "coach_hint": "Jack", "valid_from": "2026-09-04", "valid_to": "2027-07-23",
    "capacity": 17, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Alexander Spriggs", "Arjun Krishna Bharathi Babu", "Arlo Williams", "Atiksh Jha", "Charlie Spriggs", "Harry Poynter", "Ishaan Thakur", "Man Chung So", "Nived Nikesh", "Pak Yiu Andres Lang", "Palaash Dhingra", "Rupert Poynter", "Saad Chawdhary", "Saatvik Khanna", "Shanaya Suraj", "Valerie Velkumaran", "VIGHNAV VIGNESH"]
  },
  {
    "code": "KF-FRI-1730", "name": "Fri5.30", "venue": "Kingfisher Table Tennis Club",
    "timing": "Fridays 05:30 PM", "weekday": 5, "start_time": "17:30", "end_time": "19:00",
    "coach_hint": "Jack", "valid_from": "2026-09-04", "valid_to": "2027-07-23",
    "capacity": 16, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarav Pahwa", "Chloe Kniep", "Daniel Michel Delgado", "Edward Thomas", "Leo King", "Marios Tovell", "Onela Sapumanage", "Pak Yiu Andres Lang", "Pragnya V Kondagunta", "Prayrit Ahluwalia", "Rishaan SAWANT", "Samuel Kwok", "Soumyajit Dasgupta", "VIhaan Thakur", "Charlie Zeng", "Parthasarathy Palaniappan"]
  },
  {
    "code": "KF-SAT-0900", "name": "Sat9AM", "venue": "Kingfisher Table Tennis Club",
    "timing": "Saturdays 09:00 AM", "weekday": 6, "start_time": "09:00", "end_time": "10:30",
    "coach_hint": "Raj", "valid_from": "2026-09-05", "valid_to": "2027-07-24",
    "capacity": 16, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarav Singh Rawat", "Edmond Peng", "Huxley Lynch", "Jiya Pawar", "Mya Lau", "Nishad Vikram", "Nithin Prasanna", "Noah Ibrahim", "Oisin Scannell", "Pak Hei Yung", "Pak Shun Tung", "Sahej Burande", "Samraat Singh Pawar", "Victor Peng", "Arjun Chadda", "James Lotherington"]
  },
  {
    "code": "KF-SAT-1030", "name": "SAT_1030", "venue": "Kingfisher Table Tennis Club",
    "timing": "Saturdays 10:30 AM", "weekday": 6, "start_time": "10:30", "end_time": "12:00",
    "coach_hint": "Ajai", "valid_from": "2026-09-05", "valid_to": "2027-07-24",
    "capacity": 17, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aditya Mupparapu", "Arav Kaushik", "Arjun Tomar", "Grace Pau", "Ivan Mihalciuc", "JATIN SINGH GARHA", "Marios Tovell", "Matt Pau", "Noah CLARKE", "Onela Sapumanage", "Owen Williams", "Rabani Ahluwalia", "Rohan Jetha", "Svanik Sarangi", "Yanting Zhu", "Yat Hey Lau (Morris)", "Charles Dewen Gao"]
  },
  {
    "code": "KF-SUN-0900", "name": "Sun9AM", "venue": "Kingfisher Table Tennis Club",
    "timing": "Sundays 09:00 AM", "weekday": 7, "start_time": "09:00", "end_time": "10:30",
    "coach_hint": "Raj", "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 15, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aarnik Jena", "Adithya Balasubramanian", "Aditya Vignesh", "Alexander Ross", "Charlie Tonks", "Ethan Patel", "Gabriel Gibbs", "Khidash Mardhani", "Krish Yeddula", "Max Pedder", "reyaan chawla", "Ritvik Garine", "Rohan Parbhoo", "Shayan Patel", "Smayan Raina"]
  },
  {
    "code": "KF-SUN-1400", "name": "Sun2pm", "venue": "Kingfisher Table Tennis Club",
    "timing": "Sundays 02:00 PM", "weekday": 7, "start_time": "14:00", "end_time": "15:30",
    "coach_hint": "Raj", "valid_from": "2026-09-06", "valid_to": "2027-07-25",
    "capacity": 19, "tags": ["roster-import", "2026-27"], "status": "active",
    "members": ["Aadya Gari", "Aaron Hall", "Aevam Modi", "Akshara Pillai", "Charley Burriss", "Ching Hang Leung", "Hayden Tan", "Karishma Patil", "KAVIN BALAJI", "Kateryna Helei", "Sean Lee", "Shrey Talpallikar", "Simra Sayeed", "Julia Martin", "Tom Griffin", "Will Odell", "Jessica Martin", "Kohana Vemireddy", "Shanaya Vemireddy"]
  }
]
$$::jsonb
  )
) as x(
  code text, name text, venue text, timing text, weekday smallint,
  start_time time, end_time time, coach_hint text,
  valid_from date, valid_to date, capacity integer,
  tags jsonb, status text, members jsonb
);

-- Fail fast if any imported slot is malformed; this surfaces the exact roster
-- code(s) with an invalid range instead of letting Postgres reject the later
-- recurrence-rule insert with the generic check-constraint message.
do $$
declare
  v_offenders text;
begin
  select string_agg(code || ': ' || start_time || ' -> ' || end_time, ', ' order by code)
    into v_offenders
  from tmp_session_roster
  where end_time <= start_time;

  if v_offenders is not null then
    raise exception '%: invalid roster time ranges in recurrence seed: %', '0020_session_roster_templates_seed.sql', v_offenders;
  end if;
end $$;

-- 1. Venues referenced by the roster ----------------------------------------
insert into mentis_venues (organization_id, name, concurrent_session_limit)
select distinct r.organization_id, r.venue, 2
from tmp_session_roster r
where not exists (
  select 1 from mentis_venues v
  where v.organization_id = r.organization_id and v.name = r.venue);

-- 2. Members ------------------------------------------------------------------
-- The roster carries names only; date_of_birth is NOT NULL, so a deterministic
-- placeholder is derived from the name and must be corrected before go-live.
insert into mentis_members (organization_id, name, date_of_birth)
select mr.organization_id, mr.member_name,
       date '2008-01-01' + ((abs(hashtext(mr.member_name)) % 3650) * interval '1 day')
from (
  select distinct r.organization_id, m.member_name
  from tmp_session_roster r
  cross join lateral jsonb_array_elements_text(r.members) as m(member_name)
) mr
where not exists (
  select 1 from mentis_members mm
  where mm.organization_id = mr.organization_id and mm.name = mr.member_name);

-- 3. Blueprints ----------------------------------------------------------------
insert into mentis_session_templates (
  organization_id, code, name, description, venue_id,
  default_start_time, default_end_time, timezone,
  capacity, default_charge_cents, leading_coach_id, tags, status
)
select
  r.organization_id, r.code, r.name,
  'Imported from the season roster (' || r.timing || ', ' || r.venue || ').',
  v.id, r.start_time, r.end_time, 'Europe/London',
  r.capacity, null, coach.id, r.tags, r.status
from tmp_session_roster r
join mentis_venues v
  on v.organization_id = r.organization_id and v.name = r.venue
left join lateral (
  select ms.id from mentis_staff ms
  where r.coach_hint is not null
    and ms.organization_id = r.organization_id
    and ms.display_name ilike r.coach_hint || '%'
  order by ms.display_name limit 1
) coach on true
where not exists (
  select 1 from mentis_session_templates t
  where t.organization_id = r.organization_id and t.name = r.name and t.venue_id = v.id);

-- 3b. Re-align blueprints seeded by an earlier run of this file. Only rows this
--     import owns (tagged `roster-import`) are touched, and only when they drift.
update mentis_session_templates t
   set default_start_time = r.start_time,
       default_end_time   = r.end_time,
       capacity           = r.capacity,
       status             = r.status,
       tags               = r.tags
from tmp_session_roster r
where t.organization_id = r.organization_id
  and t.code = r.code
  and 'roster-import' = any (t.tags)
  and (t.default_start_time, t.default_end_time, t.capacity, t.status, t.tags)
      is distinct from (r.start_time, r.end_time, r.capacity, r.status, r.tags);

update mentis_recurrence_rules rr
   set start_time = r.start_time,
       end_time   = r.end_time,
       by_weekday = array[r.weekday]::smallint[],
       valid_from = r.valid_from,
       valid_to   = r.valid_to,
       horizon_days = least(greatest((r.valid_to - r.valid_from) + 1, 1), 730),
       label      = r.name || ' — season ' || to_char(r.valid_from, 'YYYY') || '/' || to_char(r.valid_to, 'YY'),
       is_active  = (r.valid_to >= current_date),
       updated_at = now()
from tmp_session_roster r
join mentis_session_templates t
  on t.organization_id = r.organization_id and t.code = r.code
where rr.template_id = t.id
  and 'roster-import' = any (t.tags)
  and r.end_time > r.start_time
  and not exists (select 1 from mentis_session_series s where s.recurrence_rule_id = rr.id)
  and (rr.start_time, rr.end_time, rr.by_weekday, rr.valid_from, rr.valid_to)
      is distinct from (r.start_time, r.end_time, array[r.weekday]::smallint[], r.valid_from, r.valid_to);

-- 4. Staffing plan: one lead slot per blueprint, left open where the roster
--    says "Unassigned" / "… to approve".
insert into mentis_session_template_staffing (
  template_id, capacity, staff_id, rate_card_id, required, lead_minutes, trail_minutes, notes
)
select t.id, 'lead', t.leading_coach_id,
  (select rc.id from mentis_rate_cards rc
    where rc.staff_id = t.leading_coach_id order by rc.valid_from desc limit 1),
  true, 15, 0,
  case when t.leading_coach_id is null then 'Lead coach to be confirmed' end
from tmp_session_roster r
join mentis_session_templates t
  on t.organization_id = r.organization_id and t.code = r.code
where not exists (
  select 1 from mentis_session_template_staffing st
  where st.template_id = t.id and st.capacity = 'lead');

-- 5. Default roster -------------------------------------------------------------
insert into mentis_session_template_members (template_id, member_id)
select t.id, m.id
from tmp_session_roster r
join mentis_session_templates t
  on t.organization_id = r.organization_id and t.code = r.code
cross join lateral jsonb_array_elements_text(r.members) as mn(member_name)
join mentis_members m
  on m.organization_id = r.organization_id and m.name = mn.member_name
where not exists (
  select 1 from mentis_session_template_members st
  where st.template_id = t.id and st.member_id = m.id
);

-- 6. Recurrence: weekly on the roster's day, bounded by the season window ---------
insert into mentis_recurrence_rules (
  organization_id, template_id, label, frequency, interval_count, by_weekday,
  start_time, end_time, valid_from, valid_to, horizon_days,
  skip_term_holidays, skip_bank_holidays, skip_manual_closures, is_active
)
select
  r.organization_id, t.id, r.name || ' — season ' || to_char(r.valid_from, 'YYYY') || '/' || to_char(r.valid_to, 'YY'),
  'weekly', 1, array[r.weekday]::smallint[],
  r.start_time, r.end_time, r.valid_from, r.valid_to,
  least(greatest((r.valid_to - r.valid_from) + 1, 1), 730),
  true, true, true,
  r.valid_to >= current_date
from tmp_session_roster r
join mentis_session_templates t
  on t.organization_id = r.organization_id and t.code = r.code
where r.end_time > r.start_time
  and not exists (
    select 1 from mentis_recurrence_rules rr where rr.template_id = t.id);

-- 7. Publish a series per active blueprint ----------------------------------------
-- Generates the individual mentis_session_occurrences rows, skipping term breaks and bank
-- holidays (rule 16 rejects sessions on no-session days outright). Comment this
-- block out to seed blueprints only. `instantiate_session_series` is admin-gated,
-- so the seed borrows a real admin identity the way PostgREST does.
do $$
declare
  t record;
  result jsonb;
  admin_uid uuid;
begin
  select ms.user_id into admin_uid
  from mentis_staff ms
  join mentis_organizations o on o.id = ms.organization_id
  where o.name = 'Kingfisher Table Tennis Club'
    and ms.roles && array['SUPER_ADMIN', 'ADMIN']::mentis_role[]
  order by ms.display_name limit 1;

  if admin_uid is null then
    insert into auth.users (
      id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, aud, role
    ) values (
      'be474d37-90d7-4807-a5ce-28882dff3e2f',
      'ajai@kingfisher.example',
      '',
      now(),
      now(),
      now(),
      '{}'::jsonb,
      '{}'::jsonb,
      'authenticated',
      'authenticated'
    )
    on conflict (id) do nothing;

    insert into mentis_staff (organization_id, user_id, roles, display_name)
    values (
      (select id from mentis_organizations where name = 'Kingfisher Table Tennis Club' limit 1),
      'be474d37-90d7-4807-a5ce-28882dff3e2f',
      array['SUPER_ADMIN']::mentis_role[],
      'Ajai Kamath'
    )
    on conflict (organization_id, user_id)
      do update set roles = excluded.roles, display_name = excluded.display_name;

    select ms.user_id into admin_uid
    from mentis_staff ms
    join mentis_organizations o on o.id = ms.organization_id
    where o.name = 'Kingfisher Table Tennis Club'
      and ms.user_id = 'be474d37-90d7-4807-a5ce-28882dff3e2f';
  end if;

  if admin_uid is null then
    raise exception '%: no KINGFISHER admin staff identity was available; create one or re-run supabase/seed_staff.sql before publishing roster sessions', '0020_session_roster_templates_seed.sql';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_uid::text, 'role', 'authenticated')::text, false);

  for t in
    select tpl.id as template_id, tpl.name, rr.id as rule_id, rr.label
    from tmp_session_roster r
    join mentis_session_templates tpl
      on tpl.organization_id = r.organization_id and tpl.code = r.code
    join mentis_recurrence_rules rr on rr.template_id = tpl.id
    where tpl.status = 'active' and rr.is_active
    order by tpl.name
  loop
    -- Idempotent: reuses the template's season and only generates missing dates.
    result := instantiate_session_series(
      t.template_id,
      '{}'::jsonb,
      jsonb_build_object('rule_id', t.rule_id, 'label', t.label)
    );
    perform sync_template_roster_to_child_sessions(t.template_id);
    raise notice '%: % generated, % existing, % term-break and % bank-holiday dates skipped',
      t.name, result->>'generated', result->>'existing',
      result->>'skipped_term_holidays', result->>'skipped_bank_holidays';
  end loop;

  perform set_config('request.jwt.claims', '{}', false);
end $$;

-- Scratch table only: it holds the raw roster (names, dates of birth) and has no
-- RLS, so it must not survive the seed.
drop table if exists public.tmp_session_roster;

COMMIT;

