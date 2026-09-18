import { useEffect, useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  CalendarDays,
  Search,
  Plus,
  Download,
  Users,
  Check,
  X,
  Clock,
  AlertTriangle,
  FileSpreadsheet,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Sparkles,
  BookOpen,
  Timer,
  Ban,
  CheckCheck,
  UserPlus,
  Pencil,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/patterns/page-header';
import { Button } from '../components/ui/button';
import { InputWithIcon } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, ReviewAndConfirmBanner, ConfirmDialog } from '../components/ui/dialog';
import { demoEnabled } from '../lib/demo';
import { cn } from '../lib/cn';

// ---------------------------------------------------------------------------
// Types for the workbook
// ---------------------------------------------------------------------------
type Venue = { id: string; name: string; concurrent_session_limit?: number };
type SessionInstance = {
  id: string;
  name: string;
  venue_id: string;
  venue_name?: string;
  start_at: string;
  end_at: string;
  status: string;
  schedule_id?: string | null;
};
type Holiday = {
  id: string;
  name: string;
  kind: 'term_break' | 'bank_holiday' | 'manual';
  starts_on: string;
  ends_on: string;
};
type Member = { id: string; name: string; alert?: boolean; customer?: string };
type Enrollment = { session_id: string; member_id: string; member?: Member };
type Attendance = { session_id: string; member_id: string; status: 'present' | 'absent' | 'late' | 'taster' };

type SessionGroup = {
  key: string; // schedule_id or name|venue
  name: string;
  venue_id: string;
  venue_name: string;
  schedule_id?: string | null;
  dayLabel?: string;
  timeLabel: string;
  sessions: SessionInstance[]; // sorted by date
  memberIds: string[]; // unique
};

// ---------------------------------------------------------------------------
// Mock data generator for demo mode (no supabase)
// ---------------------------------------------------------------------------
function generateMock(): {
  venues: Venue[];
  holidays: Holiday[];
  groups: SessionGroup[];
  members: Member[];
  attendance: Attendance[];
  enrollments: Enrollment[];
} {
  const venues: Venue[] = [
    { id: 'v1', name: 'Kingfisher Main Hall' },
    { id: 'v2', name: 'Community Centre' },
    { id: 'v3', name: 'St Marys School' },
  ];
  const holidays: Holiday[] = [
    { id: 'h1', name: 'Half Term Break', kind: 'term_break', starts_on: '2025-10-27', ends_on: '2025-11-02' },
    { id: 'h2', name: 'Christmas Break', kind: 'term_break', starts_on: '2025-12-20', ends_on: '2026-01-04' },
    { id: 'h3', name: 'Bank Holiday - New Year', kind: 'bank_holiday', starts_on: '2026-01-01', ends_on: '2026-01-01' },
    { id: 'h4', name: 'Easter Break', kind: 'term_break', starts_on: '2026-03-30', ends_on: '2026-04-12' },
  ];

  const memberNames = [
    'Aarav Patel', 'Mia Chen', 'Oliver Smith', 'Zara Khan', 'Leo Johnson',
    'Amara Okafor', 'Noah Williams', 'Sofia Garcia', 'Ethan Brown', 'Isla Taylor',
    'Arjun Singh', 'Lily Evans', 'Mohammed Ali', 'Freya Wilson', 'Lucas Martin',
    'Ava Thompson', 'Hassan Ahmed', 'Ruby Clark', 'Daniel Lee', 'Grace Lewis',
  ];
  const members: Member[] = memberNames.map((n, i) => ({
    id: `m${i}`,
    name: n,
    alert: i % 7 === 0,
    customer: ['Parent', 'Self', 'Guardian'][i % 3],
  }));

  const sessionDefs = [
    { name: 'U11 Juniors', day: 1, time: '18:00-19:00', venue: 'v1' },
    { name: 'U13 Development', day: 1, time: '19:00-20:30', venue: 'v1' },
    { name: 'Advanced Squad', day: 2, time: '18:30-20:30', venue: 'v1' },
    { name: 'Beginners', day: 3, time: '17:00-18:00', venue: 'v1' },
    { name: 'Ladies Session', day: 4, time: '19:00-20:30', venue: 'v2' },
    { name: 'U15 Competitive', day: 2, time: '18:00-20:00', venue: 'v2' },
    { name: 'Saturday Club', day: 6, time: '09:00-12:00', venue: 'v1' },
    { name: 'School Club Y5-6', day: 3, time: '15:30-16:30', venue: 'v3' },
    { name: 'School Club Y7-8', day: 4, time: '15:30-16:30', venue: 'v3' },
  ];

  const groups: SessionGroup[] = sessionDefs.map((def, gi) => {
    const venue = venues.find(v => v.id === def.venue)!;
    const sessions: SessionInstance[] = [];
    // Generate 14 weeks from Sep 2025
    const start = new Date('2025-09-01T00:00:00Z');
    for (let w = 0; w < 14; w++) {
      const d = new Date(start);
      d.setDate(d.getDate() + ((def.day - d.getDay() + 7) % 7) + w * 7);
      const dateStr = d.toISOString().slice(0, 10);
      // skip if in holiday? Keep but mark - we want to show red columns
      const [sh, eh] = def.time.split('-');
      sessions.push({
        id: `s-${gi}-${w}`,
        name: def.name,
        venue_id: def.venue,
        venue_name: venue.name,
        start_at: `${dateStr}T${sh}:00Z`,
        end_at: `${dateStr}T${eh}:00Z`,
        status: w < 10 ? 'completed' : 'scheduled',
        schedule_id: `sch-${gi}`,
      });
    }
    const memberIds = members.slice((gi * 3) % members.length, (gi * 3) % members.length + 8 + (gi % 4)).map(m => m.id);
    return {
      key: `sch-${gi}`,
      name: def.name,
      venue_id: def.venue,
      venue_name: venue.name,
      schedule_id: `sch-${gi}`,
      dayLabel: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][def.day],
      timeLabel: def.time,
      sessions,
      memberIds,
    };
  });

  const enrollments: Enrollment[] = groups.flatMap(g =>
    g.memberIds.map(mid => ({ session_id: g.sessions[0].id, member_id: mid, member: members.find(m => m.id === mid) }))
  );

  const attendance: Attendance[] = [];
  groups.forEach(g => {
    g.sessions.forEach(sess => {
      const date = sess.start_at.slice(0, 10);
      const isHoliday = holidays.some(h => date >= h.starts_on && date <= h.ends_on);
      if (isHoliday) return;
      g.memberIds.forEach(mid => {
        const r = Math.random();
        let status: Attendance['status'] = 'present';
        if (r < 0.08) status = 'absent';
        else if (r < 0.12) status = 'late';
        attendance.push({ session_id: sess.id, member_id: mid, status });
      });
    });
  });

  return { venues, holidays, groups, members, attendance, enrollments };
}

function isDateInHolidays(dateStr: string, holidays: Holiday[]): Holiday | null {
  for (const h of holidays) {
    if (dateStr >= h.starts_on && dateStr <= h.ends_on) return h;
  }
  return null;
}

function formatDateShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short' });
}

