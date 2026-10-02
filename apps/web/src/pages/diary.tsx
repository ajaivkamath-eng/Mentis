import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownUp, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3,
  Filter, LayoutList, ListChecks, MapPin, Moon, Plus, RefreshCw, Search, Settings2, ShieldCheck,
  Repeat, SlidersHorizontal, Sparkles, Users, X,
} from 'lucide-react';
import type { ConflictRecord, DiaryEvent, IsoWeekday } from '@mentis/core';
import { useAuth } from '../lib/auth';
import { usePersistentState, useMediaQuery } from '../lib/hooks';
import { toast } from '../components/ui/toast';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input, InputWithIcon, Label, Select, SegmentedControl } from '../components/ui/input';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useDiaryData, type EntryDraft, type StaffOption } from '../lib/diary/store';
import {
  KIND, ROLE_LABEL, SOURCE_LABEL, WEEKDAYS, addDays, dateKey, eventsOnDay, fmtDayLong,
  fmtTime, fmtTimeRange, minutesSinceMidnight, parseKey, sameDay, startOfDay, startOfWeek,
} from '../lib/diary/model';
import { ConflictStrip, LegendBar } from '../components/diary/legend';
import { EventDetailsPopover } from '../components/diary/editor-panel';
import type { EditorDraft } from '../components/diary/editor-panel';
import { makeEditorDraft, DiaryEntryDialog } from '../components/diary/entry-dialog';
import { TimeGrid, type CreateRange } from '../components/diary/time-grid';
import { AgendaView, MonthGrid, ResourceTimeline } from '../components/diary/other-views';
import { PlannerPanel, emptyPlanner, plannerFromRule, type PlannerValue } from '../components/diary/planner-panel';

const EVENT_KINDS = Object.keys(KIND) as (keyof typeof KIND)[];
const SOURCE_TYPES = Object.keys(SOURCE_LABEL) as (keyof typeof SOURCE_LABEL)[];
const SLOT_MINUTES = 15;
const DEFAULT_HOURS = { start: 7, end: 22 };

type DiaryView = 'day' | 'week' | 'month' | 'agenda' | 'staff';
type DiaryScope = 'mine' | 'all' | string;
type ConflictFilter = 'all' | 'conflicts' | 'clear';

interface DiaryFilters {
  staffId: string;
  venue: string;
  kinds: string[];
  sources: string[];
  conflict: ConflictFilter;
}

interface MoveDraft {
  event: DiaryEvent;
  startLocal: string;
}

interface RescheduleDraft {
  event: DiaryEvent;
  proposedStart: Date;
  proposedEnd: Date;
}

const pad = (n: number) => String(n).padStart(2, '0');
const sameLocalDay = (a: Date, b: Date) => dateKey(a) === dateKey(b);
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

