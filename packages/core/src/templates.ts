/* Session blueprints (templates) — the shared model behind instances.
 *
 * Doctrine: a template describes *what a session is*; a session is an
 * instantiation of it, and a recurring series is a run of instantiations. The
 * preview the console shows is produced by these pure functions, and the
 * database materialiser (`instantiate_session_series` in
 * `supabase/migrations/0013_session_templates.sql`) is written to agree with
 * them occurrence-for-occurrence — "preview = what you get", pinned by
 * `tests/templates.test.ts` and `supabase/tests/session_templates.sql`.
 */
import type { Capacity } from './domain.js';
import { normalizeHolidayKind, type Holiday } from './generator.js';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'fortnightly' | 'monthly' | 'quarterly';
export type TemplateStatus = 'draft' | 'active' | 'archived';
export type SeriesStatus = 'active' | 'paused' | 'ended';

/** One role slot a blueprint expects on every instance. */
export interface TemplateStaffingSlot {
  capacity: Capacity;
  /** null = open slot, filled from the blueprint's default coaches. */
  staffId?: string | null;
  rateCardId?: string | null;
  required: boolean;
  /** Minutes the role starts before / runs after the session window. */
  leadMinutes: number;
  trailMinutes: number;
  notes?: string | null;
}

export interface SessionTemplate {
  id: string;
  organizationId: string;
  code?: string | null;
  name: string;
  description?: string | null;
  venueId: string;
  venueName?: string;
  levelBand?: string | null;
  capacity?: number | null;
  timezone: string;
  /** 'HH:MM' local times. */
  defaultStartTime: string;
  defaultEndTime: string;
  defaultChargeCents?: number | null;
  responsibleCoachId?: string | null;
  leadingCoachId?: string | null;
  assistingCoachId?: string | null;
  status: TemplateStatus;
  version: number;
  tags?: string[];
  staffing?: TemplateStaffingSlot[];
  rosterMemberIds?: string[];
}

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  intervalCount: number;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. Empty = derive from validFrom. */
  byWeekday: number[];
  startTime: string;
  endTime: string;
  timezone: string;
  validFrom: string;
  /** null/absent = open-ended: materialised out to `horizonDays`. */
  validTo?: string | null;
  horizonDays: number;
  maxOccurrences?: number | null;
  skipTermBreaks: boolean;
  skipBankHolidays: boolean;
  skipManualClosures: boolean;
}

export type OccurrenceAction = 'generate' | 'skip_term' | 'skip_bank' | 'skip_manual';

export interface Occurrence {
  date: string;
  action: OccurrenceAction;
  /** ISO instant the instance would start (only meaningful when generating). */
  startsAt?: string;
  endsAt?: string;
  holidayName?: string | null;
  holidayKind?: string | null;
}

export interface OccurrenceSummary {
  generated: number;
  skippedTerm: number;
  skippedBank: number;
  skippedManual: number;
  weeksCovered: number;
  firstDate: string | null;
  lastDate: string | null;
}

/* -------------------------------------------------------------------------- */
/* Time zones                                                                 */
/* -------------------------------------------------------------------------- */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
}

/** Offset of `timeZone` from UTC (minutes, positive east) at that instant. */
export function zoneOffsetMinutes(instantMs: number, timeZone: string): number {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  );
  return (asUtc - instantMs) / 60000;
}

/**
 * Local wall-clock date + time in a zone → UTC instant.
 * Handles BST/GMT: 18:00 London is 17:00Z in July and 18:00Z in January.
 */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const firstGuess = wall - zoneOffsetMinutes(wall, timeZone) * 60000;
  const refined = wall - zoneOffsetMinutes(firstGuess, timeZone) * 60000;
  return new Date(refined).toISOString();
}

/** The local date a UTC instant falls on, in a zone. */
export function zonedDateOf(instant: string | Date, timeZone: string): string {
  const dtf = partsFormatter(timeZone);
  const parts = dtf.formatToParts(typeof instant === 'string' ? new Date(instant) : instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/* -------------------------------------------------------------------------- */
/* Calendar expansion                                                         */
/* -------------------------------------------------------------------------- */

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => isoDate(new Date(day(s).getTime() + n * 86400000));
const isoWeekday = (s: string) => ((day(s).getUTCDay() + 6) % 7) + 1;
const endOfMonth = (s: string) => {
  const d = day(s);
  return isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
};
const startOfMonth = (s: string) => `${s.slice(0, 7)}-01`;
const addMonths = (s: string, n: number) => {
  const d = day(s);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  const target = Math.min(d.getUTCDate(), last.getUTCDate());
  return isoDate(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), target)));
};
const mondayOf = (s: string) => addDays(s, -(isoWeekday(s) - 1));

