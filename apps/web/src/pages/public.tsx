import { useEffect, useState } from 'react';
import { supabase, functionsUrl } from '../lib/supabase';

/* ---------- Public taster form (no login) ---------- */
export function PublicTaster() {
  const org = new URLSearchParams(window.location.search).get('org') ?? '';
  const [form, setForm] = useState({ name: '', age: '', contact: '', preferredSessionId: '' });
  const [sessions, setSessions] = useState<any[]>([]);
  const [done, setDone] = useState('');
  useEffect(() => {
    supabase.from('sessions').select('id,name,start_at').eq('status', 'scheduled').order('start_at').limit(10).then(({ data }) => setSessions(data ?? []));
  }, []);
  const submit = async () => {
    const r = await fetch(functionsUrl('taster-form'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: org, name: form.name, age: Number(form.age) || null, contact: form.contact, preferredSessionId: form.preferredSessionId || null }) });
    setDone(r.ok ? 'Thanks! We will confirm your taster session by email.' : 'Something went wrong — please try again.');
  };
  return (
    <div className="dark flex items-center justify-center p-4" style={{ minHeight: '100vh' }}>
      <div className="card p-6" style={{ width: 440 }}>
        <h1 className="text-2xl font-black">Try table tennis — free taster</h1>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Kingfisher Table Tennis Club</p>
        {!done ? (
          <div className="flex flex-col gap-2">
            <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="Age" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
            <input className="input" placeholder="Email or phone" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            <select className="input" value={form.preferredSessionId} onChange={(e) => setForm({ ...form, preferredSessionId: e.target.value })}>
              <option value="">Preferred session…</option>{sessions.map((s: any) => <option key={s.id} value={s.id}>{s.name} — {new Date(s.start_at).toLocaleDateString()}</option>)}
            </select>
            <button className="btn btn-primary justify-center" onClick={submit}>Request taster</button>
          </div>
        ) : <p>{done}</p>}
      </div>
    </div>
  );
}

/* ---------- Public read-only diary ---------- */
export function PublicDiary() {
  const org = new URLSearchParams(window.location.search).get('org') ?? '';
  const [events, setEvents] = useState<any[]>([]);
  useEffect(() => {
    fetch(`${functionsUrl('diary-public')}?organizationId=${org}`).then((r) => r.json()).then((j) => setEvents(j.events ?? []));
  }, [org]);
  return (
    <div className="dark p-4" style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 className="text-2xl font-black mb-1">Competition diary</h1>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Kingfisher Table Tennis Club</p>
        {events.map((e: any) => (
          <div key={e.id} className="card p-4 mb-2">
            <div className="font-bold">{e.name}</div>
            <div className="text-sm" style={{ color: 'var(--muted)' }}>{e.starts_on} → {e.ends_on} · {e.location} · entries close {e.entry_deadline ?? '—'} · {e.source}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Member micro-flow: availability + diary (member code) ---------- */
export function Microflow() {
  const params = new URLSearchParams(window.location.search);
  const [memberId, setMemberId] = useState(params.get('member') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [data, setData] = useState<any>(null);
  const load = async () => {
    const r = await fetch(`${functionsUrl('member-microflow')}?memberId=${memberId}&code=${code}`);
    setData(r.ok ? await r.json() : { error: 'Invalid member code' });
  };
  const toggle = async (eventId: string, status: string) => {
    await fetch(functionsUrl('member-microflow'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, code, eventId, status }) });
    load();
  };
  useEffect(() => { if (memberId && code) load(); }, []);
  return (
    <div className="dark p-4" style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 className="text-2xl font-black mb-4">My competitions</h1>
        {!data && (
          <div className="card p-4 flex flex-col gap-2">
            <input className="input" placeholder="Member ID" value={memberId} onChange={(e) => setMemberId(e.target.value)} />
            <input className="input" placeholder="Member code (from your email/QR)" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn btn-primary justify-center" onClick={load}>Open</button>
          </div>
        )}
        {data?.error && <div className="card p-4">{data.error}</div>}
        {(data?.events ?? []).map((e: any) => {
          const entry = (data.entries ?? []).find((x: any) => x.event_id === e.id);
          return (
            <div key={e.id} className="card p-4 mb-2">
              <div className="font-bold">{e.name}</div>
              <div className="text-sm mb-2" style={{ color: 'var(--muted)' }}>{e.starts_on} · {e.location}</div>
              <div className="flex gap-2">
                <button className={`btn ${entry?.status === 'available' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggle(e.id, 'available')}>Available</button>
                <button className={`btn ${entry?.status === 'notAvailable' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggle(e.id, 'notAvailable')}>Not available</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Phase 6: 1-2-1 booking (member code) ---------- */
export function Booking12() {
  const [slots, setSlots] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('booking_slots').select('*,venues(name)').eq('status', 'open').then(({ data }) => setSlots(data ?? []));
  }, []);
  return (
    <div className="dark p-4" style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 className="text-2xl font-black mb-4">Book a 1-2-1</h1>
        {slots.map((s: any) => (
          <div key={s.id} className="card p-4 mb-2">
            <div className="font-bold">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.weekday]} {s.start_time} · {s.duration_minutes} min · {s.venues?.name}</div>
            <div className="text-sm" style={{ color: 'var(--muted)' }}>£{(s.fixed_price_cents / 100).toFixed(2)} fixed · 24h cancellation window</div>
          </div>
        ))}
        {slots.length === 0 && <div className="card p-4">No open slots right now.</div>}
      </div>
    </div>
  );
}
