# Coach diary & availability — calendar-first redesign

> Status: shipped (web console, `/availability`). The old screen was a form
> with separate **From / To** date fields; the calendar is now the primary
> interaction surface, in the spirit of Outlook Calendar / Microsoft Shifts /
> Viva Insights.

## Layout (§14)

```
┌ Toolbar ───────────────────────────────────────────────────────────────┐
│ [Coach selector ▾] [Day|Week|Month|Agenda|Staff] [◀ Today ▶] [📅 range] │
│                 Copy Cut Paste │ Undo Redo │ Filters Settings [Entry|Planner] [New] │
├ Main calendar ─────────────────────────────┬ Right panel ─────────────┤
│ conflict strip (upcoming, with actions)    │ create/edit entry        │
│ time grid: axis + day columns (+ lanes)    │ or Regular Availability  │
│ current-time line · all-day row            │ Planner                  │
├ Legend: kinds · conflict · chargeable ─────┴──────────────────────────┤
```

Interactions: drag empty grid → create (quick popover); drag event body →
move (across days **and** coach lanes); drag top/bottom edge → resize; click →
details popover; double-click → edit; Ctrl-click → multi-select; Ctrl+C/X/V,
Del, Ctrl+Z/Y, T/D/W/M/A/R/N keyboard shortcuts (`Shortcuts` button lists them).

Views: day, week (default), month (drag chips between days), agenda, and an
admin-only **resource timeline** (coaches as rows × days as columns).

## Event kinds (§2)

`packages/core/src/diary.ts` is the single source of truth (`DIARY_KINDS`);
`apps/web/src/lib/diary/model.ts` maps kinds → tokens/icons:

| Bucket | Kinds | Visual |
|---|---|---|
| Availability | `available` | teal soft fill + solid bar |
| Regular | `working_hours` (planner-generated) | blue soft fill, dashed bar |
| Unavailable | `holiday`, `sick_leave`, `personal_appointment`, `out_of_office`, `unavailable_other`, `other` | diagonal stripes + icon |
| Duty | `on_duty`, `club_duty`, `duty_outside_club`, `working_elsewhere`, `training` | indigo/violet/pink/cyan per kind |
| Bookings | `session` (coloured by coach role: lead/assistant/spare), `task` | solid fill + lock icon |

Every event shows title, time, coach (in compare views), venue, role, notes,
**source** (Personal diary / Session booking / Task / Admin / Booking /
Regular availability), chargeable badge (rate card + £/h) and whether it is
editable. System-generated bookings are read-only in the diary and link to
their session/task.

Colour is never the only signal: stripes for blocking time, icons per kind,
lock for system events, explicit badges for conflict/chargeable (§13 a11y).

## Data model (§15)

- `mentis_staff_availability` — personal diary entries. 0012 adds `title`,
  `source_type`, `source_id`, `rule_id`, `occurrence_date`, `exception_status`,
  `conflict_status`, `visibility`, `created_by/at`, `updated_by/at`. The enum
  `staff_availability_type` gained `sick_leave`, `working_elsewhere`,
  `personal_appointment`, `training`, `club_duty`, `out_of_office`,
  `working_hours`, `other`.
- `mentis_availability_rules` — the Regular Availability Planner: one row per
  saved pattern (`pattern` jsonb of weekday windows, `effective_from/to`,
  scope `one_month | indefinite | custom`), guarded by
  `guard_availability_pattern()` and audit-logged.
- `mentis_diary_conflicts` — durable conflict records (availability ×
  session/task allocation, `overlap_minutes`, human `message`,
  `open → acknowledged → resolved`), unique per (availability, assignment)
  while unresolved.
- Sessions/tasks enter the diary through `mentis_session_staffing` (partial
  allocations supported: each row renders as its own segment with role, times
  and rate card) and `mentis_tasks` (`due_at − work_hours` as the window).
- Audit: `audit_write` triggers on diary entries and planner rules
  (`diary.entry`, `diary.rule`).

## Recurrence & exceptions (§6)

Planner patterns are **expanded on load** (`expandAvailabilityPattern` — same
pure function powers the planner preview, so preview = what you get).
Generated occurrences are virtual (`id = gen:<rule>:<date>:<HH:MM>`):

- **Edit one occurrence** → an exception row is written
  (`source_type='planner'`, `rule_id`, `occurrence_date`,
  `exception_status='exception'`); the pattern itself is never mutated.
- **Delete one occurrence** → a suppression marker row (private, 1-minute).
- **Overridden display**: when a blocking entry (holiday, sick…) fully covers
  a regular block, the regular block renders dimmed + struck-through with an
  “overridden” ribbon; the blocking entry is primary. The rule is preserved.

## Conflicts (§9, §12)

- DB trigger `scan_availability_conflicts` fires when a coach marks themselves
  unavailable: future session assignments that overlap create a
  `mentis_diary_conflicts` row (message mirrors the UI wording exactly —
  “*… is unavailable from 16:00 to 18:00 because of Holiday / annual leave.
  … overlaps this period by 60 minutes.*”), flag both sides, and raise a
  pending action. Restoring availability auto-resolves.
- The editor previews conflicts **before** saving and requires an explicit
  “keep anyway” confirmation; the session diary stays red until resolved.
- The daily `diary-conflicts` edge function (cron hook in 0012, `where false`
  like its siblings) emails coach + responsible coach from T-30 days, urgent
  from T-7. Acknowledge/resolve is available in the conflict strip.

## Chargeable time (§11)

`guard_chargeable_time_entry()` (trigger on `mentis_staff_time_entries`)
validates: staff belongs to the org, the window falls inside an actual
assignment, the rate comes from a rate card valid on the event date, and the
same window is not invoiced twice (`invoice_lines.time_entry_id` stays unique
+ an overlap guard for billed entries). Diary events carry `chargeable`,
`rateLabel` and `rateCents`; the `validateChargeable` pure function in core
mirrors the trigger for client-side messaging (pinned by `tests/diary.test.ts`).

## Demo / design-review mode

`apps/web/src/lib/diary/demo.ts` seeds a living week (sessions with split
allocations, tasks, two planner patterns, holiday + sick conflicts, rate
cards) relative to *today*. The store exposes the same ops as the live
Supabase adapter (`useDiaryData`), including undo/redo — so the whole
experience is reviewable with no backend.