/** Effective calendar window: open-ended rules stop at the rolling horizon. */
export function recurrenceWindow(rule: Pick<RecurrenceRule, 'validFrom' | 'validTo' | 'horizonDays'>): { from: string; to: string } {
  const horizonEnd = addDays(rule.validFrom, Math.max(0, rule.horizonDays - 1));
  const to = rule.validTo ? (rule.validTo < horizonEnd ? rule.validTo : horizonEnd) : horizonEnd;
  return { from: rule.validFrom, to };
}

export function effectiveWeekdays(rule: Pick<RecurrenceRule, 'byWeekday' | 'validFrom'>): number[] {
  return rule.byWeekday && rule.byWeekday.length ? [...rule.byWeekday].sort((a, b) => a - b) : [isoWeekday(rule.validFrom)];
}

/**
 * Which dates does this pattern fall on? Mirrors `expand_recurrence` in 0013:
 * daily steps, weekly/fortnightly repeat by weekday anchored on the Monday of
 * the start week, monthly/quarterly keep the day-of-month (clamped to the
 * month's last day) and, when weekdays are given, take the first matching
 * weekday on/after that day within the same month.
 */
export function expandRecurrence(
  rule: RecurrenceRule,
  window?: { from?: string; to?: string },
): string[] {
  const from = window?.from ?? rule.validFrom;
  const to = window?.to ?? recurrenceWindow(rule).to;
  if (to < from) return [];

  const step = Math.max(1, rule.intervalCount || 1);
  const out: string[] = [];
  const cap = rule.maxOccurrences && rule.maxOccurrences > 0 ? rule.maxOccurrences : Infinity;
  const push = (d: string) => {
    if (d >= from && d <= to) out.push(d);
    return out.length >= cap;
  };

  if (rule.frequency === 'daily') {
    for (let cursor = from; cursor <= to; cursor = addDays(cursor, step)) {
      if (push(cursor)) break;
    }
    return out;
  }

  if (rule.frequency === 'weekly' || rule.frequency === 'fortnightly' || rule.frequency === 'biweekly') {
    // 'biweekly' is the same two-week step as 'fortnightly' (both appear in the
    // workbook's frequency list) — kept as an alias so neither caller has to know.
    const weeks = step * (rule.frequency === 'weekly' ? 1 : 2);
    const weekdays = effectiveWeekdays(rule);
    for (let week = mondayOf(rule.validFrom); week <= to; week = addDays(week, weeks * 7)) {
      for (const weekday of weekdays) {
        const candidate = addDays(week, weekday - 1);
        if (candidate < rule.validFrom) continue;
        if (push(candidate)) return out;
      }
    }
    return out;
  }

  const targetDay = Number(rule.validFrom.slice(8, 10));
  const weekdays = rule.byWeekday ?? [];
  for (let month = startOfMonth(rule.validFrom); month <= to; month = addMonths(month, step)) {
    const last = endOfMonth(month);
    if (month < startOfMonth(rule.validFrom)) continue;
    let candidate = addDays(month, targetDay - 1);
    if (candidate > last) candidate = last;
    if (weekdays.length) {
      while (candidate <= last && !weekdays.includes(isoWeekday(candidate))) candidate = addDays(candidate, 1);
      if (candidate > last) continue;   // no matching weekday this month — skip it
    }
    if (candidate < rule.validFrom) continue;
    if (push(candidate)) return out;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Occurrence preview (expansion + holiday classification)                     */
/* -------------------------------------------------------------------------- */

function holidayOn(date: string, holidays: Holiday[]): Holiday | null {
  return holidays.find((h) => date >= h.startsOn && date <= h.endsOn) ?? null;
}

/** Mirrors `session_template_occurrences`: expansion + skip decisions. */
export function previewOccurrences(
  rule: RecurrenceRule,
  holidays: Holiday[] = [],
  window?: { from?: string; to?: string },
): Occurrence[] {
  return expandRecurrence(rule, window).map((date) => {
    const holiday = holidayOn(date, holidays);
    const kind = holiday ? normalizeHolidayKind(holiday) : null;
    const skip =
      (kind === 'bank_holiday' && rule.skipBankHolidays) ||
      (kind === 'term_break' && rule.skipTermBreaks) ||
      (kind === 'manual' && rule.skipManualClosures);
    const action: OccurrenceAction = skip
      ? kind === 'bank_holiday' ? 'skip_bank' : kind === 'term_break' ? 'skip_term' : 'skip_manual'
      : 'generate';
    return {
      date,
      action,
      startsAt: zonedDateTimeToUtc(date, rule.startTime, rule.timezone),
      endsAt: zonedDateTimeToUtc(date, rule.endTime, rule.timezone),
      holidayName: holiday?.name ?? null,
      holidayKind: kind,
    };
  });
}

export function summariseOccurrences(occurrences: Occurrence[]): OccurrenceSummary {
  const generated = occurrences.filter((o) => o.action === 'generate');
  const weeks = new Set(generated.map((o) => mondayOf(o.date)));
  return {
    generated: generated.length,
    skippedTerm: occurrences.filter((o) => o.action === 'skip_term').length,
    skippedBank: occurrences.filter((o) => o.action === 'skip_bank').length,
    skippedManual: occurrences.filter((o) => o.action === 'skip_manual').length,
    weeksCovered: weeks.size,
    firstDate: generated[0]?.date ?? null,
    lastDate: generated[generated.length - 1]?.date ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Instantiating the blueprint                                                 */
/* -------------------------------------------------------------------------- */

export interface InstanceDraft {
  templateId: string;
  seriesId?: string | null;
  occurrenceDate: string;
  name: string;
  venueId: string;
  startAt: string;
  endAt: string;
  levelBand?: string | null;
  capacity?: number | null;
  responsibleCoachId?: string | null;
  leadingCoachId?: string | null;
  assistingCoachId?: string | null;
  blueprintVersion: number;
  staffing: { capacity: Capacity; staffId?: string | null; rateCardId?: string | null; plannedStart: string; plannedEnd: string }[];
  rosterMemberIds: string[];
}

/** What the generator would write for one occurrence. Preview = what you get. */
export function materialiseInstance(
  template: SessionTemplate,
  rule: RecurrenceRule,
  occurrence: Occurrence,
  options: { seriesId?: string | null; venueId?: string } = {},
): InstanceDraft {
  const startAt = occurrence.startsAt ?? zonedDateTimeToUtc(occurrence.date, rule.startTime, rule.timezone);
  const endAt = occurrence.endsAt ?? zonedDateTimeToUtc(occurrence.date, rule.endTime, rule.timezone);
  const minutes = (iso: string) => new Date(iso).getTime();
  const shift = (iso: string, mins: number) => new Date(minutes(iso) + mins * 60000).toISOString();

  const staffing = (template.staffing ?? []).map((slot) => ({
    capacity: slot.capacity,
    staffId: slot.staffId ?? defaultCoachFor(template, slot.capacity),
    rateCardId: slot.rateCardId ?? null,
    plannedStart: shift(startAt, -(slot.leadMinutes ?? 0)),
    plannedEnd: shift(endAt, slot.trailMinutes ?? 0),
  }));

  return {
    templateId: template.id,
    seriesId: options.seriesId ?? null,
    occurrenceDate: occurrence.date,
    name: template.name,
    venueId: options.venueId ?? template.venueId,
    startAt,
    endAt,
    levelBand: template.levelBand ?? null,
    capacity: template.capacity ?? null,
    responsibleCoachId: template.responsibleCoachId ?? null,
    leadingCoachId: template.leadingCoachId ?? null,
    assistingCoachId: template.assistingCoachId ?? null,
    blueprintVersion: template.version,
    staffing,
    rosterMemberIds: template.rosterMemberIds ?? [],
  };
}

/** Open slots inherit the blueprint's default coach for that role. */
export function defaultCoachFor(template: SessionTemplate, capacity: Capacity): string | null {
  if (capacity === 'lead') return template.leadingCoachId ?? template.responsibleCoachId ?? null;
  if (capacity === 'assistant') return template.assistingCoachId ?? null;
  return null;
}

/** Fields an instance can drift from, in the order the DB trigger records them. */
export const BLUEPRINT_FIELDS = [
  'name', 'venue_id', 'start_at', 'end_at', 'capacity', 'level_band',
  'responsible_coach_id', 'leading_coach_id', 'assisting_coach_id',
] as const;
export type BlueprintField = typeof BLUEPRINT_FIELDS[number];

export interface SessionInstanceLike {
  name?: string | null;
  venueId?: string | null;
  start?: string | null;
  end?: string | null;
  capacity?: number | null;
  levelBand?: string | null;
  responsibleCoachId?: string | null;
  leadingCoachId?: string | null;
  assistingCoachId?: string | null;
  overriddenFields?: string[] | null;
  isException?: boolean | null;
}

/** Which fields this instance has drifted on (mirrors the DB drift trigger). */
export function blueprintDriftFields(instance: SessionInstanceLike, template: SessionTemplate): BlueprintField[] {
  const drifted: BlueprintField[] = [];
  const timeOfDay = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(11, 16) : null);
  if (instance.name != null && instance.name !== template.name) drifted.push('name');
  if (instance.venueId != null && instance.venueId !== template.venueId) drifted.push('venue_id');
  if (timeOfDay(instance.start) && timeOfDay(instance.start) !== template.defaultStartTime) drifted.push('start_at');
  if (timeOfDay(instance.end) && timeOfDay(instance.end) !== template.defaultEndTime) drifted.push('end_at');
  if (instance.capacity != null && instance.capacity !== (template.capacity ?? null)) drifted.push('capacity');
  if (instance.levelBand != null && instance.levelBand !== (template.levelBand ?? null)) drifted.push('level_band');
  return drifted;
}

/* -------------------------------------------------------------------------- */
/* Guards & descriptions                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The client-side mirror of `template_completeness()`: a blueprint is only
 * publishable when these are empty.
 */
export function templateCompleteness(template: Partial<SessionTemplate>): string[] {
  const problems: string[] = [];
  if (!template.name || !template.name.trim()) problems.push('Give the blueprint a name.');
  if (!template.venueId) problems.push('Choose the venue sessions run at.');
  const start = template.defaultStartTime;
  const end = template.defaultEndTime;
  if (!start || !end) problems.push('Set the session start and end time.');
  else if (end <= start) problems.push('The end time must be after the start time.');
  if (!template.timezone) problems.push('Set the session time zone.');
  const slots = template.staffing ?? [];
  const leadSlots = slots.filter((s) => s.capacity === 'lead' || s.capacity === 'assistant');
  if (!leadSlots.length && !template.leadingCoachId && !template.responsibleCoachId) {
    problems.push('Add a lead or assistant slot, or name a default lead coach.');
  }
  if (slots.some((s) => (s.leadMinutes ?? 0) < 0 || (s.trailMinutes ?? 0) < 0)) {
    problems.push('Lead-in / trail time cannot be negative.');
  }
  if (template.capacity != null && template.capacity <= 0) problems.push('Capacity must be greater than zero.');
  return problems;
}

/** One human sentence describing a rule: "Every Monday, 18:00–19:30 …". */
export function describeRecurrence(rule: RecurrenceRule): string {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weekdays = effectiveWeekdays(rule);
  const when = rule.frequency === 'daily'
    ? rule.intervalCount > 1 ? `Every ${rule.intervalCount} days` : 'Every day'
    : rule.frequency === 'monthly'
      ? rule.intervalCount > 1 ? `Every ${rule.intervalCount} months` : 'Every month'
      : rule.frequency === 'quarterly'
        ? 'Every quarter'
        : `${rule.frequency === 'weekly' ? (rule.intervalCount > 1 ? `Every ${rule.intervalCount} weeks` : 'Every week') : 'Every other week'} on ${weekdays.map((d) => names[d - 1]).join(', ')}`;
  const skips: string[] = [];
  if (rule.skipTermBreaks) skips.push('term breaks');
  if (rule.skipBankHolidays) skips.push('bank holidays');
  if (rule.skipManualClosures) skips.push('closures');
  const window = recurrenceWindow(rule);
  const range = `${window.from} → ${rule.validTo ? rule.validTo : `${window.to} (rolling)`}`;
  return `${when}, ${rule.startTime}–${rule.endTime} ${rule.timezone}, ${range}${skips.length ? `, skipping ${skips.join(' + ')}` : ''}`;
}

export interface SeriesSummaryLike {
  status: SeriesStatus;
  instanceCount?: number;
  cancelledInstances?: number;
  exceptionCount?: number;
  nextOccurrenceAt?: string | null;
  lastOccurrenceAt?: string | null;
}

/** Series health in one object, for badges and confirm dialogs. */
export function summariseSeries(series: SeriesSummaryLike): {
  label: string;
  healthy: boolean;
  detail: string;
} {
  const total = series.instanceCount ?? 0;
  const cancelled = series.cancelledInstances ?? 0;
  const drifted = series.exceptionCount ?? 0;
  const live = total - cancelled;
  const label = series.status === 'active' ? 'Active' : series.status === 'paused' ? 'Paused' : 'Ended';
  const parts = [`${live} instance${live === 1 ? '' : 's'}`];
  if (cancelled) parts.push(`${cancelled} cancelled`);
  if (drifted) parts.push(`${drifted} edited off blueprint`);
  if (series.nextOccurrenceAt) parts.push(`next ${series.nextOccurrenceAt.slice(0, 16).replace('T', ' ')}`);
  return { label, healthy: series.status === 'active' && live > 0 && drifted === 0, detail: parts.join(' · ') };
}
