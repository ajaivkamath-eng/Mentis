import { Filter, Tag } from 'lucide-react';
import type { BatchGrouping, BatchGroupingStatus } from '@mentis/core';
import { Badge, Select } from '../ui';

export const DEMO_BATCH_GROUPINGS: BatchGrouping[] = [
  {
    id: 'demo-batch-ay-2627',
    name: '2026/2027 Academic Year',
    code: 'AY-2627',
    startDate: '2026-09-01',
    endDate: '2027-08-31',
    status: 'active',
    description: '2026/2027 academic year cohort',
  },
  {
    id: 'demo-batch-aut-26',
    name: 'Autumn Term 2026',
    code: 'AUT-26',
    startDate: '2026-09-01',
    endDate: '2026-12-31',
    status: 'active',
    description: 'Autumn term 2026',
  },
  {
    id: 'demo-batch-sum-27',
    name: 'Summer Camp 2027',
    code: 'SUM-27',
    startDate: '2027-06-01',
    endDate: '2027-08-31',
    status: 'upcoming',
    description: 'Summer camp 2027',
  },
];

export function batchGroupingFromRow(row: any): BatchGrouping {
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    status: row.status as BatchGroupingStatus,
    description: row.description ?? undefined,
  };
}

export function BatchGroupingFilterBar({
  groupings,
  value,
  onChange,
}: {
  groupings: BatchGrouping[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-sm)]">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink">
        <Filter className="size-3.5 text-indigo-600" /> Batch / Season
      </span>
      <Select
        aria-label="Filter by batch or season"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-64 max-w-full flex-1 sm:flex-none"
      >
        <option value="all">🏷️ All Seasons / Batches ({groupings.length})</option>
        {groupings.map((grouping) => (
          <option key={grouping.id} value={grouping.id}>
            {grouping.name} · {grouping.code}
          </option>
        ))}
      </Select>
      <span className="text-[11px] text-ink-faint">
        {value === 'all' ? 'Showing every season' : groupings.find((grouping) => grouping.id === value)?.name ?? 'Selected season'}
      </span>
    </div>
  );
}

export function BatchGroupingBadge({ grouping, label = true }: { grouping?: BatchGrouping | null; label?: boolean }) {
  if (!grouping) {
    return <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700">{label ? 'Batch Tag: ' : ''}—</Badge>;
  }
  return (
    <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700">
      <Tag className="size-3" aria-hidden />
      {label ? `Batch Tag: ${grouping.code}` : grouping.code}
    </Badge>
  );
}

export function SessionLineage({
  grouping,
  blueprint,
  run,
}: {
  grouping?: BatchGrouping | null;
  blueprint?: string | null;
  run?: string | null;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-label="Session program lineage">
      <BatchGroupingBadge grouping={grouping} />
      <Badge className="border-slate-200 bg-slate-50 text-slate-600">Blueprint: {blueprint || '—'}</Badge>
      <Badge className="border-slate-200 bg-slate-50 text-slate-600">Run: {run || '—'}</Badge>
    </div>
  );
}
