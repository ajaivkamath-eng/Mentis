# Mentis — Development Prompt (v1.2 — FINAL)

> Generated 2026-09-14 from the matured brainstorm (`docs/brainstorm.md`
> v0.8). Round 8: **all suggested features in scope EXCEPT anything
> requiring Voice STT** (explicitly excluded by the owner).
> **Build scope: Phases 1–6** (Phases 1–5 = first delivery, Phase 6 =
> v1.1).
> Deliver a production-quality app for **Android, iOS and desktop web**.

---

## 1. Product overview

**Mentis** is a coaching-organization management app for
**Kingfisher Table Tennis Club** (UK). It runs the day-to-day of a
table-tennis coaching org that delivers sessions to clubs/venues:

- **Scale:** ~200 members · 2 venues · 10 coaches · 10 sparrers ·
  3 admins · 2 super admins. Users may hold **multiple roles**.
- **Sports:** table tennis first. The design must be **multi-sport**:
  nothing sport-specific is hard-coded — a `SportProfile` configures each
  sport's rank system, attributes, and feedback-rating templates.
- **Tandem with Rally:** Mentis reuses the auth system of an existing app
  called **Rally** (same Supabase project & user pool). Mentis keeps its
  **own role set**, separate from Rally's roles. Firebase is decommissioned
  — **Supabase Auth is the only login**.
- **The three promises the UX must keep:**
  1. A coach marks a 30-person attendance register in **under 60 seconds**,
     offline if needed.
  2. An admin runs the entire org (every entity) from the app — no backend
     entries ever.
  3. Money is auditable: planned vs actual hours → hourly-rate invoices that
     lock on approval; customer charges with retrieved/outstanding tracking.

---

## 2. Non-goals for v1 (do NOT build)

- Full customer/member self-service app (Phase 6). Members get only the
  **micro-flow** (event availability + competition diary; §6.4) and public
  pages (taster form, read-only diary).
- Plan/price-based member billing — only **staff hourly-rate invoicing** +
  customer charge tracking.
- TTE competition diary **scraper** — manual entry + CSV import now; the
  import layer must be source-agnostic so a scraper/API connector can be
  added later without rework.
- ITTF/WTT (or Sportradar) API auto-sync — rankings & matches captured
  manually/CSV with source tags now; connector-ready.
- QR self check-in at the register, per-user dashboard widget
  customization (backlog).
- **Voice STT/TTS — EXPLICITLY OUT OF SCOPE per owner (2026-09-14).** The
  stack remains compatible for a later add-on; do not build voice features.

---

## 3. Tech stack (fixed — do not substitute)

- **Mobile (Android + iOS):** Expo + React Native 0.81+ (React 19,
  TypeScript), NativeWind (Tailwind-consistent tokens), Lucide icons,
  Reanimated 3, Supabase JS client, OneSignal push, a robust local offline
  store + sync queue (dev picks: e.g. WatermelonDB/SQLite or equivalent —
  sync reliability is a hard requirement).
- **Web (desktop console):** React 19 + Vite + TypeScript + Tailwind CSS 4
  + Lucide + Recharts + Motion.
- **Shared TypeScript core package** (mobile + web + edge functions):
  entity types/enums (single source of truth), Supabase client wrappers,
  validation, formatters, report/billing logic, SportProfile config.
- **Backend: Supabase — same project as Rally** (shared user pool):
  - Postgres + **Row-Level Security** (RBAC enforced in the DB, not just UI)
  - Supabase Auth; Storage (private buckets: photos, documents, consents)
  - **Edge Functions (TypeScript):** email (Nodemailer, from
    `noreply@mentis.kingfishertabletennisclub.com`), public taster-form API,
    reminder & actions scheduler (pg_cron), webhooks
  - Realtime available (not required for v1 core flows)
- **Testing:** Vitest (unit/integration). Billing-lock and RLS matrix tests
  are mandatory (§10).
- **Infra:** GitHub Actions CI/CD; **staging + production** Supabase
  environments; EAS Build for mobile; Vercel for web.

---

## 4. Auth, roles & access

- Staff accounts are created **in Rally** (shared Supabase Auth); a Mentis
  Super Admin/Admin then assigns Mentis roles. **No standalone Mentis
  signup.** Mentis login = same credentials as Rally.
