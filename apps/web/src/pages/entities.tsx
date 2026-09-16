import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, functionsUrl } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { attendancePct, rankMovement, csvOf, validateMember, type Member } from '@mentis/core';

/* ---------- Members ---------- */
export function Members() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    supabase.from('mentis_members').select('id,name,date_of_birth,special_needs_flag,tte_number,mentis_customers(name)').order('name').then(({ data }) => setRows(data ?? []));
  }, []);
  const filtered = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageTitle title="Members" sub={`${filtered.length} members`} right={
        <button className="btn btn-ghost" onClick={() => {
          const blob = new Blob([csvOf(filtered.map((r) => ({ name: r.name, dob: r.date_of_birth, customer: r.customers?.name ?? '' })))], { type: 'text/csv' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'members.csv'; a.click();
        }}>Export CSV</button>
      } />
      <input className="input mb-3" placeholder="Search members…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Name</th><th>DOB</th><th>Customer</th><th>TTE</th><th></th></tr></thead>
        <tbody>{filtered.map((r) => (
          <tr key={r.id}><td>{r.special_needs_flag && '⚠️ '}<Link to={`/members/${r.id}`} className="font-semibold">{r.name}</Link></td>
            <td>{r.date_of_birth}</td><td>{r.customers?.name}</td><td>{r.tte_number ?? '—'}</td>
            <td><Link to={`/members/${r.id}`} className="btn btn-ghost">360</Link></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Member 360 ---------- */
export function Member360() {
  const { id } = useParams();
  const { canDo } = useAuth();
  const [m, setM] = useState<any>(null);
  const [att, setAtt] = useState<any[]>([]);
  const [rankings, setRankings] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('mentis_members').select('*,mentis_customers(*)').eq('id', id).single().then(({ data }) => setM(data));
    supabase.from('mentis_attendance_records').select('status').eq('member_id', id).then(({ data }) => setAtt(data ?? []));
    supabase.from('mentis_rankings').select('*').eq('member_id', id).order('as_of').then(({ data }) => setRankings(data ?? []));
    supabase.from('mentis_matches').select('*').eq('member_id', id).order('played_on', { ascending: false }).limit(10).then(({ data }) => setMatches(data ?? []));
    supabase.from('mentis_player_feedback').select('body,ratings,created_at').eq('member_id', id).order('created_at', { ascending: false }).limit(10).then(({ data }) => setFeedback(data ?? []));
    supabase.from('mentis_member_goals').select('*').eq('member_id', id).then(({ data }) => setGoals(data ?? []));
  }, [id]);
  if (!m) return <div className="p-8">Loading…</div>;
  const plats = [...new Set(rankings.map((r) => r.platform))];
  return (
    <div>
      <PageTitle title={m.name} sub={`DOB ${m.date_of_birth} · ${m.customers?.name ?? ''}`} />
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-4">
          <h3 className="font-bold mb-2">Profile</h3>
          <div className="text-sm">Attendance: <strong>{attendancePct(att)}%</strong></div>
          <div className="text-sm">NOK: {m.customers?.nok_name} {m.customers?.nok_phone}</div>
          <div className="text-sm">TTE: {m.tte_number ?? '—'} · {m.handedness === 'L' ? 'Left' : m.handedness === 'R' ? 'Right' : ''} {m.playing_style ?? ''}</div>
          {m.special_needs_flag && canDo('medical.view') && <div className="text-sm mt-1">⚠️ Medical notes on file (open from register — access logged).</div>}
        </div>
        <div className="card p-4">
          <h3 className="font-bold mb-2">Rankings</h3>
          {plats.map((p) => {
            const hist = rankings.filter((r) => r.platform === p).map((r) => ({ source: p, value: r.rank_value, asOfDate: r.as_of }));
            const move = rankMovement(hist);
            const cur = hist[hist.length - 1];
            return <div key={p} className="text-sm">{p}: <strong>#{cur.value}</strong> {move === 'up' ? '▲' : move === 'down' ? '▼' : '–'}</div>;
          })}
          {plats.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>No rankings yet.</p>}
          <h3 className="font-bold mt-3 mb-1">Recent matches</h3>
          {matches.map((x) => <div key={x.id} className="text-sm">{x.played_on} vs {x.opponent}: <strong>{x.result}</strong></div>)}
        </div>
        <div className="card p-4">
          <h3 className="font-bold mb-2">Goals</h3>
          {goals.map((g) => <div key={g.id} className="text-sm">• {g.description} <em>({g.status})</em></div>)}
          <h3 className="font-bold mt-3 mb-1">Feedback timeline</h3>
          {feedback.map((f, i) => <div key={i} className="text-sm border-t py-1" style={{ borderColor: 'var(--border)' }}>{f.body} <span style={{ color: 'var(--ink-muted)' }}>({new Date(f.created_at).toLocaleDateString()})</span></div>)}
        </div>
      </div>
      <p className="text-xs mt-3" style={{ color: 'var(--ink-muted)' }}>Under-18 validation: {validateMember(m as Member).join('; ') || 'OK'}</p>
    </div>
  );
}

/* ---------- Customers ---------- */
export function Customers() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('mentis_customers').select('id,name,phone,email,mentis_members(id,name)').order('name').then(({ data }) => setRows(data ?? []));
  }, []);
  return (
    <div>
      <PageTitle title="Customers" sub="Account holders / payers" />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Name</th><th>Contact</th><th>Members</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td className="font-semibold">{r.name}</td><td>{r.phone} {r.email}</td>
            <td>{(r.members ?? []).map((x: any) => <Link key={x.id} to={`/members/${x.id}`} className="mr-2 underline">{x.name}</Link>)}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Tasters (admin pipeline) ---------- */
export function Tasters() {
  const { staff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const load = () => supabase.from('mentis_prospects').select('*').order('created_at', { ascending: false }).then(({ data }) => setRows(data ?? []));
  useEffect(() => {
    load();
    supabase.from('mentis_sessions').select('id,name,start_at').eq('status', 'scheduled').order('start_at').limit(20).then(({ data }) => setSessions(data ?? []));
  }, []);
  const approve = async (t: any, sessionId: string) => {
    if (!sessionId) return;
    await supabase.from('mentis_prospects').update({ status: 'approved', approved_session_ids: [sessionId] }).eq('id', t.id);
    await fetch(functionsUrl('send-email'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: staff?.organization_id, to: t.contact, subject: 'Taster approved', body: `Hi ${t.name}, your taster is approved.`, template: 'tasterApproval', kind: 'invitation' }) });
    load();
  };
  const convert = async (t: any) => {
    const { data: c } = await supabase.from('mentis_customers').insert({ organization_id: staff?.organization_id, name: `${t.name} (guardian)`, phone: t.contact }).select('id').single();
    if (c) await supabase.from('mentis_members').insert({ organization_id: staff?.organization_id, customer_id: c.id, name: t.name, date_of_birth: '2015-01-01' });
    await supabase.from('mentis_prospects').update({ status: 'converted' }).eq('id', t.id);
    // Conversion pack: welcome email + equipment guide (SportProfile content).
    const { data: sport } = await supabase.from('mentis_sport_profiles').select('equipment_guide').limit(1).single();
    if (t.contact && t.contact.includes('@')) {
      await fetch(functionsUrl('send-email'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: staff?.organization_id, to: t.contact, subject: 'Welcome to Kingfisher TTC',
          body: `Hi ${t.name}! Welcome to Kingfisher Table Tennis Club. Your coach will confirm your first session shortly. Equipment: ${sport?.equipment_guide ?? 'racket, indoor shoes, sportswear, water bottle.'}`,
          template: 'welcomePack', kind: 'invitation',
        }) });
    }
    load();
  };
  const formUrl = `${window.location.origin}/taster?org=${staff?.organization_id ?? ''}`;
  return (
    <div>
      <PageTitle title="Tasters" sub="Requested → approved → attended → converted" right={
        <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>Public form: {formUrl} (QR it at venues)</span>
      } />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Name</th><th>Age</th><th>Contact</th><th>Status</th><th>Approve → session</th><th></th></tr></thead>
        <tbody>{rows.map((t) => (
          <tr key={t.id}><td className="font-semibold">{t.name}</td><td>{t.age}</td><td>{t.contact}</td><td><span className="badge" style={{ background: 'var(--surface-inset)' }}>{t.status}</span></td>
            <td>{t.status === 'requested' && (
              <select className="input" style={{ width: 'auto' }} defaultValue="" onChange={(e) => approve(t, e.target.value)}>
                <option value="">Assign…</option>{sessions.map((s: any) => <option key={s.id} value={s.id}>{s.name} {new Date(s.start_at).toLocaleDateString()}</option>)}
              </select>)}
            </td>
            <td>{(t.status === 'approved' || t.status === 'attended') && <button className="btn btn-primary" onClick={() => convert(t)}>Convert</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
