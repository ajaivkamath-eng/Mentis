/* Diary calendar domain — regular availability patterns, diary events,
 * overlap layout and conflict detection for the calendar-first coach diary.
 * Pure logic only: the web calendar, the mobile app and the SQL guards all
 * mirror these rules (tests/diary.test.ts pins the contract). */

/** Monday-first weekday, 1 = Monday … 7 = Sunday (ISO 8601). */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** HH:MM in 24h club-local time. */
export interface TimeWindow { start: string; end: string }

export interface DayPattern { weekday: IsoWeekday; windows: TimeWindow[] }

export type AvailabilityScope = 'one_month' | 'indefinite' | 'custom';

/** A saved Regular Availability pattern (mentis_availability_rules row). */
export interface AvailabilityRule {
  id: string;
  staffId: string;
  label: string;
  pattern: DayPattern[];
  effectiveFrom: string; // yyyy-mm-dd
  /** null = indefinite. */
  effectiveTo: string | null;
  scope: AvailabilityScope;
  isActive: boolean;
}

/** What produced a diary entry — the audit trail required for reconciliation. */
export type DiarySourceType = 'manual' | 'planner' | 'session' | 'task' | 'admin' | 'booking';

export type AvailabilityKind =
  | 'available' | 'working_hours' | 'on_duty' | 'club_duty'
  | 'holiday' | 'sick_leave' | 'duty_outside_club' | 'working_elsewhere'
  | 'personal_appointment' | 'training' | 'out_of_office' | 'unavailable_other' | 'other';

/** High-level bucket driving colour + behaviour (editability, overrides). */
export type DiaryBucket =
  | 'available'      // coach is open for coaching
  | 'regular'        // system-generated default availability
  | 'unavailable'    // holiday, sick, appointment, OOO…
  | 'duty'           // club duty / external duty / working elsewhere
  | 'session'        // booked session (system, not editable here)
  | 'task';          // booked task (system, not editable here)

export interface DiaryKindMeta {
  label: string;
  bucket: DiaryBucket;
  /** When true the diary treats the entry as blocking (RED on conflict). */
  blocking: boolean;
}

export const DIARY_KINDS: Record<AvailabilityKind | 'session' | 'task', DiaryKindMeta> = {
  available: { label: 'Available for coaching', bucket: 'available', blocking: false },
  working_hours: { label: 'Regular working hours', bucket: 'regular', blocking: false },
  on_duty: { label: 'Club duty', bucket: 'duty', blocking: false },
  club_duty: { label: 'Club duty', bucket: 'duty', blocking: false },
  holiday: { label: 'Holiday / annual leave', bucket: 'unavailable', blocking: true },
  sick_leave: { label: 'Sick leave', bucket: 'unavailable', blocking: true },
  duty_outside_club: { label: 'Duty outside club', bucket: 'duty', blocking: true },
  working_elsewhere: { label: 'Working elsewhere', bucket: 'duty', blocking: true },
  personal_appointment: { label: 'Personal appointment', bucket: 'unavailable', blocking: true },
  training: { label: 'Training / development', bucket: 'duty', blocking: false },
  out_of_office: { label: 'Out of office', bucket: 'unavailable', blocking: true },
  unavailable_other: { label: 'Unavailable', bucket: 'unavailable', blocking: true },
  other: { label: 'Other', bucket: 'unavailable', blocking: false },
  session: { label: 'Booked session', bucket: 'session', blocking: true },
  task: { label: 'Booked task', bucket: 'task', blocking: true },
};

export function isUnavailableKind(kind: AvailabilityKind): boolean {
  return DIARY_KINDS[kind]?.blocking === true;
}

/** Coach role inside a session allocation (partial allocations supported). */
export type CoachRole = 'responsible' | 'lead' | 'assistant' | 'spare';

/** One calendar event (availability, session allocation, task…). */
export interface DiaryEvent {
  id: string;
  staffId: string;
  staffName?: string;
  title: string;
  /** 'session'/'task' events come from bookings; availability uses AvailabilityKind. */
  kind: AvailabilityKind | 'session' | 'task';
  start: string; // ISO
  end: string;   // ISO
  allDay?: boolean;
  notes?: string | null;
  location?: string | null;
  sourceType: DiarySourceType;
  sourceId?: string | null;
  /** Coach role for session allocations. */
  coachRole?: CoachRole;
  /** Chargeable + rate information (session/task allocations). */
  chargeable?: boolean;
  rateCents?: number | null;
  rateLabel?: string | null;
  /** Recurrence provenance for planner-generated entries. */
  ruleId?: string | null;
  exceptionStatus?: 'none' | 'exception' | 'overridden';
  conflictStatus?: 'none' | 'open' | 'acknowledged' | 'resolved';
  /** Sessions/tasks are system-owned: the diary cannot edit them directly. */
  system?: boolean;
  linkTo?: string | null;
  visibility?: 'private' | 'staff' | 'public';
}

/* ------------------------------------------------------------------ *
 * Recurrence: planner patterns → concrete entries
 * ------------------------------------------------------------------ */

