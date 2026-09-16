import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';

/* ---------- Venues ---------- */
export function Venues() {
  const { staff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', address: '', phone: '', capacity: '', concurrent_session_limit: 1, notes: '' });
  const load = () => supabase.from('mentis_venues').select('*').order('name').then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!form.name.trim()) return;
    await supabase.from('mentis_venues').insert({
      organization_id: staff?.organization_id, name: form.name, address: form.address || null,
      phone: form.phone || null, capacity: form.capacity ? Number(form.capacity) : null,
      concurrent_session_limit: form.concurrent_session_limit, notes: form.notes || null,
    });
    setForm({ ...form, name: '' }); load();
  };
  const remove = async (id: string) => {
    if (!confirm('Delete venue? Sessions must be moved first.')) return;
    const { error } = await supabase.from('mentis_venues').delete().eq('id', id);
    if (error) alert(error.message); else load();
  };
  return (
    <div>
      <PageTitle title="Venues" sub="Concurrency limit defaults to 1 (rule 17)" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
        <input className="input" style={{ width: 200 }} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input" style={{ width: 200 }} placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <input className="input" style={{ width: 140 }} placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <label className="text-sm">Limit <input type="number" min={1} className="input" style={{ width: 70 }} value={form.concurrent_session_limit} onChange={(e) => setForm({ ...form, concurrent_session_limit: Number(e.target.value) })} /></label>
        <button className="btn btn-primary" onClick={save}>Add venue</button>
      </div>
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Name</th><th>Address</th><th>Limit</th><th></th></tr></thead>
        <tbody>{rows.map((v: any) => (
          <tr key={v.id}><td className="font-semibold">{v.name}</td><td>{v.address}</td><td>{v.concurrent_session_limit}</td>
            <td><button className="btn btn-ghost" onClick={() => remove(v.id)}>Delete</button></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Groups ---------- */
export function Groups() {
  const { staff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [venueId, setVenueId] = useState('');
  const load = () => {
    supabase.from('mentis_groups').select('*,mentis_venues(name)').then(({ data }) => setRows(data ?? []));
    supabase.from('mentis_venues').select('id,name').then(({ data }) => setVenues(data ?? []));
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!name.trim()) return;
    await supabase.from('mentis_groups').insert({ organization_id: staff?.organization_id, name, venue_id: venueId || null });
    setName(''); load();
  };
  return (
    <div>
      <PageTitle title="Groups" sub="Venue-scoped cohorts for tasks, reminders, broadcasts" />
      <div className="card p-4 mb-4 flex gap-2">
        <input className="input" style={{ width: 220 }} placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input" style={{ width: 200 }} value={venueId} onChange={(e) => setVenueId(e.target.value)}>
          <option value="">Org-wide</option>{venues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <button className="btn btn-primary" onClick={save}>Add group</button>
      </div>
      <div className="card p-4">{rows.map((g: any) => <div key={g.id} className="py-1 text-sm">• {g.name} <span style={{ color: 'var(--muted)' }}>{g.venues?.name ?? 'org-wide'}</span></div>)}</div>
    </div>
  );
}

/* ---------- Rate cards (multiple per staff; selected per assignment) ---------- */
export function RateCards() {
  const { staff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [form, setForm] = useState({ staff_id: '', label: '', rate: '', valid_from: new Date().toISOString().slice(0, 10) });
  const load = () => {
    supabase.from('mentis_rate_cards').select('*,mentis_staff(display_name)').order('valid_from', { ascending: false }).then(({ data }) => setRows(data ?? []));
    supabase.from('mentis_staff').select('id,display_name').then(({ data }) => setStaffList(data ?? []));
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!form.staff_id || !form.label.trim() || !form.rate) return;
    await supabase.from('mentis_rate_cards').insert({
      organization_id: staff?.organization_id, staff_id: form.staff_id, label: form.label,
      rate_cents: Math.round(Number(form.rate) * 100), valid_from: form.valid_from,
    });
    setForm({ ...form, label: '', rate: '' }); load();
  };
  return (
    <div>
      <PageTitle title="Rate cards" sub="Variable hourly rate per session (rule 20)" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
        <select className="input" style={{ width: 180 }} value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>
          <option value="">Staff…</option>{staffList.map((s: any) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
        </select>
        <input className="input" style={{ width: 160 }} placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <label className="text-sm">£/hr <input className="input" style={{ width: 90 }} placeholder="25.00" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></label>
        <label className="text-sm">Valid from <input type="date" className="input" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></label>
        <button className="btn btn-primary" onClick={save}>Add card</button>
      </div>
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Staff</th><th>Label</th><th>Rate</th><th>Valid from</th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}><td>{r.mentis_staff?.display_name}</td><td className="font-semibold">{r.label}</td>
            <td>£{(r.rate_cents / 100).toFixed(2)}</td><td>{r.valid_from}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Holiday calendar entries ---------- */
export function Holidays() {
  const { staff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', kind: 'manual', starts_on: '', ends_on: '' });
  const load = () => supabase.from('mentis_holiday_calendar').select('*').order('starts_on').then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!form.name.trim() || !form.starts_on || !form.ends_on) return;
    await supabase.from('mentis_holiday_calendar').insert({ organization_id: staff?.organization_id, ...form });
    setForm({ ...form, name: '' }); load();
  };
  return (
    <div>
      <PageTitle title="Holiday calendar" sub="Term weeks, bank holidays, manual no-session ranges" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
        <input className="input" style={{ width: 200 }} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="input" style={{ width: 170 }} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          <option value="manual">Manual range</option><option value="term_holiday_week">Term-holiday week</option><option value="bank_holiday">Bank holiday</option>
        </select>
        <label className="text-sm">From <input type="date" className="input" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} /></label>
        <label className="text-sm">To <input type="date" className="input" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} /></label>
        <button className="btn btn-primary" onClick={save}>Add</button>
      </div>
      <div className="card p-4">{rows.map((h: any) => <div key={h.id} className="text-sm py-1">• {h.name} <em>({h.kind})</em> {h.starts_on}→{h.ends_on}</div>)}</div>
    </div>
  );
}

/* ---------- Schedule overrides with affected-instance preview ---------- */
export function Overrides() {
  const { staff } = useAuth();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ schedule_id: '', starts_at: '', ends_at: '', venue_id: '' });
  const [preview, setPreview] = useState<any[]>([]);
  const load = () => {
    supabase.from('mentis_weekly_schedules').select('id,name').then(({ data }) => setSchedules(data ?? []));
    supabase.from('mentis_venues').select('id,name').then(({ data }) => setVenues(data ?? []));
    supabase.from('mentis_schedule_overrides').select('*').order('starts_at', { ascending: false }).limit(30).then(({ data }) => setRows(data ?? []));
  };
  useEffect(() => { load(); }, []);
  const doPreview = async () => {
    if (!form.schedule_id || !form.starts_at || !form.ends_at) return;
    const { data } = await supabase.from('mentis_sessions').select('id,name,start_at,mentis_venues(name)')
      .eq('schedule_id', form.schedule_id).gte('start_at', form.starts_at).lte('end_at', form.ends_at);
    setPreview(data ?? []);
  };
  const save = async () => {
    if (!preview.length) { alert('Preview first — overrides need affected instances.'); return; }
    await supabase.from('mentis_schedule_overrides').insert({
      organization_id: staff?.organization_id, schedule_id: form.schedule_id,
      starts_at: form.starts_at, ends_at: form.ends_at, venue_id: form.venue_id || null,
      original_values: {}, override_values: { venue_id: form.venue_id || null }, created_by: staff?.user_id,
    });
    if (form.venue_id) {
      for (const p of preview) await supabase.from('mentis_sessions').update({ venue_id: form.venue_id }).eq('id', p.id);
    }
    setPreview([]); load();
  };
  return (
    <div>
      <PageTitle title="Schedule overrides" sub="Range-based · precedence + badge + originals (rule 19)" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
        <select className="input" style={{ width: 200 }} value={form.schedule_id} onChange={(e) => setForm({ ...form, schedule_id: e.target.value })}>
          <option value="">Schedule…</option>{schedules.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="text-sm">From <input type="datetime-local" className="input" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></label>
        <label className="text-sm">To <input type="datetime-local" className="input" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></label>
        <select className="input" style={{ width: 160 }} value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })}>
          <option value="">New venue…</option>{venues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <button className="btn btn-ghost" onClick={doPreview}>Preview affected ({preview.length})</button>
        <button className="btn btn-primary" onClick={save}>Apply override</button>
      </div>
      {preview.length > 0 && <div className="card p-3 mb-4 text-sm">Affected: {preview.map((p) => `${p.name} ${new Date(p.start_at).toLocaleDateString()}`).join(' · ')}</div>}
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Range</th><th>Override</th><th>At</th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}><td>{new Date(r.starts_at).toLocaleString()} → {new Date(r.ends_at).toLocaleString()}</td>
            <td className="text-xs">{JSON.stringify(r.override_values)}</td><td>{new Date(r.created_at).toLocaleDateString()}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Action-type timelines (all configurable, rule 10) ---------- */
export function ActionTimelines() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => supabase.from('mentis_action_types').select('*').order('name').then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const save = async (t: any, field: string, days: string) => {
    await supabase.from('mentis_action_types').update({ [field]: `${Number(days)} days` }).eq('id', t.id);
    load();
  };
  return (
    <div>
      <PageTitle title="Action timelines" sub="Due/breach offsets per type (rule 10)" />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Type</th><th>Trigger</th><th>Due offset (days before)</th><th>Breach offset (days before)</th></tr></thead>
        <tbody>{rows.map((t: any) => (
          <tr key={t.id}><td className="font-semibold">{t.name}</td><td>{t.trigger}</td>
            <td><input type="number" className="input" style={{ width: 80 }} defaultValue={parseInterval(t.due_offset)} onBlur={(e) => save(t, 'due_offset', e.target.value)} /></td>
            <td><input type="number" className="input" style={{ width: 80 }} defaultValue={parseInterval(t.breach_offset)} onBlur={(e) => save(t, 'breach_offset', e.target.value)} /></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
function parseInterval(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'object') return (v as { days?: number }).days ?? 0;
  const m = /(\d+)/.exec(String(v));
  return m ? Number(m[1]) : 0;
}

/* ---------- Devices: per-device revocation (rule 27) ---------- */
export function Devices() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => supabase.from('mentis_devices').select('*').order('last_seen', { ascending: false }).then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const revoke = async (id: string, revoked: boolean) => {
    await supabase.from('mentis_devices').update({ revoked: !revoked }).eq('id', id);
    load();
  };
  return (
    <div>
      <PageTitle title="Devices" sub="Lost phone? Revoke its session here" />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Label</th><th>Last seen</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.map((d: any) => (
          <tr key={d.id}><td className="font-semibold">{d.label}</td><td>{d.last_seen ? new Date(d.last_seen).toLocaleString() : '—'}</td>
            <td>{d.revoked ? '⛔ revoked' : '✅ active'}</td>
            <td><button className="btn btn-ghost" onClick={() => revoke(d.id, d.revoked)}>{d.revoked ? 'Restore' : 'Revoke'}</button></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Audit-log viewer ---------- */
export function AuditViewer() {
  const [rows, setRows] = useState<any[]>([]);
  const [action, setAction] = useState('');
  useEffect(() => {
    let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100);
    if (action) q = q.eq('action', action);
    q.then(({ data }) => setRows(data ?? []));
  }, [action]);
  return (
    <div>
      <PageTitle title="Audit log" sub="Actor · action · entity · field · period" right={
        <select className="input" style={{ width: 'auto' }} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {['medical.read', 'medical.write', 'role.change', 'task.approval', 'invoice.status', 'charge.move'].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      } />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>ID</th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}><td>{new Date(r.created_at).toLocaleString()}</td><td className="text-xs">{r.actor_id?.slice(0, 8)}</td>
            <td className="font-semibold">{r.action}</td><td>{r.entity}</td><td className="text-xs">{r.entity_id?.slice(0, 8)}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
