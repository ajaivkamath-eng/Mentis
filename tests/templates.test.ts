import { describe, expect, it } from 'vitest';
import {
  blueprintDriftFields,
  describeRecurrence,
  effectiveWeekdays,
  expandRecurrence,
  materialiseInstance,
  previewOccurrences,
  recurrenceWindow,
  summariseOccurrences,
  summariseSeries,
  templateCompleteness,
  zonedDateOf,
  zonedDateTimeToUtc,
  type Holiday,
  type RecurrenceRule,
  type SessionTemplate,
} from '@mentis/core';

const rule = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: 'weekly',
  intervalCount: 1,
  byWeekday: [1],                 // Monday
  startTime: '18:00',
  endTime: '19:30',
  timezone: 'Europe/London',
  validFrom: '2026-02-02',        // a Monday
  validTo: '2026-05-31',
  horizonDays: 90,                // matches the 90-day horizon used by the DB suite
  skipTermBreaks: true,
  skipBankHolidays: true,
  skipManualClosures: true,
  ...over,
});

const template = (over: Partial<SessionTemplate> = {}): SessionTemplate => ({
  id: 'tpl-1',
  organizationId: 'org-1',
  name: 'U13 Development',
  venueId: 'venue-a',
  venueName: 'Kingfisher Hall A',
  levelBand: 'U13',
  capacity: 16,
  timezone: 'Europe/London',
  defaultStartTime: '18:00',
  defaultEndTime: '19:30',
  leadingCoachId: 'coach-1',
  status: 'active',
  version: 2,
  staffing: [
    { capacity: 'lead', staffId: 'coach-1', rateCardId: 'rc-1', required: true, leadMinutes: 15, trailMinutes: 0 },
  ],
  rosterMemberIds: ['m1', 'm2'],
  ...over,
});

/* The seeded UK closures used by the DB suite, so both agree. */
const holidays: Holiday[] = [
  { name: 'February half-term', kind: 'term_break', startsOn: '2026-02-16', endsOn: '2026-02-20' },
  { name: 'Easter holidays', kind: 'term_break', startsOn: '2026-03-30', endsOn: '2026-04-10' },
  { name: 'Early May bank holiday', kind: 'bank_holiday', startsOn: '2026-05-04', endsOn: '2026-05-04' },
  { name: 'May half-term', kind: 'term_break', startsOn: '2026-05-25', endsOn: '2026-05-29' },
];

