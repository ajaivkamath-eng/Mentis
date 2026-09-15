import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, functionsUrl } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';

/* ---------- Sessions + cancellation/postponement ---------- */
export function Sessions() {
  const { staff, canDo } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', venue_id: '', start_at: '', end_at: '' });
  const [venues, setVenues] = useState<any[]>([]);
  const load = () => {
    supabase.from('mentis_sessions').select('id,name,start_at,end_at,status,mentis_venues(name)').order('start_at', { ascending: false }).limit(50).then(({ data }) => setRows(data ?? []));
    supabase.from('mentis_venues').select('id,name').then(({ data }) => setVenues(data ?? []));
  };
  useEffect(() => { load(); }, []);
  const notify = async (s: any, subject: string, body: string) => {
    const { data: enroll } = await supabase.from('mentis_enrollments').select('member_id,mentis_members(mentis_customers(email))').eq('session_id', s.id);
    for (const e of enroll ?? []) {
      const email = (e as any).members?.customers?.email;
      if (email) await fetch(functionsUrl('send-email'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: staff?.organization_id, to: email, subject, body, template: 'cancellation', kind: 'alert' }) });
    }
  };
  const cancel = async (s: any) => {
    const reason = prompt('Cancellation reason (required):');
    if (!reason?.trim()) return;
    await supabase.from('mentis_sessions').update({ status: 'cancelled', cancel_reason: reason }).eq('id', s.id);
    await notify(s, `Session cancelled: ${s.name}`, `${s.name} is cancelled (${reason}).`);
    const { data: staffing } = await supabase.from('mentis_session_staffing').select('staff_id,planned_start,planned_end,rate_card_id,mentis_rate_cards(rate_cents)').eq('session_id', s.id);
    for (const st of staffing ?? []) {
      await supabase.from('mentis_staff_time_entries').insert({
        organization_id: staff?.organization_id, staff_id: st.staff_id, session_id: s.id, kind: 'standby',
        starts_at: st.planned_start, ends_at: st.planned_end, rate_cents: (st as any).rate_cards?.rate_cents ?? 0,
      });
    }
    load();
  };
  const postpone = async (s: any) => {
    const v = prompt('New start (YYYY-MM-DDTHH:MM):', s.start_at.slice(0, 16));
    if (!v) return;
    const dur = Date.parse(s.end_at) - Date.parse(s.start_at);
    const start = new Date(v).toISOString();
    const end = new Date(Date.parse(start) + dur).toISOString();
    const { data: hol } = await supabase.from('mentis_holiday_calendar').select('id')
      .lte('starts_on', end.slice(0, 10)).gte('ends_on', start.slice(0, 10));
    if (hol?.length) { alert('New slot falls on a holiday / no-session day (rule 16).'); return; }
    const { error } = await supabase.from('mentis_sessions').update({ start_at: start, end_at: end, status: 'scheduled' }).eq('id', s.id);
    if (error) { alert(`Blocked: ${error.message}`); return; } // rules 17–18 enforced at save
    const delta = Date.parse(start) - Date.parse(s.start_at);
    const { data: st } = await supabase.from('mentis_session_staffing').select('id,planned_start,planned_end').eq('session_id', s.id);
    for (const x of st ?? []) {
      await supabase.from('mentis_session_staffing').update({
        planned_start: new Date(Date.parse(x.planned_start) + delta).toISOString(),
        planned_end: new Date(Date.parse(x.planned_end) + delta).toISOString(),
      }).eq('id', x.id);
    }
    await notify(s, `Session rescheduled: ${s.name}`, `${s.name} moves to ${new Date(start).toLocaleString()}.`);
    load();
  };
  const create = async () => {
    if (!form.name.trim() || !form.venue_id || !form.start_at || !form.end_at) { alert('Name, venue, start, end required.'); return; }
    const { error } = await supabase.from('mentis_sessions').insert({
      organization_id: staff?.organization_id, venue_id: form.venue_id, name: form.name,
      start_at: new Date(form.start_at).toISOString(), end_at: new Date(form.end_at).toISOString(), status: 'scheduled',
    });
    if (error) alert(`Blocked: ${error.message}`);
    else { setForm({ ...form, name: '' }); load(); }
  };
  return (
    <div>
      <PageTitle title="Sessions" sub="Lifecycle: scheduled → completed · cancel / postpone (re-validated, rule 22)" />
      {canDo('sessions.manage') && (
        <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
          <input className="input" style={{ width: 200 }} placeholder="Session name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="input" style={{ width: 170 }} value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })}>
            <option value="">Venue…</option>{venues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <label className="text-sm">Start <input type="datetime-local" className="input" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} /></label>
          <label className="text-sm">End <input type="datetime-local" className="input" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} /></label>
          <button className="btn btn-primary" onClick={create}>Create session</button>
        </div>
      )}
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Session</th><th>When</th><th>Venue</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.map((s) => (
          <tr key={s.id}><td><Link to={`/register/${s.id}`} className="font-semibold">{s.name}</Link></td>
            <td>{new Date(s.start_at).toLocaleString()}</td><td>{s.venues?.name}</td>
            <td><span className="badge" style={{ background: 'var(--line)' }}>{s.status}</span></td>
            <td className="flex gap-2">{canDo('sessions.manage') && s.status === 'scheduled' && (
              <span className="flex gap-2">
                <button className="btn btn-ghost" onClick={() => postpone(s)}>Postpone</button>
                <button className="btn btn-ghost" onClick={() => cancel(s)}>Cancel</button>
              </span>)}</td></tr>
        ))}</tbody>
      </table></div>
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
      <PageTitle title="Scheduling" sub="Weekly patterns → instances · holidays · overrides" right={<Link to="/overrides" className="btn btn-ghost">Overrides</Link>} />
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

/* ---------- Tasks: typed, work log, reminders, recurring, chargeable ---------- */
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
      <PageTitle title="Tasks" sub="Billable only after manager/admin TASK approval (separate from invoice approval)" />
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

/* ---------- Admin inbox: pending actions ---------- */
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
      <PageTitle title="Inbox" sub="Pending actions queue" right={
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
          <tr key={a.id}><td className="font-semibold">{a.title}</td><td>{a.action_types?.name}</td>
            <td>{new Date(a.due_at).toLocaleDateString()}</td>
            <td><span className="badge" style={{ background: a.status === 'breached' ? 'var(--red)' : 'var(--line)', color: a.status === 'breached' ? '#fff' : undefined }}>{a.status}</span></td>
            <td>{a.status !== 'closed' && <button className="btn btn-primary" onClick={() => close(a)}>Close</button>}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
