import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';

/* ---------- Availability: self or on-behalf, date+time stamped (rule 11) ---------- */
export function Availability() {
  const { staff, canDo } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [form, setForm] = useState({ staff_id: '', starts_at: '', ends_at: '', available: false, reason: '' });
  const load = async () => {
    const { data } = await supabase.from('mentis_staff_availability')
      .select('*,mentis_staff!staff_availability_staff_id_fkey(display_name)')
      .order('starts_at', { ascending: false }).limit(60);
    setRows(data ?? []);
    const { data: sl } = await supabase.from('mentis_staff').select('id,display_name');
    setStaffList(sl ?? []);
    setForm((f) => ({ ...f, staff_id: f.staff_id || staff?.id || '' }));
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!form.staff_id || !form.starts_at || !form.ends_at) { alert('Staff + start + end required.'); return; }
    if (form.staff_id !== staff?.id && !canDo('availability.recordForOthers') && !canDo('availability.recordAll')) {
      alert('Only coaches/admins can record on behalf of others.');
      return;
    }
    await supabase.from('mentis_staff_availability').insert({
      organization_id: staff?.organization_id, staff_id: form.staff_id,
      starts_at: form.starts_at, ends_at: form.ends_at, available: form.available,
      reason: form.reason || null, recorded_by: staff?.user_id,
    });
    setForm({ ...form, reason: '' }); load();
  };
  return (
    <div>
      <PageTitle title="Availability" sub="Who/when recorded is stored · drives breach detection" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
        <select className="input" style={{ width: 180 }} value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>
          {staffList.map((s: any) => <option key={s.id} value={s.id}>{s.display_name}{s.id === staff?.id ? ' (me)' : ''}</option>)}
        </select>
        <select className="input" style={{ width: 150 }} value={String(form.available)} onChange={(e) => setForm({ ...form, available: e.target.value === 'true' })}>
          <option value="false">Unavailable</option><option value="true">Available</option>
        </select>
        <label className="text-sm">From <input type="datetime-local" className="input" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></label>
        <label className="text-sm">To <input type="datetime-local" className="input" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></label>
        <input className="input" style={{ width: 180 }} placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <button className="btn btn-primary" onClick={save}>Record</button>
      </div>
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Staff</th><th>Window</th><th>Status</th><th>Reason</th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}><td className="font-semibold">{r.mentis_staff?.display_name}</td>
            <td>{new Date(r.starts_at).toLocaleString()} → {new Date(r.ends_at).toLocaleString()}</td>
            <td>{r.available ? '✅ available' : '⛔ unavailable'}</td><td>{r.reason}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
