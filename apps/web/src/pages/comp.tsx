import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { eligibleSquad, ageAt } from '@mentis/core';

/* ---------- Competition diary (org-level) + squad picker + event planning ---------- */
export function Events() {
  const { staff, canDo } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [sel, setSel] = useState('');
  const [form, setForm] = useState({ name: '', starts_on: '', ends_on: '', location: '', entry_deadline: '', source: 'manual' });
  const load = () => {
    supabase.from('events').select('*').order('starts_on').then(({ data }) => setEvents(data ?? []));
    supabase.from('members').select('id,name,date_of_birth').then(({ data }) => setMembers(data ?? []));
    supabase.from('event_entries').select('*,members(name)').then(({ data }) => setEntries(data ?? []));
  };
  useEffect(() => { load(); }, []);
  const create = async () => {
    const { error } = await supabase.from('events').insert({ organization_id: staff?.organization_id, ...form, status: 'published' });
    if (error) alert(error.message); else { setForm({ ...form, name: '' }); load(); }
  };
  const suggest = async (memberId: string) => {
    await supabase.from('event_entries').insert({ event_id: sel, member_id: memberId, status: 'suggested', suggested_by: staff?.user_id });
    load();
  };
  const ev = events.find((e) => e.id === sel);
  const squad = eligibleSquad(
    members.map((m) => ({ memberId: m.id, age: ageAt(m.date_of_birth), rank: 3 })),
    10, 18, 1, 5,
  );
  return (
    <div>
      <PageTitle title="Competition diary" sub="Org-level diary (common across venues) · manual + CSV import" right={
        <span className="text-xs" style={{ color: 'var(--muted)' }}>Public diary: {window.location.origin}/diary?org={staff?.organization_id}</span>
      } />
      {canDo('events.manage') && (
        <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
          <input className="input" style={{ width: 220 }} placeholder="Event name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label className="text-sm">From <input type="date" className="input" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} /></label>
          <label className="text-sm">To <input type="date" className="input" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} /></label>
          <input className="input" style={{ width: 160 }} placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <select className="input" style={{ width: 130 }} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            {['manual', 'tte', 'ittf_wtt', 'club', 'local'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn btn-primary" onClick={create}>Add event</button>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4"><h3 className="font-bold mb-2">Upcoming events</h3>
          {events.map((e: any) => (
            <button key={e.id} onClick={() => setSel(e.id)} className="w-full text-left py-2 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
              <div className="font-semibold">{sel === e.id ? '▸ ' : ''}{e.name}</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>{e.starts_on} → {e.ends_on} · {e.location} · {e.source}</div>
            </button>
          ))}
        </div>
        <div className="card p-4"><h3 className="font-bold mb-2">Squad picker {ev && `— ${ev.name}`}</h3>
          {!ev && <p className="text-sm" style={{ color: 'var(--muted)' }}>Select an event.</p>}
          {ev && squad.slice(0, 12).map((c) => {
            const m = members.find((x) => x.id === c.memberId);
            const entry = entries.find((x: any) => x.event_id === ev.id && x.member_id === c.memberId);
            return (
              <div key={c.memberId} className="flex justify-between text-sm py-1">
                <span>{m?.name} (age {c.age}) {entry && <em>· {entry.status}</em>}</span>
                {!entry && canDo('events.manage') && <button className="btn btn-ghost" onClick={() => suggest(c.memberId)}>Suggest</button>}
              </div>
            );
          })}
          <h3 className="font-bold mt-3 mb-1">Entries</h3>
          {entries.filter((x: any) => x.event_id === ev?.id).map((x: any) => (
            <div key={x.id} className="text-sm py-1">• {x.members?.name} — {x.status}{x.guardian_confirmed ? ' (guardian ✓)' : ''}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
