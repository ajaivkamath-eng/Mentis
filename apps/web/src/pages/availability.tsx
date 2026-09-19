/**
 * Coach Personal Diary & Availability — calendar-first redesign.
 *
 * The old screen was a form with separate From/To fields; the calendar is now
 * the primary interaction surface (Outlook-style): drag to create, drag to
 * move, resize edges, click for details, double-click to edit, copy/paste/
 * duplicate, day/week/month/agenda views, an admin resource timeline, a
 * Regular Availability Planner tab, conflict handling and chargeable badges.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  detectConflicts, type DiaryEvent, type IsoWeekday,
} from '@mentis/core';
import {
  CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Copy, Keyboard, ListTree, Redo2,
  Scissors, Settings2, SlidersHorizontal, Sparkles, Undo2, Users, ClipboardPaste, Info,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/patterns/page-header';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { toast } from '../components/ui/toast';
import { useDiaryData, type StaffOption } from '../lib/diary/store';
import {
  KIND, ROLE_LABEL, SOURCE_LABEL, WEEKDAYS, addDays, dateKey, fmtDayLong, fmtMoney,
  fmtTimeRange, parseKey, sameDay, snap, startOfWeek, toLocalInput,
  type EventKind,
} from '../lib/diary/model';
import { TimeGrid, type CreateRange } from '../components/diary/time-grid';
import { AgendaView, MonthGrid, ResourceTimeline } from '../components/diary/other-views';
import { EventDetailsPopover, EventEditorPanel, PastePopover, QuickCreatePopover, type EditorDraft, type PasteOptions } from '../components/diary/editor-panel';
import { emptyPlanner, PlannerPanel, plannerFromRule, type PlannerValue } from '../components/diary/planner-panel';
import { ConflictStrip, LegendBar } from '../components/diary/legend';
import { FloatingCard, type Anchor } from '../components/diary/floating';

type View = 'day' | 'week' | 'month' | 'agenda' | 'resources';

interface Settings { startHour: number; endHour: number; slotMinutes: number }
const SETTINGS_KEY = 'mentis.diary.settings';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { startHour: 7, endHour: 22, slotMinutes: 15, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { startHour: 7, endHour: 22, slotMinutes: 15 };
}

/** Keep the diary useful at phone width without baking the viewport into CSS. */
function useNarrowScreen() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return narrow;
}

const KIND_GROUP: Record<string, 'availability' | 'timeoff' | 'duty' | 'bookings'> = {
  available: 'availability', working_hours: 'availability',
  holiday: 'timeoff', sick_leave: 'timeoff', personal_appointment: 'timeoff', out_of_office: 'timeoff', unavailable_other: 'timeoff', other: 'timeoff',
  on_duty: 'duty', club_duty: 'duty', duty_outside_club: 'duty', working_elsewhere: 'duty', training: 'duty',
  session: 'bookings', task: 'bookings',
};

/* ------------------------------------------------------------------ */

