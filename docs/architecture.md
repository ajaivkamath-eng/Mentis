# Mentis architecture

## Security model

- Supabase Auth (shared with Rally). Mentis roles live in `mentis_staff.roles`
  (multi-role array). The app shell has a **role switcher**: UI renders for the
  **selected role** (`packages/core/permissions.ts`); Postgres RLS enforces the
  **union** of held roles — the DB never grants more than the user's roles.
- RLS on every table (`0006_rls_matrix.sql`). Sensitive flows add triggers:
  task approval is admin-only, invoice approval/lock, coach session edits are
  notes-only, medical reads are app-audit-logged (SELECT has no triggers).
- Service role only in Edge Functions. Public paths (taster form, diary,
  micro-flow) go through Edge Functions with service role — no anon table access.

## Money trail

`session_staffing` (rate card selected per assignment) → `staff_time_entries`
(planned auto-post / actual / standby) → `invoices` + `invoice_lines` →
`billing_ledger` (synced by trigger; entry marked `billed`). Approved/paid
invoices are immutable (update/delete/insert guards). Re-invoicing lists only
unbilled items. Tasks gate billing via separate `approved_at`.
Customer charges: `pendingApproval → approved → recovered | outstandingDebit`
(+ due date + admin action).

## Scheduling

`weekly_schedules` generate `sessions` (instances) skipping `holiday_calendar`;
`schedule_overrides` supersede ranges (originals kept). Guards at save: venue
concurrency (`concurrent_session_limit`, default 1), staff no-overlap
(back-to-back OK), no-session days. Staffing colour derives from staffing vs
availability (`session_staffing_status` view); breach evaluator creates actions
and emails on breach.

## Offline (mobile)

Register rows cached in SQLite; marks enqueue ops; `flushQueue` pushes with
dedupe and latest-timestamp-wins merge. Grouped undo (mark-all reverts in one
tap). Web console is online.

## Environments

Staging + production Supabase projects; Vercel (web) preview/production;
EAS `staging`/`production` channels. EU region for data residency.
