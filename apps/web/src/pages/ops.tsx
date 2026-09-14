import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, functionsUrl } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { rollupColour, type StaffingColour } from '@mentis/core';

/* ---------- Sessions + cancellation/postponement ---------- */
export function Sessions() {
  const { staff, canDo } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const load = () => supabase.from('sessions').select('id,name,start_at,end_at,status,venues(name)').order('start_at', { ascending: false }).limit(50).then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const cancel = async (s: any) => {
    const reason = prompt('Cancellation reason (required):');
    if (!reason?.trim()) return;
    await supabase.from('sessions').update({ status: 'cancelled', cancel_reason: reason }).eq('id', s.id);
    const { data: enroll } = await supabase.from('enrollments').select('member_id,members(customers(email))').eq('session_id', s.id);
    for (const e of enroll ?? []) {
      const email = (e as any).members?.customers?.email;
      if (email) await fetch(functionsUrl('send-email'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: staff?.organization_id, to: email, subject: `Session cancelled: ${s.name}`, body: `${s.name} is cancelled (${reason}).`, template: 'cancellation', kind: 'alert' }) });
    }
    const { data: staffing } = await supabase.from('session_staffing').select('staff_id,planned_start,planned_end,rate_card_id,rate_cards(rate_cents)').eq('session_id', s.id);
    for (const st of staffing ?? []) {
      await supabase.from('staff_time_entries').insert({
        organization_id: staff?.organization_id, staff_id: st.staff_id, session_id: s.id, kind: 'standby',
        starts_at: st.planned_start, ends_at: st.planned_end, rate_cents: (st as any).rate_cards?.rate_cents ?? 0,
      });
    }
    load();
  };
  return (
    <div>
      <PageTitle title="Sessions" sub="Lifecycle: scheduled → completed · cancel / postpone" />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Session</th><th>When</th><th>Venue</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.map((s) => (
          <tr key={s.id}><td><Link to={`/register/${s.id}`} className="font-semibold">{s.name}</Link></td>
            <td>{new Date(s.start_at).toLocaleString()}</td><td>{s.venues?.name}</td>
            <td><span className="badge" style={{ background: 'var(--line)' }}>{s.status}</span></td>
            <td>{canDo('sessions.manage') && s.status === 'scheduled' && <button className="btn btn-ghost" onClick={() => cancel(s)}>Cancel</button>}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Staffing diary: colour-coded, worst-wins roll-up ---------- */
export function StaffingDiary() {
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState<Record<string, StaffingColour>>({});
  useEffect(() => {
    const from = new Date().toISOString();
    supabase.from('sessions').select('id,name,start_at,venues(name)').gte('start_at', from).order('start_at').limit(60).then(async ({ data }) => {
      setRows(data ?? []);
      const { data: st } = await supabase.from('session_staffing_status').select('*');
      setStatus(Object.fromEntries((st ?? []).map((r: any) => [r.session_id, r.colour])));
    });
  }, []);
  const byDay = new Map<string, any[]>();
  for (const s of rows) {
    const d = new Date(s.start_at).toLocaleDateString();
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  const colourOf = (c?: StaffingColour) => c === 'RED' ? 'var(--red)' : c === 'AMBER' ? 'var(--amber)' : 'var(--green)';
  return (
    <div>
      <PageTitle title="Manager diary" sub="🟢 staffed · 🟡 sparrers short · 🔴 coaches short (worst-wins roll-up)" />
      {[...byDay.entries()].map(([day, list]) => {
        const dayColour = rollupColour(list.map((s) => status[s.id] ?? 'GREEN'));
        return (
          <div key={day} className="card p-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="badge" style={{ background: colourOf(dayColour), color: '#fff' }}>●</span>
              <strong>{day}</strong>
            </div>
            {list.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm py-1">
                <span className="badge" style={{ background: colourOf(status[s.id]), color: '#fff' }}>●</span>
                {new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {s.name} · {s.venues?.name}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Scheduling: weekly generator, holidays, overrides ---------- */
export function Scheduling() {
  const { staff, canDo } = useAuth();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', venue_id: '', day_of_week: 2, valid_from: '', valid_to: '', start_time: '18:00', end_time: '19:00' });
  const load = () => {
    supabase.from('weekly_schedules').select('*,venues(name)').then(({ data }) => setSchedules(data ?? []));
    supabase.from('holiday_calendar').select('*').order('starts_on').then(({ data }) => setHolidays(data ?? []));
    supabase.from('venues').select('id,name').then(({ data }) => setVenues(data ?? []));
  };
  useEffect(() => { load(); }, []);
  const create = async () => {
    const { error } = await supabase.from('weekly_schedules').insert({ organization_id: staff?.organization_id, ...form });
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
        const { error } = await supabase.from('sessions').insert({
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
      <PageTitle title="Scheduling" sub="Weekly patterns → instances · holidays · overrides" />
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
          {schedules.map((s: any) => <div key={s.id} className="flex justify-between py-1 text-sm"><span>{s.name} · {s.venues?.name} · {s.valid_from}→{s.valid_to}</span><button className="btn btn-ghost" onClick={() => generate(s)}>Generate</button></div>)}
        </div>
        <div className="card p-4"><h3 className="font-bold mb-2">Holiday calendar</h3>
          {holidays.map((h: any) => <div key={h.id} className="text-sm py-1">• {h.name} <em>({h.kind})</em> {h.starts_on}→{h.ends_on}</div>)}
        </div>
      </div>
    </div>
  );
}

/* ---------- Tasks (+ approval separation) ---------- */
export function Tasks() {
  const { staff, canDo } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const load = () => supabase.from('tasks').select('*').order('due_at').limit(100).then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const create = async () => {
    if (!title.trim()) return;
    await supabase.from('tasks').insert({ organization_id: staff?.organization_id, title, task_type: 'other', assignee_id: staff?.id, created_by: staff?.user_id });
    setTitle(''); load();
  };
  const approve = async (t: any) => {
    await supabase.from('tasks').update({ approved_at: new Date().toISOString(), approved_by: staff?.user_id }).eq('id', t.id);
    load();
  };
  const done = async (t: any) => {
    await supabase.from('tasks').update({ status: 'done' }).eq('id', t.id);
    load();
  };
  return (
    <div>
      <PageTitle title="Tasks" sub="Billable only after manager/admin TASK approval (separate from invoice approval)" />
      <div className="flex gap-2 mb-3">
        <input className="input" placeholder="New task…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn btn-primary" onClick={create}>Create</button>
      </div>
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Title</th><th>Status</th><th>Approved</th><th></th></tr></thead>
        <tbody>{rows.map((t: any) => (
          <tr key={t.id}><td className="font-semibold">{t.title}</td><td>{t.status}</td><td>{t.approved_at ? '✓' : '—'}</td>
            <td className="flex gap-2">
              {t.status !== 'done' && <button className="btn btn-ghost" onClick={() => done(t)}>Done</button>}
              {canDo('tasks.approve') && !t.approved_at && <button className="btn btn-primary" onClick={() => approve(t)}>Approve</button>}
            </td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Admin inbox: pending actions ---------- */
export function Inbox() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState('open');
  const load = () => supabase.from('pending_actions').select('*,action_types(name)').order('due_at').limit(100).then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const close = async (a: any) => {
    await supabase.from('pending_actions').update({ status: 'closed' }).eq('id', a.id);
    load();
  };
  const visible = rows.filter((r: any) => filter === 'all' || r.status === filter);
  return (
    <div>
      <PageTitle title="Inbox" sub="Pending actions queue" right={
        <select className="input" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="open">Open</option><option value="breached">Breached</option><option value="closed">Closed</option><option value="all">All</option>
        </select>
      } />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Action</th><th>Type</th><th>Due</th><th>Status</th><th></th></tr></thead>
        <tbody>{visible.map((a: any) => (
          <tr key={a.id}><td className="font-semibold">{a.title}</td><td>{a.action_types?.name}</td>
            <td>{new Date(a.due_at).toLocaleDateString()}</td>
            <td><span className="badge" style={{ background: a.status === 'breached' ? 'var(--red)' : 'var(--line)', color: a.status === 'breached' ? '#fff' : undefined }}>{a.status}</span></td>
            <td>{a.status !== 'closed' && <button className="btn btn-primary" onClick={() => close(a)}>Close</button>}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