function atLocalTime(day: Date, hours: number, minutes = 0) {
  const result = startOfDay(day);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function rangeLabel(date: Date, view: DiaryView) {
  if (view === 'day') return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (view === 'month') return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const first = startOfWeek(date);
  const last = addDays(first, 6);
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return `${first.getDate()}–${last.getDate()} ${last.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;
  }
  return `${first.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function startOfVisibleRange(date: Date, view: DiaryView) {
  return view === 'day' ? startOfDay(date) : startOfWeek(date);
}

function asInputEndOfDay(date: Date) {
  const d = startOfDay(date);
  d.setHours(23, 59, 0, 0);
  return d;
}

function localDateTime(d: Date) {
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function humanName(staffId: string, staff: StaffOption[], fallback: string) {
  return staff.find((s) => s.id === staffId)?.name ?? fallback;
}

function bookingRoute(event: DiaryEvent) {
  if (event.kind === 'task' || event.sourceType === 'task') {
    return event.sourceId ? `/tasks?task=${encodeURIComponent(event.sourceId)}` : '/tasks';
  }
  return event.sourceId ? `/sessions?occurrence=${encodeURIComponent(event.sourceId)}` : '/sessions';
}

function conflictText(event: DiaryEvent, blocker: DiaryEvent, start: Date, end: Date, staff: StaffOption[]) {
  const from = new Date(Math.max(start.getTime(), Date.parse(blocker.start)));
  const to = new Date(Math.min(end.getTime(), Date.parse(blocker.end)));
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
  const person = humanName(event.staffId, staff, event.staffName ?? 'This staff member');
  const date = start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  const time = `${fmtTime(start.toISOString())}–${fmtTime(end.toISOString())}`;
  if (blocker.kind === 'session' || blocker.kind === 'task') {
    return `${person} already has “${blocker.title}” from ${fmtTime(blocker.start)}–${fmtTime(blocker.end)} on ${date}; it overlaps the proposed ${time} by ${minutes} minutes.`;
  }
  return `${person} is marked ${KIND[blocker.kind]?.label.toLowerCase() ?? 'unavailable'} for “${blocker.title}” on ${date}; it overlaps the proposed ${time} by ${minutes} minutes.`;
}

export function DiaryWorkspace() {
  const { staff: signedInStaff, canDo } = useAuth();
  const diary = useDiaryData();
  const state = diary.state;
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 720px)');
  const canManageTeam = canDo('diary.manage') || canDo('availability.recordAll');
  const canRecordForOthers = canManageTeam || canDo('availability.recordForOthers');
  const canManageConflicts = canManageTeam;
  const canScheduleSessions = canDo('sessions.manage');
  const canScheduleTasks = canDo('tasks.approve');
  const meId = state.meId || signedInStaff?.id || '';
  const fallbackMe: StaffOption = {
    id: meId,
    name: signedInStaff?.display_name ?? 'My diary',
    roles: signedInStaff?.roles ?? [],
    initials: (signedInStaff?.display_name ?? 'ME').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
  };
  const staffOptions = useMemo(() => {
    const rows = state.staff.length ? state.staff : [];
    return rows.some((row) => row.id === meId) || !meId ? rows : [fallbackMe, ...rows];
  }, [state.staff, meId, fallbackMe.name]);

  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [view, setView] = useState<DiaryView>(() => (typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches ? 'day' : 'week'));
  const [scope, setScope] = useState<DiaryScope>('mine');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<DiaryFilters>({
    staffId: 'all', venue: 'all', kinds: [...EVENT_KINDS], sources: [...SOURCE_TYPES], conflict: 'all',
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<{ id: string; anchor: { x: number; y: number } } | null>(null);
  const [entryDraft, setEntryDraft] = useState<EditorDraft | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);
  const [moveDraft, setMoveDraft] = useState<MoveDraft | null>(null);
  const [rescheduleDraft, setRescheduleDraft] = useState<RescheduleDraft | null>(null);
  const [rescheduleConfirmed, setRescheduleConfirmed] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerValue, setPlannerValue] = useState<PlannerValue>(() => emptyPlanner(meId));
  const [copiedEvent, setCopiedEvent] = useState<DiaryEvent | null>(null);
  const [workingHours, setWorkingHours] = usePersistentState('mentis.diary.workingHours', DEFAULT_HOURS);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    if (view === 'week' || view === 'month' || view === 'staff') setView('day');
  }, [isMobile]);

  useEffect(() => {
    if (view === 'staff' && !canManageTeam) setView(isMobile ? 'day' : 'week');
  }, [view, canManageTeam, isMobile]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        openNewEntry();
      }
      if (event.key === 'Escape') {
        setFiltersOpen(false);
        setDetails(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // openNewEntry is deliberately stable over the current date/scope; key listener updates each render.
  });

  const venueOptions = useMemo(() => [...new Set(state.events.map((event) => event.location).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b)), [state.events]);
  const isResourceScope = scope.startsWith('resource:');
  const selectedResource = isResourceScope ? scope.slice('resource:'.length) : '';
  const selectedStaff = scope !== 'mine' && scope !== 'all' && !isResourceScope ? scope : '';
  const activeOwnerId = scope === 'mine' ? meId : selectedStaff || (filters.staffId !== 'all' ? filters.staffId : meId);

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return state.events.filter((event) => {
      if (scope === 'mine' && event.staffId !== meId) return false;
      if (selectedStaff && event.staffId !== selectedStaff) return false;
      if (isResourceScope && event.location !== selectedResource) return false;
      if (filters.staffId !== 'all' && event.staffId !== filters.staffId) return false;
      if (filters.venue !== 'all' && event.location !== filters.venue) return false;
      if (!filters.kinds.includes(event.kind)) return false;
      if (!filters.sources.includes(event.sourceType)) return false;
      const hasConflict = event.conflictStatus === 'open' || event.conflictStatus === 'acknowledged';
      if (filters.conflict === 'conflicts' && !hasConflict) return false;
      if (filters.conflict === 'clear' && hasConflict) return false;
      if (query && ![event.title, event.staffName, event.location, event.notes, KIND[event.kind]?.label, SOURCE_LABEL[event.sourceType]].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)) return false;
      return true;
    });
  }, [state.events, scope, meId, selectedStaff, isResourceScope, selectedResource, filters, search]);

  const staffForGrid = useMemo(() => {
    if (isResourceScope) {
      const ids = [...new Set(visibleEvents.map((event) => event.staffId))];
      const rows = ids.map((id) => staffOptions.find((item) => item.id === id)).filter((item): item is StaffOption => Boolean(item));
      return rows.length ? rows.slice(0, 4) : [staffOptions.find((item) => item.id === activeOwnerId) ?? fallbackMe];
    }
    const owner = staffOptions.find((item) => item.id === activeOwnerId) ?? fallbackMe;
    return [owner];
  }, [isResourceScope, visibleEvents, staffOptions, activeOwnerId, fallbackMe]);

  const pageDays = useMemo(() => {
    if (view === 'day') return [startOfDay(selectedDate)];
    const monday = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  }, [selectedDate, view]);

  const dataRange = useMemo(() => {
    const firstVisible = view === 'month'
      ? startOfWeek(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
      : pageDays[0];
    const lastVisible = view === 'month' ? addDays(firstVisible, 41) : pageDays[pageDays.length - 1];
    return { from: addDays(firstVisible, -14), to: addDays(lastVisible, 35) };
  }, [pageDays, selectedDate, view]);

  useEffect(() => {
    void diary.loadRange(dataRange.from, dataRange.to);
  }, [diary.loadRange, dataRange]);

  useEffect(() => {
    if (!moveDraft) return;
    const start = new Date(moveDraft.startLocal);
    if (!Number.isFinite(start.getTime())) return;
    const duration = Date.parse(moveDraft.event.end) - Date.parse(moveDraft.event.start);
    const end = new Date(start.getTime() + duration);
    void diary.loadRange(addDays(startOfDay(start), -14), addDays(startOfDay(end), 35));
  }, [diary.loadRange, moveDraft?.event.id, moveDraft?.startLocal]);

  const shownConflicts = useMemo(() => {
    const relevantStaff = scope === 'mine' ? meId : selectedStaff;
    return state.conflicts.filter((conflict) => {
      if ((conflict.status ?? 'open') === 'resolved') return false;
      if (Math.max(Date.parse(conflict.blocker.end), Date.parse(conflict.assignment.end)) < Date.now()) return false;
      if (relevantStaff && conflict.staffId !== relevantStaff) return false;
      if (selectedResource && conflict.blocker.location !== selectedResource && conflict.assignment.location !== selectedResource) return false;
      if (filters.staffId !== 'all' && conflict.staffId !== filters.staffId) return false;
      return true;
    }).slice(0, 3);
  }, [state.conflicts, scope, meId, selectedStaff, selectedResource, filters.staffId]);

  const activeConflictCount = state.conflicts.filter((conflict) => (conflict.status ?? 'open') !== 'resolved').length;
  const rangeText = rangeLabel(selectedDate, view);
  const viewChoices = [
    { value: 'day', label: 'Day' },
    ...(!isMobile ? [{ value: 'week', label: 'Week' }] : []),
    ...(!isMobile ? [{ value: 'month', label: 'Month' }] : []),
    { value: 'agenda', label: 'Agenda' },
    ...(canManageTeam && !isMobile ? [{ value: 'staff', label: 'Staff' }] : []),
  ] as { value: DiaryView; label: string }[];

  const setPageView = (next: DiaryView) => {
    if (next === 'staff') {
      if (scope === 'mine') setScope('all');
      setView('staff');
      return;
    }
    if (scope === 'all') setScope('mine');
    setView(next);
  };

  const changeScope = (next: string) => {
    setScope(next);
    if (next === 'all' || next.startsWith('resource:')) setView('staff');
    else setView(isMobile ? 'day' : 'week');
    setSelectedIds(new Set());
  };

  const moveDate = (direction: -1 | 1) => {
    setSelectedDate((current) => {
      const next = new Date(current);
      if (view === 'day') next.setDate(next.getDate() + direction);
      else if (view === 'month') next.setMonth(next.getMonth() + direction);
      else next.setDate(next.getDate() + direction * 7);
      return next;
    });
  };

  const setCalendarDate = (key: string) => {
    if (!key) return;
    const next = parseKey(key);
    setSelectedDate(next);
    setDatePickerOpen(false);
  };

  const ownerForNewEntry = (requestedStaffId?: string) => {
    if (requestedStaffId && (canRecordForOthers || requestedStaffId === meId)) return requestedStaffId;
    if (scope === 'mine') return meId;
    if (selectedStaff) return selectedStaff;
    if (filters.staffId !== 'all' && canRecordForOthers) return filters.staffId;
    return meId;
  };

  function openNewEntry(start?: Date, end?: Date, staffId?: string, allDay = false) {
    const day = start ? startOfDay(start) : startOfDay(selectedDate);
    let from = start ?? atLocalTime(day, 9, 0);
    let to = end ?? new Date(from.getTime() + 60 * 60_000);
    if (allDay) {
      from = startOfDay(from);
      to = asInputEndOfDay(end ?? from);
    }
    setEntryError(null);
    setDetails(null);
    setEntryDraft(makeEditorDraft({ staffId: ownerForNewEntry(staffId), start: from, end: to, allDay }));
  }

  const canEditEvent = (event: DiaryEvent) => {
    if (event.kind === 'session' || event.kind === 'task') return false;
    return !event.system || event.sourceType === 'planner'
      ? event.staffId === meId || canRecordForOthers
      : false;
  };

  const canMoveEvent = (event: DiaryEvent) => {
    if (event.kind === 'session') return canScheduleSessions;
    if (event.kind === 'task') return canScheduleTasks;
    return canEditEvent(event);
  };

  const openEventDetails = (event: DiaryEvent, point?: { x: number; y: number; currentTarget?: EventTarget | null }) => {
    let x = point?.x ?? 0;
    let y = point?.y ?? 0;
    if ((!x && !y) && point?.currentTarget instanceof HTMLElement) {
      const rect = point.currentTarget.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
    setDetails({ id: event.id, anchor: { x, y } });
  };

  const openEventEditor = (event: DiaryEvent) => {
    if (!canEditEvent(event)) {
      toast.info('This booking is managed by its source schedule. It has not been changed.', { action: { label: event.kind === 'task' ? 'Open task' : 'Open session', onClick: () => navigate(bookingRoute(event)) } });
      return;
    }
    setDetails(null);
    setEntryError(null);
    setEntryDraft(makeEditorDraft({ staffId: event.staffId, start: new Date(event.start), end: new Date(event.end), event }));
  };

  const openMoveDialog = (event: DiaryEvent) => {
    if (!canMoveEvent(event)) {
      toast.error('You do not have permission to move this entry. It has not moved.', { action: { label: event.kind === 'task' ? 'Open task' : 'Open session', onClick: () => navigate(bookingRoute(event)) } });
      return;
    }
    setDetails(null);
    setMoveDraft({ event, startLocal: localDateTime(new Date(event.start)) });
  };

  const rescheduleConflicts = useMemo(() => {
    if (!rescheduleDraft) return [] as string[];
    const { event, proposedStart, proposedEnd } = rescheduleDraft;
    const start = proposedStart.getTime();
    const end = proposedEnd.getTime();
    const conflicts: string[] = [];
    for (const other of state.events) {
      if (other.id === event.id || !overlaps(start, end, Date.parse(other.start), Date.parse(other.end))) continue;
      const isAssignment = other.kind === 'session' || other.kind === 'task';
      const staffConflict = other.staffId === event.staffId && (isAssignment || KIND[other.kind]?.blocking);
      const venueConflict = Boolean(event.location && other.location === event.location && isAssignment);
      if (!staffConflict && !venueConflict) continue;
      const message = staffConflict
        ? conflictText(event, other, proposedStart, proposedEnd, staffOptions)
        : `The ${event.location} is already booked for “${other.title}” from ${fmtTime(other.start)}–${fmtTime(other.end)} on ${proposedStart.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}.`;
      if (!conflicts.includes(message)) conflicts.push(message);
    }
    return conflicts;
  }, [rescheduleDraft, state.events, staffOptions]);

  const handleMove = async (event: DiaryEvent, start: Date, end: Date, nextStaffId = event.staffId) => {
    if (event.kind === 'session' || event.kind === 'task') {
      if (!canMoveEvent(event)) {
        toast.error('This booking cannot be moved from your diary. It has not moved.', { action: { label: event.kind === 'task' ? 'Open task' : 'Open session', onClick: () => navigate(bookingRoute(event)) } });
        return;
      }
      setDetails(null);
      setRescheduleConfirmed(false);
      setRescheduleDraft({ event, proposedStart: start, proposedEnd: end });
      return;
    }
    if (!canEditEvent(event)) {
      toast.error('You can only move diary entries you are authorised to edit. The entry has not moved.');
      return;
    }
    if (KIND[event.kind]?.blocking) {
      const hasOverlap = state.events.some((other) => {
        if (other.id === event.id || other.staffId !== nextStaffId) return false;
        const booked = other.kind === 'session' || other.kind === 'task';
        return (booked || KIND[other.kind]?.blocking === true)
          && overlaps(start.getTime(), end.getTime(), Date.parse(other.start), Date.parse(other.end));
      });
      if (hasOverlap) {
        const draft = makeEditorDraft({ staffId: nextStaffId, start, end, event });
        setDetails(null);
        setEntryError(null);
        setEntryDraft({ ...draft, staffId: nextStaffId, startLocal: localDateTime(start), endLocal: localDateTime(end) });
        return;
      }
    }
    try {
      await diary.updateEntry(event.id, { start, end, staffId: nextStaffId });
      setSelectedDate(startOfDay(start));
      const occurrenceText = event.sourceType === 'planner' ? 'This occurrence moved; the weekly pattern is unchanged.' : 'Diary entry moved.';
      if (diary.canUndo()) toast.undoable(occurrenceText, () => { void diary.undo(); });
      else toast.success(occurrenceText);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not move the entry. It has been restored to its original time.');
    }
  };

  const onCreateRange = (range: CreateRange) => {
    setSelectedDate(startOfDay(range.start));
    const isAllDay = range.start.getHours() === 0 && range.start.getMinutes() === 0 && range.end.getHours() === 23;
    openNewEntry(range.start, range.end, range.staffId, isAllDay);
  };

  const onMonthMoveDay = (event: DiaryEvent, day: Date) => {
    const originalStart = new Date(event.start);
    const duration = Date.parse(event.end) - Date.parse(event.start);
    const start = startOfDay(day);
    start.setHours(originalStart.getHours(), originalStart.getMinutes(), originalStart.getSeconds(), 0);
    void handleMove(event, start, new Date(start.getTime() + duration), event.staffId);
  };

  const displayedEvent = details ? state.events.find((event) => event.id === details.id) : undefined;
  const editorConflicts = useMemo(() => {
    if (!entryDraft || !KIND[entryDraft.kind]?.blocking) return [] as { message: string; assignment: DiaryEvent }[];
    const start = new Date(entryDraft.startLocal).getTime();
    const end = new Date(entryDraft.endLocal).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return state.events.filter((event) => {
      if (event.id === entryDraft.id || event.staffId !== entryDraft.staffId) return false;
      const isBooking = event.kind === 'session' || event.kind === 'task';
      const isBlockingCommitment = KIND[event.kind]?.blocking === true;
      if (!isBooking && !isBlockingCommitment) return false;
      return overlaps(start, end, Date.parse(event.start), Date.parse(event.end));
    }).map((overlap) => {
      const overlapStart = new Date(Math.max(start, Date.parse(overlap.start)));
      const overlapEnd = new Date(Math.min(end, Date.parse(overlap.end)));
      const overlapMins = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 60_000);
      const who = humanName(entryDraft.staffId, staffOptions, 'This staff member');
      const isBooking = overlap.kind === 'session' || overlap.kind === 'task';
      return {
        assignment: overlap,
        message: isBooking
          ? `${who} has “${overlap.title}” booked from ${fmtTime(overlap.start)}–${fmtTime(overlap.end)}; it overlaps this ${KIND[entryDraft.kind].label.toLowerCase()} by ${overlapMins} minutes.`
          : `${who} already has “${overlap.title}” (${KIND[overlap.kind].label.toLowerCase()}) from ${fmtTime(overlap.start)}–${fmtTime(overlap.end)}; it overlaps this entry by ${overlapMins} minutes.`,
      };
    });
  }, [entryDraft, state.events, staffOptions]);

  const submitEntry = async (keepAnyway: boolean, repeat = false) => {
    if (!entryDraft) return;
    if (!canRecordForOthers && entryDraft.staffId !== meId) {
      setEntryError('You are not authorised to add or edit entries for another staff member.');
      return;
    }
    const start = new Date(entryDraft.startLocal);
    const end = new Date(entryDraft.endLocal);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setEntryError('The end must be after the start. Your changes are still here.');
      return;
    }
    if (entryDraft.repeat.enabled && (!entryDraft.repeat.weekdays.length || entryDraft.repeat.until < dateKey(start))) {
      setEntryError('Choose one or more weekdays and an end date on or after the first entry.');
      return;
    }
    if (editorConflicts.length && !keepAnyway) return;

    setSavingEntry(true);
    setEntryError(null);
    try {
      if (entryDraft.id) {
        await diary.updateEntry(entryDraft.id, {
          title: entryDraft.title,
          kind: entryDraft.kind,
          start,
          end,
          allDay: entryDraft.allDay,
          notes: entryDraft.notes,
          visibility: entryDraft.visibility,
          staffId: entryDraft.staffId,
        });
        toast.success(entryDraft.sourceType === 'planner' ? 'Occurrence updated. The weekly pattern is unchanged.' : 'Diary entry updated.');
      } else {
        const draft: EntryDraft = {
          title: entryDraft.title,
          kind: entryDraft.kind,
          start,
          end,
          allDay: entryDraft.allDay,
          notes: entryDraft.notes,
          visibility: entryDraft.visibility,
          staffId: entryDraft.staffId,
          repeat: repeat && entryDraft.repeat.enabled ? { weekdays: entryDraft.repeat.weekdays as IsoWeekday[], until: entryDraft.repeat.until } : null,
        };
        await diary.createEntry(draft);
        toast.success(repeat ? 'Diary entries saved for the selected weekly pattern.' : 'Diary entry saved.');
      }
      setEntryDraft(null);
      setEntryError(null);
      if (diary.canUndo()) toast.undoable('Saved diary change', () => { void diary.undo(); });
      setSelectedDate(startOfDay(start));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save diary entry. Please try again.';
      setEntryError(message);
      toast.error(message);
    } finally {
      setSavingEntry(false);
    }
  };

  const deleteEntry = async () => {
    if (!entryDraft?.id) return;
    if (!canEditEvent(state.events.find((event) => event.id === entryDraft.id) ?? ({ id: entryDraft.id, staffId: entryDraft.staffId, kind: entryDraft.kind, system: entryDraft.system, sourceType: entryDraft.sourceType } as DiaryEvent))) {
      setEntryError('You are not authorised to delete this entry.');
      return;
    }
    setSavingEntry(true);
    try {
      await diary.deleteEntries([entryDraft.id]);
      toast.success('Diary entry deleted.');
      setEntryDraft(null);
      if (diary.canUndo()) toast.undoable('Diary entry deleted', () => { void diary.undo(); });
    } catch (error) {
      setEntryError(error instanceof Error ? error.message : 'Unable to delete this entry.');
    } finally {
      setSavingEntry(false);
    }
  };

  const moveToTarget = async () => {
    if (!moveDraft) return;
    const start = new Date(moveDraft.startLocal);
    if (!Number.isFinite(start.getTime())) return;
    const duration = Date.parse(moveDraft.event.end) - Date.parse(moveDraft.event.start);
    const end = new Date(start.getTime() + duration);
    await handleMove(moveDraft.event, start, end, moveDraft.event.staffId);
    setMoveDraft(null);
  };

  const setMoveDate = (date: string) => {
    if (!moveDraft || !date) return;
    const time = moveDraft.startLocal.slice(11, 16) || '09:00';
    setMoveDraft({ ...moveDraft, startLocal: `${date}T${time}` });
  };

  const setMoveTime = (time: string) => {
    if (!moveDraft || !time) return;
    setMoveDraft({ ...moveDraft, startLocal: `${moveDraft.startLocal.slice(0, 10)}T${time}` });
  };

  const openPlanner = (staffId = activeOwnerId, ruleId?: string | null) => {
    const rule = ruleId ? state.rules.find((item) => item.id === ruleId) : undefined;
    setPlannerValue(rule ? plannerFromRule(rule) : emptyPlanner(staffId || meId));
    setPlannerOpen(true);
  };

  const applyPlanner = async () => {
    try {
      await diary.saveRule({
        id: plannerValue.id,
        staffId: plannerValue.staffId,
        label: plannerValue.label,
        pattern: plannerValue.pattern,
        effectiveFrom: plannerValue.effectiveFrom,
        effectiveTo: plannerValue.effectiveTo,
        scope: plannerValue.scope,
      });
      toast.success('Regular availability pattern saved.');
      setPlannerOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the availability pattern.');
    }
  };

  const onConflictJump = (conflict: ConflictRecord) => {
    setSelectedDate(startOfDay(new Date(conflict.assignment.start)));
    if (canManageTeam) setScope(conflict.staffId);
    setView('day');
    setDetails({ id: conflict.assignment.id, anchor: { x: Math.max(24, window.innerWidth - 360), y: 140 } });
  };

  const sourceForEvent = (event: DiaryEvent) => {
    if (event.sourceType === 'session' || event.sourceType === 'task') navigate(bookingRoute(event));
    else if (event.linkTo) navigate(event.linkTo);
  };

  const dateTitle = view === 'staff' ? (selectedResource ? `Resource · ${selectedResource}` : 'Staff & resource overview') : rangeText;
  const activeFilterCount = Number(filters.staffId !== 'all') + Number(filters.venue !== 'all') + Number(filters.conflict !== 'all') + Number(filters.kinds.length !== EVENT_KINDS.length) + Number(filters.sources.length !== SOURCE_TYPES.length);
  const hoursInvalid = workingHours.start >= workingHours.end;
  const moveRangeUnloaded = Boolean(moveDraft && !diary.isDemo && (() => {
    const start = new Date(moveDraft.startLocal);
    const end = new Date(start.getTime() + Date.parse(moveDraft.event.end) - Date.parse(moveDraft.event.start));
    return !state.range.from || dateKey(start) < state.range.from || dateKey(end) > state.range.to;
  })());

  return (
    <div className="diary-page mx-auto w-full max-w-[1540px] space-y-4">
      <section className="diary-hero flex flex-col justify-between gap-4 rounded-2xl border border-line bg-surface px-4 py-4 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:px-5">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-faint">
            <span className="grid size-5 place-items-center rounded-md bg-brand-soft text-brand-text"><CalendarClock className="size-3" /></span>
            Mentis · Operations
            <span className="h-px w-6 bg-accent/70" />
            {state.loading ? 'Syncing diary' : 'Live diary'}
          </div>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.035em] text-ink sm:text-[30px]">Diary</h1>
            <p className="pb-1 text-xs text-ink-muted sm:text-sm">Your availability, commitments and team schedule in one place.</p>
          </div>
        </div>
        <div className="diary-hero-actions flex flex-wrap items-end gap-2">
          <div className="min-w-[190px] flex-1 sm:flex-none">
            <Label htmlFor="diary-owner" className="mb-1 text-[10px] uppercase tracking-[0.12em]">Viewing</Label>
            <Select id="diary-owner" value={scope} onChange={(event) => changeScope(event.target.value)} className="diary-owner-select h-10 min-w-[190px] bg-surface-raised text-xs font-semibold">
              <option value="mine">My Diary{state.staff.find((item) => item.id === meId)?.name ? ` · ${state.staff.find((item) => item.id === meId)?.name}` : ''}</option>
              {canManageTeam && <option value="all">All staff · resource overview</option>}
              {canManageTeam && <optgroup label="Staff members">
                {staffOptions.filter((item) => item.id !== meId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </optgroup>}
              {canManageTeam && venueOptions.length > 0 && <optgroup label="Venue resources">
                {venueOptions.map((venue) => <option key={venue} value={`resource:${venue}`}>{venue}</option>)}
              </optgroup>}
            </Select>
          </div>
          <Button intent="primary" size="lg" className="diary-new-button shrink-0" onClick={() => openNewEntry()} aria-keyshortcuts="N"><Plus className="size-4" />New entry</Button>
        </div>
      </section>

      <section className="diary-commandbar relative z-20 rounded-2xl border border-line bg-surface px-3 py-3 shadow-[var(--shadow-sm)] sm:px-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SegmentedControl
              ariaLabel="Diary calendar view"
              size="sm"
              value={view}
              onChange={(value) => setPageView(value)}
              options={viewChoices.map((choice) => ({ value: choice.value, label: choice.label, icon: choice.value === 'agenda' ? <LayoutList /> : choice.value === 'staff' ? <Users /> : undefined }))}
              className="diary-view-tabs"
            />
            <div className="diary-date-controls flex items-center gap-1 rounded-xl border border-line bg-surface-inset/50 p-1">
              <Button intent="ghost" size="icon" aria-label="Previous date range" onClick={() => moveDate(-1)}><ChevronLeft className="size-4" /></Button>
              <Button intent="secondary" size="sm" className="diary-today-button" onClick={() => setSelectedDate(startOfDay(new Date()))}>Today</Button>
              <Button intent="ghost" size="icon" aria-label="Next date range" onClick={() => moveDate(1)}><ChevronRight className="size-4" /></Button>
            </div>
            <details className="diary-date-picker relative" open={datePickerOpen} onToggle={(event) => setDatePickerOpen(event.currentTarget.open)}>
              <summary aria-label="Choose date range" className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 text-xs font-bold text-ink transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                <CalendarDays className="size-4 text-brand-text" />
                <span>{dateTitle}</span>
              </summary>
              <div className="diary-date-popover absolute left-0 top-[calc(100%+8px)] z-50 w-72 rounded-xl border border-line-strong bg-surface-raised p-3 shadow-[var(--shadow-e3)]">
                <Label htmlFor="diary-date-input">Jump to date</Label>
                <Input id="diary-date-input" type="date" value={dateKey(selectedDate)} className="mt-1.5" onChange={(event) => setCalendarDate(event.target.value)} />
                <p className="mt-2 text-[10px] text-ink-faint">Monday-first week · 15-minute calendar snapping</p>
              </div>
            </details>
            <details className="diary-hours-menu relative" open={hoursOpen} onToggle={(event) => setHoursOpen(event.currentTarget.open)}>
              <summary aria-label="Configure operating hours" className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 text-xs font-semibold text-ink-muted hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                <Settings2 className="size-4" /><span>Hours</span>
              </summary>
              <div className="diary-hours-popover absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-xl border border-line-strong bg-surface-raised p-3 shadow-[var(--shadow-e3)]">
                <p className="text-xs font-bold text-ink">Calendar hours</p>
                <p className="mt-0.5 text-[10px] text-ink-faint">Adjust the visible operating window for your diary.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div><Label htmlFor="diary-hours-start">From</Label><Select id="diary-hours-start" value={String(workingHours.start)} onChange={(event) => setWorkingHours({ start: Number(event.target.value), end: Math.max(Number(event.target.value) + 1, workingHours.end) })}>{Array.from({ length: 17 }, (_, index) => index + 5).map((hour) => <option key={hour} value={hour}>{pad(hour)}:00</option>)}</Select></div>
                  <div><Label htmlFor="diary-hours-end">To</Label><Select id="diary-hours-end" value={String(workingHours.end)} onChange={(event) => setWorkingHours({ start: Math.min(workingHours.start, Number(event.target.value) - 1), end: Number(event.target.value) })}>{Array.from({ length: 17 }, (_, index) => index + 6).map((hour) => <option key={hour} value={hour}>{pad(hour)}:00</option>)}</Select></div>
                </div>
                {hoursInvalid && <p role="alert" className="mt-2 text-[11px] text-danger">End time must be later than start time.</p>}
                <p className="mt-2 text-[10px] text-ink-faint">15-minute snapping · saved on this device</p>
              </div>
            </details>
          </div>

          <div className="diary-search-tools flex min-w-0 items-center gap-2">
            <InputWithIcon aria-label="Search diary" type="search" placeholder="Search diary, staff or venue" icon={<Search />} value={search} onChange={(event) => setSearch(event.target.value)} className="diary-search h-10 min-w-0 flex-1 xl:w-60 xl:flex-none" onClear={() => setSearch('')} />
            <div className="diary-filter-anchor relative shrink-0">
              <Button intent={activeFilterCount ? 'soft' : 'secondary'} size="md" aria-expanded={filtersOpen} aria-haspopup="dialog" onClick={() => setFiltersOpen((open) => !open)}>
                <SlidersHorizontal className="size-4" /><span className="hidden sm:inline">Filters</span>{activeFilterCount > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-brand-ink">{activeFilterCount}</span>}
              </Button>
              {filtersOpen && (
                <div role="dialog" aria-label="Diary filters" className="diary-filter-popover absolute right-0 top-[calc(100%+8px)] z-50 w-[min(92vw,370px)] rounded-2xl border border-line-strong bg-surface-raised p-4 shadow-[var(--shadow-e3)]">
                  <div className="mb-3 flex items-center justify-between gap-2"><div><h2 className="text-sm font-bold">Filter diary</h2><p className="text-[10px] text-ink-faint">Narrow by staff, venue, source and status.</p></div><button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-hover"><X className="size-4" /></button></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label htmlFor="diary-filter-staff">Staff</Label><Select id="diary-filter-staff" value={filters.staffId} onChange={(event) => setFilters({ ...filters, staffId: event.target.value })}><option value="all">All staff</option>{staffOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
                    <div><Label htmlFor="diary-filter-venue">Venue</Label><Select id="diary-filter-venue" value={filters.venue} onChange={(event) => setFilters({ ...filters, venue: event.target.value })}><option value="all">All venues</option>{venueOptions.map((venue) => <option key={venue} value={venue}>{venue}</option>)}</Select></div>
                    <div className="col-span-2"><Label htmlFor="diary-filter-source">Source</Label><Select id="diary-filter-source" value={filters.sources.length === SOURCE_TYPES.length ? 'all' : filters.sources[0] ?? 'all'} onChange={(event) => setFilters({ ...filters, sources: event.target.value === 'all' ? [...SOURCE_TYPES] : [event.target.value] })}><option value="all">All sources</option>{SOURCE_TYPES.map((source) => <option key={source} value={source}>{SOURCE_LABEL[source]}</option>)}</Select></div>
                  </div>
                  <div className="mt-3"><p className="mb-1.5 text-[11px] font-semibold text-ink-muted">Event types</p><div className="diary-kind-filters flex flex-wrap gap-1.5">{EVENT_KINDS.map((kind) => {
                    const active = filters.kinds.includes(kind);
                    const style = KIND[kind];
                    return <button key={kind} type="button" aria-pressed={active} onClick={() => setFilters({ ...filters, kinds: active ? filters.kinds.filter((item) => item !== kind) : [...filters.kinds, kind] })} className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${active ? 'border-brand/40 bg-brand-soft text-brand-text' : 'border-line bg-surface text-ink-faint'}`}><style.icon className="size-3" />{style.label}</button>;
                  })}</div></div>
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-inset/45 p-2.5">
                    <div><p className="text-xs font-semibold">Conflict state</p><p className="text-[10px] text-ink-faint">Show flagged or clear bookings.</p></div>
                    <Select aria-label="Conflict filter" value={filters.conflict} onChange={(event) => setFilters({ ...filters, conflict: event.target.value as ConflictFilter })} className="w-auto"><option value="all">All</option><option value="conflicts">Conflicts</option><option value="clear">No conflicts</option></Select>
                  </div>
                  <div className="mt-3 flex justify-between"><Button intent="ghost" size="sm" onClick={() => setFilters({ staffId: 'all', venue: 'all', kinds: [...EVENT_KINDS], sources: [...SOURCE_TYPES], conflict: 'all' })}>Clear filters</Button><Button intent="primary" size="sm" onClick={() => setFiltersOpen(false)}>Done</Button></div>
                </div>
              )}
            </div>
            {canManageTeam && <Button intent="ghost" size="icon" aria-label="Open regular availability planner" title="Regular availability planner" onClick={() => openPlanner()}><ListChecks className="size-4" /></Button>}
          </div>
        </div>
      </section>

      {state.error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft/40 p-3 text-sm text-danger">
          <span>{state.error}</span><Button intent="secondary" size="sm" onClick={() => void diary.refresh()}><RefreshCw className="size-3.5" />Retry</Button>
        </div>
      )}

      {shownConflicts.length > 0 && (
        <ConflictStrip
          conflicts={shownConflicts}
          canManage={(conflict) => canManageConflicts || conflict.staffId === meId}
          onAcknowledge={(conflict) => void diary.setConflictStatus(conflict.id!, 'acknowledged').then(() => toast.success('Conflict acknowledged.')).catch((error) => toast.error(error.message))}
          onResolve={(conflict) => void diary.setConflictStatus(conflict.id!, 'resolved').then(() => toast.success('Conflict marked resolved.')).catch((error) => toast.error(error.message))}
          onJump={onConflictJump}
        />
      )}

      <section className="diary-board rounded-2xl border border-line bg-surface shadow-[var(--shadow-sm)]" aria-label="Diary calendar workspace">
        <div className="diary-board-heading flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden size-9 place-items-center rounded-xl bg-navy-900 text-gold-400 sm:grid" style={{ background: 'linear-gradient(145deg, #0b1730, #17294a)', color: '#e2b760' }}><CalendarClock className="size-4" /></span>
            <div className="min-w-0"><h2 className="truncate text-sm font-bold text-ink">{dateTitle}</h2><p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-faint"><span className="grid size-1.5 rounded-full bg-success" />{scope === 'mine' ? (state.staff.find((item) => item.id === meId)?.name ?? fallbackMe.name) : scope === 'all' ? 'Team schedule · staff and bookings' : selectedResource || staffOptions.find((item) => item.id === selectedStaff)?.name || 'Selected diary'}<span>·</span>{visibleEvents.length} item{visibleEvents.length === 1 ? '' : 's'}{activeConflictCount > 0 ? ` · ${activeConflictCount} open conflict${activeConflictCount === 1 ? '' : 's'}` : ''}</p></div>
          </div>
          <div className="flex items-center gap-2">
            {copiedEvent && <Button intent="secondary" size="sm" onClick={() => {
              const source = copiedEvent;
              const start = new Date(source.start);
              const end = new Date(source.end);
              const target = startOfDay(selectedDate);
              target.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
              const shiftedEnd = new Date(target.getTime() + (end.getTime() - start.getTime()));
              openNewEntry(target, shiftedEnd, ownerForNewEntry(), source.allDay);
              setEntryDraft((draft) => draft ? { ...draft, title: `${source.title} (copy)`, kind: source.kind, notes: source.notes ?? '', visibility: source.visibility ?? 'staff' } : draft);
            }}><Plus className="size-3.5" />Paste copied entry</Button>}
            <span className="hidden items-center gap-1 rounded-full border border-line bg-surface-inset/60 px-2.5 py-1.5 text-[10px] font-semibold text-ink-faint md:inline-flex"><Clock3 className="size-3" />15 min snap</span>
          </div>
        </div>

        {state.loading ? (
          <div className="diary-loading-state space-y-3 p-4" aria-busy="true" aria-label="Loading diary schedule">
            <div className="grid grid-cols-7 gap-2">{Array.from({ length: 7 }, (_, index) => <div key={index} className="skeleton h-10 rounded-lg" />)}</div>
            <div className="grid grid-cols-7 gap-2">{Array.from({ length: 7 }, (_, index) => <div key={index} className="skeleton h-24 rounded-lg" />)}</div>
            <div className="skeleton h-[480px] rounded-xl" />
          </div>
        ) : (
          <>
            {visibleEvents.length === 0 && (
              <div className="mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-brand/30 bg-brand-soft/35 px-3 py-2.5 sm:mx-4">
                <div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-surface text-brand-text"><Sparkles className="size-4" /></span><p className="text-xs text-ink-muted">{search || activeFilterCount ? 'No entries match these filters.' : 'This part of your diary is clear. Click or drag an empty time to add an entry.'}</p></div>
                {(search || activeFilterCount) && <Button intent="ghost" size="sm" onClick={() => { setSearch(''); setFilters({ staffId: 'all', venue: 'all', kinds: [...EVENT_KINDS], sources: [...SOURCE_TYPES], conflict: 'all' }); }}>Clear filters</Button>}
              </div>
            )}
            <div className="diary-calendar-surface p-2.5 sm:p-3">
              {view === 'month' ? (
                <MonthGrid
                  monthAnchor={selectedDate}
                  events={visibleEvents}
                  selectedIds={selectedIds}
                  onSelect={(id) => setSelectedIds(new Set([id]))}
                  onOpen={(event, anchor) => openEventDetails(event, anchor)}
                  onOpenDay={(day) => { setSelectedDate(day); setView('day'); }}
                  onMoveDay={onMonthMoveDay}
                  onCreateDay={(day) => { setSelectedDate(day); openNewEntry(atLocalTime(day, 9), atLocalTime(day, 10), undefined, false); }}
                  onEdit={openEventEditor}
                  canMove={canMoveEvent}
                />
              ) : view === 'agenda' ? (
                <AgendaView
                  days={pageDays}
                  events={visibleEvents}
                  selectedIds={selectedIds}
                  onSelect={(id) => setSelectedIds(new Set([id]))}
                  onOpen={(event, anchor) => openEventDetails(event, anchor)}
                  onOpenDay={(day) => { setSelectedDate(day); setView('day'); }}
                />
              ) : view === 'staff' && canManageTeam ? (
                <ResourceTimeline
                  days={pageDays}
                  staff={selectedResource
                    ? staffOptions.filter((person) => visibleEvents.some((event) => event.staffId === person.id))
                    : filters.staffId === 'all' ? staffOptions : staffOptions.filter((person) => person.id === filters.staffId)}
                  events={visibleEvents}
                  onSelect={(id) => setSelectedIds(new Set([id]))}
                  onOpen={(event, anchor) => openEventDetails(event, anchor)}
                  onOpenDay={(day) => { setSelectedDate(day); setView('day'); if (scope === 'all') setScope('mine'); }}
                />
              ) : (
                <div className="diary-timeboard">
                  <TimeGrid
                    days={pageDays}
                    events={visibleEvents}
                    staffLanes={staffForGrid}
                    workingHours={workingHours}
                    slotMinutes={SLOT_MINUTES}
                    pxPerHour={isMobile ? 58 : 56}
                    selectedIds={selectedIds}
                    clipboardIds={new Set()}
                    onSelect={(id, event) => setSelectedIds((prev) => {
                      const next = new Set(event.ctrlKey || event.metaKey ? prev : []);
                      if (next.has(id)) next.delete(id); else next.add(id);
                      return next;
                    })}
                    onCreate={onCreateRange}
                    onOpen={(event, anchor) => openEventDetails(event, anchor)}
                    onEdit={openEventEditor}
                    onMove={(event, start, end, staffId) => void handleMove(event, start, end, staffId)}
                    canDrag={canMoveEvent}
                    onHeaderClick={(day) => { if (view !== 'day') { setSelectedDate(day); setView('day'); } }}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <div className="diary-legend-row flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
        <LegendBar className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0" kinds={['available', 'working_hours', 'vacation', 'club_duty', 'training', 'session', 'task']} />
        <div className="flex items-center gap-3 text-[10px] text-ink-faint"><span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5 text-danger" />Conflict state</span><span className="inline-flex items-center gap-1"><span className="font-bold text-success">£</span>Chargeable time</span></div>
      </div>

      {displayedEvent && details && (
        <EventDetailsPopover
          anchor={details.anchor}
          ev={displayedEvent}
          onClose={() => setDetails(null)}
          canEdit={canEditEvent(displayedEvent)}
          canMove={canMoveEvent(displayedEvent)}
          onEdit={() => openEventEditor(displayedEvent)}
          onMoveToDateTime={() => openMoveDialog(displayedEvent)}
          onEditPattern={() => openPlanner(displayedEvent.staffId, displayedEvent.ruleId)}
          onDuplicate={() => void diary.duplicateEntry(displayedEvent.id).then(() => toast.success('Entry duplicated.')).catch((error) => toast.error(error.message))}
          onCopy={() => { setCopiedEvent(displayedEvent); toast.info('Entry copied. Use “Paste copied entry” to add it to another date.'); }}
          onOpenLink={() => sourceForEvent(displayedEvent)}
          multiStaff={view === 'staff'}
        />
      )}

      <DiaryEntryDialog
        open={Boolean(entryDraft)}
        draft={entryDraft}
        onChange={(patch) => { setEntryError(null); setEntryDraft((draft) => draft ? { ...draft, ...patch } : draft); }}
        staffOptions={staffOptions}
        meId={meId}
        canRecordForOthers={canRecordForOthers}
        conflicts={editorConflicts}
        error={entryError}
        saving={savingEntry}
        onSave={(confirm) => submitEntry(confirm, false)}
        onSaveAndRepeat={(confirm) => submitEntry(confirm, true)}
        onDelete={entryDraft?.id ? deleteEntry : undefined}
        onClose={() => { if (!savingEntry) { setEntryDraft(null); setEntryError(null); } }}
      />

      <Dialog open={Boolean(moveDraft)} onOpenChange={(open) => { if (!open) setMoveDraft(null); }}>
        {moveDraft && <MoveEntryDialog move={moveDraft} loading={state.loading || moveRangeUnloaded} error={state.error} onRetry={() => {
          const start = new Date(moveDraft.startLocal);
          const end = new Date(start.getTime() + Date.parse(moveDraft.event.end) - Date.parse(moveDraft.event.start));
          void diary.loadRange(addDays(startOfDay(start), -14), addDays(startOfDay(end), 35));
        }} onDateChange={setMoveDate} onTimeChange={setMoveTime} onCancel={() => setMoveDraft(null)} onConfirm={() => void moveToTarget()} />}
      </Dialog>

      <Dialog open={Boolean(rescheduleDraft)} onOpenChange={(open) => { if (!open) setRescheduleDraft(null); }}>
        {rescheduleDraft && <RescheduleDialog
          draft={rescheduleDraft}
          conflicts={rescheduleConflicts}
          confirmed={rescheduleConfirmed}
          setConfirmed={setRescheduleConfirmed}
          onClose={() => setRescheduleDraft(null)}
          onContinue={() => {
            if (!rescheduleDraft || rescheduleConflicts.length) return;
            const event = rescheduleDraft.event;
            setRescheduleDraft(null);
            toast.info('Nothing was moved in the diary. Continue in the owning scheduler to save the reschedule.');
            navigate(bookingRoute(event));
          }}
          onOpenSource={() => { if (rescheduleDraft) navigate(bookingRoute(rescheduleDraft.event)); }}
        />}
      </Dialog>

      <Dialog open={plannerOpen} onOpenChange={setPlannerOpen}>
        {plannerOpen && (
          <DialogContent size="xl" className="diary-planner-dialog p-0">
            <PlannerPanel
              value={plannerValue}
              onChange={(patch) => setPlannerValue((current) => ({ ...current, ...patch }))}
              staffOptions={staffOptions}
              existingRules={state.rules}
              onApply={applyPlanner}
              onDeleteRule={async (id) => { try { await diary.deleteRule(id); toast.success('Availability pattern removed.'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not remove pattern.'); } }}
              onPreviewInCalendar={() => { setSelectedDate(parseKey(plannerValue.effectiveFrom)); setScope(plannerValue.staffId === meId ? 'mine' : plannerValue.staffId); setView(isMobile ? 'day' : 'week'); setPlannerOpen(false); }}
              meId={meId}
              canRecordForOthers={canRecordForOthers}
            />
          </DialogContent>
        )}
      </Dialog>

      {diary.isDemo && <div className="diary-demo-hint flex items-center gap-2 text-[10px] text-ink-faint"><span className="size-1.5 rounded-full bg-accent" />Demo workspace · changes stay in this browser session and never write to a club database.</div>}
    </div>
  );
}

function MoveEntryDialog({
  move, loading, error, onRetry, onDateChange, onTimeChange, onCancel, onConfirm,
}: {
  move: MoveDraft;
  loading: boolean;
  error?: string | null;
  onRetry: () => void;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const start = new Date(move.startLocal);
  const duration = Date.parse(move.event.end) - Date.parse(move.event.start);
  const end = new Date(start.getTime() + duration);
  const valid = Number.isFinite(start.getTime()) && start.getTime() !== Date.parse(move.event.start);
  return (
    <DialogContent size="md" className="diary-move-dialog p-0">
      <DialogHeader>
        <DialogTitle>Move diary entry</DialogTitle>
        <DialogDescription>Choose a new start. The original duration of {Math.round(duration / 60_000)} minutes is preserved.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="rounded-xl border border-line bg-surface-inset/60 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">Moving</p><p className="mt-1 text-sm font-bold">{move.event.title}</p><p className="mt-1 text-xs text-ink-muted">{fmtDayLong(new Date(move.event.start))} · {fmtTimeRange(move.event.start, move.event.end)}</p></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="move-entry-date">New date</Label><Input id="move-entry-date" type="date" value={move.startLocal.slice(0, 10)} onChange={(event) => onDateChange(event.target.value)} /></div>
          {!move.event.allDay && <div><Label htmlFor="move-entry-time">New start time</Label><Input id="move-entry-time" type="time" step={900} value={move.startLocal.slice(11, 16)} onChange={(event) => onTimeChange(event.target.value)} /></div>}
        </div>
        <div className="rounded-xl border border-brand/20 bg-brand-soft/30 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-brand-text">Proposed time</p><p className="mt-1 text-sm font-bold text-ink">{fmtDayLong(start)} · {move.event.allDay ? 'All day' : fmtTimeRange(start.toISOString(), end.toISOString())}</p></div>
        {(move.event.kind === 'session' || move.event.kind === 'task') && <p className="rounded-lg border border-warning/25 bg-warning-soft/35 p-2.5 text-xs text-ink">This is a system booking. The diary will stay unchanged until you review and confirm the reschedule request.</p>}
        {move.event.sourceType === 'planner' && <p className="flex gap-2 rounded-lg border border-info/25 bg-info-soft/35 p-2.5 text-xs text-ink"><Repeat className="mt-0.5 size-4 shrink-0 text-info" />Moving this planner-generated block changes only this occurrence. Use “Edit pattern” to change the whole weekly rule.</p>}
        {loading && <p role="status" className="text-xs text-ink-muted">Checking availability and bookings for the proposed date…</p>}
        {error && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft/35 p-2.5 text-xs text-danger">Could not check this date: {error}. <button type="button" className="font-bold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" onClick={onRetry}>Retry</button> or cancel; nothing has moved.</p>}
      </DialogBody>
      <DialogFooter><Button intent="ghost" onClick={onCancel}>Cancel</Button><Button intent="primary" disabled={!valid || loading || Boolean(error)} onClick={onConfirm}><ArrowDownUp className="size-4" />{loading ? 'Checking…' : move.event.kind === 'session' || move.event.kind === 'task' ? 'Review move request' : 'Move entry'}</Button></DialogFooter>
    </DialogContent>
  );
}

function RescheduleDialog({
  draft, conflicts, confirmed, setConfirmed, onClose, onContinue, onOpenSource,
}: {
  draft: RescheduleDraft;
  conflicts: string[];
  confirmed: boolean;
  setConfirmed: (confirmed: boolean) => void;
  onClose: () => void;
  onContinue: () => void;
  onOpenSource: () => void;
}) {
  const eventLabel = draft.event.kind === 'task' ? 'task' : 'session';
  return (
    <DialogContent size="md" className="diary-reschedule-dialog p-0">
      <DialogHeader>
        <div className="mb-1 flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-info-soft text-info"><LockIcon /></span><Badge tone="info" size="sm">System booking</Badge></div>
        <DialogTitle>Confirm {eventLabel} reschedule</DialogTitle>
        <DialogDescription>This creates a request to continue in the owning scheduler. The calendar card stays in its original position until that schedule saves.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface-inset/55 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">Current time</p><p className="mt-1 text-xs font-bold text-ink">{fmtDayLong(new Date(draft.event.start))}</p><p className="mt-0.5 text-xs tabular-nums text-ink-muted">{fmtTimeRange(draft.event.start, draft.event.end)}</p></div>
          <div className="rounded-xl border border-brand/25 bg-brand-soft/35 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-brand-text">Proposed time</p><p className="mt-1 text-xs font-bold text-ink">{fmtDayLong(draft.proposedStart)}</p><p className="mt-0.5 text-xs tabular-nums text-ink-muted">{fmtTimeRange(draft.proposedStart.toISOString(), draft.proposedEnd.toISOString())}</p></div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold text-ink"><ShieldCheck className="size-4 text-brand-text" />Scheduling checks</p>
          {conflicts.length ? <div role="alert" className="space-y-2">{conflicts.map((message, index) => <p key={index} className="rounded-lg border border-danger/25 bg-danger-soft/35 px-3 py-2 text-xs leading-relaxed text-danger"><AlertTriangle className="mr-1 inline size-3.5" />{message}</p>)}<p className="text-[10px] font-semibold text-danger">Hard conflict — this move cannot continue until the staff or venue conflict is resolved.</p></div> : <ul className="space-y-1.5 text-xs text-ink-muted"><li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-success" />No visible staff or venue overlap in the diary.</li><li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent" />The owning scheduler rechecks availability and no-session days before saving.</li></ul>}
        </div>
        <div className="rounded-xl border border-line bg-surface-inset/55 p-3">
          <p className="text-xs font-bold text-ink">Move scope</p>
          <p className="mt-1 text-xs text-ink-muted">One occurrence only. A series-wide change is not available from this diary.</p>
        </div>
        {!conflicts.length && <label className="flex min-h-10 cursor-pointer items-start gap-2 text-xs font-semibold text-ink-muted"><input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm this proposed time for one occurrence and want to continue in the owning scheduler.</label>}
      </DialogBody>
      <DialogFooter className="justify-between"><Button intent="secondary" onClick={onOpenSource}><ArrowDownUp className="size-4" />Open {eventLabel}</Button><div className="flex gap-2"><Button intent="ghost" onClick={onClose}>Cancel</Button><Button intent="primary" disabled={conflicts.length > 0 || !confirmed} onClick={onContinue}>Continue to {eventLabel}</Button></div></DialogFooter>
    </DialogContent>
  );
}

function LockIcon() {
  return <CalendarClock className="size-4" />;
}
