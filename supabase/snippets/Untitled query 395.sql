BEGIN;
TRUNCATE TABLE public.mentis_enrollments,
  public.mentis_attendance_records,
  public.mentis_sessions,
  public.mentis_members,
  public.mentis_venues,
  public.mentis_organizations
  RESTART IDENTITY CASCADE;
COMMIT;


-- Local reset + org alignment + staff link script for Mentis
-- This keeps auth.users intact, clears imported roster data, and re-aligns staff to the Kingfisher org.

BEGIN;

-- 1) Wipe imported roster data and dependent foreign-key references.
TRUNCATE TABLE public.mentis_prospects,
  public.mentis_customer_charges,
  public.mentis_tasks,
  public.mentis_staff_time_entries,
  public.mentis_schedule_overrides,
  public.mentis_session_staffing,
  public.mentis_session_segments,
  public.mentis_matches,
  public.mentis_player_feedback,
  public.mentis_member_goals,
  public.mentis_member_medical,
  public.mentis_progress_reports,
  public.mentis_rankings,
  public.mentis_group_members,
  public.mentis_event_entries,
  public.mentis_bookings,
  public.mentis_attendance_records,
  public.mentis_enrollments,
  public.mentis_sessions,
  public.mentis_members,
  public.mentis_customers,
  public.mentis_venues
CASCADE;

-- 2) Ensure the org exists, then align everything to the Kingfisher club org.
INSERT INTO public.mentis_organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Kingfisher Table Tennis Club')
ON CONFLICT (id) DO NOTHING;

UPDATE public.mentis_staff
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL OR organization_id <> '00000000-0000-0000-0000-000000000001';

-- 3) Re-link staff rows to the org and keep roles consistent.
INSERT INTO public.mentis_staff (organization_id, user_id, roles, display_name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'be474d37-90d7-4807-a5ce-28882dff3e2f', ARRAY['SUPER_ADMIN']::public.mentis_role[], 'Ajai Kamath'),
  ('00000000-0000-0000-0000-000000000001', '0442d43f-4fd2-4601-9e21-36d76e5f542e', ARRAY['COACH']::public.mentis_role[], 'Jack'),
  ('00000000-0000-0000-0000-000000000001', '171cf5d2-9a8b-4603-83d1-d6d7d035edaf', ARRAY['COACH']::public.mentis_role[], 'Richard'),
  ('00000000-0000-0000-0000-000000000001', '39ddd06f-dd1b-4728-8338-462dcbfec13a', ARRAY['COACH']::public.mentis_role[], 'Ajay'),
  ('00000000-0000-0000-0000-000000000001', '42b5ea6d-599a-43c5-afd8-a1d21c266274', ARRAY['COACH']::public.mentis_role[], 'Daniel'),
  ('00000000-0000-0000-0000-000000000001', '47d0502f-f74e-4ca4-be38-76e0a55f17c2', ARRAY['SPARRER']::public.mentis_role[], 'Jordan'),
  ('00000000-0000-0000-0000-000000000001', '4a081fea-2dc5-4b8b-99a2-3cd301f51303', ARRAY['COACH']::public.mentis_role[], 'Raj'),
  ('00000000-0000-0000-0000-000000000001', '54259e05-3387-4bc5-a523-fe655855c3fd', ARRAY['COACH']::public.mentis_role[], 'Marcel'),
  ('00000000-0000-0000-0000-000000000001', '834541c9-368d-48bc-b0b9-d0fc1c94840d', ARRAY['COACH']::public.mentis_role[], 'Alex'),
  ('00000000-0000-0000-0000-000000000001', '8a317616-c21a-427a-95b0-711c9c1e159a', ARRAY['ADMIN']::public.mentis_role[], 'John'),
  ('00000000-0000-0000-0000-000000000001', 'ab3137ee-aacb-4c31-9884-a6c8dd84c306', ARRAY['SPARRER']::public.mentis_role[], 'Noah'),
  ('00000000-0000-0000-0000-000000000001', 'ae404089-45eb-4b0e-9ded-4572c0ce4be8', ARRAY['COACH']::public.mentis_role[], 'Sam'),
  ('00000000-0000-0000-0000-000000000001', 'be879af1-3ca3-47fb-97c3-105469adefd5', ARRAY['COACH']::public.mentis_role[], 'Liam'),
  ('00000000-0000-0000-0000-000000000001', 'e725980b-f092-422c-8c30-001e559a949a', ARRAY['SPARRER']::public.mentis_role[], 'Ethan'),
  ('00000000-0000-0000-0000-000000000001', 'f03c0e26-7601-4d77-9496-b1bd289980a0', ARRAY['SPARRER']::public.mentis_role[], 'Mason'),
  ('00000000-0000-0000-0000-000000000001', 'fa6f0ced-08dd-43cf-a1d7-4a46b9ba36ff', ARRAY['ADMIN']::public.mentis_role[], 'Martin'),
  ('00000000-0000-0000-0000-000000000001', 'fd2bf0bd-05a5-4a66-be8e-a9a38ac7164d', ARRAY['COACH']::public.mentis_role[], 'Oliver')
ON CONFLICT (organization_id, user_id) DO UPDATE
SET roles = EXCLUDED.roles,
    display_name = EXCLUDED.display_name;

COMMIT;

-- 4) Optional: import the roster again using the existing sample file after this reset.
-- Example:
-- docker exec -i supabase_db_Mentis psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/session_schedule_seed.sql



BEGIN;

-- Seed a local Mentis org and build sessions from the uploaded season roster.
-- This script is intended for a fresh/local Supabase DB and keeps the imported data
-- aligned with the schema in supabase/migrations/0001_foundation.sql.

INSERT INTO public.mentis_organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'Kingfisher Table Tennis Club')
ON CONFLICT (id) DO NOTHING;

