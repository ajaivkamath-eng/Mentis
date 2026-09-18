import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';

/* ---------- Session staffing: assign + availability/overlap guards ---------- */
export function Staffing() {
  const { staff } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [form, setForm] = useState({
    staff_id: '',
    capacity: 'assistant',
    rate_card_id: '',
    planned_start: '',
    planned_end: '',
  });
  const [msg, setMsg] = useState('');
  useEffect(() => {
    supabase.from('mentis_sessions').select('id,name,start_at,end_at,status').order('start_at', { ascending: false }).limit(30).then(({ data }) => setSessions(data ?? []));
    supabase.from('mentis_staff').select('id,display_name').then(({ data }) => setStaffList(data ?? []));
    supabase.from('mentis_rate_cards').select('id,label,rate_cents,staff_id').then(({ data }) => setRates(data ?? []));
  }, []);
  const load = () => {
    if (!sessionId) return;
    supabase.from('mentis_session_staffing').select('*,mentis_staff(display_name),mentis_rate_cards(label,rate_cents)').eq('session_id', sessionId).then(({ data }) => setRows(data ?? []));
  };
  useEffect(() => {
    load();
    const curr = sessions.find((s: any) => s.id === sessionId);
    if (curr) {
      setForm(f => ({
        ...f,
        planned_start: curr.start_at.slice(0, 16),
        planned_end: curr.end_at.slice(0, 16),
      }));
    }
  }, [sessionId]);
  const session = sessions.find((s: any) => s.id === sessionId);
  const selectedRate = rates.find((r: any) => r.id === form.rate_card_id);
  const plannedHours = session && form.planned_start && form.planned_end
    ? Math.max(0, (new Date(form.planned_end).getTime() - new Date(form.planned_start).getTime()) / 3_600_000)
    : session ? (new Date(session.end_at).getTime() - new Date(session.start_at).getTime()) / 3_600_000 : 0;
  const assign = async () => {
    setMsg('');
    if (!sessionId || !form.staff_id || !form.rate_card_id) { setMsg('Pick session, staff and rate card.'); return; }
    const pStart = form.planned_start ? new Date(form.planned_start).toISOString() : session.start_at;
    const pEnd = form.planned_end ? new Date(form.planned_end).toISOString() : session.end_at;

    const { data: un } = await supabase.from('mentis_staff_availability').select('id, starts_at, ends_at, reason, availability_type').eq('staff_id', form.staff_id).eq('available', false)
      .lt('starts_at', pEnd).gt('ends_at', pStart);

    const { error } = await supabase.from('mentis_session_staffing').insert({
      session_id: sessionId,
      staff_id: form.staff_id,
      capacity: form.capacity,
      rate_card_id: form.rate_card_id,
      planned_start: pStart,
      planned_end: pEnd,
    });

    if (!error && un?.length) {
      const { data: actionType } = await supabase
        .from('mentis_action_types')
        .select('id')
        .eq('organization_id', staff?.organization_id)
        .eq('name', 'confirm staffing')
        .limit(1);

      if (actionType?.[0]) {
        const { data: existing } = await supabase
          .from('mentis_pending_actions')
          .select('id')
          .eq('organization_id', staff?.organization_id)
          .eq('linked_entity_type', 'session')
          .eq('linked_entity_id', sessionId)
          .eq('assignee_id', form.staff_id)
          .eq('status', 'open')
          .limit(1);

        if (!existing?.length) {
          const conflict = un[0];
          const dueAt = new Date(pStart).toISOString();
          const breachAt = new Date(new Date(pStart).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          await supabase.from('mentis_pending_actions').insert({
            organization_id: staff?.organization_id,
            action_type_id: actionType[0].id,
            title: `Staffing confirmation required: ${session?.name ?? 'session'} overlaps unavailable window`,
            assignee_id: form.staff_id,
            linked_entity_type: 'session',
            linked_entity_id: sessionId,
            due_at: dueAt,
            breach_at: breachAt,
            status: 'open',
          });

          if (conflict.reason || conflict.availability_type) {
            setMsg(`Warning: staff has a recorded unavailable window (${conflict.reason || conflict.availability_type}); a staffing confirmation alert was created.`);
          }
        }
      }
    }

    if (!error) {
      setMsg(un?.length ? 'Assigned. Unavailability conflict recorded and a follow-up alert created.' : 'Assigned.');
    } else {
      setMsg(`Blocked: ${error.message}`);
    }
    load();
  };
  const remove = async (id: string) => {
    await supabase.from('mentis_session_staffing').delete().eq('id', id);
    load();
  };
  return (
    <div>
      <PageTitle title="Staffing" sub="Assign coaches per session (split hours supported, overlap guarded, rule 21)" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
        <select className="input" style={{ width: 240 }} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          <option value="">Session…</option>{sessions.map((s: any) => <option key={s.id} value={s.id}>{s.name} — {new Date(s.start_at).toLocaleString()}</option>)}
        </select>
        <select className="input" style={{ width: 170 }} value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>
          <option value="">Staff…</option>{staffList.map((s: any) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
        </select>
        <select className="input" style={{ width: 130 }} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })}>
          <option value="lead">Lead</option><option value="assistant">Assistant</option><option value="sparrer">Sparrer</option>
        </select>
        <select className="input" style={{ width: 190 }} value={form.rate_card_id} onChange={(e) => setForm({ ...form, rate_card_id: e.target.value })}>
          <option value="">Rate…</option>{rates.filter((r: any) => !form.staff_id || r.staff_id === form.staff_id).map((r: any) => <option key={r.id} value={r.id}>{r.label} £{(r.rate_cents / 100).toFixed(2)}/h</option>)}
        </select>
        <label className="text-xs">From <input type="datetime-local" className="input" value={form.planned_start} onChange={e => setForm({ ...form, planned_start: e.target.value })} /></label>
        <label className="text-xs">To <input type="datetime-local" className="input" value={form.planned_end} onChange={e => setForm({ ...form, planned_end: e.target.value })} /></label>
        <button className="btn btn-primary" onClick={assign}>Assign</button>
        {msg && <span className="text-sm font-semibold text-danger">{msg}</span>}
      </div>

      {selectedRate && (
        <div className="card p-3 mb-4 text-sm">
          Selected rate card: <span className="font-bold">{selectedRate.label}</span> · £{((selectedRate.rate_cents ?? 0) / 100).toFixed(2)}/h · projected cost: £{(((selectedRate.rate_cents ?? 0) / 100) * plannedHours).toFixed(2)}
        </div>
      )}

      <div className="card p-2"><table className="grid">
        <thead><tr><th>Staff</th><th>Capacity</th><th>Planned</th><th>Rate</th><th></th></tr></thead>
        <tbody>{rows.map((r: any) => {
          const rate = r.mentis_rate_cards ?? r.rate_cards;
          const hours = Math.max(0, (new Date(r.planned_end).getTime() - new Date(r.planned_start).getTime()) / 3_600_000);
          return (
            <tr key={r.id}><td className="font-semibold">{r.mentis_staff?.display_name}</td><td>{r.capacity}</td>
              <td>{new Date(r.planned_start).toLocaleString()} → {new Date(r.planned_end).toLocaleTimeString()}</td>
              <td>{rate?.label ?? 'No card'} £{((rate?.rate_cents ?? 0) / 100).toFixed(2)}/h · est £{(((rate?.rate_cents ?? 0) / 100) * hours).toFixed(2)}</td>
              <td><button className="btn btn-ghost" onClick={() => remove(r.id)}>Remove</button></td></tr>
          );
        })}</tbody>
      </table></div>
      <p className="text-xs mt-2" style={{ color: 'var(--ink-muted)' }}>Org: {staff?.organization_id}</p>
    </div>
  );
}

