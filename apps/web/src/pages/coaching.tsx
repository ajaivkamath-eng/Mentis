import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { cycleAttendance, createRegister, markAllPresent, undoLast, dedupeQueue, type AttendanceRecord } from '@mentis/core';
import { Phone, Undo2, CheckCheck, Plus, Star } from 'lucide-react';

/* ---------- Today: coach daily loop ---------- */
export function Today() {
  const { staff } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  useEffect(() => {
    if (!staff) return;
    const day = new Date().toISOString().slice(0, 10);
    supabase.from('sessions').select('id,name,start_at,end_at,venue_id,status,venues(name)')
      .gte('start_at', `${day}T00:00:00Z`).lte('start_at', `${day}T23:59:59Z`).order('start_at').then(({ data }) => setSessions(data ?? []));
    supabase.from('tasks').select('id,title,due_at,status').eq('assignee_id', staff.id).neq('status', 'done').then(({ data }) => setTasks(data ?? []));
  }, [staff]);
  return (
    <div>
      <PageTitle title="Today" sub="Your sessions, tasks and reminders" />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="font-bold mb-2">Sessions</h2>
          {sessions.length === 0 && <p className="text-sm" style={{ color: 'var(--muted)' }}>No sessions today.</p>}
          {sessions.map((s) => (
            <Link key={s.id} to={`/register/${s.id}`} className="flex justify-between items-center py-2 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
              <div><div className="font-semibold">{s.name}</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>{new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {s.venues?.name} · {s.status}</div></div>
              <span className="btn btn-ghost">Register</span>
            </Link>
          ))}
        </div>
        <div className="card p-4">
          <h2 className="font-bold mb-2">Open tasks</h2>
          {tasks.map((t) => <div key={t.id} className="py-1 text-sm">• {t.title} <span style={{ color: 'var(--muted)' }}>({t.status})</span></div>)}
          {tasks.length === 0 && <p className="text-sm" style={{ color: 'var(--muted)' }}>All clear.</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Register: the crown jewel (sub-60s marking) ---------- */
interface Row { enrollmentId: string; memberId: string; name: string; level?: string; customer?: string; phone?: string; alert: boolean; taster?: boolean; tasterId?: string }

export function Register() {
  const { id } = useParams();
  const { staff, canDo } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState(() => createRegister());
  const [filter, setFilter] = useState<'all' | 'alert' | 'taster' | 'unmarked'>('all');
  const [alertFor, setAlertFor] = useState<string | null>(null);
  const [medical, setMedical] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState('');
  const [sessionName, setSessionName] = useState('');

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.from('sessions').select('name').eq('id', id).single();
      setSessionName(session?.name ?? '');
      const { data: enroll } = await supabase.from('enrollments')
        .select('id,member_id,status,members(id,name,special_needs_flag,customers(name,phone))')
        .eq('session_id', id).in('status', ['active', 'invited']).eq('expected', true);
      const list: Row[] = (enroll ?? []).map((e: any) => ({
        enrollmentId: e.id, memberId: e.member_id, name: e.members?.name ?? '—',
        customer: e.members?.customers?.name, phone: e.members?.customers?.phone,
        alert: !!e.members?.special_needs_flag,
      }));
      const { data: tasters } = await supabase.from('prospects').select('id,name').eq('status', 'approved');
      for (const t of (tasters ?? []).filter((t: any) => true)) {
        list.push({ enrollmentId: `t-${t.id}`, memberId: '', name: t.name, alert: false, taster: true, tasterId: t.id });
      }
      setRows(list);
      const records: AttendanceRecord[] = list.map((r) => ({
        id: r.enrollmentId, sessionInstanceId: id ?? '', memberId: r.memberId || undefined,
        tasterId: r.tasterId, status: 'absent', recordedAt: new Date().toISOString(),
        recordedBy: staff?.id ?? '', offline: !navigator.onLine,
      }));
      setState(createRegister(records));
    })();
  }, [id, staff?.id]);

  const marked = useMemo(() => Object.values(state.records).filter((r) => r.status === 'present' || r.recordedBy).length, [state]);
  const visible = rows.filter((r) => {
    const rec = state.records[r.enrollmentId];
    if (filter === 'alert') return r.alert;
    if (filter === 'taster') return r.taster;
    if (filter === 'unmarked') return rec?.status === 'absent';
    return true;
  });

  const openAlert = async (memberId: string) => {
    setAlertFor(memberId);
    if (!medical[memberId]) {
      const { data } = await supabase.from('member_medical').select('notes').eq('member_id', memberId).single();
      if (data) setMedical((m) => ({ ...m, [memberId]: data.notes }));
      await supabase.from('audit_log').insert({
        organization_id: staff?.organization_id, actor_id: staff?.user_id,
        action: 'medical.read', entity: 'member_medical', entity_id: memberId,
      });
    }
  };

  const save = async () => {
    const ops = dedupeQueue(state.queue);
    for (const op of ops) {
      await supabase.from('attendance_records').upsert({
        session_id: id, member_id: op.record.memberId || null,
        taster_name: op.record.tasterId ? rows.find((r) => r.tasterId === op.record.tasterId)?.name : null,
        status: op.record.status, recorded_by: staff?.user_id, offline: op.record.offline,
      }, { onConflict: 'id' });
    }
    setSaved(`${ops.length} records synced`);
  };

  if (!canDo('attendance.mark') && !canDo('attendance.view')) return <div className="p-8">No register access.</div>;
  return (
    <div>
      <PageTitle title={sessionName || 'Register'} sub={`${marked}/${rows.length} marked`} right={
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => setState((s) => undoLast(s))}><Undo2 size={16} /> Undo</button>
          <button className="btn btn-ghost" onClick={() => setState((s) => markAllPresent(s, rows.map((r) => r.enrollmentId)))}><CheckCheck size={16} /> All present</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      } />
      {saved && <div className="card p-2 mb-2 text-sm">{saved}</div>}
      <div className="flex gap-2 mb-3">
        {(['all', 'alert', 'taster', 'unmarked'] as const).map((f) => (
          <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f)}>{f === 'alert' ? '⚠️' : f}</button>
        ))}
      </div>
      <div className="card divide-y" style={{ ['--tw-divide-opacity' as string]: 1 }}>
        {visible.map((r) => {
          const rec = state.records[r.enrollmentId];
          const present = rec?.status === 'present';
          return (
            <div key={r.enrollmentId}>
              <button
                className="w-full flex items-center gap-3 p-3 text-left"
                style={{ background: present ? 'rgba(22,163,74,.12)' : undefined, minHeight: 56 }}
                onClick={() => canDo('attendance.mark') && setState((s) => cycleAttendance(s, r.enrollmentId))}
              >
                <span className="font-bold text-lg w-8">{present ? '✓' : '○'}</span>
                <span className="flex-1">
                  <span className="font-semibold">{r.name}</span>
                  {r.taster && <span className="badge ml-2" style={{ background: 'var(--mentis-gold)', color: '#000' }}>Taster</span>}
                  {r.alert && <span className="badge ml-2" style={{ background: 'var(--red)', color: '#fff' }}>⚠️</span>}
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>{r.customer} {r.phone && `· ${r.phone}`}</div>
                </span>
                {r.alert && <span className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); openAlert(r.memberId); }}>Alert</span>}
                {r.phone && <a href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()} className="btn btn-ghost"><Phone size={16} /></a>}
              </button>
              {alertFor === r.memberId && (
                <div className="p-3 text-sm" style={{ background: 'rgba(220,38,38,.08)' }}>
                  <strong>Medical / special needs:</strong> {medical[r.memberId] ?? 'Loading… (access audit-logged)'}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <Link className="btn btn-ghost" to={`/feedback/session/${id}`}><Star size={16} /> Record feedback</Link>
        <button className="btn btn-ghost"><Plus size={16} /> Add ad-hoc member</button>
      </div>
    </div>
  );
}

