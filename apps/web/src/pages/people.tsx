import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { demoEnabled, isDemoSession } from '../lib/demo';
import { addDemoCustomer, addDemoMember, demoCustomersSnapshot } from '../lib/people-data';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { validateMember, ageAt } from '@mentis/core';

const demoPeopleMode = () => demoEnabled || isDemoSession();

/* ---------- Member create/edit (under-18 validation blocks save) ---------- */
export function MemberForm() {
  const { staff } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', dateOfBirth: '', customer_id: '', nokName: '', nokPhone: '', tteNumber: '', handedness: '', playingStyle: '', equipmentNotes: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (demoPeopleMode()) {
      setCustomers(demoCustomersSnapshot().map((customer) => ({ id: customer.id, name: customer.name })));
      return;
    }
    supabase.from('mentis_customers').select('id,name').order('name').then(({ data }) => setCustomers(data ?? []));
  }, []);
  const save = async () => {
    const errs = validateMember({
      id: '', customerId: form.customer_id || undefined, dateOfBirth: form.dateOfBirth,
      specialNeedsFlag: false, nokName: form.nokName || undefined, nokPhone: form.nokPhone || undefined,
      tteNumber: form.tteNumber || undefined,
    });
    if (!form.name.trim()) errs.push('name is required');
    if (errs.length) { setMsg(errs.join(' · ')); return; }
    if (demoPeopleMode()) {
      addDemoMember({
        name: form.name,
        dateOfBirth: form.dateOfBirth,
        customerId: form.customer_id || undefined,
        tteNumber: form.tteNumber || undefined,
        handedness: (form.handedness as 'L' | 'R') || undefined,
        playingStyle: form.playingStyle || undefined,
        equipmentNotes: form.equipmentNotes || undefined,
      });
      setMsg(`Added ${form.name} to the demo roster. You can now open their Member 360.`);
      setForm({ ...form, name: '' });
      return;
    }
    const { error } = await supabase.from('mentis_members').insert({
      organization_id: staff?.organization_id, name: form.name, date_of_birth: form.dateOfBirth,
      customer_id: form.customer_id || null, tte_number: form.tteNumber || null,
      handedness: form.handedness || null, playing_style: form.playingStyle || null,
      equipment_notes: form.equipmentNotes || null,
    });
    if (error) { setMsg(error.message); return; }
    if (form.customer_id && (form.nokName || form.nokPhone)) {
      await supabase.from('mentis_customers').update({ nok_name: form.nokName || null, nok_phone: form.nokPhone || null }).eq('id', form.customer_id);
    }
    setMsg(`Saved (age ${ageAt(form.dateOfBirth)}).`);
    setForm({ ...form, name: '' });
  };
  return (
    <div>
      <PageTitle title="New member" sub="Under-18s require a partner/guardian customer + NOK (rule 1)" />
      <div className="card p-4 flex flex-col gap-2" style={{ maxWidth: 560 }}>
        <input className="input" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label className="text-sm">Date of birth <input type="date" className="input" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} /></label>
        <select className="input" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
          <option value="">Customer (payer)…</option>{customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="NOK name" value={form.nokName} onChange={(e) => setForm({ ...form, nokName: e.target.value })} />
          <input className="input" placeholder="NOK phone" value={form.nokPhone} onChange={(e) => setForm({ ...form, nokPhone: e.target.value })} />
          <input className="input" placeholder="TTE reg no (optional)" value={form.tteNumber} onChange={(e) => setForm({ ...form, tteNumber: e.target.value })} />
          <select className="input" value={form.handedness} onChange={(e) => setForm({ ...form, handedness: e.target.value })}>
            <option value="">Handedness…</option><option value="L">Left</option><option value="R">Right</option>
          </select>
        </div>
        <input className="input" placeholder="Playing style" value={form.playingStyle} onChange={(e) => setForm({ ...form, playingStyle: e.target.value })} />
        <input className="input" placeholder="Equipment notes" value={form.equipmentNotes} onChange={(e) => setForm({ ...form, equipmentNotes: e.target.value })} />
        <button className="btn btn-primary" style={{ width: 'fit-content' }} onClick={save}>Save member</button>
        {msg && <p className="text-sm">{msg}</p>}
      </div>
    </div>
  );
}

