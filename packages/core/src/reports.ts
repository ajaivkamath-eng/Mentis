/* Reporting: Member 360 aggregates, coach hours, match analytics, dashboards. */
import type { AttendanceRecord, MatchRecord, TimeEntry } from './domain.js';
import { money } from './billing.js';
import { winLoss, matchForm, ratingTrend, rankMovement } from './competition.js';

export function attendancePct(records: AttendanceRecord[]): number {
  if (!records.length) return 0;
  const present = records.filter((r) => r.status === 'present' || r.status === 'late').length;
  return Math.round((present / records.length) * 100);
}
export interface CoachHoursRow { staffId: string; planned: number; actual: number; workLog: number; total: number }
export function coachHours(entries: Pick<TimeEntry, 'staffId' | 'hours' | 'kind'>[], workLogByStaff: Record<string, number>): CoachHoursRow[] {
  const byStaff = new Map<string, CoachHoursRow>();
  for (const e of entries) {
    const row = byStaff.get(e.staffId) ?? { staffId: e.staffId, planned: 0, actual: 0, workLog: 0, total: 0 };
    if (e.kind === 'planned') row.planned += e.hours;
    else if (e.kind !== 'standby') row.actual += e.hours;
    byStaff.set(e.staffId, row);
  }
  for (const [staffId, hours] of Object.entries(workLogByStaff)) {
    const row = byStaff.get(staffId) ?? { staffId, planned: 0, actual: 0, workLog: 0, total: 0 };
    row.workLog = hours;
    byStaff.set(staffId, row);
  }
  for (const row of byStaff.values()) row.total = row.planned + row.actual + row.workLog;
  return [...byStaff.values()];
}
export interface MemberAnalytics {
  winLoss: { wins: number; losses: number; draws: number };
  form: ('W' | 'L' | 'D')[];
  attendancePct: number;
  headToHead: Record<string, { W: number; L: number }>;
}
export function memberAnalytics(matches: MatchRecord[], attendance: AttendanceRecord[]): MemberAnalytics {
  const headToHead: Record<string, { W: number; L: number }> = {};
  for (const m of matches) {
    const h = headToHead[m.opponent] ?? { W: 0, L: 0 };
    if (m.result === 'W') h.W += 1;
    else if (m.result === 'L') h.L += 1;
    headToHead[m.opponent] = h;
  }
  return { winLoss: winLoss(matches), form: matchForm(matches), attendancePct: attendancePct(attendance), headToHead };
}
export interface CoachPerformance {
  staffId: string; plannedHours: number; actualHours: number;
  sessionsLed: number; avgAttendancePct: number; feedbackCount: number; tasterConversions: number;
}
export function coachPerformance(input: Omit<CoachPerformance, 'staffId'> & { staffId: string }): CoachPerformance {
  return input;
}
export function tasterFunnel(tasters: { status: string }[]): Record<string, number> {
  const out: Record<string, number> = { requested: 0, tried: 0, converted: 0 };
  for (const t of tasters) {
    if (t.status === 'requested') out.requested += 1;
    if (t.status === 'approved' || t.status === 'attended') out.tried += 1;
    if (t.status === 'converted') { out.tried += 1; out.converted += 1; }
  }
  return out;
}
export function csvOf(rows: Record<string, string | number>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((r) => headers.map((h) => q(r[h])).join(','))].join('\n');
}
export function gbp(cents: number): string {
  return `£${(cents / 100).toFixed(2)}`;
}
export function earningFor(hours: number, rateCents: number): string {
  return gbp(money(hours, rateCents));
}

/* Phase 6 — termly progress report content (rule 31: coach approves first). */
export interface ProgressInput {
  attendance: AttendanceRecord[];
  ratingSeries: Record<string, { at: string; score: number }[]>;
  rankingsByPlatform: Record<string, { source: string; value: number; asOfDate: string }[]>;
  matches: MatchRecord[];
  goals: { status: string }[];
}
export interface ProgressSummary {
  attendancePct: number;
  ratingTrends: Record<string, 'up' | 'down' | 'flat'>;
  rankMovement: Record<string, 'up' | 'down' | 'same' | 'unknown'>;
  winLoss: { wins: number; losses: number; draws: number };
  form: ('W' | 'L' | 'D')[];
  goals: Record<string, number>;
}
export function buildProgressSummary(input: ProgressInput): ProgressSummary {
  const ratingTrends: ProgressSummary['ratingTrends'] = {};
  for (const [k, v] of Object.entries(input.ratingSeries)) ratingTrends[k] = ratingTrend(v);
  const rankMovementOut: ProgressSummary['rankMovement'] = {};
  for (const [k, v] of Object.entries(input.rankingsByPlatform)) rankMovementOut[k] = rankMovement(v);
  const goals: Record<string, number> = {};
  for (const g of input.goals) goals[g.status] = (goals[g.status] ?? 0) + 1;
  return {
    attendancePct: attendancePct(input.attendance),
    ratingTrends, rankMovement: rankMovementOut,
    winLoss: winLoss(input.matches), form: matchForm(input.matches), goals,
  };
}
