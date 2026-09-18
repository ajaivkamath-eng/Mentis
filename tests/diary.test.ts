/* Diary calendar domain: planner expansion, conflict detection + wording,
 * Outlook-style overlap layout, chargeable-time validation. */
import { describe, expect, it } from 'vitest';
import {
  AvailabilityRule,
  DIARY_KINDS,
  DiaryEvent,
  conflictMessage,
  copyWindows,
  detectConflicts,
  expandAvailabilityPattern,
  layoutOverlaps,
  overlapMinutes,
  ruleEffectiveEnd,
  ruleWindow,
  upsertDay,
  validateChargeable,
} from '@mentis/core';

const mondayToFriday: AvailabilityRule = {
  id: 'rule-1',
  staffId: 'coach-a',
  label: 'Regular availability',
  pattern: [
    { weekday: 1, windows: [{ start: '12:00', end: '20:00' }] },
    { weekday: 2, windows: [{ start: '16:00', end: '17:00' }] },
    { weekday: 3, windows: [{ start: '09:00', end: '13:00' }] },
    { weekday: 4, windows: [{ start: '14:00', end: '18:00' }] },
    { weekday: 5, windows: [] },
    { weekday: 6, windows: [] },
    { weekday: 7, windows: [] },
  ],
  effectiveFrom: '2026-10-01', // Thursday
  effectiveTo: '2026-12-31',
  scope: 'custom',
  isActive: true,
};

const ev = (over: Partial<DiaryEvent>): DiaryEvent => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  staffId: 'coach-a',
  title: 'Untitled',
  kind: 'available',
  start: '2026-10-05T10:00:00Z',
  end: '2026-10-05T12:00:00Z',
  sourceType: 'manual',
  ...over,
});

describe('regular availability planner', () => {
  it('generates entries only on pattern weekdays inside the effective range', () => {
    // 2026-10-01 (Thu) → 2026-10-07 (Wed): Thu 14–18, Fri —, Sat/Sun —, Mon 12–20, Tue 16–17, Wed 9–13
    const entries = expandAvailabilityPattern(mondayToFriday, '2026-10-01', '2026-10-07');
    expect(entries.map((e) => [e.date, e.startLocal.slice(11)])).toEqual([
      ['2026-10-01', '14:00'],
      ['2026-10-05', '12:00'],
      ['2026-10-06', '16:00'],
      ['2026-10-07', '09:00'],
    ]);
    expect(entries[0].endLocal).toBe('2026-10-01T18:00');
  });

  it('supports multiple windows per day', () => {
    const rule: AvailabilityRule = {
      ...mondayToFriday,
      pattern: upsertDay(mondayToFriday.pattern, { weekday: 1, windows: [
        { start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' },
      ] }),
    };
    const entries = expandAvailabilityPattern(rule, '2026-10-05', '2026-10-05');
    expect(entries.map((e) => e.startLocal.slice(11))).toEqual(['09:00', '13:00']);
  });

  it('clips the pattern to the requested month window', () => {
    const win = ruleWindow(mondayToFriday, '2026-11-01', '2026-11-30');
    expect(win).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    // Requesting before the rule starts clips to effectiveFrom.
    const early = ruleWindow(mondayToFriday, '2026-09-01', '2026-09-30');
    expect(early).toBeNull();
  });

  it('resolves the one-month preset and indefinite scope', () => {
    expect(ruleEffectiveEnd({ effectiveFrom: '2026-10-01', effectiveTo: null, scope: 'one_month' })).toBe('2026-10-31');
    expect(ruleEffectiveEnd({ effectiveFrom: '2026-10-01', effectiveTo: null, scope: 'indefinite' })).toBeNull();
    // 2026-10 ends 31st — Sep from the 15th ends Oct 14th.
    expect(ruleEffectiveEnd({ effectiveFrom: '2026-09-15', effectiveTo: null, scope: 'one_month' })).toBe('2026-10-14');
  });

  it('copies Monday windows to other days and clears days', () => {
    const source = mondayToFriday.pattern.find((p) => p.weekday === 1)!;
    const merged = copyWindows(mondayToFriday.pattern, 1, [5, 6, 7]);
    for (const d of [5, 6, 7]) {
      expect(merged.find((p) => p.weekday === d)!.windows).toEqual(source.windows);
    }
  });

  it('skips inactive rules', () => {
    expect(expandAvailabilityPattern({ ...mondayToFriday, isActive: false }, '2026-10-01', '2026-10-07')).toEqual([]);
  });
});

describe('conflict detection', () => {
  it('reports holiday vs session with the required message and overlap', () => {
    const holiday = ev({
      id: 'h1', staffId: 'a', staffName: 'Priya', kind: 'holiday',
      title: 'Holiday / annual leave', sourceType: 'manual',
      start: '2026-10-05T16:00:00Z', end: '2026-10-05T18:00:00Z',
    });
    const session = ev({
      id: 's1', staffId: 'a', staffName: 'Priya', kind: 'session', system: true,
      title: 'U11 Juniors', sourceType: 'session',
      start: '2026-10-05T16:00:00Z', end: '2026-10-05T17:00:00Z',
    });
    const conflicts = detectConflicts([holiday, session]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].overlapMinutes).toBe(60);
    expect(conflicts[0].message).toBe(
      'Priya is unavailable from 16:00 to 18:00 because of Holiday / annual leave. ' +
      'U11 Juniors overlaps this period by 60 minutes.',
    );
  });

  it('ignores same-kind overlaps and other staff', () => {
    const holiday = ev({ id: 'h1', staffId: 'a', kind: 'holiday', start: '2026-10-05T16:00:00Z', end: '2026-10-05T18:00:00Z' });
    const otherStaffSession = ev({ id: 's2', staffId: 'b', kind: 'session', start: '2026-10-05T16:30:00Z', end: '2026-10-05T17:30:00Z' });
    const available = ev({ id: 'a1', staffId: 'a', kind: 'available', start: '2026-10-05T16:00:00Z', end: '2026-10-05T18:00:00Z' });
    expect(detectConflicts([holiday, otherStaffSession, available])).toHaveLength(0);
  });

  it('counts partial overlaps and back-to-back as non-conflicting', () => {
    const sick = ev({ id: 'h1', staffId: 'a', kind: 'sick_leave', start: '2026-10-05T09:00:00Z', end: '2026-10-05T10:30:00Z' });
    const session = ev({ id: 's1', staffId: 'a', kind: 'task', start: '2026-10-05T10:30:00Z', end: '2026-10-05T11:30:00Z' });
    expect(detectConflicts([sick, session])).toHaveLength(0);
    expect(overlapMinutes(sick.start, sick.end, '2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z')).toBe(30);
  });
});

