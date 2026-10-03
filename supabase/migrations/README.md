# Mentis database setup order

Apply these files in exactly this order against a fresh database
(`supabase db push` applies them automatically in filename order).

## 1. Migrations (required, CI-verified by `tests/db.test.ts`)

| # | File | Contents |
|---|------|----------|
| 1 | `0001_foundation.sql` | Enums `mentis_role`/`attendance_status`, core tables (organizations, staff, venues, customers, members, sessions, enrollments, attendance, audit log), role helper functions |
| 2 | `0002_scheduling_billing.sql` | Scheduling enums, holiday calendar, weekly schedules, rate cards, schedule/session staffing, availability, tasks, time entries, invoices, pending actions |
| 3 | `0003_entities.sql` | Sport profiles, medical, session segments, prospects, groups, member goals |
| 4 | `0004_competition.sql` | Events, sub-events, entries, matches, rankings, player feedback |
| 5 | `0005_money_comms.sql` | Billing ledger, customer charges, communication log, booking slots/bookings, progress reports, devices |
| 6 | `0006_rls_matrix.sql` | RLS helper functions (`is_admin`, `is_staff`, `my_staff_id`, …) and the full policy matrix — **everything after this depends on it** |
| 7 | `0007_seeds.sql` | Kingfisher org, 2 venues, table-tennis profile, action types, UK holidays (idempotent) |
| 8 | `0008_automation.sql` | Guard triggers, billing ledger sync, audit triggers, staffing view, storage buckets, cron jobs |
| 9 | `0009_trigger_fix.sql` | Fixes `prevent_locked_invoice_change` from 0002 |
| 10 | `0010_phase_gaps.sql` | Organization policies table, member-code backfill |
| 11 | `0011_staffing_roles_availability.sql` | Coach-role columns on sessions/schedules, staffing window constraint, conflicts view |
| 12 | `0012_diary_calendar.sql` | Availability rules, diary conflicts, conflict scanning, diary RLS + cron |
| 13 | `0013_session_templates.sql` | Program blueprints, recurrence rules, sessions, generator/API functions, overview views |
| 14 | `0014_session_member_ranges.sql` | Validity windows on template roster / enrollments, `parent_template_id` on programs |
| 15 | `0015_template_member_cascade.sql` | Template roster → child session enrollment sync |
| 16 | `0016_session_series_roster.sql` | Date-aware effective roster per session occurrence |
| 17 | `0017_program_terminology_alignment.sql` | Rename legacy session/series wording to the final program blueprint → program → session model |
| 18 | `0018_session_series_delete.sql` | Delete all occurrences in a session or a selected date window while keeping the recurring run re-publishable |
| 19 | `0019_coach_qualifications.sql` | Qualification types, staff qualifications and their privacy policies |
| 20 | `0020_session_roster_templates_seed.sql` | Season roster as blueprints + weekly series (data seed; skipped by the test harness) |
| 21 | `0021_tagging_system.sql` | Tags and taggable entity links |
| 22 | `0022_api_role_grants.sql` | Table/sequence/function grants for `anon`, `authenticated`, `service_role` + default privileges — **required, the REST API returns "permission denied for table …" without it** |
| 27 | `0027_batch_groupings.sql` | First-class cohort/season groupings on weekly patterns, program runs, and sessions; legacy-row backfill, lineage enforcement, RLS, and grouped generation RPCs |

Grants contract: `0000` drops the public schema, which also drops Supabase's
bootstrap grants for the PostgREST roles. `0000` re-creates the schema-level
grants and default privileges, and `0022` re-grants everything the chain created
in between. `0022` also fails the migration if any table in `public` has RLS
disabled, since the grants assume RLS is the row-level gate. Never hand-grant
in a test harness — that hides a real production 403.

Operating model: Program blueprint (`mentis_program_blueprints`) → program
(`mentis_programs`, created intentionally when a new run/season starts) → session
(`mentis_sessions`, each actual scheduled occurrence). The program is the
concrete run window (for example, Sep 2026 to Jul 2027), while each session is the
individual dated class or recurring occurrence scheduled within it. Programs are
created deliberately by the user when the period starts; they are not auto-created
from the blueprint alone. Each program can generate sessions in bulk
(`instantiate_session_series`) or singly (`instantiate_session` with `session_id`).
Re-publishing the same session pattern reuses it and only fills missing dates.

Notes for a fresh install:

- 0009 supersedes the 0002 version of `prevent_locked_invoice_change`; 0011 supersedes
  `guard_staff_overlap` from 0008; 0012 supersedes the `mentis_staff_session_conflicts`
  view from 0011. Keep all of them — the earlier definitions are part of the history.
- 0012 runs `alter type … add value`; on PostgreSQL < 12 it must not run inside an
  explicit transaction block.
- 0008's `guard_holiday_session` rejects sessions that fall on rows in
  `mentis_holiday_calendar`. The 0007 holiday seeds cover 2026–27, so any session seed
  crossing those dates must skip them.

## 2. Post-migration seeds (run manually, not part of `migrations/`)

| Order | File | Purpose |
|-------|------|---------|
| 1 | `../seed_staff.sql` | Link `auth.users` UUIDs to `mentis_staff` rows — **edit the UUIDs for your environment first** |
| 2 | `../samples/session_schedule_seed.sql` | Optional: full season roster (venues, members, sessions, enrolments) |
| 3 | `../samples/session_schedule_customer_seed.sql` | Optional: backfill parent/guardian customers (run after seed above) |
| 4 | `../samples/session_templates_seed.sql` | Optional: sample blueprints + published series (needs 0013 and an ADMIN in `mentis_staff`) |
| 5 | `../samples/session_roster_templates_seed.sql` | Optional: the real season roster as blueprints + weekly series (alternative to rows 2–3) |

Teardown for the roster seed: `../samples/clear_session_seed.sql`.

## 3. Verification

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ../tests/rls_matrix.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ../tests/session_templates.sql
npm test   # tests/db.test.ts applies every migration to a scratch DB
```

## 4. Archive

Ad-hoc query snippets, duplicates and superseded one-off helpers live in
`../archive/` and must **not** be applied to a new database.