WITH seed AS (
  SELECT *
  FROM jsonb_to_recordset($$
  [
    {
      "session_name": "Sat_9AM",
      "venue": "Reading School",
      "timing": "Saturdays 09:00 AM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 12,
      "members": [
        "Aarush Sharma",
        "Aiden Ku",
        "Amardeep Sinha",
        "Arun Pryde",
        "Ary GAO",
        "Austin Plaw",
        "Krish Kopparty",
        "Matthew Mitchell",
        "Benedict Nuckley",
        "Pranav Koushik",
        "Rory Burt",
        "Thisas Rubasinghe"
      ]
    },
    {
      "session_name": "Sat_1030",
      "venue": "Reading School",
      "timing": "Saturdays 10:30 AM",
      "coach_or_lead": "Jack",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 16,
      "members": [
        "Aahan Malakannagari",
        "Abigail Hawkins",
        "Aiden Fernandes",
        "Ary GAO",
        "Charlie Gibbs",
        "Gareth Lam",
        "Jack Tanton Brown",
        "JASON HE",
        "Joshua Hibbert",
        "Lam Hang Lincoln Chan",
        "Max Suri",
        "Sharvil Jadav",
        "Sri Raghav Veerenthiran",
        "Travis Kelsey",
        "Tristan Chow",
        "Isaac Hampson"
      ]
    },
    {
      "session_name": "Sat_12",
      "venue": "Reading School",
      "timing": "Saturdays 12:00 PM",
      "coach_or_lead": "Jack",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 14,
      "members": [
        "Avik Gupta",
        "Carissa Poon",
        "Chanel Li",
        "Eva Sebastian",
        "Fabian Gandhok",
        "Finn Khoo",
        "Kavin Murugan",
        "Lakshmi Thulicheri",
        "Reuben Gandhok",
        "Sudharshana Bharathi Babu",
        "Tim Yong",
        "Umairah Nawaz",
        "UTKARSH SINHA",
        "Benjamin Jackson"
      ]
    },
    {
      "session_name": "Sat_2pm",
      "venue": "Reading School",
      "timing": "Saturdays 02:00 PM",
      "coach_or_lead": "Jack",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 12,
      "members": [
        "Alexander Snelling",
        "Anoop Sibia",
        "Arjun Sibia",
        "Charlie Gibbs",
        "Ethan Ang",
        "Krishna Ingale",
        "Maanav Rana",
        "Moses Choa",
        "Sophie Hillier",
        "Spruha Yesi",
        "Theodore Demetriou",
        "Rohan Jetha"
      ]
    },
    {
      "session_name": "Sat_330pm",
      "venue": "Reading School",
      "timing": "Saturdays 03:30 PM",
      "coach_or_lead": "Ajai",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 9,
      "members": [
        "Ayansh Chittiboyina",
        "Chellappa Palaniappan",
        "Deeptayan Mazumder",
        "Diviksha Gupta",
        "Felix Oakes",
        "Nishree Kulkarni",
        "Rosie Spriggs",
        "Vasisht Devarapalli",
        "Zyan S"
      ]
    },
    {
      "session_name": "Sat_5pm_Adults",
      "venue": "Reading School",
      "timing": "Saturdays 05:00 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2025-01-11",
        "end_date": "2025-07-26",
        "total_sessions": 29
      },
      "total_members": 10,
      "members": [
        "Andy Burwell",
        "Francis Meardon",
        "Isaac Doel",
        "James Evison",
        "Luca BIANCHI",
        "Richard Pilkington",
        "Pallavi Joshi",
        "Shriniwas Joshi",
        "Wayne Alley",
        "Nilanjan"
      ]
    },
    {
      "session_name": "Sun_9AM",
      "venue": "Reading School",
      "timing": "Sundays 09:00 AM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 15,
      "members": [
        "Aarav Muley",
        "Aiden Fernandes",
        "Ary GAO",
        "Edward Engand",
        "Evan Andries",
        "Gabriel Goon",
        "Hugo Piechocki",
        "Karthik Pakyala",
        "Shikhar Patil",
        "Vidhyuth Ragav",
        "Travis Kelsey",
        "Maanav Rana",
        "Daniel Gomez",
        "Neil Vaida",
        "Shreyan Konar"
      ]
    },
    {
      "session_name": "Sun_1030",
      "venue": "Reading School",
      "timing": "Sundays 10:30 AM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 13,
      "members": [
        "Arav Kaushik",
        "Brayden Liu",
        "Gabriel Goon",
        "JATIN SINGH GARHA",
        "Joel Bellingham",
        "Marios Tovell",
        "Matti Floroiu",
        "Nivaan Kygonahally",
        "Hayden Wong",
        "Vidhyuth Ragav",
        "YAN CHING (EUNICE) LAM",
        "Sophie Hillier",
        "Jack Manley"
      ]
    },
    {
      "session_name": "Sun_12",
      "venue": "Reading School",
      "timing": "Sundays 12:00 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 4,
      "members": [
        "Aakrish Baral",
        "Arlo Bertrand",
        "Atiksh Jha",
        "Boyue Mi"
      ]
    },
    {
      "session_name": "Sun_130pm",
      "venue": "Reading School",
      "timing": "Sundays 01:30 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 12,
      "members": [
        "Aarman Guha",
        "Anoop Sibia",
        "Anson Lai",
        "Arjun Sibia",
        "Arnie Basra",
        "Cameron Alderslade",
        "Nil Diaz Yoshino",
        "Dhruva Kalva",
        "Kevin Velkumaran",
        "Noah Hunt",
        "Parth Jha",
        "Viaan Chawla"
      ]
    },
    {
      "session_name": "Sun_3pm",
      "venue": "Reading School",
      "timing": "Sundays 03:00 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 16,
      "members": [
        "Anish Prabhu",
        "Elliot Banwell",
        "Frank O'Brien",
        "Henry Green",
        "Ho Him Jasher Tsui",
        "Jacob Handworker-Marton",
        "Krishna Ingale",
        "Liam Handworker-Marton",
        "Luke Wong",
        "Maddox Thapa",
        "Mason Jin",
        "Shaurya Birajdar",
        "Devansh Bhattacharya",
        "Arnav Basumatary",
        "Yogan Suresh",
        "Shivank Acharya"
      ]
    },
    {
      "session_name": "Sun_430pm",
      "venue": "Reading School",
      "timing": "Sundays 04:30 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 12,
      "members": [
        "Affan Adhoni",
        "Andy Ju",
        "Anqi Ju",
        "Daniel Naylor",
        "Henry Gardener",
        "Krish Kopparty",
        "Luke Wong",
        "Rylan Arthur",
        "Tristan Arthur",
        "Jasper Lubera",
        "Michael Bogatov",
        "Khaled Alweisi"
      ]
    },
    {
      "session_name": "Mon4pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Mondays 04:00 PM",
      "coach_or_lead": "Richard to approve",
      "date_range": {
        "start_date": "2026-09-07",
        "end_date": "2027-07-26",
        "total_sessions": 47
      },
      "total_members": 19,
      "members": [
        "Akshara Pillai",
        "Alexander Snelling",
        "Dylan Yildirim",
        "Grace Pau",
        "Hugo Piechocki",
        "Ishaan Thakur",
        "James Cantale",
        "Joel Hollands",
        "Keylan White scotts",
        "Matt Pau",
        "Navya Pathak",
        "Parthasarathy Palaniappan",
        "Sophie Hillier",
        "Theodore Demetriou",
        "Valerie Velkumaran",
        "Vinura Ilangamudalige",
        "Tin Yu Leung",
        "Ching Hang Leung",
        "Edward Robinson"
      ]
    },
    {
      "session_name": "Mon530",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Mondays 05:30 PM",
      "coach_or_lead": "Richard to approve",
      "date_range": {
        "start_date": "2026-09-07",
        "end_date": "2027-07-26",
        "total_sessions": 47
      },
      "total_members": 19,
      "members": [
        "Aarav Pahwa",
        "Aeyva Fayaz",
        "Anshika Kamath",
        "Charlie Zeng",
        "Chloe Kniep",
        "Daniel Michel Delgado",
        "Heilam Tse",
        "Kaavya Pathak",
        "Lucas Lin",
        "Noah CLARKE",
        "Onela Sapumanage",
        "Pak Yiu Andres Lang",
        "Pehej Vig",
        "Prayrit Ahluwalia",
        "Rabani Ahluwalia",
        "Samuel Bloomfield",
        "Samuel Kwok",
        "Soumyajit Dasgupta",
        "VIhaan Thakur"
      ]
    },
    {
      "session_name": "Tues4pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Tuesdays 04:00 PM",
      "coach_or_lead": "Raj to invite",
      "date_range": {
        "start_date": "2026-09-08",
        "end_date": "2027-07-27",
        "total_sessions": 47
      },
      "total_members": 15,
      "members": [
        "Allyson D’silva",
        "Amaya Ghosh",
        "Aneeka Iyer",
        "Chanel Li",
        "Ching Hang Leung",
        "Hugo Piechocki",
        "James Cantale",
        "Jared Au Yeung",
        "Rowan Aslett",
        "Palaash Dhingra",
        "Reuben Gandhok",
        "Shanaya Suraj",
        "Shardul Patil",
        "VIGHNAV VIGNESH",
        "Valerie Velkumaran"
      ]
    },
    {
      "session_name": "Tues5.30",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Tuesdays 05:30 PM",
      "coach_or_lead": "Richard to approve",
      "date_range": {
        "start_date": "2026-09-08",
        "end_date": "2027-07-27",
        "total_sessions": 47
      },
      "total_members": 18,
      "members": [
        "Alexander Snelling",
        "Anshika Kamath",
        "Arjun Tomar",
        "Ayansh Pahwa",
        "Charles Dewen Gao",
        "Kaavya Pathak",
        "Navya Pathak",
        "Noah CLARKE",
        "Onela Sapumanage",
        "Owen Williams",
        "Pragnya V Kondagunta",
        "Rabani Ahluwalia",
        "Shrey Talpallikar",
        "Siddharth MAHABHASHYAM",
        "SPRUHA YESI",
        "Swara Mahabhashyam",
        "Tin Yu Leung",
        "Yanting Zhu"
      ]
    },
    {
      "session_name": "Wed_4pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Wednesdays 04:00 PM",
      "coach_or_lead": "Bryan",
      "date_range": {
        "start_date": "2026-09-09",
        "end_date": "2027-07-28",
        "total_sessions": 47
      },
      "total_members": 21,
      "members": [
        "Aarav Pahwa",
        "Aeyva Fayaz",
        "Ayansh Pahwa",
        "Charlie Zeng",
        "Chloe Kniep",
        "Daniel Michel Delgado",
        "Ethan Zeng",
        "Heilam Tse",
        "Noah CLARKE",
        "Pehej Vig",
        "Prayrit Ahluwalia",
        "Rishaan SAWANT",
        "Sahil Tekurkar",
        "Samuel Kwok",
        "Soumyajit Dasgupta",
        "Swara Mahabhashyam",
        "VIhaan Thakur",
        "Anshika Kamath",
        "Rabani Ahluwalia",
        "Navya Pathak",
        "Andres Lang"
      ]
    },
    {
      "session_name": "Wed_PDC",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Wednesdays (PDC)",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-09",
        "end_date": "2027-07-28",
        "total_sessions": 47
      },
      "total_members": 5,
      "members": [
        "Alexander Snelling",
        "Shrey Talpallikar",
        "Pak Hei Yung",
        "Palaash Dhingra",
        "Valerie Velkumaran"
      ]
    },
    {
      "session_name": "Thur",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Thursdays",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-03",
        "end_date": "2027-07-22",
        "total_sessions": 47
      },
      "total_members": 19,
      "members": [
        "Aeyva Fayaz",
        "Anshika Kamath",
        "Arjun Tomar",
        "Aarav Pahwa",
        "Charlie Zeng",
        "Daniel Michel Delgado",
        "Ethan Zeng",
        "Heilam Tse",
        "Navya Pathak",
        "Noah CLARKE",
        "Pak Yiu Andres Lang",
        "Prayrit Ahluwalia",
        "Rabani Ahluwalia",
        "Rishaan SAWANT",
        "Sahil Tekurkar",
        "Swara Mahabhashyam",
        "Kaavya Pathak",
        "Ayansh Pahwa",
        "Soumyajit Dasgupta"
      ]
    },
    {
      "session_name": "Fri4pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Fridays 04:00 PM",
      "coach_or_lead": "Jack to approve",
      "date_range": {
        "start_date": "2026-09-04",
        "end_date": "2027-07-23",
        "total_sessions": 47
      },
      "total_members": 17,
      "members": [
        "Alexander Spriggs",
        "Arjun Krishna Bharathi Babu",
        "Arlo Williams",
        "Atiksh Jha",
        "Charlie Spriggs",
        "Harry Poynter",
        "Ishaan Thakur",
        "Man Chung So",
        "Nived Nikesh",
        "Pak Yiu Andres Lang",
        "Palaash Dhingra",
        "Rupert Poynter",
        "Saad Chawdhary",
        "Saatvik Khanna",
        "Shanaya Suraj",
        "Valerie Velkumaran",
        "VIGHNAV VIGNESH"
      ]
    },
    {
      "session_name": "Fri5.30",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Fridays 05:30 PM",
      "coach_or_lead": "Jack to approve",
      "date_range": {
        "start_date": "2026-09-04",
        "end_date": "2027-07-23",
        "total_sessions": 47
      },
      "total_members": 16,
      "members": [
        "Aarav Pahwa",
        "Chloe Kniep",
        "Daniel Michel Delgado",
        "Edward Thomas",
        "Leo King",
        "Marios Tovell",
        "Onela Sapumanage",
        "Pak Yiu Andres Lang",
        "Pragnya V Kondagunta",
        "Prayrit Ahluwalia",
        "Rishaan SAWANT",
        "Samuel Kwok",
        "Soumyajit Dasgupta",
        "VIhaan Thakur",
        "Charlie Zeng",
        "Parthasarathy Palaniappan"
      ]
    },
    {
      "session_name": "Sat9AM",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Saturdays 09:00 AM",
      "coach_or_lead": "Raj to invite",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 16,
      "members": [
        "Aarav Singh Rawat",
        "Edmond Peng",
        "Huxley Lynch",
        "Jiya Pawar",
        "Mya Lau",
        "Nishad Vikram",
        "Nithin Prasanna",
        "Noah Ibrahim",
        "Oisin Scannell",
        "Pak Hei Yung",
        "Pak Shun Tung",
        "Sahej Burande",
        "Samraat Singh Pawar",
        "Victor Peng",
        "Arjun Chadda",
        "James Lotherington"
      ]
    },
    {
      "session_name": "SAT_1030",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Saturdays 10:30 AM",
      "coach_or_lead": "Ajai to approve",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 17,
      "members": [
        "Aditya Mupparapu",
        "Arav Kaushik",
        "Arjun Tomar",
        "Grace Pau",
        "Ivan Mihalciuc",
        "JATIN SINGH GARHA",
        "Marios Tovell",
        "Matt Pau",
        "Noah CLARKE",
        "Onela Sapumanage",
        "Owen Williams",
        "Rabani Ahluwalia",
        "Rohan Jetha",
        "Svanik Sarangi",
        "Yanting Zhu",
        "Yat Hey Lau (Morris)",
        "Charles Dewen Gao"
      ]
    },
    {
      "session_name": "Sun9AM",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Sundays 09:00 AM",
      "coach_or_lead": "Raj to invite",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 15,
      "members": [
        "Aarnik Jena",
        "Adithya Balasubramanian",
        "Aditya Vignesh",
        "Alexander Ross",
        "Charlie Tonks",
        "Ethan Patel",
        "Gabriel Gibbs",
        "Khidash Mardhani",
        "Krish Yeddula",
        "Max Pedder",
        "reyaan chawla",
        "Ritvik Garine",
        "Rohan Parbhoo",
        "Shayan Patel",
        "Smayan Raina"
      ]
    },
    {
      "session_name": "Sun2pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Sundays 02:00 PM",
      "coach_or_lead": "Raj to invite",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 19,
      "members": [
        "Aadya Gari",
        "Aaron Hall",
        "Aevam Modi",
        "Akshara Pillai",
        "Charley Burriss",
        "Ching Hang Leung",
        "Hayden Tan",
        "Karishma Patil",
        "KAVIN BALAJI",
        "Kateryna Helei",
        "Sean Lee",
        "Shrey Talpallikar",
        "Simra Sayeed",
        "Julia Martin",
        "Tom Griffin",
        "Will Odell",
        "Jessica Martin",
        "Kohana Vemireddy",
        "Shanaya Vemireddy"
      ]
    }
  ]
  $$::jsonb) AS x(
    session_name text,
    venue text,
    timing text,
    coach_or_lead text,
    date_range jsonb,
    total_members integer,
    members jsonb
  )
),
org AS (
  SELECT id
  FROM public.mentis_organizations
  WHERE name = 'Kingfisher Table Tennis Club'
  LIMIT 1
),
venue_rows AS (
  SELECT DISTINCT
    x.venue,
    v.id AS venue_id
  FROM seed x
  JOIN public.mentis_venues v
    ON v.name = x.venue
   AND v.organization_id = (SELECT id FROM org)
),
member_rows AS (
  SELECT DISTINCT member_name
  FROM (
    SELECT jsonb_array_elements_text(members) AS member_name
    FROM seed
  ) AS m
),
member_insert AS (
  INSERT INTO public.mentis_members (organization_id, name, date_of_birth, special_needs_flag)
  SELECT
    (SELECT id FROM org),
    mr.member_name,
    DATE '2008-01-01' + ((abs(hashtext(mr.member_name)) % 3650) * INTERVAL '1 day'),
    false
  FROM member_rows mr
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.mentis_members mm
    WHERE mm.organization_id = (SELECT id FROM org)
      AND mm.name = mr.member_name
  )
  RETURNING id, name
)
INSERT INTO public.mentis_venues (id, organization_id, name, concurrent_session_limit)
SELECT
  gen_random_uuid(),
  (SELECT id FROM org),
  s.venue,
  2