/* ---------- Session close-out: actuals → pay-ready time entries ---------- */
export function SessionClose() {
  const { staff } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [actuals, setActuals] = useState<Record<string, { starts_at: string; ends_at: string }>>({});
  const [done, setDone] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    supabase.from('mentis_sessions').select('id,name,start_at,end_at,status').eq('status', 'scheduled').order('start_at', { ascending: false }).limit(30).then(({ data }) => setSessions(data ?? []));
  }, []);
  const load = async () => {
    if (!sessionId) return;
    const { data } = await supabase.from('mentis_session_staffing').select('*,mentis_staff(display_name),mentis_rate_cards(rate_cents)').eq('session_id', sessionId);
    setRows(data ?? []);
    const { data: entries } = await supabase.from('mentis_staff_time_entries').select('staff_id').eq('session_id', sessionId).eq('kind', 'actual');
    setDone((entries ?? []).map((e: any) => e.staff_id));
    const init: Record<string, { starts_at: string; ends_at: string }> = {};
    for (const r of data ?? []) init[r.id] = { starts_at: r.planned_start.slice(0, 16), ends_at: r.planned_end.slice(0, 16) };
    setActuals(init);
  };
  useEffect(() => { load(); }, [sessionId]);
  const saveActual = async (r: any) => {
    const a = actuals[r.id];
    if (!a?.starts_at || !a?.ends_at) { setMsg('Enter actual start/end.'); return; }
    const { error } = await supabase.from('mentis_staff_time_entries').insert({
      organization_id: staff?.organization_id, staff_id: r.staff_id, session_id: sessionId, kind: 'actual',
      starts_at: new Date(a.starts_at).toISOString(), ends_at: new Date(a.ends_at).toISOString(),
      rate_cents: r.rate_cards?.rate_cents ?? 0,
    });
    setMsg(error ? error.message : `Actual saved for ${r.mentis_staff?.display_name}.`);
    load();
  };
  const complete = async () => {
    if (rows.length && !rows.every((r: any) => done.includes(r.staff_id))) { setMsg('Log actuals for all staff first (or remove them).'); return; }
    await supabase.from('mentis_sessions').update({ status: 'completed' }).eq('id', sessionId);
    setMsg('Session completed.');
  };
  return (
    <div>
      <PageTitle title="Session close-out" sub="Actuals → pay-ready time entries → completed" />
      <div className="card p-4 mb-4 flex gap-2 items-end">
        <select className="input" style={{ width: 280 }} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          <option value="">Session…</option>{sessions.map((s: any) => <option key={s.id} value={s.id}>{s.name} — {new Date(s.start_at).toLocaleString()}</option>)}
        </select>
        <button className="btn btn-primary" onClick={complete}>Mark completed</button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Staff</th><th>Planned</th><th>Actual start</th><th>Actual end</th><th></th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}><td className="font-semibold">{r.mentis_staff?.display_name}{done.includes(r.staff_id) && ' ✓'}</td>
            <td className="text-xs">{new Date(r.planned_start).toLocaleString()} → {new Date(r.planned_end).toLocaleTimeString()}</td>
            <td><input type="datetime-local" className="input" value={actuals[r.id]?.starts_at ?? ''} onChange={(e) => setActuals({ ...actuals, [r.id]: { ...actuals[r.id], starts_at: e.target.value } })} /></td>
            <td><input type="datetime-local" className="input" value={actuals[r.id]?.ends_at ?? ''} onChange={(e) => setActuals({ ...actuals, [r.id]: { ...actuals[r.id], ends_at: e.target.value } })} /></td>
            <td><button className="btn btn-ghost" disabled={done.includes(r.staff_id)} onClick={() => saveActual(r)}>Save actual</button></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
