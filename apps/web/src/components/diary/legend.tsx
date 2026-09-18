/**
 * Legend (colour-coded event types incl. conflict + chargeable) and the
 * conflict strip that lists diary-vs-booking clashes with their resolution
 * actions. Stripes/patterns and icons back up the colours for
 * colour-vision-deficient users, mirroring the event blocks themselves.
 */
import type { ConflictRecord, DiaryEvent } from '@mentis/core';
import { AlertTriangle, Check, EyeOff, Link2, PoundSterling } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { KIND, fmtMoney, fmtTimeRange } from '../../lib/diary/model';

export function LegendBar({ className, kinds }: { className?: string; kinds?: (keyof typeof KIND)[] }) {
  const shown = kinds ?? (Object.keys(KIND) as (keyof typeof KIND)[]);
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] text-ink-muted', className)}>
      {shown.map((k) => {
        const ks = KIND[k];
        return (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-3 w-4 rounded-sm border"
              style={{
                backgroundColor: ks.soft,
                borderLeft: `3px solid ${ks.color}`,
                backgroundImage: ks.striped ? `repeating-linear-gradient(-45deg, transparent 0 3px, color-mix(in srgb, ${ks.color} 25%, transparent) 3px 6px)` : undefined,
              }}
            />
            {ks.label}
          </span>
        );
      })}
      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-4 rounded-sm border border-[var(--danger)] bg-danger-soft" />Conflict</span>
      <span className="inline-flex items-center gap-1.5"><PoundSterling className="size-3 text-success" />Chargeable</span>
      <span className="ml-auto hidden items-center gap-1 text-ink-faint md:inline-flex"><EyeOff className="size-3" />striped = blocks coaching</span>
    </div>
  );
}

export function ConflictStrip({
  conflicts, onAcknowledge, onResolve, onJump,
}: {
  conflicts: ConflictRecord[];
  onAcknowledge: (c: ConflictRecord) => void;
  onResolve: (c: ConflictRecord) => void;
  onJump: (c: ConflictRecord) => void;
}) {
  if (conflicts.length === 0) return null;
  return (
    <section
      aria-label="Availability conflicts"
      className="rounded-xl border border-danger/40 bg-danger-soft/25 p-3"
    >
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-danger">
        <AlertTriangle className="size-4" />
        {conflicts.length} upcoming availability conflict{conflicts.length > 1 ? 's' : ''}
      </h2>
      <ul className="space-y-2">
        {conflicts.map((c) => (
          <li key={c.id} className="rounded-lg border border-danger/30 bg-surface p-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={c.status === 'acknowledged' ? 'warning' : 'danger'} size="sm" dot>
                {c.status === 'acknowledged' ? 'Acknowledged' : 'Open'}
              </Badge>
              <span className="font-bold">{c.assignment.title}</span>
              <span className="tabular-nums text-ink-muted">
                {new Date(c.blocker.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtTimeRange(c.blocker.start, c.blocker.end)} · {c.overlapMinutes} min overlap
              </span>
            </div>
            <p className="mt-1 text-ink">{c.message}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Button intent="secondary" size="sm" onClick={() => onJump(c)}><Link2 className="size-3.5" />Resolve / reassign</Button>
              {c.status !== 'acknowledged' && <Button intent="ghost" size="sm" onClick={() => onAcknowledge(c)}><EyeOff className="size-3.5" />Acknowledge</Button>}
              <Button intent="primary" size="sm" onClick={() => onResolve(c)}><Check className="size-3.5" />Mark resolved</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
