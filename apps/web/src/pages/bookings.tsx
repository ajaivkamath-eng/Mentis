import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';

/* ---------- Phase 6: coach booking slots ---------- */
export function BookingSlots() {
  const { staff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [form, setForm] = useState({ coach_id: '', venue_id: '', weekday: 2, start_time: '18:00', duration_minutes: 60, fixed_price_cents: 3000 });
  const load = () => {
    supabase.from('mentis_booking_slots').select('*,mentis_staff!booking_slots_coach_id_fkey(display_name),mentis_venues(name)').then(({ data }) => setRows(data ?? []));
    supabase.from('mentis_staff').select('id,display_name').then(({ data }) => setCoaches(data ?? []));
    supabase.from('mentis_venues').select('id,name').then(({ data }) => setVenues(data ?? []));
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!form.coach_id || !form.venue_id) return;
    await supabase.from('mentis_booking_slots').insert({ organization_id: staff?.organization_id, ...form });
    load();
  };
  const toggle = async (r: any) => {
    await supabase.from('mentis_booking_slots').update({ status: r.status === 'open' ? 'closed' : 'open' }).eq('id', r.id);
    load();
  };
  return (
    <div>
      <PageTitle title="Booking slots" sub="Coach 1-2-1 availability (fixed price)" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
        <select className="input" style={{ width: 160 }} value={form.coach_id} onChange={(e) => setForm({ ...form, coach_id: e.target.value })}>
          <option value="">Coach…</option>{coaches.map((c: any) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
        </select>
        <select className="input" style={{ width: 150 }} value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })}>
          <option value="">Venue…</option>{venues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <label className="text-sm">Day <select className="input" value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <option key={i} value={i}>{d}</option>)}</select></label>
        <label className="text-sm">Start <input type="time" className="input" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></label>
        <label className="text-sm">Mins <input type="number" className="input" style={{ width: 70 }} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></label>
        <label className="text-sm">Price £ <input type="number" className="input" style={{ width: 80 }} value={form.fixed_price_cents / 100} onChange={(e) => setForm({ ...form, fixed_price_cents: Math.round(Number(e.target.value) * 100) })} /></label>
        <button className="btn btn-primary" onClick={save}>Add slot</button>
      </div>
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Coach</th><th>When</th><th>Venue</th><th>Price</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}><td className="font-semibold">{r.mentis_staff?.display_name}</td>
            <td>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][r.weekday]} {String(r.start_time).slice(0, 5)} · {r.duration_minutes}m</td>
            <td>{r.venues?.name}</td><td>£{(r.fixed_price_cents / 100).toFixed(2)}</td><td>{r.status}</td>
            <td><button className="btn btn-ghost" onClick={() => toggle(r)}>{r.status === 'open' ? 'Close' : 'Open'}</button></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Phase 6: bookings queue (approve → billable task) ---------- */
export function Bookings() {
  const { staff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const load = () => {
    supabase.from('mentis_bookings').select('*,mentis_members(name),mentis_booking_slots!inner(weekday,start_time,mentis_staff!booking_slots_coach_id_fkey(display_name),fixed_price_cents)').order('starts_at', { ascending: false }).limit(100).then(({ data }) => setRows(data ?? []));
  };
  useEffect(() => { load(); }, []);
  const approve = async (b: any) => {
    const coach = b.booking_slots?.mentis_staff?.display_name ?? 'coach';
    const { data: t } = await supabase.from('mentis_tasks').insert({
      organization_id: staff?.organization_id, title: `1-2-1 ${b.members?.name} (${coach})`,
      task_type: 'oneOnOne', amount_cents: b.booking_slots?.fixed_price_cents ?? 0, due_at: b.starts_at,
    }).select('id').single();
    await supabase.from('mentis_bookings').update({ status: 'approved', task_id: t?.id ?? null }).eq('id', b.id);
    load();
  };
  const setStatus = async (b: any, status: string) => {
    await supabase.from('mentis_bookings').update({ status }).eq('id', b.id);
    load();
  };
  return (
    <div>
      <PageTitle title="1-2-1 bookings" sub="Approve → creates billable oneOnOne task" />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>When</th><th>Member</th><th>Coach</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.map((b: any) => (
          <tr key={b.id}><td>{new Date(b.starts_at).toLocaleString()}</td><td className="font-semibold">{b.members?.name}</td>
            <td>{b.booking_slots?.mentis_staff?.display_name}</td>
            <td><span className="badge" style={{ background: 'var(--surface-inset)' }}>{b.status}</span></td>
            <td className="flex gap-2">
              {b.status === 'booked' && <button className="btn btn-primary" onClick={() => approve(b)}>Approve</button>}
              {b.status === 'approved' && <button className="btn btn-ghost" onClick={() => setStatus(b, 'completed')}>Complete</button>}
              {(b.status === 'booked' || b.status === 'approved') && <button className="btn btn-ghost" onClick={() => setStatus(b, 'cancelled')}>Cancel</button>}
            </td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
