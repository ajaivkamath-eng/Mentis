import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { explainSessionInsertError } from '../lib/sessionErrors';
import { AlertTriangle, Calendar, Clock, UserCheck, UserX, ShieldAlert, Sparkles, Filter, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { Badge } from '../components/ui/badge';

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
const availabilityLabels: Record<string, string> = {
  available: 'Available',
  on_duty: 'On duty',
  holiday: 'Holiday / annual leave',
  duty_outside_club: 'Duty outside club',
  unavailable_other: 'Other unavailable',
};

const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type WeeklyPattern = Record<(typeof dayNames)[number], { active: boolean; starts: string; ends: string }>;

const formatAvailabilityLabel = (value?: string | null) => availabilityLabels[value ?? ''] ?? 'Unavailable';

const getAvailabilityTitle = (value?: string | null) => formatAvailabilityLabel(value);

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toTimeInputValue = (value: Date) => {
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const startOfWeek = (date: Date) => {
  const clone = new Date(date);
  const day = (clone.getDay() + 6) % 7;
  clone.setHours(0, 0, 0, 0);
  clone.setDate(clone.getDate() - day);
  return clone;
};

const addDays = (date: Date, days: number) => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
};

const parseTimeToMinutes = (value: string) => {
  const [hourPart, minutePart = '0'] = (value || '09:00').split(':');
  const hours = Number(hourPart) || 0;
  const minutes = Number(minutePart) || 0;
  return hours * 60 + minutes;
};

const formatMinutesToTime = (totalMinutes: number) => {
  const safe = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const getDragMinutesFromEvent = (event: React.PointerEvent<HTMLElement>, dayKey?: keyof WeeklyPattern) => {
  const target = dayKey
    ? (document.querySelector(`[data-day-key="${dayKey}"]`) as HTMLElement | null) ?? event.currentTarget
    : event.currentTarget.closest('[data-day-key]') as HTMLElement | null ?? event.currentTarget;
  const rect = target.getBoundingClientRect();
  const relativeY = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
  const rangeMinutes = 14 * 60;
  const startMinutes = 8 * 60;
  const raw = startMinutes + (relativeY / rect.height) * rangeMinutes;
  const snapped = Math.round(raw / 30) * 30;
  return Math.max(8 * 60, Math.min(22 * 60, snapped));
};

const clampDragRange = (startMinutes: number, endMinutes: number) => {
  const min = Math.min(startMinutes, endMinutes);
  const max = Math.max(startMinutes, endMinutes);
  const from = Math.max(8 * 60, min);
  const to = Math.min(22 * 60, max);
  return { from, to };
};

const buildEmptyWeeklyPattern = (weekStart: Date): WeeklyPattern => {
  const pattern: WeeklyPattern = {
    mon: { active: false, starts: '09:00', ends: '17:00' },
    tue: { active: false, starts: '09:00', ends: '17:00' },
    wed: { active: false, starts: '09:00', ends: '17:00' },
    thu: { active: false, starts: '09:00', ends: '17:00' },
    fri: { active: false, starts: '09:00', ends: '17:00' },
    sat: { active: false, starts: '09:00', ends: '17:00' },
    sun: { active: false, starts: '09:00', ends: '17:00' },
  };

  return pattern;
};

const hydrateWeeklyPattern = (weekStart: Date, rows: any[], staffId: string): WeeklyPattern => {
  const base = buildEmptyWeeklyPattern(weekStart);
  if (!staffId) return base;

  const weekStartIso = new Date(weekStart).toISOString();
  const nextWeekIso = new Date(addDays(weekStart, 7)).toISOString();

  const rowMatches = rows.filter((row) => {
    if (row.staff_id !== staffId) return false;
    if (!row.available || row.availability_type !== 'available') return false;
    if (row.reason !== 'Regular weekly working hours') return false;
    const startsAt = new Date(row.starts_at);
    return startsAt >= new Date(weekStartIso) && startsAt < new Date(nextWeekIso);
  });

  rowMatches.forEach((row) => {
    const startsAt = new Date(row.starts_at);
    const endsAt = new Date(row.ends_at);
    const weekdayIndex = (startsAt.getDay() + 6) % 7;
    const dayKey = dayNames[weekdayIndex] as keyof WeeklyPattern;

    if (base[dayKey]) {
      base[dayKey] = {
        active: true,
        starts: toTimeInputValue(startsAt),
        ends: toTimeInputValue(endsAt),
      };
    }
  });

  return base;
};

/* ---------- Coach & Sparrer Personal Diary & Availability Matrix ---------- */
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
  const { staff, canDo } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [assignedSessions, setAssignedSessions] = useState<any[]>([]);
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [weeklyPattern, setWeeklyPattern] = useState<WeeklyPattern>(() => buildEmptyWeeklyPattern(startOfWeek(new Date())));
  const [dragMode, setDragMode] = useState<'weekly' | 'entry'>('weekly');
  const [dragState, setDragState] = useState<{ dayKey: keyof WeeklyPattern; anchorMinutes: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ dayKey: keyof WeeklyPattern; startMinutes: number; endMinutes: number } | null>(null);
  const [draftCard, setDraftCard] = useState<{ dayKey: keyof WeeklyPattern; startMinutes: number; endMinutes: number; mode: 'weekly' | 'entry' } | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<keyof WeeklyPattern | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<{ entry: any; x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: any } | null>(null);
  const [draggingEntry, setDraggingEntry] = useState<{
    entryId: string;
    kind: 'move' | 'resize';
    dayKey: keyof WeeklyPattern;
    startMinutes: number;
    endMinutes: number;
    anchorMinutes: number;
  } | null>(null);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [titleEditEnabled, setTitleEditEnabled] = useState(false);
  const [titleOverridden, setTitleOverridden] = useState(false);
  const [form, setForm] = useState({
    staff_id: '',
    starts_at: '',
    ends_at: '',
    available: false,
    availability_type: 'holiday',
    reason: '',
  });

  const load = async () => {
    setLoading(true);
    const [availRes, staffRes, sessionStaffRes] = await Promise.all([
      supabase
        .from('mentis_staff_availability')
        .select('*, mentis_staff!staff_availability_staff_id_fkey(display_name)')
        .order('starts_at', { ascending: false })
        .limit(200),
      supabase.from('mentis_staff').select('id, display_name, roles'),
      supabase
        .from('mentis_session_staffing')
        .select('*, mentis_sessions(name, start_at, end_at, mentis_venues(name)), mentis_staff(display_name)')
        .gte('planned_start', new Date(Date.now() - 7 * 86400000).toISOString())
        .order('planned_start', { ascending: true })
        .limit(100),
    ]);

    setRows(availRes.data ?? []);
    setStaffList(staffRes.data ?? []);
    setAssignedSessions(sessionStaffRes.data ?? []);
    setForm(f => ({ ...f, staff_id: f.staff_id || staff?.id || '' }));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const targetStaffId = form.staff_id || staff?.id || '';
    setWeeklyPattern(hydrateWeeklyPattern(weekStart, rows, targetStaffId));
  }, [rows, form.staff_id, staff?.id, weekStart]);

  const openEntryForEdit = (entry: any) => {
    setEditingEntryId(entry.id);
    const nextType = entry.availability_type || 'holiday';
    const nextReason = entry.reason || getAvailabilityTitle(nextType);
    setTitleEditEnabled(Boolean(entry.reason && entry.reason !== getAvailabilityTitle(nextType)));
    setTitleOverridden(Boolean(entry.reason && entry.reason !== getAvailabilityTitle(nextType)));
    setForm({
      staff_id: entry.staff_id,
      starts_at: new Date(entry.starts_at).toISOString().slice(0, 16),
      ends_at: new Date(entry.ends_at).toISOString().slice(0, 16),
      available: Boolean(entry.available),
      availability_type: nextType,
      reason: nextReason,
    });
    setAppointmentModalOpen(true);
  };

  const clearForm = () => {
    setEditingEntryId(null);
    setTitleEditEnabled(false);
    setTitleOverridden(false);
    setForm({
      staff_id: staff?.id || '',
      starts_at: '',
      ends_at: '',
      available: false,
      availability_type: 'holiday',
      reason: '',
    });
  };

  const clearDraftAppointment = () => {
    setDraftCard(null);
    setDragPreview(null);
    setAppointmentModalOpen(false);
    setEditingEntryId(null);
  };

  const openManualAvailabilityModal = () => {
    const baseStaff = form.staff_id || staff?.id || '';
    const categoryValue = form.availability_type || 'holiday';
    setDraftCard(null);
    setEditingEntryId(null);
    setTitleEditEnabled(false);
    setTitleOverridden(false);
    const defaultReason = getAvailabilityTitle(categoryValue);
    setForm(prev => ({
      ...prev,
      staff_id: baseStaff,
      starts_at: prev.starts_at || `${toDateInputValue(new Date())}T09:00`,
      ends_at: prev.ends_at || `${toDateInputValue(new Date())}T17:00`,
      available: false,
      availability_type: categoryValue,
      reason: defaultReason,
    }));
    setAppointmentModalOpen(true);
  };

  const openAppointmentModal = () => {
    if (!draftCard) return;

    const dayIndex = dayNames.indexOf(draftCard.dayKey);
    const dayDate = addDays(weekStart, dayIndex);
    const startsAt = `${toDateInputValue(dayDate)}T${formatMinutesToTime(draftCard.startMinutes)}`;
    const endsAt = `${toDateInputValue(dayDate)}T${formatMinutesToTime(draftCard.endMinutes)}`;

    setTitleEditEnabled(false);
    setTitleOverridden(false);
    setForm(prev => {
      const defaultReason = getAvailabilityTitle(prev.availability_type || 'holiday');
      return {
        ...prev,
        staff_id: prev.staff_id || staff?.id || '',
        starts_at: startsAt,
        ends_at: endsAt,
        available: draftCard.mode === 'entry' ? false : prev.available,
        availability_type: prev.availability_type || 'holiday',
        reason: defaultReason,
      };
    });
    setAppointmentModalOpen(true);
  };

  const createDraftFromWhiteSpace = (dayKey: keyof WeeklyPattern, event?: React.PointerEvent<HTMLDivElement>) => {
    const dayIndex = dayNames.indexOf(dayKey);
    const dayDate = addDays(weekStart, dayIndex);
    const baseMinutes = event ? getDragMinutesFromEvent(event, dayKey) : 9 * 60;
    const startMinutes = Math.max(8 * 60, Math.min(22 * 60, baseMinutes));
    const endMinutes = Math.min(22 * 60, startMinutes + 60);

    const nextPreview = { dayKey, startMinutes, endMinutes };
    setDragPreview(nextPreview);
    setDraftCard({ dayKey, startMinutes, endMinutes, mode: 'entry' });
    setForm(prev => ({
      ...prev,
      staff_id: prev.staff_id || staff?.id || '',
      starts_at: `${toDateInputValue(dayDate)}T${formatMinutesToTime(startMinutes)}`,
      ends_at: `${toDateInputValue(dayDate)}T${formatMinutesToTime(endMinutes)}`,
      available: false,
      availability_type: prev.availability_type || 'holiday',
      reason: prev.reason || getAvailabilityTitle(prev.availability_type || 'holiday'),
    }));
    setAppointmentModalOpen(true);
  };

  const save = async () => {
    if (!form.staff_id || !form.starts_at || !form.ends_at) {
      alert('Staff + start + end required.');
      return;
    }
    if (new Date(form.ends_at).getTime() <= new Date(form.starts_at).getTime()) {
      alert('End date/time must be after the start date/time.');
      return;
    }
    if (form.staff_id !== staff?.id && !canDo('availability.recordForOthers') && !canDo('availability.recordAll')) {
      alert('Only coordinators/admins can record on behalf of other staff.');
      return;
    }

    const payload = {
      organization_id: staff?.organization_id,
      staff_id: form.staff_id,
      starts_at: form.starts_at,
      ends_at: form.ends_at,
      available: form.available,
      availability_type: form.availability_type,
      reason: form.reason || null,
      recorded_by: staff?.user_id,
    };

    const { error } = editingEntryId
      ? await supabase.from('mentis_staff_availability').update(payload).eq('id', editingEntryId)
      : await supabase.from('mentis_staff_availability').insert(payload);

    if (error) {
      alert(explainSessionInsertError(error));
      return;
    }

    if (!form.available) {
      const clash = assignedSessions.find(asg => {
        if (asg.staff_id !== form.staff_id) return false;
        const pStart = new Date(asg.planned_start);
        const pEnd = new Date(asg.planned_end);
        const uStart = new Date(form.starts_at);
        const uEnd = new Date(form.ends_at);
        return pStart < uEnd && uStart < pEnd;
      });

      if (clash) {
        await supabase.from('mentis_pending_actions').insert({
          organization_id: staff?.organization_id,
          title: `Coach Conflict: ${clash.mentis_staff?.display_name} marked unavailable during ${clash.mentis_sessions?.name}`,
          status: 'open',
          due_at: clash.planned_start,
          linked_entity_type: 'session',
          linked_entity_id: clash.session_id,
        });

        alert(`⚠️ Alert: This unavailable window conflicts with scheduled session "${clash.mentis_sessions?.name}". A conflict alert and notification have been triggered.`);
      }
    }

    clearForm();
    load();
  };

  const deleteEntry = async (entryId: string) => {
    const confirmed = window.confirm('Delete this diary entry?');
    if (!confirmed) return;

    const { error } = await supabase.from('mentis_staff_availability').delete().eq('id', entryId);
    if (error) {
      alert(explainSessionInsertError(error));
      return;
    }

    if (editingEntryId === entryId) clearForm();
    load();
  };

  const saveWeeklyPattern = async () => {
    const targetStaffId = form.staff_id || staff?.id;
    if (!targetStaffId) {
      alert('Select a coach before saving the weekly pattern.');
      return;
    }

    const entries = dayNames
      .map((dayKey, dayIndex) => {
        const config = weeklyPattern[dayKey];
        if (!config.active || !config.starts || !config.ends || config.starts >= config.ends) {
          return null;
        }

        const date = addDays(weekStart, dayIndex);
        const startsAt = new Date(`${toDateInputValue(date)}T${config.starts}:00`);
        const endsAt = new Date(`${toDateInputValue(date)}T${config.ends}:00`);

        if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
          return null;
        }

        return {
          organization_id: staff?.organization_id,
          staff_id: targetStaffId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          available: true,
          availability_type: 'available',
          reason: 'Regular weekly working hours',
          recorded_by: staff?.user_id,
        };
      })
      .filter(Boolean) as Array<Record<string, any>>;

    if (entries.length === 0) {
      alert('Choose at least one working day and set a valid start/end time.');
      return;
    }

    const weekStartIso = new Date(weekStart).toISOString();
    const weekEndIso = new Date(addDays(weekStart, 7)).toISOString();

    const { error: deleteError } = await supabase
      .from('mentis_staff_availability')
      .delete()
      .eq('staff_id', targetStaffId)
      .eq('available', true)
      .eq('availability_type', 'available')
      .eq('reason', 'Regular weekly working hours')
      .gte('starts_at', weekStartIso)
      .lt('starts_at', weekEndIso);

    if (deleteError) {
      alert(explainSessionInsertError(deleteError));
      return;
    }

    const { error } = await supabase.from('mentis_staff_availability').insert(entries);
    if (error) {
      alert(explainSessionInsertError(error));
      return;
    }

    await load();
  };

  const clearWeeklyPattern = async () => {
    const targetStaffId = form.staff_id || staff?.id;
    if (!targetStaffId) return;

    const weekStartIso = new Date(weekStart).toISOString();
    const weekEndIso = new Date(addDays(weekStart, 7)).toISOString();

    await supabase
      .from('mentis_staff_availability')
      .delete()
      .eq('staff_id', targetStaffId)
      .eq('available', true)
      .eq('availability_type', 'available')
      .eq('reason', 'Regular weekly working hours')
      .gte('starts_at', weekStartIso)
      .lt('starts_at', weekEndIso);

    setWeeklyPattern(buildEmptyWeeklyPattern(weekStart));
    await load();
  };

  const filteredEntries = useMemo(() => {
    if (selectedStaffFilter === 'all') return rows;
    return rows.filter(r => r.staff_id === selectedStaffFilter);
  }, [rows, selectedStaffFilter]);

  const filteredAssigned = useMemo(() => {
    if (selectedStaffFilter === 'all') return assignedSessions;
    return assignedSessions.filter(a => a.staff_id === selectedStaffFilter);
  }, [assignedSessions, selectedStaffFilter]);

  const staffSummary = useMemo(() => {
    const target = selectedStaffFilter === 'all' ? rows : rows.filter(r => r.staff_id === selectedStaffFilter);
    const available = target.filter(r => r.available).length;
    const unavailable = target.filter(r => !r.available).length;
    const upcomingSessions = selectedStaffFilter === 'all'
      ? assignedSessions.length
      : assignedSessions.filter(a => a.staff_id === selectedStaffFilter).length;

    return { available, unavailable, upcomingSessions };
  }, [rows, assignedSessions, selectedStaffFilter]);

  const conflictWatch = useMemo(() => {
    const entries = selectedStaffFilter === 'all' ? rows : rows.filter(r => r.staff_id === selectedStaffFilter);
    const results: Array<{ sessionId: string; sessionName: string; staffName: string; reason: string; window: string }> = [];

    assignedSessions.forEach((session) => {
      if (selectedStaffFilter !== 'all' && session.staff_id !== selectedStaffFilter) return;

      const overlap = entries.find((entry) => {
        if (entry.available || entry.staff_id !== session.staff_id) return false;
        const sessionStart = new Date(session.planned_start);
        const sessionEnd = new Date(session.planned_end);
        const entryStart = new Date(entry.starts_at);
        const entryEnd = new Date(entry.ends_at);
        return sessionStart < entryEnd && entryStart < sessionEnd;
      });

      if (overlap) {
        results.push({
          sessionId: session.id,
          sessionName: session.mentis_sessions?.name ?? 'Scheduled session',
          staffName: session.mentis_staff?.display_name ?? 'Coach',
          reason: overlap.reason || formatAvailabilityLabel(overlap.availability_type),
          window: `${new Date(overlap.starts_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${new Date(overlap.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(overlap.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        });
      }
    });

    return results;
  }, [assignedSessions, rows, selectedStaffFilter]);

  const weekDays = useMemo(() => {
    return dayNames.map((_, index) => addDays(weekStart, index));
  }, [weekStart]);

  const previewRangeLabel = useMemo(() => {
    if (!dragPreview) return null;
    const dayLabel = weekdayLabels[dayNames.indexOf(dragPreview.dayKey)];
    const startLabel = formatMinutesToTime(dragPreview.startMinutes);
    const endLabel = formatMinutesToTime(dragPreview.endMinutes);
    return `${dayLabel} · ${startLabel}–${endLabel}`;
  }, [dragPreview]);

  const cardDraftLabel = useMemo(() => {
    if (!draftCard) return null;
    const dayLabel = weekdayLabels[dayNames.indexOf(draftCard.dayKey)];
    return `${dayLabel} · ${formatMinutesToTime(draftCard.startMinutes)}–${formatMinutesToTime(draftCard.endMinutes)}`;
  }, [draftCard]);

  const selectedDaySummary = useMemo(() => {
    if (!selectedDayKey) return null;
    const config = weeklyPattern[selectedDayKey];
    if (!config.active) return `${weekdayLabels[dayNames.indexOf(selectedDayKey)]} · Not set`;
    return `${weekdayLabels[dayNames.indexOf(selectedDayKey)]} · ${config.starts}–${config.ends}`;
  }, [selectedDayKey, weeklyPattern]);

  const dateRangeSummary = useMemo(() => {
    if (!form.starts_at || !form.ends_at) return null;
    const start = new Date(form.starts_at);
    const end = new Date(form.ends_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const sameDay = start.toDateString() === end.toDateString();
    const format = (date: Date) => date.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return sameDay ? `${format(start)} → ${format(end)}` : `${format(start)} → ${format(end)} (cross-day)`;
  }, [form.starts_at, form.ends_at]);

  const visualEntries = useMemo(() => {
    const items: Array<{ id: string; dayIndex: number; startMinutes: number; endMinutes: number; label: string; color: string; entry?: any; isRegular?: boolean }> = [];

    dayNames.forEach((dayKey, dayIndex) => {
      const config = weeklyPattern[dayKey];
      if (config.active) {
        items.push({
          id: `regular-${dayKey}`,
          dayIndex,
          startMinutes: parseTimeToMinutes(config.starts),
          endMinutes: parseTimeToMinutes(config.ends),
          label: 'Regular hours',
          color: 'bg-teal-500/15 border-teal-600 text-teal-700',
          isRegular: true,
        });
      }
    });

    const visibleRows = selectedStaffFilter === 'all' ? rows : rows.filter(r => r.staff_id === selectedStaffFilter);

    visibleRows.forEach((row) => {
      const start = new Date(row.starts_at);
      const end = new Date(row.ends_at);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

      const dayCursor = new Date(start);
      dayCursor.setHours(0, 0, 0, 0);
      const endCursor = new Date(end);
      endCursor.setHours(0, 0, 0, 0);

      for (let current = new Date(dayCursor); current <= endCursor; current = addDays(current, 1)) {
        const dayStart = new Date(current);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(current);
        dayEnd.setHours(23, 59, 59, 999);

        const segmentStart = new Date(Math.max(start.getTime(), dayStart.getTime()));
        const segmentEnd = new Date(Math.min(end.getTime(), dayEnd.getTime()));
        if (segmentEnd <= segmentStart) continue;

        const dayIndex = (segmentStart.getDay() + 6) % 7;
        const startMinutes = segmentStart.getHours() * 60 + segmentStart.getMinutes();
        const endMinutes = segmentEnd.getHours() * 60 + segmentEnd.getMinutes();

        items.push({
          id: `${row.id}-${current.toISOString().slice(0, 10)}`,
          dayIndex,
          startMinutes,
          endMinutes,
          label: row.reason || formatAvailabilityLabel(row.availability_type),
          color: row.available ? 'bg-emerald-500/15 border-emerald-600 text-emerald-700' : 'bg-amber-500/15 border-amber-600 text-amber-700',
          entry: row,
        });
      }
    });

    return items;
  }, [rows, selectedStaffFilter, weeklyPattern, weekStart]);

  const applyDraggedRange = (dayKey: keyof WeeklyPattern, startMinutes: number, endMinutes: number) => {
    const { from, to } = clampDragRange(startMinutes, endMinutes);

    if (to <= from) {
      return;
    }

    setWeeklyPattern(prev => ({
      ...prev,
      [dayKey]: {
        active: true,
        starts: formatMinutesToTime(from),
        ends: formatMinutesToTime(to),
      },
    }));

    const nextPreview = { dayKey, startMinutes: from, endMinutes: to };
    setDragPreview(nextPreview);
    setDraftCard({ dayKey, startMinutes: from, endMinutes: to, mode: 'weekly' });
  };

  const applyQuickEntryRange = (dayKey: keyof WeeklyPattern, startMinutes: number, endMinutes: number) => {
    const { from, to } = clampDragRange(startMinutes, endMinutes);
    if (to <= from) return;

    const dayIndex = dayNames.indexOf(dayKey);
    const dayDate = addDays(weekStart, dayIndex);
    const startsAt = `${toDateInputValue(dayDate)}T${formatMinutesToTime(from)}`;
    const endsAt = `${toDateInputValue(dayDate)}T${formatMinutesToTime(to)}`;

    setForm(prev => ({
      ...prev,
      starts_at: startsAt,
      ends_at: endsAt,
      available: false,
      availability_type: prev.availability_type || 'holiday',
      reason: prev.reason || 'Diary entry',
    }));
    setEditingEntryId(null);
    const nextPreview = { dayKey, startMinutes: from, endMinutes: to };
    setDragPreview(nextPreview);
    setDraftCard({ dayKey, startMinutes: from, endMinutes: to, mode: 'entry' });
  };

  const handleDayPointerDown = (dayKey: keyof WeeklyPattern, event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const minutes = getDragMinutesFromEvent(event, dayKey);
    setDragState({ dayKey, anchorMinutes: minutes });
    setDragPreview({ dayKey, startMinutes: minutes, endMinutes: minutes + 30 });

    if (dragMode === 'weekly') {
      applyDraggedRange(dayKey, minutes, minutes + 30);
      return;
    }

    applyQuickEntryRange(dayKey, minutes, minutes + 30);
  };

  const handleDayPointerMove = (dayKey: keyof WeeklyPattern, event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.dayKey !== dayKey) return;
    const minutes = getDragMinutesFromEvent(event, dayKey);

    if (dragMode === 'weekly') {
      applyDraggedRange(dayKey, dragState.anchorMinutes, minutes);
      return;
    }

    const { from, to } = clampDragRange(dragState.anchorMinutes, minutes);
    if (to > from) {
      setDragPreview({ dayKey, startMinutes: from, endMinutes: to });
    }
  };

  const handleEntryPointerDown = (entry: any, event: React.PointerEvent<HTMLElement>, kind: 'move' | 'resize') => {
    event.preventDefault();
    event.stopPropagation();
    const start = new Date(entry.starts_at);
    const end = new Date(entry.ends_at);
    const dayKey = dayNames[(start.getDay() + 6) % 7] as keyof WeeklyPattern;
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    const anchorMinutes = getDragMinutesFromEvent(event, dayKey);

    setSelectedEntryId(entry.id);
    setDraggingEntry({
      entryId: entry.id,
      kind,
      dayKey,
      startMinutes,
      endMinutes,
      anchorMinutes,
    });
  };

  const handleEntryPointerMove = (dayKey: keyof WeeklyPattern, event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingEntry || draggingEntry.entryId === undefined) return;
    const currentMinutes = getDragMinutesFromEvent(event, dayKey);
    const delta = currentMinutes - draggingEntry.anchorMinutes;

    setRows(prev => prev.map(row => {
      if (row.id !== draggingEntry.entryId) return row;
      const oldStart = new Date(row.starts_at);
      const oldEnd = new Date(row.ends_at);
      const oldStartMinutes = oldStart.getHours() * 60 + oldStart.getMinutes();
      const oldEndMinutes = oldEnd.getHours() * 60 + oldEnd.getMinutes();

      const nextStartMinutes = draggingEntry.kind === 'resize'
        ? Math.max(8 * 60, oldStartMinutes)
        : oldStartMinutes + delta;
      const nextEndMinutes = draggingEntry.kind === 'resize'
        ? Math.max(oldStartMinutes + 30, oldEndMinutes + delta)
        : oldEndMinutes + delta;

      const startDate = new Date(oldStart);
      startDate.setHours(Math.floor(nextStartMinutes / 60), nextStartMinutes % 60, 0, 0);
      const endDate = new Date(oldEnd);
      endDate.setHours(Math.floor(nextEndMinutes / 60), nextEndMinutes % 60, 0, 0);

      return { ...row, starts_at: startDate.toISOString(), ends_at: endDate.toISOString() };
    }));
  };

  const stopDrag = () => {
    if (dragState && dragMode === 'entry' && dragPreview) {
      const dayIndex = dayNames.indexOf(dragState.dayKey);
      applyQuickEntryRange(dragState.dayKey, dragPreview.startMinutes, dragPreview.endMinutes);
      setDragState(null);
      setDragPreview(null);
      return;
    }

    if (draggingEntry) {
      setDraggingEntry(null);
    }

    setDragState(null);
    setDragPreview(null);
  };

  const hourlySlots = Array.from({ length: 14 }, (_, index) => 8 + index);

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
    <div className="space-y-4">
      <PageTitle
        title="Coach Personal Diary & Availability Planner"
        sub="Regular weekly working hours, holiday plans, on-duty windows, outside club commitments, and session busy tracking"
      />

      <div className="card p-4">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted flex items-center gap-1.5">
            <Calendar className="size-4 text-brand" /> Weekly working hours calendar
          </h3>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              onClick={() => setWeekStart(d => addDays(d, -7))}
              aria-label="Previous week"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="text-sm font-semibold text-ink">
              {toDateInputValue(weekStart)} → {toDateInputValue(addDays(weekStart, 6))}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              onClick={() => setWeekStart(d => addDays(d, 7))}
              aria-label="Next week"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              className="btn btn-primary btn-xs px-3"
              onClick={openManualAvailabilityModal}
            >
              <Plus className="size-3.5" />
              Add entry
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Drag mode</span>
          <button
            type="button"
            className={`btn btn-xs ${dragMode === 'weekly' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDragMode('weekly')}
          >
            Weekly pattern
          </button>
          <button
            type="button"
            className={`btn btn-xs ${dragMode === 'entry' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDragMode('entry')}
          >
            Diary entry
          </button>
          <span className="text-[10px] text-ink-muted">
            {dragMode === 'weekly'
              ? 'Drag to set recurring working hours for the week.'
              : 'Drag to pre-fill a one-off leave or availability entry.'}
          </span>
          {previewRangeLabel && (
            <span className="rounded-full border border-blue-500 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-700">
              Selected: {previewRangeLabel}
            </span>
          )}
          {selectedDaySummary && (
            <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-1 text-[10px] font-semibold text-brand">
              Day focus: {selectedDaySummary}
            </span>
          )}
        </div>

        {draftCard && (
          <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50/70 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Draft appointment</div>
                <div className="mt-1 text-sm font-semibold text-ink">{cardDraftLabel}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-full border border-blue-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                  {draftCard.mode === 'weekly' ? 'Recurring Hours' : 'Diary Entry'}
                </div>
                <button type="button" className="btn btn-secondary btn-xs" onClick={openAppointmentModal}>
                  Review details
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-line bg-surface-inset">
          <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] gap-2 p-2" style={{ userSelect: 'none', WebkitUserSelect: 'none', msUserSelect: 'none' }}>
            <div className="h-[40px]" />
            {weekDays.map((date, index) => (
              <div key={weekdayLabels[index]} className="text-center">
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{weekdayLabels[index]}</div>
                <div className="text-[11px] text-ink-faint">{toDateInputValue(date)}</div>
              </div>
            ))}

            <div className="pr-2 pt-1">
              {hourlySlots.map(hour => (
                <div key={hour} className="flex h-12 items-start justify-end text-[10px] font-medium text-ink-muted">
                  {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
                </div>
              ))}
            </div>

            {weekDays.map((date, index) => {
              const dayKey = dayNames[index] as keyof WeeklyPattern;
              const config = weeklyPattern[dayKey];
              const startMinutes = parseTimeToMinutes(config.starts);
              const endMinutes = parseTimeToMinutes(config.ends);
              const startRatio = ((startMinutes - 8 * 60) / (14 * 60)) * 100;
              const heightRatio = ((endMinutes - startMinutes) / (14 * 60)) * 100;

              return (
                <div
                  key={dayKey}
                  data-day-key={dayKey}
                  className={`relative h-[calc(14*3rem)] rounded-xl border p-1 transition-all ${
                    selectedDayKey === dayKey ? 'border-brand bg-brand/5 shadow-inner ring-2 ring-brand/15' : 'border-line bg-surface'
                  }`}
                  onClick={(event) => {
                    setSelectedDayKey(dayKey);
                    createDraftFromWhiteSpace(dayKey, event as unknown as React.PointerEvent<HTMLDivElement>);
                  }}
                  onPointerDown={(event) => handleDayPointerDown(dayKey, event)}
                  onPointerMove={(event) => handleDayPointerMove(dayKey, event)}
                  onPointerUp={stopDrag}
                  onPointerLeave={stopDrag}
                  onPointerCancel={stopDrag}
                  style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', msUserSelect: 'none' }}
                >
                  {hourlySlots.map(hour => (
                    <div key={`${dayKey}-${hour}`} className="h-12 border-b border-line/80" />
                  ))}

                  {dragPreview && dragPreview.dayKey === dayKey && (
                    <div
                      className="absolute left-1 right-1 rounded-md border border-blue-500 bg-blue-500/10 shadow-sm"
                      style={{
                        top: `${Math.max(0, ((dragPreview.startMinutes - 8 * 60) / (14 * 60)) * 100)}%`,
                        height: `${Math.max(18, ((dragPreview.endMinutes - dragPreview.startMinutes) / (14 * 60)) * 100)}%`,
                      }}
                    />
                  )}

                  {visualEntries
                    .filter(entry => entry.dayIndex === index)
                    .map(entry => {
                      const top = ((entry.startMinutes - 8 * 60) / (14 * 60)) * 100;
                      const height = Math.max(18, ((entry.endMinutes - entry.startMinutes) / (14 * 60)) * 100);

                      return (
                        <button
                          key={entry.id}
                          type="button"
                          className={`absolute left-1 right-1 rounded-md border border-l-4 px-1 text-[10px] font-semibold text-left shadow-sm overflow-hidden ${entry.color} ${
                            entry.isRegular ? 'border-l-teal-600' : entry.entry?.available ? 'border-l-emerald-600' : 'border-l-amber-600'
                          } ${selectedEntryId === entry.id ? 'ring-2 ring-brand/30' : ''}`}
                          style={{ top: `${Math.max(0, top)}%`, height: `${Math.min(100, height)}%` }}
                          title={`${entry.label} ${formatMinutesToTime(entry.startMinutes)}–${formatMinutesToTime(entry.endMinutes)}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedEntryId(entry.id);
                            if (entry.entry) {
                              setContextMenu(null);
                              setPreviewEntry({
                                entry: entry.entry,
                                x: event.clientX + 12,
                                y: event.clientY + 12,
                              });
                              setDragPreview({ dayKey: dayNames[index], startMinutes: entry.startMinutes, endMinutes: entry.endMinutes });
                            }
                          }}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            if (entry.entry) openEntryForEdit(entry.entry);
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setSelectedEntryId(entry.id);
                            setPreviewEntry(null);
                            setContextMenu({ x: event.clientX, y: event.clientY, entry: entry.entry });
                          }}
                          onPointerDown={(event) => {
                            if (entry.entry) {
                              handleEntryPointerDown(entry.entry, event, 'move');
                              return;
                            }
                            event.stopPropagation();
                          }}
                        >
                          <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col justify-between py-1">
                            <span className="flex h-2 w-5 justify-center rounded-full border border-current/30 bg-white/60 text-[7px] leading-none text-current cursor-ns-resize">⋮</span>
                            <span className="flex h-2 w-5 justify-center rounded-full border border-current/30 bg-white/60 text-[7px] leading-none text-current cursor-ns-resize">⋮</span>
                          </div>
                          <div className="flex h-full flex-col justify-start overflow-hidden leading-tight pr-2 pl-2">
                            <div className="flex items-center gap-1">
                              <span className={`mt-0.5 size-1.5 rounded-full ${entry.isRegular ? 'bg-teal-600' : entry.entry?.available ? 'bg-emerald-600' : 'bg-amber-600'}`} />
                              <span className="line-clamp-2 font-bold">{entry.label}</span>
                            </div>
                            <span className="mt-0.5 text-[9px] opacity-80">
                              {formatMinutesToTime(entry.startMinutes)}–{formatMinutesToTime(entry.endMinutes)}
                            </span>
                          </div>
                          <span
                            className="absolute right-1 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded border border-current/30 bg-white/80 text-[7px] text-current cursor-ns-resize"
                            onPointerDown={(event) => {
                              if (entry.entry) {
                                handleEntryPointerDown(entry.entry, event, 'resize');
                              }
                            }}
                          >
                            ↕
                          </span>
                          <span
                            className="absolute left-1 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded border border-current/30 bg-white/80 text-[7px] text-current cursor-ns-resize"
                            onPointerDown={(event) => {
                              if (entry.entry) {
                                handleEntryPointerDown(entry.entry, event, 'resize');
                              }
                            }}
                          >
                            ↕
                          </span>
                        </button>
                      );
                    })}

                  {config.active && !visualEntries.some(entry => entry.id === `regular-${dayKey}`) && (
                    <div
                      className="absolute left-1 right-1 rounded-md border border-teal-600 bg-teal-500/15 shadow-sm"
                      style={{ top: `${Math.max(0, startRatio)}%`, height: `${Math.max(12, heightRatio)}%` }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {previewEntry && (
        <div
          className="fixed z-40 w-64 rounded-xl border border-line bg-white p-3 shadow-xl"
          style={{ left: previewEntry.x, top: previewEntry.y }}
          onClick={() => setPreviewEntry(null)}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Quick preview</div>
          <div className="mt-1 text-sm font-semibold text-ink">{previewEntry.entry.reason || formatAvailabilityLabel(previewEntry.entry.availability_type)}</div>
          <div className="mt-1 text-[11px] text-ink-muted">
            {new Date(previewEntry.entry.starts_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} → {new Date(previewEntry.entry.ends_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
          </div>
          {new Date(previewEntry.entry.starts_at).toDateString() !== new Date(previewEntry.entry.ends_at).toDateString() && (
            <div className="mt-2 inline-flex items-center rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand">
              Multi-day entry
            </div>
          )}
          <div className="mt-2 flex items-center justify-between">
            <Badge tone={previewEntry.entry.available ? 'success' : 'warning'} size="sm">
              {previewEntry.entry.available ? 'Available' : 'Unavailable'}
            </Badge>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={(event) => {
                event.stopPropagation();
                setPreviewEntry(null);
                openEntryForEdit(previewEntry.entry);
              }}
            >
              Edit
            </button>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 w-40 rounded-lg border border-line bg-white p-2 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button type="button" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-surface-inset" onClick={() => { setContextMenu(null); if (contextMenu.entry) openEntryForEdit(contextMenu.entry); }}>
            Edit details
          </button>
          <button type="button" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-surface-inset" onClick={() => { setContextMenu(null); if (contextMenu.entry) deleteEntry(contextMenu.entry.id); }}>
            Delete entry
          </button>
          <button type="button" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-surface-inset" onClick={() => { setContextMenu(null); if (contextMenu.entry) { setForm({ ...form, staff_id: contextMenu.entry.staff_id, available: true, availability_type: 'available', starts_at: contextMenu.entry.starts_at, ends_at: contextMenu.entry.ends_at, reason: contextMenu.entry.reason || 'Available' }); setAppointmentModalOpen(true); } }}>
            Mark available
          </button>
        </div>
      )}

      {appointmentModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
          onClick={(event) => {
            if (event.target === event.currentTarget) clearDraftAppointment();
          }}
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
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{draftCard ? 'Appointment' : 'Availability'}</div>
                <h3 className="mt-0.5 text-base font-bold text-slate-800">
                  {draftCard
                    ? draftCard.mode === 'weekly'
                      ? 'Recurring hours'
                      : 'Diary appointment'
                    : editingEntryId
                      ? 'Edit availability'
                      : 'Add availability window or holiday plan'}
                </h3>
              </div>
              <button type="button" className="btn btn-secondary btn-icon btn-xs" onClick={clearDraftAppointment} aria-label="Close popup">
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4">

            <div className="grid gap-2.5">
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-[11px] font-semibold text-ink-muted">Title</label>
                  <label className="inline-flex items-center gap-2 text-[10px] font-semibold text-ink-muted">
                    <input
                      type="checkbox"
                      checked={titleEditEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setTitleEditEnabled(checked);
                        if (!checked) {
                          setTitleOverridden(false);
                          setForm(prev => ({ ...prev, reason: getAvailabilityTitle(prev.availability_type) }));
                          return;
                        }
                        setTitleOverridden(Boolean(form.reason && form.reason !== getAvailabilityTitle(form.availability_type)));
                      }}
                    />
                    Edit title
                  </label>
                </div>
                <input
                  className="input w-full text-xs disabled:cursor-not-allowed disabled:opacity-70"
                  value={form.reason || ''}
                  disabled={!titleEditEnabled}
                  onChange={e => {
                    const nextReason = e.target.value;
                    setTitleOverridden(true);
                    setForm({ ...form, reason: nextReason });
                  }}
                  placeholder={draftCard?.mode === 'weekly' ? 'Regular working hours' : 'Holiday / personal leave'}
                />
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Coach</label>
                  <select
                    className="input w-full text-xs"
                    value={form.staff_id}
                    onChange={e => setForm({ ...form, staff_id: e.target.value })}
                  >
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>{s.display_name}</option>
                    ))}
                  </select>
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
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Status</label>
                  <select
                    className="input w-full text-xs"
                    value={String(form.available)}
                    onChange={e => setForm({ ...form, available: e.target.value === 'true' })}
                  >
                    <option value="true">Available</option>
                    <option value="false">Unavailable / Leave</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Start</label>
                  <input
                    type="datetime-local"
                    className="input w-full text-xs"
                    value={form.starts_at}
                    onChange={e => setForm({ ...form, starts_at: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">End</label>
                  <input
                    type="datetime-local"
                    className="input w-full text-xs"
                    value={form.ends_at}
                    onChange={e => setForm({ ...form, ends_at: e.target.value })}
                  />
                </div>
              </div>

              {dateRangeSummary && (
                <div className="rounded border border-brand/30 bg-brand/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand">
                  {new Date(form.starts_at).toDateString() !== new Date(form.ends_at).toDateString() ? 'Cross-day range selected' : 'Date range set'}
                  <span className="mt-1 block font-medium normal-case tracking-normal text-brand/90">{dateRangeSummary}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Category</label>
                <select
                  className="input w-full text-xs"
                  value={form.availability_type}
                  onChange={e => {
                    const nextType = e.target.value;
                    setForm(prev => {
                      const categoryTitle = getAvailabilityTitle(nextType);
                      const nextReason = titleEditEnabled && titleOverridden ? prev.reason : categoryTitle;
                      return {
                        ...prev,
                        availability_type: nextType,
                        reason: nextReason,
                      };
                    });
                    if (!titleEditEnabled) {
                      setTitleOverridden(false);
                    }
                  }}
                >
                  <option value="holiday">Holiday / Annual Leave</option>
                  <option value="on_duty">On Duty (Club)</option>
                  <option value="duty_outside_club">Duty Outside Club / Tournament</option>
                  <option value="available">Open for Private/Session</option>
                  <option value="unavailable_other">Other / Personal</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3">
              {editingEntryId && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { clearForm(); setAppointmentModalOpen(false); }}>
                  Cancel edit
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  clearDraftAppointment();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  clearDraftAppointment();
                  save();
                }}
              >
                {editingEntryId ? 'Update diary entry' : 'Save appointment'}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-ink-muted" />
          <span className="font-semibold text-ink">View Staff Diary:</span>
          <select
            className="input text-xs"
            value={selectedStaffFilter}
            onChange={e => setSelectedStaffFilter(e.target.value)}
          >
            <option value="all">All Coaches & Sparrers</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>{s.display_name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-ink-muted">
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-brand" /> Allocated to Session</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-success" /> Available</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-warning" /> Holiday / Duty</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-danger" /> Unavailable</span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-3">
          <div className="text-[10px] uppercase tracking-wide text-ink-muted">Assigned sessions</div>
          <div className="mt-2 text-2xl font-black text-brand">{staffSummary.upcomingSessions}</div>
        </div>
        <div className="card p-3">
          <div className="text-[10px] uppercase tracking-wide text-ink-muted">Available windows</div>
          <div className="mt-2 text-2xl font-black text-success">{staffSummary.available}</div>
        </div>
        <div className="card p-3">
          <div className="text-[10px] uppercase tracking-wide text-ink-muted">Unavailable / leave</div>
          <div className="mt-2 text-2xl font-black text-danger">{staffSummary.unavailable}</div>
        </div>
      </div>

      {conflictWatch.length > 0 ? (
        <div className="card border-danger/40 bg-danger-soft/20 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-danger">
            <ShieldAlert className="size-4" />
            Conflict watchlist
          </div>
          <div className="space-y-2 text-xs text-ink">
            {conflictWatch.map((conflict) => (
              <div key={`${conflict.sessionId}-${conflict.window}`} className="rounded border border-danger/30 bg-white/20 p-2">
                <div className="font-bold">{conflict.sessionName}</div>
                <div className="text-ink-muted">
                  {conflict.staffName} · {conflict.reason}
                </div>
                <div className="mt-1 text-danger font-semibold">{conflict.window}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card border-success/40 bg-success-soft/20 p-3 text-xs text-success">
          <div className="flex items-center gap-2 font-bold">
            <UserCheck className="size-4" />
            No availability conflicts detected for this selection.
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <Clock className="size-4 text-brand" /> Allocated Sessions (Busy)
            </h3>
            <Badge tone="brand" size="sm">{filteredAssigned.length} sessions</Badge>
          </div>

          <div className="max-h-[460px] overflow-auto space-y-2">
            {filteredAssigned.length === 0 ? (
              <p className="p-6 text-center text-xs text-ink-muted">No allocated sessions found for this selection.</p>
            ) : (
              filteredAssigned.map(asg => (
                <div key={asg.id} className="rounded-lg border border-line bg-surface-inset p-2.5 text-xs">
                  <div className="flex items-center justify-between font-bold">
                    <span>{asg.mentis_sessions?.name}</span>
                    <Badge tone="neutral" size="sm">{asg.capacity.toUpperCase()}</Badge>
                  </div>
                  <div className="mt-1 text-ink-muted flex items-center gap-2">
                    <span>{asg.mentis_staff?.display_name}</span>
                    <span>·</span>
                    <span>{new Date(asg.planned_start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <span>{new Date(asg.planned_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(asg.planned_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-ink-faint">
                    Venue: {asg.mentis_sessions?.mentis_venues?.name ?? 'Assigned Venue'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <Calendar className="size-4 text-warning" /> Personal Diary Entries & Holidays
            </h3>
            <Badge tone="neutral" size="sm">{filteredEntries.length} records</Badge>
          </div>

          <div className="max-h-[460px] overflow-auto space-y-2">
            {filteredEntries.length === 0 ? (
              <p className="p-6 text-center text-xs text-ink-muted">No diary entries recorded for this selection.</p>
            ) : (
              filteredEntries.map(r => (
                <div
                  key={r.id}
                  className={`rounded-lg border p-2.5 text-xs ${
                    r.available ? 'border-success/30 bg-success-soft/20' : 'border-line bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>{r.mentis_staff?.display_name}</span>
                    <Badge tone={r.available ? 'success' : 'danger'} size="sm">
                      {r.available ? 'AVAILABLE' : formatAvailabilityLabel(r.availability_type).toUpperCase()}
                    </Badge>
                  </div>
                  <div className="mt-1 text-ink-muted">
                    {new Date(r.starts_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} → {new Date(r.ends_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                  {new Date(r.starts_at).toDateString() !== new Date(r.ends_at).toDateString() && (
                    <div className="mt-1 inline-flex items-center rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand">
                      Multi-day entry
                    </div>
                  )}
                  {r.reason && (
                    <div className="mt-1 text-ink-faint italic">
                      "{r.reason}"
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn btn-secondary btn-xs" onClick={() => openEntryForEdit(r)}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-danger btn-xs" onClick={() => deleteEntry(r.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

