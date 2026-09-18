import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { PageTitle } from '../lib/ui';
import { AlertTriangle, Clock, MapPin, ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import { Badge } from '../components/ui/badge';

/* ---------- Enhanced Multi-View Session & Staff Diary ---------- */
export function DiaryCalendar() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const month = selectedDate.slice(0, 7);
  const [sessions, setSessions] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [staffingAssignments, setStaffingAssignments] = useState<any[]>([]);
  const [unavailabilities, setUnavailabilities] = useState<any[]>([]);
  const [pendingActions, setPendingActions] = useState<any[]>([]);
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');

  const loadData = async () => {
    setLoading(true);
    const from = `${month}-01T00:00:00Z`;
    const to = `${month}-31T23:59:59Z`;

    const [sessRes, evRes, holRes, staffRes, staffingRes, unavailRes, actionsRes] = await Promise.all([
      supabase
        .from('mentis_sessions')
        .select(`
          id, name, start_at, end_at, status, venue_id,
          mentis_venues(id, name),
          responsible_coach:mentis_staff!sessions_responsible_coach_id_fkey(id, display_name),
          leading_coach:mentis_staff!sessions_leading_coach_id_fkey(id, display_name),
          assisting_coach:mentis_staff!sessions_assisting_coach_id_fkey(id, display_name)
        `)
        .gte('start_at', from)
        .lte('start_at', to)
        .order('start_at'),
      supabase
        .from('mentis_events')
        .select('id, name, starts_on, location')
        .gte('starts_on', `${month}-01`)
        .lte('starts_on', `${month}-31`),
      supabase
        .from('mentis_holiday_calendar')
        .select('*')
        .order('starts_on'),
      supabase
        .from('mentis_staff')
        .select('id, display_name, roles'),
      supabase
        .from('mentis_session_staffing')
        .select('*, mentis_staff(display_name)')
        .gte('planned_start', from)
        .lte('planned_start', to),
      supabase
        .from('mentis_staff_availability')
        .select('*')
        .eq('available', false)
        .gte('starts_at', from)
        .lte('ends_at', `${month}-31T23:59:59Z`),
      supabase
        .from('mentis_pending_actions')
        .select('*, mentis_action_types(name)')
        .eq('status', 'open')
        .order('due_at', { ascending: true })
        .limit(25),
    ]);

    setSessions(sessRes.data ?? []);
    setEvents(evRes.data ?? []);
    setHolidays(holRes.data ?? []);
    setStaffList(staffRes.data ?? []);
    setStaffingAssignments(staffingRes.data ?? []);
    setUnavailabilities(unavailRes.data ?? []);
    setPendingActions(actionsRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [month]);

  // Venue list & distinct colors
  const venues = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    sessions.forEach(s => {
      if (s.mentis_venues?.id) {
        map.set(s.mentis_venues.id, { id: s.mentis_venues.id, name: s.mentis_venues.name });
      }
    });
    return Array.from(map.values());
  }, [sessions]);

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
    const lead = (first.getUTCDay() + 6) % 7;
    const cells: (string | null)[] = Array(lead).fill(null);
    const cursor = new Date(first);
    while (cursor.toISOString().slice(0, 7) === month) {
      cells.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return cells;
  }, [month]);

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

  return (
    <div className="space-y-4">
      {/* Page Title & Navigation Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <PageTitle
            title="Session & Staff Diary"
            sub="Sessions, coach availability, conflicts, and venue legends"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View Switcher */}
          <div className="flex rounded-lg border border-line bg-surface p-1">
            {(['day', 'week', 'month'] as const).map(v => (
              <button
                key={v}
                className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setView(v)}
              >
                {v.toUpperCase()} VIEW
              </button>
            ))}
          </div>

          {/* Date controls */}
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1">
            <button
              onClick={() => shiftDate(view === 'day' ? -1 : view === 'week' ? -7 : -30)}
              className="p-1 hover:text-brand"
              aria-label="Previous window"
            >
              <ChevronLeft className="size-4" />
            </button>
            <input
              type="date"
              className="border-0 bg-transparent text-xs font-semibold focus:outline-none"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
            />
            <button
              onClick={() => shiftDate(view === 'day' ? 1 : view === 'week' ? 7 : 30)}
              className="p-1 hover:text-brand"
              aria-label="Next window"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Staff filter */}
          <select
            className="input text-xs"
            value={selectedStaffFilter}
            onChange={e => setSelectedStaffFilter(e.target.value)}
          >
            <option value="all">All coaches & staff</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>{s.display_name}</option>
            ))}
          </select>
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink-muted flex items-center gap-1">
            <MapPin className="size-3.5" /> Venues:
          </span>
          {venues.map(v => {
            const isSelected = selectedVenues.includes(v.id);
            const color = venueColorMap[v.id] || 'var(--brand)';
            return (
              <button
                key={v.id}
                onClick={() => toggleVenue(v.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                  isSelected ? 'border-brand text-brand bg-brand-soft' : 'border-line text-ink hover:border-brand/40'
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
              className="text-xs text-ink-muted underline hover:text-ink"
            >
              Reset venue filters
            </button>
          )}
        </div>

        {/* Conflict count alert indicator */}
        {sessionConflicts.size > 0 && (
          <div className="flex items-center gap-1.5 rounded-md bg-danger-soft px-2.5 py-1 text-xs font-bold text-danger border border-danger/20">
            <ShieldAlert className="size-4 animate-pulse" />
            <span>{sessionConflicts.size} coach conflict(s) within 30 days</span>
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
        <div className="card overflow-hidden p-0">
          <div className="border-b border-line bg-surface-inset px-4 py-3 flex items-center justify-between">
            <h3 className="font-bold text-sm">
              {new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </h3>
            {isHoliday(selectedDate) && (
              <Badge tone="danger">
                Term Break / Holiday: {isHoliday(selectedDate)?.name}
              </Badge>
            )}
          </div>

          <div className="p-4 space-y-3">
            {filteredSessions.filter(s => s.start_at.slice(0, 10) === selectedDate).length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-muted">
                No sessions scheduled for this date.
              </div>
            ) : (
              filteredSessions
                .filter(s => s.start_at.slice(0, 10) === selectedDate)
                .map(s => {
                  const conflictList = sessionConflicts.get(s.id);
                  const venueColor = venueColorMap[s.venue_id] || 'var(--brand)';
                  const sessionAlerts = pendingActions.filter(action => action.linked_entity_id === s.id);
                  const badgeTone = sessionAlerts.some(a => a.status === 'breached') ? 'danger' : conflictList ? 'warning' : 'success';
                  const badgeLabel = sessionAlerts.some(a => a.status === 'breached')
                    ? 'BREACHED'
                    : conflictList
                      ? 'ACTION REQUIRED'
                      : 'READY';
                  return (
                    <div
                      key={s.id}
                      className={`rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3 ${
                        conflictList || sessionAlerts.length
                          ? 'border-danger bg-danger-soft/30'
                          : 'border-line bg-surface hover:border-brand/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="size-3 rounded-full" style={{ backgroundColor: venueColor }} />
                        <div>
                          <Link to={`/register/${s.id}`} className="font-bold text-sm hover:underline">
                            {s.name}
                          </Link>
                          <div className="text-xs text-ink-muted flex items-center gap-2 mt-0.5">
                            <Clock className="size-3.5 inline" />
                            {new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(s.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            <span>·</span>
                            <MapPin className="size-3.5 inline" />
                            {s.mentis_venues?.name}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={badgeTone as any} size="sm">{badgeLabel}</Badge>
                        {s.responsible_coach && (
                          <span className="rounded-md border border-line bg-surface-inset px-2 py-1 text-xs">
                            Resp: <strong>{s.responsible_coach.display_name}</strong>
                          </span>
                        )}
                        {s.leading_coach && (
                          <span className="rounded-md border border-line bg-surface-inset px-2 py-1 text-xs">
                            Lead: <strong>{s.leading_coach.display_name}</strong>
                          </span>
                        )}
                        {conflictList && (
                          <span className="rounded-md bg-danger px-2 py-1 text-xs font-bold text-white flex items-center gap-1">
                            <AlertTriangle className="size-3.5" />
                            Conflict: {conflictList.map(c => `${c.staffName} (${c.reason})`).join(', ')}
                          </span>
                        )}
                        {sessionAlerts.length > 0 && (
                          <button
                            className="rounded-md border border-warning/40 bg-warning-soft px-2 py-1 text-[10px] font-bold text-warning"
                            onClick={(e) => {
                              e.preventDefault();
                              const latest = sessionAlerts[0];
                              if (latest) void resolveAction(latest.id);
                            }}
                          >
                            {sessionAlerts.length} follow-up{sessionAlerts.length > 1 ? 's' : ''}
                          </button>
                        )}
                        <Link to={`/register/${s.id}`} className="btn btn-ghost btn-sm text-xs">
                          Open register
                        </Link>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      ) : view === 'week' ? (
        /* WEEK VIEW */
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map(dateStr => {
            const dayObj = new Date(dateStr);
            const isToday = new Date().toISOString().slice(0, 10) === dateStr;
            const hol = isHoliday(dateStr);
            const daySessions = filteredSessions.filter(s => s.start_at.slice(0, 10) === dateStr);

            return (
              <div
                key={dateStr}
                className={`card p-2 flex flex-col min-h-[360px] ${
                  hol ? 'bg-danger-soft/20 border-danger/30' : isToday ? 'ring-2 ring-brand' : ''
                }`}
              >
                <div className="border-b border-line pb-1 mb-2 text-center">
                  <div className="text-xs font-bold text-ink-muted">
                    {dayObj.toLocaleDateString('en-GB', { weekday: 'short' })}
                  </div>
                  <div className="text-sm font-extrabold">{dayObj.getDate()}</div>
                  {hol && (
                    <div className="mt-1 rounded bg-danger px-1 py-0.5 text-[10px] font-bold text-white truncate" title={hol.name}>
                      {hol.name}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 flex-1 overflow-auto">
                  {daySessions.map(s => {
                    const conflictList = sessionConflicts.get(s.id);
                    const venueColor = venueColorMap[s.venue_id] || 'var(--brand)';
                    return (
                      <Link
                        key={s.id}
                        to={`/register/${s.id}`}
                        className={`block rounded border p-1.5 text-xs transition-shadow hover:shadow ${
                          conflictList
                            ? 'border-danger bg-danger-soft text-danger font-semibold'
                            : 'border-line bg-surface text-ink'
                        }`}
                        title={`${s.name} (${s.mentis_venues?.name})`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold tabular-nums">
                            {new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="size-2 rounded-full" style={{ backgroundColor: venueColor }} />
                        </div>
                        <div className="font-semibold truncate mt-0.5">{s.name}</div>
                        {conflictList && (
                          <div className="mt-1 text-[10px] font-bold text-danger flex items-center gap-0.5">
                            <AlertTriangle className="size-3" /> Coach Conflict
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* MONTH VIEW */
        <div className="card p-2">
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-ink-muted mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} className="p-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {monthGridDays.map((dateStr, i) => {
              if (!dateStr) {
                return <div key={`empty-${i}`} className="min-h-[100px] rounded border border-transparent bg-surface-inset/20" />;
              }
              const hol = isHoliday(dateStr);
              const daySessions = filteredSessions.filter(s => s.start_at.slice(0, 10) === dateStr);
              const dayEvents = events.filter(e => e.starts_on === dateStr);
              const isToday = new Date().toISOString().slice(0, 10) === dateStr;

              return (
                <div
                  key={dateStr}
                  className={`min-h-[110px] rounded border p-1.5 text-xs transition-colors ${
                    hol
                      ? 'border-danger/40 bg-danger-soft/20'
                      : isToday
                      ? 'border-brand bg-brand-soft/20 ring-1 ring-brand'
                      : 'border-line bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{dateStr.slice(8)}</span>
                    {hol && (
                      <span className="text-[9px] font-bold text-danger truncate max-w-[65px]" title={hol.name}>
                        {hol.name}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 space-y-1">
                    {daySessions.map(s => {
                      const conflictList = sessionConflicts.get(s.id);
                      const venueColor = venueColorMap[s.venue_id] || 'var(--brand)';
                      return (
                        <Link
                          key={s.id}
                          to={`/register/${s.id}`}
                          className={`block truncate rounded px-1 py-0.5 text-[11px] font-medium ${
                            conflictList
                              ? 'bg-danger text-white'
                              : 'bg-surface-inset hover:bg-surface-hover text-ink'
                          }`}
                          title={`${s.name} · ${new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                        >
                          <span className="mr-1 inline-block size-1.5 rounded-full" style={{ backgroundColor: venueColor }} />
                          {new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {s.name}
                        </Link>
                      );
                    })}
                    {dayEvents.map(e => (
                      <div key={e.id} className="text-[11px] truncate text-warning font-semibold">
                        🏆 {e.name}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

