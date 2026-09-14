/* Staffing, breach & conflict logic (rules 9, 17, 18). */
import type { Capacity, SessionInstance, StaffingColour } from './domain.js';

export function staffingColour(
  session: SessionInstance,
  unavailableStaffIds: Set<string>,
): StaffingColour {
  const missingCoach = session.assignments.some(
    (a) => (a.capacity === 'lead' || a.capacity === 'assistant') && unavailableStaffIds.has(a.staffId),
  );
  const missingSparrer = session.assignments.some(
    (a) => a.capacity === 'sparrer' && unavailableStaffIds.has(a.staffId),
  );
  return missingCoach ? 'RED' : missingSparrer ? 'AMBER' : 'GREEN';
}

/** Half-open overlap: back-to-back (end == next start) is allowed (rule 18). */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}

const rank: Record<StaffingColour, number> = { GREEN: 0, AMBER: 1, RED: 2 };
/** Rule 9 — worst-wins roll-up across sessions/days/weeks/months/quarters. */
export function rollupColour(colours: StaffingColour[]): StaffingColour {
  let worst: StaffingColour = 'GREEN';
  for (const c of colours) if (rank[c] > rank[worst]) worst = c;
  return worst;
}

export interface StaffBreach {
  staffId: string;
  capacity: Capacity;
  colour: StaffingColour;
}
/** Which expected staff are missing, and the resulting session colour. */
export function detectBreach(
  expected: { staffId: string; capacity: Capacity }[],
  unavailableStaffIds: Set<string>,
): { colour: StaffingColour; missing: StaffBreach[] } {
  const missing = expected
    .filter((e) => unavailableStaffIds.has(e.staffId))
    .map((e) => ({
      staffId: e.staffId,
      capacity: e.capacity,
      colour: (e.capacity === 'sparrer' ? 'AMBER' : 'RED') as StaffingColour,
    }));
  return { colour: rollupColour(missing.map((m) => m.colour)), missing };
}

/** Rule 17 — venue concurrency: simultaneous sessions must not exceed the limit. */
export function venueConcurrencyBreach(
  candidate: { start: string; end: string },
  existingAtVenue: { start: string; end: string }[],
  limit: number,
): boolean {
  const overlapping = existingAtVenue.filter((e) => overlaps(e.start, e.end, candidate.start, candidate.end));
  return overlapping.length >= limit;
}

/** Rule 18 — a staff member may not hold overlapping sessions in any capacity. */
export function staffOverlapBreach(
  staffId: string,
  candidate: { start: string; end: string },
  existingForStaff: { start: string; end: string }[],
): boolean {
  return existingForStaff.some((e) => overlaps(e.start, e.end, candidate.start, candidate.end));
}

export interface SubstituteCandidate {
  staffId: string;
  capacity: Capacity;
  available: boolean;
  conflictFree: boolean;
  venueMatched: boolean;
}
/** Rule §6.17 — substitute quick-pick: role-fit, available, conflict-free, venue-matched. */
export function rankSubstitutes(
  candidates: SubstituteCandidate[],
  needed: Capacity,
): SubstituteCandidate[] {
  return candidates
    .filter((c) => c.capacity === needed && c.available && c.conflictFree)
    .sort((a, b) => Number(b.venueMatched) - Number(a.venueMatched));
}
