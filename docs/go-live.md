# Mentis go-live runbook

## Deploy order (staging → prod)

1. `npx supabase db push` (applies `0001`–`0010`; seeds Kingfisher org, venues,
   Table Tennis profile, action types, UK holidays, org policies).
2. Seed staff links: `supabase/seed_staff.sql` (map Rally `auth.users` ids →
   `mentis_staff` rows with roles).
3. `npx supabase functions deploy` for all functions in `supabase/functions`.
4. Set function secrets (SMTP, admin notify, OneSignal — see below).
5. Enable pg_cron schedules (`0008` + `0010` ship them as `where false`
   placeholders — re-run with the real functions URL):
   `mentis-monthly-summary` (monthly), `mentis-breach-eval` (15 min),
   `mentis-task-reminders` (hourly).
6. Web (Vercel): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_FUNCTIONS_URL`.
7. Mobile (EAS): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
8. Create first ADMIN via SQL, then manage the rest in-app (Users page).

## Function secrets

| Secret | Used by |
|---|---|
| `SMTP_HOST/PORT/USER/PASS/FROM` | `_shared/mail.ts` (all email) |
| `ADMIN_NOTIFY_EMAIL` | `taster-form` |
| `ONESIGNAL_APP_ID` / `ONESIGNAL_API_KEY` | `send-push` (skips cleanly if absent) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | all functions (platform-provided) |

## Route map (web)

Public (no login): `/taster` (taster form), `/diary` (read-only diary),
`/my` (member micro-flow: availability + bookings + reports),
`/book` (1-2-1 booking with member code).

Authed: `/` dashboard, `/today`, `/register/:id`, `/feedback/:source/:id`,
`/members` (+`/new`, `/:id` 360°), `/customers` (+`/new`), `/enrolments`,
`/tasters`, `/sessions`, `/scheduling`, `/overrides`, `/holidays`,
`/diary-manage`, `/staffing`, `/closeout`, `/availability`, `/tasks`,
`/inbox`, `/actions/new`, `/action-timelines`, `/billing`, `/timesheet`,
`/charges`, `/rates`, `/events`, `/matches/new`, `/rankings`, `/goals`,
`/analytics`, `/slots`, `/bookings`, `/progress`, `/coach-perf`, `/sparring`,
`/suggest`, `/venues`, `/groups`, `/devices`, `/audit`, `/import`,
`/venue-dashboard`, `/member-sessions`, `/ics`, `/search`, `/users`,
`/settings`, `/reports`.

## Cron / automation

- `mentis-breach-eval` every 15 min → `breach-evaluator` (pending actions).
- `mentis-task-reminders` hourly → `task-reminders` (due/overdue nudges).
- `mentis-monthly-summary` monthly → `monthly-summary` (guardian summaries).
- DB triggers enforce venue concurrency, staff overlap, holiday blocks,
  coach edit scope, locked-invoice protection, and audit writes.

## Verification

- `npm test` (root vitest: DB migration + RLS matrix + phase-6 suites).
- `npm run typecheck` (root), web `npm run build`, mobile `npx tsc --noEmit`.
- CI (`.github/workflows/ci.yml`) runs lint/typecheck/tests/build on PRs.
