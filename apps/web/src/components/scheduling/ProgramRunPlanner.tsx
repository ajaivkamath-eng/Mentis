import { Archive, CalendarRange } from 'lucide-react';
import { groupProgramRunsByBatchGrouping, type BatchGrouping } from '@mentis/core';
import { Badge, DataTable, EmptyState, type Column } from '../ui';

export interface ProgramRunPipelineRow {
  id: string;
  batch_grouping_id: string;
  label: string;
  starts_on: string;
  ends_on: string | null;
  status: 'active' | 'paused' | 'ended';
  instance_count: number;
  next_occurrence_at: string | null;
}

function monthAndYear(value?: string | null) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function runWindow(runs: ProgramRunPipelineRow[]) {
  const first = [...runs].map((run) => run.starts_on).sort()[0];
  const last = [...runs].map((run) => run.ends_on || run.starts_on).sort().at(-1);
  return `${monthAndYear(first)} – ${monthAndYear(last)}`;
}

/** Program-run index for a blueprint, presented as one pipeline per cohort. */
export function ProgramRunPlanner<T extends ProgramRunPipelineRow>({
  runs,
  groupings,
  columns,
}: {
  runs: T[];
  groupings: BatchGrouping[];
  columns: Column<T>[];
}) {
  if (!runs.length) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="No program runs yet"
        description="Create a run from this blueprint and assign it to a batch or season grouping."
      />
    );
  }

  const groupingById = new Map(groupings.map((grouping) => [grouping.id, grouping]));
  const groupedRuns = groupProgramRunsByBatchGrouping(runs.map((run) => ({
    id: run.id,
    batchGroupingId: run.batch_grouping_id,
    run,
  })));
  const sections = [...groupedRuns.entries()]
    .map(([groupingId, entries]) => {
      const rows = entries.map((entry) => entry.run);
      return {
        grouping: groupingById.get(groupingId) ?? {
          id: groupingId,
          name: 'Unassigned / legacy grouping',
          code: 'LEGACY',
          startDate: rows[0]?.starts_on ?? '',
          endDate: rows.at(-1)?.ends_on ?? rows[0]?.starts_on ?? '',
          status: 'archived' as const,
        },
        runs: rows,
      };
    })
    .sort((a, b) => b.grouping.startDate.localeCompare(a.grouping.startDate));

  return (
    <div className="space-y-3">
      {sections.map(({ grouping, runs: grouped }) => (
        <section key={grouping.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <header className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900">{grouping.name} Pipeline</h4>
                <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700">{grouping.code}</Badge>
                {grouping.status === 'archived' ? (
                  <Badge tone="neutral" icon={<Archive className="size-3" />}>Archived</Badge>
                ) : (
                  <Badge tone={grouping.status === 'active' ? 'success' : grouping.status === 'upcoming' ? 'info' : 'neutral'}>
                    {grouping.status}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Runs: {runWindow(grouped)} · {grouped.length} {grouped.length === 1 ? 'program run' : 'program runs'}
              </p>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              {grouped.reduce((total, run) => total + (run.instance_count ?? 0), 0)} sessions
            </span>
          </header>
          <DataTable
            data={grouped}
            columns={columns}
            rowKey={(run) => run.id}
            dense
            animateRows={grouped.length < 10}
            className="rounded-none border-0 shadow-none"
            empty={<span className="px-4 text-xs text-slate-500">No runs in this pipeline.</span>}
          />
        </section>
      ))}
    </div>
  );
}
