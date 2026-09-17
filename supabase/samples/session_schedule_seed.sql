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