const MS_DAY = 86_400_000;

/** ISO weekday (1=Mon) of a yyyy-mm-dd string, no Date timezone pitfalls. */
export function isoWeekdayOf(dateIso: string): IsoWeekday {
  const d = new Date(`${dateIso}T12:00:00Z`);
  return d.getUTCDay() === 0 ? 7 : (d.getUTCDay() as IsoWeekday);
}

export function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  return new Date(d.getTime() + days * MS_DAY).toISOString().slice(0, 10);
}

/** Effective end date of a rule, resolving the 'one month' preset. */
export function ruleEffectiveEnd(rule: Pick<AvailabilityRule, 'effectiveFrom' | 'effectiveTo' | 'scope'>): string | null {
  if (rule.scope === 'one_month') {
    const from = new Date(`${rule.effectiveFrom}T12:00:00Z`);
    const to = new Date(from);
    to.setUTCMonth(to.getUTCMonth() + 1);
    to.setUTCDate(to.getUTCDate() - 1);
    return to.toISOString().slice(0, 10);
  }
  return rule.effectiveTo;
}

/** Resolve the date window a rule actually covers, clipped to [clipFrom, clipTo]. */
export function ruleWindow(
  rule: Pick<AvailabilityRule, 'effectiveFrom' | 'effectiveTo' | 'scope'>,
  clipFrom: string,
  clipTo: string,
): { from: string; to: string } | null {
  const from = rule.effectiveFrom > clipFrom ? rule.effectiveFrom : clipFrom;
  const end = ruleEffectiveEnd(rule);
  const to = end && end < clipTo ? end : clipTo;
  if (from > to) return null;
  return { from, to };
}

export interface GeneratedEntry {
  date: string;
  staffId: string;
  ruleId: string;
  title: string;
  kind: AvailabilityKind;
  /** Local wall-clock start/end, e.g. 2026-10-01T12:00 (no Z — club-local). */
  startLocal: string;
  endLocal: string;
}

/**
 * Expand a weekly pattern into concrete availability entries.
 * `countFrom`/`countTo` bound the expansion (inclusive, yyyy-mm-dd).
 * Deterministic: same inputs → same entries, so previews equal saves.
 */
export function expandAvailabilityPattern(
  rule: Pick<AvailabilityRule, 'id' | 'staffId' | 'label' | 'pattern' | 'effectiveFrom' | 'effectiveTo' | 'scope'> & { isActive?: boolean },
  countFrom: string,
  countTo: string,
  opts?: { kind?: AvailabilityKind; title?: string },
): GeneratedEntry[] {
  const win = ruleWindow(rule, countFrom, countTo);
  if (!win || rule.isActive === false) return [];
  const out: GeneratedEntry[] = [];
  const kind = opts?.kind ?? 'working_hours';
  const title = opts?.title ?? rule.label;

  let cursor = win.from;
  let guard = 0;
  while (cursor <= win.to && guard < 400) {
    const weekday = isoWeekdayOf(cursor);
    const day = rule.pattern.find((p) => p.weekday === weekday);
    for (const w of day?.windows ?? []) {
      out.push({
        date: cursor,
        staffId: rule.staffId,
        ruleId: rule.id,
        title,
        kind,
        startLocal: `${cursor}T${w.start}`,
        endLocal: `${cursor}T${w.end}`,
      });
    }
    cursor = addDaysIso(cursor, 1);
    guard += 1;
  }
  return out;
}

/** 'Copy Monday' — clone one weekday's windows onto another weekday. */
export function copyWindows(
  pattern: DayPattern[],
  fromWeekday: IsoWeekday,
  toWeekdays: IsoWeekday[],
): DayPattern[] {
  const source = pattern.find((p) => p.weekday === fromWeekday)?.windows ?? [];
  const clone = () => source.map((w) => ({ ...w }));
  return toWeekdays.map((weekday) => {
    const existing = pattern.find((p) => p.weekday === weekday);
    return { weekday, windows: existing ? clone() : clone() };
  });
}

/** Merge helper for the planner: upsert a day's windows inside a pattern. */
export function upsertDay(pattern: DayPattern[], day: DayPattern): DayPattern[] {
  const rest = pattern.filter((p) => p.weekday !== day.weekday);
  return [...rest, day].sort((a, b) => a.weekday - b.weekday);
}

/* ------------------------------------------------------------------ *
 * Conflicts
 * ------------------------------------------------------------------ */

export interface ConflictRecord {
  id?: string;
  /** open → acknowledged → resolved. */
  status?: 'open' | 'acknowledged' | 'resolved';
  staffId: string;
  staffName?: string;
  /** The blocking diary entry (holiday, unavailability…). */
  blocker: DiaryEvent;
  /** The overlapping session allocation or task. */
  assignment: DiaryEvent;
  overlapMinutes: number;
  message: string;
}

