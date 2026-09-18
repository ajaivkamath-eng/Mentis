import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { AlertTriangle, Calendar, Clock, UserCheck, UserX, ShieldAlert, Sparkles, Filter } from 'lucide-react';
import { Badge } from '../components/ui/badge';

const availabilityLabels: Record<string, string> = {
  available: 'Available',
  on_duty: 'On duty',
  holiday: 'Holiday / annual leave',
  duty_outside_club: 'Duty outside club',
  unavailable_other: 'Other unavailable',
};

const formatAvailabilityLabel = (value?: string | null) => availabilityLabels[value ?? ''] ?? 'Unavailable';

/* ---------- Coach & Sparrer Personal Diary & Availability Matrix ---------- */
export function Availability() {
  const { staff, canDo } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [assignedSessions, setAssignedSessions] = useState<any[]>([]);
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
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
        .limit(100),
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

  const save = async () => {
    if (!form.staff_id || !form.starts_at || !form.ends_at) {
      alert('Staff + start + end required.');
      return;
    }
    if (form.staff_id !== staff?.id && !canDo('availability.recordForOthers') && !canDo('availability.recordAll')) {
      alert('Only coordinators/admins can record on behalf of other staff.');
      return;
    }

    const { error } = await supabase.from('mentis_staff_availability').insert({
      organization_id: staff?.organization_id,
      staff_id: form.staff_id,
      starts_at: form.starts_at,
      ends_at: form.ends_at,
      available: form.available,
      availability_type: form.availability_type,
      reason: form.reason || null,
      recorded_by: staff?.user_id,
    });

    if (error) {
      alert(`Error recording availability: ${error.message}`);
      return;
    }

    // Check if newly recorded unavailability clashes with any assigned session within 30 days
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
        // Record pending action alert
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

    setForm({ ...form, reason: '', starts_at: '', ends_at: '' });
    load();
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

  return (
    <div className="space-y-4">
      <PageTitle
        title="Coach Personal Diary & Availability Planner"
        sub="Personal holiday plans, on-duty windows, outside club commitments, and session busy tracking"
      />

      {/* Record Availability / Holiday Card */}
      <div className="card p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-3 flex items-center gap-1.5">
          <Calendar className="size-4 text-brand" /> Add availability window or holiday plan
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end">
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Staff / Coach</label>
            <select
              className="input w-full text-xs"
              value={form.staff_id}
              onChange={e => setForm({ ...form, staff_id: e.target.value })}
            >
              {staffList.map(s => (
                <option key={s.id} value={s.id}>
                  {s.display_name} {s.id === staff?.id ? '(me)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Availability Status</label>
            <select
              className="input w-full text-xs"
              value={String(form.available)}
              onChange={e => setForm({ ...form, available: e.target.value === 'true' })}
            >
              <option value="false">⛔ Unavailable / Leave</option>
              <option value="true">✅ Available for Coaching</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Category</label>
            <select
              className="input w-full text-xs"
              value={form.availability_type}
              onChange={e => setForm({ ...form, availability_type: e.target.value })}
            >
              <option value="holiday">Holiday / Annual Leave</option>
              <option value="on_duty">On Duty (Club)</option>
              <option value="duty_outside_club">Duty Outside Club / Tournament</option>
              <option value="available">Open for Private/Session</option>
              <option value="unavailable_other">Other / Personal</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">From</label>
            <input
              type="datetime-local"
              className="input w-full text-xs"
              value={form.starts_at}
              onChange={e => setForm({ ...form, starts_at: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">To</label>
            <input
              type="datetime-local"
              className="input w-full text-xs"
              value={form.ends_at}
              onChange={e => setForm({ ...form, ends_at: e.target.value })}
            />
          </div>

          <div>
            <button className="btn btn-primary w-full text-xs" onClick={save}>
              Record in Diary
            </button>
          </div>
        </div>

        <div className="mt-3">
          <input
            className="input w-full text-xs"
            placeholder="Reason or notes (e.g., Summer Holiday abroad, National Championship Duty, Doctor appointment)…"
            value={form.reason}
            onChange={e => setForm({ ...form, reason: e.target.value })}
          />
        </div>
      </div>

      {/* Staff Filter Bar */}
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

      {conflictWatch.length > 0 && (
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
      )}

      {/* Two Column Layout: Sessions Allocated & Diary Unavailability / Holiday Entries */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Allocated Coaching Sessions */}
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

        {/* Holiday & Unavailability Log */}
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
                  {r.reason && (
                    <div className="mt-1 text-ink-faint italic">
                      "{r.reason}"
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

