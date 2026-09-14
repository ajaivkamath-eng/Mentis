/* Phase 6 — 1-2-1 booking PWA (rule 30) + sparring matcher + auto suggestions. */
import type { BookingDef, BookingSlotDef, Task } from './domain.js';
import { overlaps } from './scheduling.js';

/** Rule 30 — conflict-checked at booking; fixed price; approval-gated; 24h window default. */
export function validateBooking(
  slot: BookingSlotDef, startsAt: string,
  coachSessions: { start: string; end: string }[],
  memberEntries: { eventId: string }[] = [],
): string[] {
  const errors: string[] = [];
  if (slot.status !== 'open') errors.push('slot is not open');
  const end = new Date(Date.parse(startsAt) + slot.durationMinutes * 60_000).toISOString();
  if (coachSessions.some((s) => overlaps(s.start, s.end, startsAt, end)))
    errors.push('coach has a conflicting session');
  void memberEntries;
  return errors;
}
export function bookingToTask(booking: BookingDef, slot: BookingSlotDef, customerId: string): Omit<Task, 'id' | 'organizationId'> {
  return {
    title: `1-2-1 with member ${booking.memberId}`,
    type: 'oneOnOne', assigneeId: slot.coachId, dueAt: booking.startsAt,
    status: 'todo', amountCents: slot.fixedPriceCents,
    customerId, chargeableToCustomer: true,
  };
}
export function withinCancellationWindow(booking: BookingDef, now = new Date().toISOString()): boolean {
  const ms = Date.parse(booking.startsAt) - Date.parse(now);
  return ms >= booking.cancellationWindowHours * 3_600_000;
}

export interface SparCandidate { memberId: string; rankBand: number; handedness?: string; style?: string; age: number }
export interface SparPreferences { rankBand: number; handedness?: string; styleComplement?: string[] }
/** Sparring-partner matcher: rank band ±1, handedness preference, style complement, age. */
export function suggestPartners(candidates: SparCandidate[], seeker: SparPreferences, age: number): SparCandidate[] {
  return candidates
    .filter((c) => Math.abs(c.rankBand - seeker.rankBand) <= 1)
    .sort((a, b) => {
      const score = (c: SparCandidate) =>
        (seeker.handedness && c.handedness === seeker.handedness ? 2 : 0) +
        (seeker.styleComplement?.includes(c.style ?? '') ? 2 : 0) -
        Math.abs(c.age - age) / 10 -
        Math.abs(c.rankBand - seeker.rankBand);
      return score(b) - score(a);
    });
}

export interface SuggestibleMember { memberId: string; age: number; rankBand: number }
export interface EventCriteria { ageMin: number; ageMax: number; rankMin: number; rankMax: number }
/** Auto event suggestions (rules engine; LLM later) — coach confirms. */
export function autoSuggest(members: SuggestibleMember[], criteria: EventCriteria): SuggestibleMember[] {
  return members.filter(
    (m) => m.age >= criteria.ageMin && m.age <= criteria.ageMax &&
      m.rankBand >= criteria.rankMin && m.rankBand <= criteria.rankMax,
  );
}
