/**
 * First-class season/cohort grouping shared by weekly patterns, program runs,
 * and the dated sessions generated from those runs.
 */
export type BatchGroupingStatus = 'upcoming' | 'active' | 'completed' | 'archived';

export interface BatchGrouping {
  id: string;
  name: string;
  code: string;
  startDate: string;
  endDate: string;
  status: BatchGroupingStatus;
  description?: string;
}

/** A concrete run of a reusable program blueprint. */
export interface ProgramRun {
  id: string;
  blueprintId: string;
  batchGroupingId: string;
  name: string;
  startDate: string;
  endDate: string;
  status?: 'active' | 'paused' | 'ended';
}

/** A reusable weekly pattern assigned to the cohort it generates. */
export interface WeeklyPattern {
  id: string;
  batchGroupingId: string;
  name: string;
  startDate: string;
  endDate: string;
}

/**
 * Date range and grouping helpers intentionally use ISO calendar dates so they
 * can be shared by browser forms, tests, and recurrence previews.
 */
export function batchGroupingStatusForDates(
  startDate: string,
  endDate: string,
  today = new Date().toISOString().slice(0, 10),
): BatchGroupingStatus {
  if (endDate < today) return 'completed';
  if (startDate > today) return 'upcoming';
  return 'active';
}

export function batchGroupingContainsRange(
  grouping: Pick<BatchGrouping, 'startDate' | 'endDate'>,
  startDate: string,
  endDate: string,
): boolean {
  return startDate >= grouping.startDate && endDate <= grouping.endDate && endDate >= startDate;
}

export interface ProgramRunBatchLink {
  id: string;
  batchGroupingId: string;
}

/** Stable grouping utility used by pipeline views and their tests. */
export function groupProgramRunsByBatchGrouping<T extends ProgramRunBatchLink>(
  runs: T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const run of runs) {
    const rows = grouped.get(run.batchGroupingId) ?? [];
    rows.push(run);
    grouped.set(run.batchGroupingId, rows);
  }
  return grouped;
}
