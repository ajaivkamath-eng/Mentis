import { describe, expect, it } from 'vitest';
import {
  batchGroupingContainsRange,
  batchGroupingStatusForDates,
  groupProgramRunsByBatchGrouping,
  type BatchGrouping,
  type ProgramRun,
  type WeeklyPattern,
} from '@mentis/core';

describe('batch grouping model', () => {
  const academicYear: BatchGrouping = {
    id: 'ay-2627',
    name: '2026/2027 Academic Year',
    code: 'AY-2627',
    startDate: '2026-09-01',
    endDate: '2027-08-31',
    status: 'active',
  };

  it('classifies a grouping from its ISO date window', () => {
    expect(batchGroupingStatusForDates('2027-09-01', '2028-08-31', '2026-10-03')).toBe('upcoming');
    expect(batchGroupingStatusForDates('2026-09-01', '2027-08-31', '2026-10-03')).toBe('active');
    expect(batchGroupingStatusForDates('2025-09-01', '2026-08-31', '2026-10-03')).toBe('completed');
  });

  it('requires the complete generated range to fit inside the grouping', () => {
    expect(batchGroupingContainsRange(academicYear, '2026-10-01', '2027-07-31')).toBe(true);
    expect(batchGroupingContainsRange(academicYear, '2026-08-31', '2027-07-31')).toBe(false);
    expect(batchGroupingContainsRange(academicYear, '2027-09-01', '2027-08-31')).toBe(false);
  });

  it('groups program runs by their required grouping id', () => {
    const runs: ProgramRun[] = [
      { id: 'run-a', blueprintId: 'bp-a', batchGroupingId: academicYear.id, name: 'Autumn Series', startDate: '2026-10-01', endDate: '2027-07-31' },
      { id: 'run-b', blueprintId: 'bp-b', batchGroupingId: academicYear.id, name: 'Winter Series', startDate: '2026-11-01', endDate: '2027-06-30' },
      { id: 'run-c', blueprintId: 'bp-c', batchGroupingId: 'ay-2526', name: 'Legacy Series', startDate: '2025-10-01', endDate: '2026-07-31' },
    ];
    const grouped = groupProgramRunsByBatchGrouping(runs);
    expect(grouped.get(academicYear.id)?.map((run) => run.id)).toEqual(['run-a', 'run-b']);
    expect(grouped.get('ay-2526')?.map((run) => run.id)).toEqual(['run-c']);
  });

  it('exposes required grouping links on weekly patterns and sessions', () => {
    const pattern: WeeklyPattern = {
      id: 'pattern-1', batchGroupingId: academicYear.id,
      name: 'U13 Monday', startDate: academicYear.startDate, endDate: academicYear.endDate,
    };
    expect(pattern.batchGroupingId).toBe(academicYear.id);
  });
});