// ---------------------------------------------------------------------------
// Sessions Workbook - Main Component
// ---------------------------------------------------------------------------
export function Sessions() {
  const { staff, canDo } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [tasters, setTasters] = useState<any[]>([]);
  const [enrollScope, setEnrollScope] = useState<'series' | 'instance'>('series');

  // Column filtering and sorting
  const [memberSortOrder, setMemberSortOrder] = useState<'asc' | 'desc'>('asc');
  const [memberTypeFilter, setMemberTypeFilter] = useState<'all' | 'regular' | 'taster' | 'alert'>('all');
  const [dateColumnFilters, setDateColumnFilters] = useState<Record<string, 'all' | 'present' | 'absent' | 'late'>>({});
  const [pctSortOrder, setPctSortOrder] = useState<'none' | 'asc' | 'desc'>('none');

  const [selectedVenue, setSelectedVenue] = useState<string>('all');
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('');
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
  const [search, setSearch] = useState('');
  const [showOnlyAlert, setShowOnlyAlert] = useState(false);
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'present' | 'absent' | 'late'>('all');
  const [sessionWindowStart, setSessionWindowStart] = useState(0);
  const [gridWidth, setGridWidth] = useState(0);
  const [editingSession, setEditingSession] = useState<SessionInstance | null>(null);
  const [sessionDraft, setSessionDraft] = useState({ name: '', venue_id: '', start_at: '', end_at: '', status: 'scheduled' as string });
  const [recurrenceForm, setRecurrenceForm] = useState({
    frequency: 'weekly',
    start_date: '',
    end_date: '',
    skip_term_holidays: true,
    skip_bank_holidays: true,
  });
  const [recurrencePreview, setRecurrencePreview] = useState<string[]>([]);
  const [recurrenceSummary, setRecurrenceSummary] = useState<{
    totalGenerated: number;
    skippedBankHolidays: number;
    skippedTermHolidays: number;
    affectedDatesCount: number;
  } | null>(null);
  const [showRecurringConfirm, setShowRecurringConfirm] = useState(false);
  const [showBulkRecurringDialog, setShowBulkRecurringDialog] = useState(false);
  const [showSaveOccurrenceConfirm, setShowSaveOccurrenceConfirm] = useState(false);
  const [showCancelOccurrenceConfirm, setShowCancelOccurrenceConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = gridRef.current;
    if (!node) return;
    const update = () => setGridWidth(node.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const visibleSessionCount = useMemo(() => {
    if (!gridWidth) return 5;
    const available = Math.max(320, gridWidth - 280);
    return Math.min(6, Math.max(3, Math.floor(available / 92)));
  }, [gridWidth]);

  const filteredGroups = useMemo(() => {
    if (selectedVenue === 'all') return groups;
    return groups.filter(g => g.venue_id === selectedVenue);
  }, [groups, selectedVenue]);

  const selectedGroup = useMemo(() => {
    return groups.find(g => g.key === selectedGroupKey) ?? filteredGroups[0] ?? null;
  }, [groups, selectedGroupKey, filteredGroups]);

  const selectedBulkGroups = useMemo(() => {
    return groups.filter(g => selectedGroupKeys.includes(g.key));
  }, [groups, selectedGroupKeys]);

  const toggleBulkGroupSelection = (key: string) => {
    setSelectedGroupKeys(prev => prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]);
  };

  const toggleBulkVenueSelection = (venueId: string) => {
    const venueKeys = groups.filter(g => g.venue_id === venueId).map(g => g.key);
    if (!venueKeys.length) return;
    setSelectedGroupKeys(prev => {
      const allSelected = venueKeys.every(key => prev.includes(key));
      if (allSelected) return prev.filter(key => !venueKeys.includes(key));
      return Array.from(new Set([...prev, ...venueKeys]));
    });
  };

  const clearBulkSelection = () => setSelectedGroupKeys([]);

  useEffect(() => {
    if (!selectedGroup) return;
    const maxStart = Math.max(0, selectedGroup.sessions.length - visibleSessionCount);
    setSessionWindowStart(prev => Math.min(prev, maxStart));
  }, [selectedGroup, visibleSessionCount]);

  const visibleSessions = useMemo(() => {
    if (!selectedGroup) return [];
    const start = Math.min(sessionWindowStart, Math.max(0, selectedGroup.sessions.length - visibleSessionCount));
    return selectedGroup.sessions.slice(start, start + visibleSessionCount);
  }, [selectedGroup, sessionWindowStart, visibleSessionCount]);

  const canShiftSessionWindowBackward = sessionWindowStart > 0;
  const canShiftSessionWindowForward = selectedGroup ? sessionWindowStart + visibleSessionCount < selectedGroup.sessions.length : false;

  const openSessionEditor = (sess: SessionInstance) => {
    if (!selectedGroup) return;
    setEditingSession(sess);
    setSessionDraft({
      name: sess.name,
      venue_id: sess.venue_id || selectedGroup.venue_id,
      start_at: sess.start_at.slice(0, 16),
      end_at: sess.end_at.slice(0, 16),
      status: sess.status,
    });
  };

  const buildRecurrenceDates = () => {
    if (!editingSession || !selectedGroup) return [] as string[];
    const anchor = new Date(editingSession.start_at);
    const targetWeekday = anchor.getDay();
    const start = new Date(recurrenceForm.start_date || editingSession.start_at.slice(0, 10));
    const end = new Date(recurrenceForm.end_date || editingSession.start_at.slice(0, 10));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [] as string[];

    const out: string[] = [];
    const base = new Date(start);
    base.setHours(0, 0, 0, 0);

    const addCandidate = (d: Date) => {
      const iso = d.toISOString().slice(0, 10);
      if (d < start || d > end) return;
      const holiday = isDateInHolidays(iso, holidays);
      const skipThisDate =
        (recurrenceForm.skip_term_holidays && holiday && holiday.kind === 'term_break') ||
        (recurrenceForm.skip_bank_holidays && holiday && holiday.kind === 'bank_holiday');
      if (skipThisDate) return;
      out.push(iso);
    };

    if (recurrenceForm.frequency === 'daily') {
      const cursor = new Date(base);
      while (cursor <= end) {
        addCandidate(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      return out;
    }

    if (recurrenceForm.frequency === 'weekly' || recurrenceForm.frequency === 'biweekly' || recurrenceForm.frequency === 'fortnightly') {
      const step = recurrenceForm.frequency === 'weekly' ? 7 : 14;
      const cursor = new Date(base);
      while (cursor <= end) {
        if (cursor.getDay() === targetWeekday) addCandidate(new Date(cursor));
        cursor.setDate(cursor.getDate() + step);
      }
      return out;
    }

    if (recurrenceForm.frequency === 'monthly' || recurrenceForm.frequency === 'quarterly') {
      const step = recurrenceForm.frequency === 'monthly' ? 1 : 3;
      const cursor = new Date(base);
      while (cursor <= end) {
        const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), anchor.getDate(), 0, 0, 0, 0);
        if (candidate.getDay() === targetWeekday && candidate >= base && candidate <= end) {
          addCandidate(candidate);
        }
        cursor.setMonth(cursor.getMonth() + step);
      }
      return out;
    }

    return out;
  };

  const getRecurrencePreviewData = () => {
    if (!editingSession || !selectedGroup) return { dates: [] as string[], summary: null as {
      totalGenerated: number;
      skippedBankHolidays: number;
      skippedTermHolidays: number;
      affectedDatesCount: number;
    } | null };

    const anchor = new Date(editingSession.start_at);
    const targetWeekday = anchor.getDay();
    const start = new Date(recurrenceForm.start_date || editingSession.start_at.slice(0, 10));
    const end = new Date(recurrenceForm.end_date || editingSession.start_at.slice(0, 10));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return { dates: [], summary: null };
    }

    const base = new Date(start);
    base.setHours(0, 0, 0, 0);
    const candidates: string[] = [];

    const pushCandidate = (d: Date) => {
      const iso = d.toISOString().slice(0, 10);
      if (d < start || d > end) return;
      candidates.push(iso);
    };

    if (recurrenceForm.frequency === 'daily') {
      const cursor = new Date(base);
      while (cursor <= end) {
        pushCandidate(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (recurrenceForm.frequency === 'weekly' || recurrenceForm.frequency === 'biweekly' || recurrenceForm.frequency === 'fortnightly') {
      const step = recurrenceForm.frequency === 'weekly' ? 7 : 14;
      const cursor = new Date(base);
      while (cursor <= end) {
        if (cursor.getDay() === targetWeekday) pushCandidate(new Date(cursor));
        cursor.setDate(cursor.getDate() + step);
      }
    } else if (recurrenceForm.frequency === 'monthly' || recurrenceForm.frequency === 'quarterly') {
      const step = recurrenceForm.frequency === 'monthly' ? 1 : 3;
      const cursor = new Date(base);
      while (cursor <= end) {
        const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), anchor.getDate(), 0, 0, 0, 0);
        if (candidate.getDay() === targetWeekday && candidate >= base && candidate <= end) {
          pushCandidate(candidate);
        }
        cursor.setMonth(cursor.getMonth() + step);
      }
    }

    const dates = candidates.filter(date => {
      const holiday = isDateInHolidays(date, holidays);
      const skipThisDate =
        (recurrenceForm.skip_term_holidays && holiday && holiday.kind === 'term_break') ||
        (recurrenceForm.skip_bank_holidays && holiday && holiday.kind === 'bank_holiday');
      return !skipThisDate;
    });

    const skippedBankHolidays = candidates.filter(date => {
      const holiday = isDateInHolidays(date, holidays);
      return recurrenceForm.skip_bank_holidays && !!holiday && holiday.kind === 'bank_holiday';
    }).length;

    const skippedTermHolidays = candidates.filter(date => {
      const holiday = isDateInHolidays(date, holidays);
      return recurrenceForm.skip_term_holidays && !!holiday && holiday.kind === 'term_break';
    }).length;

    const affectedDatesCount = selectedGroup.sessions.filter(s => dates.includes(s.start_at.slice(0, 10))).length;

    return {
      dates,
      summary: {
        totalGenerated: dates.length,
        skippedBankHolidays,
        skippedTermHolidays,
        affectedDatesCount,
      },
    };
  };

  const previewRecurrenceDates = () => {
    const plan = getRecurrencePreviewData();
    setRecurrencePreview(plan.dates);
    setRecurrenceSummary(plan.summary);
    return plan.dates;
  };

  const previewBulkRecurringPattern = () => {
    const baseGroups = selectedBulkGroups.length ? selectedBulkGroups : (selectedGroup ? [selectedGroup] : []);
    if (!baseGroups.length) {
      setRecurrencePreview([]);
      setRecurrenceSummary(null);
      return [] as string[];
    }

    const generated = new Set<string>();
    let skippedBankHolidays = 0;
    let skippedTermHolidays = 0;

    baseGroups.forEach(group => {
      const anchor = group.sessions[0];
      if (!anchor) return;
      const start = new Date(recurrenceForm.start_date || anchor.start_at.slice(0, 10));
      const end = new Date(recurrenceForm.end_date || anchor.start_at.slice(0, 10));
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return;
      const targetWeekday = new Date(anchor.start_at).getDay();
      const base = new Date(start);
      base.setHours(0, 0, 0, 0);

      const candidateDates: string[] = [];
      const addCandidate = (d: Date) => {
        const iso = d.toISOString().slice(0, 10);
        if (d < start || d > end) return;
        candidateDates.push(iso);
      };

      if (recurrenceForm.frequency === 'daily') {
        const cursor = new Date(base);
        while (cursor <= end) {
          addCandidate(new Date(cursor));
          cursor.setDate(cursor.getDate() + 1);
        }
      } else if (['weekly', 'biweekly', 'fortnightly'].includes(recurrenceForm.frequency)) {
        const step = recurrenceForm.frequency === 'weekly' ? 7 : 14;
        const cursor = new Date(base);
        while (cursor <= end) {
          if (cursor.getDay() === targetWeekday) addCandidate(new Date(cursor));
          cursor.setDate(cursor.getDate() + step);
        }
      } else if (['monthly', 'quarterly'].includes(recurrenceForm.frequency)) {
        const step = recurrenceForm.frequency === 'monthly' ? 1 : 3;
        const cursor = new Date(base);
        while (cursor <= end) {
          const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), new Date(anchor.start_at).getDate(), 0, 0, 0, 0);
          if (candidate.getDay() === targetWeekday && candidate >= base && candidate <= end) addCandidate(candidate);
          cursor.setMonth(cursor.getMonth() + step);
        }
      }

      candidateDates.forEach(date => {
        const holiday = isDateInHolidays(date, holidays);
        const shouldSkip =
          (recurrenceForm.skip_term_holidays && holiday && holiday.kind === 'term_break') ||
          (recurrenceForm.skip_bank_holidays && holiday && holiday.kind === 'bank_holiday');
        if (shouldSkip) {
          if (holiday && holiday.kind === 'term_break') skippedTermHolidays += 1;
          if (holiday && holiday.kind === 'bank_holiday') skippedBankHolidays += 1;
          return;
        }
        generated.add(date);
      });
    });

    const dates = Array.from(generated).sort();
    setRecurrencePreview(dates);
    setRecurrenceSummary({
      totalGenerated: dates.length,
      skippedBankHolidays,
      skippedTermHolidays,
      affectedDatesCount: dates.length,
    });
    return dates;
  };

  const clearRecurrencePreview = () => {
    setRecurrencePreview([]);
    setRecurrenceSummary(null);
  };

  const saveSessionEdit = async () => {
    if (!editingSession) return;
    const startAt = new Date(sessionDraft.start_at);
    const endAt = new Date(sessionDraft.end_at);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      alert('Choose a valid end time after the start time.');
      return;
    }

    setShowSaveOccurrenceConfirm(true);
  };

  const confirmSaveSessionEdit = async () => {
    if (!editingSession) return;
    const startAt = new Date(sessionDraft.start_at);
    const endAt = new Date(sessionDraft.end_at);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      alert('Choose a valid end time after the start time.');
      return;
    }

    const update = {
      name: sessionDraft.name.trim() || editingSession.name,
      venue_id: sessionDraft.venue_id || editingSession.venue_id,
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      status: sessionDraft.status,
    };

    if (!demoEnabled && staff) {
      const overridePayload = {
        organization_id: staff.organization_id,
        session_id: editingSession.id,
        schedule_id: editingSession.schedule_id ?? null,
        starts_at: editingSession.start_at,
        ends_at: editingSession.end_at,
        venue_id: editingSession.venue_id ?? null,
        original_values: {
          name: editingSession.name,
          venue_id: editingSession.venue_id,
          start_at: editingSession.start_at,
          end_at: editingSession.end_at,
          status: editingSession.status,
        },
        override_values: {
          name: update.name,
          venue_id: update.venue_id,
          start_at: update.start_at,
          end_at: update.end_at,
          status: update.status,
        },
        created_by: staff.user_id,
      };
      const { error } = await supabase.from('mentis_schedule_overrides').insert(overridePayload);
      if (error) {
        alert(error.message);
        return;
      }
    }

    setGroups(prev => prev.map(g => g.key === selectedGroup?.key ? {
      ...g,
      sessions: g.sessions.map(s => s.id === editingSession.id ? { ...s, ...update } : s),
    } : g));
    setShowSaveOccurrenceConfirm(false);
    setEditingSession(null);
  };

  const resetSessionToRecurringPattern = async () => {
    if (!selectedGroup || !editingSession) return;
    const base = selectedGroup.sessions.find(s => s.schedule_id === editingSession.schedule_id && s.id !== editingSession.id) ?? selectedGroup.sessions[0];
    if (!base) return;

    const reset = {
      name: base.name,
      venue_id: base.venue_id,
      start_at: base.start_at,
      end_at: base.end_at,
      status: base.status,
    };

    if (!demoEnabled && staff) {
      const { error } = await supabase.from('mentis_schedule_overrides').delete().eq('session_id', editingSession.id);
      if (error) {
        alert(error.message);
        return;
      }
    }

    setGroups(prev => prev.map(g => g.key === selectedGroup.key ? {
      ...g,
      sessions: g.sessions.map(s => s.id === editingSession.id ? { ...s, ...reset } : s),
    } : g));

    setSessionDraft({
      name: reset.name,
      venue_id: reset.venue_id,
      start_at: reset.start_at.slice(0, 16),
      end_at: reset.end_at.slice(0, 16),
      status: reset.status,
    });
    setEditingSession(null);
  };

  const cancelThisDateOnly = async () => {
    if (!editingSession) return;
    setShowCancelOccurrenceConfirm(true);
  };

  const confirmCancelThisDateOnly = async () => {
    if (!editingSession) return;
    const cancelled = {
      name: editingSession.name,
      venue_id: editingSession.venue_id,
      start_at: editingSession.start_at,
      end_at: editingSession.end_at,
      status: 'cancelled',
    };

    if (!demoEnabled && staff) {
      const overridePayload = {
        organization_id: staff.organization_id,
        session_id: editingSession.id,
        schedule_id: editingSession.schedule_id ?? null,
        starts_at: editingSession.start_at,
        ends_at: editingSession.end_at,
        venue_id: editingSession.venue_id ?? null,
        original_values: {
          name: editingSession.name,
          venue_id: editingSession.venue_id,
          start_at: editingSession.start_at,
          end_at: editingSession.end_at,
          status: editingSession.status,
        },
        override_values: {
          name: cancelled.name,
          venue_id: cancelled.venue_id,
          start_at: cancelled.start_at,
          end_at: cancelled.end_at,
          status: 'cancelled',
        },
        created_by: staff.user_id,
      };
      const { error } = await supabase.from('mentis_schedule_overrides').insert(overridePayload);
      if (error) {
        alert(error.message);
        return;
      }
    }

    setGroups(prev => prev.map(g => g.key === selectedGroup?.key ? {
      ...g,
      sessions: g.sessions.map(s => s.id === editingSession.id ? { ...s, ...cancelled } : s),
    } : g));
    setShowCancelOccurrenceConfirm(false);
    setEditingSession(null);
    setSessionDraft({ ...sessionDraft, status: 'cancelled' });
  };

  const applyRecurringSeries = async () => {
    if (!selectedGroup || !editingSession) return;
    const previewDates = recurrencePreview.length ? recurrencePreview : previewRecurrenceDates();
    const summary = recurrenceSummary ?? getRecurrencePreviewData().summary;
    if (!previewDates.length || !summary) {
      alert('No generated dates match the selected recurrence range after holiday filters are applied.');
      return;
    }
    setShowRecurringConfirm(true);
  };

  const applyBulkRecurringPattern = async () => {
    const targetGroups = selectedBulkGroups.length ? selectedBulkGroups : (selectedGroup ? [selectedGroup] : []);
    if (!targetGroups.length) {
      alert('Select at least one session group to apply a common recurring pattern.');
      return;
    }

    const previewDates = recurrencePreview.length ? recurrencePreview : previewBulkRecurringPattern();
    if (!previewDates.length) {
      alert('No generated dates match the selected recurrence range after holiday filters are applied.');
      return;
    }

    const summary = recurrenceSummary ?? { totalGenerated: previewDates.length, skippedBankHolidays: 0, skippedTermHolidays: 0, affectedDatesCount: previewDates.length };
    const confirmText = [
      `Apply this recurring pattern to ${targetGroups.length} selected session groups?`,
      `Generated dates: ${summary.totalGenerated}`,
      `Skipped bank holidays: ${summary.skippedBankHolidays}`,
      `Skipped term breaks: ${summary.skippedTermHolidays}`,
    ].join('\n');

    if (!window.confirm(confirmText)) return;

    const updates: Array<{ groupKey: string; sessionId: string; values: Partial<SessionInstance> }> = [];
    targetGroups.forEach(group => {
      group.sessions.forEach(s => {
        if (!previewDates.includes(s.start_at.slice(0, 10))) return;
        const startAt = new Date(`${s.start_at.slice(0, 10)}T${sessionDraft.start_at.slice(11, 16)}:00`);
        const endAt = new Date(`${s.start_at.slice(0, 10)}T${sessionDraft.end_at.slice(11, 16)}:00`);
        updates.push({
          groupKey: group.key,
          sessionId: s.id,
          values: {
            name: sessionDraft.name.trim() || s.name,
            venue_id: sessionDraft.venue_id || s.venue_id,
            start_at: startAt.toISOString(),
            end_at: endAt.toISOString(),
            status: sessionDraft.status,
          },
        });
      });
    });

    if (!updates.length) {
      alert('No matching session dates were found in the selected groups for this recurrence range.');
      return;
    }

    setGroups(prev => prev.map(g => {
      const matches = updates.filter(u => u.groupKey === g.key);
      if (!matches.length) return g;
      return {
        ...g,
        sessions: g.sessions.map(s => {
          const match = matches.find(u => u.sessionId === s.id);
          return match ? { ...s, ...match.values } : s;
        }),
      };
    }));

    clearRecurrencePreview();
    setShowBulkRecurringDialog(false);
    clearBulkSelection();
  };

  const confirmRecurringSeries = async () => {
    if (!selectedGroup || !editingSession) return;
    const previewDates = recurrencePreview.length ? recurrencePreview : previewRecurrenceDates();
    const summary = recurrenceSummary ?? getRecurrencePreviewData().summary;
    if (!previewDates.length || !summary) {
      alert('No generated dates match the selected recurrence range after holiday filters are applied.');
      return;
    }

    const updates = selectedGroup.sessions.filter(s => previewDates.includes(s.start_at.slice(0, 10))).map(s => ({
      sessionId: s.id,
      values: {
        name: sessionDraft.name || s.name,
        venue_id: sessionDraft.venue_id || s.venue_id,
        start_at: new Date(`${s.start_at.slice(0, 10)}T${sessionDraft.start_at.slice(11, 16)}:00`).toISOString(),
        end_at: new Date(`${s.start_at.slice(0, 10)}T${sessionDraft.end_at.slice(11, 16)}:00`).toISOString(),
        status: sessionDraft.status,
      },
    }));

    if (!demoEnabled && staff) {
      const overridePayload = {
        organization_id: staff.organization_id,
        schedule_id: editingSession.schedule_id ?? selectedGroup.schedule_id ?? null,
        session_id: null,
        starts_at: new Date(recurrenceForm.start_date || editingSession.start_at.slice(0, 10)).toISOString(),
        ends_at: new Date(recurrenceForm.end_date || editingSession.start_at.slice(0, 10)).toISOString(),
        venue_id: sessionDraft.venue_id || selectedGroup.venue_id || null,
        original_values: {
          name: editingSession.name,
          venue_id: editingSession.venue_id,
          status: editingSession.status,
          dates: previewDates,
        },
        override_values: {
          frequency: recurrenceForm.frequency,
          name: sessionDraft.name || editingSession.name,
          venue_id: sessionDraft.venue_id || selectedGroup.venue_id || null,
          start_at: sessionDraft.start_at,
          end_at: sessionDraft.end_at,
          status: sessionDraft.status,
          dates: previewDates,
          skip_term_holidays: recurrenceForm.skip_term_holidays,
          skip_bank_holidays: recurrenceForm.skip_bank_holidays,
        },
        created_by: staff.user_id,
      };
      const { error } = await supabase.from('mentis_schedule_overrides').insert(overridePayload);
      if (error) {
        alert(error.message);
        return;
      }
    }

    setGroups(prev => prev.map(g => g.key === selectedGroup.key ? {
      ...g,
      sessions: g.sessions.map(s => {
        const match = updates.find(u => u.sessionId === s.id);
        return match ? { ...s, ...match.values } : s;
      }),
    } : g));
    clearRecurrencePreview();
    setShowRecurringConfirm(false);
    setEditingSession(null);
  };

  // Load data
  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      if (demoEnabled || !staff) {
        // use mock
        const mock = generateMock();
        if (!alive) return;
        setVenues(mock.venues);
        setHolidays(mock.holidays);
        setGroups(mock.groups);
        setMembers(mock.members);
        setAttendance(mock.attendance);
        setSelectedGroupKey(mock.groups[0]?.key ?? '');
        setLoading(false);
        return;
      }
      try {
        const [{ data: vData }, { data: hData }, { data: sData }, { data: eData }, { data: aData }, { data: mData }, { data: tData }] = await Promise.all([
          supabase.from('mentis_venues').select('id,name'),
          supabase.from('mentis_holiday_calendar').select('*').order('starts_on'),
          supabase.from('mentis_sessions').select('id,name,venue_id,start_at,end_at,status,schedule_id,mentis_venues(name)').order('start_at').limit(300),
          supabase.from('mentis_enrollments').select('session_id,member_id,mentis_members(id,name)').limit(1000),
          supabase.from('mentis_attendance_records').select('session_id,member_id,status').limit(2000),
          supabase.from('mentis_members').select('id,name').order('name').limit(500),
          supabase.from('mentis_prospects').select('id,name,status').limit(200),
        ]);
        setTasters(tData ?? []);
        if (!alive) return;
        const v = (vData ?? []) as Venue[];
        setVenues(v);
        setHolidays((hData ?? []) as Holiday[]);

        // Build groups from sessions: group by schedule_id or name+venue
        const sess = (sData ?? []) as any[];
        const groupMap = new Map<string, SessionGroup>();
        sess.forEach((s: any) => {
          const key = s.schedule_id ?? `${s.name}|${s.venue_id}`;
          if (!groupMap.has(key)) {
            groupMap.set(key, {
              key,
              name: s.name,
              venue_id: s.venue_id,
              venue_name: s.mentis_venues?.name ?? v.find(x => x.id === s.venue_id)?.name ?? 'Venue',
              schedule_id: s.schedule_id,
              dayLabel: formatDay(s.start_at),
              timeLabel: `${new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}-${new Date(s.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
              sessions: [],
              memberIds: [],
            });
          }
          groupMap.get(key)!.sessions.push({
            id: s.id,
            name: s.name,
            venue_id: s.venue_id,
            venue_name: s.mentis_venues?.name,
            start_at: s.start_at,
            end_at: s.end_at,
            status: s.status,
            schedule_id: s.schedule_id,
          });
        });
        // Attach memberIds from enrollments
        const enrollMap = new Map<string, Set<string>>();
        (eData ?? []).forEach((e: any) => {
          const sessId = e.session_id;
          // find group containing this session
          for (const g of groupMap.values()) {
            if (g.sessions.some(ss => ss.id === sessId)) {
              if (!enrollMap.has(g.key)) enrollMap.set(g.key, new Set());
              enrollMap.get(g.key)!.add(e.member_id);
            }
          }
        });
        enrollMap.forEach((set, key) => {
          const g = groupMap.get(key);
          if (g) g.memberIds = Array.from(set);
        });

        const allGroups = Array.from(groupMap.values()).map(g => ({
          ...g,
          sessions: g.sessions.sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at)),
        })).sort((a, b) => {
          const ad = new Date(a.sessions[0]?.start_at ?? 0);
          const bd = new Date(b.sessions[0]?.start_at ?? 0);
          // Sequence sheets Monday (0) to Sunday (6) strictly:
          const monFirstDay = (d: Date) => (d.getDay() + 6) % 7;
          const dayDiff = monFirstDay(ad) - monFirstDay(bd);
          if (dayDiff !== 0) return dayDiff;

          // Then order chronologically by session start time:
          const timeA = ad.getHours() * 60 + ad.getMinutes();
          const timeB = bd.getHours() * 60 + bd.getMinutes();
          if (timeA !== timeB) return timeA - timeB;

          return a.name.localeCompare(b.name);
        });

        setGroups(allGroups);
        setMembers((mData ?? []).map((m: any) => ({ id: m.id, name: m.name })) as Member[]);
        setAttendance((aData ?? []) as Attendance[]);
        if (allGroups.length) setSelectedGroupKey(allGroups[0].key);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [staff]);

  // Derived
  // Keep selected group valid when venue changes
  useEffect(() => {
    if (!filteredGroups.length) return;
    if (!filteredGroups.some(g => g.key === selectedGroupKey)) {
      setSelectedGroupKey(filteredGroups[0].key);
    }
  }, [filteredGroups, selectedGroupKey]);

  const groupMembers = useMemo(() => {
    if (!selectedGroup) return [] as Member[];
    const ids = new Set(selectedGroup.memberIds);
    let list = members.filter(m => ids.has(m.id));
    if (demoEnabled) {
      // for demo, members are already filtered via groupMemberIds but also ensure order
      list = members.filter(m => selectedGroup.memberIds.includes(m.id));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q));
    }
    if (showOnlyAlert) list = list.filter(m => m.alert);

    // Apply column filter for Member Type
    if (memberTypeFilter === 'alert') {
      list = list.filter(m => m.alert);
    } else if (memberTypeFilter === 'regular') {
      list = list.filter(m => !m.customer?.includes('Taster'));
    } else if (memberTypeFilter === 'taster') {
      list = list.filter(m => m.customer?.includes('Taster') || tasters.some(t => t.name === m.name));
    }

    // Apply Member Column Sorting
    list = [...list].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return memberSortOrder === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [selectedGroup, members, search, showOnlyAlert, memberTypeFilter, memberSortOrder, tasters]);

  const attendanceMap = useMemo(() => {
    const map = new Map<string, Attendance['status']>();
    attendance.forEach(a => map.set(`${a.member_id}|${a.session_id}`, a.status));
    return map;
  }, [attendance]);

  const stats = useMemo(() => {
    if (!selectedGroup) return { total: 0, presentAvg: 0, members: 0 };
    const totalSessions = selectedGroup.sessions.filter(s => !isDateInHolidays(s.start_at.slice(0, 10), holidays)).length;
    let present = 0;
    let totalMarks = 0;
    attendance.forEach(a => {
      if (selectedGroup.sessions.some(s => s.id === a.session_id)) {
        totalMarks++;
        if (a.status === 'present') present++;
      }
    });
    return {
      total: totalSessions,
      presentAvg: totalMarks ? Math.round((present / totalMarks) * 100) : 0,
      members: selectedGroup.memberIds.length,
    };
  }, [selectedGroup, attendance, holidays]);

  const cycleAttendance = (memberId: string, sessionId: string) => {
    const key = `${memberId}|${sessionId}`;
    const current = attendanceMap.get(key) ?? 'absent';
    const next: Attendance['status'] = current === 'absent' ? 'present' : current === 'present' ? 'late' : current === 'late' ? 'absent' : 'present';
    setAttendance(prev => {
      const exists = prev.find(a => a.member_id === memberId && a.session_id === sessionId);
      if (exists) return prev.map(a => a.member_id === memberId && a.session_id === sessionId ? { ...a, status: next } : a);
      return [...prev, { member_id: memberId, session_id: sessionId, status: next }];
    });
    // optionally sync to supabase
    if (!demoEnabled && staff) {
      supabase.from('mentis_attendance_records').upsert({
        session_id: sessionId,
        member_id: memberId,
        status: next,
        recorded_by: staff.user_id,
      }).then();
    }
  };

  const exportCsv = () => {
    if (!selectedGroup) return;
    const headers = ['Member', ...selectedGroup.sessions.map(s => `${s.start_at.slice(0, 10)}`)];
    const rows = groupMembers.map(m => {
      const cells = selectedGroup.sessions.map(s => {
        const hol = isDateInHolidays(s.start_at.slice(0, 10), holidays);
        if (hol) return `HOLIDAY:${hol.name}`;
        return attendanceMap.get(`${m.id}|${s.id}`) ?? 'absent';
      });
      return [m.name, ...cells].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedGroup.name.replace(/\s+/g, '_')}_attendance.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Scroll helpers for session tabs
  const scrollTabs = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -240 : 240, behavior: 'smooth' });
  };

  if (loading) return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Sessions Workbook" eyebrow="Spreadsheet mode" subtitle="Loading sessions…" />
      <div className="card p-6"><div className="h-6 w-48 animate-pulse rounded bg-surface-hover" /><div className="mt-4 h-40 animate-pulse rounded bg-surface-hover" /></div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Sessions Workbook"
        eyebrow="Spreadsheet mode"
        subtitle="Venue → Session tabs → Members × Dates register. Holidays & term breaks in red. Click any cell to cycle attendance."
        breadcrumbs={[{ label: 'Coaching' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button intent="secondary" size="sm" iconLeft={<Download className="size-4" />} onClick={exportCsv} disabled={!selectedGroup}>
              Export CSV
            </Button>
            <Link to="/scheduling" className="btn btn-ghost btn-sm">
              <Timer className="size-4" />
              Scheduling
            </Link>
          </div>
        }
      />

      {/* Venue Workbook Tabs - Top level grouping */}
      <div className="card p-2">
        <div className="flex items-center gap-2 mb-2 px-1">
          <FileSpreadsheet className="size-4 text-brand" />
          <span className="overline">Venues — workbook</span>
          <span className="text-[10px] text-ink-faint ml-2">Grouped like Excel workbook tabs</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedVenue('all')}
            className={cn(
              'group relative flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition-all',
              selectedVenue === 'all'
                ? 'bg-surface-raised border-brand text-brand-text shadow-sm'
                : 'bg-surface-inset border-line text-ink-muted hover:border-[var(--border-strong)] hover:text-ink'
            )}
          >
            <BookOpen className="size-3.5" />
            All Venues
            <span className="ml-1 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] tabular-nums">{groups.length}</span>
          </button>
          {venues.map(v => {
            const count = groups.filter(g => g.venue_id === v.id).length;
            const active = selectedVenue === v.id;
            const venueSelectedCount = groups.filter(g => g.venue_id === v.id && selectedGroupKeys.includes(g.key)).length;
            return (
              <div key={v.id} className="flex items-center gap-2">
                {bulkSelectionMode && (
                  <button
                    type="button"
                    aria-label={`Toggle all sessions for ${v.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleBulkVenueSelection(v.id);
                    }}
                    className={cn(
                      'grid size-4 place-items-center rounded-sm border text-[10px] font-bold transition-all',
                      venueSelectedCount > 0 ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink-faint hover:text-ink'
                    )}
                  >
                    {venueSelectedCount > 0 ? '✓' : ''}
                  </button>
                )}
                <button
                  onClick={() => setSelectedVenue(v.id)}
                  className={cn(
                    'group relative flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition-all',
                    active
                      ? 'bg-surface-raised border-brand text-brand-text shadow-sm'
                      : 'bg-surface-inset border-line text-ink-muted hover:border-[var(--border-strong)] hover:text-ink'
                  )}
                >
                  <MapPin className="size-3.5" />
                  {v.name}
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] tabular-nums', active ? 'bg-brand-soft' : 'bg-surface-hover')}>
                    {count}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Session Sheet Tabs - Second level, spreadsheet-like */}
      <div className="card p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-inset/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBulkSelectionMode(v => !v)}>
              {bulkSelectionMode ? 'Exit multi-select' : 'Multi-select sessions'}
            </button>
            {bulkSelectionMode && (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedGroupKeys(filteredGroups.map(g => g.key))}>Select all visible</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearBulkSelection}>Clear</button>
              </>
            )}
          </div>
          {selectedBulkGroups.length > 0 && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowBulkRecurringDialog(true)}>
              Apply common recurring pattern ({selectedBulkGroups.length})
            </button>
          )}
        </div>
        <div className="flex items-center justify-between border-b border-line bg-surface-inset/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-ink-faint">
              <CalendarDays className="size-4" />
              <span className="text-xs font-semibold tracking-wide uppercase">Sessions — sheet tabs</span>
            </div>
            <Badge tone="neutral" size="sm">{filteredGroups.length} sheets</Badge>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => scrollTabs('left')} className="grid size-7 place-items-center rounded-sm border border-line bg-surface text-ink-faint hover:text-ink">
              <ChevronLeft className="size-4" />
            </button>
            <button onClick={() => scrollTabs('right')} className="grid size-7 place-items-center rounded-sm border border-line bg-surface text-ink-faint hover:text-ink">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        {/* Scrollable tab bar that mimics Excel sheet tabs */}
        <div ref={scrollRef} className="flex items-end gap-0 overflow-x-auto no-scrollbar border-b border-line bg-surface-inset px-2">
          {loading ? (
            <div className="flex gap-1 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 w-36 animate-pulse rounded-t-md bg-surface-hover" />
              ))}
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="p-3 text-xs text-ink-faint">No sessions for this venue.</div>
          ) : (
            filteredGroups.map(g => {
              const active = selectedGroup?.key === g.key;
              const holidayCount = g.sessions.filter(s => isDateInHolidays(s.start_at.slice(0, 10), holidays)).length;
              return (
                <button
                  key={g.key}
                  onClick={() => {
                    if (bulkSelectionMode) {
                      toggleBulkGroupSelection(g.key);
                      return;
                    }
                    setSelectedGroupKey(g.key);
                  }}
                  className={cn(
                    'relative flex shrink-0 items-center gap-2 border-x border-t px-3.5 py-2 text-xs font-semibold transition-all',
                    'first:rounded-tl-md last:rounded-tr-md -mb-px',
                    active
                      ? 'z-10 bg-surface border-line border-b-surface text-ink shadow-[0_-2px_0_var(--brand)]'
                      : 'bg-surface-inset/70 border-transparent text-ink-muted hover:bg-surface-hover hover:text-ink',
                    bulkSelectionMode && selectedGroupKeys.includes(g.key) && 'ring-2 ring-brand-soft'
                  )}
                  style={active ? { borderBottomColor: 'var(--surface)' } : undefined}
                >
                  {bulkSelectionMode && (
                    <span className="inline-flex items-center justify-center rounded-sm border border-line bg-surface p-0.5">
                      <input
                        type="checkbox"
                        checked={selectedGroupKeys.includes(g.key)}
                        onChange={() => toggleBulkGroupSelection(g.key)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5 accent-brand"
                      />
                    </span>
                  )}
                  {/* Tab face shows clean session name only; Day, time & venue appear in tooltip */}
                  <span
                    className="max-w-[22ch] truncate"
                    title={`${g.name}\n${g.dayLabel ?? ''} · ${g.timeLabel}\nVenue: ${g.venue_name}\n${g.memberIds.length} members enrolled`}
                  >
                    {g.name}
                  </span>
                  {holidayCount > 0 && (
                    <span className="rounded-full bg-danger-soft px-1 py-0.5 text-[9px] font-bold text-danger" title={`${holidayCount} holiday/term breaks in this pattern`}>
                      {holidayCount} HOL
                    </span>
                  )}
                  <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] tabular-nums" title={`${g.memberIds.length} enrolled members`}>
                    {g.memberIds.length}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Selected group meta */}
        {selectedGroup && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-md bg-brand-soft text-brand">
                  <Users className="size-4" />
                </div>
                <div className="leading-tight">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    {selectedGroup.name}
                    <span className="text-xs font-medium text-ink-muted">· {selectedGroup.venue_name}</span>
                  </div>
                  <div className="text-[11px] text-ink-faint">
                    {selectedGroup.dayLabel} {selectedGroup.timeLabel} · {stats.total} dates · {stats.members} members · {stats.presentAvg}% avg attendance
                  </div>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                  <Check className="size-3" /> {stats.presentAvg}% present
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-2 py-0.5 text-[11px] text-ink-muted">
                  <CalendarDays className="size-3" /> {selectedGroup.sessions.length} sessions
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <InputWithIcon
                icon={<Search className="size-4" />}
                placeholder="Search members…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClear={() => setSearch('')}
                className="w-44"
              />
              <div className="flex items-center gap-1 rounded-md border border-line bg-surface-inset p-0.5">
                <button
                  type="button"
                  onClick={() => setShowOnlyAlert(!showOnlyAlert)}
                  className={cn('rounded-[5px] px-2 py-1 text-[11px] font-semibold', showOnlyAlert ? 'bg-amber-500/15 text-amber-600' : 'text-ink-faint hover:text-ink')}
                  title="Only show medical/safeguarding alert rows"
                >
                  ⚠️ Alerts
                </button>
              </div>
              {canDo('sessions.manage') && (
                <Button size="sm" intent="soft" iconLeft={<Plus className="size-4" />} onClick={() => setShowMemberPicker(true)}>
                  Add member
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Attendance Register Grid - The spreadsheet */}
      <div className="card overflow-hidden p-0">
        {!selectedGroup ? (
          <div className="p-12 text-center">
            <FileSpreadsheet className="mx-auto size-10 text-ink-faint mb-3" />
            <p className="text-sm text-ink-muted">Select a session sheet tab above to view attendance register.</p>
          </div>
        ) : (
          <>
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-inset/40 px-3 py-2 text-[11px]">
              <span className="font-semibold text-ink-faint uppercase tracking-wide">Legend:</span>
              <span className="inline-flex items-center gap-1.5"><span className="grid size-5 place-items-center rounded-sm bg-success-soft text-success"><Check className="size-3" /></span> Present</span>
              <span className="inline-flex items-center gap-1.5"><span className="grid size-5 place-items-center rounded-sm bg-surface-hover text-ink-faint"><X className="size-3" /></span> Absent</span>
              <span className="inline-flex items-center gap-1.5"><span className="grid size-5 place-items-center rounded-sm bg-warning-soft text-warning"><Clock className="size-3" /></span> Late</span>
              <span className="inline-flex items-center gap-1.5"><span className="grid size-5 place-items-center rounded-sm bg-danger-soft text-danger border border-danger/20"><Ban className="size-3" /></span> Holiday / Term Break (red)</span>
              <span className="ml-auto hidden md:inline-flex items-center gap-1 text-ink-faint">
                <Sparkles className="size-3" /> Click any cell to cycle · Term breaks marked in red per your spreadsheet
              </span>
            </div>

            {/* The Grid */}
            <div ref={gridRef} className="relative overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-inset/40 px-3 py-2 text-[11px]">
                <div className="flex items-center gap-2 text-ink-faint">
                  <span className="font-semibold uppercase tracking-wide">Dates</span>
                  <span>{Math.min(visibleSessions.length, selectedGroup.sessions.length)} of {selectedGroup.sessions.length} visible</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSessionWindowStart(v => Math.max(0, v - 1))}
                    disabled={!canShiftSessionWindowBackward}
                    className="grid size-7 place-items-center rounded-sm border border-line bg-surface text-ink-faint disabled:cursor-not-allowed disabled:opacity-40 hover:text-ink"
                    aria-label="Previous date range"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSessionWindowStart(v => Math.min(selectedGroup.sessions.length - visibleSessionCount, v + 1))}
                    disabled={!canShiftSessionWindowForward}
                    className="grid size-7 place-items-center rounded-sm border border-line bg-surface text-ink-faint disabled:cursor-not-allowed disabled:opacity-40 hover:text-ink"
                    aria-label="Next date range"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
              <div className="relative overflow-auto" style={{ maxHeight: '62vh' }}>
                <table className="w-full border-collapse text-xs" style={{ minWidth: 900 }}>
                  <thead className="sticky top-0 z-20 bg-surface">
                    <tr>
                      <th className="sticky left-0 z-30 w-[220px] border-b border-r border-line bg-surface p-2 text-left">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <Users className="size-3.5 text-ink-faint" />
                            <span className="text-[11px] font-bold uppercase tracking-wide">Members</span>
                            <span className="ml-auto rounded-full bg-surface-inset px-1.5 py-0.5 text-[10px] tabular-nums">{groupMembers.length}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px]">
                            <button
                              type="button"
                              onClick={() => setMemberSortOrder(s => s === 'asc' ? 'desc' : 'asc')}
                              className="rounded border border-line bg-surface-inset px-1.5 py-0.5 font-semibold text-ink hover:text-brand"
                              title="Sort alphabetically"
                            >
                              Sort: {memberSortOrder === 'asc' ? 'A→Z' : 'Z→A'}
                            </button>
                            <select
                              className="rounded border border-line bg-surface-inset px-1 py-0.5 text-[10px]"
                              value={memberTypeFilter}
                              onChange={e => setMemberTypeFilter(e.target.value as any)}
                              title="Filter member type"
                            >
                              <option value="all">All</option>
                              <option value="regular">Regular</option>
                              <option value="taster">Tasters</option>
                              <option value="alert">Alerts</option>
                            </select>
                          </div>
                        </div>
                      </th>
                      {visibleSessions.map(sess => {
                        const dateStr = sess.start_at.slice(0, 10);
                        const hol = isDateInHolidays(dateStr, holidays);
                        const isWeekend = new Date(sess.start_at).getDay() === 0 || new Date(sess.start_at).getDay() === 6;
                        const colFilter = dateColumnFilters[sess.id] || 'all';
                        return (
                          <th
                            key={sess.id}
                            className={cn(
                              'min-w-[80px] border-b border-r border-line p-1 text-center align-bottom',
                              hol
                                ? 'bg-danger text-white'
                                : isWeekend
                                ? 'bg-surface-inset'
                                : 'bg-surface',
                              hol && 'relative overflow-hidden'
                            )}
                            title={hol ? `${hol.name} (${hol.kind}) — No session` : `${dateStr} ${new Date(sess.start_at).toLocaleTimeString()}`}
                          >
                            <button
                              type="button"
                              onClick={() => openSessionEditor(sess)}
                              className="w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-soft)]"
                              aria-label={`Edit this session: ${sess.name} on ${dateStr}`}
                            >
                              {hol && (
                                <>
                                  <div className="pointer-events-none absolute inset-0 opacity-20" style={{
                                    backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.5) 4px, rgba(255,255,255,0.5) 8px)`
                                  }} />
                                  <div className="relative">
                                    <div className="text-[9px] font-bold uppercase leading-none">HOL</div>
                                    <div className="text-[10px] font-bold leading-tight truncate max-w-[64px]">{hol.name.slice(0, 12)}</div>
                                    <div className="text-[9px] opacity-90">{formatDateShort(sess.start_at)}</div>
                                  </div>
                                </>
                              )}
                              {!hol && (
                                <div className="relative flex flex-col items-center gap-0.5 py-1 text-center">
                                  <span className="absolute right-1 top-1 inline-flex size-4 items-center justify-center rounded-sm bg-surface/80 text-[9px] text-ink-faint hover:text-ink">
                                    <Pencil className="size-3" />
                                  </span>
                                  <span className={cn('text-[10px] font-medium', isWeekend ? 'text-ink-faint' : 'text-ink-muted')}>{formatDay(sess.start_at)}</span>
                                  <span className="text-[11px] font-bold tabular-nums">{formatDateShort(sess.start_at)}</span>
                                  <span className="text-[9px] text-ink-faint tabular-nums">{new Date(sess.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  <span className="mt-0.5 rounded-full bg-surface-inset px-1 py-0 text-[9px] tabular-nums">
                                    {attendance.filter(a => a.session_id === sess.id && a.status === 'present').length}/{selectedGroup.memberIds.length}
                                  </span>
                                </div>
                              )}
                            </button>
                            {!hol && (
                              <div className="mt-1 border-t border-line/40 pt-0.5">
                                <select
                                  className="w-full bg-transparent text-[9px] font-medium text-ink-muted focus:outline-none"
                                  value={colFilter}
                                  onChange={e => setDateColumnFilters(prev => ({ ...prev, [sess.id]: e.target.value as any }))}
                                  title="Filter attendance on this date"
                                >
                                  <option value="all">All</option>
                                  <option value="present">Present</option>
                                  <option value="absent">Absent</option>
                                  <option value="late">Late</option>
                                </select>
                              </div>
                            )}
                          </th>
                        );
                      })}
                      <th className="sticky right-0 z-20 w-[68px] border-b border-l border-line bg-surface p-1 text-center text-[10px] font-bold uppercase">
                        <div>%</div>
                        <button
                          type="button"
                          onClick={() => setPctSortOrder(p => p === 'none' ? 'desc' : p === 'desc' ? 'asc' : 'none')}
                          className="mt-0.5 text-[9px] font-semibold text-ink-muted hover:text-brand"
                          title="Sort by attendance percentage"
                        >
                          {pctSortOrder === 'none' ? '↕ Sort' : pctSortOrder === 'desc' ? '↓ High' : '↑ Low'}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupMembers.map((m, idx) => {
                      const memberAttendances = visibleSessions.map(s => attendanceMap.get(`${m.id}|${s.id}`) ?? 'absent');
                      const presentCount = memberAttendances.filter(s => s === 'present').length;
                      const totalValid = visibleSessions.filter(s => !isDateInHolidays(s.start_at.slice(0, 10), holidays)).length;
                      const pctVal = totalValid ? Math.round((presentCount / totalValid) * 100) : 0;
                      // Check date column filters
                      const matchesDateFilters = visibleSessions.every(sess => {
                        const colF = dateColumnFilters[sess.id];
                        if (!colF || colF === 'all') return true;
                        const status = attendanceMap.get(`${m.id}|${sess.id}`) ?? 'absent';
                        return status === colF;
                      });
                      if (!matchesDateFilters) return null;

                      return (
                        <tr key={m.id} className={cn('group/row', idx % 2 === 0 ? 'bg-surface' : 'bg-surface-hover/30')}>
                          <td className="sticky left-0 z-10 border-b border-r border-line bg-inherit p-2">
                            <div className="flex items-center gap-2">
                              <div className="grid size-6 place-items-center rounded-full bg-brand-soft text-[10px] font-bold text-brand-text">
                                {m.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                              </div>
                              <div className="min-w-0 leading-tight">
                                <div className="flex items-center gap-1 truncate text-xs font-semibold">
                                  <span className="truncate">{m.name}</span>
                                  {m.alert && <span className="text-[11px]" title="Medical alert">⚠️</span>}
                                </div>
                                <div className="text-[10px] text-ink-faint truncate">{m.customer ?? 'Member'}</div>
                              </div>
                              <Link to={`/members/${m.id}`} className="ml-auto hidden group-hover/row:grid size-5 place-items-center rounded-sm bg-surface-inset text-ink-faint hover:text-ink">
                                <MoreHorizontal className="size-3" />
                              </Link>
                            </div>
                          </td>
                          {visibleSessions.map(sess => {
                            const dateStr = sess.start_at.slice(0, 10);
                            const hol = isDateInHolidays(dateStr, holidays);
                            const status = attendanceMap.get(`${m.id}|${sess.id}`) ?? 'absent';
                            if (hol) {
                              return (
                                <td key={sess.id} className="border-b border-r border-line bg-danger-soft/60 p-0 text-center">
                                  <div className="grid h-9 place-items-center text-[10px] font-bold text-danger/60">
                                    <Ban className="size-3" />
                                  </div>
                                </td>
                              );
                            }
                            return (
                              <td key={sess.id} className="border-b border-r border-line p-0">
                                <button
                                  onClick={() => cycleAttendance(m.id, sess.id)}
                                  className={cn(
                                    'grid h-9 w-full place-items-center transition-all hover:scale-105 hover:z-10 hover:shadow-sm',
                                    status === 'present' && 'bg-success-soft text-success hover:bg-success/20',
                                    status === 'absent' && 'bg-transparent text-ink-faint hover:bg-surface-hover',
                                    status === 'late' && 'bg-warning-soft text-warning hover:bg-warning/20',
                                    status === 'taster' && 'bg-info-soft text-info'
                                  )}
                                  title={`${m.name} — ${dateStr}: ${status} (click to cycle)`}
                                >
                                  {status === 'present' && <Check className="size-4" />}
                                  {status === 'absent' && <X className="size-3 opacity-40" />}
                                  {status === 'late' && <Clock className="size-3.5" />}
                                  {status === 'taster' && <span className="text-[10px] font-bold">T</span>}
                                </button>
                              </td>
                            );
                          })}
                          <td className="sticky right-0 z-10 border-b border-l border-line bg-inherit p-1 text-center">
                            <div className={cn(
                              'mx-auto grid size-7 place-items-center rounded-full text-[10px] font-bold tabular-nums',
                              pctVal >= 80 ? 'bg-success-soft text-success' : pctVal >= 50 ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger'
                            )}>
                              {pctVal}%
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-20 bg-surface-inset">
                    <tr>
                      <td className="sticky left-0 border-t border-r border-line bg-surface-inset p-2 text-[11px] font-bold">
                        <div className="flex items-center gap-1">
                          <CheckCheck className="size-3.5" />
                          Totals
                        </div>
                      </td>
                      {visibleSessions.map(sess => {
                        const dateStr = sess.start_at.slice(0, 10);
                        const hol = isDateInHolidays(dateStr, holidays);
                        if (hol) {
                          return <td key={sess.id} className="border-t border-r border-line bg-danger-soft/50" />;
                        }
                        const present = attendance.filter(a => a.session_id === sess.id && a.status === 'present').length;
                        return (
                          <td key={sess.id} className="border-t border-r border-line p-1 text-center text-[11px] font-bold tabular-nums">
                            {present}
                          </td>
                        );
                      })}
                      <td className="sticky right-0 border-t border-l border-line bg-surface-inset p-1 text-center text-[11px] font-bold">
                        {stats.presentAvg}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Footer toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface px-3 py-2 text-[11px] text-ink-faint">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-success" /> Present</span>
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-warning" /> Late</span>
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-ink-faint" /> Absent</span>
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-danger" /> Holiday / Term Break</span>
              </div>
              <div className="flex items-center gap-2">
                <span>{groupMembers.length} members × {selectedGroup.sessions.length} dates</span>
                <span className="hidden sm:inline">· Scroll horizontally for more dates</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Quick create / manage bar - preserves original functionality */}
      {canDo('sessions.manage') && (
        <div className="card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 mr-2">
              <Plus className="size-4" /> Quick session actions
            </h4>
            <Link to="/scheduling" className="btn btn-ghost btn-sm">
              <Timer className="size-4" /> Generate from weekly pattern
            </Link>
            <Link to="/holidays" className="btn btn-ghost btn-sm">
              <AlertTriangle className="size-4" /> Manage holidays (red columns)
            </Link>
            <Link to="/overrides" className="btn btn-ghost btn-sm">
              Overrides
            </Link>
            <span className="ml-auto text-[11px] text-ink-faint">Term breaks & holidays are automatically marked red — they block session generation (Rule 16)</span>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showRecurringConfirm}
        onOpenChange={(open) => setShowRecurringConfirm(open)}
        title="Apply recurring series?"
        description="This update will modify the matching dates in this group and keep the original recurrence pattern intact unless you explicitly edit it again."
        confirmLabel="Apply series"
        destructive={false}
        onConfirm={confirmRecurringSeries}
      >
        {recurrenceSummary && recurrencePreview.length > 0 && (
          <ReviewAndConfirmBanner
            title="Review and confirm"
            description="This change will affect the generated dates below after holiday rules are applied."
            count={recurrenceSummary.affectedDatesCount}
            range={`${recurrenceForm.start_date || editingSession?.start_at.slice(0, 10) || '—'} → ${recurrenceForm.end_date || editingSession?.start_at.slice(0, 10) || '—'}`}
            skipBankHolidays={recurrenceForm.skip_bank_holidays}
            skipTermHolidays={recurrenceForm.skip_term_holidays}
            tone={recurrenceSummary.affectedDatesCount >= 5 ? 'warning' : 'neutral'}
          />
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={showSaveOccurrenceConfirm}
        onOpenChange={(open) => setShowSaveOccurrenceConfirm(open)}
        title="Save this occurrence?"
        description="This will create a one-off override for this session instance without changing the recurring pattern."
        confirmLabel="Save occurrence"
        destructive={false}
        onConfirm={confirmSaveSessionEdit}
      >
        {editingSession && (
          <ReviewAndConfirmBanner
            title="Review and confirm"
            description="You are updating a single session date while leaving the underlying recurring schedule intact."
            count={1}
            range={`${new Date(sessionDraft.start_at).toLocaleDateString()} → ${new Date(sessionDraft.end_at).toLocaleDateString()}`}
            tone="neutral"
          />
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={showCancelOccurrenceConfirm}
        onOpenChange={(open) => setShowCancelOccurrenceConfirm(open)}
        title="Cancel this date only?"
        description="This will keep the repeating series but cancel just the selected session instance."
        confirmLabel="Cancel date"
        destructive
        onConfirm={confirmCancelThisDateOnly}
      >
        {editingSession && (
          <ReviewAndConfirmBanner
            title="Review and confirm"
            description="Only the selected occurrence will be cancelled; the recurring pattern will remain unchanged."
            count={1}
            range={`${new Date(editingSession.start_at).toLocaleDateString()}`}
            tone="warning"
          />
        )}
      </ConfirmDialog>

      <Dialog open={showBulkRecurringDialog} onOpenChange={(open) => setShowBulkRecurringDialog(open)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Apply a common recurring pattern</DialogTitle>
            <DialogDescription>
              This applies the same recurrence settings across the selected groups from the chosen date range, respecting term and UK bank holiday exceptions.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div className="rounded-xl border border-line bg-surface-inset/40 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-ink">
                  Frequency
                  <select className="input mt-1" value={recurrenceForm.frequency} onChange={(e) => setRecurrenceForm({ ...recurrenceForm, frequency: e.target.value })}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </label>
                <div />
                <label className="block text-sm font-medium text-ink">
                  Start date
                  <input type="date" className="input mt-1" value={recurrenceForm.start_date || ''} onChange={(e) => setRecurrenceForm({ ...recurrenceForm, start_date: e.target.value })} />
                </label>
                <label className="block text-sm font-medium text-ink">
                  End date
                  <input type="date" className="input mt-1" value={recurrenceForm.end_date || ''} onChange={(e) => setRecurrenceForm({ ...recurrenceForm, end_date: e.target.value })} />
                </label>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={recurrenceForm.skip_term_holidays} onChange={(e) => setRecurrenceForm({ ...recurrenceForm, skip_term_holidays: e.target.checked })} />
                  Skip term breaks
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={recurrenceForm.skip_bank_holidays} onChange={(e) => setRecurrenceForm({ ...recurrenceForm, skip_bank_holidays: e.target.checked })} />
                  Skip UK bank holidays
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn btn-ghost" onClick={previewBulkRecurringPattern}>Preview generated dates</button>
                <button className="btn btn-primary" onClick={applyBulkRecurringPattern} disabled={!recurrencePreview.length}>Apply common pattern</button>
              </div>
              {recurrenceSummary && recurrencePreview.length > 0 && (
                <div className="mt-3 rounded-lg border border-line bg-surface p-3">
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Preview summary</div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md border border-line bg-surface-inset p-2">
                      <div className="text-[10px] uppercase tracking-wide text-ink-faint">Generated</div>
                      <div className="mt-1 text-lg font-bold text-ink">{recurrenceSummary.totalGenerated}</div>
                    </div>
                    <div className="rounded-md border border-line bg-surface-inset p-2">
                      <div className="text-[10px] uppercase tracking-wide text-ink-faint">Skipped bank holidays</div>
                      <div className="mt-1 text-lg font-bold text-ink">{recurrenceSummary.skippedBankHolidays}</div>
                    </div>
                    <div className="rounded-md border border-line bg-surface-inset p-2">
                      <div className="text-[10px] uppercase tracking-wide text-ink-faint">Skipped term breaks</div>
                      <div className="mt-1 text-lg font-bold text-ink">{recurrenceSummary.skippedTermHolidays}</div>
                    </div>
                    <div className="rounded-md border border-line bg-surface-inset p-2">
                      <div className="text-[10px] uppercase tracking-wide text-ink-faint">Affected dates</div>
                      <div className="mt-1 text-lg font-bold text-ink">{recurrenceSummary.affectedDatesCount}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recurrencePreview.map(date => (
                      <span key={date} className="rounded-full border border-line bg-surface-inset px-2 py-1 text-[10px] font-medium text-ink">{date}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <button className="btn btn-ghost" onClick={() => setShowBulkRecurringDialog(false)}>Close</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingSession} onOpenChange={(open) => !open && setEditingSession(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Edit this session</DialogTitle>
              <span className="rounded-full border border-amber-400 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">
                Single occurrence only
              </span>
            </div>
            <DialogDescription>Applies only to this one date. Use the recurring tools below to expand this change across multiple dates without altering the original pattern.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[11px] font-medium text-amber-800">
              This editor affects only the selected instance. The weekly schedule stays intact unless you explicitly switch to a recurring series below.
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-ink">
                Session name
                <input className="input mt-1" value={sessionDraft.name} onChange={(e) => setSessionDraft({ ...sessionDraft, name: e.target.value })} />
              </label>
              <label className="block text-sm font-medium text-ink">
                Status
                <select className="input mt-1" value={sessionDraft.status} onChange={(e) => setSessionDraft({ ...sessionDraft, status: e.target.value })}>
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="rescheduled">Rescheduled</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-ink">
                Venue
                <select className="input mt-1" value={sessionDraft.venue_id} onChange={(e) => setSessionDraft({ ...sessionDraft, venue_id: e.target.value })}>
                  {venues.map((v: Venue) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button className="btn btn-ghost w-full" onClick={resetSessionToRecurringPattern}>Reset to recurring pattern</button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-ink">
                Start
                <input type="datetime-local" className="input mt-1" value={sessionDraft.start_at} onChange={(e) => setSessionDraft({ ...sessionDraft, start_at: e.target.value })} />
              </label>
              <label className="block text-sm font-medium text-ink">
                End
                <input type="datetime-local" className="input mt-1" value={sessionDraft.end_at} onChange={(e) => setSessionDraft({ ...sessionDraft, end_at: e.target.value })} />
              </label>
            </div>

            <div className="rounded-xl border border-line bg-surface-inset/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-ink">Convert this single session into a recurring series</div>
                  <div className="text-[11px] text-ink-faint">Applies across the selected date range and respects term / UK bank holiday skips.</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setRecurrenceForm({
                  frequency: 'weekly',
                  start_date: editingSession?.start_at.slice(0, 10) ?? '',
                  end_date: editingSession?.start_at.slice(0, 10) ?? '',
                  skip_term_holidays: true,
                  skip_bank_holidays: true,
                })}>Reset recurrence</button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-ink">
                  Frequency
                  <select className="input mt-1" value={recurrenceForm.frequency} onChange={(e) => setRecurrenceForm({ ...recurrenceForm, frequency: e.target.value })}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </label>
                <div />
                <label className="block text-sm font-medium text-ink">
                  Start date
                  <input type="date" className="input mt-1" value={recurrenceForm.start_date || editingSession?.start_at.slice(0, 10) || ''} onChange={(e) => setRecurrenceForm({ ...recurrenceForm, start_date: e.target.value })} />
                </label>
                <label className="block text-sm font-medium text-ink">
                  End date
                  <input type="date" className="input mt-1" value={recurrenceForm.end_date || editingSession?.start_at.slice(0, 10) || ''} onChange={(e) => setRecurrenceForm({ ...recurrenceForm, end_date: e.target.value })} />
                </label>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={recurrenceForm.skip_term_holidays} onChange={(e) => setRecurrenceForm({ ...recurrenceForm, skip_term_holidays: e.target.checked })} />
                  Skip term breaks
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={recurrenceForm.skip_bank_holidays} onChange={(e) => setRecurrenceForm({ ...recurrenceForm, skip_bank_holidays: e.target.checked })} />
                  Skip UK bank holidays
                </label>
              </div>
              <div className="mt-4">
                {recurrenceSummary && recurrencePreview.length > 0 && (
                  <ReviewAndConfirmBanner
                    title="Review and confirm"
                    description="Check the generated dates and holiday exclusions before applying this recurring update."
                    count={recurrenceSummary.affectedDatesCount}
                    range={`${recurrenceForm.start_date || editingSession?.start_at.slice(0, 10) || '—'} → ${recurrenceForm.end_date || editingSession?.start_at.slice(0, 10) || '—'}`}
                    skipBankHolidays={recurrenceForm.skip_bank_holidays}
                    skipTermHolidays={recurrenceForm.skip_term_holidays}
                    tone={recurrenceSummary.affectedDatesCount >= 5 ? 'warning' : 'neutral'}
                  />
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn btn-ghost" onClick={previewRecurrenceDates}>Preview generated dates</button>
                  <button className="btn btn-ghost" onClick={clearRecurrencePreview}>Cancel preview</button>
                  <button className="btn btn-primary" onClick={applyRecurringSeries} disabled={!recurrencePreview.length}>Apply recurring series</button>
                </div>
              </div>

              {recurrenceSummary && recurrencePreview.length > 0 && (
                <div className="mt-3 rounded-lg border border-line bg-surface p-3">
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Preview summary</div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md border border-line bg-surface-inset p-2">
                      <div className="text-[10px] uppercase tracking-wide text-ink-faint">Generated</div>
                      <div className="mt-1 text-lg font-bold text-ink">{recurrenceSummary.totalGenerated}</div>
                    </div>
                    <div className="rounded-md border border-line bg-surface-inset p-2">
                      <div className="text-[10px] uppercase tracking-wide text-ink-faint">Skipped bank holidays</div>
                      <div className="mt-1 text-lg font-bold text-ink">{recurrenceSummary.skippedBankHolidays}</div>
                    </div>
                    <div className="rounded-md border border-line bg-surface-inset p-2">
                      <div className="text-[10px] uppercase tracking-wide text-ink-faint">Skipped term breaks</div>
                      <div className="mt-1 text-lg font-bold text-ink">{recurrenceSummary.skippedTermHolidays}</div>
                    </div>
                    <div className="rounded-md border border-line bg-surface-inset p-2">
                      <div className="text-[10px] uppercase tracking-wide text-ink-faint">Affected dates</div>
                      <div className="mt-1 text-lg font-bold text-ink">{recurrenceSummary.affectedDatesCount}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] font-medium text-ink-faint">Dates to apply</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {recurrencePreview.map(date => (
                      <span key={date} className="rounded-full border border-line bg-surface-inset px-2 py-1 text-[10px] font-medium text-ink">{date}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <button className="btn btn-ghost" onClick={() => setEditingSession(null)}>Close</button>
            <button className="btn btn-danger" onClick={cancelThisDateOnly}>Cancel this date only</button>
            <button className="btn btn-primary" onClick={saveSessionEdit}>Save this occurrence</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMemberPicker} onOpenChange={setShowMemberPicker}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Add member to {selectedGroup?.name}</DialogTitle>
            <DialogDescription>
              Search members and tasters. Choose whether to add to all sessions in this recurring series or the selected date.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="mb-3 flex items-center gap-3 rounded-lg border border-line bg-surface-inset p-2 text-xs">
              <span className="font-semibold text-ink">Enrollment Scope:</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="enrollScope"
                  checked={enrollScope === 'series'}
                  onChange={() => setEnrollScope('series')}
                  className="accent-brand"
                />
                All dates in recurring series
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="enrollScope"
                  checked={enrollScope === 'instance'}
                  onChange={() => setEnrollScope('instance')}
                  className="accent-brand"
                />
                This session date only
              </label>
            </div>

            <input
              className="input mb-3 w-full"
              placeholder="Search members or tasters…"
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
            />

            <div className="max-h-80 overflow-auto divide-y divide-line">
              {/* Combine Regular Members and Tasters */}
              {[
                ...members.map(m => ({ ...m, isTaster: false })),
                ...tasters
                  .filter(t => !members.some(m => m.id === t.id))
                  .map(t => ({ id: t.id, name: t.name, isTaster: true })),
              ]
                .filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()))
                .map(m => {
                  const enrolled = selectedGroup?.memberIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      disabled={enrolled}
                      className="flex w-full items-center justify-between p-3 text-left hover:bg-surface-hover disabled:opacity-40"
                      onClick={async () => {
                        if (!selectedGroup || enrolled) return;
                        if (enrollScope === 'series') {
                          // Enroll across all sessions in this group
                          await Promise.all(
                            selectedGroup.sessions.map(s =>
                              supabase.from('mentis_enrollments').insert({
                                session_id: s.id,
                                member_id: m.isTaster ? undefined : m.id,
                                status: 'active',
                              })
                            )
                          );
                        } else {
                          // Enroll for current/first session
                          await supabase.from('mentis_enrollments').insert({
                            session_id: selectedGroup.sessions[0]?.id,
                            member_id: m.isTaster ? undefined : m.id,
                            status: 'active',
                          });
                        }

                        setGroups(gs =>
                          gs.map(g =>
                            g.key === selectedGroup.key
                              ? { ...g, memberIds: [...g.memberIds, m.id] }
                              : g
                          )
                        );
                        setShowMemberPicker(false);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{m.name}</span>
                        {m.isTaster && (
                          <span className="rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-bold text-info">
                            Taster
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-ink-muted">
                        {enrolled ? 'Already Added' : '+ Enroll'}
                      </span>
                    </button>
                  );
                })}
            </div>
          </DialogBody>
          <DialogFooter>
            <button className="btn btn-ghost" onClick={() => setShowMemberPicker(false)}>
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Empty / loading */}
      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="card p-6">
            <div className="grid gap-3">
              <div className="h-6 w-40 animate-pulse rounded-md bg-surface-hover" />
              <div className="h-32 animate-pulse rounded-md bg-surface-hover" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scheduling, Tasks, Inbox - keep existing but polished (from previous file)
// ---------------------------------------------------------------------------
export function Scheduling() {
  const { staff, canDo } = useAuth();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [allSessions, setAllSessions] = useState<any[]>([]);
  const [selectedVenueFilter, setSelectedVenueFilter] = useState<string>('all');
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionStatusFilter, setSessionStatusFilter] = useState<'all' | 'scheduled' | 'completed' | 'cancelled'>('all');
  const [bulkSessionMode, setBulkSessionMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [showNewScheduling, setShowNewScheduling] = useState(false);
  const [showNewSession, setShowNewSession] = useState(false);
  const [patternsExpanded, setPatternsExpanded] = useState(false);
  const [holidaysExpanded, setHolidaysExpanded] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    name: '',
    venue_id: '',
    start_at: '',
    end_at: '',
    status: 'scheduled',
  });
  const [responsibleCoachId, setResponsibleCoachId] = useState('');
  const [leadingCoachId, setLeadingCoachId] = useState('');
  const [assistingCoachId, setAssistingCoachId] = useState('');
  const [staffList, setStaffList] = useState<any[]>([]);

  // Sorting for Scheduling table
  const [tableSortColumn, setTableSortColumn] = useState<'name' | 'venue' | 'start_at' | 'headcount' | 'status'>('start_at');
  const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('asc');
  const [form, setForm] = useState({ name: '', venue_id: '', day_of_week: 2, valid_from: '', valid_to: '', start_time: '18:00', end_time: '19:00' });

  const toInputDateTime = (iso: string | null | undefined) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const resetSessionForm = () => {
    setEditingSessionId(null);
    setSelectedSessionId(null);
    setSessionForm({ name: '', venue_id: '', start_at: '', end_at: '', status: 'scheduled' });
  };

  const load = async () => {
    const orgId = staff?.organization_id;
    const [scheduleRes, holidayRes, venueRes, sessionRes, enrollmentRes, staffRes] = await Promise.all([
      supabase.from('mentis_weekly_schedules').select('*,mentis_venues(name)').eq('organization_id', orgId ?? ''),
      supabase.from('mentis_holiday_calendar').select('*').order('starts_on'),
      supabase.from('mentis_venues').select('id,name').eq('organization_id', orgId ?? ''),
      supabase.from('mentis_sessions').select('id,name,venue_id,status,start_at,end_at,schedule_id,responsible_coach_id,leading_coach_id,assisting_coach_id,mentis_venues(name)').eq('organization_id', orgId ?? '').order('start_at', { ascending: true }),
      supabase.from('mentis_enrollments').select('session_id'),
      supabase.from('mentis_staff').select('id,display_name,roles'),
    ]);

    setSchedules(scheduleRes.data ?? []);
    setHolidays(holidayRes.data ?? []);
    setVenues(venueRes.data ?? []);
    setStaffList(staffRes.data ?? []);

    const counts = new Map<string, number>();
    (enrollmentRes.data ?? []).forEach((row: any) => {
      counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1);
    });

    const sessions = (sessionRes.data ?? []).map((row: any) => ({
      ...row,
      venue_name: row.mentis_venues?.name ?? 'Unknown venue',
      headcount: counts.get(row.id) ?? 0,
      start_label: new Date(row.start_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
      end_label: new Date(row.end_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
    }));

    setAllSessions(sessions);
    if (!selectedSessionId && sessions.length) {
      setSelectedSessionId(sessions[0].id);
    }
  };

  useEffect(() => { if (staff?.organization_id) load(); }, [staff?.organization_id]);

  const create = async () => {
    const { error } = await supabase.from('mentis_weekly_schedules').insert({ organization_id: staff?.organization_id, ...form });
    if (error) alert(error.message); else { setForm({ ...form, name: '' }); load(); }
  };

  const saveSession = async () => {
    if (!sessionForm.name.trim() || !sessionForm.venue_id || !sessionForm.start_at || !sessionForm.end_at) {
      alert('Please complete the session name, venue, start time and end time.');
      return;
    }

    const payload = {
      organization_id: staff?.organization_id,
      name: sessionForm.name.trim(),
      venue_id: sessionForm.venue_id,
      start_at: new Date(sessionForm.start_at).toISOString(),
      end_at: new Date(sessionForm.end_at).toISOString(),
      status: sessionForm.status,
      responsible_coach_id: responsibleCoachId || null,
      leading_coach_id: leadingCoachId || null,
      assisting_coach_id: assistingCoachId || null,
    };

    if (editingSessionId) {
      const { error } = await supabase.from('mentis_sessions').update(payload).eq('id', editingSessionId);
      if (error) {
        alert(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('mentis_sessions').insert(payload);
      if (error) {
        alert(error.message);
        return;
      }
    }

    resetSessionForm();
    load();
  };

  const deleteSession = async (id: string) => {
    const { error } = await supabase.from('mentis_sessions').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    if (selectedSessionId === id) setSelectedSessionId(null);
    load();
  };

  const beginEditSession = (session: any) => {
    setEditingSessionId(session.id);
    setSelectedSessionId(session.id);
    setSessionForm({
      name: session.name,
      venue_id: session.venue_id,
      start_at: toInputDateTime(session.start_at),
      end_at: toInputDateTime(session.end_at),
      status: session.status,
    });
    setResponsibleCoachId(session.responsible_coach_id || '');
    setLeadingCoachId(session.leading_coach_id || '');
    setAssistingCoachId(session.assisting_coach_id || '');
  };

  const generate = async (sch: any) => {
    const out: { date: string }[] = [];
    const d = new Date(`${sch.valid_from}T00:00:00Z`);
    const end = sch.valid_to;
    const skip = (date: string) => holidays.some((h) => date >= h.starts_on && date <= h.ends_on);
    while (d.toISOString().slice(0, 10) <= end) {
      const date = d.toISOString().slice(0, 10);
      if (d.getUTCDay() === sch.day_of_week && !skip(date)) {
        const { error } = await supabase.from('mentis_sessions').insert({
          organization_id: staff?.organization_id, venue_id: sch.venue_id, name: sch.name, schedule_id: sch.id,
          start_at: `${date}T${sch.start_time}:00Z`, end_at: `${date}T${sch.end_time}:00Z`, status: 'scheduled',
        });
        if (error) { alert(`Stopped: ${error.message}`); break; }
        out.push({ date });
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    alert(`Generated ${out.length} instances (holidays skipped, conflicts blocked at save).`);
    load();
  };

  const filteredSessions = useMemo(() => {
    let list = allSessions.filter(session => {
      const matchesVenue = selectedVenueFilter === 'all' || session.venue_id === selectedVenueFilter;
      const matchesSearch = !sessionSearch.trim() || session.name.toLowerCase().includes(sessionSearch.trim().toLowerCase());
      const matchesStatus = sessionStatusFilter === 'all' || session.status === sessionStatusFilter;
      return matchesVenue && matchesSearch && matchesStatus;
    });

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (tableSortColumn === 'name') cmp = a.name.localeCompare(b.name);
      else if (tableSortColumn === 'venue') cmp = (a.venue_name || '').localeCompare(b.venue_name || '');
      else if (tableSortColumn === 'start_at') cmp = Date.parse(a.start_at) - Date.parse(b.start_at);
      else if (tableSortColumn === 'headcount') cmp = (a.headcount || 0) - (b.headcount || 0);
      else if (tableSortColumn === 'status') cmp = a.status.localeCompare(b.status);
      return tableSortDirection === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [allSessions, selectedVenueFilter, sessionSearch, sessionStatusFilter, tableSortColumn, tableSortDirection]);

  const selectedSession = useMemo(
    () => allSessions.find(session => session.id === selectedSessionId) ?? filteredSessions[0] ?? null,
    [allSessions, selectedSessionId, filteredSessions],
  );

  const toggleSessionSelection = (sessionId: string) => {
    setSelectedSessionIds(prev => prev.includes(sessionId) ? prev.filter(id => id !== sessionId) : [...prev, sessionId]);
  };

  const toggleAllVisibleSessions = () => {
    const visibleIds = filteredSessions.map(session => session.id);
    if (!visibleIds.length) return;
    setSelectedSessionIds(prev => {
      const allVisibleSelected = visibleIds.every(id => prev.includes(id));
      return allVisibleSelected ? prev.filter(id => !visibleIds.includes(id)) : Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  const bulkUpdateSessionStatus = async (status: 'scheduled' | 'completed' | 'cancelled') => {
    if (!selectedSessionIds.length) return;
    const { error } = await supabase.from('mentis_sessions').update({ status }).in('id', selectedSessionIds);
    if (error) {
      alert(error.message);
      return;
    }
    setSelectedSessionIds([]);
    setBulkSessionMode(false);
    load();
  };

  const bulkDeleteSessions = async () => {
    if (!selectedSessionIds.length) return;
    if (!window.confirm(`Delete ${selectedSessionIds.length} selected session(s)?`)) return;
    const { error } = await supabase.from('mentis_sessions').delete().in('id', selectedSessionIds);
    if (error) {
      alert(error.message);
      return;
    }
    setSelectedSessionIds([]);
    setBulkSessionMode(false);
    load();
  };

  if (!canDo('sessions.manage')) return <div className="p-8">Admin only.</div>;
  return (
    <div>
      <PageHeader
        title="Scheduling"
        subtitle="Weekly patterns → instances · holidays · overrides"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowNewScheduling(v => !v)}
            >
              {showNewScheduling ? 'Close' : 'New Scheduling'}
            </button>
            <Link to="/overrides" className="btn btn-ghost">Overrides</Link>
          </div>
        }
      />
      <Dialog open={showNewScheduling} onOpenChange={(open) => setShowNewScheduling(open)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>New weekly schedule</DialogTitle>
            <DialogDescription>Create a recurring pattern for a venue and date range.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-ink">
                Name
                <input className="input mt-1" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="block text-sm font-medium text-ink">
                Venue
                <select className="input mt-1" value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })}>
                  <option value="">Venue…</option>{venues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-ink">
                Day
                <select className="input mt-1" value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: Number(e.target.value) })}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-ink">
                From
                <input type="date" className="input mt-1" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
              </label>
              <label className="block text-sm font-medium text-ink">
                To
                <input type="date" className="input mt-1" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
              </label>
              <label className="block text-sm font-medium text-ink">
                Start
                <input type="time" className="input mt-1" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </label>
              <label className="block text-sm font-medium text-ink">
                End
                <input type="time" className="input mt-1" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <button className="btn btn-ghost" onClick={() => setShowNewScheduling(false)}>Close</button>
            <button className="btn btn-primary" onClick={() => { create(); setShowNewScheduling(false); }}>Create pattern</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="card overflow-hidden">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 border-b border-line bg-surface-inset/40 px-4 py-3 text-left"
            onClick={() => setPatternsExpanded(v => !v)}
          >
            <div>
              <div className="text-sm font-bold text-ink">Patterns</div>
              <div className="text-[11px] text-ink-faint">{schedules.length} active recurring schedules</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-surface px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                {schedules.length}
              </span>
              <ChevronDown className={cn('size-4 text-ink-faint transition-transform', patternsExpanded && 'rotate-180')} />
            </div>
          </button>

          <AnimatePresence initial={false}>
            {patternsExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="space-y-2 p-4">
                  {schedules.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-line bg-surface-hover/40 p-3 text-sm text-ink-muted">
                      No recurring patterns yet. Create one to generate session instances.
                    </div>
                  ) : (
                    schedules.map((s: any) => (
                      <div key={s.id} className="flex flex-col gap-2 rounded-xl border border-line bg-surface-inset/30 p-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-ink">{s.name}</div>
                          <div className="text-[11px] text-ink-faint">
                            {s.mentis_venues?.name} · {s.valid_from} → {s.valid_to}
                          </div>
                        </div>
                        <button className="btn btn-ghost btn-sm whitespace-nowrap" onClick={() => generate(s)}>
                          Generate
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="card overflow-hidden">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 border-b border-line bg-surface-inset/40 px-4 py-3 text-left"
            onClick={() => setHolidaysExpanded(v => !v)}
          >
            <div>
              <div className="text-sm font-bold text-ink">Holiday calendar</div>
              <div className="text-[11px] text-ink-faint">Red columns in the workbook</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-danger-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-danger">
                {holidays.length}
              </span>
              <ChevronDown className={cn('size-4 text-ink-faint transition-transform', holidaysExpanded && 'rotate-180')} />
            </div>
          </button>

          <AnimatePresence initial={false}>
            {holidaysExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="space-y-2 p-4">
                  {holidays.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-line bg-surface-hover/40 p-3 text-sm text-ink-muted">
                      No holiday rules configured.
                    </div>
                  ) : (
                    holidays.map((h: any) => (
                      <div key={h.id} className="flex items-start gap-2 rounded-lg border border-line bg-surface-inset/30 px-3 py-2 text-sm">
                        <span className="mt-1 size-2 rounded-full bg-danger" />
                        <div className="min-w-0">
                          <div className="font-medium text-ink">{h.name}</div>
                          <div className="text-[11px] text-ink-faint">
                            {h.kind.replace('_', ' ')} · {h.starts_on} → {h.ends_on}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Dialog open={showNewSession} onOpenChange={(open) => setShowNewSession(open)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Create session</DialogTitle>
            <DialogDescription>Add a single session instance with coach placeholders and assignments.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <label className="block text-sm">
              Session name
              <input className="input mt-1" value={sessionForm.name} onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })} />
            </label>
            <label className="block text-sm">
              Venue
              <select className="input mt-1" value={sessionForm.venue_id} onChange={(e) => setSessionForm({ ...sessionForm, venue_id: e.target.value })}>
                <option value="">Select venue</option>
                {venues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Start
                <input type="datetime-local" className="input mt-1" value={sessionForm.start_at} onChange={(e) => setSessionForm({ ...sessionForm, start_at: e.target.value })} />
              </label>
              <label className="block text-sm">
                End
                <input type="datetime-local" className="input mt-1" value={sessionForm.end_at} onChange={(e) => setSessionForm({ ...sessionForm, end_at: e.target.value })} />
              </label>
            </div>

            {/* Coach Assignment Placeholders */}
            <div className="rounded-lg border border-line bg-surface-inset p-3 space-y-3">
              <div className="text-xs font-bold text-ink uppercase tracking-wide">Coach Placeholders & Staffing</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs">
                  Responsible Coach
                  <select className="input mt-1 text-xs" value={responsibleCoachId} onChange={e => setResponsibleCoachId(e.target.value)}>
                    <option value="">Select coach</option>
                    {staffList.map((s: any) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                  </select>
                </label>
                <label className="block text-xs">
                  Leading Coach
                  <select className="input mt-1 text-xs" value={leadingCoachId} onChange={e => setLeadingCoachId(e.target.value)}>
                    <option value="">Select coach</option>
                    {staffList.map((s: any) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                  </select>
                </label>
                <label className="block text-xs">
                  Assisting Coach
                  <select className="input mt-1 text-xs" value={assistingCoachId} onChange={e => setAssistingCoachId(e.target.value)}>
                    <option value="">Select coach</option>
                    {staffList.map((s: any) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <label className="block text-sm">
              Status
              <select className="input mt-1" value={sessionForm.status} onChange={(e) => setSessionForm({ ...sessionForm, status: e.target.value })}>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </DialogBody>
          <DialogFooter>
            <button className="btn btn-ghost" onClick={() => { setShowNewSession(false); setSessionForm({ name: '', venue_id: '', start_at: '', end_at: '', status: 'scheduled' }); }}>Clear</button>
            <button className="btn btn-primary" onClick={saveSession}>Create session</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-4">
          <div>
            <h3 className="font-bold">All sessions</h3>
            <p className="text-sm text-ink-muted">Organization-wide view of every session for the current org.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <input
              className="input"
              style={{ width: 180 }}
              placeholder="Search session"
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
            />
            <select className="input" value={sessionStatusFilter} onChange={(e) => setSessionStatusFilter(e.target.value as 'all' | 'scheduled' | 'completed' | 'cancelled')}>
              <option value="all">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select className="input" value={selectedVenueFilter} onChange={(e) => setSelectedVenueFilter(e.target.value)}>
              <option value="all">All venues</option>
              {venues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingSessionId(null);
                setSessionForm({ name: '', venue_id: '', start_at: '', end_at: '', status: 'scheduled' });
                setShowNewSession(true);
              }}
            >
              New Session
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => setBulkSessionMode(v => !v)}>
            {bulkSessionMode ? 'Exit bulk mode' : 'Bulk actions'}
          </button>
          {bulkSessionMode && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={toggleAllVisibleSessions}>Select all visible</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedSessionIds([])}>Clear selection</button>
              <button className="btn btn-ghost btn-sm text-danger" onClick={bulkDeleteSessions} disabled={!selectedSessionIds.length}>Delete selected</button>
              <select
                className="input"
                style={{ width: 150 }}
                value=""
                onChange={(e) => {
                  const nextStatus = e.target.value as 'scheduled' | 'completed' | 'cancelled';
                  if (nextStatus) bulkUpdateSessionStatus(nextStatus);
                  e.target.value = '';
                }}
              >
                <option value="">Set status…</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </>
          )}
          {selectedSessionIds.length > 0 && bulkSessionMode && (
            <span className="rounded-full bg-brand-soft px-2 py-1 text-[11px] font-semibold text-brand">{selectedSessionIds.length} selected</span>
          )}
        </div>

        <div className="w-full">
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-surface-inset text-ink-faint">
                  <tr>
                    {bulkSessionMode && <th className="px-3 py-2 w-8"><span className="sr-only">Select</span></th>}
                    <th className="px-3 py-2 cursor-pointer select-none" onClick={() => {
                      if (tableSortColumn === 'name') setTableSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                      else { setTableSortColumn('name'); setTableSortDirection('asc'); }
                    }}>
                      Session {tableSortColumn === 'name' ? (tableSortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th className="px-3 py-2 cursor-pointer select-none" onClick={() => {
                      if (tableSortColumn === 'start_at') setTableSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                      else { setTableSortColumn('start_at'); setTableSortDirection('asc'); }
                    }}>
                      Timing {tableSortColumn === 'start_at' ? (tableSortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th className="px-3 py-2 cursor-pointer select-none" onClick={() => {
                      if (tableSortColumn === 'venue') setTableSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                      else { setTableSortColumn('venue'); setTableSortDirection('asc'); }
                    }}>
                      Venue {tableSortColumn === 'venue' ? (tableSortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th className="px-3 py-2 cursor-pointer select-none" onClick={() => {
                      if (tableSortColumn === 'headcount') setTableSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                      else { setTableSortColumn('headcount'); setTableSortDirection('asc'); }
                    }}>
                      Headcount {tableSortColumn === 'headcount' ? (tableSortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th className="px-3 py-2 cursor-pointer select-none" onClick={() => {
                      if (tableSortColumn === 'status') setTableSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                      else { setTableSortColumn('status'); setTableSortDirection('asc'); }
                    }}>
                      Status {tableSortColumn === 'status' ? (tableSortDirection === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((session: any) => (
                    <tr
                      key={session.id}
                      className={session.id === selectedSessionId ? 'bg-brand-soft/40' : 'bg-surface hover:bg-surface-hover'}
                      onClick={() => setSelectedSessionId(session.id)}
                    >
                      {bulkSessionMode && (
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedSessionIds.includes(session.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSessionSelection(session.id)}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 font-medium">{session.name}</td>
                      <td className="px-3 py-2">
                        <div>{session.start_label}</div>
                        <div className="text-ink-muted">→ {session.end_label}</div>
                      </td>
                      <td className="px-3 py-2">{session.venue_name}</td>
                      <td className="px-3 py-2 tabular-nums">{session.headcount}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium">{session.status}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); beginEditSession(session); }}>Modify</button>
                          <button className="btn btn-ghost btn-sm text-danger" onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Tasks() {
  const { staff, canDo } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState({ title: '', type: 'other', assignee_id: '', group_id: '', due_at: '', priority: 'normal', recurrence: '', chargeable: false, customer_id: '', amount: '' });
  const load = () => {
    supabase.from('mentis_tasks').select('*,mentis_staff!tasks_assignee_id_fkey(display_name)').order('due_at').limit(100).then(({ data }) => setRows(data ?? []));
    supabase.from('mentis_staff').select('id,display_name').then(({ data }) => setStaffList(data ?? []));
    supabase.from('mentis_groups').select('id,name').then(({ data }) => setGroups(data ?? []));
    supabase.from('mentis_customers').select('id,name').then(({ data }) => setCustomers(data ?? []));
  };
  useEffect(() => { load(); }, []);
  const create = async () => {
    if (!form.title.trim()) return;
    await supabase.from('mentis_tasks').insert({
      organization_id: staff?.organization_id, title: form.title, task_type: form.type,
      assignee_id: form.assignee_id || staff?.id, group_id: form.group_id || null,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null, priority: form.priority,
      recurrence: form.recurrence || null, chargeable_to_customer: form.chargeable,
      customer_id: form.customer_id || null, amount_cents: form.amount ? Math.round(Number(form.amount) * 100) : null,
      created_by: staff?.user_id,
    });
    setForm({ ...form, title: '', amount: '' }); load();
  };
  const approve = async (t: any) => {
    await supabase.from('mentis_tasks').update({ approved_at: new Date().toISOString(), approved_by: staff?.user_id }).eq('id', t.id);
    if (t.chargeable_to_customer && t.customer_id && t.amount_cents) {
      await supabase.from('mentis_customer_charges').insert({
        organization_id: staff?.organization_id, task_id: t.id, customer_id: t.customer_id,
        amount_cents: t.amount_cents, status: 'pendingApproval',
      });
    }
    load();
  };
  const done = async (t: any) => {
    await supabase.from('mentis_tasks').update({ status: 'done' }).eq('id', t.id);
    load();
  };
  const logWork = async (t: any) => {
    const hours = prompt('Hours worked:', String(t.work_hours ?? ''));
    if (hours == null) return;
    const notes = prompt('Work notes:', t.work_notes ?? '') ?? '';
    await supabase.from('mentis_tasks').update({ work_hours: Number(hours), work_notes: notes }).eq('id', t.id);
    load();
  };
  return (
    <div>
      <PageHeader title="Tasks" subtitle="Billable only after manager/admin TASK approval (separate from invoice approval)" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
        <input className="input" style={{ width: 220 }} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <select className="input" style={{ width: 150 }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {['groupCoaching', 'oneOnOne', 'onDuty', 'campaign', 'other'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input" style={{ width: 150 }} value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
          <option value="">Me</option>{staffList.map((s: any) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
        </select>
        <select className="input" style={{ width: 140 }} value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
          <option value="">No group</option>{groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <label className="text-sm">Due <input type="datetime-local" className="input" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></label>
        <input className="input" style={{ width: 130 }} placeholder="Recurrence" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })} />
        <label className="text-sm"><input type="checkbox" checked={form.chargeable} onChange={(e) => setForm({ ...form, chargeable: e.target.checked })} /> Chargeable</label>
        {form.chargeable && (
          <span className="flex gap-2">
            <select className="input" style={{ width: 150 }} value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
              <option value="">Customer…</option>{customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="text-sm">£ <input className="input" style={{ width: 80 }} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          </span>
        )}
        <button className="btn btn-primary" onClick={create}>Create</button>
      </div>
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Title</th><th>Type</th><th>Assignee</th><th>Status</th><th>Work</th><th>Approved</th><th></th></tr></thead>
        <tbody>{rows.map((t: any) => (
          <tr key={t.id}><td className="font-semibold">{t.title}{t.chargeable_to_customer && ' 💷'}</td><td>{t.task_type}</td>
            <td>{t.mentis_staff?.display_name}</td><td>{t.status}</td>
            <td className="text-xs">{t.work_hours ? `${t.work_hours}h ${t.work_notes ?? ''}` : '—'}</td>
            <td>{t.approved_at ? '✓' : '—'}</td>
            <td className="flex gap-2">
              <button className="btn btn-ghost" onClick={() => logWork(t)}>Log work</button>
              {t.status !== 'done' && <button className="btn btn-ghost" onClick={() => done(t)}>Done</button>}
              {canDo('tasks.approve') && !t.approved_at && <button className="btn btn-primary" onClick={() => approve(t)}>Approve</button>}
            </td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

export function Inbox() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState('open');
  const load = () => supabase
    .from('mentis_pending_actions')
    .select('*, mentis_action_types(name), mentis_staff!mentis_pending_actions_assignee_id_fkey(display_name)')
    .order('due_at')
    .limit(100)
    .then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const close = async (a: any) => {
    await supabase.from('mentis_pending_actions').update({ status: 'closed' }).eq('id', a.id);
    load();
  };
  const visible = rows.filter((r: any) => {
    if (filter === 'all') return true;
    if (filter === 'staffing') return r.title.toLowerCase().includes('staff') || r.mentis_action_types?.name?.toLowerCase().includes('staff');
    return r.status === filter;
  });
  const resolve = async (a: any) => {
    await supabase.from('mentis_pending_actions').update({ status: 'closed' }).eq('id', a.id);
    load();
  };
  return (
    <div>
      <PageHeader title="Inbox" subtitle="Pending actions queue" actions={
        <span className="flex gap-2">
          <Link to="/actions/new" className="btn btn-primary">New manual action</Link>
          <select className="input" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="open">Open</option><option value="breached">Breached</option><option value="closed">Closed</option><option value="staffing">Staffing</option><option value="all">All</option>
          </select>
        </span>
      } />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Action</th><th>Type</th><th>Assignee</th><th>Due</th><th>Breach</th><th>Status</th><th></th></tr></thead>
        <tbody>{visible.map((a: any) => (
          <tr key={a.id}><td className="font-semibold">{a.title}</td><td>{a.mentis_action_types?.name}</td>
            <td>{a.mentis_staff?.display_name ?? 'Unassigned'}</td>
            <td>{new Date(a.due_at).toLocaleDateString()}</td>
            <td>{a.breach_at ? new Date(a.breach_at).toLocaleDateString() : '—'}</td>
            <td><span className="badge" style={{ background: a.status === 'breached' ? 'var(--danger)' : 'var(--border)', color: a.status === 'breached' ? '#fff' : undefined }}>{a.status}</span></td>
            <td>
              {a.status !== 'closed' && (
                <div className="flex gap-2">
                  <button className="btn btn-primary" onClick={() => close(a)}>Close</button>
                  <button className="btn btn-ghost" onClick={() => resolve(a)}>Resolve</button>
                </div>
              )}
            </td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
