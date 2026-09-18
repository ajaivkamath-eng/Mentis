/**
 * Month grid, agenda list and the admin resource timeline (coaches as rows,
 * time as columns). Month cells accept native drag-and-drop so entries can be
 * moved between days with the mouse; drops go through the same move pipeline
 * as the time grid (drag to another coach is done in the time-grid lanes).
 */
import { useState } from 'react';
import { layoutOverlaps } from '@mentis/core';
import type { DiaryEvent } from '@mentis/core';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  KIND, WEEKDAYS, addDays, eventsOnDay, fmtDayLong, fmtTimeRange, kindStyle,
  parseKey, sameDay, startOfDay, startOfWeek,
} from '../../lib/diary/model';
import { EventChip } from './event-block';
import type { StaffOption } from '../../lib/diary/store';

const MS_DAY = 86_400_000;

/* ------------------------------------------------------------------ */
/* Month                                                               */
/* ------------------------------------------------------------------ */

export function MonthGrid({
  monthAnchor, events, selectedIds, onSelect, onOpen, onOpenDay, onMoveDay, onEdit,
}: {
  monthAnchor: Date;
  events: DiaryEvent[];
  selectedIds: ReadonlySet<string>;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onOpen: (ev: DiaryEvent, anchor: { x: number; y: number }) => void;
  onOpenDay: (day: Date) => void;
  onMoveDay: (ev: DiaryEvent, day: Date) => void;
  onEdit: (ev: DiaryEvent) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const first = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line bg-surface">
        {WEEKDAYS.map((d) => (
          <div key={d} className="p-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-ink-muted">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const inMonth = day.getMonth() === monthAnchor.getMonth();
          const isToday = sameDay(day, new Date());
          const weekend = [0, 6].includes(day.getDay());
          const key = startOfDay(day).getTime().toString();
          const dayEvents = eventsOnDay(events, day);
          const isOpen = expanded.has(key);
          const shown = isOpen ? dayEvents : dayEvents.slice(0, 4);
          const conflicts = dayEvents.filter((e) => e.conflictStatus === 'open' || e.conflictStatus === 'acknowledged').length;
          return (
            <div
              key={key}
              className={cn(
                'min-h-[104px] border-b border-r border-line p-1 transition-colors [&:nth-child(7n)]:border-r-0',
                !inMonth && 'bg-surface-inset/50 text-ink-faint',
                weekend && inMonth && 'bg-surface-inset/30',
                dragOver === key && 'bg-brand-soft/50 ring-2 ring-inset ring-brand',
              )}
              onDragOver={(e) => { if (e.dataTransfer.types.includes('text/diary-event')) { e.preventDefault(); setDragOver(key); } }}
              onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
              onDrop={(e) => {
                const id = e.dataTransfer.getData('text/diary-event');
                setDragOver(null);
                if (id) {
                  const ev = events.find((x) => x.id === id);
                  if (ev) onMoveDay(ev, day);
                }
              }}
            >
              <button
                type="button"
                onClick={() => onOpenDay(day)}
                className={cn(
                  'mb-1 flex w-full items-center gap-1 rounded px-1 text-left text-xs font-bold hover:underline',
                  isToday && 'text-brand-text',
                )}
              >
                <span className={cn('grid size-5 place-items-center rounded-full', isToday && 'bg-brand text-brand-ink')}>{day.getDate()}</span>
                {conflicts > 0 && <span className="rounded bg-[var(--danger)] px-1 text-[9px] font-black text-white">{conflicts} conflict{conflicts > 1 ? 's' : ''}</span>}
              </button>
              <div className="space-y-0.5">
                {shown.map((ev) => (
                  <div
                    key={ev.id}
                    draggable={!ev.system}
                    onDragStart={(e) => {
                      if (ev.system) { e.preventDefault(); return; }
                      e.dataTransfer.setData('text/diary-event', ev.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <EventChip ev={ev} showStaff onClick={(e) => { onSelect(ev.id, e); if (!(e.ctrlKey || e.metaKey)) onOpen(ev, { x: e.clientX, y: e.clientY }); }} />
                  </div>
                ))}
                {dayEvents.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setExpanded((s) => { const n = new Set(isOpen ? [...s].filter((k2) => k2 !== key) : [...s, key]); return n; })}
                    className="flex w-full items-center gap-1 rounded px-1 text-[10px] font-bold text-ink-muted hover:bg-surface-hover"
                  >
                    {isOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    {isOpen ? 'show less' : `${dayEvents.length - 4} more`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Agenda                                                              */
/* ------------------------------------------------------------------ */

export function AgendaView({
  days, events, selectedIds, onSelect, onOpen, onOpenDay,
}: {
  days: Date[];
  events: DiaryEvent[];
  selectedIds: ReadonlySet<string>;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onOpen: (ev: DiaryEvent, anchor: { x: number; y: number }) => void;
  onOpenDay: (day: Date) => void;
}) {
  const listed = days
    .map((day) => ({ day, items: eventsOnDay(events, day).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)) }))
    .filter(({ items }) => items.length > 0);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {listed.length === 0 && (
        <p className="p-10 text-center text-sm text-ink-muted">Nothing scheduled in this range.</p>
      )}
      {listed.map(({ day, items }) => {
        return (
          <div key={startOfDay(day).getTime()} className="border-b border-line last:border-b-0">
            <button type="button" onClick={() => onOpenDay(day)} className="flex w-full items-baseline gap-2 bg-surface-inset/60 px-3 py-1.5 text-left hover:bg-surface-hover">
              <span className="text-sm font-black">{fmtDayLong(day)}</span>
              {sameDay(day, new Date()) && <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold uppercase text-brand-ink">today</span>}
              <span className="ml-auto text-[10px] font-bold uppercase text-ink-faint">{items.length} entr{items.length === 1 ? 'y' : 'ies'}</span>
            </button>
            <div className="divide-y divide-line/60">
              {items.map((ev) => {
                const style = kindStyle(ev);
                const Icon = style.icon;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={(e) => { onSelect(ev.id, e); if (!(e.ctrlKey || e.metaKey)) onOpen(ev, { x: e.clientX, y: e.clientY }); }}
                    className={cn('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-hover', selectedIds.has(ev.id) && 'bg-brand-soft/40 ring-1 ring-inset ring-brand/40')}
                  >
                    <span className="w-28 shrink-0 text-xs font-bold tabular-nums text-ink">{fmtTimeRange(ev.start, ev.end)}</span>
                    <span className="grid size-7 shrink-0 place-items-center rounded-md" style={{ backgroundColor: style.soft, color: style.color }}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{ev.title}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        {KIND[ev.kind].label}{ev.staffName ? ` · ${ev.staffName}` : ''}{ev.location ? ` · ${ev.location}` : ''}
                      </span>
                    </span>
                    {ev.chargeable && <span className="ml-auto shrink-0 rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-bold text-success">chargeable</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resource timeline (admins)                                          */
/* ------------------------------------------------------------------ */

export function ResourceTimeline({
  days, staff, events, onSelect, onOpen, onOpenDay,
}: {
  days: Date[];
  staff: StaffOption[];
  events: DiaryEvent[];
  onSelect: (id: string, e: React.MouseEvent) => void;
  onOpen: (ev: DiaryEvent, anchor: { x: number; y: number }) => void;
  onOpenDay: (day: Date) => void;
}) {
  const perStaff = new Map<string, DiaryEvent[]>();
  for (const s of staff) perStaff.set(s.id, events.filter((e) => e.staffId === s.id));

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid border-b border-line bg-surface" style={{ gridTemplateColumns: `200px repeat(${days.length}, minmax(0,1fr))` }}>
        <div className="border-r border-line px-3 py-2 text-[10px] font-black uppercase tracking-wide text-ink-muted">Coach / day</div>
        {days.map((day) => (
          <button key={startOfDay(day).getTime()} type="button" onClick={() => onOpenDay(day)} className={cn('border-r border-line px-1 py-2 text-center text-[10px] font-bold uppercase text-ink-muted last:border-r-0 hover:bg-surface-hover', sameDay(day, new Date()) && 'bg-brand-soft text-brand-text')}>
            {WEEKDAYS[(day.getDay() + 6) % 7]} {day.getDate()}
          </button>
        ))}
      </div>
      {staff.map((s) => (
        <div key={s.id} className="grid border-b border-line last:border-b-0" style={{ gridTemplateColumns: `200px repeat(${days.length}, minmax(0,1fr))` }}>
          <div className="flex items-center gap-2 border-r border-line px-3 py-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-[10px] font-black text-brand-text">{s.initials}</span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold">{s.name}</span>
              <span className="block text-[10px] text-ink-faint">{s.roles[0]}</span>
            </span>
          </div>
          {days.map((day) => {
            const list = (perStaff.get(s.id) ?? []).filter((e) => eventsOnDay([e], day).length > 0);
            return (
              <div key={startOfDay(day).getTime()} className="space-y-0.5 border-r border-line p-1 last:border-r-0">
                {list.map((ev) => <EventChip key={ev.id} ev={ev} onClick={(e) => { onSelect(ev.id, e); if (!(e.ctrlKey || e.metaKey)) onOpen(ev, { x: e.clientX, y: e.clientY }); }} />)}
              </div>
            );
          })}
        </div>
      ))}
      {staff.length === 0 && <p className="p-10 text-center text-sm text-ink-muted">No staff match the current filter.</p>}
    </div>
  );
}
