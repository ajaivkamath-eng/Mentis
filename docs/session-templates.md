# Session blueprints (templates)

> Status: shipped — schema `0013_session_templates.sql`, console page
> `/templates`, shared model `packages/core/src/templates.ts`.
> Replaces "make a recurring session by cloning an existing session row".

## Why

Before this change a recurring session was created *from an instance*: the
Sessions workbook took a row of `mentis_sessions`, let an admin pick a pattern
and then inserted more `mentis_sessions` rows. The pattern therefore lived only
in the rows it produced — nothing described *what the session is*. Editing the
"series" meant editing instances, and the old `mentis_weekly_schedules`
(generate-a-`session`-from-a-pattern) was a second, competing notion of the
same idea.

Now the relationship is the right way round:

```
mentis_session_templates            the blueprint — what a session is
  ├── mentis_session_template_staffing    default staffing plan (role slots)
  ├── mentis_session_template_members     default roster
  └── mentis_recurrence_rules             when it repeats
        └── mentis_session_series         a published run of the blueprint
              └── mentis_sessions         instances (register, diary, billing)
```

Instances stay first-class rows — attendance, enrolments, diary entries,
staffing and invoices all hang off the instance — but they now carry
provenance:

| Column | Meaning |
|---|---|
| `template_id` | the blueprint it was instantiated from |
| `series_id` | the run it belongs to (`null` = one-off) |
| `occurrence_date` | the local date the occurrence belongs to (one instance per series+date) |
| `blueprint` | JSON snapshot of the blueprint **at instantiation** |
| `is_exception` / `overridden_fields` | the instance has been edited off the blueprint |
| `generated_at` | when the materialiser wrote it |

## The model

- **Blueprint** (`mentis_session_templates`) — name, code, venue, default
  start/end time, time zone, level band, capacity, default coaches, tags,
  charge, `status` (`draft | active | archived`) and a `version` that the
  `session_templates_touch` trigger bumps on any material edit (name, venue,
  times, time zone, capacity, level band, charge, coaches). Tags, descriptions
  and other incidental edits do not bump it.
- **Staffing plan** (`mentis_session_template_staffing`) — the role slots every
  instance gets: `lead | assistant | sparrer`, optionally pinned to a coach and
  a rate card, with `lead_minutes` / `trail_minutes` for partial allocations.
  A slot with no coach is an **open slot**: it is filled from the blueprint's
  default coach for that role, or left unstaffed — the console then shows the
  instance as "lead needed", and `instantiate_session` reports it as a
  `warning` rather than failing the run. When a slot names a coach but no rate
  card, the coach's latest rate card is used so time entries stay billable.
- **Default roster** (`mentis_session_template_members`) — members enrolled
  into each instance as it is created.
- **Recurrence rule** (`mentis_recurrence_rules`) — `daily | weekly |
  fortnightly | monthly | quarterly`, `interval_count`, ISO `by_weekday`
  (1 = Monday … 7 = Sunday), local `start_time`/`end_time`, `timezone`,
  `valid_from`/`valid_to`, rolling `horizon_days`, `max_occurrences`, and three
  skip switches (term breaks, bank holidays, manual closures).
- **Series** (`mentis_session_series`) — the published run: template +
  rule + resolved venue, `starts_on`/`ends_on`, `status`
  (`active | paused | ended`) and the `template_version` it was published from.

## Generation semantics (preview = what you get)

`expand_recurrence()` is pure calendar maths; `session_template_occurrences()`
adds holiday classification and returns **every candidate date with its
decision** (`action = generate | skip`, plus the `holiday_name`/`holiday_kind`
that caused a skip). The console preview calls the TypeScript mirror of exactly
those two functions, so what the admin sees is what the materialiser writes.

- **daily** — every `interval_count` days from `valid_from`.
- **weekly / fortnightly** — repeat by weekday, anchored on the Monday of the
  week containing `valid_from`, so adding a weekday never moves existing dates.
  `by_weekday` empty means "the weekday of `valid_from`".
- **monthly / quarterly** — same day-of-month as `valid_from`, clamped to the
  month's last day (31 Jan → 28 Feb → 31 Mar). If weekdays are named, the first
  matching weekday on/after that day is used; a month with no match is skipped.
- **Holidays** — a date covered by `mentis_holiday_calendar` is skipped when
  its kind is switched on (`term_break`, `bank_holiday`, `manual`).
- **Open-ended rules** — `valid_to` null stops at
  `valid_from + horizon_days - 1` (the horizon counts its first day).
  `extend_session_series()` re-runs the rule and materialises only what is new.
- **Idempotency** — an existence check on `(series_id, occurrence_date)` makes
  publishing the same range twice a no-op (`skipped_existing` counts those
  dates), and `instantiate_session()` returns the existing row when the same
  one-off slot is created twice.
- **No-session days are absolute** — rule 16 (`guard_holiday_session`) refuses
  to store *any* session on a holiday date, so a holiday that is deliberately
  not skipped comes back in `conflicts` with the guard's message instead of
  being created silently.

Times are stored as local wall-clock plus a zone and converted with
`at time zone`, so 18:00 London is 18:00Z in January and 17:00Z in July.

## API (SQL, callable from the console and Edge Functions)

