# Mentis — Kingfisher Table Tennis Club

Coaching-organization management for Android, iOS and desktop web.
Multi-sport by config (`SportProfile`), offline-first attendance, auditable
hourly-rate billing. Tandem with **Rally**: same Supabase project & user pool,
separate Mentis role set. Supabase Auth is the only login.

## Layout

| Path | What |
|---|---|
| `packages/core` | Shared TS core: entities, validation, RBAC matrix, billing, scheduling, offline sync, competition, actions, ICS, GDPR, comms, bookings, reports, CSV import |
| `supabase/migrations` | Postgres schema + RLS matrix + guards + seeds + automation |
| `supabase/functions` | Edge Functions: email, public taster API, public diary, member micro-flow, breach evaluator, monthly summary, task reminders |
| `supabase/tests/rls_matrix.sql` | Per-entity × role × command RLS tests (also run in CI via PGlite) |
| `apps/web` | Desktop console (React 19 + Vite + Tailwind 4) — Vercel |
| `apps/mobile` | Expo app (Android + iOS) — EAS Build, offline-first SQLite sync, biometric lock, OneSignal |
| `tests` | Vitest suites: business rules, billing lock, offline, breach, scheduling, round-8, DB |

## Quick start

```bash
# Core + DB suites
npm install
npm test            # 45 tests: rules + migrations + RLS matrix on PGlite Postgres
npx tsc --noEmit

# Web console
cd apps/web && npm install && npm run dev   # http://localhost:5173

# Mobile
cd apps/mobile && npm install && npx expo start
```

## Web-only local dev checklist

Use this when you only need the browser app locally and you are connecting it to Supabase.

- [ ] Install prerequisites: Node 20+ (or the repo's pinned version), npm, Docker Desktop, and the Supabase CLI.
- [ ] From the repo root, install the workspace deps:
  ```bash
  npm install
  ```
- [ ] Start the local Supabase stack and note the local API URL + anon key:
  ```bash
  supabase start
  ```
  This gives you the local API at `http://localhost:54321` and the local Studio at `http://localhost:54323`.
- [ ] Copy `apps/web/.env.example` to `apps/web/.env` and fill in the local values:
  ```env
  VITE_SUPABASE_URL=http://localhost:54321
  VITE_SUPABASE_ANON_KEY=<anon key from `supabase status`>
  ```
  For staging/production, replace the values with your real Supabase project URL and anon key instead.
- [ ] Apply the schema + RLS to the local database:
  ```bash
  supabase db push
  ```
- [ ] Run the web app:
  ```bash
  cd apps/web
  npm install
  npm run dev
  ```
  Open `http://localhost:5173`.
- [ ] Optional: if you need to test edge functions locally, run:
  ```bash
  supabase functions serve
  ```

This is the exact web-only local dev checklist for Mentis: install deps → start Supabase → copy `.env` → db push → run `npm run dev`.

## Supabase setup (staging + production)

1. Use the **same project as Rally** (shared `auth.users`).
2. `supabase db push` — applies migrations 0001–0009 (schema, RLS, seeds:
   Kingfisher org, 2 venues, table-tennis profile, action types, UK bank holidays).
3. Create staff accounts in Rally, then link Mentis roles:
   `supabase/seed_staff.sql` (replace UUIDs).
4. Deploy functions: `supabase functions deploy --all`; set `SMTP_*` and
   `ADMIN_NOTIFY_EMAIL` secrets. Cron jobs are declared in migration 0008
   (enable with real function URLs per environment).
5. CI (`.github/workflows/ci.yml`): core tests + typecheck, web build,
   mobile typecheck, edge-function `deno check`.

## The three promises

1. **<60s register** — pre-loaded expected list, tap-to-cycle, ⚠️ alerts with
   tap-to-call, taster section, filters, mark-all + grouped undo, full offline.
2. **Admin runs everything in-app** — every entity has console CRUD; no backend entries.
3. **Auditable money** — planned vs actual hours → rate-card invoices that lock
   on approval; customer charges resolve to recovered or outstanding debit, never dropped.

## Business rules → code

All 31 rules in the dev prompt are implemented in `packages/core` (pure,
tested) and enforced in Postgres (guards/triggers/RLS) where they must hold
regardless of client: under-18 validation, medical gating + audit, register
integrity, task-approval separation, billing lock, one-invoice-per-period,
charge outcomes, breach colours + roll-up, configurable action timelines,
time-stamped availability, taster gate, feedback source, org-level diary, role
switcher, holiday skipping, venue concurrency, staff no-overlap, override
precedence, rate cards, cancellation standby, postponement re-validation,
invoice lifecycle, timesheet guardrail, RLS-safe search, GDPR, app lock,
pause/waitlist, squad eligibility, 1-2-1 rules, report approval.

Out of scope (owner): Voice STT/TTS. Backlog: TTE scraper, ITTF/WTT
connectors, QR self check-in, Stripe.