describe('blueprint recurrence expansion (parity with expand_recurrence)', () => {
  it('expands weekly patterns on the chosen weekdays', () => {
    expect(expandRecurrence(rule(), { to: '2026-02-28' })).toEqual([
      '2026-02-02', '2026-02-09', '2026-02-16', '2026-02-23',
    ]);
  });

  it('expands multi-weekday patterns in calendar order', () => {
    expect(expandRecurrence(rule({ byWeekday: [3, 1] }), { to: '2026-02-15' })).toEqual([
      '2026-02-02', '2026-02-04', '2026-02-09', '2026-02-11',
    ]);
  });

  it("treats 'biweekly' as the same two-week step as 'fortnightly'", () => {
    expect(expandRecurrence(rule({ frequency: 'biweekly' }), { to: '2026-03-02' })).toEqual(
      expandRecurrence(rule({ frequency: 'fortnightly' }), { to: '2026-03-02' }),
    );
  });

  it('steps fortnightly patterns every other week', () => {
    expect(expandRecurrence(rule({ frequency: 'fortnightly' }), { to: '2026-03-02' })).toEqual([
      '2026-02-02', '2026-02-16', '2026-03-02',
    ]);
  });

  it('keeps the day-of-month for monthly patterns, clamping short months', () => {
    const monthly = rule({ frequency: 'monthly', byWeekday: [], validFrom: '2026-01-31', validTo: null, horizonDays: 120 });
    expect(expandRecurrence(monthly)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('takes the first matching weekday when a monthly rule names weekdays', () => {
    const monthly = rule({ frequency: 'monthly', byWeekday: [1], validFrom: '2026-01-01', validTo: null, horizonDays: 90 });
    expect(expandRecurrence(monthly)).toEqual(['2026-01-05', '2026-02-02', '2026-03-02']);
  });

  it('defaults the weekday to the start date when none is given', () => {
    expect(effectiveWeekdays(rule({ byWeekday: [] }))).toEqual([1]);
  });

  it('stops an open-ended rule at its rolling horizon', () => {
    const open = rule({ validTo: null, horizonDays: 14 });
    expect(recurrenceWindow(open).to).toBe('2026-02-15');
    expect(expandRecurrence(open).at(-1)).toBe('2026-02-09');
  });
});

describe('blueprint time zones', () => {
  it('places 18:00 London in GMT during winter', () => {
    expect(zonedDateTimeToUtc('2026-01-06', '18:00', 'Europe/London')).toBe('2026-01-06T18:00:00.000Z');
  });

  it('places 18:00 London in BST during summer', () => {
    expect(zonedDateTimeToUtc('2026-07-06', '18:00', 'Europe/London')).toBe('2026-07-06T17:00:00.000Z');
  });

  it('shifts by an hour across the spring DST boundary', () => {
    expect(zonedDateTimeToUtc('2026-03-23', '18:00', 'Europe/London')).toBe('2026-03-23T18:00:00.000Z');
    expect(zonedDateTimeToUtc('2026-03-30', '18:00', 'Europe/London')).toBe('2026-03-30T17:00:00.000Z');
  });

  it('reads the occurrence date back in the blueprint time zone', () => {
    expect(zonedDateOf('2026-07-06T23:30:00.000Z', 'Europe/London')).toBe('2026-07-07');
  });
});

describe('occurrence preview (parity with session_template_occurrences)', () => {
  it('classifies holiday skips so the preview matches the DB suite counts', () => {
    const occurrences = previewOccurrences(rule(), holidays);
    const summary = summariseOccurrences(occurrences);
    expect(summary.generated).toBe(10);
    expect(summary.skippedTerm).toBe(3);
    expect(summary.skippedBank).toBe(0);
    expect(occurrences.filter((o) => o.action === 'skip_term').map((o) => o.date)).toEqual([
      '2026-02-16', '2026-03-30', '2026-04-06',
    ]);
  });

  it('keeps holiday weeks when the skip is switched off', () => {
    const occurrences = previewOccurrences(rule({ skipTermBreaks: false }), holidays);
    expect(summariseOccurrences(occurrences).generated).toBe(13);
  });

  it('names the holiday that blocked a date', () => {
    const skipped = previewOccurrences(rule(), holidays).find((o) => o.action === 'skip_term');
    expect(skipped?.holidayName).toBe('February half-term');
  });
});

describe('instantiating a blueprint', () => {
  it('materialises an instance with DST-correct times and roster', () => {
    const [occurrence] = previewOccurrences(rule(), holidays, { to: '2026-04-27' }).slice(-1);
    const draft = materialiseInstance(template(), rule(), occurrence, { seriesId: 'series-1' });
    expect(draft.startAt).toBe('2026-04-27T17:00:00.000Z');   // BST
    expect(draft.endAt).toBe('2026-04-27T18:30:00.000Z');
    expect(draft.templateId).toBe('tpl-1');
    expect(draft.seriesId).toBe('series-1');
    expect(draft.blueprintVersion).toBe(2);
    expect(draft.rosterMemberIds).toEqual(['m1', 'm2']);
  });

  it('applies the staffing plan with its lead-in time', () => {
    const [occurrence] = previewOccurrences(rule(), holidays, { to: '2026-02-02' });
    const draft = materialiseInstance(template(), rule(), occurrence);
    expect(draft.staffing).toEqual([
      { capacity: 'lead', staffId: 'coach-1', rateCardId: 'rc-1', plannedStart: '2026-02-02T17:45:00.000Z', plannedEnd: '2026-02-02T19:30:00.000Z' },
    ]);
  });

  it('fills an open slot from the blueprint default coach', () => {
    const openSlot = template({
      staffing: [{ capacity: 'lead', staffId: null, required: true, leadMinutes: 0, trailMinutes: 0 }],
    });
    const [occurrence] = previewOccurrences(rule(), holidays, { to: '2026-02-02' });
    expect(materialiseInstance(openSlot, rule(), occurrence).staffing[0].staffId).toBe('coach-1');
  });
});

describe('drift and blueprint health', () => {
  it('detects the fields an instance has drifted on', () => {
    const drifted = blueprintDriftFields({
      name: 'U13 Development (moved)',
      venueId: 'venue-a',
      start: '2026-02-02T17:30:00.000Z',
      end: '2026-02-02T19:00:00.000Z',
      capacity: 16,
      overriddenFields: ['name', 'start_at', 'end_at'],
      isException: true,
    }, template());
    expect(drifted).toEqual(['name', 'start_at', 'end_at']);
  });

  it('reports a clean instance as un-drifted', () => {
    expect(blueprintDriftFields({
      name: 'U13 Development', venueId: 'venue-a',
      start: '2026-02-02T18:00:00.000Z', end: '2026-02-02T19:30:00.000Z', capacity: 16,
    }, template())).toEqual([]);
  });

  it('blocks publishing an incomplete blueprint with actionable problems', () => {
    const problems = templateCompleteness({ name: '  ', venueId: '', defaultStartTime: '19:00', defaultEndTime: '18:00', staffing: [] });
    expect(problems.length).toBeGreaterThanOrEqual(3);
    expect(problems.join(' ')).toContain('name');
    expect(problems.join(' ')).toContain('venue');
    expect(problems.join(' ')).toContain('lead');
  });

  it('accepts a blueprint whose lead comes from a default coach', () => {
    expect(templateCompleteness(template({ staffing: [] }))).toEqual([]);
  });

  it('describes a rule in one sentence', () => {
    const described = describeRecurrence(rule());
    expect(described).toContain('Every week on Monday');
    expect(described).toContain('18:00–19:30');
    expect(described).toContain('skipping term breaks + bank holidays');
  });

  it('summarises series health for badges', () => {
    const summary = summariseSeries({ status: 'active', instanceCount: 10, exceptionCount: 2, cancelledInstances: 1, nextOccurrenceAt: '2026-03-02T18:00:00Z' });
    expect(summary.label).toBe('Active');
    expect(summary.detail).toContain('9 instances');
    expect(summary.detail).toContain('2 edited off blueprint');
    expect(summary.healthy).toBe(false);
  });
});
