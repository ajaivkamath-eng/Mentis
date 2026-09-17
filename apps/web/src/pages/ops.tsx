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
  MoreHorizontal,
  Sparkles,
  BookOpen,
  Timer,
  Ban,
  CheckCheck,
  UserPlus,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/patterns/page-header';
import { Button } from '../components/ui/button';
import { InputWithIcon } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
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
  kind: 'term_holiday_week' | 'bank_holiday' | 'manual';
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
    { id: 'h1', name: 'Half Term Break', kind: 'term_holiday_week', starts_on: '2025-10-27', ends_on: '2025-11-02' },
    { id: 'h2', name: 'Christmas Break', kind: 'term_holiday_week', starts_on: '2025-12-20', ends_on: '2026-01-04' },
    { id: 'h3', name: 'Bank Holiday - New Year', kind: 'bank_holiday', starts_on: '2026-01-01', ends_on: '2026-01-01' },
    { id: 'h4', name: 'Easter Break', kind: 'term_holiday_week', starts_on: '2026-03-30', ends_on: '2026-04-12' },
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

  const [selectedVenue, setSelectedVenue] = useState<string>('all');
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showOnlyAlert, setShowOnlyAlert] = useState(false);
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'present' | 'absent' | 'late'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

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
        const [{ data: vData }, { data: hData }, { data: sData }, { data: eData }, { data: aData }, { data: mData }] = await Promise.all([
          supabase.from('mentis_venues').select('id,name'),
          supabase.from('mentis_holiday_calendar').select('*').order('starts_on'),
          supabase.from('mentis_sessions').select('id,name,venue_id,start_at,end_at,status,schedule_id,mentis_venues(name)').order('start_at').limit(300),
          supabase.from('mentis_enrollments').select('session_id,member_id,mentis_members(id,name)').limit(1000),
          supabase.from('mentis_attendance_records').select('session_id,member_id,status').limit(2000),
          supabase.from('mentis_members').select('id,name').order('name').limit(500),
        ]);
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
        }));

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
  const filteredGroups = useMemo(() => {
    if (selectedVenue === 'all') return groups;
    return groups.filter(g => g.venue_id === selectedVenue);
  }, [groups, selectedVenue]);

  const selectedGroup = useMemo(() => {
    return groups.find(g => g.key === selectedGroupKey) ?? filteredGroups[0] ?? null;
  }, [groups, selectedGroupKey, filteredGroups]);

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
    return list;
  }, [selectedGroup, members, search, showOnlyAlert]);

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
            return (
              <button
                key={v.id}
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
            );
          })}
        </div>
      </div>

      {/* Session Sheet Tabs - Second level, spreadsheet-like */}
      <div className="card p-0 overflow-hidden">
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
                  onClick={() => setSelectedGroupKey(g.key)}
                  className={cn(
                    'relative flex shrink-0 items-center gap-2 border-x border-t px-3.5 py-2 text-xs font-semibold transition-all',
                    'first:rounded-tl-md last:rounded-tr-md -mb-px',
                    active
                      ? 'z-10 bg-surface border-line border-b-surface text-ink shadow-[0_-2px_0_var(--brand)]'
                      : 'bg-surface-inset/70 border-transparent text-ink-muted hover:bg-surface-hover hover:text-ink'
                  )}
                  style={active ? { borderBottomColor: 'var(--surface)' } : undefined}
                >
                  <span className="max-w-[14ch] truncate">{g.name}</span>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium text-ink-faint">
                    <Clock className="size-3" />
                    {g.dayLabel} {g.timeLabel}
                  </span>
                  {holidayCount > 0 && (
                    <span className="rounded-full bg-danger-soft px-1 py-0.5 text-[9px] font-bold text-danger">{holidayCount} HOL</span>
                  )}
                  <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] tabular-nums">{g.memberIds.length}</span>
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
                  onClick={() => setShowOnlyAlert(!showOnlyAlert)}
                  className={cn('rounded-[5px] px-2 py-1 text-[11px] font-semibold', showOnlyAlert ? 'bg-amber-500/15 text-amber-600' : 'text-ink-faint hover:text-ink')}
                  title="Only show ⚠️"
                >
                  ⚠️
                </button>
                <button
                  onClick={() => setAttendanceFilter(f => f === 'all' ? 'absent' : 'all')}
                  className={cn('rounded-[5px] px-2 py-1 text-[11px] font-semibold', attendanceFilter !== 'all' ? 'bg-surface-raised shadow-sm text-ink' : 'text-ink-faint hover:text-ink')}
                >
                  <Filter className="size-3 inline mr-1" />
                  {attendanceFilter === 'all' ? 'All' : 'Absent only'}
                </button>
              </div>
              {canDo('sessions.manage') && (
                <Button size="sm" intent="soft" iconLeft={<Plus className="size-4" />}>
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
            <div className="relative overflow-auto" style={{ maxHeight: '62vh' }}>
              <table className="w-full border-collapse text-xs" style={{ minWidth: 900 }}>
                <thead className="sticky top-0 z-20 bg-surface">
                  <tr>
                    <th className="sticky left-0 z-30 w-[200px] border-b border-r border-line bg-surface p-2 text-left">
                      <div className="flex items-center gap-2">
                        <Users className="size-3.5 text-ink-faint" />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Members</span>
                        <span className="ml-auto rounded-full bg-surface-inset px-1.5 py-0.5 text-[10px] tabular-nums">{groupMembers.length}</span>
                      </div>
                    </th>
                    {selectedGroup.sessions.map(sess => {
                      const dateStr = sess.start_at.slice(0, 10);
                      const hol = isDateInHolidays(dateStr, holidays);
                      const isWeekend = new Date(sess.start_at).getDay() === 0 || new Date(sess.start_at).getDay() === 6;
                      return (
                        <th
                          key={sess.id}
                          className={cn(
                            'min-w-[72px] border-b border-r border-line p-1 text-center align-bottom',
                            hol
                              ? 'bg-danger text-white'
                              : isWeekend
                              ? 'bg-surface-inset'
                              : 'bg-surface',
                            hol && 'relative overflow-hidden'
                          )}
                          title={hol ? `${hol.name} (${hol.kind}) — No session` : `${dateStr} ${new Date(sess.start_at).toLocaleTimeString()}`}
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
                            <div className="flex flex-col items-center gap-0.5 py-1">
                              <span className={cn('text-[10px] font-medium', isWeekend ? 'text-ink-faint' : 'text-ink-muted')}>{formatDay(sess.start_at)}</span>
                              <span className="text-[11px] font-bold tabular-nums">{formatDateShort(sess.start_at)}</span>
                              <span className="text-[9px] text-ink-faint tabular-nums">{new Date(sess.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              {/* present count */}
                              <span className="mt-1 rounded-full bg-surface-inset px-1 py-0 text-[9px] tabular-nums">
                                {attendance.filter(a => a.session_id === sess.id && a.status === 'present').length}/{selectedGroup.memberIds.length}
                              </span>
                            </div>
                          )}
                        </th>
                      );
                    })}
                    <th className="sticky right-0 z-20 w-[68px] border-b border-l border-line bg-surface p-1 text-center text-[10px] font-bold uppercase">%</th>
                  </tr>
                </thead>
                <tbody>
                  {groupMembers.map((m, idx) => {
                    const memberAttendances = selectedGroup.sessions.map(s => attendanceMap.get(`${m.id}|${s.id}`) ?? 'absent');
                    const presentCount = memberAttendances.filter(s => s === 'present').length;
                    const totalValid = selectedGroup.sessions.filter(s => !isDateInHolidays(s.start_at.slice(0, 10), holidays)).length;
                    const pctVal = totalValid ? Math.round((presentCount / totalValid) * 100) : 0;
                    const filteredOutByAttendance = attendanceFilter === 'absent' && !memberAttendances.includes('absent');
                    if (filteredOutByAttendance) return null;
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
                        {selectedGroup.sessions.map(sess => {
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
                    {selectedGroup.sessions.map(sess => {
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
  const [form, setForm] = useState({ name: '', venue_id: '', day_of_week: 2, valid_from: '', valid_to: '', start_time: '18:00', end_time: '19:00' });
  const load = () => {
    supabase.from('mentis_weekly_schedules').select('*,mentis_venues(name)').then(({ data }) => setSchedules(data ?? []));
    supabase.from('mentis_holiday_calendar').select('*').order('starts_on').then(({ data }) => setHolidays(data ?? []));
    supabase.from('mentis_venues').select('id,name').then(({ data }) => setVenues(data ?? []));
  };
  useEffect(() => { load(); }, []);
  const create = async () => {
    const { error } = await supabase.from('mentis_weekly_schedules').insert({ organization_id: staff?.organization_id, ...form });
    if (error) alert(error.message); else { setForm({ ...form, name: '' }); load(); }
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
  };
  if (!canDo('sessions.manage')) return <div className="p-8">Admin only.</div>;
  return (
    <div>
      <PageHeader title="Scheduling" subtitle="Weekly patterns → instances · holidays · overrides" actions={<Link to="/overrides" className="btn btn-ghost">Overrides</Link>} />
      <div className="card p-4 mb-4 flex flex-col gap-2" style={{ maxWidth: 700 }}>
        <h3 className="font-bold">New weekly schedule</h3>
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="input" value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })}>
            <option value="">Venue…</option>{venues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <label className="text-sm">Day <select className="input" value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: Number(e.target.value) })}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <option key={i} value={i}>{d}</option>)}</select></label>
          <label className="text-sm">From <input type="date" className="input" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></label>
          <label className="text-sm">To <input type="date" className="input" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} /></label>
          <label className="text-sm">Start <input type="time" className="input" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></label>
          <label className="text-sm">End <input type="time" className="input" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></label>
        </div>
        <button className="btn btn-primary" style={{ width: 'fit-content' }} onClick={create}>Create pattern</button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4"><h3 className="font-bold mb-2">Patterns</h3>
          {schedules.map((s: any) => <div key={s.id} className="flex justify-between py-1 text-sm"><span>{s.name} · {s.mentis_venues?.name} · {s.valid_from}→{s.valid_to}</span><button className="btn btn-ghost" onClick={() => generate(s)}>Generate</button></div>)}
        </div>
        <div className="card p-4"><h3 className="font-bold mb-2">Holiday calendar — red columns in workbook</h3>
          {holidays.map((h: any) => <div key={h.id} className="text-sm py-1 flex items-center gap-2"><span className="size-2 rounded-full bg-danger inline-block" /> {h.name} <em>({h.kind})</em> {h.starts_on}→{h.ends_on}</div>)}
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
  const load = () => supabase.from('mentis_pending_actions').select('*,mentis_action_types(name)').order('due_at').limit(100).then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const close = async (a: any) => {
    await supabase.from('mentis_pending_actions').update({ status: 'closed' }).eq('id', a.id);
    load();
  };
  const visible = rows.filter((r: any) => filter === 'all' || r.status === filter);
  return (
    <div>
      <PageHeader title="Inbox" subtitle="Pending actions queue" actions={
        <span className="flex gap-2">
          <Link to="/actions/new" className="btn btn-primary">New manual action</Link>
          <select className="input" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="open">Open</option><option value="breached">Breached</option><option value="closed">Closed</option><option value="all">All</option>
          </select>
        </span>
      } />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Action</th><th>Type</th><th>Due</th><th>Status</th><th></th></tr></thead>
        <tbody>{visible.map((a: any) => (
          <tr key={a.id}><td className="font-semibold">{a.title}</td><td>{a.mentis_action_types?.name}</td>
            <td>{new Date(a.due_at).toLocaleDateString()}</td>
            <td><span className="badge" style={{ background: a.status === 'breached' ? 'var(--danger)' : 'var(--border)', color: a.status === 'breached' ? '#fff' : undefined }}>{a.status}</span></td>
            <td>{a.status !== 'closed' && <button className="btn btn-primary" onClick={() => close(a)}>Close</button>}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
