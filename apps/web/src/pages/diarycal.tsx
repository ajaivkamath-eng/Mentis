import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { PageTitle } from '../lib/ui';
import { AlertTriangle, Clock, MapPin, ChevronLeft, ChevronRight, ChevronDown, Search, ShieldAlert, Plus, X, PencilLine, Trash2 } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { toast } from '../components/ui/toast';
import { resolveGroupMemberIds } from './ops';

function toDateInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDurationMinutes(value: number) {
  const minutes = Math.max(0, Math.min(value, 23 * 60 + 59));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(mins).padStart(2, '0')} ${suffix}`;
}

export function normalizeDiaryDateValue(value: string | null | undefined) {
  if (!value) return null;
  if (!value.includes('T') && !value.includes(' ')) return value;

  const withDivider = value.includes(' ') ? value.replace(' ', 'T') : value;
  return withDivider.replace(/([+-]\d{2})(\d{2})$/, '$1:$2').replace(/([+-]\d{2})$/, '$1:00');
}

export function getTimeMinutesFromIso(value: string) {
  const date = new Date(normalizeDiaryDateValue(value) ?? value);
  return date.getHours() * 60 + date.getMinutes();
}

export function resolveAvailabilityEntryType(item: { available?: boolean | null; availability_type?: string | null }): CalendarItemType | null {
  if (item.available === true) return 'other';

  switch (item.availability_type) {
    case 'vacation':
      return 'vacation';
    case 'on_duty':
    case 'duty_outside_club':
      return 'other';
    case 'unavailable_other':
    default:
      return 'leave';
  }
}

type QuickEntryType = 'vacation' | 'leave' | 'available' | 'unavailable';

type CalendarItemType = 'session' | 'leave' | 'vacation' | 'holiday' | 'term_break' | 'task' | 'match' | 'other';

type CalendarItem = {
  id: string;
  type: CalendarItemType;
  label: string;
  date: string;
  startsAt?: string;
};

const CALENDAR_ITEM_META: Record<CalendarItemType, { label: string; short: string; color: string }> = {
  session: { label: 'Session / program run', short: 'S', color: '#2f6f8b' },
  leave: { label: 'Leave', short: 'L', color: '#6b7280' },
  vacation: { label: 'Vacation', short: 'V', color: '#138a72' },
  holiday: { label: 'Calendar holiday', short: 'H', color: '#d0842a' },
  term_break: { label: 'Term break', short: 'TB', color: '#b45309' },
  task: { label: 'Task', short: 'T', color: '#7c3aed' },
  match: { label: 'League / event', short: 'M', color: '#2563eb' },
  other: { label: 'Other', short: 'O', color: '#16a34a' },
};

const ALL_CALENDAR_ITEM_TYPES: CalendarItemType[] = ['session', 'leave', 'vacation', 'holiday', 'term_break', 'task', 'match', 'other'];

const LIST_TYPE_COLORS: Record<CalendarItemType, string> = {
  session: '#00C875', leave: '#787878', vacation: '#138a72', holiday: '#FFCB00', term_break: '#FDAB3D',
  task: '#A25DD8', match: '#0086C0', other: '#037F4C',
};

function dateRangeStrings(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const start = new Date(normalizeDiaryDateValue(startIso) ?? `${startIso}T00:00:00Z`);
  const end = new Date(normalizeDiaryDateValue(endIso) ?? `${endIso}T00:00:00Z`);
  const cursor = new Date(start);

  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return out;
}

export function buildQuickAvailabilityRow(
  draft: {
    staff_id: string;
    organization_id: string | null;
    starts_at: string;
    ends_at: string;
    available: boolean;
    availability_type: 'vacation' | 'on_duty' | 'duty_outside_club' | 'available' | 'unavailable_other';
    reason: string;
  },
  actorUserId: string | null | undefined,
) {
  if (!actorUserId) {
    throw new Error('You must be linked to a staff profile before saving diary entries.');
  }

  return {
    organization_id: draft.organization_id,
    staff_id: draft.staff_id,
    starts_at: draft.starts_at,
    ends_at: draft.ends_at,
    available: draft.available,
    availability_type: draft.availability_type,
    reason: draft.reason || null,
    recorded_by: actorUserId,
    created_by: actorUserId,
  };
}

export function buildVenueOptions(
  sessions: Array<{ mentis_venues?: { id?: string; name?: string } | null } & Record<string, unknown>> = [],
  venueRows: Array<{ id: string; name: string }> = [],
) {
  const map = new Map<string, { id: string; name: string }>();

  venueRows.forEach((venue) => {
    if (venue?.id && venue.name) {
      map.set(venue.id, { id: venue.id, name: venue.name });
    }
  });

  sessions.forEach((session) => {
    const venue = session?.mentis_venues;
    if (venue?.id && venue.name) {
      map.set(venue.id, { id: venue.id, name: venue.name });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------- Enhanced Multi-View Session & Staff Diary ---------- */
export function DiaryCalendar() {
  const { staff } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const month = selectedDate.slice(0, 7);
  const [sessions, setSessions] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [venueList, setVenueList] = useState<Array<{ id: string; name: string }>>([]);
  const [staffingAssignments, setStaffingAssignments] = useState<any[]>([]);
  const [unavailabilities, setUnavailabilities] = useState<any[]>([]);
  const [pendingActions, setPendingActions] = useState<any[]>([]);
  const [sessionRosterMap, setSessionRosterMap] = useState<Record<string, string[]>>({});
  const [memberNameMap, setMemberNameMap] = useState<Record<string, string>>({});
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'day' | 'week' | 'month' | 'list'>('week');
  const [selectedItemTypes, setSelectedItemTypes] = useState<CalendarItemType[]>(ALL_CALENDAR_ITEM_TYPES);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickDraft, setQuickDraft] = useState<{
    staff_id: string;
    organization_id: string | null;
    starts_at: string;
    ends_at: string;
    available: boolean;
    availability_type: 'vacation' | 'on_duty' | 'duty_outside_club' | 'available' | 'unavailable_other';
    reason: string;
  } | null>(null);
  const [quickDragRange, setQuickDragRange] = useState<{ date: string; startMinutes: number; endMinutes: number } | null>(null);
  const [quickEntryType, setQuickEntryType] = useState<QuickEntryType>('leave');
  const [quickMenu, setQuickMenu] = useState<{ date: string; x: number; y: number } | null>(null);
  const [listSearch, setListSearch] = useState('');
  const [collapsedDates, setCollapsedDates] = useState<string[]>([]);
  const [editingAvailabilityId, setEditingAvailabilityId] = useState<string | null>(null);

  const toggleQuickMenu = (date: string, x: number, y: number) => {
    setQuickMenu(current => {
      if (current && current.date === date && current.x === x && current.y === y) {
        return null;
      }
      return { date, x, y };
    });
  };

  const getQuickRangeFromPointer = (event: React.PointerEvent<HTMLElement>, dateStr: string) => {
    const target = event.currentTarget.getBoundingClientRect();
    const y = Math.min(Math.max(event.clientY - target.top, 0), target.height);
    const dayStartMinutes = 8 * 60;
    const dayEndMinutes = 22 * 60;
    const startMinutes = dayStartMinutes + (y / target.height) * (dayEndMinutes - dayStartMinutes);
    const roundedMinutes = Math.round(startMinutes / 15) * 15;
    return {
      date: dateStr,
      startMinutes: Math.max(dayStartMinutes, Math.min(roundedMinutes, dayEndMinutes)),
      endMinutes: Math.min(dayEndMinutes, Math.max(Math.round((startMinutes + 60) / 15) * 15, roundedMinutes + 15)),
    };
  };

  const openQuickAddForDate = (dateStr: string, startMinutes = 9 * 60, endMinutes = 10 * 60, entryType: QuickEntryType = quickEntryType) => {
    const defaultStaff = staffList[0];
    const start = new Date(`${dateStr}T00:00:00`);
    const end = new Date(`${dateStr}T00:00:00`);
    start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

    const typedDraft = {
      vacation: { available: false, availability_type: 'vacation' as const, reason: 'Vacation' },
      leave: { available: false, availability_type: 'unavailable_other' as const, reason: 'Leave' },
      available: { available: true, availability_type: 'available' as const, reason: 'Available' },
      unavailable: { available: false, availability_type: 'unavailable_other' as const, reason: 'Unavailable' },
    }[entryType];

    setQuickDraft({
      staff_id: defaultStaff?.id ?? '',
      organization_id: defaultStaff?.organization_id ?? null,
      starts_at: toDateInputValue(start),
      ends_at: toDateInputValue(end),
      ...typedDraft,
    });
    setQuickEntryType(entryType);
    setEditingAvailabilityId(null);
    setQuickAddOpen(true);
    setQuickMenu(null);
  };

  const saveQuickDiaryEntry = async () => {
    if (!quickDraft || !quickDraft.staff_id || !quickDraft.starts_at || !quickDraft.ends_at) {
      toast.error('Please complete the start and end times before saving.');
      return;
    }

    if (!staff?.user_id) {
      toast.error('You must be linked to a staff profile before saving diary entries.');
      return;
    }

    const startDate = new Date(quickDraft.starts_at);
    const endDate = new Date(quickDraft.ends_at);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      toast.error('The selected diary timestamps are invalid.');
      return;
    }

    if (endDate <= startDate) {
      toast.error('The end time must be after the start time.');
      return;
    }

    try {
      const row = buildQuickAvailabilityRow({
        ...quickDraft,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
      }, staff.user_id);
      const { error } = editingAvailabilityId
        ? await supabase.from('mentis_staff_availability').update({
          staff_id: row.staff_id, organization_id: row.organization_id, starts_at: row.starts_at,
          ends_at: row.ends_at, available: row.available, availability_type: row.availability_type,
          reason: row.reason, updated_by: staff.user_id,
        }).eq('id', editingAvailabilityId)
        : await supabase.from('mentis_staff_availability').insert(row);

      if (error) {
        toast.error(error.message || 'Unable to save diary entry.');
        return;
      }

      toast.success(editingAvailabilityId ? 'Diary entry updated.' : 'Diary entry created successfully.');
      setQuickAddOpen(false);
      setQuickDraft(null);
      setEditingAvailabilityId(null);
      const savedDate = quickDraft.starts_at.slice(0, 10);
      if (savedDate.slice(0, 7) === month) {
        await loadData();
      }
      setSelectedDate(savedDate);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save diary entry.');
    }
  };

  const editAvailability = (id: string) => {
    const entry = unavailabilities.find(item => item.id === id);
    if (!entry) return;
    const coach = staffList.find(item => item.id === entry.staff_id);
    setQuickDraft({
      staff_id: entry.staff_id, organization_id: entry.organization_id ?? coach?.organization_id ?? null,
      starts_at: toDateInputValue(new Date(normalizeDiaryDateValue(entry.starts_at)!)),
      ends_at: toDateInputValue(new Date(normalizeDiaryDateValue(entry.ends_at)!)),
      available: entry.available, availability_type: entry.availability_type, reason: entry.reason ?? '',
    });
    setEditingAvailabilityId(id);
    setQuickEntryType(entry.availability_type === 'vacation' ? 'vacation' : entry.available ? 'available' : 'leave');
    setQuickAddOpen(true);
  };

  const deleteAvailability = async (id: string) => {
    if (!window.confirm('Delete this diary entry?')) return;
    const { error } = await supabase.from('mentis_staff_availability').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Diary entry deleted.');
    await loadData();
  };

  const loadData = async () => {
    setLoading(true);
    const [year, monthNumber] = month.split('-').map(Number);
    const from = new Date(Date.UTC(year, monthNumber - 1, -5)).toISOString();
    const to = new Date(Date.UTC(year, monthNumber, 8)).toISOString();

    const [sessRes, evRes, holRes, staffRes, venueRes, staffingRes, unavailRes, actionsRes, memberRes, templateMembersRes, enrollmentsRes] = await Promise.all([
      supabase
        .from('mentis_session_occurrences')
        .select(`
          id, template_id, name, start_at, end_at, status, venue_id,
          mentis_venues(id, name),
          responsible_coach:mentis_staff!sessions_responsible_coach_id_fkey(id, display_name),
          leading_coach:mentis_staff!sessions_leading_coach_id_fkey(id, display_name),
          assisting_coach:mentis_staff!sessions_assisting_coach_id_fkey(id, display_name)
        `)
        .gte('start_at', from)
        .lt('start_at', to)
        .order('start_at'),
      supabase
        .from('mentis_events')
        .select('id, name, starts_on, ends_on, location')
        .lt('starts_on', to.slice(0, 10))
        .gte('ends_on', from.slice(0, 10)),
      supabase
        .from('mentis_holiday_calendar')
        .select('*')
        .order('starts_on'),
      supabase
        .from('mentis_staff')
        .select('id, organization_id, display_name, roles'),
      supabase
        .from('mentis_venues')
        .select('id, name')
        .order('name'),
      supabase
        .from('mentis_session_staffing')
        .select('*, mentis_staff(display_name)')
        .gte('planned_start', from)
        .lt('planned_start', to),
      supabase
        .from('mentis_staff_availability')
        .select('*, mentis_staff!staff_availability_staff_id_fkey(display_name)')
        .lt('starts_at', to)
        .gt('ends_at', from),
      supabase
        .from('mentis_pending_actions')
        .select('*, mentis_action_types(name)')
        .eq('status', 'open')
        .order('due_at', { ascending: true })
        .limit(25),
      supabase
        .from('mentis_members')
        .select('id, name')
        .order('name')
        .limit(1000),
      supabase
        .from('mentis_session_template_members')
        .select('template_id, member_id, valid_from, valid_to')
        .limit(5000),
      supabase
        .from('mentis_enrollments')
        .select('session_id, member_id, valid_from, valid_to')
        .limit(5000),
    ]);

    const memberRows = (memberRes.data ?? []) as Array<{ id: string; name: string }>;
    const templateMemberRows = (templateMembersRes.data ?? []) as Array<{ template_id: string; member_id: string; valid_from?: string | null; valid_to?: string | null }>;
    const enrollmentRows = (enrollmentsRes.data ?? []) as Array<{ session_id: string; member_id: string; valid_from?: string | null; valid_to?: string | null }>;
    const nextRosterMap: Record<string, string[]> = {};
    const nextMemberNameMap: Record<string, string> = {};

    memberRows.forEach((member) => {
      nextMemberNameMap[member.id] = member.name;
    });

    (sessRes.data ?? []).forEach((session) => {
      nextRosterMap[session.id] = resolveGroupMemberIds({ sessions: [session] }, templateMemberRows, enrollmentRows);
    });

    setSessions(sessRes.data ?? []);
    setEvents(evRes.data ?? []);
    setHolidays(holRes.data ?? []);
    setStaffList(staffRes.data ?? []);
    setVenueList((venueRes.data ?? []) as Array<{ id: string; name: string }>);
    setStaffingAssignments(staffingRes.data ?? []);
    setUnavailabilities(unavailRes.data ?? []);
    setPendingActions(actionsRes.data ?? []);
    setSessionRosterMap(nextRosterMap);
    setMemberNameMap(nextMemberNameMap);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [month]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (quickMenu) {
          setQuickMenu(null);
          return;
        }
        if (quickAddOpen) {
          setQuickAddOpen(false);
          setQuickDraft(null);
        }
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [quickMenu, quickAddOpen]);

  // Venue list & distinct colors
  const venues = useMemo(() => buildVenueOptions(sessions, venueList), [sessions, venueList]);

  const venueColorMap = useMemo(() => {
    const palette = [
      'var(--brand)',
      'var(--accent)',
      '#0ea5e9', // sky
      '#10b981', // emerald
      '#8b5cf6', // purple
      '#f59e0b', // amber
    ];
    const map: Record<string, string> = {};
    venues.forEach((v, i) => {
      map[v.id] = palette[i % palette.length];
    });
    return map;
  }, [venues]);

  const toggleVenue = (venueId: string) => {
    setSelectedVenues(prev =>
      prev.includes(venueId) ? prev.filter(id => id !== venueId) : [...prev, venueId]
    );
  };

  // Conflict detection: coach assigned but marked unavailable within 30 days
  const sessionConflicts = useMemo(() => {
    const conflicts = new Map<string, { staffName: string; reason: string; role: string }[]>();
    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

    sessions.forEach(sess => {
      const sessStart = new Date(sess.start_at);
      const sessEnd = new Date(sess.end_at);

      // Check staffing assignments
      const assigned = staffingAssignments.filter(sa => sa.session_id === sess.id);
      assigned.forEach(asg => {
        const pStart = new Date(asg.planned_start);
        const pEnd = new Date(asg.planned_end);
        const unavail = unavailabilities.find(u => {
          if (u.available) return false;
          if (u.staff_id !== asg.staff_id) return false;
          const uStart = new Date(u.starts_at);
          const uEnd = new Date(u.ends_at);
          return pStart < uEnd && uStart < pEnd;
        });

        if (unavail) {
          const list = conflicts.get(sess.id) ?? [];
          list.push({
            staffName: asg.mentis_staff?.display_name ?? 'Coach',
            reason: unavail.reason || 'Unscheduled Leave',
            role: asg.capacity,
          });
          conflicts.set(sess.id, list);
        }
      });

      // Also check responsible coach
      if (sess.responsible_coach) {
        const unavail = unavailabilities.find(u => {
          if (u.available) return false;
          if (u.staff_id !== sess.responsible_coach.id) return false;
          const uStart = new Date(u.starts_at);
          const uEnd = new Date(u.ends_at);
          return sessStart < uEnd && uStart < sessEnd;
        });
        if (unavail) {
          const list = conflicts.get(sess.id) ?? [];
          if (!list.some(c => c.staffName === sess.responsible_coach.display_name)) {
            list.push({
              staffName: sess.responsible_coach.display_name,
              reason: unavail.reason || 'Leave',
              role: 'responsible',
            });
            conflicts.set(sess.id, list);
          }
        }
      }
    });

    return conflicts;
  }, [sessions, staffingAssignments, unavailabilities]);

  // Filtered sessions based on venue and staff filter
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      if (selectedVenues.length > 0 && !selectedVenues.includes(s.venue_id)) return false;
      if (selectedStaffFilter !== 'all') {
        const staffAssigned = staffingAssignments.some(sa => sa.session_id === s.id && sa.staff_id === selectedStaffFilter);
        const isResponsible = s.responsible_coach?.id === selectedStaffFilter;
        const isLead = s.leading_coach?.id === selectedStaffFilter;
        const isAssist = s.assisting_coach?.id === selectedStaffFilter;
        if (!staffAssigned && !isResponsible && !isLead && !isAssist) return false;
      }
      return true;
    });
  }, [sessions, selectedVenues, selectedStaffFilter, staffingAssignments]);

  // Helper date calculations
  const currDateObj = new Date(selectedDate);
  const weekStart = useMemo(() => {
    const d = new Date(currDateObj);
    const day = (d.getDay() + 6) % 7; // Monday is 0
    d.setDate(d.getDate() - day);
    return d;
  }, [selectedDate]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [weekStart]);

  const monthGridDays = useMemo(() => {
    const first = new Date(`${month}-01T00:00:00Z`);
    const firstDate = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    const lead = (firstDate.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 0)).getUTCDate();
    const prevMonthDays = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), 0)).getUTCDate();
    const cells: { date: string; isCurrentMonth: boolean }[] = [];

    for (let i = 0; i < lead; i += 1) {
      const day = prevMonthDays - lead + i + 1;
      const date = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() - 1, day));
      cells.push({ date: date.toISOString().slice(0, 10), isCurrentMonth: false });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), day));
      cells.push({ date: date.toISOString().slice(0, 10), isCurrentMonth: true });
    }

    while (cells.length % 7 !== 0) {
      const nextDay = cells.length - (lead + daysInMonth) + 1;
      const date = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, nextDay));
      cells.push({ date: date.toISOString().slice(0, 10), isCurrentMonth: false });
    }

    return cells;
  }, [month]);

  const currentMonthLabel = useMemo(() => {
    const first = new Date(`${month}-01T00:00:00Z`);
    return first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [month]);

  const toggleItemType = (type: CalendarItemType) => {
    setSelectedItemTypes(prev => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev;
        return prev.filter(item => item !== type);
      }
      return [...prev, type];
    });
  };

  const visibleAvailability = useMemo(() => unavailabilities.filter(item =>
    (selectedStaffFilter === 'all' || item.staff_id === selectedStaffFilter) &&
    selectedItemTypes.includes(resolveAvailabilityEntryType(item) ?? 'leave')
  ), [unavailabilities, selectedStaffFilter, selectedItemTypes]);

  const calendarItems = useMemo<CalendarItem[]>(() => {
    const items: CalendarItem[] = [];

    filteredSessions.forEach(session => {
      const date = session.start_at.slice(0, 10);
      items.push({ id: `session-${session.id}`, type: 'session', label: session.name, date, startsAt: session.start_at });
    });

    visibleAvailability.forEach(item => {
      const start = normalizeDiaryDateValue(item.starts_at)?.slice(0, 10) ?? item.starts_at?.slice(0, 10);
      const end = normalizeDiaryDateValue(item.ends_at)?.slice(0, 10) ?? item.ends_at?.slice(0, 10);
      if (!start || !end) return;
      dateRangeStrings(start, end).forEach((date) => {
        items.push({ id: `availability-${item.id}-${date}`, type: resolveAvailabilityEntryType(item) ?? 'leave', label: `${item.reason || item.availability_type} · ${item.mentis_staff?.display_name ?? staffList.find(coach => coach.id === item.staff_id)?.display_name ?? 'Coach'}`, date, startsAt: item.starts_at });
      });
    });

    holidays.forEach(item => {
      const range = dateRangeStrings(item.starts_on, item.ends_on);
      range.forEach((date) => {
        const type = /term|break/i.test(item.name) || item.kind === 'term_break' || item.kind === 'term_holiday' || item.kind === 'term_holiday_week'
          ? 'term_break'
          : 'holiday';
        items.push({ id: `holiday-${item.id}-${date}`, type, label: item.name, date });
      });
    });

    pendingActions.forEach(item => {
      const date = item.due_at ? item.due_at.slice(0, 10) : item.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
      items.push({ id: `task-${item.id}`, type: 'task', label: item.title || item.action || 'Task', date });
    });

    events.forEach(item => {
      dateRangeStrings(item.starts_on, item.ends_on ?? item.starts_on).forEach(date => {
        items.push({ id: `match-${item.id}-${date}`, type: 'match', label: item.name || 'Event', date });
      });
    });

    return items;
  }, [filteredSessions, visibleAvailability, holidays, pendingActions, events, staffList]);

  const itemsByDate = useMemo<Record<string, CalendarItem[]>>(() => {
    const map: Record<string, CalendarItem[]> = {};
    calendarItems
      .filter(item => selectedItemTypes.includes(item.type))
      .forEach((item) => {
        if (!map[item.date]) map[item.date] = [];
        map[item.date].push(item);
      });

    Object.values(map).forEach(list => {
      list.sort((a, b) => {
        if (a.startsAt && b.startsAt) return a.startsAt.localeCompare(b.startsAt);
        const order = ALL_CALENDAR_ITEM_TYPES.indexOf(a.type);
        const orderB = ALL_CALENDAR_ITEM_TYPES.indexOf(b.type);
        return order - orderB || a.label.localeCompare(b.label);
      });
    });

    return map;
  }, [calendarItems, selectedItemTypes]);

  const agendaEntries = useMemo(() => {
    const rows: Array<{
      id: string;
      date: string;
      start: Date;
      end: Date;
      type: CalendarItemType;
      title: string;
      subtitle: string;
      venue: string;
      staffId?: string;
      venueId?: string;
      availabilityId?: string;
      status: string;
      color: string;
    }> = [];

    filteredSessions.forEach((session) => {
      const start = new Date(normalizeDiaryDateValue(session.start_at) ?? session.start_at);
      const end = new Date(normalizeDiaryDateValue(session.end_at) ?? session.end_at);
      const staffIds = [session.responsible_coach?.id, session.leading_coach?.id, session.assisting_coach?.id].filter(Boolean) as string[];
      const coachLabel = staffIds.length ? `Coach: ${session.responsible_coach?.display_name ?? session.leading_coach?.display_name ?? 'Team'}` : 'Coach: Team';
      rows.push({
        id: `session-${session.id}`,
        date: session.start_at.slice(0, 10),
        start,
        end,
        type: 'session',
        title: session.name,
        subtitle: coachLabel,
        venue: session.mentis_venues?.name ?? 'Venue TBD',
        staffId: staffIds[0],
        venueId: session.venue_id,
        status: session.status === 'cancelled' ? 'Cancelled' : 'Scheduled',
        color: CALENDAR_ITEM_META.session.color,
      });
    });

    visibleAvailability.forEach((item) => {
      const start = new Date(normalizeDiaryDateValue(item.starts_at) ?? item.starts_at);
      const end = new Date(normalizeDiaryDateValue(item.ends_at) ?? item.ends_at);
      const type = resolveAvailabilityEntryType(item) ?? 'leave';
      rows.push({
        id: `availability-${item.id}`,
        date: normalizeDiaryDateValue(item.starts_at)?.slice(0, 10) ?? item.starts_at.slice(0, 10),
        start,
        end,
        type,
        title: item.reason || (item.available ? 'Available' : type === 'vacation' ? 'Vacation' : 'Leave'),
        subtitle: `Coach: ${item.mentis_staff?.display_name ?? staffList.find(coach => coach.id === item.staff_id)?.display_name ?? 'Assigned coach'}`,
        venue: 'Personal diary',
        staffId: item.staff_id,
        availabilityId: item.id,
        status: item.available ? 'Available' : 'Unavailable',
        color: CALENDAR_ITEM_META[type].color,
      });
    });

    holidays.forEach(item => {
      const type = /term|break/i.test(item.name) || ['term_break', 'term_holiday', 'term_holiday_week'].includes(item.kind) ? 'term_break' : 'holiday';
      dateRangeStrings(item.starts_on, item.ends_on).forEach(date => rows.push({
        id: `holiday-${item.id}-${date}`, date, start: new Date(`${date}T00:00:00`), end: new Date(`${date}T00:00:00`),
        type, title: item.name, subtitle: '', venue: 'All venues', status: 'Scheduled', color: CALENDAR_ITEM_META[type].color,
      }));
    });
    pendingActions.forEach(item => {
      const date = item.due_at?.slice(0, 10) ?? item.created_at?.slice(0, 10);
      if (date) rows.push({ id: `task-${item.id}`, date, start: new Date(normalizeDiaryDateValue(item.due_at ?? item.created_at) ?? `${date}T00:00:00`), end: new Date(normalizeDiaryDateValue(item.due_at ?? item.created_at) ?? `${date}T00:00:00`), type: 'task', title: item.title ?? 'Task', subtitle: '', venue: 'No venue', status: 'Pending', color: CALENDAR_ITEM_META.task.color });
    });
    events.forEach(item => {
      dateRangeStrings(item.starts_on, item.ends_on ?? item.starts_on).forEach(date => {
        rows.push({ id: `match-${item.id}-${date}`, date, start: new Date(`${date}T00:00:00`), end: new Date(`${date}T00:00:00`), type: 'match', title: item.name, subtitle: '', venue: item.location ?? 'Venue TBD', status: 'Scheduled', color: CALENDAR_ITEM_META.match.color });
      });
    });

    return rows
      .filter(item => selectedItemTypes.includes(item.type))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [filteredSessions, visibleAvailability, selectedItemTypes, staffList, holidays, pendingActions, events]);

  const listDates = weekDays;
  const listEntries = agendaEntries.filter(item =>
    item.date >= listDates[0] && item.date <= listDates[6] &&
    (selectedVenues.length === 0 || Boolean(item.venueId && selectedVenues.includes(item.venueId))) &&
    (!listSearch.trim() || `${item.title} ${item.subtitle}`.toLowerCase().includes(listSearch.trim().toLowerCase()))
  );

  const isHoliday = (dateIso: string) => {
    return holidays.find(h => dateIso >= h.starts_on && dateIso <= h.ends_on);
  };

  const shiftDate = (deltaDays: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + deltaDays);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const resolveAction = async (actionId: string) => {
    const { error } = await supabase.from('mentis_pending_actions').update({ status: 'closed' }).eq('id', actionId);
    if (!error) {
      setPendingActions(prev => prev.filter(action => action.id !== actionId));
      await loadData();
    }
  };

  const renderAvailabilityBlocks = (date: string, pixelsPerHour: number) => {
    const entries = agendaEntries.filter(item => item.date === date && item.availabilityId);
    return entries.map(item => {
      const overlapping = entries.filter(other => item.start < other.end && other.start < item.end);
      const column = overlapping.findIndex(other => other.id === item.id);
      const startMinutes = item.start.getHours() * 60 + item.start.getMinutes();
      const endMinutes = item.end.getHours() * 60 + item.end.getMinutes();
      const top = ((startMinutes - 8 * 60) / 60) * pixelsPerHour;
      const height = Math.max(24, ((endMinutes - startMinutes) / 60) * pixelsPerHour);
      return (
        <div
          key={item.id}
          className="absolute z-10 overflow-hidden rounded border bg-white px-1.5 py-1 text-[10px] shadow-sm"
          style={{ top, height, left: `${(column / overlapping.length) * 100}%`, width: `${100 / overlapping.length}%`, borderLeft: `3px solid ${item.color}` }}
          title={`${item.title} · ${item.subtitle} · ${item.start.toLocaleTimeString()}–${item.end.toLocaleTimeString()}`}
        >
          <div className="truncate font-semibold text-slate-900">{item.title}</div>
          <div className="truncate text-slate-600">{item.subtitle}</div>
          <div className="truncate text-slate-500">{item.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      );
    });
  };

  const renderAllDayEntries = (date: string) => {
    const entries = (itemsByDate[date] ?? []).filter(item => ['holiday', 'term_break', 'match', 'task'].includes(item.type));
    if (!entries.length) return null;
    return <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-2 py-2" aria-label={`All-day entries for ${date}`} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      {entries.map(item => <span key={item.id} className="inline-flex max-w-full items-center gap-1 truncate rounded border px-2 py-1 text-[10px] font-semibold text-slate-800" style={{ backgroundColor: `${CALENDAR_ITEM_META[item.type].color}16`, borderLeft: `3px solid ${CALENDAR_ITEM_META[item.type].color}` }} title={`${CALENDAR_ITEM_META[item.type].label}: ${item.label}`}>
        <span className="shrink-0 text-[9px] uppercase text-slate-600">{CALENDAR_ITEM_META[item.type].label}</span>
        <span className="truncate">{item.label}</span>
      </span>)}
    </div>;
  };

  return (
    <div className="space-y-4">
      {/* Page Title & Navigation Toolbar */}
      <div className="rounded-[22px] border border-slate-200/80 bg-white/80 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.04)] backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <PageTitle
              title="Session & Staff Diary"
              sub="Sessions, coach availability, conflicts, and venue legends"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-slate-200 bg-slate-100 p-1">
              {(['day', 'week', 'month', 'list'] as const).map(v => (
                <button
                  key={v}
                  className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                    view === v
                      ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]'
                      : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                  }`}
                  onClick={() => setView(v)}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-1">
              <button
                onClick={() => shiftDate(view === 'day' ? -1 : view === 'week' || view === 'list' ? -7 : -30)}
                className="rounded-full p-2 text-slate-600 hover:bg-white hover:text-slate-900"
                aria-label="Previous window"
              >
                <ChevronLeft className="size-4" />
              </button>
              <input
                type="date"
                className="border-0 bg-transparent px-1 text-xs font-semibold text-slate-700 focus:outline-none"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
              />
              <button
                onClick={() => shiftDate(view === 'day' ? 1 : view === 'week' || view === 'list' ? 7 : 30)}
                className="rounded-full p-2 text-slate-600 hover:bg-white hover:text-slate-900"
                aria-label="Next window"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <select
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none"
              value={selectedStaffFilter}
              onChange={e => setSelectedStaffFilter(e.target.value)}
            >
              <option value="all">All coaches</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>{s.display_name}</option>
              ))}
            </select>

            {view === 'list' && <label className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2.5 text-slate-500 focus-within:border-sky-500">
              <Search className="size-4" />
              <input type="search" aria-label="Search diary" placeholder="Search diary" value={listSearch} onChange={event => setListSearch(event.target.value)} className="h-9 w-40 bg-transparent text-xs text-slate-800 outline-none" />
            </label>}

            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-sm transition hover:bg-slate-700"
              onClick={() => openQuickAddForDate(selectedDate, 9 * 60, 10 * 60, quickEntryType)}
            >
              <Plus className="size-3.5" />
              Add entry
            </button>
          </div>
        </div>
      </div>

      {pendingActions.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft/20 p-3 text-xs text-ink">
          <div className="mb-2 flex items-center gap-2 font-bold text-danger">
            <ShieldAlert className="size-4" />
            Open staffing escalation(s)
          </div>
          <div className="space-y-2">
            {pendingActions.slice(0, 4).map((action) => (
              <div key={action.id} className="rounded border border-danger/20 bg-white/20 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold">{action.title}</div>
                  <button className="btn btn-ghost btn-sm text-[10px]" onClick={() => resolveAction(action.id)}>
                    Resolve
                  </button>
                </div>
                <div className="mt-1 text-ink-muted">
                  {action.mentis_action_types?.name} · due {new Date(action.due_at).toLocaleDateString('en-GB')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Venue Legend & Conflict Banner */}
<div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-xs shadow-[0_6px_20px_rgba(15,23,42,0.02)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 font-semibold text-slate-600">
            <MapPin className="size-3.5" /> Venues:
          </span>
          {venues.map(v => {
            const isSelected = selectedVenues.includes(v.id);
            const color = venueColorMap[v.id] || 'var(--brand)';
            return (
              <button
                key={v.id}
                onClick={() => toggleVenue(v.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  isSelected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                {v.name}
              </button>
            );
          })}
          {selectedVenues.length > 0 && (
            <button
              onClick={() => setSelectedVenues([])}
              className="text-xs text-slate-500 underline hover:text-slate-800"
            >
              Reset
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ALL_CALENDAR_ITEM_TYPES.map(type => {
            const active = selectedItemTypes.includes(type);
            const meta = CALENDAR_ITEM_META[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleItemType(type)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                  active ? 'border-slate-900 bg-white text-slate-900' : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: meta.color }} />
                {meta.label}
              </button>
            );
          })}
        </div>

        {sessionConflicts.size > 0 && (
          <div className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
            <ShieldAlert className="size-4 animate-pulse" />
            <span>{sessionConflicts.size} conflict(s)</span>
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="card p-12 text-center text-ink-muted">
          <span className="inline-block size-6 animate-spin rounded-full border-2 border-brand border-t-transparent mb-2" />
          <p className="text-sm">Loading diary schedule and coach availability…</p>
        </div>
      ) : view === 'day' ? (
        /* DAY VIEW */
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_32px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Daily timeline</div>
              <h3 className="mt-1 text-sm font-black text-slate-900">
                {new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>
            </div>
          </div>

          <div className="p-3">
            {renderAllDayEntries(selectedDate)}
            <div
              className="relative mb-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-3 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 transition hover:border-slate-400 hover:bg-slate-100"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                toggleQuickMenu(selectedDate, rect.left + rect.width / 2, rect.top + 20);
              }}
              onPointerDown={(event) => {
                const drag = getQuickRangeFromPointer(event, selectedDate);
                setQuickDragRange(drag);
              }}
              onPointerMove={(event) => {
                if (!quickDragRange || quickDragRange.date !== selectedDate) return;
                const next = getQuickRangeFromPointer(event, selectedDate);
                setQuickDragRange({ ...next, startMinutes: Math.min(quickDragRange.startMinutes, next.startMinutes), endMinutes: Math.max(quickDragRange.startMinutes, next.endMinutes) });
              }}
              onPointerUp={() => {
                if (quickDragRange) {
                  openQuickAddForDate(selectedDate, quickDragRange.startMinutes, quickDragRange.endMinutes, quickEntryType);
                  setQuickDragRange(null);
                }
              }}
            >
              {quickDragRange?.date === selectedDate && (
                <div className="pointer-events-none absolute inset-2 rounded-lg border border-blue-400 bg-blue-500/10">
                  <div className="absolute inset-x-2 top-2 rounded-md border border-blue-500 bg-blue-500/20 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-blue-700">
                    {formatDurationMinutes(quickDragRange.startMinutes)} – {formatDurationMinutes(quickDragRange.endMinutes)}
                  </div>
                </div>
              )}
              Click or drag in this area to create a diary entry for {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/50">
              <div className="relative flex min-h-[780px]">
                <div className="w-16 shrink-0 border-r border-slate-200 bg-white">
                  {Array.from({ length: 14 }, (_, index) => 8 + index).map(hour => (
                    <div key={hour} className="flex h-[60px] items-start justify-end pr-2 pt-1 text-[10px] font-bold text-slate-400">
                      {hour > 12 ? hour - 12 : hour}{hour >= 12 && hour !== 12 ? 'PM' : hour === 12 ? 'PM' : 'AM'}
                    </div>
                  ))}
                </div>

                <div className="relative flex-1 bg-slate-50/40">
                  {Array.from({ length: 14 }, (_, index) => 8 + index).map(hour => (
                    <div key={`slot-${hour}`} className="h-[60px] border-b border-slate-200" />
                  ))}

                  {filteredSessions
                    .filter(s => s.start_at.slice(0, 10) === selectedDate)
                    .map(s => {
                      const startMinutes = getTimeMinutesFromIso(s.start_at);
                      const endMinutes = getTimeMinutesFromIso(s.end_at);
                      const top = Math.max(0, ((startMinutes - 8 * 60) / (13 * 60)) * 840);
                      const height = Math.max(52, ((endMinutes - startMinutes) / (13 * 60)) * 840);
                      const venueColor = venueColorMap[s.venue_id] || 'var(--brand)';
                      const activeRosterIds = sessionRosterMap[s.id] ?? [];
                      const activeRosterNames = activeRosterIds
                        .map((memberId) => memberNameMap[memberId])
                        .filter(Boolean)
                        .sort((a, b) => a.localeCompare(b));

                      return (
                        <Link
                          key={s.id}
                          to={`/register/${s.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="group absolute left-3 right-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition hover:shadow-md"
                          style={{ top: `${top + 6}px`, height: `${Math.min(height, 180)}px`, borderLeft: `4px solid ${venueColor}` }}
                          title={`${s.name} · ${s.mentis_venues?.name} · ${activeRosterNames.length} active roster members`}
                        >
                          <div className="flex h-full flex-col justify-between p-2.5">
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[11px] font-black text-slate-900">{s.name}</div>
                                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-600">
                                  {s.mentis_venues?.name || 'Venue'}
                                </span>
                              </div>
                              <div className="mt-1 text-[10px] font-semibold text-slate-500">
                                {new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(s.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                              {s.responsible_coach && <span className="rounded-full bg-slate-100 px-1.5 py-0.5">Resp: {s.responsible_coach.display_name}</span>}
                              {s.leading_coach && <span className="rounded-full bg-slate-100 px-1.5 py-0.5">Lead: {s.leading_coach.display_name}</span>}
                              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                                roster: {activeRosterNames.length}
                              </span>
                            </div>

                            {activeRosterNames.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1 text-[8px] text-slate-600">
                                {activeRosterNames.slice(0, 3).map((name) => (
                                  <span key={name} className="rounded bg-slate-100 px-1 py-[1px]">{name}</span>
                                ))}
                                {activeRosterNames.length > 3 && (
                                  <span className="rounded bg-slate-100 px-1 py-[1px]">+{activeRosterNames.length - 3}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  {renderAvailabilityBlocks(selectedDate, 60)}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : view === 'list' ? (
        <section className="space-y-4" aria-label="Diary list">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Diary entries</h2>
              <p className="text-xs text-slate-500">{listDates[0]} to {listDates[6]} · {listEntries.length} entries</p>
            </div>
          </div>
          {listDates.map((date, index) => {
            const entries = listEntries.filter(item => item.date === date);
            const collapsed = collapsedDates.includes(date);
            const dateTitle = new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
            const hours = entries.reduce((total, item) => total + Math.max(0, (item.end.getTime() - item.start.getTime()) / 3600000), 0);
            const sessionCount = entries.filter(item => item.type === 'session').length;
            const groupColor = ['#00C875', '#0086C0', '#A25DD8', '#FDAB3D', '#E2445C', '#037F4C', '#787878'][index];
            return (
              <div key={date} className="border-b border-slate-200 pb-3">
                <button type="button" aria-expanded={!collapsed} aria-controls={`diary-group-${date}`} onClick={() => setCollapsedDates(previous => collapsed ? previous.filter(value => value !== date) : [...previous, date])} className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50">
                  {collapsed ? <ChevronRight className="size-4 text-slate-600" /> : <ChevronDown className="size-4 text-slate-600" />}
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: groupColor }} />
                  <span className="text-sm font-bold text-slate-900">{date === new Date().toISOString().slice(0, 10) ? `Today - ${dateTitle}` : dateTitle}</span>
                  <span className="text-xs text-slate-500">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
                </button>
                {!collapsed && <div id={`diary-group-${date}`} className="overflow-x-auto">
                  <table className="w-full min-w-[900px] table-fixed text-left text-xs">
                    <colgroup><col className="w-[23%]" /><col className="w-[15%]" /><col className="w-[15%]" /><col className="w-[16%]" /><col className="w-[11%]" /><col className="w-[12%]" /><col className="w-[8%]" /></colgroup>
                    <thead><tr className="border-b border-slate-200 text-[10px] font-semibold uppercase text-slate-500">
                      {['Entry', 'Coach / person', 'Timeline', 'Venue', 'Type', 'Status', 'Actions'].map(label => <th key={label} scope="col" className="px-3 py-2">{label}</th>)}
                    </tr></thead>
                    <tbody>
                      {entries.length === 0 ? <tr><td colSpan={7} className="px-4 py-3 text-slate-500"><span>No scheduled sessions for this date.</span> Click + Add Entry to create one.</td></tr> : entries.map(item => {
                        const person = item.subtitle.replace(/^Coach: /, '');
                        const color = LIST_TYPE_COLORS[item.type];
                        const venueIndex = venues.findIndex(venue => venue.id === item.venueId);
                        const venueBadge = venueIndex < 0 ? { backgroundColor: '#f1f5f9', color: '#475569' } : venueIndex % 2 === 0 ? { backgroundColor: '#d6f7eb', color: '#075858' } : { backgroundColor: '#ffecd1', color: '#854d0e' };
                        return <tr key={item.id} className="group border-b border-slate-100 bg-white hover:bg-slate-50/70" style={{ borderLeft: `4px solid ${color}` }}>
                          <td className="truncate px-3 py-2.5 font-semibold text-slate-900" title={item.title}>{item.title}</td>
                          <td className="px-3 py-2.5">{person && <span className="inline-flex max-w-full items-center gap-1.5 truncate text-slate-700"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-800">{person.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span><span className="truncate">{person}</span></span>}</td>
                          <td className="px-3 py-2.5"><span className="inline-block rounded bg-slate-100 px-2 py-1 font-medium tabular-nums text-slate-700">{item.start.getTime() === item.end.getTime() ? 'All day' : `${item.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} - ${item.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`}</span></td>
                          <td className="px-3 py-2.5"><span className="inline-block max-w-full truncate rounded px-2 py-1 font-medium" style={venueBadge} title={item.venue}>{item.venue}</span></td>
                          <td className="px-3 py-2.5"><span className="inline-block rounded px-2 py-1 text-[10px] font-bold uppercase text-white" style={{ backgroundColor: color, color: item.type === 'holiday' ? '#342b00' : '#fff' }}>{CALENDAR_ITEM_META[item.type].label}</span></td>
                          <td className="px-3 py-2.5"><span className={`inline-block rounded px-2 py-1 font-semibold ${item.status === 'Unavailable' ? 'bg-slate-200 text-slate-700' : item.status === 'Pending' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}>{item.status}</span></td>
                          <td className="px-3 py-2.5"><div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                            {item.availabilityId && <><button type="button" title="Edit entry" aria-label={`Edit ${item.title}`} onClick={() => editAvailability(item.availabilityId!)} className="rounded p-1 hover:bg-slate-200"><PencilLine className="size-4" /></button><button type="button" title="Delete entry" aria-label={`Delete ${item.title}`} onClick={() => deleteAvailability(item.availabilityId!)} className="rounded p-1 hover:bg-red-100 hover:text-red-700"><Trash2 className="size-4" /></button></>}
                            {item.type === 'session' && <Link to={`/register/${item.id.replace('session-', '')}`} aria-label={`Open ${item.title}`} className="rounded p-1 hover:bg-slate-200"><ChevronRight className="size-4" /></Link>}
                          </div></td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500">
                    <button type="button" className="inline-flex items-center gap-1 text-sky-700 hover:underline" onClick={() => openQuickAddForDate(date)}><Plus className="size-3.5" /> Add entry</button>
                    <span>{sessionCount} {sessionCount === 1 ? 'session' : 'sessions'} · {hours.toFixed(1)} hours</span>
                  </div>
                </div>}
              </div>
            );
          })}
        </section>
      ) : view === 'week' ? (
        /* WEEK VIEW */
        <div className="overflow-x-auto pb-1.5">
          <div className="grid min-w-[1020px] grid-cols-[68px_repeat(7,minmax(140px,1fr))] gap-2">
            <div className="rounded-[14px] border border-slate-700 bg-slate-900 shadow-[0_5px_14px_rgba(15,23,42,0.14)]">
              <div className="flex h-[40px] items-center justify-center border-b border-slate-700 bg-slate-900 text-[9px] font-black uppercase tracking-[0.18em] text-slate-200">
                Time
              </div>
              <div className="relative h-[500px] overflow-hidden">
                {Array.from({ length: 12 }, (_, index) => 8 + index).map(hour => (
                  <div key={`time-${hour}`} className="flex h-[40px] items-start justify-center border-b border-slate-700/80 bg-slate-900 pt-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-300">
                    {hour > 12 ? hour - 12 : hour}{hour >= 12 && hour !== 12 ? 'PM' : hour === 12 ? 'PM' : 'AM'}
                  </div>
                ))}
              </div>
            </div>

            {weekDays.map(dateStr => {
              const dayObj = new Date(dateStr);
              const isSelected = selectedDate === dateStr;
              const isToday = new Date().toISOString().slice(0, 10) === dateStr;
              const hol = isHoliday(dateStr);
              const daySessions = filteredSessions.filter(s => s.start_at.slice(0, 10) === dateStr);

              return (
                <div
                  key={dateStr}
                  className={`relative min-h-[540px] rounded-[12px] border bg-white shadow-[0_4px_12px_rgba(15,23,42,0.05)] transition ${
                    isSelected
                      ? 'border-[#99d7d3] bg-[#f3fbfa] shadow-[inset_0_0_0_1px_rgba(39,117,113,0.18),0_4px_12px_rgba(15,23,42,0.05)]'
                      : 'border-slate-200'
                  } ${
                    hol ? 'bg-amber-50/35' : 'bg-white'
                  }`}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    toggleQuickMenu(dateStr, rect.left + rect.width / 2, rect.top + rect.height / 2);
                  }}
                  onPointerDown={(event) => {
                    const drag = getQuickRangeFromPointer(event, dateStr);
                    setQuickDragRange(drag);
                  }}
                  onPointerMove={(event) => {
                    if (!quickDragRange || quickDragRange.date !== dateStr) return;
                    const next = getQuickRangeFromPointer(event, dateStr);
                    setQuickDragRange({ ...next, startMinutes: Math.min(quickDragRange.startMinutes, next.startMinutes), endMinutes: Math.max(quickDragRange.startMinutes, next.endMinutes) });
                  }}
                  onPointerUp={() => {
                    if (quickDragRange) {
                      openQuickAddForDate(dateStr, quickDragRange.startMinutes, quickDragRange.endMinutes, quickEntryType);
                      setQuickDragRange(null);
                    }
                  }}
                >
                  {quickDragRange?.date === dateStr && (
                    <div className="pointer-events-none absolute inset-2 rounded-[10px] border border-blue-400 bg-blue-500/10">
                      <div className="absolute inset-x-2 top-2 rounded-md border border-blue-500 bg-blue-500/20 px-2 py-1 text-[8px] font-bold uppercase tracking-[0.12em] text-blue-700">
                        {formatDurationMinutes(quickDragRange.startMinutes)} – {formatDurationMinutes(quickDragRange.endMinutes)}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-2 pb-1 pt-1.5 text-center">
                    <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      {dayObj.toLocaleDateString('en-GB', { weekday: 'short' })}
                    </div>
                    <div className={`inline-flex h-6 w-6 items-center justify-center rounded-[8px] text-[11px] font-bold ${
                      isSelected ? 'bg-[#dff5f3] text-slate-900 shadow-[inset_0_0_0_1px_rgba(28,114,109,0.20)]' : isToday ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {dayObj.getDate()}
                    </div>
                  </div>

                  {renderAllDayEntries(dateStr)}

                  <div className="relative h-[500px] overflow-hidden rounded-b-[14px] bg-[linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:100%_40px]">
                    {Array.from({ length: 12 }, (_, index) => 8 + index).map(hour => (
                      <div key={`${dateStr}-${hour}`} className="h-[40px] border-b border-slate-200/90 bg-white/20" />
                    ))}

                    {daySessions.map(s => {
                      const startMinutes = getTimeMinutesFromIso(s.start_at);
                      const endMinutes = getTimeMinutesFromIso(s.end_at);
                      const top = Math.max(0, ((startMinutes - 8 * 60) / (12 * 60)) * 500);
                      const height = Math.max(28, ((endMinutes - startMinutes) / (12 * 60)) * 500);
                      const venueColor = venueColorMap[s.venue_id] || 'var(--brand)';
                      const activeRosterIds = sessionRosterMap[s.id] ?? [];
                      const activeRosterNames = activeRosterIds
                        .map((memberId) => memberNameMap[memberId])
                        .filter(Boolean)
                        .sort((a, b) => a.localeCompare(b));

                      return (
                        <Link
                          key={s.id}
                          to={`/register/${s.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="absolute left-1.5 right-1.5 overflow-hidden rounded-[10px] border border-slate-200 bg-white p-1.5 shadow-[0_4px_12px_rgba(15,23,42,0.06)]"
                          style={{ top: `${top + 3}px`, height: `${Math.min(height, 112)}px`, borderLeft: `3px solid ${venueColor}` }}
                          title={`${s.name} · ${s.mentis_venues?.name} · ${activeRosterNames.length} active roster members`}
                        >
                          <div className="mb-1 flex items-center justify-between gap-1">
                            <span className="inline-flex max-w-[72%] items-center truncate rounded-full border border-slate-200 bg-slate-100 px-1.5 py-[1px] text-[6.5px] font-black uppercase tracking-[0.12em] text-slate-600">
                              {s.mentis_venues?.name || 'Venue'}
                            </span>
                            <span className="rounded-full bg-emerald-50 px-1.5 py-[1px] text-[6px] font-black uppercase tracking-[0.14em] text-emerald-700">
                              {activeRosterNames.length}
                            </span>
                          </div>
                          <div className="text-[8.5px] font-black leading-tight text-slate-900">{s.name}</div>
                          <div className="mt-1 text-[6.5px] font-semibold text-slate-500">
                            {new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(s.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          {activeRosterNames.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1 text-[6px] text-slate-600">
                              {activeRosterNames.slice(0, 2).map((name) => (
                                <span key={name} className="rounded bg-slate-100 px-1 py-[1px]">{name}</span>
                              ))}
                              {activeRosterNames.length > 2 && <span className="rounded bg-slate-100 px-1 py-[1px]">+{activeRosterNames.length - 2}</span>}
                            </div>
                          )}
                        </Link>
                      );
                    })}
                    {renderAvailabilityBlocks(dateStr, 40)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* MONTH VIEW */
        <div className="overflow-hidden rounded-[26px] border border-slate-100 bg-[#f8fafc] shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
          <div className="border-b border-slate-100 bg-white/80 px-4 py-4 text-center text-[1.7rem] font-black tracking-[-0.06em] text-slate-900">
            {currentMonthLabel}
          </div>

          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} className="border-r border-slate-100 py-3 last:border-r-0">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {monthGridDays.map((cell, idx) => {
              const dateStr = cell.date;
              const hol = isHoliday(dateStr);
              const isToday = new Date().toISOString().slice(0, 10) === dateStr;
              const isSelected = selectedDate === dateStr;
              const isCurrentMonth = cell.isCurrentMonth;

              const cellItems = itemsByDate[dateStr] ?? [];
              const visibleItems = cellItems.slice(0, 2);
              const overflowCount = Math.max(cellItems.length - visibleItems.length, 0);

              return (
                <div
                  key={`${dateStr}-${idx}`}
                  className={`relative min-h-[170px] border-r border-b border-slate-100 p-2 transition-all duration-200 ${
                    isCurrentMonth ? 'bg-white/80' : 'bg-slate-50 text-slate-400'
                  } ${
                    isSelected
                      ? 'bg-[#f4fbfa] shadow-[inset_0_0_0_1px_rgba(39,117,113,0.20)]'
                      : isToday
                        ? 'bg-sky-50 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.35)]'
                        : ''
                  }`}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    toggleQuickMenu(dateStr, rect.left + rect.width / 2, rect.top + rect.height / 2);
                  }}
                  onPointerDown={(event) => {
                    const drag = getQuickRangeFromPointer(event, dateStr);
                    setQuickDragRange(drag);
                  }}
                  onPointerMove={(event) => {
                    if (!quickDragRange || quickDragRange.date !== dateStr) return;
                    const next = getQuickRangeFromPointer(event, dateStr);
                    setQuickDragRange({ ...next, startMinutes: Math.min(quickDragRange.startMinutes, next.startMinutes), endMinutes: Math.max(quickDragRange.startMinutes, next.endMinutes) });
                  }}
                  onPointerUp={() => {
                    if (quickDragRange) {
                      openQuickAddForDate(dateStr, quickDragRange.startMinutes, quickDragRange.endMinutes, quickEntryType);
                      setQuickDragRange(null);
                    }
                  }}
                >
                  {quickDragRange?.date === dateStr && (
                    <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-md border border-blue-500 bg-blue-500/15 px-2 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-blue-700">
                      {formatDurationMinutes(quickDragRange.startMinutes)} – {formatDurationMinutes(quickDragRange.endMinutes)}
                    </div>
                  )}
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-[8px] text-[11px] font-bold ${
                      isCurrentMonth ? 'text-slate-700' : 'text-slate-400'
                    } ${
                      isSelected
                        ? 'bg-[#dff5f3] text-slate-900 shadow-[inset_0_0_0_1px_rgba(28,114,109,0.18)]'
                        : isToday
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'bg-slate-100'
                    }`}>
                      {new Date(`${dateStr}T00:00:00Z`).getUTCDate()}
                    </span>
                    {hol && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.12em] text-amber-700" title={hol.name}>
                        HOL
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {visibleItems.map(item => {
                      const meta = CALENDAR_ITEM_META[item.type];
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-1.5 overflow-hidden rounded-[8px] border border-slate-100 px-1.5 py-1 text-[9px] font-semibold text-slate-700 shadow-[0_1px_0_rgba(15,23,42,0.02)]"
                          title={`${meta.label} · ${item.label}`}
                          style={{ backgroundColor: `${meta.color}16` }}
                        >
                          <span className="inline-block h-2.5 w-2.5 rounded-[4px] border border-white/80" style={{ backgroundColor: meta.color }} />
                          <span className="truncate">{item.label}</span>
                        </div>
                      );
                    })}
                    {overflowCount > 0 && (
                      <button type="button" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setSelectedDate(dateStr); setView('day'); }} className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-slate-600 hover:bg-slate-200">
                        +{overflowCount} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {quickMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setQuickMenu(null)}
            aria-hidden="true"
          />
          <div
            className="fixed z-50 w-52 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl"
            style={{ left: Math.min(quickMenu.x, window.innerWidth - 220), top: Math.min(quickMenu.y, window.innerHeight - 200) }}
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-2 pt-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Quick entry</div>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white p-1 text-slate-500 hover:text-slate-800"
                onClick={() => setQuickMenu(null)}
                aria-label="Close quick entry"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['vacation', 'Vacation'],
                ['leave', 'Leave'],
                ['available', 'Available'],
                ['unavailable', 'Unavailable'],
              ] as Array<[QuickEntryType, string]>).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    openQuickAddForDate(quickMenu.date, 9 * 60, 10 * 60, key);
                  }}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700 transition hover:border-slate-300 hover:bg-white"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {quickAddOpen && quickDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
          onClick={event => {
            if (event.target === event.currentTarget) {
              setQuickAddOpen(false);
              setQuickDraft(null);
            }
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Diary entry</div>
                <h3 className="mt-0.5 text-base font-bold text-slate-800">Create a quick staff diary item</h3>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-800"
                onClick={() => {
                  setQuickAddOpen(false);
                  setQuickDraft(null);
                }}
                aria-label="Close quick add"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div>
                <label className="mb-2 block text-[11px] font-semibold text-slate-600">Entry type</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    ['vacation', 'Vacation'],
                    ['leave', 'Leave'],
                    ['available', 'Available'],
                    ['unavailable', 'Unavailable'],
                  ] as Array<[QuickEntryType, string]>).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setQuickEntryType(key);
                        setQuickDraft(current => current ? { ...current, available: key === 'available', availability_type: key === 'vacation' ? 'vacation' : key === 'available' ? 'available' : 'unavailable_other', reason: label } : current);
                      }}
                      className={`rounded-xl border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] transition ${
                        quickEntryType === key
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">Coach</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:outline-none"
                    value={quickDraft.staff_id}
                    onChange={e => setQuickDraft({ ...quickDraft, staff_id: e.target.value })}
                  >
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>{s.display_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">Category</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:outline-none"
                    value={quickDraft.availability_type}
                    onChange={e => setQuickDraft({ ...quickDraft, availability_type: e.target.value as typeof quickDraft.availability_type })}
                  >
                    <option value="vacation">Vacation</option>
                    <option value="on_duty">On duty</option>
                    <option value="duty_outside_club">Outside club</option>
                    <option value="available">Available</option>
                    <option value="unavailable_other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">Start</label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:outline-none"
                    value={quickDraft.starts_at}
                    onChange={e => setQuickDraft({ ...quickDraft, starts_at: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">End</label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:outline-none"
                    value={quickDraft.ends_at}
                    onChange={e => setQuickDraft({ ...quickDraft, ends_at: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">Title</label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:outline-none"
                  value={quickDraft.reason}
                  onChange={e => setQuickDraft({ ...quickDraft, reason: e.target.value })}
                  placeholder="Coach diary note"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">Status</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:outline-none"
                  value={String(quickDraft.available)}
                  onChange={e => setQuickDraft({ ...quickDraft, available: e.target.value === 'true' })}
                >
                  <option value="false">Unavailable / leave</option>
                  <option value="true">Available</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button type="button" className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700" onClick={() => { setQuickAddOpen(false); setQuickDraft(null); }}>
                Cancel
              </button>
              <button type="button" className="rounded-full bg-slate-900 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white" onClick={() => void saveQuickDiaryEntry()}>
                Save entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

