/**
 * The one visual language for diary events across every view.
 *
 * Buckets differ by more than colour (colour-vision safety):
 *   availability → soft fill + solid left bar
 *   regular (planner) → light info fill + dashed bar, "SYSTEM" affordance
 *   unavailable/leave → diagonal-stripe fill
 *   session/task (system) → solid fill, lock + open affordance
 * plus a leading icon per kind and explicit conflict/chargeable badges.
 */
import { AlertTriangle, Copy, Link2, Lock, MapPin, PoundSterling, RefreshCw, User } from 'lucide-react';
import type { DiaryEvent } from '@mentis/core';
import { cn } from '../../lib/cn';
import { KIND, ROLE_LABEL, SOURCE_LABEL, fmtMoney, fmtTimeRange, kindStyle } from '../../lib/diary/model';

export function EventBlock({
  ev, compact, showStaff, selected, onDoubleClick, onPointerDown, onClick, density = 'normal',
}: {
  ev: DiaryEvent;
  compact?: boolean;
  showStaff?: boolean;
  selected?: boolean;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  density?: 'normal' | 'slim';
}) {
  const style = kindStyle(ev);
  const Icon = style.icon;
  const system = ev.system === true;
  const overridden = ev.exceptionStatus === 'overridden';
  const conflict = ev.conflictStatus === 'open' || ev.conflictStatus === 'acknowledged';

  return (
    <div
      data-event-id={ev.id}
      role="button"
      tabIndex={-1}
      aria-label={`${ev.title}, ${fmtTimeRange(ev.start, ev.end)}`}
      title={tooltip(ev)}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={cn(
        'group/event relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-md px-1.5 text-left',
        'border border-transparent transition-[filter,box-shadow] duration-100 hover:brightness-[0.99]',
        selected && 'ring-2 ring-[var(--ring)] ring-offset-1 ring-offset-[var(--bg)]',
        density === 'slim' && 'py-0.5',
        !compact && 'py-1',
        ev.kind === 'session'
          ? 'text-white'
          : 'text-ink',
      )}
      style={{
        backgroundColor: ev.kind === 'session' ? style.color : style.soft,
        borderLeft: `3px solid ${style.color}`,
        ...(ev.kind === 'task' ? { borderStyle: 'dashed' as const, borderLeftStyle: 'solid' } : {}),
      }}
    >
      {style.striped && !overridden && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{ background: `repeating-linear-gradient(-45deg, transparent 0 5px, color-mix(in srgb, ${style.color} 22%, transparent) 5px 9px)` }}
        />
      )}
      <div className={cn('flex items-center gap-1 text-[11px] font-semibold leading-tight', compact && 'truncate')}>
        <Icon className={cn('size-3 shrink-0', ev.kind === 'session' ? 'text-white/90' : 'shrink-0')} style={ev.kind === 'session' ? undefined : { color: style.color }} />
        {!compact && <span className="tabular-nums opacity-80">{fmtTimeRange(ev.start, ev.end)}</span>}
        {system && <Lock className="ml-auto size-3 shrink-0 opacity-60" />}
        {conflict && (
          <span className={cn('inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-black uppercase', ev.kind === 'session' ? 'bg-white text-[var(--danger)]' : 'bg-[var(--danger)] text-white')}>
            <AlertTriangle className="size-2.5" /> Conflict
          </span>
        )}
        {ev.chargeable && ev.kind !== 'session' && (
          <span className="inline-flex items-center rounded bg-[var(--success)] px-1 py-px text-[9px] font-black text-white" title={`Chargeable · ${ev.rateLabel ?? ''} ${fmtMoney(ev.rateCents)}/h`}>
            <PoundSterling className="size-2.5" />
          </span>
        )}
      </div>
      <div className={cn('truncate text-xs font-bold leading-snug', overridden && 'line-through decoration-2')}>{ev.title}</div>
      {!compact && showStaff && ev.staffName && (
        <div className="flex items-center gap-1 truncate text-[10px] opacity-75"><User className="size-2.5" />{ev.staffName}</div>
      )}
      {!compact && ev.coachRole && (
        <div className="truncate text-[10px] opacity-75">{ROLE_LABEL[ev.coachRole]}</div>
      )}
      {!compact && ev.location && (
        <div className="flex items-center gap-1 truncate text-[10px] opacity-75"><MapPin className="size-2.5" />{ev.location}</div>
      )}
      {!compact && ev.notes && <div className="truncate text-[10px] italic opacity-70">{ev.notes}</div>}
      {overridden && (
        <div className="absolute bottom-0 left-0 right-0 bg-[var(--surface-raised)]/85 px-1 text-[9px] font-bold uppercase tracking-wide text-ink-faint">
          <RefreshCw className="mr-0.5 inline size-2.5" /> overridden
        </div>
      )}
    </div>
  );
}

function tooltip(ev: DiaryEvent): string {
  const lines = [
    `${ev.title} · ${KIND[ev.kind].label}`,
    fmtTimeRange(ev.start, ev.end),
  ];
  if (ev.staffName) lines.push(`Coach: ${ev.staffName}`);
  if (ev.coachRole) lines.push(`Role: ${ROLE_LABEL[ev.coachRole]}`);
  if (ev.location) lines.push(`Venue: ${ev.location}`);
  if (ev.notes) lines.push(ev.notes);
  lines.push(`Source: ${SOURCE_LABEL[ev.sourceType]}${ev.system ? ' (not editable here)' : ''}`);
  if (ev.chargeable) lines.push(`Chargeable: ${ev.rateLabel ?? 'rate'} ${fmtMoney(ev.rateCents)}/h`);
  return lines.join('\n');
}

/** Tiny chip for month/agenda/resource views. */
export function EventChip({ ev, onClick, showStaff }: { ev: DiaryEvent; onClick?: (e: React.MouseEvent) => void; showStaff?: boolean }) {
  const style = kindStyle(ev);
  const conflict = ev.conflictStatus === 'open' || ev.conflictStatus === 'acknowledged';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] font-medium hover:brightness-95',
        ev.kind === 'session' ? 'text-white' : 'text-ink',
        conflict && 'outline outline-1 outline-[var(--danger)]',
      )}
      style={{ backgroundColor: ev.kind === 'session' ? style.color : style.soft }}
      title={`${fmtTimeRange(ev.start, ev.end)} ${ev.title}${ev.staffName && showStaff ? ` · ${ev.staffName}` : ''}`}
    >
      {conflict && <AlertTriangle className="size-3 shrink-0 text-[var(--danger)]" />}
      {!conflict && <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: style.color }} />}
      <span className="tabular-nums opacity-75">{new Date(ev.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
      <span className="truncate font-semibold">{ev.title}</span>
      {showStaff && ev.staffName && <span className="ml-auto shrink-0 rounded bg-black/10 px-1 text-[9px] font-bold uppercase">{ev.staffName.split(' ').pop()}</span>}
      {ev.system && <Copy className="ml-auto hidden size-3" aria-hidden />}
      {!ev.system && <Link2 className="hidden" aria-hidden />}
    </button>
  );
}
