/* Timesheet: planned vs actual, standby hours, billable-increase guardrail. */
import type { SessionInstance, TimeEntry } from './domain.js';

/** Rule 24 — increases need admin review; decreases apply immediately. */
export function adjustTimeEntry(entry: TimeEntry, hours: number): TimeEntry {
  if (hours < 0) throw new Error('hours cannot be negative');
  const increased = hours > entry.hours;
  return { ...entry, hours, pendingReview: increased ? true : entry.pendingReview };
}
export function approveTimeIncrease(entry: TimeEntry): TimeEntry {
  if (!entry.pendingReview) return entry;
  return { ...entry, pendingReview: false };
}

/** §6.7 — planned hours auto-post when the session completes. */
export function postPlannedEntries(session: SessionInstance, date: string, source = 'session-save'): TimeEntry[] {
  return session.assignments.map((a) => ({
    id: `planned-${session.id}-${a.staffId}`,
    staffId: a.staffId, date, start: a.start, end: a.end,
    hours: (Date.parse(a.end) - Date.parse(a.start)) / 3_600_000,
    rateCents: a.rateCents, billable: true, billState: 'unbilled' as const,
    pendingReview: false, kind: 'planned' as const, sessionId: session.id, source,
    rateCardId: a.rateCardId,
  }));
}

/** Rule 21 — cancelled sessions post STANDBY hours (admin may zero before invoicing). */
export function postStandbyEntries(session: SessionInstance, date: string): TimeEntry[] {
  return postPlannedEntries(session, date, 'session-save').map((e) => ({
    ...e, id: e.id.replace('planned-', 'standby-'), kind: 'standby' as const, standbyKept: true,
  }));
}
export function zeroStandby(entry: TimeEntry): TimeEntry {
  if (entry.kind !== 'standby') throw new Error('only standby entries can be zeroed');
  return { ...entry, hours: 0, billable: false, standbyKept: false };
}

export interface HoursSummary { planned: number; actual: number; standby: number; total: number }
/** Per-coach per-period hours: planned vs actual (+ standby). */
export function summarizeHours(entries: TimeEntry[]): HoursSummary {
  const s: HoursSummary = { planned: 0, actual: 0, standby: 0, total: 0 };
  for (const e of entries) {
    if (e.kind === 'planned') s.planned += e.hours;
    else if (e.kind === 'standby') s.standby += e.hours;
    else s.actual += e.hours;
    s.total += e.billable ? e.hours : 0;
  }
  return s;
}
