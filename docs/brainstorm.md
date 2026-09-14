# Mentis — Brainstorm & Design Doc (living)

> Status: **v0.8 — PROMPT FINAL (v1.2) ✅** — all suggested features in
> scope except Voice STT (owner decision, Round 8).
> This document accumulates decisions until we both agree the idea is mature
> enough to generate the development prompt (which will live in
> `docs/development-prompt.md` once approved).
>
> Convention: ✅ = agreed, 🟡 = proposed (awaiting decision), ❓ = open question,
> each open question has my recommendation.

---

## 1. Vision

Mentis is a **coaching-organization management app** (Android + iOS + desktop web)
for an organization that delivers coaching services to **clubs/venues**.
It covers the day-to-day operating loop:

1. **Plan** — sessions at venues, coaches & sparrers assigned, groups/cohorts defined.
2. **Capture** — per-session attendance register (members, sparrers, tasters) with
   minimal coach handling time, including expected/invited members and
   special-need/medical alerts.
3. **Grow** — taster (prospect) invitations, public taster registration,
   admin approval of which session a taster tries, conversion to member.
4. **Coordinate** — tasks with reminders (to individuals or venue-scoped groups),
   availability, work recording.
5. **Report** — members per venue, member→sessions (for billing reports),
   coach hours, dashboards.
6. **Compete** — competition diary (org-wide, common across venues;
   sources incl. Table Tennis England), member availability per event,
   coach event-suggestions, match history & results (multi-source),
   concurrent multi-platform rankings per member (national/international/
   local), and PlayerFeedback always linked to a source (session or event).
7. **Staff & bill** — per-venue session staffing (lead coach, assisting
   coaches, sparrers) with availability & breach detection, planned vs.
   actual timesheets, hourly-rate invoicing (locked once approved),
   customer charges & outstanding debits.

Billing: **in scope from Round 5** — hourly-rate staff invoicing + customer
charges (supersedes the earlier "billing outside the app" note).

Auth: reuse the login/access system of an existing app called **Rally**,
which uses **Supabase** as its auth backend.

---

## 2. Confirmed concepts (from owner, restated)

- The org delivers coaching services to clubs/venues (venues are not necessarily
  the same as "clubs" — treated as the same entity: a location that hosts sessions).
- **Customer = account holder/payer**. A customer has **0..N members** (children).
  In some cases the customer *is also* a member (adult training for themselves).
  A customer record can hold **both parents/guardians** (father & mother or
  guardian details) plus **NOK (Nearest of Kin)**.
- **Member under 18 → the customer MUST be a partner/guardian** (enforced) and
  NOK is captured.
- Member attendance register shows **customer name + contact** (so a coach can
  reach the paying/guardian party instantly).
- Members with **special needs / medical notes** show an **alert (⚠️) sign** in the
  register so the coach knows extra attention is required.
- **Taster** = prospect trying a session. Admin chooses which session(s) the taster
  can try and **approves**; approved tasters appear in the coach's attendance
  register for that session. Public "register for taster" capability (web).
- **Session** captures: members expected/invited, coaches, sparrers, and the
  attendance register per session.
- **Coach handling time is the #1 UX metric** for attendance capture
  ("attendance register should have its own dedicated UX").
- **Groups** = collections of coaches and/or customers-with-members, scoped to a
  venue. Tasks & reminders can target a person or a group.
- **Tasks**: create with reminders → assign to individual or group; record work;
  create invoice reference for the task (billing done externally).
- **Reports**: all members per venue; a member can be in multiple sessions and
  multiple venues → member-wise "which sessions" view for billing; all coaches
  with recorded coaching hours.
- Full app-level CRUD + access management for **every** entity (no backend entries
  ever needed by the owner).
- User management, access management, dashboard management, role management.
- Invitations via **email**; member contact details, special needs & medical notes
  captured and visible from the register.
- Rich, modern UX/UI; latest frameworks; native Android & iOS + desktop web.

### Round-2 confirmations (2026-09-14)
- **First sport: table tennis** — design must stay **future-proof
  multi-sport** (see `SportProfile`).
- Mentis stores a member's **rankings from multiple platforms
  simultaneously** (TTE, international, local).
- Captures **match history + results from various sources**.
- **Coaching notes** about a player must always carry a **source** (session
  or event).
- Coaches can capture **events from external sources** (e.g. TTE competition
  diary); every event keeps its source reference.
- **Members capture event availability** → coaches plan coaching around
  events and can **suggest events** to members.
- The **competition diary is common across venues** (org-level).
- **Auth:** Supabase is Rally's primary & only login (Firebase
  decommissioned — ignore). Mentis uses **its own separate role set**.
- **Scale:** ~200 members, 2 venues, 10 coaches, 10 sparrers, 3 admins,
  2 super admins. **Users can hold multiple roles.**
- **Offline:** works without internet, syncs when online (offline-first).
- **User scope:** all staff log in; staff not in Rally **register via
  Rally**, then get Mentis roles. Sparrers log in with **limited** access.
- **Price/plans: skipped for now** (no billing fields in v1).

### Round-3 confirmations (2026-09-14)
- **Super Admin = god mode** (anything, everywhere). **Admin = operations
  across both venues.**
- **Sparrer limited access**: as proposed (own profile; read-only register
  for assigned sessions incl. ⚠️ alerts; own tasks; own availability).
- **Multi-role**: in-app **role switcher** — pages & access render for the
  **selected role** (RLS still enforces the union of the user's roles as
  the security floor).
- **Member event availability**: **option (b)** — lightweight member
  **micro-flow PWA** (QR/emailed link + member code; toggle event
  availability + browse the competition diary; no full login).