export function Availability() {
  const { staff, canDo, role } = useAuth();
  const navigate = useNavigate();
  const api = useDiaryData();
  const { state, isDemo } = api;
  const isMobile = useNarrowScreen();

  // A seven-column time grid is too dense to operate at phone width. Start on
  // one day there; users can still switch to the mobile agenda for the whole
  // week, or use the day arrows for quick register work.
  const [view, setView] = useState<View>(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'day' : 'week'
  ));
  const [cursor, setCursor] = useState(() => new Date());
  const mobileViewApplied = useRef(false);

  useEffect(() => {
    if (isMobile && !mobileViewApplied.current && view === 'week') setView('day');
    mobileViewApplied.current = isMobile;
    if (!isMobile) mobileViewApplied.current = false;
  }, [isMobile, view]);
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<{ ids: string[]; cut: boolean } | null>(null);
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [panel, setPanel] = useState<'calendar' | 'planner'>('calendar');

  const [editorDraft, setEditorDraft] = useState<EditorDraft | null>(null);
  const [quick, setQuick] = useState<{ draft: EditorDraft; range: { start: Date; end: Date }; anchor: Anchor } | null>(null);
  const [details, setDetails] = useState<{ ev: DiaryEvent; anchor: Anchor } | null>(null);
  const [pasteOpen, setPasteOpen] = useState<Anchor | null>(null);
  const [pasteOptions, setPasteOptions] = useState<PasteOptions>(() => ({
    mode: 'once', from: dateKey(startOfWeek(new Date())), to: dateKey(addDays(startOfWeek(new Date()), 6)),
    weekdays: [1, 2, 3, 4, 5] as IsoWeekday[], timeMode: 'original', newTime: '09:00',
  }));
  const [planner, setPlanner] = useState<PlannerValue | null>(null);
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState<Anchor | null>(null);

  const meId = state.meId || staff?.id || '';

  /* default staff selection = me */
  useEffect(() => {
    if (!staffIds.length && meId) setStaffIds([meId]);
  }, [meId, staffIds.length]);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings]);

  const canRecordForOthers = canDo('availability.recordForOthers') || canDo('availability.recordAll');
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  /* visible day window ---------------------------------------------------- */
  const weekStart = useMemo(() => startOfWeek(cursor), [cursor]);
  const days = useMemo<Date[]>(() => {
    if (view === 'day') return [new Date(cursor)];
    if (view === 'month') return [];
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [view, cursor, weekStart]);

  /* staff lanes ----------------------------------------------------------- */
  const staffLanes = useMemo<StaffOption[]>(() => {
    const list = state.staff.length ? state.staff : [];
    const chosen = staffIds.length ? list.filter((s) => staffIds.includes(s.id)) : list.slice(0, 1);
    return chosen.length ? chosen : list.slice(0, 1);
  }, [state.staff, staffIds]);

  /* events ---------------------------------------------------------------- */
  const staffIdSet = useMemo(() => new Set(staffLanes.map((s) => s.id)), [staffLanes]);
  const rangeEvents = useMemo(() => {
    const inRange = state.events.filter((e) => staffIdSet.has(e.staffId) && !hiddenGroups.has(KIND_GROUP[e.kind]));
    if (view === 'month') return inRange;
    return inRange;
  }, [state.events, staffIdSet, hiddenGroups, view]);

  const conflictsInRange = useMemo(
    () => state.conflicts.filter((c) => staffIdSet.has(c.staffId)),
    [state.conflicts, staffIdSet],
  );

  const summary = useMemo(() => {
    const week = state.events.filter((e) => staffIdSet.has(e.staffId));
    return {
      availabilityHours: week
        .filter((e) => KIND[e.kind].bucket === 'available' || KIND[e.kind].bucket === 'regular')
        .reduce((a, e) => a + (Date.parse(e.end) - Date.parse(e.start)) / 3_600_000, 0),
      sessions: week.filter((e) => e.kind === 'session').length,
      conflicts: conflictsInRange.length,
    };
  }, [state.events, staffIdSet, conflictsInRange.length]);

  /* draft helpers ---------------------------------------------------------- */

  const draftFromRange = useCallback((range: { start: Date; end: Date; staffId: string }): EditorDraft => {
    const s = snap(range.start, settings.slotMinutes);
    const e = snap(range.end, settings.slotMinutes);
    return {
      staffId: range.staffId || meId,
      title: '',
      kind: 'available',
      startLocal: toLocalInput(s),
      endLocal: toLocalInput(e),
      allDay: false,
      notes: '',
      visibility: 'staff',
      repeat: { enabled: false, weekdays: [], until: dateKey(addDays(s, 56)) },
    };
  }, [meId, settings.slotMinutes]);

  const draftFromEvent = useCallback((ev: DiaryEvent): EditorDraft => ({
    id: ev.id,
    staffId: ev.staffId,
    title: ev.title,
    kind: ev.kind,
    startLocal: toLocalInput(new Date(ev.start)),
    endLocal: toLocalInput(new Date(ev.end)),
    allDay: ev.allDay ?? false,
    notes: ev.notes ?? '',
    visibility: (ev.visibility as EditorDraft['visibility']) ?? 'staff',
    repeat: { enabled: false, weekdays: [], until: dateKey(addDays(new Date(ev.start), 56)) },
    system: ev.system && ev.sourceType !== 'planner',
    sourceType: ev.sourceType,
    staffName: ev.staffName,
    linkTo: ev.linkTo,
    rateCents: ev.rateCents,
    rateLabel: ev.rateLabel,
    coachRole: ev.coachRole,
  }), []);

  /** Conflicts the draft would create, in the required wording. */
  const draftConflicts = useCallback((draft: EditorDraft) => {
    if (draft.system) return [];
    const synthetic: DiaryEvent = {
      id: draft.id ?? 'draft', staffId: draft.staffId, title: draft.title || KIND[draft.kind].label,
      kind: draft.kind, start: new Date(draft.startLocal).toISOString(), end: new Date(draft.endLocal).toISOString(),
      sourceType: 'manual',
    };
    const others = state.events.filter((e) => e.id !== draft.id && e.staffId === draft.staffId);
    return detectConflicts([...others, synthetic]).filter((c) => c.blocker.id === synthetic.id);
  }, [state.events]);

  /* actions ----------------------------------------------------------------- */

  const handleCreate = useCallback((range: CreateRange) => {
    setDetails(null);
    setQuick({ draft: draftFromRange(range), range: { start: range.start, end: range.end }, anchor: range.anchor });
  }, [draftFromRange]);

  const handleOpen = useCallback((ev: DiaryEvent, anchor: Anchor) => {
    setQuick(null);
    setDetails({ ev, anchor });
  }, []);

  const handleEdit = useCallback((ev: DiaryEvent) => {
    setDetails(null); setQuick(null);
    // Sessions/tasks are system-owned (link out instead); planner-generated
    // occurrences ARE individually editable — the edit becomes an exception
    // and the pattern itself is preserved (docs/diary-calendar.md §Recurrence).
    if (ev.system && ev.sourceType !== 'planner') {
      setDetails({ ev, anchor: { x: window.innerWidth / 2 - 150, y: 140 } });
      return;
    }
    setEditorDraft(draftFromEvent(ev));
    setPanel('calendar');
  }, [draftFromEvent]);

  const handleSelect = useCallback((id: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return;
    }
    setSelectedIds(new Set([id]));
  }, []);

  const handleMove = useCallback(async (ev: DiaryEvent, start: Date, end: Date, targetStaffId: string) => {
    if (ev.system) {
      toast.warning(`“${ev.title}” is generated from a ${ev.kind === 'session' ? 'session booking' : 'task'} — move it in ${ev.kind === 'session' ? 'Scheduling' : 'Tasks'}, or reassign the coach there.`);
      return;
    }
    await api.updateEntry(ev.id, { start, end, staffId: targetStaffId, kind: ev.kind, title: ev.title });
    toast.success(`Moved “${ev.title}” to ${fmtDayLong(start)} ${fmtTimeRange(start.toISOString(), end.toISOString())}${targetStaffId !== ev.staffId ? ` · ${state.staff.find((s) => s.id === targetStaffId)?.name ?? ''}` : ''}`, { action: { label: 'Undo', onClick: () => void api.undo() } });
  }, [api, state.staff]);

  const saveDraft = useCallback(async (confirmConflict: boolean, repeat: boolean) => {
    if (!editorDraft) return;
    const conflicts = draftConflicts(editorDraft);
    if (conflicts.length > 0 && !confirmConflict) return;
    const start = new Date(editorDraft.startLocal);
    const end = new Date(editorDraft.endLocal);
    if (end <= start) { toast.error('End time must be after the start time.'); return; }
    try {
      if (editorDraft.id) {
        await api.updateEntry(editorDraft.id, { ...editorDraft, start, end });
      } else {
        await api.createEntry({
          staffId: editorDraft.staffId,
          title: editorDraft.title,
          kind: editorDraft.kind,
          start, end,
          allDay: editorDraft.allDay,
          notes: editorDraft.notes || undefined,
          visibility: editorDraft.visibility,
          repeat: repeat && editorDraft.repeat.enabled
            ? { weekdays: editorDraft.repeat.weekdays, until: editorDraft.repeat.until }
            : null,
        });
      }
      setEditorDraft(null);
      if (conflicts.length > 0) {
        toast.warning(`Saved with ${conflicts.length} booking conflict${conflicts.length > 1 ? 's' : ''} — the affected session${conflicts.length > 1 ? 's are' : ' is'} flagged red and the owner has been notified.`);
      } else {
        toast.success(repeat ? 'Entry saved and repeated.' : 'Diary entry saved.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the entry.');
    }
  }, [api, draftConflicts, editorDraft]);

  const deleteDraft = useCallback(async () => {
    if (!editorDraft?.id) return;
    await api.deleteEntries([editorDraft.id]);
    setEditorDraft(null);
    toast.success('Entry deleted.', { action: { label: 'Undo', onClick: () => void api.undo() } });
  }, [api, editorDraft]);

  /* clipboard ---------------------------------------------------------------- */

  const copySelection = useCallback((cut = false) => {
    const ids = selectedIds.size ? [...selectedIds] : details ? [details.ev.id] : [];
    const evs = ids.map((id) => state.events.find((e) => e.id === id)).filter((e): e is DiaryEvent => Boolean(e) && !e!.system);
    if (!evs.length) { toast.info('Select an editable diary entry first (system bookings cannot be copied).'); return; }
    setClipboard({ ids: evs.map((e) => e.id), cut });
    setSelectedIds(new Set(evs.map((e) => e.id)));
    toast.success(`${cut ? 'Cut' : 'Copied'} ${evs.length} entr${evs.length === 1 ? 'y' : 'ies'} — press Ctrl+V or use Paste to choose where.`);
  }, [details, selectedIds, state.events]);

  const applyPaste = useCallback(async () => {
    if (!clipboard) return;
    const srcs = clipboard.ids.map((id) => state.events.find((e) => e.id === id)).filter((e): e is DiaryEvent => Boolean(e));
    if (!srcs.length) return;
    const created: number[] = [];
    const dates: string[] = [];
    if (pasteOptions.mode === 'once') {
      dates.push(dateKey(cursor));
    } else if (pasteOptions.mode === 'range') {
      for (let d = parseKey(pasteOptions.from); dateKey(d) <= pasteOptions.to; d = addDays(d, 1)) dates.push(dateKey(d));
    } else {
      for (let d = parseKey(pasteOptions.from); dateKey(d) <= pasteOptions.to; d = addDays(d, 1)) {
        const wd = ((d.getDay() + 6) % 7 + 1) as IsoWeekday;
        if (pasteOptions.weekdays.includes(wd)) dates.push(dateKey(d));
      }
    }
    for (const date of dates) {
      for (const src of srcs) {
        const dur = Date.parse(src.end) - Date.parse(src.start);
        const s = parseKey(date);
        const srcStart = new Date(src.start);
        if (pasteOptions.timeMode === 'custom') {
          const [h, m] = pasteOptions.newTime.split(':').map(Number);
          s.setHours(h, m, 0, 0);
        } else {
          s.setHours(srcStart.getHours(), srcStart.getMinutes(), 0, 0);
        }
        const e = new Date(s.getTime() + dur);
        await api.createEntry({
          staffId: src.staffId, title: src.title, kind: src.kind, start: s, end: e,
          allDay: src.allDay, notes: src.notes ?? undefined, visibility: (src.visibility as 'private' | 'staff' | 'public') ?? 'staff',
        });
        created.push(1);
      }
    }
    if (clipboard.cut) await api.deleteEntries(clipboard.ids);
    setPasteOpen(null);
    if (clipboard.cut) setClipboard(null);
    toast.success(`Pasted ${created.length} entr${created.length === 1 ? 'y' : 'ies'}.`, { action: { label: 'Undo', onClick: () => void api.undo() } });
  }, [api, clipboard, cursor, pasteOptions, state.events]);

  /* keyboard ------------------------------------------------------------------ */

  const mainRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(false); return; }
      if (meta && e.key.toLowerCase() === 'x') { e.preventDefault(); copySelection(true); return; }
      if (meta && e.key.toLowerCase() === 'v') { e.preventDefault(); if (clipboard) setPasteOpen({ x: window.innerWidth / 2 - 155, y: 160 }); return; }
      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); void api.undo(); return; }
      if ((meta && e.key.toLowerCase() === 'y') || (meta && e.shiftKey && e.key.toLowerCase() === 'z')) { e.preventDefault(); void api.redo(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const ids = selectedIds.size ? [...selectedIds] : [];
        const editable = ids.filter((id) => !state.events.find((x) => x.id === id)?.system);
        if (editable.length) {
          e.preventDefault();
          void api.deleteEntries(editable).then(() => { setSelectedIds(new Set()); toast.success(`Deleted ${editable.length} entr${editable.length === 1 ? 'y' : 'ies'}.`, { action: { label: 'Undo', onClick: () => void api.undo() } }); });
        }
        return;
      }
      if (e.key === 'Escape') { setDetails(null); setQuick(null); setPasteOpen(null); setHelpOpen(null); setSelectedIds(new Set()); return; }
      if (meta || e.altKey) return;
      const step = view === 'day' || view === 'agenda' ? 1 : view === 'month' ? 7 : 1;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setCursor((c) => addDays(c, -step)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setCursor((c) => addDays(c, step)); }
      if (e.key.toLowerCase() === 't') setCursor(new Date());
      if (e.key.toLowerCase() === 'd') setView('day');
      if (e.key.toLowerCase() === 'w') setView('week');
      if (e.key.toLowerCase() === 'm') setView('month');
      if (e.key.toLowerCase() === 'a') setView('agenda');
      if (e.key.toLowerCase() === 'r' && isAdmin) setView('resources');
      if (e.key.toLowerCase() === 'n') {
        const s = new Date(cursor); s.setHours(9, 0, 0, 0);
        const en = new Date(s.getTime() + 3_600_000);
        setEditorDraft(draftFromRange({ start: s, end: en, staffId: staffLanes[0]?.id ?? meId }));
        setPanel('calendar');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [api, clipboard, copySelection, cursor, draftFromRange, isAdmin, meId, selectedIds, staffLanes, state.events, view]);

  /* planner ------------------------------------------------------------------- */

  useEffect(() => {
    const staffId = staffLanes[0]?.id ?? meId;
    if (!planner) setPlanner(emptyPlanner(staffId));
  }, [meId, planner, staffLanes]);

  const applyPlanner = useCallback(async () => {
    if (!planner) return;
    await api.saveRule({
      id: planner.id,
      staffId: planner.staffId,
      label: planner.label,
      pattern: planner.pattern,
      effectiveFrom: planner.effectiveFrom,
      effectiveTo: planner.effectiveTo,
      scope: planner.scope,
    });
    toast.success(`Regular availability applied for ${state.staff.find((s) => s.id === planner.staffId)?.name ?? 'coach'} — generated entries now show in the calendar.`, { duration: 6000 });
  }, [api, planner, state.staff]);

  /* toolbar -------------------------------------------------------------------- */

  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const rangeLabel = useMemo(() => {
    if (view === 'day' || view === 'agenda') return cursor.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (view === 'month') return cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const end = addDays(weekStart, 6);
    const sameMonth = weekStart.getMonth() === end.getMonth();
    return sameMonth
      ? `${weekStart.getDate()} – ${end.getDate()} ${end.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`
      : `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }, [cursor, view, weekStart]);

  const shift = (dir: 1 | -1) => {
    setCursor((c) => {
      if (view === 'day' || view === 'agenda') return addDays(c, dir);
      if (view === 'month') { const n = new Date(c); n.setMonth(n.getMonth() + dir); return n; }
      return addDays(c, dir * 7);
    });
  };

  const jumpToConflict = (c: typeof state.conflicts[number]) => {
    setCursor(new Date(c.blocker.start));
    setView('day');
    setSelectedIds(new Set([c.blocker.id, c.assignment.id]));
    setDetails({ ev: c.blocker, anchor: { x: Math.max(16, window.innerWidth / 2 - 160), y: 200 } });
  };

  const editorConflicts = editorDraft ? draftConflicts(editorDraft) : [];

  return (
    <div className="flex min-h-0 flex-col gap-3" ref={mainRef}>
      <PageHeader
        title="Coach diary & availability"
        subtitle="Calendar-first personal diary — drag to plan, click to edit, patterns for regular hours"
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button className="hidden sm:inline-flex" intent="secondary" size="sm" onClick={() => setHelpOpen({ x: window.innerWidth - 420, y: 150 })} aria-label="Keyboard shortcuts">
              <Keyboard className="size-3.5" /> Shortcuts
            </Button>
            <Badge tone={isDemo ? 'accent' : 'success'} size="sm" dot>{isDemo ? 'Design review data' : 'Live'}</Badge>
          </div>
        }
      />

      {/* =========================== toolbar =========================== */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface p-2 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:overscroll-x-contain">
        {/* staff selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setStaffPickerOpen((o) => !o)}
            className="flex h-8 items-center gap-1.5 rounded-sm border border-line bg-surface-raised px-2 text-xs font-semibold hover:bg-surface-hover"
            aria-expanded={staffPickerOpen}
            aria-haspopup="listbox"
          >
            <Users className="size-3.5 text-ink-muted" />
            <span className="max-w-[180px] truncate">
              {staffLanes.length === 1
                ? staffLanes[0]?.name ?? 'Select coach'
                : `${staffLanes.length} coaches compared`}
            </span>
          </button>
          {staffPickerOpen && (
            <FloatingCard anchor={{ x: 8, y: 150 }} width={280} label="Choose coaches" onClose={() => setStaffPickerOpen(false)}>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Show diary for</p>
              <ul className="max-h-72 space-y-0.5 overflow-y-auto" role="listbox">
                {state.staff.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-surface-hover">
                      <input
                        type="checkbox"
                        className="accent-[var(--brand)]"
                        checked={staffIds.includes(s.id)}
                        onChange={() => {
                          setStaffIds((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]));
                        }}
                      />
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[9px] font-black text-brand-text">{s.initials}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{s.name} {s.id === meId && <span className="text-ink-faint">(me)</span>}</span>
                      <span className="text-[9px] font-bold uppercase text-ink-faint">{s.roles[0]}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-1.5">
                <Button intent="secondary" size="sm" className="flex-1" onClick={() => setStaffIds(state.staff.map((s) => s.id))}>All staff</Button>
                <Button intent="ghost" size="sm" className="flex-1" onClick={() => setStaffIds([meId])}>Just me</Button>
              </div>
              <p className="mt-1.5 text-[10px] text-ink-faint">Pick several to compare side by side{isAdmin ? ', or open the resource timeline.' : '.'}</p>
            </FloatingCard>
          )}
        </div>

        {/* view switch */}
        <div className="flex rounded-sm border border-line bg-surface-raised p-0.5" role="tablist" aria-label="Calendar view">
          {(['day', 'week', 'month', 'agenda'] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn('rounded-sm px-2 py-1 text-xs font-bold capitalize', view === v ? 'bg-brand text-brand-ink' : 'text-ink-muted hover:bg-surface-hover')}
            >
              {v}
            </button>
          ))}
          {isAdmin && (
            <button
              role="tab"
              aria-selected={view === 'resources'}
              onClick={() => setView('resources')}
              className={cn('rounded-sm px-2 py-1 text-xs font-bold', view === 'resources' ? 'bg-brand text-brand-ink' : 'text-ink-muted hover:bg-surface-hover')}
              title="All staff resource timeline"
            >
              Staff
            </button>
          )}
        </div>

        {/* navigation */}
        <div className="flex items-center gap-0.5">
          <Button intent="ghost" size="sm" onClick={() => shift(-1)} aria-label="Previous"><ChevronLeft className="size-4" /></Button>
          <Button intent="secondary" size="sm" onClick={() => { setCursor(new Date()); }}>Today</Button>
          <Button intent="ghost" size="sm" onClick={() => shift(1)} aria-label="Next"><ChevronRight className="size-4" /></Button>
        </div>
        <label
          className="relative flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border border-line bg-surface-raised px-2 text-xs font-bold hover:bg-surface-hover"
          title="Pick a date"
          onClick={() => { try { datePickerRef.current?.showPicker(); } catch { datePickerRef.current?.focus(); } }}
        >
          <CalendarDays className="size-3.5 text-ink-muted" />
          {rangeLabel}
          <input
            ref={datePickerRef}
            type="date"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={dateKey(cursor)}
            onChange={(e) => e.target.value && setCursor(parseKey(e.target.value))}
            aria-label="Go to date"
            tabIndex={-1}
          />
        </label>

        <div className="sm:ml-auto flex flex-wrap items-center gap-1.5">
          {/* Clipboard and history are keyboard-friendly desktop actions. On a
              phone they move out of the way so the date/view controls stay reachable. */}
          <div className="hidden items-center gap-1.5 sm:flex">
            <Button intent="ghost" size="sm" onClick={() => copySelection(false)} aria-label="Copy selected" title="Copy (Ctrl+C)"><Copy className="size-3.5" /></Button>
            <Button intent="ghost" size="sm" onClick={() => copySelection(true)} aria-label="Cut selected" title="Cut (Ctrl+X)"><Scissors className="size-3.5" /></Button>
            <Button
              intent={clipboard ? 'soft' : 'ghost'}
              size="sm"
              disabled={!clipboard}
              onClick={(e) => setPasteOpen({ x: e.clientX - 150, y: e.clientY + 12 })}
              title="Paste options (Ctrl+V)"
            >
              <ClipboardPaste className="size-3.5" /> Paste
            </Button>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <Button intent="ghost" size="sm" disabled={!api.canUndo()} onClick={() => void api.undo()} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)"><Undo2 className="size-3.5" /></Button>
            <Button intent="ghost" size="sm" disabled={!api.canRedo()} onClick={() => void api.redo()} aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)"><Redo2 className="size-3.5" /></Button>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          </div>
          {/* filters */}
          <div className="relative">
            <Button intent="ghost" size="sm" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
              <SlidersHorizontal className="size-3.5" /> Filters
            </Button>
            {filtersOpen && (
              <FloatingCard anchor={{ x: window.innerWidth - 380, y: 150 }} width={260} label="View filters" onClose={() => setFiltersOpen(false)}>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Show event types</p>
                {([
                  ['availability', 'Availability', ['available', 'working_hours']],
                  ['timeoff', 'Time off & unavailability', ['holiday', 'sick_leave', 'personal_appointment', 'out_of_office', 'unavailable_other', 'other']],
                  ['duty', 'Duty & training', ['on_duty', 'club_duty', 'duty_outside_club', 'working_elsewhere', 'training']],
                  ['bookings', 'Sessions & tasks', ['session', 'task']],
                ] as const).map(([key, label, kinds]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs font-semibold hover:bg-surface-hover">
                    <input
                      type="checkbox"
                      className="accent-[var(--brand)]"
                      checked={!hiddenGroups.has(key)}
                      onChange={() => setHiddenGroups((prev) => {
                        const n = new Set(prev);
                        if (n.has(key)) n.delete(key); else n.add(key);
                        return n;
                      })}
                    />
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: KIND[kinds[0] as EventKind].color }} aria-hidden />
                    {label}
                  </label>
                ))}
              </FloatingCard>
            )}
          </div>
          {/* settings */}
          <div className="relative">
            <Button intent="ghost" size="sm" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen}>
              <Settings2 className="size-3.5" /> Settings
            </Button>
            {settingsOpen && (
              <FloatingCard anchor={{ x: window.innerWidth - 340, y: 150 }} width={250} label="Calendar settings" onClose={() => setSettingsOpen(false)}>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="set-start">Day starts</Label>
                    <Input id="set-start" type="number" min={0} max={12} value={settings.startHour} onChange={(e) => setSettings((s) => ({ ...s, startHour: Math.max(0, Math.min(12, Number(e.target.value) || 0)) }))} />
                  </div>
                  <div>
                    <Label htmlFor="set-end">Day ends</Label>
                    <Input id="set-end" type="number" min={13} max={24} value={settings.endHour} onChange={(e) => setSettings((s) => ({ ...s, endHour: Math.max(13, Math.min(24, Number(e.target.value) || 22)) }))} />
                  </div>
                  <div>
                    <Label htmlFor="set-slot">Grid increments</Label>
                    <div className="flex gap-1">
                      {[15, 30].map((m) => (
                        <button key={m} type="button" onClick={() => setSettings((s) => ({ ...s, slotMinutes: m }))}
                          className={cn('flex-1 rounded-md border px-2 py-1 text-xs font-bold', settings.slotMinutes === m ? 'border-brand bg-brand-soft text-brand-text' : 'border-line hover:bg-surface-hover')}>
                          {m} min
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="flex items-start gap-1 text-[10px] text-ink-faint"><Info className="mt-px size-3 shrink-0" />Working-hour range shapes the visible day; times outside it can still be reached by scrolling.</p>
                </div>
              </FloatingCard>
            )}
          </div>
          {/* planner toggle */}
          <div className="flex rounded-sm border border-line bg-surface-raised p-0.5" role="tablist" aria-label="Right panel">
            <button role="tab" aria-selected={panel === 'calendar'} onClick={() => setPanel('calendar')} className={cn('rounded-sm px-2 py-1 text-xs font-bold', panel === 'calendar' ? 'bg-brand text-brand-ink' : 'text-ink-muted hover:bg-surface-hover')}>
              <CalendarRange className="mr-1 inline size-3.5" />Entry
            </button>
            <button role="tab" aria-selected={panel === 'planner'} onClick={() => setPanel('planner')} className={cn('rounded-sm px-2 py-1 text-xs font-bold', panel === 'planner' ? 'bg-brand text-brand-ink' : 'text-ink-muted hover:bg-surface-hover')}>
              <ListTree className="mr-1 inline size-3.5" />Planner
            </button>
          </div>
          <Button
            intent="primary"
            size="sm"
            onClick={() => {
              const s = new Date(cursor); s.setHours(9, 0, 0, 0);
              setEditorDraft(draftFromRange({ start: s, end: new Date(s.getTime() + 3_600_000), staffId: staffLanes[0]?.id ?? meId }));
              setPanel('calendar');
            }}
          >
            <Sparkles className="size-3.5" /> New entry
          </Button>
        </div>
      </div>

      {/* summary chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="brand" size="md">{Math.round(summary.availabilityHours * 10) / 10}h availability in view</Badge>
        <Badge tone="info" size="md">{summary.sessions} booked sessions</Badge>
        {summary.conflicts > 0
          ? <Badge tone="danger" size="md" dot>{summary.conflicts} conflict{summary.conflicts > 1 ? 's' : ''}</Badge>
          : <Badge tone="success" size="md" dot>No conflicts</Badge>}
      </div>

      {/* =========================== main grid =========================== */}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex min-w-0 flex-col gap-3">
          {/* conflict strip */}
          <ConflictStrip
            conflicts={conflictsInRange}
            onJump={jumpToConflict}
            onAcknowledge={(c) => void api.setConflictStatus(c.id!, 'acknowledged')}
            onResolve={(c) => void api.setConflictStatus(c.id!, 'resolved')}
          />

          {/* calendar surface */}
          <div className="min-h-[540px] flex-1">
            {view === 'day' || (view === 'week' && !isMobile) ? (
              <TimeGrid
                days={view === 'day' ? [cursor] : days}
                events={rangeEvents}
                staffLanes={staffLanes}
                workingHours={{ start: settings.startHour, end: settings.endHour }}
                slotMinutes={settings.slotMinutes}
                selectedIds={selectedIds}
                clipboardIds={new Set(clipboard?.cut ? clipboard.ids : [])}
                onSelect={handleSelect}
                onCreate={handleCreate}
                onOpen={handleOpen}
                onEdit={handleEdit}
                onMove={(ev, start, end, staffId) => void handleMove(ev, start, end, staffId)}
                onHeaderClick={(day) => { setCursor(day); setView('day'); }}
              />
            ) : view === 'week' && isMobile ? (
              <div className="card overflow-hidden">
                <div className="border-b border-line bg-surface-inset/60 px-3 py-2 text-xs font-bold text-ink-muted">
                  Week overview · tap a day to open the time grid
                </div>
                <AgendaView days={days} events={rangeEvents} selectedIds={selectedIds} onSelect={handleSelect} onOpen={handleOpen} onOpenDay={(day) => { setCursor(day); setView('day'); }} />
              </div>
            ) : view === 'month' ? (
              <MonthGrid
                monthAnchor={cursor}
                events={rangeEvents}
                selectedIds={selectedIds}
                onSelect={handleSelect}
                onOpen={handleOpen}
                onOpenDay={(day) => { setCursor(day); setView('day'); }}
                onMoveDay={(ev, day) => {
                  if (ev.system) { toast.warning('System bookings move in Scheduling, not the personal diary.'); return; }
                  const dur = Date.parse(ev.end) - Date.parse(ev.start);
                  const s = new Date(day); s.setHours(new Date(ev.start).getHours(), new Date(ev.start).getMinutes(), 0, 0);
                  void handleMove(ev, s, new Date(s.getTime() + dur), ev.staffId);
                }}
                onEdit={handleEdit}
              />
            ) : view === 'agenda' ? (
              <AgendaView days={days} events={rangeEvents} selectedIds={selectedIds} onSelect={handleSelect} onOpen={handleOpen} onOpenDay={(day) => { setCursor(day); setView('day'); }} />
            ) : (
              <ResourceTimeline
                days={days}
                staff={state.staff}
                events={state.events}
                onSelect={handleSelect}
                onOpen={handleOpen}
                onOpenDay={(day) => { setCursor(day); setView('day'); }}
              />
            )}
          </div>

          <LegendBar />
        </div>

        {/* right panel */}
        <div className="min-h-[420px] lg:max-h-[calc(100dvh-140px)]">
          {panel === 'planner' && planner ? (
            <PlannerPanel
              value={planner}
              onChange={(patch) => setPlanner((p) => (p ? { ...p, ...patch } : p))}
              staffOptions={state.staff}
              existingRules={state.rules}
              meId={meId}
              canRecordForOthers={canRecordForOthers}
              onApply={applyPlanner}
              onDeleteRule={(id) => api.deleteRule(id)}
              onPreviewInCalendar={() => { setPanel('calendar'); setCursor(parseKey(planner.effectiveFrom)); }}
            />
          ) : editorDraft ? (
            <EventEditorPanel
              draft={editorDraft}
              onChange={(patch) => setEditorDraft((d) => (d ? { ...d, ...patch } : d))}
              staffOptions={state.staff}
              meId={meId}
              canRecordForOthers={canRecordForOthers}
              conflicts={editorConflicts.map((c) => ({ message: c.message, assignment: c.assignment }))}
              existingForStaff={Math.max(0, rangeEvents.filter((e) => e.staffId === editorDraft.staffId && e.id !== editorDraft.id).length - 1)}
              createdAt={editorDraft.id ? `Source: ${SOURCE_LABEL[editorDraft.sourceType ?? 'manual']}${editorDraft.rateLabel ? ` · ${editorDraft.rateLabel} ${fmtMoney(editorDraft.rateCents)}/h` : ''}` : undefined}
              onSave={(c) => void saveDraft(c, false)}
              onSaveAndRepeat={(c) => void saveDraft(c, true)}
              onDelete={() => void deleteDraft()}
              onClose={() => setEditorDraft(null)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface-inset/40 p-6 text-center">
              <CalendarRange className="size-6 text-ink-faint" />
              <p className="text-sm font-bold">Nothing selected</p>
              <p className="max-w-[240px] text-xs text-ink-muted">
                Drag across the calendar to create availability, or double-click an entry to edit it.
                System bookings (sessions &amp; tasks) open with a link instead.
              </p>
              <Button intent="soft" size="sm" onClick={() => { setPanel('planner'); }}>
                <ListTree className="size-3.5" /> Set regular hours instead
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* =========================== popovers =========================== */}

      {quick && (
        <QuickCreatePopover
          anchor={quick.anchor}
          range={quick.range}
          draft={quick.draft}
          staffName={state.staff.find((s) => s.id === quick.draft.staffId)?.name}
          onChange={(patch) => setQuick((q) => (q ? { ...q, draft: { ...q.draft, ...patch } } : q))}
          onSave={() => {
            const d = quick.draft;
            void api.createEntry({
              staffId: d.staffId, title: d.title || KIND[d.kind].label, kind: d.kind,
              start: new Date(d.startLocal), end: new Date(d.endLocal),
              notes: d.notes || undefined, visibility: d.visibility,
            }).then((created) => {
              const conflicts = draftConflicts({ ...d, id: created?.id });
              if (conflicts.length) toast.warning(`Saved with ${conflicts.length} conflict — the session is flagged red and the owner notified.`);
              else toast.success('Diary entry saved.', { action: { label: 'Undo', onClick: () => void api.undo() } });
            });
            setQuick(null);
          }}
          onMoreDetails={() => { setEditorDraft(quick.draft); setPanel('calendar'); setQuick(null); }}
        />
      )}

      {details && (
        <EventDetailsPopover
          anchor={details.anchor}
          ev={details.ev}
          multiStaff={staffLanes.length > 1}
          onClose={() => setDetails(null)}
          onEdit={() => handleEdit(details.ev)}
          onDuplicate={() => {
            void api.duplicateEntry(details.ev.id).then(() => {
              toast.success('Entry duplicated — drag it to another time.');
              setDetails(null);
            });
          }}
          onCopy={() => { setClipboard({ ids: [details.ev.id], cut: false }); toast.success('Copied — press Ctrl+V to paste.'); setDetails(null); }}
          onCut={() => { setClipboard({ ids: [details.ev.id], cut: true }); toast.success('Cut — press Ctrl+V to paste elsewhere.'); setDetails(null); }}
          onDelete={() => { void api.deleteEntries([details.ev.id]); setDetails(null); toast.success('Entry deleted.', { action: { label: 'Undo', onClick: () => void api.undo() } }); }}
          onOpenLink={() => { if (details.ev.linkTo) navigate(details.ev.linkTo); }}
        />
      )}

      {pasteOpen && clipboard && (
        <PastePopover
          anchor={pasteOpen}
          options={pasteOptions}
          onChange={(patch) => setPasteOptions((o) => ({ ...o, ...patch }))}
          count={clipboard.ids.length}
          onClose={() => setPasteOpen(null)}
          onApply={() => void applyPaste()}
        />
      )}

      {helpOpen && (
        <FloatingCard anchor={helpOpen} width={300} label="Keyboard shortcuts" onClose={() => setHelpOpen(null)}>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Keyboard shortcuts</p>
          <ul className="space-y-1 text-xs text-ink-muted">
            {[
              ['Drag on empty grid', 'create an entry'],
              ['Drag entry / edges', 'move · resize'],
              ['Double-click entry', 'edit'],
              ['Ctrl / ⌘ + click', 'select multiple'],
              ['Ctrl+C · X · V', 'copy · cut · paste'],
              ['Ctrl+Z · Ctrl+Y', 'undo · redo'],
              ['Del', 'delete selection'],
              ['← →', 'previous / next day'],
              ['T', 'today'],
              ['D · W · M · A', 'day · week · month · agenda'],
              ['R', 'resource timeline (admins)'],
              ['N', 'new entry'],
            ].map(([k, v]) => (
              <li key={k} className="flex items-baseline justify-between gap-3">
                <kbd className="rounded border border-line bg-surface-inset px-1.5 py-0.5 font-mono text-[10px] font-bold">{k}</kbd>
                <span className="text-right">{v}</span>
              </li>
            ))}
          </ul>
        </FloatingCard>
      )}
    </div>
  );
}