describe('overlap layout (Outlook side-by-side)', () => {
  it('gives overlapping events separate lanes and a shared cluster width', () => {
    const a = ev({ id: 'a', start: '2026-10-05T09:00:00Z', end: '2026-10-05T11:00:00Z' });
    const b = ev({ id: 'b', start: '2026-10-05T10:00:00Z', end: '2026-10-05T12:00:00Z' });
    const c = ev({ id: 'c', start: '2026-10-05T14:00:00Z', end: '2026-10-05T15:00:00Z' });
    const positioned = layoutOverlaps([a, b, c]);
    const laneOf = (id: string) => positioned.find((p) => p.event.id === id)!;
    expect(laneOf('a').lane).toBe(0);
    expect(laneOf('b').lane).toBe(1);
    expect(laneOf('a').lanes).toBe(2);
    expect(laneOf('b').lanes).toBe(2);
    // Non-overlapping event spans the full column.
    expect(laneOf('c').lane).toBe(0);
    expect(laneOf('c').lanes).toBe(1);
  });

  it('handles three-way overlaps', () => {
    const base = { start: '2026-10-05T09:00:00Z', end: '2026-10-05T12:00:00Z' };
    const positioned = layoutOverlaps([
      ev({ id: 'a', ...base }),
      ev({ id: 'b', start: '2026-10-05T09:30:00Z', end: '2026-10-05T10:30:00Z' }),
      ev({ id: 'c', start: '2026-10-05T10:00:00Z', end: '2026-10-05T11:00:00Z' }),
    ]);
    expect(positioned.map((p) => p.lane).sort()).toEqual([0, 1, 2]);
    expect(positioned.every((p) => p.lanes === 3)).toBe(true);
  });
});

describe('chargeable-time validation (§11)', () => {
  const good = { staffId: 'a', organisationId: 'org', sessionId: 's1', start: '2026-10-05T15:00:00Z', end: '2026-10-05T16:00:00Z', rateCents: 4500 };
  const okCtx = { assigned: true, withinAssignment: true, rateCardValid: true, inOrganisation: true, duplicate: false, invoiced: false };

  it('accepts a clean record', () => {
    expect(validateChargeable(good, okCtx)).toEqual([]);
  });

  it('rejects every integrity violation', () => {
    const errors = validateChargeable(
      { ...good, end: '2026-10-05T18:00:00Z', rateCents: 9999 },
      { ...okCtx, rateCardValid: false, withinAssignment: false, duplicate: true, invoiced: true, inOrganisation: false, assigned: true },
    );
    expect(errors).toHaveLength(5);
  });

  it('requires assignment for the staff member', () => {
    const errors = validateChargeable(good, { ...okCtx, assigned: false });
    expect(errors).toContain('The staff member was not assigned to this session or task.');
  });

  it('zero-rate (non-chargeable) time skips the rate-card check', () => {
    expect(validateChargeable({ ...good, rateCents: 0 }, { ...okCtx, rateCardValid: false })).toEqual([]);
  });
});

describe('kind metadata', () => {
  it('marks blocking unavailability kinds and system events', () => {
    for (const kind of ['holiday', 'sick_leave', 'personal_appointment', 'out_of_office', 'unavailable_other', 'duty_outside_club'] as const) {
      expect(DIARY_KINDS[kind].blocking).toBe(true);
    }
    expect(DIARY_KINDS.available.bucket).toBe('available');
    expect(DIARY_KINDS.working_hours.bucket).toBe('regular');
    expect(DIARY_KINDS.session.bucket).toBe('session');
  });
});