export function overlapMinutes(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const s = Math.max(Date.parse(aStart), Date.parse(bStart));
  const e = Math.min(Date.parse(aEnd), Date.parse(bEnd));
  return Math.max(0, Math.round((e - s) / 60_000));
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** The exact wording required by the availability conflict spec. */
export function conflictMessage(
  staffName: string,
  blocker: Pick<DiaryEvent, 'start' | 'end' | 'kind'>,
  assignment: Pick<DiaryEvent, 'start' | 'end' | 'title'>,
): string {
  const minutes = overlapMinutes(blocker.start, blocker.end, assignment.start, assignment.end);
  const reason = DIARY_KINDS[blocker.kind as AvailabilityKind]?.label ?? 'Unavailability';
  return `${staffName} is unavailable from ${fmtTime(blocker.start)} to ${fmtTime(
    blocker.end,
  )} because of ${reason}. ${assignment.title} overlaps this period by ${minutes} minutes.`;
}

/**
 * Conflicts between blocking unavailability and booked sessions/tasks.
 * System events (sessions/tasks) never conflict with each other here — the
 * session overlap guard lives in the DB; this checks diary-vs-assignment.
 */
export function detectConflicts(events: DiaryEvent[]): ConflictRecord[] {
  const out: ConflictRecord[] = [];
  const blockers = events.filter((e) => {
    if (e.kind === 'session' || e.kind === 'task') return false;
    return isUnavailableKind(e.kind as AvailabilityKind);
  });
  const assignments = events.filter((e) => e.kind === 'session' || e.kind === 'task');
  for (const blocker of blockers) {
    for (const assignment of assignments) {
      if (blocker.staffId !== assignment.staffId) continue;
      const mins = overlapMinutes(blocker.start, blocker.end, assignment.start, assignment.end);
      if (mins <= 0) continue;
      out.push({
        staffId: blocker.staffId,
        staffName: blocker.staffName ?? assignment.staffName,
        blocker,
        assignment,
        overlapMinutes: mins,
        message: conflictMessage(
          blocker.staffName ?? 'This coach',
          blocker,
          assignment,
        ),
      });
    }
  }
  return out.sort((a, b) => Date.parse(a.blocker.start) - Date.parse(b.blocker.start));
}

/* ------------------------------------------------------------------ *
 * Overlap layout — side-by-side columns like Outlook
 * ------------------------------------------------------------------ */

export interface PositionedEvent {
  event: DiaryEvent;
  /** Zero-based lane among simultaneous events. */
  lane: number;
  /** How many lanes the visual cluster spans (events overlap transitively). */
  lanes: number;
}

/**
 * Assign side-by-side lanes for events sharing time in one column.
 * Greedy scan: events that overlap transitively form a cluster; each gets a
 * lane and the cluster width, so Outlook-style half/half rendering emerges.
 */
export function layoutOverlaps(events: DiaryEvent[]): PositionedEvent[] {
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start) || Date.parse(a.end) - Date.parse(b.end),
  );
  const out: PositionedEvent[] = [];
  let cluster: DiaryEvent[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const lanes = new Map<string, number>();
    for (const ev of cluster) {
      let lane = laneEnds.findIndex((end) => Date.parse(ev.start) >= end);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(Date.parse(ev.end));
      } else {
        laneEnds[lane] = Date.parse(ev.end);
      }
      lanes.set(ev.id, lane);
    }
    for (const ev of cluster) {
      out.push({ event: ev, lane: lanes.get(ev.id) ?? 0, lanes: laneEnds.length });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const ev of sorted) {
    if (cluster.length && Date.parse(ev.start) >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, Date.parse(ev.end));
  }
  flush();
  return out;
}

/* ------------------------------------------------------------------ *
 * Chargeable-time validation (§11) — mirrors guard_chargeable_time_entry()
 * ------------------------------------------------------------------ */

export interface ChargeableInput {
  staffId: string;
  organisationId: string;
  sessionId?: string | null;
  taskId?: string | null;
  start: string;
  end: string;
  rateCents: number;
}

export interface ChargeableContext {
  assigned: boolean;
  withinAssignment: boolean;
  rateCardValid: boolean;
  inOrganisation: boolean;
  duplicate: boolean;
  invoiced: boolean;
}

export function validateChargeable(input: ChargeableInput, ctx: ChargeableContext): string[] {
  const errors: string[] = [];
  if (!ctx.inOrganisation) errors.push('Staff member does not belong to this organisation.');
  if (!ctx.assigned) errors.push('The staff member was not assigned to this session or task.');
  if (ctx.assigned && !ctx.withinAssignment) {
    errors.push('Chargeable time must fall inside the assigned window.');
  }
  if (input.rateCents > 0 && !ctx.rateCardValid) {
    errors.push('No rate card was valid on the event date for this rate.');
  }
  if (ctx.duplicate) errors.push('A chargeable record already exists for this event.');
  if (ctx.invoiced) errors.push('The same time has already been invoiced.');
  if (Date.parse(input.end) <= Date.parse(input.start)) errors.push('End time must be after start time.');
  return errors;
}