- **TTE diary**: manual + CSV now; **scraper → backlog** (per owner).
- **Coaching notes → rich PlayerFeedback** (see §3):
  - source includes session **name** + optional **sub-session**
    (e.g. "Session: Tuesday 4PM 24-Mar-2026, Sub Session: Drill 1 - FH to
    BH Drill");
  - can capture **which staff** the player performed well with, and **which
    player** they performed with;
  - same for events (e.g. "Event: London Open, Sub Event: Match 3 P1 vs P2");
  - given as **member feedback with 1–10 ratings** (1 lowest, 10 highest)
    across **multiple attributes & sub-attributes** (e.g. focus, skill,
    behaviour, progression) + free-text description;
  - **UX**: staff locate the session/event context by **current date &
    time** and **venue via current location** (GPS).

### Round-4 confirmations (2026-09-14)
- **Name change: CoachPro → Mentis** ("CoachPro" is used by other companies).
  The app product name is **Mentis** everywhere. (The GitHub *repository*
  name is a separate owner action.)
- **Org context** (from the email domain): **Kingfisher Table Tennis Club**,
  UK — consistent with UK/GDPR + English-only.
- **Email**: transactional mail from
  **noreply@mentis.kingfishertabletennisclub.com** (Nodemailer via Edge
  Function, matching Rally).
- **MVP boundary agreed**: first delivery = **Phases 1–4**; **Phase 5 =
  v1.1**.
- **All "agree?" items confirmed**: sub-sessions (ad-hoc + templates);
  rankings (manual/CSV + as-of history, API later); matches (in-app + CSV
  import); public read-only diary page; taster web form + QR + manual
  fallback; member photos (consent-gated); UK/GDPR + English only; branding
  "Mentis" (dark+light, simple custom logo); dashboards role-defaults
  (per-user customization in backlog).
- **Rating attributes**: skill sub-attributes confirmed ✅; owner asked for
  sub-attributes on **behaviour** and **progression**, and where
  **focus/concentration** belong → proposed tree below (Q1, Round 4).

### Round-5 additions & confirmations (2026-09-14)
- **Rating attribute tree: CONFIRMED** (skill / focus / behaviour /
  progression as in §3).
- **Staffing & timesheet domain added**:
  - Session schedule per venue with **lead coach + assisting coaches +
    sparrers** (planned date/time/hours per staff).
  - Staff availability with **date + time captured**; coach can inform &
    update a staff member's unavailability in Mentis.
  - **Planned vs. actual coverage** (timesheet) — exactly who was planned to
    cover and who covered in reality.
- **Billing is now IN SCOPE** (supersedes Round-3 "skip billing"):
  - All hours feed **invoicing** at **hourly rates per staff per session**
    (rates may differ per session).
  - **Invoice**: any staff or admin can create from a start → end date/time;
    hours + respective rates computed; **manager/admin approval**; approved
    items are **LOCKED** (cannot be re-billed; overlapping re-invoice shows
    "nothing billable" except NEW or backfilled items — e.g. new task/session
    added, or missing staff details backfilled).
  - **Billed vs. unbilled breakdown** by date, time, session or task for any
    range — visible to staff & admin.
  - **Tasks**: ad-hoc, pre-/post-dated, **typed** (Group Coaching, 1-2-1
    Coaching, On Duty, Campaigning, etc.), created by staff/manager/admin,
    can be **recurring** (admin creates, assigns to coach), **separate
    manager/admin approval** required before a task is billable (unapproved
    tasks never appear in an invoice), can be **chargeable to a customer**
    (tagged → visible on customer page for admin/manager & staff views).
  - **Customer charge flow**: on approving a customer charge, manager/admin
    confirms the **amount was retrieved from the customer**; if not →
    **outstanding debit** on the customer account + **admin pending action
    with a due date** to clear it.
  - **Session detail view (staff)**: own hours AND other staff's hours on
    the session, with date, start & end times.
  - **Billing dashboard** (admin & staff): invoiced amount by timeline,
    outstanding amount (past-dated invoiceable items), forecast amount
    (schedule-based).
- **Manager/admin diary**: quarter / month / week / **day views** of all
  sessions, **colour-coded by staffing**:
  - GREEN = expected staff available for the session
  - AMBER = under-numbered due to low **sparrers**
  - RED = under-numbered **coaches**
  - Based on planned staffing vs. actual declared availability; a staff
    member marked unavailable but still assigned = **breach**; colour rolls
    up day→week→month→quarter.
  - **Email alert** to manager + lead coach when a breached session is still
    assigned (reminder to name replacement staff) + **pending actions** on
    both (action created ~1 month before the session; **breaches 1 week
    before** the session until closed).
- **Actions engine**: actions can be triggered by an **event**, by an
  **activity**, or **manual** (any manager & staff can create a manual
  action on others).

### Round-6 confirmations (2026-09-14) — ALL OPEN QUESTIONS CLOSED
- **Invoice recipient**: Mentis **pays each coach/sparrer** — per-staff
  contractor invoice per period (one invoice per staff per period).
- **Action types**: seed list confirmed (*name replacement staff · confirm
  staffing · clear outstanding debit · backfill missing staff details ·
  review unbilled items*) **+ CUSTOMIZED action types, configurable in
  Mentis** (admin-defined types with their own fields/triggers).
- **Actions link to ANY entity**: session, task, venue, or any other
  Mentis entity (polymorphic `linkedEntity`).
- **Task billing amount**: **fixed price set at creation**.
- **Actual hours**: planned hours auto-posted at session completion, staff
  adjusts actuals, admin backfills — ✅.
- **Breach timeline**: defaults = action created ~1 month before session,
  breaches 1 week before until closed — ✅, and **all such timelines are
  configurable in Mentis**.
- **Thresholds**: missing coach = 🔴, missing sparrer = 🟡, all covered =
  🟢, worst-wins — ✅.
- **First delivery**: **Phases 1–5** (incl. staffing & billing); Phase 6 =
  v1.1 — ✅.
- **"1-2-1"** = one-to-one coaching — ✅.

### Round-7 addition (2026-09-14) — weekly scheduling & conflict prevention
- **Weekly schedule (admin)**: created with **from date → to date**,
  day-of-week, **venue, start & end time, lead coach, assistant coach,
  optional sparrers** — each with their **selected rate card** → generates
  the session instances for the range.
- **Each coach/sparrer can hold MULTIPLE rate cards**; the card is selected
  **per session assignment** → variable hourly rates per session.
- **Exceptions**: **term-holiday weeks** and **selected bank holidays**
  (org holiday calendar) → no sessions generated for those dates.
- **Schedule override**: from a selected date/time → to a selected
  date/time, **any attribute** overridable (venue, lead coach, assistant
  coach, sparrers, times, rate cards).
- **Conflict prevention (hard rules)**:
  - Default **1 concurrent session per venue** — no two (or more) sessions
    at the same venue at the same/overlapping time.
  - **Same coach cannot have overlapping hours** between sessions (any
    capacity: lead/assistant/sparrer).
  - A coach **can run back-to-back** (one ends exactly when the next starts).
- **Interpretation calls (confirmed by owner, Round 8):**
  1. One weekly schedule = one recurring weekly slot (day-of-week + time
     window + venue + staff); multiple slots = multiple schedules.
  2. Overrides apply to all generated instances in the given range, with a
     preview of affected instances before confirming.
  3. UK bank holidays seeded (admin-editable); term holidays entered as a
     date range covering the holiday week (whole week = no sessions).
  4. Conflicts are a **hard block at save** (with the conflicting sessions
     listed), not a warning.

### Round-8 — scope expansion (2026-09-14)
Owner decision: **ALL suggested features are in scope**, except anything
requiring **Voice STT** (explicitly excluded; stack stays compatible).
Full specs: `docs/development-prompt.md` v1.2 (§5 entities, §6.12–6.18
flows, business rules 21–31, Phases 1–6).
- **A — v1 gap fixes (in first delivery):** A1 session cancel/postpone
  (+ standby hours) · A2 invoice paid status · A3 timesheet guardrail
  (billable increases need admin review) · A4 global search + admin
  Inbox · A5 GDPR toolkit (EU residency, record export, audit viewer,
  consent expiry, erasure flow) · A6 app lock (biometric/PIN) · A7 ICS
  export · A8 member profile: TTE reg no, handedness, playing style
- **B — v1 additions:** B1 group broadcast (templated, scheduled) · B2
  monthly attendance summary email · B3 substitute quick-pick · B4 event
  squad picker · B5 player goals + rank movement · B6 enrolment pause +
  waitlist · B7 feedback preset chips
- **C — v1.1 differentiators:** C1 1-2-1 booking PWA · C2 termly
  progress report · C4 match analytics · C5 taster conversion pack ·
  C6 coach performance dashboard · ~~C3 Voice-to-feedback~~ —
  **EXCLUDED (Voice STT)**
- **D — strategic:** D1 multi-tenant = design constraint only (org-
  scoped RLS; no build) · D2 sparring-partner matcher · D3 auto event
  suggestions (rules engine; LLM later)

---

## 3. Entity model (draft v0.1) 🟡

```
Organization (1, single tenant today; designed multi-tenant-ready)
├── SportProfile (multi-sport support — see below)
│     name (e.g. "Table Tennis", "Karate"), rankSystem {type, levels[]},
│     configurable attributes (weight class?, age bands, skill tags),
│     group templates, session-type templates,
│     feedbackAttributeTemplates (attribute → sub-attributes, 1–10 ratings).
│     Table-tennis seed (Admin-editable):
│       skill {forehand, backhand, serve, footwork, receiving}
│       focus {concentration, composure under pressure}
│       behaviour {discipline, sportsmanship, coachability,
│                  communication / team attitude}
│       progression {improvement vs previous, consistency, response to
│                    training, goal achievement}
├── Venue (Club)
│     name, address, phone, working hours, capacity, notes,
│     concurrentSessionLimit (DEFAULT 1 — max simultaneous sessions here)
├── Staff (auth-linked users)
│     roles: Admin, VenueManager, Coach, Sparrer (roles composable)
│     profile, specialties, availability, coaching hours
├── Customer (payer / account holder)
│     contact details, guardian A (father/mother/guardian),
│     guardian B (optional), NOK (name/rel/phone),
│     consent flags (issuedAt, validUntil? — expiry warnings)
│     "isAlsoMember" → 0..1 Member (adult case)
├── Member (child of Customer, 1..N)
│     DOB, sport(s) + level within sport (from SportProfile),
│     photo, emergency contact (NOK),
│     specialNeedsFlag + specialNeeds/medicalNotes (role-restricted),
│     <18 → parentCustomer required + NOK required (validation),
│     tteRegistrationNo?, handedness (L/R), playingStyle (SportProfile
│     options + custom), equipmentNotes?
├── Prospect/Taster
│     name, age, contact, consent; approvedSession(s) by Admin;
│     status: requested → approved → attended → converted/closed
├── Session (recurring schedule)
│     venue, coach, sparrers, weekday/time, duration, level band,
│     capacity, status → generates SessionInstance (per date);
│     instance status: scheduled | cancelled (reason) | postponed |
│     completed
├── SessionSegment (sub-session / drill within a SessionInstance)
│     name/description (e.g. "Drill 1 - FH to BH Drill"), order,
│     ad-hoc per instance or from reusable templates
├── Enrollment (Member ↔ Session)
│     status: invited / active / paused (reason, autoResumeDate?) /
│     waitlisted (ordered) / completed
│     "expected" flag → drives the pre-loaded register list (paused excluded)
├── AttendanceRecord (per SessionInstance)
│     member | taster, status: present/absent/late/taster,
│     notes, recordedBy, recordedAt, device/offline flag
├── Group (venue-scoped cohort, e.g. "Kids Beginners M+W")
│     members of: Members and/or Staff (coaches/sparrers)
├── Task (extended for billing)
│     title, type: groupCoaching | oneOnOne (1-2-1) | onDuty | campaign |
│     other, assignee (user OR group), pre-/post-dated, due date,
│     priority, status, reminder schedule, linkedTo (session/venue/member),
│     recurrence? (admin can create recurring, assigned to coach),
│     chargeableToCustomer? + customerId (tag) → visible on customer page,
│     amount (FIXED price set at creation),
│     approval: created (any staff/manager/admin) → approved by
│     manager/admin (SEPARATE from invoice approval; unapproved tasks never
│     invoice), workLog (recorded work)
├── RateCard (per staff — MULTIPLE per coach/sparrer)
│     name/label, ratePerHour, notes, validFrom (history);
│     SELECTED per session assignment → variable hourly rate per session
├── WeeklySchedule (recurring generator — admin)
│     name, dayOfWeek, validFrom → validTo (from date → to date),
│     venue, startTime, endTime, levelBand?, capacity?,
│     leadCoach + rateCardId, assistingCoaches[] + rateCardId each,
│     sparrers[] + rateCardId each;
│     skips HolidayCalendar exceptions (term-holiday weeks, bank holidays)
│     → generates SessionInstances
├── HolidayCalendar (org-level)
│     name, kind: termHolidayWeek (date range) | bankHoliday (date) |
│     manual (date range); UK bank-holiday seeds (admin-editable)
├── ScheduleOverride (range-based)
│     scope: weeklyScheduleId | session, fromDateTime → toDateTime,
│     overrides: venue? | times? | leadCoach?+rateCard? |
│     assistingCoaches?+rateCards? | sparrers?+rateCards?;
│     precedence over pattern; "overridden" badge + original values;
│     audit-logged
├── MemberGoal — member, description (free text or structured), type,
│     targetDate, status: inProgress | achieved | missed
├── BookingSlot (1-2-1, Phase 6) — coach, venue, recurring slot
│     (weekday/time/duration), fixedPrice, status
├── Booking (Phase 6) — member, slot, date/time, status: booked |
│     approved | completed | cancelled (cancellationWindow, default 24h)
├── ProgressReport (Phase 6) — member, period (term), status: draft |
│     approved | sent, pdfRef, approvedBy, sentAt
├── StaffTimeEntry (timesheet — planned & actual coverage)
│     staff, sessionInstance | task, date, startTime, endTime, hours,
│     kind: planned (from schedule) | actual (recorded / backfilled),
│     source: schedule | session-save | manual | backfill,
│     billState: unbilled | billed (→ invoice)
├── Invoice (period-based; staff or admin can create draft)
│     number, periodStart, periodEnd, createdById,
│     addressedTo: STAFF (contractor) — Mentis pays each coach/sparrer;
│     ONE invoice per staff per period,
│     lineItems[]: {staff, session|task, date, start, end, hours, rate,
│     amount}, status: draft → pendingApproval → approved (LOCKED) →
│     paid (paymentDate, method?, reference?),
│     approvedById/At (manager/admin)
│     Lock rule: approved items cannot be re-billed — an overlapping
│     re-invoice lists "nothing billable" except NEW or backfilled items
├── BillingLedger (billed/unbilled state per item)
│     itemRef (StaffTimeEntry | Task) → invoiceRef, status: unbilled|billed
│     → powers the billed-vs-unbilled breakdown (date, time, session or
│     task) for any range, visible to staff & admin
├── CustomerAccount (per customer — charges & debt)
│     entries[] (charges, recoveries, debits), balanceDue
├── CustomerCharge (approved chargeable task → customer)
│     task, customer, amount, status: pendingApproval → approved →
│     recovered (collected) | outstandingDebit (dueDate);
│     manager/admin confirms collection at approval; if not collected →
│     outstanding debit on customer account + admin pending action (dueDate)
├── ActionType (seed + CUSTOM — admin-configurable in Mentis)
│     name, description, trigger: event | activity | manual,
│     defaultDueOffset (default P1M before session),
│     defaultBreachOffset (default P1W before), allowedLinkTypes,
│     customFields[]
├── PendingAction (actions engine)
│     actionType (seed | custom), title,
│     assignee (can be "others" — any manager & staff can create manual
│     actions on others),
│     linkedEntity (ANY Mentis entity: session, task, venue, member, event,
│     invoice, … — polymorphic),
│     dueDate, breachWindow (configurable per action type; all timelines
│     configurable in Mentis), status: open → breached → closed,
│     emailAlertOnBreach → recipients (manager, lead coach)
├── StaffAvailability (per staff — availability & breach input)
│     date/period, status: available | unavailable (date + time captured),
│     reason, recordedAt, recordedBy (self, OR coach/admin informing &
│     updating on their behalf)
├── SessionStaffing (per SessionInstance — planned coverage)
│     leadCoach, assistingCoaches[], sparrers[] (each with planned
│     date/time/hours + selected rateCardId → rate for timesheet & invoice)
├── StaffingStatus (derived per SessionInstance + roll-up)
│     expected staffing vs. declared availability →
│     GREEN (expected staff available) | AMBER (under-numbered: sparrers
│     short) | RED (under-numbered: coaches short); worst-wins;
│     rolls up day→week→month→quarter; breach = assigned staff unavailable
├── Event (org-level — competition diary common across venues)
│     name, sport, start/end dates, location, entryDeadline,
│     source {type: tte | ittf_wtt | club | local | manual, externalRef/url},
│     status: upcoming / ongoing / completed / cancelled
├── EventEntry (Member ↔ Event — availability & participation)
│     status: suggested(byCoach) / interested / available / confirmed /
│     notAvailable / entered / completed; <18 → guardian confirmation
├── SubEvent (optional part of an Event, e.g. "Men's U15 Singles";
│     holds match references like "Match 3: P1 vs P2")
├── Match (member match history — multi-source)
│     date, event? (optional), subEvent? (optional),
│     session? (practice/inter-venue, optional),
│     opponent(s)/team, score per game, result,
│     source {tte | ittf_wtt | club | local | manual}, sourceRef
├── Ranking (member ↔ platform — multiple platforms stored concurrently)
│     source {TTE national, ITTF/WTT world, club, local}, rank/value,
│     asOfDate (keeps history), sourceRef
├── PlayerFeedback (coaching note / performance feedback — source MANDATORY)
│     member, coach (author), text (feedback/description),
│     sourceType: session | event,
│     sessionInstanceId? (required if session) | eventId? (required if event),
│     subSource?: SessionSegment (e.g. "Drill 1 - FH to BH Drill")
│                | SubEvent/Match (e.g. "Match 3: P1 vs P2"),
│     ratings[]: {attribute, subAttribute?, score 1–10 (1 lowest, 10 highest)}
│        — attributes from SportProfile feedbackAttributeTemplates,
│     performedWithStaff[] (staff the player performed well with),
│     performedWithPlayers[] (players performed/played with),
│     tags
├── CommunicationLog (emails/push sent: template, recipient, ts;
│     kind: invitation | reminder | alert | broadcast (groupId) |
│     summary | report)
└── AuditLog (who did what; mandatory trail on medical-note access)
```

Relationship notes:
- Customer 1—N Member. Member N—M Session (via Enrollment) — a member can be
  across venues (reporting must handle this).
- Coach N—M Session (primary + assistant). Sparrer N—M Session.
- Taster → on approval becomes a row in the register for the chosen
  SessionInstance(s); conversion creates Customer + Member (one tap, prefilled).
- Group is a **label/segment**, not a hierarchy — used for tasks, reminders,
  and future billing cohorts.
- Event is **org-level** (diary is common across venues); EventEntry links
  Member↔Event (availability, suggestions, confirmation).
- Match & Ranking are member-level and **source-tagged** (external or
  internal); a member holds many rankings from different platforms at once.
- PlayerFeedback always points at a SessionInstance (optionally a
  SessionSegment) or an Event (optionally a SubEvent/Match) — no orphans.
  SessionSegment = sub-session (drill); SubEvent = part of an event.

---

## 4. Roles & access matrix (draft v0.2) 🟡

**Roles — Mentis's OWN role set** (separate from Rally's roles, per owner):
- **Super Admin** (2) — **god mode**: can do anything and everything
  (org settings, user & role management, all venues, integrations, data
  export/erasure).