| Function | Purpose |
|---|---|
| `expand_recurrence(rule jsonb)` | pure date expansion (fixed-date testable) |
| `session_template_occurrences(rule jsonb)` | preview: date + action + holiday |
| `blueprint_snapshot(template_id)` | the JSON snapshot stored on each instance |
| `session_blueprint_drift(...)` / `blueprint_drift_fields(template_id, session_id)` | which blueprint fields an instance currently differs on |
| `template_completeness(template_id)` | publishability problems (mirrored client-side) |
| `instantiate_session(template_id, start_at?, options)` | one-off instance + staffing + roster, returns `warnings` |
| `instantiate_session_series(template_id, rule, options)` | publish/extend a run; returns counts, generated dates, conflicts, warnings |
| `extend_session_series(series_id, options)` | top up an open-ended run |
| `set_session_series_status(series_id, status, cancel_future, reason)` | pause / resume / end (optionally cancelling what is ahead) |
| `apply_blueprint_to_session(session_id, fields?, source?)` | undo drift: restore all or some fields and clear the override list |
| `template_from_weekly_schedule(schedule_id)` | import a legacy weekly pattern as a blueprint (idempotent) |

Invariants are enforced in the schema rather than by a single guard function:
`CHECK`s cover the slot order, the rule's date window and ISO weekdays
(`by_weekday <@ {1..7}`), the template's head count and the unique
`(organisation, name, venue)`; `session_templates_touch` bumps `version` and
`updated_at`. Conflict handling happens at instantiation time — the
venue-concurrency, staff-overlap and no-session-day guards are caught **per
occurrence**, so one blocked slot is reported in `conflicts` instead of
aborting the whole run.

Publishing requires a Mentis admin (`is_admin`), matching the RLS on the new
tables (staff read, admin write). Views `session_template_overview` and
`session_series_overview` expose the counters the console shows (active series,
upcoming instances, drifted instances, next occurrence), with
`security_invoker = true`.

## Drift, not deletion

Editing an instance is normal — a coach moves one week, a room changes. The
`sessions_zz_blueprint_drift` trigger recomputes, on every write of an instance,
which blueprint-derived fields currently differ (`name`, `start_at`, `end_at`,
`venue_id`, `capacity`, `level_band`) and stores them in `overridden_fields`
with `is_exception` set. It runs after the other `sessions_*` BEFORE triggers so
it sees their final values, and it is *derived state*: putting a value back onto
the blueprint value simply clears the flag. So:

- the blueprint is never silently rewritten by instance edits;
- the console badges the instance ("1 field(s) off blueprint") and offers
  **Re-apply**, which restores only the drifted fields (or the ones the caller
  lists) from the live blueprint, then records the fresh snapshot;
- series and blueprint views report how much of each run has drifted;
- reports can distinguish "planned pattern" from "what actually ran".

Status changes (cancelled/completed), notes, staffing edits and the register are
*not* drift — only the fields the blueprint owns are compared.

`apply_blueprint_to_session()` never touches attendance, enrolments, staffing
rows or invoices: those belong to the instance, not to the blueprint.

## Console flow (`/templates`, nav: Coaching → Blueprints)

1. **New blueprint** — name, venue, default slot, coaches, staffing slots
   (role, coach, rate card, lead-in/trail), default roster, tags. The form
   blocks saving while `templateCompleteness` reports problems, the same
   problems `template_completeness()` raises server-side.
2. **Publish series** — pattern, weekdays, range and skips, with a live preview
   table (`will be created` / `already exists` / holiday name), then
   `instantiate_session_series`.
3. **One-off** — a single dated instance of the blueprint (`instantiate_session`).
4. **Series panel** — extend, pause/resume, end (offering to cancel the
   instances still ahead).
5. **Instances panel** — provenance (`series run` / `one-off`, blueprint
   version), drift badge and **Re-apply**.

Demo mode (`VITE_DEMO=1`, or dev without Supabase credentials) renders a sample
blueprint so the whole flow is reviewable with no backend.

## Migration of existing data

`0013` is additive and idempotent. `mentis_weekly_schedules` gains
`template_id` / `recurrence_rule_id`, and every existing row is imported by
`template_from_weekly_schedule()` as blueprint + rule + series (carrying its
staffing rows across as blueprint slots and its `day_of_week` (0 = Sunday) to
ISO weekdays); the instances that carried only `schedule_id` are re-pointed at
the blueprint and stamped with their occurrence date and snapshot. New inserts
from the old Scheduling screen are still linked by the `sessions_link_blueprint`
BEFORE INSERT trigger, so nothing is orphaned while the two screens coexist —
the Sessions workbook keeps working exactly as it did, and the Blueprints page
now shows where those rows came from.

## Tests

- `tests/templates.test.ts` — 23 cases pinning the TypeScript mirror: weekly /
  fortnightly / monthly clamping and weekday search, rolling horizons, DST
  (18:00 London → 18:00Z winter, 17:00Z summer), preview classification counts
  that match the DB suite (10 generated / 3 term skips), staffing lead-in,
  open-slot filling, drift fields, completeness and series summaries.
- `supabase/tests/session_templates.sql` — 13 sections on a real Postgres (run
  by `tests/db.test.ts` on PGlite after every migration; the whole suite runs in
  one rolled-back transaction): the date maths on fixed dates (month clamp,
  fortnightly anchoring, quarter steps), the seeded UK calendar (13 candidates /
  3 term skips, 18:00 London as 18:00Z and 17:00Z), blueprint version bumps,
  publishing a series, DST-accurate instants, per-instance staffing with the
  lead-in and the default roster, idempotent re-publish, a one-off, extending
  around term breaks while reporting a booked venue slot as a conflict, drift +
  re-apply, the pause/resume/end lifecycle, the legacy import bridge and the RLS
  boundary (coach reads, admin writes).
- `apps/web/src/test/templates.test.tsx` — the console page against demo data:
  the rail and detail, provenance and drift on instances, the recurrence
  preview and its skip switches, the one-off dialog and the permission gate.