/* ---------- Customer create/edit ---------- */
export function CustomerForm() {
  const { staff } = useAuth();
  const [form, setForm] = useState({ name: '', phone: '', email: '', guardianA: '', guardianB: '', nokName: '', nokPhone: '' });
  const [msg, setMsg] = useState('');
  const save = async () => {
    if (!form.name.trim()) { setMsg('Name is required.'); return; }
    if (demoPeopleMode()) {
      addDemoCustomer({
        name: form.name,
        phone: form.phone,
        email: form.email,
        guardianA: form.guardianA,
        guardianB: form.guardianB,
        nokName: form.nokName,
        nokPhone: form.nokPhone,
      });
      setMsg(`Added ${form.name} to the demo directory. You can now link members to this household.`);
      setForm({ ...form, name: '' });
      return;
    }
    const { error } = await supabase.from('mentis_customers').insert({
      organization_id: staff?.organization_id, name: form.name, phone: form.phone || null,
      email: form.email || null, guardian_a: form.guardianA || null, guardian_b: form.guardianB || null,
      nok_name: form.nokName || null, nok_phone: form.nokPhone || null,
    });
    setMsg(error ? error.message : 'Saved.');
    if (!error) setForm({ ...form, name: '' });
  };
  return (
    <div>
      <PageTitle title="New customer" sub="Account holder / payer · guardians · NOK" />
      <div className="card p-4 flex flex-col gap-2" style={{ maxWidth: 560 }}>
        <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Guardian A" value={form.guardianA} onChange={(e) => setForm({ ...form, guardianA: e.target.value })} />
          <input className="input" placeholder="Guardian B (optional)" value={form.guardianB} onChange={(e) => setForm({ ...form, guardianB: e.target.value })} />
          <input className="input" placeholder="NOK name" value={form.nokName} onChange={(e) => setForm({ ...form, nokName: e.target.value })} />
          <input className="input" placeholder="NOK phone" value={form.nokPhone} onChange={(e) => setForm({ ...form, nokPhone: e.target.value })} />
        </div>
        <button className="btn btn-primary" style={{ width: 'fit-content' }} onClick={save}>Save customer</button>
        {msg && <p className="text-sm">{msg}</p>}
      </div>
    </div>
  );
}

/* ---------- Enrolments: pause / resume / waitlist / promote (rule 28) ---------- */
export function Enrolments() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sel, setSel] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const load = () => {
    supabase.from('mentis_sessions').select('id,name,start_at').order('start_at', { ascending: false }).limit(30).then(({ data }) => setSessions(data ?? []));
    if (sel) supabase.from('mentis_enrollments').select('*,mentis_members(name)').eq('session_id', sel).then(({ data }) => setRows(data ?? []));
  };
  useEffect(() => { load(); }, [sel]);
  const pause = async (e: any) => {
    const reason = prompt('Pause reason (required):');
    if (!reason?.trim()) return;
    await supabase.from('mentis_enrollments').update({ status: 'paused', expected: false, pause_reason: reason }).eq('id', e.id);
    load();
  };
  const resume = async (e: any) => {
    await supabase.from('mentis_enrollments').update({ status: 'active', expected: true, pause_reason: null }).eq('id', e.id);
    load();
  };
  const promote = async (e: any) => {
    if (!confirm(`Promote ${e.members?.name} from the waitlist to invited?`)) return;
    await supabase.from('mentis_enrollments').update({ status: 'invited', expected: true }).eq('id', e.id);
    load();
  };
  const waitlist = rows.filter((r: any) => r.status === 'waitlisted').sort((a: any, b: any) => (a.position ?? 99) - (b.position ?? 99));
  return (
    <div>
      <PageTitle title="Enrolments" sub="Pause excludes from the register · promotion is admin-triggered, never silent" />
      <select className="input mb-3" style={{ maxWidth: 420 }} value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="">Session…</option>{sessions.map((s: any) => <option key={s.id} value={s.id}>{s.name} — {new Date(s.start_at).toLocaleDateString()}</option>)}
      </select>
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Member</th><th>Status</th><th>Expected</th><th></th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}><td className="font-semibold">{r.members?.name}</td>
            <td><span className="badge" style={{ background: 'var(--surface-inset)' }}>{r.status}</span></td>
            <td>{r.expected ? 'yes' : 'no'}</td>
            <td className="flex gap-2">
              {(r.status === 'active' || r.status === 'invited') && <button className="btn btn-ghost" onClick={() => pause(r)}>Pause</button>}
              {r.status === 'paused' && <button className="btn btn-ghost" onClick={() => resume(r)}>Resume</button>}
              {r.status === 'waitlisted' && waitlist[0]?.id === r.id && <button className="btn btn-primary" onClick={() => promote(r)}>Promote (next in line)</button>}
            </td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