- **Admin** (3) — day-to-day operations across venues: venues, staff,
  customers/members, sessions, tasters, tasks, events, reports. No system-level
  user/role management.
- **Coach** (10) — their loop: today's sessions, attendance register,
  coaching notes (session/event-linked), tasks, own availability, event
  planning & suggestions, own coaching hours.
- **Sparrer** (10) — **limited**: own profile; assigned sessions (read-only
  register incl. ⚠️ alerts — safety, they're on the floor); own tasks;
  own availability. No customer data beyond the register, no member editing,
  no events management.
- **Multi-role:** a user can hold multiple roles. The app shell has a
  **role switcher** — pages, nav & access render for the **selected role**;
  RLS enforces the **union** of the user's roles as the security floor (the
  UI can never grant more than the selected role).
- **Onboarding:** accounts are created in Rally (shared Supabase auth); a
  Mentis Admin then assigns Mentis roles. No standalone Mentis signup.

Legend: A = all (create/edit/delete/assign), M = manage (edit/assign, scoped),
V = view, S = self only, – = no access

| Entity / action               | Super Adm | Admin | Coach                   | Sparrer                    | Public (no login) |
|-------------------------------|-----------|-------|-------------------------|----------------------------|-------------------|
| Org & system settings         | A         | –     | –                       | –                          | –                 |
| Users & roles                 | A         | –     | –                       | –                          | –                 |
| Venue CRUD                    | A         | A     | V (own)                 | V (own)                    | –                 |
| Coach/Staff manage            | A         | A     | S profile               | S profile                  | –                 |
| Customer/Member CRUD          | A         | A     | V (incl. ⚠️ medical)    | V register-only (own sessions, incl. ⚠️) | – |
| Session CRUD                  | A         | A     | V assigned, note own    | V (own)                    | –                 |
| Attendance record             | A         | A     | A (own sessions)        | –                          | –                 |
| Taster approve/assign         | A         | A     | V (own register)        | –                          | Register taster (form) |
| Task CRUD (any staff creates) | A         | A     | A (create, typed, pre/post-date) | create · view own    | –                 |
| Task approval (→ billable)    | A         | A     | – (request)             | –                        | –                 |
| Groups                        | A         | A     | V (own)                 | V (own)                    | –                 |
| Events/matches/rankings/notes | A         | A     | A (suggest, record, note) | V (own)               | – (diary view? Q9) |
| Reports                       | A         | A     | S (own hours)           | –                          | –                 |
| Dashboards (config)           | A         | A     | S                       | S                          | –                 |
| Staffing plan (lead/assist/sparrers) | A   | A     | V assigned; flag unavailable staff | V (own)            | –                 |
| Staff availability (record/update)   | A (all) | A (all) | S (+ on others' behalf) | S                    | –                 |
| Timesheet (planned & actual)  | A         | A     | S (own) + view session staff hours | S (own)          | –                 |
| Hourly rates                  | A         | A     | –                       | –                          | –                 |
| Invoice: create draft         | A         | A     | A (own/assigned items)  | –                          | –                 |
| Invoice: approve → lock       | A         | A     | –                       | –                          | –                 |
| Billed/unbilled range view    | A (all)   | A (all) | V (own + breakdown)     | –                          | –                 |
| Customer charges & debits     | A         | A     | V (own)                 | –                          | –                 |
| Manager diary (colour-coded)  | A         | A     | –                       | –                          | –                 |
| Pending actions: view/close   | A         | A     | S                       | S                          | –                 |
| Pending actions: manual (on others) | A     | A     | A                       | A                          | –                 |
| Billing dashboard             | A         | A     | V (own + org)           | –                          | –                 |

RBAC enforced **at the database level** (Supabase RLS) — app-level UI hides
what the role can't do; the DB refuses the rest. Audit trail on all access to
medical/special-need fields. Customer/member self-service = later phase
(not in v1 roles).

---

## 5. Core flows (screen-level sketch)

### 5.1 Coach daily loop (the money path)
1. Open app → **Today** tab: today's sessions (time, venue, expected count),
   pending tasks, reminders.
2. Tap a session → **Register screen** (see §6 — the deep-dive).
3. After save → summary (present/absent/tasters) → optional follow-ups
   (note for absentees later phase).

### 5.2 Admin day-to-day
- Dashboard: venues → sessions today → unprocessed taster requests, overdue tasks.
- CRUD for every entity from in-app screens (create/edit/assign/view/delete
  with soft-delete + confirm where destructive).
- Taster queue: approve → pick session/instance → email confirmation.
- Task creation with group targeting + reminders.

### 5.3 Taster journey (public)
1. Public web form (PWA, no login): name, age, contact, preferred session.
   (QR code printed at venue → form.)
2. Admin approves & assigns session → email/push to prospect.
3. Coach sees taster in register (badged, distinct section).
4. Admin converts to Customer + Member (one tap, prefilled) or closes.

### 5.4 Task & reminder
- Task → assignee = user or group → reminder (e.g. D-1, H-2 before due;
  configurable) → push + email → status todo/in-progress/done →
  optional work recording (hours, notes) → optional invoice reference.

### 5.5 Reporting
- **Members per venue**: list w/ sessions, groups, contact (CSV export).
- **Member 360**: all sessions across venues, attendance %, customer & NOK,
  medical ⚠️ (role-gated) — this is the billing view.
- **Coaches & hours**: per coach per period — session hours (from instances),
  work log entries, total (CSV export).
- **Venue dashboard**: attendance trend, taster funnel (registered → tried →
  converted), utilization.

### 5.6 Events & competition (org-wide, common across venues)
- **Competition diary**: org-level calendar. Sources: manual entry, CSV
  import (e.g. TTE diary), external reference (URL). Every event keeps its
  source tag + reference. (API connectors — TTE/ITTF — later phase.)
- **Event planning**: coach views upcoming events → member availability per
  event → **suggests an event** to a member (notification; guardian confirms
  for <18).
- **Member availability**: per-event status the coach sees at a glance
  (available / not / confirmed).
- **Match recording**: in-app (opponent, per-game scores, result,
  event/session context, source tag) — from an event or a session
  (practice/inter-venue).
- **Rankings**: multiple concurrent per member (TTE national / ITTF–WTT world
  / club / local), each with as-of date → ranking history.
- **PlayerFeedback capture (context-aware)**:
  - Launched from within a session/event screen (context already set), or via
    a **current-context finder**: today's sessions at the nearest venue
    (current date & time + GPS) → pick session/sub-session or
    event/sub-event in one tap.
  - **Sub-session** = drill/segment (ad-hoc name, e.g. "Drill 1 - FH to BH");
    **sub-event** = match reference (e.g. "Match 3: P1 vs P2").
  - Free-text feedback + **1–10 ratings** (1 lowest, 10 highest) across sport
    attribute templates (focus, skill {FH, BH, serve, footwork, receiving},
    behaviour, progression) — slider/stepper UX.
  - Capture **performed with**: staff (which staff they clicked for) + players
    (partners/opponents).
  - Aggregates into the **player development timeline** in Member 360
    (ratings over time, per attribute, per source).

### 5.7 Staffing, availability & breach (manager/admin + coach)
- **Session schedule per venue**: lead coach + assisting coaches + sparrers,
  each with planned date/time/hours (SessionStaffing).
- **Availability**: staff marks available/unavailable with **date + time**
  (self, or coach/admin informs & updates on their behalf).
- **Breach**: assigned staff declared unavailable → staffing status:
  GREEN (expected staff available) · AMBER (under-numbered sparrers) ·
  RED (under-numbered coaches); worst-wins; rolls up day→week→month→quarter.
- **Pending action** auto-created for lead coach + manager ("name
  replacement staff"); created ~1 month before the session, **breaches 1 week
  before** until closed; **email alert** to manager + lead coach on breach.
- **Session detail view (staff)**: own hours **and** other staff's hours on
  the session, with date, start & end times.

### 5.8 Timesheet, rates & invoicing
- **Planned vs. actual coverage**: planned from schedule; actual recorded
  (session save / staff timesheet / admin backfill for missing staff details).
- **Hourly rate per staff per session** (may differ per session; history).
- **Billed/unbilled breakdown**: any date/time range → items broken down by
  date, time, session or task (staff & admin views).
- **Invoice**: staff or admin picks start → end date/time → unbilled items +
  rates → draft → **manager/admin approval** → **LOCKED** (no re-billing;
  overlapping re-invoice shows "nothing billable" except new/backfilled).
- **Billing dashboard** (admin & staff): invoiced by timeline · outstanding
  (past-dated invoiceable items) · forecast (schedule-based).

### 5.9 Customer charges & debt
- Task (any type) marked **chargeable to customer** + customer tag →
  visible on the customer page (admin/manager & staff views).
- **Separate manager/admin task approval** required before billing;
  unapproved tasks never appear in an invoice.
- On approving a customer charge: manager/admin confirms amount
  **retrieved**; else → **outstanding debit** on customer account with due
  date + **admin pending action** to clear it.

### 5.10 Actions engine & manager diary
- **Actions** triggered by **event**, by **activity**, or **manual** (any
  manager & staff can create manual actions on others); seed types +
  **custom types configurable in Mentis**; every action links to any
  entity; all timelines configurable (Round 6).
- **Manager/admin diary**: quarter/month/week/day views of all sessions,
  colour-coded by staffing status with cross-period roll-up.

### 5.11 Weekly scheduling, holidays & overrides (admin)
- **Holiday calendar** (org-level): term-holiday weeks (date ranges),
  bank holidays (dates; UK seeds, admin-editable), manual no-session
  ranges.
- **Weekly schedule**: from date → to date, day-of-week, venue, start &
  end time, lead coach, assistant coach, optional sparrers — each with a
  **selected rate card** (multiple cards per staff; variable hourly rate
  per session) → generates instances for the range, **skipping holiday
  weeks & bank holidays**.
- **Override**: range (date/time → date/time), any attribute overridable;
  affected instances show "overridden" badge + original values; audited.
- **Conflict prevention** (blocked at save, with the conflicting sessions
  listed): venue concurrency (default **1** per venue, configurable);
  staff no-overlap in any capacity; **back-to-back allowed** (end ==
  next start).

### 5.12 Round-8 extensions (full spec: development-prompt.md §6.12–6.18)
- Session lifecycle: cancel (reason + auto-notify + standby hours) /
  postpone (re-validated) (A1)
- Communication: group broadcast (B1), monthly attendance summary email
  (B2)
- Operations: global search + admin inbox (A4), GDPR toolkit (A5), app
  lock (A6), ICS export (A7)
- Member lifecycle: profile extensions (A8), pause + waitlist (B6),
  taster conversion pack (C5)
- Competition: squad picker (B4), goals + rank movement (B5), feedback
  preset chips (B7)
- Billing: invoice paid status (A2), timesheet guardrail (A3),
  substitute quick-pick (B3)
- v1.1: 1-2-1 booking PWA (C1), termly progress report (C2), match
  analytics (C4), coach performance dashboard (C6), sparring-partner
  matcher (D2), auto event suggestions (D3)
- **Voice STT: EXCLUDED per owner** (C3 dropped; stack stays compatible)

---

## 6. Attendance register UX — deep dive 🟡 (crown jewel)

Principle: **a 30-person register must be markable in under 60 seconds.**

```
[ Session header ]  Venue • 18:00–19:30 • Coach: You
[ Progress bar ]    21/24 marked        [ Mark all present ] [ Clear ]
[ Filter chips ]    All | ⚠️ | Tasters | Unmarked
---------------------------------------------------------------
 ● Aarav (Belt Blue)      Present   |  Customer: R. Kamath  📞  ⚠️
 ● Meera (Belt Yellow)    tap→Present
 ○ Taster: Sam (10y)      tap→Taster attended   [Convert later]
 ...
---------------------------------------------------------------
[ + Add ad-hoc member ]      [ 💾 Save & sync (offline-safe) ]
```

Key decisions:
- List is **pre-loaded from Expected/Invited enrollments** — coach marks, not types.
- Tap = cycle Present → Absent (big targets; works one-handed, outdoors, gloves).
- ⚠️ badge → tap expands **alert panel**: medical note, NOK name + phone with
  **tap-to-call**, special instructions. (Access to this is audit-logged.)
- Customer name + phone visible inline (per owner requirement).
- Tasters in a separate badged section.
- "Mark all present" for small groups; undo history (last N actions) before save.
- **Offline-first**: full register works with zero signal; queue + auto-sync;
  conflicts resolved by latest-timestamp with audit trail.
- Post-save summary screen with absentees (follow-up actions in later phase).

Member/parent QR self check-in: **backlog** (v1 = coach-marked register).

---

## 7. Non-functional requirements 🟡

- ✅ **Offline-first (confirmed)** on mobile for the coach loop (local DB +
  sync queue); works with zero internet, syncs when online.
- Web (desktop) is a **dashboard/admin console** (online, responsive PWA).
- **Privacy (minors!)**: consent captured at registration (incl. medical info
  consent); medical notes role-restricted (Admin/Manager/assigned Coach) +
  audit trail; export/delete support (GDPR-style; confirm jurisdiction).
- **Performance**: register screen < 2s to interactive; app cold start fast.
- **Accessibility**: large-text register mode, high contrast, voice-friendly.
- **i18n-ready**, English only for v1 (confirmed Round 4).
- **Data import**: initial bulk import from spreadsheet (members/customers/
  sessions) — CSV import wizard in admin.
- **Audit log** on sensitive fields & admin actions.
- **Multi-role users**: permission = union of the user's roles (RLS evaluates
  all of them).
- **External data**: source-agnostic design for events/matches/rankings
  (manual + CSV in v1; API connectors — TTE/ITTF-WTT — later).
- Staging + production environments; CI/CD; automated migrations.

---

## 8. Tech stack — aligned with Rally ✅ (decision recorded)

Rally is a full-TypeScript shop: React 19 + Vite + Tailwind 4 + Supabase
(Postgres/RLS/Auth) + TS Edge Functions + OneSignal + Nodemailer + Stripe +
Vitest + Vercel/Cloud Run. **Mentis is built in the same
TypeScript/React/Supabase family** → shared code, shared skills, shared infra,
true "tandem" operation. **Flutter is excluded** (Dart = no code/skill/infra
sharing with Rally).

### Targets & tooling
- **Mobile (Android + iOS): Expo + React Native 0.81+ (React 19, TS)**
  - Styling: **NativeWind** (Tailwind-consistent design tokens w/ Rally web)
  - Icons: Lucide (React Native build)
  - Data: **Supabase JS client** — same client Rally uses (RLS, realtime)
  - Animations: **Reanimated 3** (the RN equivalent of Motion)
  - Push: **OneSignal** (same provider as Rally)
- **Web (desktop console): React 19 + Vite + TS + Tailwind 4 + Lucide +
  Recharts + Motion** — Rally's exact web stack (max reuse, consistent look).
- **Shared TypeScript core package** (consumed by mobile + web + edge fns):
  - Entity types/enums (single source of truth)
  - Supabase client wrappers + RLS-aware queries
  - Validation, formatters, report/billing logic
  - SportProfile configuration (multi-sport)
- **Backend: Supabase (Rally's project family)**
  - Postgres + RLS → per-entity access control at DB level
  - **Edge Functions (TS)**: email (Nodemailer, from
    noreply@mentis.kingfishertabletennisclub.com), public taster-form API,
    reminder scheduler (pg_cron), webhooks
  - Realtime (live session board — later phase)
  - Storage: private buckets (photos, docs, consent forms)
- **Auth: Supabase Auth** — ✅ confirmed: Rally's primary & only login
  (Firebase decommissioned). Same project & user pool as Rally; Mentis keeps
  a **separate role set** (its own profiles/roles table; Rally's roles
  untouched).
- **Payments: Stripe** — future in-app billing (same as Rally).
- **Voice/AI (optional, later): Google Cloud STT/TTS + GenAI + duplex voice
  (Cloud Run)** — same as Rally; available if a voice assistant is ever wanted.
- **Testing: Vitest** (same). **Infra: Vercel (web) + EAS Build (mobile) +
  Supabase CLI + staging/prod environments** (mirrors Rally's multi-env setup).

### Compatibility notes — issues to be aware of
- **C1 — Auth (RESOLVED ✅)**: Supabase is Rally's primary & only login
  (Firebase decommissioned — ignored). Mentis shares Rally's Supabase
  project & user pool, with a **separate Mentis role set**. Staff not yet in
  Rally register in Rally first, then get Mentis roles from an Admin.
- **C2 — Single-codebase tradeoff**: a true single codebase for
  Android+iOS+web means React Native Web. It *can* do web, but a rich
  **desktop admin console** is markedly better as a dedicated React (Vite)
  app matching Rally. → **Decision: shared TS core + two UI targets**
  (RN mobile, React web). You trade 100% UI-code sharing for best-in-class UX
  per surface and full alignment with Rally's web tooling.
- **C3 — Tailwind parity**: Rally web = Tailwind 4 (DOM); RN = NativeWind.
  APIs differ, but we keep one shared design-token/theme source so
  brand/spacing/color match. Not 1:1, fully consistent.
- **C4 — React 19 alignment**: RN 0.81+ supports React 19 → matches Rally's
  React 19.2.4. No issue.
- **C5 — Realtime/voice**: Rally's duplex voice = WS + Cloud Run. Mentis MVP
  doesn't need voice; the live session board uses Supabase Realtime. If voice
  is added later, reuse Rally's Cloud Run pattern.
- **C6 — Multi-env**: mirror Rally's multi-account Supabase (staging/prod) +
  Vercel + EAS build profiles.

---

## 9. Phasing 🟡

- **Phase 1 — Foundation**: Supabase auth (shared w/ Rally) + Mentis roles
  (multi-role + role switcher) + RLS, entity CRUD (venues, staff, customers,
  members, sessions + sub-sessions, enrollments, SportProfile=table tennis),
  **weekly scheduling** (holiday calendar, generator from→to date skipping
  holidays, range-based overrides, conflict validation: venue concurrency
  default 1, staff no-overlap, back-to-back OK), admin console (web),
  role-based dashboards, CSV import (members/customers/sessions),
  **core reports + CSV export** (members per venue, member→sessions for
  billing, coaches & coaching hours).
- **Phase 2 — Coach loop (core value)**: attendance register UX
  (offline-first), ⚠️ medical alerts, taster flow (public form → approval →
  register → convert), invitations & reminders (email + push).
- **Phase 3 — Coordination**: tasks + groups + reminders, staff availability,
  work log / coaching hours.
- **Phase 4 — Competition & feedback**: competition diary (manual + CSV
  import of TTE diary, source references), **member micro-flow PWA** (QR/code
  → event-availability toggles + diary view), coach event suggestions, match
  history & results (multi-source, sub-events), rankings (multi-platform with
  history), **PlayerFeedback system** (sub-session/sub-event source, 1–10
  attribute ratings, performed-with staff/players, current-context finder by
  date/time + GPS venue), player development timeline in Member 360.
- **Phase 5 — Staffing & billing**: session staffing plan (lead/assist/
  sparrers, planned hours), staff availability (date+time) + breach
  detection, timesheet (planned vs. actual + backfill), hourly rates per
  staff per session, period-based invoicing (draft → approve → locked;
  re-invoice safe), billed/unbilled range breakdown, billing dashboard
  (invoiced/outstanding/forecast), customer charges & debt (separate task
  approval, retrieved vs. outstanding debit, customer account),
  manager/admin colour-coded diary (day/week/month/quarter, roll-up),
  actions engine (event/activity/manual, breach email alerts, pending
  actions).
- **Phase 6 — Differentiators & self-service (v1.1):** 1-2-1 booking PWA,
  termly progress report (template-driven, optional AI-drafted), match
  analytics, coach performance dashboard, sparring-partner matcher, auto
  event suggestions (rules; LLM later), customer/member self-service app,
  advanced dashboards & trends, public read-only diary page, per-user
  dashboard customization.

**Build scope: Phases 1–6** (1–5 = first delivery; 6 = v1.1). **Excluded
(owner, Round 8): Voice STT/TTS** — stack stays compatible. Design
constraint (no build): stay multi-tenant-ready (org-scoped RLS).

### Backlog (explicitly out of v1 — captured for the future)
- **TTE competition diary scraper** (manual + CSV for now; per owner request)
- ITTF/WTT (or Sportradar) API connectors — auto-sync rankings & results
- Member/parent QR self check-in at the register
- Voice STT/TTS — **excluded per owner (Round 8)** (not backlog; stack
  compatible for a later add-on)
- Plan/price-based member billing (hourly-rate staff invoicing is now in
  scope — Phase 5)

**MVP boundary**: Round 4 agreed first delivery = Phases 1–4. **Round-5
impact**: the new Staffing & Billing domain (now Phase 5) needs a new
boundary — see Q7 (rec: first delivery = Phases 1–5, Phase 6 = v1.1).

---

## 10. Open questions (each with my recommendation)

### ✅ Confirmed in Round 3 (no action needed)
- Super Admin = god mode; Admin = operations across both venues
- Sparrer limited access (own profile; read-only register incl. ⚠️ alerts for
  assigned sessions; own tasks; own availability)
- Multi-role: in-app **role switcher** — access renders per selected role
  (RLS floor = union of the user's roles)
- Member event availability = **lightweight micro-flow PWA** (option b)
- TTE diary: manual + CSV now; **scraper → backlog**
- PlayerFeedback: source = session name + sub-session (drill) or event +
  sub-event (match reference); performed-with staff & players; **1–10
  ratings on multiple attributes & sub-attributes** + description;
  context located by current date/time + venue (GPS)

### ✅ Confirmed in Round 4
- **Name → Mentis** (CoachPro already used elsewhere)
- **Email**: noreply@mentis.kingfishertabletennisclub.com (org = Kingfisher
  Table Tennis Club, UK)
- **MVP boundary**: Phases 1–4 first delivery; Phase 5 = v1.1
- Sub-sessions (ad-hoc + templates), rankings (manual/CSV + history),
  matches (in-app + CSV), public read-only diary page, taster web form +
  QR + manual fallback, member photos (consent-gated), UK/GDPR + English,
  branding "Mentis" (dark+light, simple custom logo), dashboards
  role-defaults (per-user customization in backlog)

### ✅ Confirmed in Round 5
- **Rating attribute tree** (skill / focus / behaviour / progression)
- Billing is **in scope** (supersedes Round-3 "skip billing")

### ✅ All Round-5 questions answered in Round 6 (see §2)
1. Invoice = per-staff contractor invoice per period (Mentis pays each
   coach/sparrer) ✅
2. Action types: seeds + **custom (configurable in Mentis)**; actions link
   to **any entity**; all timelines configurable ✅
3. Task amount: **fixed price at creation** ✅
4. Actual hours: auto-post planned + staff adjusts + admin backfills ✅
5. Breach timeline: defaults 1 month / 1 week, configurable ✅
6. Thresholds: coach 🔴 / sparrer 🟡 / all 🟢, worst-wins ✅
7. First delivery: **Phases 1–5**; Phase 6 = v1.1 ✅
8. "1-2-1" = one-to-one coaching ✅

---

## 11. "Prompt-ready" maturity checklist

We write the development prompt when all of these are ✅:

- [x] Domain: table tennis first, future-proof multi-sport (SportProfile)
- [x] Tech stack: Expo/React Native mobile + React (Vite) web + shared TS
      core + Supabase; Supabase-only auth (Rally's project, separate
      Mentis roles)
- [x] Scale: 200 members, 2 venues, 10 coaches, 10 sparrers, 3 admins,
      2 super admins; multi-role users with in-app role switcher
- [x] Offline-first with sync when online
- [x] Billing/pricing skipped in v1 (reports session/attendance based)
- [x] Roles: Super Admin (god mode) / Admin (ops, both venues) / Coach /
      Sparrer (limited); multi-role = role switcher (RLS floor = union)
- [x] Member event availability = lightweight micro-flow PWA (option b)
- [x] Competition & feedback model: events, sub-events, matches, rankings,
      PlayerFeedback (sub-session/sub-event source, 1–10 attribute ratings,
      performed-with staff/players, GPS context finder)
- [x] Sub-sessions (ad-hoc + templates), rankings (manual/CSV + history),
      matches (in-app + CSV)
- [x] Public diary page, taster channel (web form + QR + manual), email
      domain (noreply@mentis.kingfishertabletennisclub.com), photos
- [x] UK/GDPR + English, branding "Mentis", dashboards role-defaults
- [x] Rating attribute tree (skill / focus / behaviour / progression)
- [x] Billing now IN SCOPE (supersedes Round-3 "skip billing")
- [x] Staffing & billing model (invoice = per-staff contractor; seed +
      custom configurable action types; actions link to any entity; fixed
      task prices; auto-posted actuals + backfill; configurable breach
      timelines; 🔴🟡🟢 worst-wins thresholds)
- [x] First delivery boundary: Phases 1–5 (Phase 6 = v1.1)
- [x] Round 7: weekly schedules (from→to, holiday exceptions, rate cards
      selectable per session), range-based overrides, conflict prevention
      (venue concurrency default 1, staff no-overlap, back-to-back OK)
      — interpretation calls A1–A4 confirmed
- [x] Round 8: ALL suggested features in scope (A1–A8, B1–B7, C1/C2/C4/
      C5/C6, D2/D3); Voice STT explicitly excluded; build scope =
      Phases 1–6 — prompt updated to v1.2

**STATUS: FINAL ✅** — `docs/development-prompt.md` v1.2 (all features,
no Voice STT).