/* ---------- PlayerFeedback with 1–10 attribute ratings ---------- */
export function Feedback() {
  const { source, id } = useParams();
  const { staff } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [memberId, setMemberId] = useState('');
  const [text, setText] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({ 'skill:forehand': 5 });
  const [done, setDone] = useState('');
  useEffect(() => {
    supabase.from('enrollments').select('member_id,members(id,name)').eq('session_id', id).then(({ data }) =>
      setMembers((data ?? []).map((e: any) => e.members)));
  }, [id]);
  const submit = async () => {
    if (!memberId) { setDone('Pick a member first.'); return; }
    await supabase.from('player_feedback').insert({
      organization_id: staff?.organization_id, member_id: memberId, coach_id: staff?.id,
      body: text, source_type: source, session_id: source === 'session' ? id : null,
      event_id: source === 'event' ? id : null, ratings,
    });
    setDone('Feedback saved.');
  };
  return (
    <div>
      <PageTitle title="Player feedback" sub={`${source}: ${id}`} />
      <div className="card p-4 flex flex-col gap-3" style={{ maxWidth: 640 }}>
        <select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Select member…</option>
          {members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <textarea className="input" rows={4} placeholder="Coaching note…" value={text} onChange={(e) => setText(e.target.value)} />
        {Object.entries(ratings).map(([k, v]) => (
          <label key={k} className="flex items-center gap-3 text-sm">{k}
            <input type="range" min={1} max={10} value={v} onChange={(e) => setRatings((r) => ({ ...r, [k]: Number(e.target.value) }))} />
            <strong>{v}</strong>
          </label>
        ))}
        <button className="btn btn-primary" onClick={submit}>Save feedback</button>
        {done && <p className="text-sm">{done}</p>}
      </div>
    </div>
  );
}
