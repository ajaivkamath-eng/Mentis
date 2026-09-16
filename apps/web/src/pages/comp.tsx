import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { eligibleSquad, ageAt, validateMatch, memberAnalytics } from '@mentis/core';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

/* ---------- Competition diary (org-level) + squad picker + event planning ---------- */
export function Events() {
  const { staff, canDo } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [sel, setSel] = useState('');
  const [form, setForm] = useState({ name: '', starts_on: '', ends_on: '', location: '', entry_deadline: '', source: 'manual' });
  const load = () => {
    supabase.from('mentis_events').select('*').order('starts_on').then(({ data }) => setEvents(data ?? []));
    supabase.from('mentis_members').select('id,name,date_of_birth').then(({ data }) => setMembers(data ?? []));
    supabase.from('mentis_event_entries').select('*,mentis_members(name)').then(({ data }) => setEntries(data ?? []));
  };
  useEffect(() => { load(); }, []);
  const create = async () => {
    const { error } = await supabase.from('mentis_events').insert({ organization_id: staff?.organization_id, ...form, status: 'published' });
    if (error) alert(error.message); else { setForm({ ...form, name: '' }); load(); }
  };
  const suggest = async (memberId: string) => {
    await supabase.from('mentis_event_entries').insert({ event_id: sel, member_id: memberId, status: 'suggested', suggested_by: staff?.user_id });
    load();
  };
  const confirmGuardian = async (entryId: string) => {
    await supabase.from('mentis_event_entries').update({ guardian_confirmed: true }).eq('id', entryId);
    load();
  };
  const ev = events.find((e) => e.id === sel);
  const squad = eligibleSquad(
    members.map((m) => ({ memberId: m.id, age: ageAt(m.date_of_birth), rank: 3 })),
    10, 18, 1, 5,
  );
  const conflictWith = (memberId: string) => {
    if (!ev) return '';
    const other = entries.filter((x: any) => x.member_id === memberId && x.event_id !== ev.id && x.status === 'entered');
    const clash = other.map((x: any) => events.find((e) => e.id === x.event_id)).find((o: any) =>
      o && o.starts_on <= ev.ends_on && ev.starts_on <= o.ends_on);
    return clash ? `⚠️ clashes with ${clash.name}` : '';
  };
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
                <span>{m?.name} (age {c.age}) {entry && <em>· {entry.status}</em>} <span style={{ color: 'var(--amber)' }}>{conflictWith(c.memberId)}</span></span>
                {!entry && canDo('events.manage') && <button className="btn btn-ghost" onClick={() => suggest(c.memberId)}>Suggest</button>}
              </div>
            );
          })}
          <h3 className="font-bold mt-3 mb-1">Entries</h3>
          {entries.filter((x: any) => x.event_id === ev?.id).map((x: any) => (
            <div key={x.id} className="text-sm py-1 flex justify-between">
              <span>• {x.members?.name} — {x.status}{x.guardian_confirmed ? ' (guardian ✓)' : ''}</span>
              {!x.guardian_confirmed && canDo('events.manage') && <button className="btn btn-ghost" onClick={() => confirmGuardian(x.id)}>Guardian confirm</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Match entry (multi-source) ---------- */
export function MatchEntry() {
  const [members, setMembers] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [form, setForm] = useState({ member_id: '', date: '', opponent: '', gamesFor: '', gamesAgainst: '', result: 'W', source: 'manual', session_id: '', event_id: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => {
    supabase.from('mentis_members').select('id,name').order('name').then(({ data }) => setMembers(data ?? []));
    supabase.from('mentis_sessions').select('id,name').order('start_at', { ascending: false }).limit(20).then(({ data }) => setSessions(data ?? []));
    supabase.from('mentis_events').select('id,name').order('starts_on', { ascending: false }).limit(20).then(({ data }) => setEvents(data ?? []));
  }, []);
  const save = async () => {
    const gf = form.gamesFor.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));
    const ga = form.gamesAgainst.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));
    const errs = validateMatch({
      id: '', memberId: form.member_id, date: form.date, opponent: form.opponent,
      gamesFor: gf, gamesAgainst: ga, result: form.result as 'W',
      source: form.source as 'manual', sessionId: form.session_id || undefined, eventId: form.event_id || undefined,
    });
    if (errs.length) { setMsg(errs.join(' · ')); return; }
    const { error } = await supabase.from('mentis_matches').insert({
      member_id: form.member_id, played_on: form.date, opponent: form.opponent,
      games_for: gf, games_against: ga, result: form.result, source: form.source,
      session_id: form.session_id || null, event_id: form.event_id || null,
    });
    setMsg(error ? error.message : 'Match saved.');
  };
  return (
    <div>
      <PageTitle title="Record match" sub="Event, sub-event or session context + source tag" />
      <div className="card p-4 flex flex-col gap-2" style={{ maxWidth: 560 }}>
        <select className="input" value={form.member_id} onChange={(e) => setForm({ ...form, member_id: e.target.value })}>
          <option value="">Member…</option>{members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">Date <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <input className="input" placeholder="Opponent" value={form.opponent} onChange={(e) => setForm({ ...form, opponent: e.target.value })} />
          <input className="input" placeholder="Games for (11,7,11)" value={form.gamesFor} onChange={(e) => setForm({ ...form, gamesFor: e.target.value })} />
          <input className="input" placeholder="Games against (9,11,8)" value={form.gamesAgainst} onChange={(e) => setForm({ ...form, gamesAgainst: e.target.value })} />
          <select className="input" value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
            <option value="W">Win</option><option value="L">Loss</option><option value="D">Draw</option>
          </select>
          <select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            {['manual', 'tte', 'ittf_wtt', 'club', 'local'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input" value={form.session_id} onChange={(e) => setForm({ ...form, session_id: e.target.value })}>
            <option value="">Session (practice)…</option>{sessions.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="input" value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
            <option value="">Event…</option>{events.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" style={{ width: 'fit-content' }} onClick={save}>Save match</button>
        {msg && <p className="text-sm">{msg}</p>}
      </div>
    </div>
  );
}

/* ---------- Ranking entry (multi-platform + history) ---------- */
export function RankingEntry() {
  const [members, setMembers] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ member_id: '', platform: 'tte', rank: '', as_of: new Date().toISOString().slice(0, 10) });
  useEffect(() => {
    supabase.from('mentis_members').select('id,name').order('name').then(({ data }) => setMembers(data ?? []));
  }, []);
  useEffect(() => {
    if (form.member_id) supabase.from('mentis_rankings').select('*').eq('member_id', form.member_id).order('as_of', { ascending: false }).limit(20).then(({ data }) => setRows(data ?? []));
  }, [form.member_id]);
  const save = async () => {
    if (!form.member_id || !form.rank) return;
    await supabase.from('mentis_rankings').insert({
      member_id: form.member_id, platform: form.platform, rank_value: Number(form.rank), as_of: form.as_of,
    });
    setForm({ ...form, rank: '' });
    supabase.from('mentis_rankings').select('*').eq('member_id', form.member_id).order('as_of', { ascending: false }).limit(20).then(({ data }) => setRows(data ?? []));
  };
  return (
    <div>
      <PageTitle title="Rankings" sub="Concurrent platforms · as-of history · movement derived" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
        <select className="input" style={{ width: 200 }} value={form.member_id} onChange={(e) => setForm({ ...form, member_id: e.target.value })}>
          <option value="">Member…</option>{members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="input" style={{ width: 130 }} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
          {['tte', 'ittf_wtt', 'club', 'local'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="input" style={{ width: 100 }} placeholder="Rank" value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} />
        <label className="text-sm">As of <input type="date" className="input" value={form.as_of} onChange={(e) => setForm({ ...form, as_of: e.target.value })} /></label>
        <button className="btn btn-primary" onClick={save}>Add snapshot</button>
      </div>
      <div className="card p-4">{rows.map((r: any) => <div key={r.id} className="text-sm py-1">• {r.platform}: <strong>#{r.rank_value}</strong> <span style={{ color: 'var(--muted)' }}>({r.as_of})</span></div>)}</div>
    </div>
  );
}

/* ---------- Player goals ---------- */
export function Goals() {
  const [members, setMembers] = useState<any[]>([]);
  const [memberId, setMemberId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ description: '', type: 'free', targetDate: '' });
  useEffect(() => {
    supabase.from('mentis_members').select('id,name').order('name').then(({ data }) => setMembers(data ?? []));
  }, []);
  const load = () => {
    if (memberId) supabase.from('mentis_member_goals').select('*').eq('member_id', memberId).then(({ data }) => setRows(data ?? []));
  };
  useEffect(() => { load(); }, [memberId]);
  const save = async () => {
    if (!memberId || !form.description.trim()) return;
    await supabase.from('mentis_member_goals').insert({
      member_id: memberId, description: form.description, goal_type: form.type,
      target_date: form.targetDate || null, status: 'inProgress',
    });
    setForm({ ...form, description: '' }); load();
  };
  const cycle = async (g: any) => {
    const next = g.status === 'inProgress' ? 'achieved' : g.status === 'achieved' ? 'missed' : 'inProgress';
    await supabase.from('mentis_member_goals').update({ status: next }).eq('id', g.id);
    load();
  };
  return (
    <div>
      <PageTitle title="Player goals" sub="Free text or structured · shown in Member 360" />
      <select className="input mb-3" style={{ maxWidth: 320 }} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
        <option value="">Member…</option>{members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
        <input className="input" style={{ width: 280 }} placeholder="Goal description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <select className="input" style={{ width: 140 }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="free">Free</option><option value="rank">Rank target</option><option value="competition">Competition</option>
        </select>
        <label className="text-sm">Target <input type="date" className="input" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></label>
        <button className="btn btn-primary" onClick={save}>Add goal</button>
      </div>
      <div className="card p-4">{rows.map((g: any) => (
        <div key={g.id} className="text-sm py-1 flex justify-between"><span>• {g.description} <em>({g.goal_type} · {g.status} · {g.target_date ?? 'no date'})</em></span>
          <button className="btn btn-ghost" onClick={() => cycle(g)}>Cycle status</button></div>
      ))}</div>
    </div>
  );
}

/* ---------- Match analytics + development timeline charts ---------- */
export function Analytics() {
  const [members, setMembers] = useState<any[]>([]);
  const [memberId, setMemberId] = useState('');
  const [data, setData] = useState<{ matches: any[]; attendance: any[]; rankings: any[]; feedback: any[] }>({ matches: [], attendance: [], rankings: [], feedback: [] });
  useEffect(() => {
    supabase.from('mentis_members').select('id,name').order('name').then(({ data }) => setMembers(data ?? []));
  }, []);
  useEffect(() => {
    if (!memberId) return;
    (async () => {
      const [m, a, r, f] = await Promise.all([
        supabase.from('mentis_matches').select('*').eq('member_id', memberId).order('played_on'),
        supabase.from('mentis_attendance_records').select('status').eq('member_id', memberId),
        supabase.from('mentis_rankings').select('*').eq('member_id', memberId).order('as_of'),
        supabase.from('mentis_player_feedback').select('ratings,created_at').eq('member_id', memberId).order('created_at'),
      ]);
      setData({ matches: m.data ?? [], attendance: a.data ?? [], rankings: r.data ?? [], feedback: f.data ?? [] });
    })();
  }, [memberId]);
  const an = memberAnalytics(data.matches as any, data.attendance as any);
  const rankSeries = data.rankings.map((r: any) => ({ at: r.as_of, [`${r.platform}`]: r.rank_value }));
  const ratingSeries = data.feedback.map((f: any) => {
    const vals = Object.values(f.ratings ?? {}) as number[];
    return { at: (f.created_at as string).slice(0, 10), avg: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0 };
  });
  const platforms = [...new Set(data.rankings.map((r: any) => r.platform))];
  return (
    <div>
      <PageTitle title="Match analytics" sub="W/L · head-to-head · form · rank & rating trends" />
      <select className="input mb-3" style={{ maxWidth: 320 }} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
        <option value="">Member…</option>{members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      {memberId && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-4">
            <h3 className="font-bold mb-2">Record</h3>
            <div className="text-sm">W {an.winLoss.wins} · L {an.winLoss.losses} · D {an.winLoss.draws}</div>
            <div className="text-sm">Form (last 5): <strong>{an.form.join(' ') || '—'}</strong></div>
            <div className="text-sm">Attendance: <strong>{an.attendancePct}%</strong></div>
            <h3 className="font-bold mt-3 mb-1">Head-to-head</h3>
            {Object.entries(an.headToHead).map(([o, h]) => <div key={o} className="text-sm">• {o}: {h.W}W–{h.L}L</div>)}
          </div>
          <div className="card p-4">
            <h3 className="font-bold mb-2">Rank history (lower = better)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={rankSeries}>
                <XAxis dataKey="at" tick={{ fontSize: 10 }} /><YAxis reversed tick={{ fontSize: 10 }} /><Tooltip />
                {platforms.map((p, i) => <Line key={p} type="monotone" dataKey={p} stroke={['#0b1f3a', '#14b8a6', '#f59e0b', '#dc2626'][i % 4]} dot={false} />)}
              </LineChart>
            </ResponsiveContainer>
            <h3 className="font-bold mt-3 mb-2">Feedback avg rating</h3>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={ratingSeries}>
                <XAxis dataKey="at" tick={{ fontSize: 10 }} /><YAxis domain={[1, 10]} tick={{ fontSize: 10 }} /><Tooltip />
                <Line type="monotone" dataKey="avg" stroke="#14b8a6" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
