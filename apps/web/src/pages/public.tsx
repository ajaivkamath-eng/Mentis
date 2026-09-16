import { useEffect, useState } from 'react';
import { supabase, functionsUrl } from '../lib/supabase';

/* ---------- Public taster form (no login) ---------- */
export function PublicTaster() {
  const org = new URLSearchParams(window.location.search).get('org') ?? '';
  const [form, setForm] = useState({ name: '', age: '', contact: '', preferredSessionId: '' });
  const [sessions, setSessions] = useState<any[]>([]);
  const [done, setDone] = useState('');
  useEffect(() => {
    supabase.from('mentis_sessions').select('id,name,start_at').eq('status', 'scheduled').order('start_at').limit(10).then(({ data }) => setSessions(data ?? []));
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
        <p className="text-sm mb-4" style={{ color: 'var(--ink-muted)' }}>Kingfisher Table Tennis Club</p>
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
        <p className="text-sm mb-4" style={{ color: 'var(--ink-muted)' }}>Kingfisher Table Tennis Club</p>
        {events.map((e: any) => (
          <div key={e.id} className="card p-4 mb-2">
            <div className="font-bold">{e.name}</div>
            <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>{e.starts_on} → {e.ends_on} · {e.location} · entries close {e.entry_deadline ?? '—'} · {e.source}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Member micro-flow: availability + diary + bookings + reports ---------- */
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
        {(data?.bookings ?? []).length > 0 && (
          <div className="card p-4 mb-2">
            <div className="font-bold mb-1">My 1-2-1 bookings</div>
            {(data.bookings ?? []).map((b: any) => <div key={b.id} className="text-sm">{new Date(b.starts_at).toLocaleString()} — {b.status}</div>)}
          </div>
        )}
        {(data?.reports ?? []).length > 0 && (
          <div className="card p-4 mb-2">
            <div className="font-bold mb-1">Progress reports</div>
            {(data.reports ?? []).map((r: any) => <div key={r.id} className="text-sm">{r.period} — sent {r.sent_at?.slice(0, 10)}</div>)}
          </div>
        )}
        {(data?.events ?? []).map((e: any) => {
          const entry = (data.entries ?? []).find((x: any) => x.event_id === e.id);
          return (
            <div key={e.id} className="card p-4 mb-2">
              <div className="font-bold">{e.name}</div>
              <div className="text-sm mb-2" style={{ color: 'var(--ink-muted)' }}>{e.starts_on} · {e.location}</div>
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
  const [form, setForm] = useState({ memberId: '', code: '', slotId: '', date: '' });
  const [mine, setMine] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    supabase.from('mentis_booking_slots').select('*,mentis_venues(name),mentis_staff!booking_slots_coach_id_fkey(display_name)').eq('status', 'open').then(({ data }) => setSlots(data ?? []));
  }, []);
  const book = async () => {
    const slot = slots.find((s: any) => s.id === form.slotId);
    if (!slot || !form.date) { setMsg('Pick a slot and date.'); return; }
    const startsAt = new Date(`${form.date}T${String(slot.start_time).slice(0, 5)}:00Z`).toISOString();
    if (new Date(startsAt).getUTCDay() !== slot.weekday) { setMsg('That date is not this slot\u2019s weekday.'); return; }
    const r = await fetch(functionsUrl('booking-create'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: form.memberId, code: form.code, slotId: form.slotId, startsAt }) });
    const j = await r.json();
    setMsg(j.ok ? 'Booked! The coach will confirm.' : (j.error ?? 'Booking failed.'));
    if (j.ok) myBookings();
  };
  const myBookings = async () => {
    if (!form.memberId || !form.code) return;
    const r = await fetch(`${functionsUrl('member-microflow')}?memberId=${form.memberId}&code=${form.code}`);
    const j = await r.json();
    setMine(j.bookings ?? []);
  };
  const cancel = async (bookingId: string) => {
    const r = await fetch(functionsUrl('booking-create'), { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, memberId: form.memberId, code: form.code }) });
    const j = await r.json();
    setMsg(j.ok ? 'Cancelled.' : (j.error ?? 'Cancel failed.'));
    myBookings();
  };
  return (
    <div className="dark p-4" style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 className="text-2xl font-black mb-4">Book a 1-2-1</h1>
        {slots.map((s: any) => (
          <div key={s.id} className="card p-4 mb-2">
            <div className="font-bold">{s.mentis_staff?.display_name} — {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.weekday]} {s.start_time} · {s.duration_minutes} min · {s.venues?.name}</div>
            <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>£{(s.fixed_price_cents / 100).toFixed(2)} fixed · 24h cancellation window</div>
          </div>
        ))}
        {slots.length === 0 && <div className="card p-4">No open slots right now.</div>}
        <div className="card p-4 mt-4 flex flex-col gap-2">
          <h3 className="font-bold">Book with your member code</h3>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Member ID" value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} />
            <input className="input" placeholder="Member code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <select className="input" value={form.slotId} onChange={(e) => setForm({ ...form, slotId: e.target.value })}>
              <option value="">Slot…</option>{slots.map((s: any) => <option key={s.id} value={s.id}>{s.mentis_staff?.display_name} {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.weekday]} {s.start_time}</option>)}
            </select>
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={book}>Book</button>
            <button className="btn btn-ghost" onClick={myBookings}>My bookings</button>
          </div>
          {msg && <p className="text-sm">{msg}</p>}
          {mine.map((b: any) => (
            <div key={b.id} className="text-sm flex justify-between"><span>{new Date(b.starts_at).toLocaleString()} — {b.status}</span>
              {b.status === 'booked' && <button className="btn btn-ghost" onClick={() => cancel(b.id)}>Cancel</button>}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
