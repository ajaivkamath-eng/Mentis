/* Weekly-schedule generation with holiday exceptions + conflict checks
 * (rules 16–18). Venue concurrency default 1; back-to-back allowed. */
export type Holiday = { kind: 'term_break' | 'bank_holiday' | 'manual'; startsOn: string; endsOn: string; name?: string };
export type ScheduleStaff = { staffId: string; capacity: 'lead' | 'assistant' | 'sparrer'; rateCardId?: string };
export type WeeklySchedule = {
  id: string; venueId: string; dayOfWeek: number; validFrom: string; validTo: string;
  startTime: string; endTime: string; staff: ScheduleStaff[];
  name?: string; levelBand?: string; capacity?: number;
};
export type GeneratedInstance = {
  date: string; venueId: string; start: string; end: string;
  scheduleId: string; staff: ScheduleStaff[];
};
export type Conflict = { type: 'venue' | 'staff'; date: string; message: string; existing?: GeneratedInstance };
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const inRange = (date: string, h: Holiday) => date >= h.startsOn && date <= h.endsOn;
export function generateSchedule(schedule: WeeklySchedule, holidays: Holiday[] = []): GeneratedInstance[] {
  const out: GeneratedInstance[] = [];
  for (const d = day(schedule.validFrom); iso(d) <= schedule.validTo; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = iso(d);
    if (d.getUTCDay() !== schedule.dayOfWeek || holidays.some((h) => inRange(date, h))) continue;
    out.push({
      date, venueId: schedule.venueId,
      start: `${date}T${schedule.startTime}:00Z`, end: `${date}T${schedule.endTime}:00Z`,
      scheduleId: schedule.id, staff: schedule.staff,
    });
  }
  return out;
}
function overlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}
export function findConflicts(candidate: GeneratedInstance, existing: GeneratedInstance[], venueLimit = 1): Conflict[] {
  const conflicts: Conflict[] = [];
  const sameVenue = existing.filter((e) => e.venueId === candidate.venueId && overlap(e.start, e.end, candidate.start, candidate.end));
  if (sameVenue.length >= venueLimit)
    conflicts.push({ type: 'venue', date: candidate.date, message: `venue ${candidate.venueId} exceeds concurrency limit ${venueLimit}`, existing: sameVenue[0] });
  for (const staff of candidate.staff) {
    const hit = existing.find((e) =>
      e.date === candidate.date &&
      e.staff.some((s) => s.staffId === staff.staffId) &&
      overlap(e.start, e.end, candidate.start, candidate.end));
    if (hit) conflicts.push({ type: 'staff', date: candidate.date, message: `staff ${staff.staffId} has overlapping session`, existing: hit });
  }
  return conflicts;
}
/** Blocked at save with conflicting sessions listed (rule 16–18). */
export function assertNoConflicts(candidate: GeneratedInstance, existing: GeneratedInstance[], venueLimit = 1): void {
  const conflicts = findConflicts(candidate, existing, venueLimit);
  if (conflicts.length)
    throw new Error(`conflicts: ${conflicts.map((c) => c.message).join('; ')}`);
}