- **Mentis role set (separate table from Rally's roles):**

| Role | Count | Scope |
|---|---|---|
| **SUPER_ADMIN** | 2 | **God mode** — everything: org settings, user & role management, all venues, integrations, data export/erasure |
| **ADMIN** | 3 | Operations across **both** venues: venues, staff, customers/members, sessions, **weekly schedules / holiday calendar / overrides**, tasters, tasks (approve), events, rates, invoices (approve), reports. No system/user-role management |
| **COACH** | 10 | Their loop: today's sessions, attendance, PlayerFeedback, tasks (create), own availability, event planning & suggestions, own hours, **create draft invoices** (own/assigned items), billing dashboard, session staffing view |
| **SPARRER** | 10 | **Limited:** own profile; assigned sessions (**read-only register incl. ⚠️ medical alerts** — they're on the floor); own tasks; own availability; create manual actions |

- **Multi-role:** a user can hold multiple roles. The app shell has a
  **role switcher** — navigation, pages and permissions render for the
  **selected role**. Security floor: RLS enforces the **union** of the
  user's roles (the UI can never grant more than the selected role, and the
  DB never more than the user's roles).
- **RBAC enforcement:** Postgres RLS policies per entity, per command. The
  app hides what the selected role can't do; the database refuses the rest.
- **AuditLog:** mandatory trail on (a) any read/write of medical /
  special-need fields, (b) role changes, (c) task & invoice approvals,
  (d) debit creation/clearance.

### Access matrix (A = all CRUD/assign, M = manage scoped, V = view, S = self)

| Area | SUPER_ADMIN | ADMIN | COACH | SPARRER | Public |
|---|---|---|---|---|---|
| Org & system settings | A | – | – | – | – |
| Users & roles | A | – | – | – | – |
| Venues | A | A | V (own) | V (own) | – |
| Staff | A | A | S | S | – |
| Customers / Members | A | A | V (incl. ⚠️) | V register-only (own sessions, incl. ⚠️) | – |
| Sessions | A | A | V assigned + notes | V (own) | – |
| Attendance | A | A | A (own sessions) | – | – |
| Tasters | A | A | V (own register) | – | register via form |
| Tasks | A | A (approve) | A (create) · V own | create · V own | – |
| Groups | A | A | V (own) | V (own) | – |
| Events / matches / rankings / feedback | A | A | A | V (own) | – |
| Staffing plan | A | A | V assigned; flag unavailable | V (own) | – |
| Availability (record) | A (all) | A (all) | S + on others' behalf | S | – |
| Timesheet | A | A | S + view session staff hours | S | – |
| Hourly rates | A | A | – | – | – |
| Invoices: draft / approve | A / A | A / A | A (own) / – | – | – |
| Billed/unbilled views | A | A | V (own + breakdown) | – | – |
| Customer charges & debits | A | A | V (own) | – | – |
| Manager diary (colour-coded) | A | A | – | – | read-only page |
| Pending actions: view/close | A | A | S | S | – |
| Pending actions: create manual (on others) | A | A | A | A | – |
| Billing dashboard | A | A | V (own + org) | – | – |

---

## 5. Data model (Postgres — all tables RLS-protected)

```
Organization — single tenant today, multi-tenant-ready design
SportProfile — name, rankSystem {type, levels[]}, configurable attributes,
  group templates, session-type templates,
  feedbackAttributeTemplates (attribute → sub-attributes, 1–10 ratings).
  Seed (table tennis, Admin-editable):
    skill {forehand, backhand, serve, footwork, receiving}
    focus {concentration, composure under pressure}
    behaviour {discipline, sportsmanship, coachability, communication/team
               attitude}
    progression {improvement vs previous, consistency, response to
                 training, goal achievement}
Venue — name, address, phone, working hours, capacity, notes,
  concurrentSessionLimit (DEFAULT 1 — max simultaneous sessions here)
Staff — auth-linked user, roles[] (Mentis role set), profile, specialties
Customer — account holder/payer; contact; guardian A (father/mother/
  guardian); guardian B (optional); NOK (name/rel/phone); consent flags;
  isAlsoMember → 0..1 Member (adult case)
Member — child of Customer (1..N); DOB; sport(s) + level per sport; photo;
  emergency contact (NOK); specialNeedsFlag + specialNeeds/medicalNotes
  (ROLE-RESTRICTED + audited); validation: <18 → parentCustomer required
  AND NOK required
Prospect/Taster — name, age, contact, consent; approvedSession(s) by
  Admin; status: requested → approved → attended → converted/closed
Session — recurring schedule: venue, lead coach, assisting coaches,
  sparrers, weekday/time, duration, level band, capacity, status →
  generates SessionInstance (per date)
SessionSegment — sub-session/drill within a SessionInstance; name
  (e.g. "Drill 1 - FH to BH Drill"), order; ad-hoc or from templates
Enrollment — Member ↔ Session; status: invited / active / paused
  (reason, autoResumeDate?) / waitlisted (ordered) / completed;
  "expected" flag drives the pre-loaded register (paused excluded)
AttendanceRecord — per SessionInstance: member | taster; status: present /
  absent / late / taster; notes; recordedBy; recordedAt; offline flag
Group — venue-scoped cohort of Members and/or Staff (tasks, reminders,
  future billing cohorts)
Task — title, type: groupCoaching | oneOnOne (1-2-1) | onDuty | campaign |
  other; assignee (user OR group); pre-/post-dated; due date; priority;
  status; reminders; linkedTo (session/venue/member); recurrence?
  (admin-created, assigned to coach); chargeableToCustomer? + customerId;
  amount (FIXED price set at creation); approval: created (any staff/
  manager/admin) → approved by manager/admin (SEPARATE from invoice
  approval; unapproved tasks never invoice); workLog
RateCard — per staff (MULTIPLE per coach/sparrer): name/label,
  ratePerHour, notes, validFrom (history); SELECTED per session
  assignment → variable hourly rate per session
WeeklySchedule — recurring generator (admin): name, dayOfWeek,
  validFrom → validTo (from date → to date), venue, startTime, endTime,
  levelBand?, capacity?, leadCoach + rateCardId, assistingCoaches[] +
  rateCardId each, sparrers[] + rateCardId each; skips HolidayCalendar
  exceptions (term-holiday weeks, bank holidays) → generates
  SessionInstances
HolidayCalendar — org-level: name, kind: termHolidayWeek (date range) |
  bankHoliday (date) | manual (date range); UK bank-holiday seeds
  (admin-editable)
ScheduleOverride — range-based: scope (weeklyScheduleId | session),
  fromDateTime → toDateTime, overrides: venue? | times? |
  leadCoach?+rateCard? | assistingCoaches?+rateCards? |
  sparrers?+rateCards?; precedence over pattern; "overridden" badge +
  original values; audit-logged
MemberGoal — member, description (free text or structured: rank target,
  competition), type, targetDate, status: inProgress | achieved | missed
BookingSlot — (1-2-1, Phase 6): coach, venue, recurring slot (weekday/
  time/duration), fixedPrice, status
Booking — (Phase 6): member, slot, date/time, status: booked | approved |
  completed | cancelled (cancellationWindow, default 24h)
ProgressReport — (Phase 6): member, period (term), status: draft |
  approved | sent, pdfRef, approvedBy, sentAt
StaffTimeEntry — timesheet: staff, sessionInstance | task, date, startTime,
  endTime, hours; kind: planned (from schedule) | actual (recorded /
  backfilled) | standby (cancelled session);
  source: schedule | session-save | manual | backfill;
  billState: unbilled | billed (→ invoice);
  pendingReview (billable-INCREASE guardrail → admin approves)
Invoice — period-based; number, periodStart, periodEnd, createdById,
  addressedTo: STAFF (contractor) — Mentis pays each coach/sparrer; ONE
  invoice per staff per period; lineItems[] {staff, session|task, date,
  start, end, hours, rate, amount}; status: draft → pendingApproval →
  approved (LOCKED) → paid (paymentDate, method?, reference?);
  approvedById/At (manager/admin)
  LOCK RULE: approved items cannot be re-billed. An overlapping re-invoice
  shows "nothing billable" except NEW or backfilled items.
BillingLedger — itemRef (StaffTimeEntry | Task) → invoiceRef; status:
  unbilled | billed. Powers billed-vs-unbilled breakdowns by date, time,
  session or task for any range (staff & admin).
CustomerAccount — per customer: entries[] (charges, recoveries, debits),
  balanceDue
CustomerCharge — task, customer, amount; status: pendingApproval →
  approved → recovered (collected) | outstandingDebit (dueDate);
  manager/admin confirms collection at approval; if not collected →
  outstanding debit on customer account + admin PendingAction (dueDate)
StaffAvailability — per staff: date/period, available | unavailable
  (date + time captured), reason, recordedAt, recordedBy (self OR
  coach/admin on their behalf)
SessionStaffing — per SessionInstance: leadCoach, assistingCoaches[],
  sparrers[] (each with planned date/time/hours + selected rateCardId →
  rate for timesheet & invoice)
StaffingStatus — derived per SessionInstance: expected staffing vs
  declared availability → GREEN (expected staff available) | AMBER
  (under-numbered sparrers) | RED (under-numbered coaches); worst-wins;
  rolls up day→week→month→quarter; breach = assigned staff unavailable
Event — org-level (competition diary is COMMON ACROSS VENUES): name, sport,
  start/end dates, location, entryDeadline, source {tte | ittf_wtt | club |
  local | manual, externalRef/url}, status
EventEntry — Member ↔ Event: suggested(byCoach) / interested / available /
  confirmed / notAvailable / entered / completed; <18 → guardian
  confirmation required
SubEvent — optional part of an Event (e.g. "Men's U15 Singles"); holds
  match references (e.g. "Match 3: P1 vs P2")
Match — member match history: date, event? / subEvent? / session?
  (practice/inter-venue), opponent(s)/team, score per game, result,
  source {tte | ittf_wtt | club | local | manual}, sourceRef
Ranking — member ↔ platform, MULTIPLE PLATFORMS CONCURRENTLY: source
  {TTE national, ITTF/WTT world, club, local}, rank/value, asOfDate
  (keeps history), sourceRef
PlayerFeedback — coaching note/performance feedback (source MANDATORY):
  member, coach (author), text; sourceType: session | event;
  sessionInstanceId? (required if session) | eventId? (required if event);
  subSource?: SessionSegment | SubEvent/Match; ratings[] {attribute,
  subAttribute?, score 1–10 (1 lowest, 10 highest)} from
  SportProfile feedbackAttributeTemplates; performedWithStaff[];
  performedWithPlayers[]; tags
ActionType — seed + CUSTOM (admin-configurable in Mentis): name,
  description, trigger: event | activity | manual, defaultDueOffset
  (default P1M before session), defaultBreachOffset (default P1W before),
  allowedLinkTypes, customFields[]
PendingAction — actionType (seed | custom), title, assignee (any manager &
  staff can create manual actions on others), linkedEntity (ANY Mentis
  entity: session, task, venue, member, event, invoice, … — polymorphic),
  dueDate, breachWindow (configurable; all timelines configurable in
  Mentis), status: open → breached → closed, emailAlertOnBreach →
  recipients (manager, lead coach)
CommunicationLog — emails/push sent (template, recipient, ts; kind:
  invitation | reminder | alert | broadcast (groupId) | summary | report)
AuditLog — who/what/when (medical-field access, approvals, role changes)
```

**Relationship invariants:** Customer 1—N Member; Member N—M Session (via
Enrollment, across venues); Coach/Sparrer N—M Session; Taster→register
row on approval, one-tap conversion to Customer+Member; Group = label, not
hierarchy; PlayerFeedback always points at a SessionInstance (+optional
Segment) or Event (+optional SubEvent/Match); Event is org-level.

---

## 6. Core UX flows (screen-level)

### 6.1 Coach daily loop + attendance register (THE CROWN JEWEL)
1. **Today** tab: today's sessions (time, venue, expected count), pending
   tasks, reminders.
2. Tap session → **Register screen**. Non-negotiables:
   - List **pre-loaded from Expected/Invited enrollments** — coach marks,
     never types. Big touch targets; one-handed usable.
   - **Tap = cycle Present → Absent.**
   - Each row: member, level, **customer name + phone inline**, **⚠️ badge**
     if special needs/medical notes exist → tap expands alert panel:
     medical note, NOK name + phone with **tap-to-call**. (Access
     audit-logged.)
   - **Tasters** in a separate badged section (admin-approved, with
     "convert later" affordance).
   - Filters: All | ⚠️ | Tasters | Unmarked. Progress "21/24 marked".
   - **Mark all present** (small groups); undo last N actions before save.
   - **+ Add ad-hoc member** (not on expected list).
   - **Offline-first**: full register works with zero signal; queue +
     auto-sync; conflict = latest timestamp wins, with audit trail.
   - **Target: 30-person register marked in < 60 seconds.**
3. After save → summary (present/absent/tasters) → quick actions: record
   PlayerFeedback for the session (§6.5), post actual hours (§6.7).

### 6.2 Taster journey (public + admin + coach)
1. **Public web form** (PWA, no login): name, age, contact, preferred
   session. QR codes printed at venues + link in emails. Admin manual
   entry as fallback.
2. Admin approves & assigns the session/instance → email/push to prospect.
3. Coach sees the taster in the register (badged section).
4. One-tap **convert** → Customer + Member (prefilled) or close.

### 6.3 Tasks & reminders
- Task: any staff/manager/admin creates; typed (group coaching, 1-2-1,
  on duty, campaign, …); assignee = user or group; pre-/post-dated;
  reminders (configurable, e.g. D-1/H-2) via push + email; status
  todo → in-progress → done; work logging (hours, notes).
- **Recurring tasks:** admin creates, assigns to a coach.
- **Approval:** manager/admin approval is REQUIRED before a task is
  billable — separate from invoice approval. Unapproved tasks never appear
  in an invoice.
- **Chargeable to customer:** flag + customer tag → visible on the
  customer page (admin/manager & staff views).

### 6.4 Events & competition (org-wide; diary common across venues)
- **Competition diary:** org-level calendar; sources: manual entry +
  **CSV import** (TTE diary etc.) with source tag + reference URL.
  Source-agnostic connector design (scraper/API later — backlog).
- **Event planning:** coach views upcoming events → member availability per
  event → **suggests an event** to a member (notification; guardian
  confirms for <18).
- **Member micro-flow (PWA, no full login):** QR code / emailed link +
  member code → toggle availability for upcoming events (available /
  not available) + browse the competition diary.
- **Matches:** in-app entry (opponent, per-game scores, result,
  event/sub-event or session context, source tag) + CSV import for
  history.
- **Rankings:** manual/CSV per member per platform (TTE / ITTF–WTT / club /
  local), concurrent, each with as-of date → history.
- **Public read-only diary page** (shareable link, no login).

### 6.5 PlayerFeedback (coaching notes — context-aware)
- Launched from within a session/event screen, or via the **current-context
  finder**: defaults to today + nearest venue (date/time + GPS) → pick
  session/sub-session or event/sub-event in one tap.
- Entry: member, free-text feedback, **1–10 ratings** (1 lowest, 10
  highest) across attribute templates (skill / focus / behaviour /
  progression — slider/stepper UX), **performedWithStaff[]** (which staff
  they performed well with), **performedWithPlayers[]** (partners/opponents),
  optional tags.
- Source is **mandatory** with sub-context, e.g. "Session: Tuesday 4PM
  24-Mar-2026, Sub Session: Drill 1 - FH to BH Drill" or "Event: London
  Open, Sub Event: Match 3 P1 vs P2".
- Aggregates into the **player development timeline** in Member 360
  (ratings over time per attribute, per source).

### 6.6 Staffing, availability & breach
- **Staffing plan:** admin/manager assigns per session: lead coach +
  assisting coaches + sparrers, each with planned date/time/hours.
- **Availability:** staff marks available/unavailable with **date + time**
  (self, or coach/admin updates on their behalf).
- **Breach detection:** assigned staff declared unavailable →
  **StaffingStatus**: GREEN = expected staff available · AMBER =
  under-numbered **sparrers** · RED = under-numbered **coaches** (any
  missing coach = RED, any missing sparrer = AMBER, worst-wins).
- **Manager/admin diary:** quarter/month/week/**day** views of all
  sessions, colour-coded by StaffingStatus; the colour **rolls up**
  (worst-wins) day→week→month→quarter, so a breached session tints its
  day cell, that week's row, that month, that quarter.
- **On breach:** auto **PendingAction** on lead coach + manager ("name
  replacement staff"); **email alert** to both when the action breaches its
  timeline (defaults: created ~1 month before the session, **breaches 1
  week before** until closed — ALL such timelines configurable in Mentis).
- **Session detail view (staff):** own hours AND other staff's hours on the
  session, with date, start & end times.

### 6.7 Timesheet, rates & invoicing
- **Planned coverage** from the staffing plan; **actual coverage**:
  planned hours **auto-posted** when the session completes (each staffed
  member gets their planned hours); staff adjusts actual start/end; admin
  backfills missing staff details.
- **Rates:** hourly rate **per staff per session** (may differ per
  session; copyable; rate history).
- **Billed/unbilled view:** any date/time range → items broken down by
  **date, time, session or task** — what is billed vs not (staff & admin).
- **Invoice:** any staff or admin picks **start → end date/time** → the
  app lists unbilled items with rates applied → **draft** →
  **manager/admin approval** → **LOCKED**. One invoice **per staff per
  period** (Mentis pays each coach/sparrer). Overlapping re-invoice shows
  "nothing billable" except NEW or backfilled items.
- **Billing dashboard** (admin & staff): invoiced amount by timeline ·
  outstanding (past-dated invoiceable items) · forecast (schedule-based).

### 6.8 Customer charges & debt
- Chargeable task approved (§6.3) → **CustomerCharge** on the tagged
  customer: manager/admin confirms the **amount was retrieved** from the
  customer → `recovered`; if not → **outstanding debit** on the customer
  account with a due date + **admin PendingAction** to clear it.
- Customer page: charge history, debits, **balanceDue**, pending actions.

### 6.9 Actions engine
- **ActionTypes:** seeds — *name replacement staff · confirm staffing ·
  clear outstanding debit · backfill missing staff details · review
  unbilled items* — plus **CUSTOM action types configurable in Mentis**
  (admin defines name, trigger, defaults, allowed links, custom fields).
- **Triggers:** by **event** (e.g. staffing breach, debit creation), by
  **activity** (e.g. time entry logged, task approved), or **manual**
  (any manager & staff can create a manual action on others).
- Every action: assignee, **linkedEntity = ANY Mentis entity** (session,
  task, venue, member, event, invoice, …), due date, breach window
  (configurable), status open → breached → closed, email alert on breach
  to configured recipients.

### 6.10 Reporting (Phase 1 core; dashboards)
- **Members per venue** (with sessions, groups, contact) — CSV export.
- **Member 360:** all sessions across venues, attendance %, customer &
  NOK, medical ⚠️ (role-gated), rankings (all platforms), match history,
  feedback development timeline, charge history/debts.
- **Coaches & hours:** per coach per period — session hours (planned vs
  actual), work log, total — CSV export.
- **Dashboards:** role-appropriate defaults (admin: org health, taster
  requests, breaches, debits; coach: today, own hours, own invoices;
  sparrer: own schedule).
- Taster funnel: registered → tried → converted.

### 6.11 Weekly scheduling, holidays & overrides (admin)
- **Holiday calendar:** org-level — term-holiday weeks (date ranges),
  bank holidays (dates; UK seeds, admin-editable), manual no-session
  ranges.
- **Weekly schedule:** admin creates with **from date → to date**,
  day-of-week, venue, start & end time, lead coach, assistant coach,
  optional sparrers — each with their **selected rate card** (staff can
  hold multiple cards → variable hourly rate per session) → generates
  SessionInstances for every matching day in the range, **skipping
  holiday weeks & bank holidays**.
- **Override:** from a selected date/time → to a selected date/time, any
  attribute overridable (venue, times, lead, assistants, sparrers, rate
  cards). Affected instances show an "overridden" badge + original
  values; audit-logged.
- **Conflict prevention (enforced at generation / creation / override):**
  - **Venue:** no two (or more) sessions at the same venue with the same
    or overlapping times — `concurrentSessionLimit` default **1**
    (configurable per venue).
  - **Staff:** the same coach/sparrer (in any capacity) cannot have
    overlapping session hours; **back-to-back is allowed** (one ends
    exactly when the next starts).
  - Violations are **blocked at save** with a message listing the
    conflicting sessions.

### 6.12 Session lifecycle: cancellation & postponement (admin / lead coach)
- **Cancel:** reason required (illness, venue, weather, other) →
  auto-notify expected members' customers (email template + push) and
  assigned staff (push); assigned staff's time entries auto-posted as
  **standby** (planned hours, flagged) — admin can zero them or keep them
  before invoicing; standby lines are tagged on the invoice.
- **Postpone:** pick new date/time (validated against the holiday calendar
  + conflict rules 16–18) → instance regenerated, everyone re-notified.

### 6.13 Communication
- **Group broadcast:** template-based email + push to a Group (templates:
  cancellation, half-term, event reminder, custom body); recipients = the
  group's members' customer contacts; preview; immediate or scheduled
  send; logged in CommunicationLog (kind: broadcast, groupId).
- **Monthly attendance summary (pg_cron, 1st of month):** per member →
  email the customer: last month's attended/absent %, absent sessions,
  upcoming sessions, outstanding debit if any; paused members skipped;
  templates editable.

### 6.14 Operations
- **Global search:** one box across members, customers, sessions/
  instances, tasks, events, staff (name/ID) — RLS-respecting.
- **Admin Inbox:** pending-actions queue with filters (breached /
  unassigned / mine / this week), one-tap open/complete; badge on home.
- **GDPR toolkit:** member/customer record export (full single-member
  record: profile, consents, attendance, feedback summary, rankings,
  matches, debits — PDF/CSV; Super Admin/Admin); audit-log viewer (actor,
  action, entity, field, period); consent expiry flags (issuedAt/
  validUntil → dashboard warnings); erasure flow (anonymise personal data,
  retain aggregated financial records for UK tax retention, audit-logged).
- **App lock:** mobile biometric/PIN lock (auto-lock, default 5 min);
  per-device session revocation from admin screens (lost device).
- **ICS export:** per-staff and per-venue `.ics` of upcoming sessions
  (default 8 weeks), manual, re-generated on demand.

### 6.15 Member lifecycle
- **Profile extensions:** TTE registration number (optional, validated,
  searchable), handedness (L/R), playing style (SportProfile options +
  custom), equipment notes.
- **Enrolment pause:** active → paused (reason, optional auto-resume date)
  → excluded from expected list; "paused" filter in the register; pause
  period visible in billing reports.
- **Waitlist:** per-session ordered waitlist when at capacity; a slot
  frees (pause/leave/cancel) → admin prompted to promote or auto-notify
  the next in line; promotion → invited enrolment.
- **Taster conversion pack:** on conversion, auto-send welcome email (what
  happens next, first session, how to reach the coach) + equipment guide
  (SportProfile content: racket, shoes, TTE registration steps) + optional
  admin note.

### 6.16 Competition & development extensions
- **Event squad picker:** per event/sub-event: select the entering squad;
  auto-suggest eligible members (DOB age band + rank band); squad members'
  EventEntry → entered; conflicts with other events flagged.
- **Player goals:** member goals (free text or structured: rank target,
  competition), target date, status in-progress/achieved/missed; shown in
  Member 360 + coach dashboards ("goals to review").
- **Rank movement:** derived from consecutive Ranking snapshots per
  platform: ▲/▼/– on current rank + history sparkline.
- **Feedback preset chips:** SportProfile-defined preset phrases
  (admin-editable); one-tap append to feedback text; "repeat last note for
  this member"; presets may carry suggested ratings.

### 6.17 Billing & staffing extensions
- **Invoice payment status:** approved → **paid** (payment date,
  method/reference); unpaid approved invoices visible on dashboard
  outstanding.
- **Timesheet guardrail:** staff may adjust actuals; any adjustment that
  **increases** billable hours → entry goes pending-review → admin
  approves → billable; decreases apply immediately; all audited.
- **Substitute quick-pick:** in the breach action / staffing screen, list
  candidates (role-fit, available at that date/time, conflict-free,
  venue-matched); one-tap assign (with rate-card selection) → breach
  clears when all expected staff are covered.

### 6.18 v1.1 differentiators (Phase 6)
- **1-2-1 booking:** admin defines a coach's bookable 1-2-1 slots (venue,
  weekday/time/duration, fixed price); public PWA (member-code auth, same
  as the micro-flow) lists open slots → member books → creates a Task
  (type oneOnOne, pre-dated, chargeable, customer-tagged) →
  manager/admin approval (rule 5) → timesheet + CustomerCharge (recovered
  when payment lands; outstanding debit until then); conflict-checked
  (rule 18); cancellation window (default 24h, configurable).
- **Termly progress report:** per member per term: attendance %, rating
  trends per attribute, rank movement, match results, goals status →
  parent-ready letter (template-driven; optional AI-drafted text) → coach
  reviews/edits → PDF → email; logged in CommunicationLog.
- **Match analytics:** per member: W/L overall + by event type,
  head-to-head, recent form (last 5) — in Member 360 + coach views.
- **Coach performance dashboard:** per coach per period: hours (planned
  vs actual), sessions led, average attendance, feedback volume, taster
  conversion; admin view + own view.
- **Sparring-partner matcher:** for a member, suggest practice partners
  from their cohort: rank band (±1), handedness preference, style
  complement, age; "suggest pair" on the session sheet.
- **Auto event suggestions:** rules engine (LLM later): per upcoming event,
  compute eligible/suggested members (age band from DOB, rank band, event
  level) → coach confirms → EventEntry "suggested" → notify
  member/guardian.

---

## 7. Business rules (must hold — make them tests)

1. **Under-18 rule:** a Member <18 requires a partner/guardian Customer
   AND NOK. Validation blocks save otherwise.
2. **Multi-sport:** all sport-specific concepts (levels, feedback
   attributes, group/session templates) resolve through `SportProfile`;
   adding a sport = config, not code.
3. **Medical data:** special needs/medical notes visible only to
   SUPER_ADMIN, ADMIN, and assigned COACH/SPARRER (register context);
   every access audit-logged.
4. **Register integrity:** expected list derives from enrollments;
   offline entries sync without loss; conflicts resolved by latest
   timestamp + audit.
5. **Task approval separation:** a task is billable only after
   manager/admin approval of the TASK. Invoice approval is a separate
   approval. Unapproved tasks never appear in any invoice.
6. **Billing lock:** approved invoice items are permanently billed.
   Re-invoicing an overlapping period lists only NEW items (created after
   approval) and backfilled items (staff details added later). "Nothing
   billable" must be shown truthfully.
7. **One invoice per staff per period** (contractor payment).
8. **Customer charge outcome:** approved customer charge is either
   recovered or becomes an outstanding debit with due date + admin action.
   Never silently dropped.
9. **Breach & colour logic:** any expected coach missing/unavailable =
   RED; any expected sparrer missing = AMBER; all expected staff available
   = GREEN; worst-wins; roll-up across periods uses worst-wins.
10. **Action timelines** (due offsets, breach offsets, alert recipients)
    are configurable per ActionType; defaults: due P1M before session,
    breach P1W before, alerts to manager + lead coach.
11. **Availability is time-stamped** (date + time) and can be recorded by
    the staff member or by a coach/admin on their behalf (who/when
    recorded is stored).
12. **Taster flow:** a taster appears in a register only after admin
    approval & assignment; conversion creates Customer + Member (one tap,
    prefilled).
13. **PlayerFeedback source mandatory** (session instance or event;
    sub-source optional but recommended) — no orphan notes.
14. **Competition diary is org-level** (shared across venues), not
    venue-scoped.
15. **Role switcher:** permissions render for the selected role; RLS
    floor = union of the user's roles; switching role mid-flow is safe.
16. **Holiday exceptions:** weekly-schedule generation skips days falling
    in a term-holiday week or on a bank holiday (or manual no-session
    range) within validFrom→validTo; the calendar shows no sessions then.
17. **Venue concurrency:** simultaneous sessions per venue must not
    exceed `concurrentSessionLimit` (default 1); overlaps beyond the
    limit are blocked.
18. **Staff overlap:** a staff member (lead/assistant/sparrer, any
    capacity) may not have overlapping session hours; back-to-back
    (end == next start) is allowed.
19. **Override precedence:** a ScheduleOverride supersedes the weekly-
    schedule pattern for the affected range; instances show the
    overridden values with the originals still visible; overrides are
    audit-logged.
20. **Rate cards:** the billed rate = the staff member's rate card
    selected on the session assignment (staff may hold multiple cards);
    timesheets & invoices use that card's rate (history via validFrom).
21. **Cancellation:** reason mandatory; expected customers + assigned
    staff auto-notified; staff hours auto-posted as **standby** (admin
    may zero before invoicing); standby lines tagged on the invoice.
22. **Postponement:** the new slot must pass holiday (rule 16) and
    conflict (rules 17–18) validation; everyone re-notified.
23. **Invoice lifecycle:** draft → approved (locked) → paid; payment
    date/reference stored; unpaid approved invoices appear on the
    dashboard outstanding.
24. **Timesheet guardrail:** billable-hour **increases** require admin
    review; decreases apply immediately; every change audited.
25. **Search & inbox:** results and queues respect RLS (no cross-role
    leakage via search or the inbox).
26. **GDPR:** EU data residency; full record export on request; erasure
    anonymises personal data while retaining aggregated financial records;
    consent expiries surface warnings (no silent expiry).
27. **App lock:** mobile requires biometric/PIN (auto-lock); any device
    session can be revoked by admin.
28. **Pause & waitlist:** paused enrolments are excluded from the
    expected list; waitlist promotion is admin-triggered (with optional
    auto-notify of the next in line) — never silent auto-promotion.
29. **Squad eligibility:** suggestions computed from DOB age band + rank
    band; coach/admin confirms — the engine never auto-enters a player.
30. **1-2-1 booking:** conflict-checked (rule 18) at booking time; fixed
    price at booking; separate task approval (rule 5) still applies;
    cancellation window configurable (default 24h).
31. **Progress report:** coach must approve before sending; PDF + send
    log retained (CommunicationLog).

---

## 8. Non-functional requirements

- **Offline-first mobile:** attendance, session views, feedback, own
  availability, tasks (own) work with zero connectivity; sync queue with
  retry, dedupe, and conflict rule (§7.4). Web console is online.
- **Performance:** register screen < 2 s to interactive; app cold start
  < 3 s; a 30-person register markable in < 60 s; list screens virtualized
  (200 members / 2 venues scale, but design for 10×).
- **Privacy (UK GDPR, minors' data):** consent captured at registration
  (including medical-information consent) with expiry tracking; role-
  restricted medical notes with audit trail; right-to-erasure + full
  record export per customer/member; private storage buckets; **EU data
  residency** (Supabase EU region — UK children's data stays in-region).
- **Mobile security:** app lock (biometric/PIN, auto-lock) mandatory;
  per-device session revocation (lost phone).
- **Accessibility:** large-text register mode, high-contrast theme,
  touch targets ≥ 44 pt, screen-reader labels.
- **i18n-ready**, English only for v1.
- **Security:** RLS on every table; no `USING (true)` except the
  intentionally-public taster form read path; service role only in
  Edge Functions; secret rotation; OWASP ASVS L2 target.
- **Observability:** structured logging, error tracking (Sentry or
  equivalent), audit log queries in admin UI.
- **Environments:** staging + production (Supabase, Vercel, EAS profiles).

---

## 9. Delivery plan — first delivery = Phases 1–5

- **Phase 1 — Foundation:** Supabase auth (shared w/ Rally) + Mentis roles
  (multi-role + role switcher) + RLS for all tables; entity CRUD for
  venues, staff, customers, members, sessions (+ segments), enrollments,
  SportProfile (table-tennis seed); **weekly scheduling**: holiday
  calendar (term-holiday weeks, UK bank-holiday seeds, manual ranges),
  weekly-schedule generator (from→to date, day-of-week, venue, times,
  lead/assistant/sparrers + rate cards, skips holidays), range-based
  **schedule overrides** (any attribute, badge + originals), **conflict
  validation** (venue concurrency default 1, staff no-overlap, back-to-
  back OK); web admin console; role-based dashboards (defaults);
  **CSV import wizard** (members/customers/sessions) + **core reports &
  CSV export** (members per venue, member→sessions, coaches & hours);
  **Round-8 additions:** global search + admin inbox, GDPR toolkit
  (record export, audit viewer, consent expiry, erasure flow), app lock,
  ICS export, member profile extensions (TTE reg no, handedness, style).
- **Phase 2 — Coach loop (core value):** attendance register UX
  (offline-first, ⚠️ alerts, tasters section, mark-all/undo), taster flow
  (public form + QR + approval + register + convert), invitations &
  reminders (email + OneSignal); **Round-8 additions:** session
  cancellation/postponement workflow (notifications + standby hours),
  enrolment pause + waitlist, taster conversion pack.
- **Phase 3 — Coordination:** tasks (+ types, recurring, reminders,
  approval), groups, staff availability (date+time), work log / coaching
  hours; **Round-8 additions:** group broadcast (templated, scheduled).
- **Phase 4 — Competition & feedback:** competition diary (manual + CSV,
  source refs), **member micro-flow PWA** (availability + diary), coach
  event suggestions, matches (multi-source, sub-events), rankings
  (multi-platform + history), **PlayerFeedback system** (sub-sessions /
  sub-events, 1–10 attribute ratings, performed-with staff/players,
  GPS/date-time context finder), development timeline in Member 360,
  public read-only diary page; **Round-8 additions:** monthly attendance
  summary email, event squad picker, player goals + rank movement,
  feedback preset chips.
- **Phase 5 — Staffing & billing:** session staffing plan (lead/assist/
  sparrers + planned hours), availability-driven **breach detection** +
  colour-coded **manager diary** (day/week/month/quarter, roll-up),
  **timesheet** (planned vs actual, auto-post, backfill), **hourly rates**
  per staff per session, **period-based invoicing** (draft → approve →
  locked; one per staff per period; re-invoice safe), **billed/unbilled
  range breakdowns**, **billing dashboard** (invoiced/outstanding/
  forecast), **customer charges & debits** (approval, retrieved vs
  outstanding, customer account, admin actions), **actions engine**
  (seeds + custom configurable types, event/activity/manual triggers,
  link-to-any-entity, configurable breach timelines, email alerts);
  **Round-8 additions:** invoice payment status, timesheet guardrail,
  substitute quick-pick.
- **Phase 6 — Differentiators & self-service (v1.1):** 1-2-1 booking
  PWA (slots, fixed price, approval-gated), termly progress report
  (template-driven, optional AI-drafted), match analytics (W/L, head-
  to-head, form), coach performance dashboard, sparring-partner matcher,
  auto event suggestions (rules engine; LLM later), customer/member
  self-service app, advanced dashboards & trends, per-user dashboard
  customization.

**Build scope: Phases 1–6** (Phases 1–5 = first delivery; Phase 6 =
v1.1). **Excluded (owner, Round 8):** Voice STT/TTS — stack remains
compatible for a later add-on. **Design constraint (no build):** stay
multi-tenant-ready (org-scoped RLS) for a possible future SaaS path.

**Backlog (future):** TTE diary scraper; ITTF/WTT/Sportradar API
connectors (rankings + results auto-sync); QR self check-in; Stripe
payments for in-app collection.

---

## 10. Definition of done (quality bar)

- **RLS matrix tests:** every entity × role × command (select/insert/
  update/delete) verified — including role-switcher scenarios and
  sparrer register-only medical visibility.
- **Billing integrity tests:** billing-lock rule (Day 1–10 scenario:
  re-invoice shows nothing billable; new task + backfilled staff both
  re-invoiceable), one-invoice-per-staff-per-period, rate history,
  billed/unbilled range accuracy to the minute.
- **Offline tests:** register captured fully offline → sync → conflict
  (latest timestamp + audit); no data loss on kill/drop.
- **Breach tests:** availability change → colour on day/week/month/
  quarter cells, action creation, breach email at P1W, close stops alerts.
- **Scheduling & conflict tests:** term-holiday week / bank-holiday days
  skipped in weekly generation; venue overlap blocked at the concurrency
  limit (default 1); staff overlap blocked (any capacity); back-to-back
  sessions (end == start) allowed; override precedence with badge +
  audit; selected rate card's rate flows into timesheet & invoice.
- **Round-8 tests:** cancellation → notifications sent + standby hours
  posted + invoice tag; postponement re-validated against conflicts;
  timesheet increase blocked pending admin review (decrease immediate);
  unpaid approved invoice visible on dashboard outstanding; waitlist
  promotion flow (no silent auto-promotion); ICS file valid & parseable;
  global search results respect RLS; GDPR export contains all sections;
  erasure retains financial records only; 1-2-1 booking conflict-checked
  + approval-gated + cancellation window; rank movement derived
  correctly across snapshots; squad suggestion eligibility (age band +
  rank band).
- **Under-18 validation**, taster approval gate, feedback source
  mandatory — all covered by tests.
- **Seed data** for staging: Kingfisher TTC (2 venues), table-tennis
  SportProfile (feedback tree, session templates), demo users for all four
  roles (incl. a multi-role user), sample members (incl. <18 with
  partner+NOK, one with ⚠️ medical notes), sample sessions/tasters/
  events/rankings, sample action types.
- **CSV import wizard** with sample import files + error reporting.
- Staging deployment demonstrable end-to-end on web + both mobile
  platforms.

---

## 11. Branding & communications

- Product name: **Mentis**
- Email: transactional mail from
  `noreply@mentis.kingfishertabletennisclub.com` (Nodemailer via Edge
  Function; templates: session invite, taster approval, task reminder,
  breach alert, debit notice, action alert).
- Visual: modern **dark + light** theme, simple custom logo, consistent
  design tokens across mobile and web (one shared token source).
- Diary colours: 🟢 green = staffed · 🟡 amber = sparrers short ·
  🔴 red = coaches short (consistent across all period views).