FROM (
  SELECT DISTINCT venue
  FROM seed
) s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.mentis_venues v
  WHERE v.organization_id = (SELECT id FROM org)
    AND v.name = s.venue
);

WITH seed AS (
  SELECT *
  FROM jsonb_to_recordset($$
  [
    {
      "session_name": "Sat_9AM",
      "venue": "Reading School",
      "timing": "Saturdays 09:00 AM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 12,
      "members": [
        "Aarush Sharma",
        "Aiden Ku",
        "Amardeep Sinha",
        "Arun Pryde",
        "Ary GAO",
        "Austin Plaw",
        "Krish Kopparty",
        "Matthew Mitchell",
        "Benedict Nuckley",
        "Pranav Koushik",
        "Rory Burt",
        "Thisas Rubasinghe"
      ]
    },
    {
      "session_name": "Sat_1030",
      "venue": "Reading School",
      "timing": "Saturdays 10:30 AM",
      "coach_or_lead": "Jack",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 16,
      "members": [
        "Aahan Malakannagari",
        "Abigail Hawkins",
        "Aiden Fernandes",
        "Ary GAO",
        "Charlie Gibbs",
        "Gareth Lam",
        "Jack Tanton Brown",
        "JASON HE",
        "Joshua Hibbert",
        "Lam Hang Lincoln Chan",
        "Max Suri",
        "Sharvil Jadav",
        "Sri Raghav Veerenthiran",
        "Travis Kelsey",
        "Tristan Chow",
        "Isaac Hampson"
      ]
    },
    {
      "session_name": "Sat_12",
      "venue": "Reading School",
      "timing": "Saturdays 12:00 PM",
      "coach_or_lead": "Jack",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 14,
      "members": [
        "Avik Gupta",
        "Carissa Poon",
        "Chanel Li",
        "Eva Sebastian",
        "Fabian Gandhok",
        "Finn Khoo",
        "Kavin Murugan",
        "Lakshmi Thulicheri",
        "Reuben Gandhok",
        "Sudharshana Bharathi Babu",
        "Tim Yong",
        "Umairah Nawaz",
        "UTKARSH SINHA",
        "Benjamin Jackson"
      ]
    },
    {
      "session_name": "Sat_2pm",
      "venue": "Reading School",
      "timing": "Saturdays 02:00 PM",
      "coach_or_lead": "Jack",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 12,
      "members": [
        "Alexander Snelling",
        "Anoop Sibia",
        "Arjun Sibia",
        "Charlie Gibbs",
        "Ethan Ang",
        "Krishna Ingale",
        "Maanav Rana",
        "Moses Choa",
        "Sophie Hillier",
        "Spruha Yesi",
        "Theodore Demetriou",
        "Rohan Jetha"
      ]
    },
    {
      "session_name": "Sat_330pm",
      "venue": "Reading School",
      "timing": "Saturdays 03:30 PM",
      "coach_or_lead": "Ajai",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 9,
      "members": [
        "Ayansh Chittiboyina",
        "Chellappa Palaniappan",
        "Deeptayan Mazumder",
        "Diviksha Gupta",
        "Felix Oakes",
        "Nishree Kulkarni",
        "Rosie Spriggs",
        "Vasisht Devarapalli",
        "Zyan S"
      ]
    },
    {
      "session_name": "Sat_5pm_Adults",
      "venue": "Reading School",
      "timing": "Saturdays 05:00 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2025-01-11",
        "end_date": "2025-07-26",
        "total_sessions": 29
      },
      "total_members": 10,
      "members": [
        "Andy Burwell",
        "Francis Meardon",
        "Isaac Doel",
        "James Evison",
        "Luca BIANCHI",
        "Richard Pilkington",
        "Pallavi Joshi",
        "Shriniwas Joshi",
        "Wayne Alley",
        "Nilanjan"
      ]
    },
    {
      "session_name": "Sun_9AM",
      "venue": "Reading School",
      "timing": "Sundays 09:00 AM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 15,
      "members": [
        "Aarav Muley",
        "Aiden Fernandes",
        "Ary GAO",
        "Edward Engand",
        "Evan Andries",
        "Gabriel Goon",
        "Hugo Piechocki",
        "Karthik Pakyala",
        "Shikhar Patil",
        "Vidhyuth Ragav",
        "Travis Kelsey",
        "Maanav Rana",
        "Daniel Gomez",
        "Neil Vaida",
        "Shreyan Konar"
      ]
    },
    {
      "session_name": "Sun_1030",
      "venue": "Reading School",
      "timing": "Sundays 10:30 AM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 13,
      "members": [
        "Arav Kaushik",
        "Brayden Liu",
        "Gabriel Goon",
        "JATIN SINGH GARHA",
        "Joel Bellingham",
        "Marios Tovell",
        "Matti Floroiu",
        "Nivaan Kygonahally",
        "Hayden Wong",
        "Vidhyuth Ragav",
        "YAN CHING (EUNICE) LAM",
        "Sophie Hillier",
        "Jack Manley"
      ]
    },
    {
      "session_name": "Sun_12",
      "venue": "Reading School",
      "timing": "Sundays 12:00 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 4,
      "members": [
        "Aakrish Baral",
        "Arlo Bertrand",
        "Atiksh Jha",
        "Boyue Mi"
      ]
    },
    {
      "session_name": "Sun_130pm",
      "venue": "Reading School",
      "timing": "Sundays 01:30 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 12,
      "members": [
        "Aarman Guha",
        "Anoop Sibia",
        "Anson Lai",
        "Arjun Sibia",
        "Arnie Basra",
        "Cameron Alderslade",
        "Nil Diaz Yoshino",
        "Dhruva Kalva",
        "Kevin Velkumaran",
        "Noah Hunt",
        "Parth Jha",
        "Viaan Chawla"
      ]
    },
    {
      "session_name": "Sun_3pm",
      "venue": "Reading School",
      "timing": "Sundays 03:00 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 16,
      "members": [
        "Anish Prabhu",
        "Elliot Banwell",
        "Frank O'Brien",
        "Henry Green",
        "Ho Him Jasher Tsui",
        "Jacob Handworker-Marton",
        "Krishna Ingale",
        "Liam Handworker-Marton",
        "Luke Wong",
        "Maddox Thapa",
        "Mason Jin",
        "Shaurya Birajdar",
        "Devansh Bhattacharya",
        "Arnav Basumatary",
        "Yogan Suresh",
        "Shivank Acharya"
      ]
    },
    {
      "session_name": "Sun_430pm",
      "venue": "Reading School",
      "timing": "Sundays 04:30 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 12,
      "members": [
        "Affan Adhoni",
        "Andy Ju",
        "Anqi Ju",
        "Daniel Naylor",
        "Henry Gardener",
        "Krish Kopparty",
        "Luke Wong",
        "Rylan Arthur",
        "Tristan Arthur",
        "Jasper Lubera",
        "Michael Bogatov",
        "Khaled Alweisi"
      ]
    },
    {
      "session_name": "Mon4pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Mondays 04:00 PM",
      "coach_or_lead": "Richard to approve",
      "date_range": {
        "start_date": "2026-09-07",
        "end_date": "2027-07-26",
        "total_sessions": 47
      },
      "total_members": 19,
      "members": [
        "Akshara Pillai",
        "Alexander Snelling",
        "Dylan Yildirim",
        "Grace Pau",
        "Hugo Piechocki",
        "Ishaan Thakur",
        "James Cantale",
        "Joel Hollands",
        "Keylan White scotts",
        "Matt Pau",
        "Navya Pathak",
        "Parthasarathy Palaniappan",
        "Sophie Hillier",
        "Theodore Demetriou",
        "Valerie Velkumaran",
        "Vinura Ilangamudalige",
        "Tin Yu Leung",
        "Ching Hang Leung",
        "Edward Robinson"
      ]
    },
    {
      "session_name": "Mon530",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Mondays 05:30 PM",
      "coach_or_lead": "Richard to approve",
      "date_range": {
        "start_date": "2026-09-07",
        "end_date": "2027-07-26",
        "total_sessions": 47
      },
      "total_members": 19,
      "members": [
        "Aarav Pahwa",
        "Aeyva Fayaz",
        "Anshika Kamath",
        "Charlie Zeng",
        "Chloe Kniep",
        "Daniel Michel Delgado",
        "Heilam Tse",
        "Kaavya Pathak",
        "Lucas Lin",
        "Noah CLARKE",
        "Onela Sapumanage",
        "Pak Yiu Andres Lang",
        "Pehej Vig",
        "Prayrit Ahluwalia",
        "Rabani Ahluwalia",
        "Samuel Bloomfield",
        "Samuel Kwok",
        "Soumyajit Dasgupta",
        "VIhaan Thakur"
      ]
    },
    {
      "session_name": "Tues4pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Tuesdays 04:00 PM",
      "coach_or_lead": "Raj to invite",
      "date_range": {
        "start_date": "2026-09-08",
        "end_date": "2027-07-27",
        "total_sessions": 47
      },
      "total_members": 15,
      "members": [
        "Allyson D’silva",
        "Amaya Ghosh",
        "Aneeka Iyer",
        "Chanel Li",
        "Ching Hang Leung",
        "Hugo Piechocki",
        "James Cantale",
        "Jared Au Yeung",
        "Rowan Aslett",
        "Palaash Dhingra",
        "Reuben Gandhok",
        "Shanaya Suraj",
        "Shardul Patil",
        "VIGHNAV VIGNESH",
        "Valerie Velkumaran"
      ]
    },
    {
      "session_name": "Tues5.30",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Tuesdays 05:30 PM",
      "coach_or_lead": "Richard to approve",
      "date_range": {
        "start_date": "2026-09-08",
        "end_date": "2027-07-27",
        "total_sessions": 47
      },
      "total_members": 18,
      "members": [
        "Alexander Snelling",
        "Anshika Kamath",
        "Arjun Tomar",
        "Ayansh Pahwa",
        "Charles Dewen Gao",
        "Kaavya Pathak",
        "Navya Pathak",
        "Noah CLARKE",
        "Onela Sapumanage",
        "Owen Williams",
        "Pragnya V Kondagunta",
        "Rabani Ahluwalia",
        "Shrey Talpallikar",
        "Siddharth MAHABHASHYAM",
        "SPRUHA YESI",
        "Swara Mahabhashyam",
        "Tin Yu Leung",
        "Yanting Zhu"
      ]
    },
    {
      "session_name": "Wed_4pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Wednesdays 04:00 PM",
      "coach_or_lead": "Bryan",
      "date_range": {
        "start_date": "2026-09-09",
        "end_date": "2027-07-28",
        "total_sessions": 47
      },
      "total_members": 21,
      "members": [
        "Aarav Pahwa",
        "Aeyva Fayaz",
        "Ayansh Pahwa",
        "Charlie Zeng",
        "Chloe Kniep",
        "Daniel Michel Delgado",
        "Ethan Zeng",
        "Heilam Tse",
        "Noah CLARKE",
        "Pehej Vig",
        "Prayrit Ahluwalia",
        "Rishaan SAWANT",
        "Sahil Tekurkar",
        "Samuel Kwok",
        "Soumyajit Dasgupta",
        "Swara Mahabhashyam",
        "VIhaan Thakur",
        "Anshika Kamath",
        "Rabani Ahluwalia",
        "Navya Pathak",
        "Andres Lang"
      ]
    },
    {
      "session_name": "Wed_PDC",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Wednesdays (PDC)",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-09",
        "end_date": "2027-07-28",
        "total_sessions": 47
      },
      "total_members": 5,
      "members": [
        "Alexander Snelling",
        "Shrey Talpallikar",
        "Pak Hei Yung",
        "Palaash Dhingra",
        "Valerie Velkumaran"
      ]
    },
    {
      "session_name": "Thur",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Thursdays",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-03",
        "end_date": "2027-07-22",
        "total_sessions": 47
      },
      "total_members": 19,
      "members": [
        "Aeyva Fayaz",
        "Anshika Kamath",
        "Arjun Tomar",
        "Aarav Pahwa",
        "Charlie Zeng",
        "Daniel Michel Delgado",
        "Ethan Zeng",
        "Heilam Tse",
        "Navya Pathak",
        "Noah CLARKE",
        "Pak Yiu Andres Lang",
        "Prayrit Ahluwalia",
        "Rabani Ahluwalia",
        "Rishaan SAWANT",
        "Sahil Tekurkar",
        "Swara Mahabhashyam",
        "Kaavya Pathak",
        "Ayansh Pahwa",
        "Soumyajit Dasgupta"
      ]
    },
    {
      "session_name": "Fri4pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Fridays 04:00 PM",
      "coach_or_lead": "Jack to approve",
      "date_range": {
        "start_date": "2026-09-04",
        "end_date": "2027-07-23",
        "total_sessions": 47
      },
      "total_members": 17,
      "members": [
        "Alexander Spriggs",
        "Arjun Krishna Bharathi Babu",
        "Arlo Williams",
        "Atiksh Jha",
        "Charlie Spriggs",
        "Harry Poynter",
        "Ishaan Thakur",
        "Man Chung So",
        "Nived Nikesh",
        "Pak Yiu Andres Lang",
        "Palaash Dhingra",
        "Rupert Poynter",
        "Saad Chawdhary",
        "Saatvik Khanna",
        "Shanaya Suraj",
        "Valerie Velkumaran",
        "VIGHNAV VIGNESH"
      ]
    },
    {
      "session_name": "Fri5.30",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Fridays 05:30 PM",
      "coach_or_lead": "Jack to approve",
      "date_range": {
        "start_date": "2026-09-04",
        "end_date": "2027-07-23",
        "total_sessions": 47
      },
      "total_members": 16,
      "members": [
        "Aarav Pahwa",
        "Chloe Kniep",
        "Daniel Michel Delgado",
        "Edward Thomas",
        "Leo King",
        "Marios Tovell",
        "Onela Sapumanage",
        "Pak Yiu Andres Lang",
        "Pragnya V Kondagunta",
        "Prayrit Ahluwalia",
        "Rishaan SAWANT",
        "Samuel Kwok",
        "Soumyajit Dasgupta",
        "VIhaan Thakur",
        "Charlie Zeng",
        "Parthasarathy Palaniappan"
      ]
    },
    {
      "session_name": "Sat9AM",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Saturdays 09:00 AM",
      "coach_or_lead": "Raj to invite",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 16,
      "members": [
        "Aarav Singh Rawat",
        "Edmond Peng",
        "Huxley Lynch",
        "Jiya Pawar",
        "Mya Lau",
        "Nishad Vikram",
        "Nithin Prasanna",
        "Noah Ibrahim",
        "Oisin Scannell",
        "Pak Hei Yung",
        "Pak Shun Tung",
        "Sahej Burande",
        "Samraat Singh Pawar",
        "Victor Peng",
        "Arjun Chadda",
        "James Lotherington"
      ]
    },
    {
      "session_name": "SAT_1030",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Saturdays 10:30 AM",
      "coach_or_lead": "Ajai to approve",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 17,
      "members": [
        "Aditya Mupparapu",
        "Arav Kaushik",
        "Arjun Tomar",
        "Grace Pau",
        "Ivan Mihalciuc",
        "JATIN SINGH GARHA",
        "Marios Tovell",
        "Matt Pau",
        "Noah CLARKE",
        "Onela Sapumanage",
        "Owen Williams",
        "Rabani Ahluwalia",
        "Rohan Jetha",
        "Svanik Sarangi",
        "Yanting Zhu",
        "Yat Hey Lau (Morris)",
        "Charles Dewen Gao"
      ]
    },
    {
      "session_name": "Sun9AM",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Sundays 09:00 AM",
      "coach_or_lead": "Raj to invite",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 15,
      "members": [
        "Aarnik Jena",
        "Adithya Balasubramanian",
        "Aditya Vignesh",
        "Alexander Ross",
        "Charlie Tonks",
        "Ethan Patel",
        "Gabriel Gibbs",
        "Khidash Mardhani",
        "Krish Yeddula",
        "Max Pedder",
        "reyaan chawla",
        "Ritvik Garine",
        "Rohan Parbhoo",
        "Shayan Patel",
        "Smayan Raina"
      ]
    },
    {
      "session_name": "Sun2pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Sundays 02:00 PM",
      "coach_or_lead": "Raj to invite",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 19,
      "members": [
        "Aadya Gari",
        "Aaron Hall",
        "Aevam Modi",
        "Akshara Pillai",
        "Charley Burriss",
        "Ching Hang Leung",
        "Hayden Tan",
        "Karishma Patil",
        "KAVIN BALAJI",
        "Kateryna Helei",
        "Sean Lee",
        "Shrey Talpallikar",
        "Simra Sayeed",
        "Julia Martin",
        "Tom Griffin",
        "Will Odell",
        "Jessica Martin",
        "Kohana Vemireddy",
        "Shanaya Vemireddy"
      ]
    }
  ]
  $$::jsonb) AS x(
    session_name text,
    venue text,
    timing text,
    coach_or_lead text,
    date_range jsonb,
    total_members integer,
    members jsonb
  )
),
org AS (
  SELECT id FROM public.mentis_organizations WHERE name = 'Kingfisher Table Tennis Club' LIMIT 1
),
session_rows AS (
  SELECT
    x.session_name,
    v.id AS venue_id,
    org.id AS organization_id,
    x.members,
    CASE
      WHEN lower(x.timing) LIKE '%09:00%' OR lower(x.timing) LIKE '%9am%' THEN (x.date_range->>'start_date')::date + interval '9 hours'
      WHEN lower(x.timing) LIKE '%10:30%' OR lower(x.timing) LIKE '%1030%' THEN (x.date_range->>'start_date')::date + interval '10 hours 30 minutes'
      WHEN lower(x.timing) LIKE '%12:00%' OR lower(x.timing) LIKE '%12pm%' OR lower(x.timing) LIKE '%12 %' THEN (x.date_range->>'start_date')::date + interval '12 hours'
      WHEN lower(x.timing) LIKE '%01:30%' OR lower(x.timing) LIKE '%130pm%' THEN (x.date_range->>'start_date')::date + interval '13 hours 30 minutes'
      WHEN lower(x.timing) LIKE '%02:00%' OR lower(x.timing) LIKE '%2pm%' THEN (x.date_range->>'start_date')::date + interval '14 hours'
      WHEN lower(x.timing) LIKE '%03:00%' OR lower(x.timing) LIKE '%3pm%' THEN (x.date_range->>'start_date')::date + interval '15 hours'
      WHEN lower(x.timing) LIKE '%03:30%' OR lower(x.timing) LIKE '%330pm%' THEN (x.date_range->>'start_date')::date + interval '15 hours 30 minutes'
      WHEN lower(x.timing) LIKE '%04:00%' OR lower(x.timing) LIKE '%4pm%' THEN (x.date_range->>'start_date')::date + interval '16 hours'
      WHEN lower(x.timing) LIKE '%04:30%' OR lower(x.timing) LIKE '%430pm%' THEN (x.date_range->>'start_date')::date + interval '16 hours 30 minutes'
      WHEN lower(x.timing) LIKE '%05:00%' OR lower(x.timing) LIKE '%5pm%' THEN (x.date_range->>'start_date')::date + interval '17 hours'
      WHEN lower(x.timing) LIKE '%05:30%' OR lower(x.timing) LIKE '%530%' OR lower(x.timing) LIKE '%5.30%' THEN (x.date_range->>'start_date')::date + interval '17 hours 30 minutes'
      WHEN lower(x.venue) LIKE '%reading%' THEN (x.date_range->>'start_date')::date + interval '9 hours'
      ELSE (x.date_range->>'start_date')::date + interval '9 hours'
    END AS start_at,
    CASE
      WHEN lower(x.timing) LIKE '%09:00%' OR lower(x.timing) LIKE '%9am%' THEN (x.date_range->>'start_date')::date + interval '10 hours 30 minutes'
      WHEN lower(x.timing) LIKE '%10:30%' OR lower(x.timing) LIKE '%1030%' THEN (x.date_range->>'start_date')::date + interval '12 hours'
      WHEN lower(x.timing) LIKE '%12:00%' OR lower(x.timing) LIKE '%12pm%' OR lower(x.timing) LIKE '%12 %' THEN (x.date_range->>'start_date')::date + interval '13 hours 30 minutes'
      WHEN lower(x.timing) LIKE '%01:30%' OR lower(x.timing) LIKE '%130pm%' THEN (x.date_range->>'start_date')::date + interval '15 hours'
      WHEN lower(x.timing) LIKE '%02:00%' OR lower(x.timing) LIKE '%2pm%' THEN (x.date_range->>'start_date')::date + interval '15 hours 30 minutes'
      WHEN lower(x.timing) LIKE '%03:00%' OR lower(x.timing) LIKE '%3pm%' THEN (x.date_range->>'start_date')::date + interval '16 hours 30 minutes'
      WHEN lower(x.timing) LIKE '%03:30%' OR lower(x.timing) LIKE '%330pm%' THEN (x.date_range->>'start_date')::date + interval '17 hours'
      WHEN lower(x.timing) LIKE '%04:00%' OR lower(x.timing) LIKE '%4pm%' THEN (x.date_range->>'start_date')::date + interval '17 hours 30 minutes'
      WHEN lower(x.timing) LIKE '%04:30%' OR lower(x.timing) LIKE '%430pm%' THEN (x.date_range->>'start_date')::date + interval '18 hours'
      WHEN lower(x.timing) LIKE '%05:00%' OR lower(x.timing) LIKE '%5pm%' THEN (x.date_range->>'start_date')::date + interval '18 hours 30 minutes'
      WHEN lower(x.timing) LIKE '%05:30%' OR lower(x.timing) LIKE '%530%' OR lower(x.timing) LIKE '%5.30%' THEN (x.date_range->>'start_date')::date + interval '19 hours'
      ELSE (x.date_range->>'start_date')::date + interval '10 hours 30 minutes'
    END AS end_at
  FROM seed x
  JOIN public.mentis_venues v
    ON v.name = x.venue
   AND v.organization_id = (SELECT id FROM org)
  CROSS JOIN org
)
INSERT INTO public.mentis_sessions (id, organization_id, venue_id, name, start_at, end_at)
SELECT
  gen_random_uuid(),
  sr.organization_id,
  sr.venue_id,
  sr.session_name,
  sr.start_at,
  sr.end_at
