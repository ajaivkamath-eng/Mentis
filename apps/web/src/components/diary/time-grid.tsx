/**
 * Outlook-style time grid (day / week).
 *
 *  - time axis on the left, Monday-first day columns, configurable working
 *    hours and 15/30-min snapping
 *  - drag on empty space → create; drag event body → move (across days *and*
 *    coach lanes); drag top/bottom edge → resize; click → details;
 *    double-click → edit; ctrl-click → multi-select (page level)
 *  - all-day area, current-time indicator, side-by-side overlap layout,
 *    multi-coach lanes inside each day column
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { layoutOverlaps } from '@mentis/core';
import type { DiaryEvent } from '@mentis/core';
import { cn } from '../../lib/cn';
import { MS_MIN } from '../../lib/diary/model';
import { WEEKDAYS, eventsOnDay, fmtTime, overriddenBy, sameDay, startOfDay } from '../../lib/diary/model';
import { EventBlock } from './event-block';
import type { Anchor } from './floating';
import type { StaffOption } from '../../lib/diary/store';

export interface CreateRange { start: Date; end: Date; staffId: string; anchor: Anchor }

interface Props {
  days: Date[];
  events: DiaryEvent[];
  staffLanes: StaffOption[];
  workingHours: { start: number; end: number };
  slotMinutes: number;
  pxPerHour?: number;
  selectedIds: ReadonlySet<string>;
  clipboardIds: ReadonlySet<string>;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onCreate: (range: CreateRange) => void;
  onOpen: (ev: DiaryEvent, anchor: Anchor) => void;
  onEdit: (ev: DiaryEvent) => void;
  onMove: (ev: DiaryEvent, start: Date, end: Date, staffId: string) => void;
  onHeaderClick?: (day: Date) => void;
}

type Drag =
  | { kind: 'create'; col: number; lane: number; anchorMin: number; curMin: number; moved: boolean; startX: number; startY: number }
  | { kind: 'move'; ev: DiaryEvent; grabMin: number; durMin: number; origCol: number; col: number; lane: number; curMin: number; active: boolean; startX: number; startY: number }
  | { kind: 'resize'; ev: DiaryEvent; edge: 'start' | 'end'; curMin: number; active: boolean; startX: number; startY: number; origStart: number; origEnd: number };

const GUTTER_W = 56;
const MS_DAY = 86_400_000;

export function TimeGrid({
  days, events, staffLanes, workingHours, slotMinutes, pxPerHour = 54,
  selectedIds, clipboardIds, onSelect, onCreate, onOpen, onEdit, onMove, onHeaderClick,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const [now, setNow] = useState(() => new Date());

  const dayStartMin = workingHours.start * 60;
  const totalMin = (workingHours.end - workingHours.start) * 60;
  const totalH = (totalMin / 60) * pxPerHour;
  const lanes = Math.max(1, staffLanes.length);
  const cells = days.length * lanes;
  const multiStaff = lanes > 1;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* auto-scroll to just above the working start (or current time) once */
  const didScroll = useRef(false);
  useEffect(() => {
    if (didScroll.current || !scrollRef.current) return;
    didScroll.current = true;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const target = Math.max(0, Math.min(nowMin - 60, dayStartMin) - dayStartMin);
    scrollRef.current.scrollTop = (target / 60) * pxPerHour;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const yToMin = useCallback((clientY: number): number => {
    const rect = gridRef.current!.getBoundingClientRect();
    const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
    return Math.max(0, Math.min(totalMin, ratio * totalMin));
  }, [totalMin]);

  const xToColLane = useCallback((clientX: number): { col: number; lane: number } => {
    const rect = gridRef.current!.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width / cells : 0;
    const idx = w > 0 ? Math.max(0, Math.min(cells - 1, Math.floor((clientX - rect.left) / w))) : 0;
    return { col: Math.floor(idx / lanes), lane: idx % lanes };
  }, [cells, lanes]);

  const minToDate = useCallback((col: number, min: number): Date => {
    return new Date(startOfDay(days[col]).getTime() + (dayStartMin + min) * MS_MIN);
  }, [days, dayStartMin]);

  const dayIndexOf = useCallback((ms: number): number => {
    const key = startOfDay(new Date(ms)).getTime();
    const idx = days.findIndex((d) => startOfDay(d).getTime() === key);
    return idx >= 0 ? idx : 0;
  }, [days]);

  const snapMin = useCallback((min: number) => Math.round(min / slotMinutes) * slotMinutes, [slotMinutes]);

  /* ---------------- pointer flow ---------------- */

  const beginCreate = (e: React.PointerEvent, col: number, lane: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const min = snapMin(yToMin(e.clientY));
    setDrag({ kind: 'create', col, lane, anchorMin: min, curMin: min + slotMinutes, moved: false, startX: e.clientX, startY: e.clientY });
  };

  const beginMove = (e: React.PointerEvent, ev: DiaryEvent) => {
    if (e.button !== 0) return;
    const s = new Date(ev.start);
    const evStartMin = Math.max(0, s.getHours() * 60 + s.getMinutes() - dayStartMin);
    setDrag({
      kind: 'move', ev,
      grabMin: yToMin(e.clientY) - evStartMin,
      durMin: (Date.parse(ev.end) - Date.parse(ev.start)) / MS_MIN,
      origCol: dayIndexOf(Date.parse(ev.start)), col: dayIndexOf(Date.parse(ev.start)),
      lane: xToColLane(e.clientX).lane,
      curMin: evStartMin, active: false, startX: e.clientX, startY: e.clientY,
    });
  };

  const beginResize = (e: React.PointerEvent, ev: DiaryEvent, edge: 'start' | 'end') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const evStartMin = Math.max(0, new Date(ev.start).getHours() * 60 + new Date(ev.start).getMinutes() - dayStartMin);
    const evEndMin = Math.min(totalMin, new Date(ev.end).getHours() * 60 + new Date(ev.end).getMinutes() - dayStartMin);
    setDrag({
      kind: 'resize', ev, edge,
      curMin: edge === 'start' ? evStartMin : evEndMin,
      active: false, startX: e.clientX, startY: e.clientY,
      origStart: Date.parse(ev.start), origEnd: Date.parse(ev.end),
    });
  };

  useEffect(() => {
    if (!drag) return;
    const onWinMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.kind === 'create') {
        const moved = d.moved || Math.abs(e.clientY - d.startY) > 4 || Math.abs(e.clientX - d.startX) > 8;
        setDrag({ ...d, curMin: Math.max(slotMinutes, snapMin(yToMin(e.clientY))), moved });
      } else if (d.kind === 'move') {
        const active = d.active || Math.abs(e.clientY - d.startY) > 4 || Math.abs(e.clientX - d.startX) > 6;
        const { col, lane } = xToColLane(e.clientX);
        setDrag({ ...d, active, col, lane, curMin: Math.max(0, snapMin(yToMin(e.clientY) - d.grabMin)) });
      } else {
        setDrag({ ...d, curMin: snapMin(yToMin(e.clientY)), active: d.active || Math.abs(e.clientY - d.startY) > 3 });
      }
    };
    const onWinUp = (e: PointerEvent) => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      if (d.kind === 'create') {
        const staffId = staffLanes[d.lane]?.id;
        if (!staffId) return;
        const a = Math.min(d.anchorMin, d.curMin - slotMinutes);
        const b = Math.max(d.anchorMin + slotMinutes, d.curMin);
        onCreate({ start: minToDate(d.col, a), end: minToDate(d.col, b), staffId, anchor: { x: e.clientX, y: e.clientY } });
      } else if (d.kind === 'move' && d.active) {
        const start = minToDate(d.col, d.curMin);
        const end = new Date(start.getTime() + d.durMin * MS_MIN);
        onMove(d.ev, start, end, staffLanes[d.lane]?.id || d.ev.staffId);
      } else if (d.kind === 'resize' && d.active) {
        const col = dayIndexOf(d.origStart);
        let startMs = d.origStart;
        let endMs = d.origEnd;
        if (d.edge === 'end') {
          endMs = Math.max(startMs + slotMinutes * MS_MIN, minToDate(col, d.curMin).getTime());
        } else {
          startMs = Math.min(endMs - slotMinutes * MS_MIN, minToDate(col, d.curMin).getTime());
        }
        onMove(d.ev, new Date(startMs), new Date(endMs), d.ev.staffId);
      }
    };
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinUp);
    };
  }, [drag, yToMin, xToColLane, slotMinutes, snapMin, dayStartMin, minToDate, onCreate, onMove, staffLanes, dayIndexOf]);

  /* ---------------- rendering ---------------- */

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNowLine = nowMin >= dayStartMin && nowMin <= dayStartMin + totalMin;
  const nowTop = ((nowMin - dayStartMin) / 60) * pxPerHour;

  /** events per (col, lane) with overlap layout resolved */
  const cellEvents = useMemo(() => {
    const map = new Map<number, { ev: DiaryEvent; top: number; height: number; laneIdx: number; laneCount: number }[]>();
    days.forEach((day, col) => {
      for (let lane = 0; lane < lanes; lane++) {
        const inCell = events.filter(
          (ev) => !ev.allDay && (lane === (staffLanes.findIndex((s) => s.id === ev.staffId) === -1 ? 0 : staffLanes.findIndex((s) => s.id === ev.staffId))) && eventsOnDay([ev], day).length > 0,
        );
        const positioned = layoutOverlaps(inCell);
        const blocks = positioned.map(({ event: ev, lane: laneIdx, lanes: laneCount }) => {
          const s = new Date(ev.start); const en = new Date(ev.end);
          const dayTime = startOfDay(day).getTime();
          const sAbs = Date.parse(ev.start); const eAbs = Date.parse(ev.end);
          // clip to this day column
          const sMin = sAbs < dayTime ? 0 : Math.max(0, s.getHours() * 60 + s.getMinutes() - dayStartMin);
          const eDayEnd = dayTime + MS_DAY;
          const eMin = eAbs > eDayEnd ? totalMin : Math.min(totalMin, en.getHours() * 60 + en.getMinutes() - dayStartMin);
          const top = (sMin / 60) * pxPerHour;
          const height = Math.max(16, ((eMin - sMin) / 60) * pxPerHour - 1);
          return { ev, top, height, laneIdx, laneCount };
        });
        if (blocks.length) map.set(col * lanes + lane, blocks);
      }
    });
    return map;
  }, [days, events, lanes, staffLanes, dayStartMin, totalMin, pxPerHour]);

  const hourMarks = useMemo(() => {
    const out: number[] = [];
    for (let h = workingHours.start; h < workingHours.end; h++) out.push(h);
    return out;
  }, [workingHours]);

  const allDayByDay = useMemo(
    () => days.map((day) => events.filter((e) => e.allDay && eventsOnDay([e], day).length > 0)),
    [days, events],
  );
  const hasAllDay = allDayByDay.some((a) => a.length > 0);

  const dragGhost = (() => {
    if (!drag) return null;
    if (drag.kind === 'create') {
      const a = Math.min(drag.anchorMin, drag.curMin);
      const b = Math.max(drag.anchorMin, drag.curMin);
      return {
        cell: drag.col * lanes + drag.lane,
        top: (a / 60) * pxPerHour,
        height: Math.max(10, ((b - a) / 60) * pxPerHour),
        label: `${fmtTime(minToDate(drag.col, a).toISOString())} – ${fmtTime(minToDate(drag.col, b).toISOString())}`,
      };
    }
    if (drag.kind === 'move' && drag.active) {
      return {
        cell: drag.col * lanes + drag.lane,
        top: (drag.curMin / 60) * pxPerHour,
        height: Math.max(10, (drag.durMin / 60) * pxPerHour),
        label: fmtTime(minToDate(drag.col, drag.curMin).toISOString()),
      };
    }
    return null;
  })();

  const resizeGhost = (() => {
    if (!drag || drag.kind !== 'resize' || !drag.active) return null;
    const col = dayIndexOf(drag.origStart);
    const sMin = drag.edge === 'start' ? drag.curMin : Math.max(0, new Date(drag.origStart).getHours() * 60 + new Date(drag.origStart).getMinutes() - dayStartMin);
    const eMin = drag.edge === 'end' ? drag.curMin : Math.min(totalMin, new Date(drag.origEnd).getHours() * 60 + new Date(drag.origEnd).getMinutes() - dayStartMin);
    const laneIdx = Math.max(0, staffLanes.findIndex((s) => s.id === drag.ev.staffId));
    return {
      cell: col * lanes + (laneIdx === -1 ? 0 : laneIdx),
      top: (Math.min(sMin, eMin) / 60) * pxPerHour,
      height: Math.max(10, ((Math.abs(eMin - sMin)) / 60) * pxPerHour),
    };
  })();

  const cellPct = 100 / cells;

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface">
      {/* Day headers */}
      <div className="flex border-b border-line bg-surface">
        <div className="shrink-0 border-r border-line" style={{ width: GUTTER_W }} aria-hidden />
        {days.map((day, i) => {
          const isToday = sameDay(day, new Date());
          return (
            <div key={i} className="min-w-0" style={{ width: `calc(${(100 / days.length).toFixed(4)}% )`, flex: 1 }}>
              <button
                type="button"
                onClick={() => onHeaderClick?.(day)}
                className={cn(
                  'flex w-full flex-col items-center gap-0.5 px-1 py-1.5 text-center transition-colors hover:bg-surface-hover',
                  isToday && 'bg-brand-soft',
                )}
              >
                <span className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                  {WEEKDAYS[(day.getDay() + 6) % 7]} {day.toLocaleDateString('en-GB', { month: 'short' })}
                </span>
                <span className={cn('grid size-7 place-items-center rounded-full text-sm font-black', isToday ? 'bg-brand text-brand-ink' : 'text-ink')}>
                  {day.getDate()}
                </span>
              </button>
              {multiStaff && (
                <div className="grid border-t border-line" style={{ gridTemplateColumns: `repeat(${lanes}, minmax(0,1fr))` }}>
                  {staffLanes.map((s) => (
                    <div key={s.id} className="truncate border-r border-line px-1 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-ink-faint last:border-r-0" title={s.name}>
                      {s.initials}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      {hasAllDay && (
        <div className="flex border-b border-line bg-surface-inset/40">
          <div className="shrink-0 border-r border-line py-1 pr-1 text-right text-[9px] font-bold uppercase text-ink-faint" style={{ width: GUTTER_W }}>all day</div>
          <div className="grid min-w-0 flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
            {allDayByDay.map((list, i) => (
              <div key={i} className="space-y-1 border-r border-line p-1 last:border-r-0">
                {list.map((ev) => (
                  <div key={ev.id} className="h-7">
                    <EventBlock ev={ev} compact showStaff={multiStaff} selected={selectedIds.has(ev.id)} onClick={(e) => onSelect(ev.id, e)} onDoubleClick={() => onEdit(ev)} onPointerDown={(e) => e.stopPropagation()} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scrolling body */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex">
          {/* Time gutter */}
          <div className="relative shrink-0 border-r border-line" style={{ width: GUTTER_W, height: totalH }}>
            {hourMarks.map((h, i) => (
              <div key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] font-semibold tabular-nums text-ink-faint" style={{ top: i * pxPerHour }}>
                {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
              </div>
            ))}
          </div>

          {/* Column grid */}
          <div
            ref={gridRef}
            className="relative min-w-0 flex-1 select-none touch-none"
            style={{ height: totalH, display: 'grid', gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Cells with slot lines */}
            {Array.from({ length: cells }).map((_, idx) => {
              const col = Math.floor(idx / lanes);
              const lane = idx % lanes;
              const day = days[col];
              const weekend = [0, 6].includes(day.getDay());
              const isToday = sameDay(day, new Date());
              return (
                <div
                  key={idx}
                  className={cn(
                    'relative cursor-cell border-b border-line',
                    lane < lanes - 1 && multiStaff ? 'border-r border-r-line/50' : 'border-r-2 border-r-line',
                    weekend && 'bg-surface-inset/40',
                    isToday && 'bg-brand-soft/20',
                  )}
                  style={{
                    backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${(slotMinutes / 60) * pxPerHour}px)`,
                  }}
                  onPointerDown={(e) => beginCreate(e, col, lane)}
                />
              );
            })}

            {/* Events */}
            {[...cellEvents.entries()].map(([cellIdx, blocks]) =>
              blocks.map(({ ev, top, height, laneIdx, laneCount }) => {
                const hidden = (drag?.kind === 'move' && drag.ev.id === ev.id && drag.active)
                  || (drag?.kind === 'resize' && drag.ev.id === ev.id && drag.active);
                if (hidden) return null;
                const overridden = overriddenBy(ev, events);
                const shown = overridden ? { ...ev, exceptionStatus: 'overridden' as const } : ev;
                const compact = height < 46;
                return (
                  <div
                    key={ev.id}
                    className="absolute z-10"
                    style={{
                      left: `calc(${cellIdx * cellPct}% + ${laneCount > 1 ? 1 : 2}px)`,
                      width: `calc(${cellPct / laneCount}% - ${laneCount > 1 ? 2 : 4}px)`,
                      transform: `translateX(${laneIdx * 100}%)`,
                      top, height,
                      opacity: clipboardIds.has(ev.id) ? 0.45 : 1,
                    }}
                  >
                    <div className="relative h-full">
                      <EventBlock
                        ev={shown}
                        compact={compact}
                        density={height < 30 ? 'slim' : 'normal'}
                        showStaff={multiStaff}
                        selected={selectedIds.has(ev.id)}
                        onClick={(e) => {
                          onSelect(ev.id, e);
                          if (!(e.ctrlKey || e.metaKey)) onOpen(ev, { x: e.clientX, y: e.clientY });
                        }}
                        onDoubleClick={() => onEdit(ev)}
                        onPointerDown={(e) => beginMove(e, ev)}
                      />
                      <div className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" onPointerDown={(e) => beginResize(e, ev, 'end')} />
                      {height > 36 && <div className="absolute inset-x-0 top-0 h-2 cursor-ns-resize" onPointerDown={(e) => beginResize(e, ev, 'start')} />}
                    </div>
                  </div>
                );
              }),
            )}

            {/* Create / move ghost */}
            {dragGhost && (
              <div
                className="pointer-events-none z-30 rounded-md border-2 border-dashed border-brand bg-brand-soft/80 p-1 text-[10px] font-bold text-brand-text shadow-sm"
                style={{
                  left: `calc(${dragGhost.cell * cellPct}% + 2px)`,
                  width: `calc(${cellPct}% - 4px)`,
                  top: dragGhost.top, height: dragGhost.height,
                }}
              >
                {dragGhost.height > 24 && <span className="rounded bg-surface-raised/85 px-1 py-px tabular-nums">{dragGhost.label}</span>}
              </div>
            )}

            {/* Resize ghost */}
            {resizeGhost && (
              <div
                className="pointer-events-none z-30 rounded-md border-2 border-brand bg-brand-soft/70"
                style={{
                  left: `calc(${resizeGhost.cell * cellPct}% + 2px)`,
                  width: `calc(${cellPct}% - 4px)`,
                  top: resizeGhost.top, height: resizeGhost.height,
                }}
              />
            )}

            {/* Current time indicator */}
            {showNowLine && (
              <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowTop }} aria-hidden>
                <div className="relative h-0 border-t-2 border-[var(--danger)]">
                  <span className="absolute -left-1 -top-[5px] size-2.5 rounded-full bg-[var(--danger)]" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