FROM session_rows sr
WHERE NOT EXISTS (
  SELECT 1
  FROM public.mentis_sessions s
  WHERE s.organization_id = sr.organization_id
    AND s.venue_id = sr.venue_id
    AND s.name = sr.session_name
    AND s.start_at = sr.start_at
    AND s.end_at = sr.end_at
);

WITH seed AS (
  SELECT *
  FROM jsonb_to_recordset($$
  [
    {
      "session_name": "Sat_9AM",
      "venue": "Reading School",
      "timing": "Saturdays 09:00 AM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 12,
      "members": [
        "Aarush Sharma",
        "Aiden Ku",
        "Amardeep Sinha",
        "Arun Pryde",
        "Ary GAO",
        "Austin Plaw",
        "Krish Kopparty",
        "Matthew Mitchell",
        "Benedict Nuckley",
        "Pranav Koushik",
        "Rory Burt",
        "Thisas Rubasinghe"
      ]
    },
    {
      "session_name": "Sat_1030",
      "venue": "Reading School",
      "timing": "Saturdays 10:30 AM",
      "coach_or_lead": "Jack",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 16,
      "members": [
        "Aahan Malakannagari",
        "Abigail Hawkins",
        "Aiden Fernandes",
        "Ary GAO",
        "Charlie Gibbs",
        "Gareth Lam",
        "Jack Tanton Brown",
        "JASON HE",
        "Joshua Hibbert",
        "Lam Hang Lincoln Chan",
        "Max Suri",
        "Sharvil Jadav",
        "Sri Raghav Veerenthiran",
        "Travis Kelsey",
        "Tristan Chow",
        "Isaac Hampson"
      ]
    },
    {
      "session_name": "Sat_12",
      "venue": "Reading School",
      "timing": "Saturdays 12:00 PM",
      "coach_or_lead": "Jack",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 14,
      "members": [
        "Avik Gupta",
        "Carissa Poon",
        "Chanel Li",
        "Eva Sebastian",
        "Fabian Gandhok",
        "Finn Khoo",
        "Kavin Murugan",
        "Lakshmi Thulicheri",
        "Reuben Gandhok",
        "Sudharshana Bharathi Babu",
        "Tim Yong",
        "Umairah Nawaz",
        "UTKARSH SINHA",
        "Benjamin Jackson"
      ]
    },
    {
      "session_name": "Sat_2pm",
      "venue": "Reading School",
      "timing": "Saturdays 02:00 PM",
      "coach_or_lead": "Jack",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 12,
      "members": [
        "Alexander Snelling",
        "Anoop Sibia",
        "Arjun Sibia",
        "Charlie Gibbs",
        "Ethan Ang",
        "Krishna Ingale",
        "Maanav Rana",
        "Moses Choa",
        "Sophie Hillier",
        "Spruha Yesi",
        "Theodore Demetriou",
        "Rohan Jetha"
      ]
    },
    {
      "session_name": "Sat_330pm",
      "venue": "Reading School",
      "timing": "Saturdays 03:30 PM",
      "coach_or_lead": "Ajai",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 9,
      "members": [
        "Ayansh Chittiboyina",
        "Chellappa Palaniappan",
        "Deeptayan Mazumder",
        "Diviksha Gupta",
        "Felix Oakes",
        "Nishree Kulkarni",
        "Rosie Spriggs",
        "Vasisht Devarapalli",
        "Zyan S"
      ]
    },
    {
      "session_name": "Sat_5pm_Adults",
      "venue": "Reading School",
      "timing": "Saturdays 05:00 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2025-01-11",
        "end_date": "2025-07-26",
        "total_sessions": 29
      },
      "total_members": 10,
      "members": [
        "Andy Burwell",
        "Francis Meardon",
        "Isaac Doel",
        "James Evison",
        "Luca BIANCHI",
        "Richard Pilkington",
        "Pallavi Joshi",
        "Shriniwas Joshi",
        "Wayne Alley",
        "Nilanjan"
      ]
    },
    {
      "session_name": "Sun_9AM",
      "venue": "Reading School",
      "timing": "Sundays 09:00 AM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 15,
      "members": [
        "Aarav Muley",
        "Aiden Fernandes",
        "Ary GAO",
        "Edward Engand",
        "Evan Andries",
        "Gabriel Goon",
        "Hugo Piechocki",
        "Karthik Pakyala",
        "Shikhar Patil",
        "Vidhyuth Ragav",
        "Travis Kelsey",
        "Maanav Rana",
        "Daniel Gomez",
        "Neil Vaida",
        "Shreyan Konar"
      ]
    },
    {
      "session_name": "Sun_1030",
      "venue": "Reading School",
      "timing": "Sundays 10:30 AM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 13,
      "members": [
        "Arav Kaushik",
        "Brayden Liu",
        "Gabriel Goon",
        "JATIN SINGH GARHA",
        "Joel Bellingham",
        "Marios Tovell",
        "Matti Floroiu",
        "Nivaan Kygonahally",
        "Hayden Wong",
        "Vidhyuth Ragav",
        "YAN CHING (EUNICE) LAM",
        "Sophie Hillier",
        "Jack Manley"
      ]
    },
    {
      "session_name": "Sun_12",
      "venue": "Reading School",
      "timing": "Sundays 12:00 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 4,
      "members": [
        "Aakrish Baral",
        "Arlo Bertrand",
        "Atiksh Jha",
        "Boyue Mi"
      ]
    },
    {
      "session_name": "Sun_130pm",
      "venue": "Reading School",
      "timing": "Sundays 01:30 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 12,
      "members": [
        "Aarman Guha",
        "Anoop Sibia",
        "Anson Lai",
        "Arjun Sibia",
        "Arnie Basra",
        "Cameron Alderslade",
        "Nil Diaz Yoshino",
        "Dhruva Kalva",
        "Kevin Velkumaran",
        "Noah Hunt",
        "Parth Jha",
        "Viaan Chawla"
      ]
    },
    {
      "session_name": "Sun_3pm",
      "venue": "Reading School",
      "timing": "Sundays 03:00 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 16,
      "members": [
        "Anish Prabhu",
        "Elliot Banwell",
        "Frank O'Brien",
        "Henry Green",
        "Ho Him Jasher Tsui",
        "Jacob Handworker-Marton",
        "Krishna Ingale",
        "Liam Handworker-Marton",
        "Luke Wong",
        "Maddox Thapa",
        "Mason Jin",
        "Shaurya Birajdar",
        "Devansh Bhattacharya",
        "Arnav Basumatary",
        "Yogan Suresh",
        "Shivank Acharya"
      ]
    },
    {
      "session_name": "Sun_430pm",
      "venue": "Reading School",
      "timing": "Sundays 04:30 PM",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 12,
      "members": [
        "Affan Adhoni",
        "Andy Ju",
        "Anqi Ju",
        "Daniel Naylor",
        "Henry Gardener",
        "Krish Kopparty",
        "Luke Wong",
        "Rylan Arthur",
        "Tristan Arthur",
        "Jasper Lubera",
        "Michael Bogatov",
        "Khaled Alweisi"
      ]
    },
    {
      "session_name": "Mon4pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Mondays 04:00 PM",
      "coach_or_lead": "Richard to approve",
      "date_range": {
        "start_date": "2026-09-07",
        "end_date": "2027-07-26",
        "total_sessions": 47
      },
      "total_members": 19,
      "members": [
        "Akshara Pillai",
        "Alexander Snelling",
        "Dylan Yildirim",
        "Grace Pau",
        "Hugo Piechocki",
        "Ishaan Thakur",
        "James Cantale",
        "Joel Hollands",
        "Keylan White scotts",
        "Matt Pau",
        "Navya Pathak",
        "Parthasarathy Palaniappan",
        "Sophie Hillier",
        "Theodore Demetriou",
        "Valerie Velkumaran",
        "Vinura Ilangamudalige",
        "Tin Yu Leung",
        "Ching Hang Leung",
        "Edward Robinson"
      ]
    },
    {
      "session_name": "Mon530",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Mondays 05:30 PM",
      "coach_or_lead": "Richard to approve",
      "date_range": {
        "start_date": "2026-09-07",
        "end_date": "2027-07-26",
        "total_sessions": 47
      },
      "total_members": 19,
      "members": [
        "Aarav Pahwa",
        "Aeyva Fayaz",
        "Anshika Kamath",
        "Charlie Zeng",
        "Chloe Kniep",
        "Daniel Michel Delgado",
        "Heilam Tse",
        "Kaavya Pathak",
        "Lucas Lin",
        "Noah CLARKE",
        "Onela Sapumanage",
        "Pak Yiu Andres Lang",
        "Pehej Vig",
        "Prayrit Ahluwalia",
        "Rabani Ahluwalia",
        "Samuel Bloomfield",
        "Samuel Kwok",
        "Soumyajit Dasgupta",
        "VIhaan Thakur"
      ]
    },
    {
      "session_name": "Tues4pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Tuesdays 04:00 PM",
      "coach_or_lead": "Raj to invite",
      "date_range": {
        "start_date": "2026-09-08",
        "end_date": "2027-07-27",
        "total_sessions": 47
      },
      "total_members": 15,
      "members": [
        "Allyson D’silva",
        "Amaya Ghosh",
        "Aneeka Iyer",
        "Chanel Li",
        "Ching Hang Leung",
        "Hugo Piechocki",
        "James Cantale",
        "Jared Au Yeung",
        "Rowan Aslett",
        "Palaash Dhingra",
        "Reuben Gandhok",
        "Shanaya Suraj",
        "Shardul Patil",
        "VIGHNAV VIGNESH",
        "Valerie Velkumaran"
      ]
    },
    {
      "session_name": "Tues5.30",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Tuesdays 05:30 PM",
      "coach_or_lead": "Richard to approve",
      "date_range": {
        "start_date": "2026-09-08",
        "end_date": "2027-07-27",
        "total_sessions": 47
      },
      "total_members": 18,
      "members": [
        "Alexander Snelling",
        "Anshika Kamath",
        "Arjun Tomar",
        "Ayansh Pahwa",
        "Charles Dewen Gao",
        "Kaavya Pathak",
        "Navya Pathak",
        "Noah CLARKE",
        "Onela Sapumanage",
        "Owen Williams",
        "Pragnya V Kondagunta",
        "Rabani Ahluwalia",
        "Shrey Talpallikar",
        "Siddharth MAHABHASHYAM",
        "SPRUHA YESI",
        "Swara Mahabhashyam",
        "Tin Yu Leung",
        "Yanting Zhu"
      ]
    },
    {
      "session_name": "Wed_4pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Wednesdays 04:00 PM",
      "coach_or_lead": "Bryan",
      "date_range": {
        "start_date": "2026-09-09",
        "end_date": "2027-07-28",
        "total_sessions": 47
      },
      "total_members": 21,
      "members": [
        "Aarav Pahwa",
        "Aeyva Fayaz",
        "Ayansh Pahwa",
        "Charlie Zeng",
        "Chloe Kniep",
        "Daniel Michel Delgado",
        "Ethan Zeng",
        "Heilam Tse",
        "Noah CLARKE",
        "Pehej Vig",
        "Prayrit Ahluwalia",
        "Rishaan SAWANT",
        "Sahil Tekurkar",
        "Samuel Kwok",
        "Soumyajit Dasgupta",
        "Swara Mahabhashyam",
        "VIhaan Thakur",
        "Anshika Kamath",
        "Rabani Ahluwalia",
        "Navya Pathak",
        "Andres Lang"
      ]
    },
    {
      "session_name": "Wed_PDC",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Wednesdays (PDC)",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-09",
        "end_date": "2027-07-28",
        "total_sessions": 47
      },
      "total_members": 5,
      "members": [
        "Alexander Snelling",
        "Shrey Talpallikar",
        "Pak Hei Yung",
        "Palaash Dhingra",
        "Valerie Velkumaran"
      ]
    },
    {
      "session_name": "Thur",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Thursdays",
      "coach_or_lead": "Unassigned",
      "date_range": {
        "start_date": "2026-09-03",
        "end_date": "2027-07-22",
        "total_sessions": 47
      },
      "total_members": 19,
      "members": [
        "Aeyva Fayaz",
        "Anshika Kamath",
        "Arjun Tomar",
        "Aarav Pahwa",
        "Charlie Zeng",
        "Daniel Michel Delgado",
        "Ethan Zeng",
        "Heilam Tse",
        "Navya Pathak",
        "Noah CLARKE",
        "Pak Yiu Andres Lang",
        "Prayrit Ahluwalia",
        "Rabani Ahluwalia",
        "Rishaan SAWANT",
        "Sahil Tekurkar",
        "Swara Mahabhashyam",
        "Kaavya Pathak",
        "Ayansh Pahwa",
        "Soumyajit Dasgupta"
      ]
    },
    {
      "session_name": "Fri4pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Fridays 04:00 PM",
      "coach_or_lead": "Jack to approve",
      "date_range": {
        "start_date": "2026-09-04",
        "end_date": "2027-07-23",
        "total_sessions": 47
      },
      "total_members": 17,
      "members": [
        "Alexander Spriggs",
        "Arjun Krishna Bharathi Babu",
        "Arlo Williams",
        "Atiksh Jha",
        "Charlie Spriggs",
        "Harry Poynter",
        "Ishaan Thakur",
        "Man Chung So",
        "Nived Nikesh",
        "Pak Yiu Andres Lang",
        "Palaash Dhingra",
        "Rupert Poynter",
        "Saad Chawdhary",
        "Saatvik Khanna",
        "Shanaya Suraj",
        "Valerie Velkumaran",
        "VIGHNAV VIGNESH"
      ]
    },
    {
      "session_name": "Fri5.30",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Fridays 05:30 PM",
      "coach_or_lead": "Jack to approve",
      "date_range": {
        "start_date": "2026-09-04",
        "end_date": "2027-07-23",
        "total_sessions": 47
      },
      "total_members": 16,
      "members": [
        "Aarav Pahwa",
        "Chloe Kniep",
        "Daniel Michel Delgado",
        "Edward Thomas",
        "Leo King",
        "Marios Tovell",
        "Onela Sapumanage",
        "Pak Yiu Andres Lang",
        "Pragnya V Kondagunta",
        "Prayrit Ahluwalia",
        "Rishaan SAWANT",
        "Samuel Kwok",
        "Soumyajit Dasgupta",
        "VIhaan Thakur",
        "Charlie Zeng",
        "Parthasarathy Palaniappan"
      ]
    },
    {
      "session_name": "Sat9AM",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Saturdays 09:00 AM",
      "coach_or_lead": "Raj to invite",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 16,
      "members": [
        "Aarav Singh Rawat",
        "Edmond Peng",
        "Huxley Lynch",
        "Jiya Pawar",
        "Mya Lau",
        "Nishad Vikram",
        "Nithin Prasanna",
        "Noah Ibrahim",
        "Oisin Scannell",
        "Pak Hei Yung",
        "Pak Shun Tung",
        "Sahej Burande",
        "Samraat Singh Pawar",
        "Victor Peng",
        "Arjun Chadda",
        "James Lotherington"
      ]
    },
    {
      "session_name": "SAT_1030",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Saturdays 10:30 AM",
      "coach_or_lead": "Ajai to approve",
      "date_range": {
        "start_date": "2026-09-05",
        "end_date": "2027-07-24",
        "total_sessions": 47
      },
      "total_members": 17,
      "members": [
        "Aditya Mupparapu",
        "Arav Kaushik",
        "Arjun Tomar",
        "Grace Pau",
        "Ivan Mihalciuc",
        "JATIN SINGH GARHA",
        "Marios Tovell",
        "Matt Pau",
        "Noah CLARKE",
        "Onela Sapumanage",
        "Owen Williams",
        "Rabani Ahluwalia",
        "Rohan Jetha",
        "Svanik Sarangi",
        "Yanting Zhu",
        "Yat Hey Lau (Morris)",
        "Charles Dewen Gao"
      ]
    },
    {
      "session_name": "Sun9AM",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Sundays 09:00 AM",
      "coach_or_lead": "Raj to invite",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 15,
      "members": [
        "Aarnik Jena",
        "Adithya Balasubramanian",
        "Aditya Vignesh",
        "Alexander Ross",
        "Charlie Tonks",
        "Ethan Patel",
        "Gabriel Gibbs",
        "Khidash Mardhani",
        "Krish Yeddula",
        "Max Pedder",
        "reyaan chawla",
        "Ritvik Garine",
        "Rohan Parbhoo",
        "Shayan Patel",
        "Smayan Raina"
      ]
    },
    {
      "session_name": "Sun2pm",
      "venue": "Kingfisher Table Tennis Club",
      "timing": "Sundays 02:00 PM",
      "coach_or_lead": "Raj to invite",
      "date_range": {
        "start_date": "2026-09-06",
        "end_date": "2027-07-25",
        "total_sessions": 47
      },
      "total_members": 19,
      "members": [
        "Aadya Gari",
        "Aaron Hall",
        "Aevam Modi",
        "Akshara Pillai",
        "Charley Burriss",
        "Ching Hang Leung",
        "Hayden Tan",
        "Karishma Patil",
        "KAVIN BALAJI",
        "Kateryna Helei",
        "Sean Lee",
        "Shrey Talpallikar",
        "Simra Sayeed",
        "Julia Martin",
        "Tom Griffin",
        "Will Odell",
        "Jessica Martin",
        "Kohana Vemireddy",
        "Shanaya Vemireddy"
      ]
    }
  ]
  $$::jsonb) AS x(
    session_name text,
    venue text,
    timing text,
    coach_or_lead text,
    date_range jsonb,
    total_members integer,
    members jsonb
  )
),
org AS (
  SELECT id FROM public.mentis_organizations WHERE name = 'Kingfisher Table Tennis Club' LIMIT 1
),
links AS (
  SELECT
    s.session_name,
    v.id AS venue_id,
    org.id AS organization_id,
    member_name
  FROM seed s
  JOIN public.mentis_venues v
    ON v.name = s.venue
   AND v.organization_id = (SELECT id FROM org)
  CROSS JOIN LATERAL jsonb_array_elements_text(s.members) AS member_name
  CROSS JOIN org
)
INSERT INTO public.mentis_enrollments (id, session_id, member_id, status, expected)
SELECT
  gen_random_uuid(),
  mss.id,
  mm.id,
  'active',
  true
FROM links l
JOIN public.mentis_sessions mss
  ON mss.organization_id = l.organization_id
 AND mss.venue_id = l.venue_id
 AND mss.name = l.session_name
JOIN public.mentis_members mm
  ON mm.organization_id = l.organization_id
 AND mm.name = l.member_name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.mentis_enrollments e
  WHERE e.session_id = mss.id
    AND e.member_id = mm.id
);

COMMIT;
