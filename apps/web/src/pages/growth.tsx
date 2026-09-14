import { useEffect, useState } from 'react';
import { supabase, functionsUrl } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { buildProgressSummary } from '@mentis/core';

/* ---------- Phase 6: progress reports (draft → approve → send) ---------- */
export function ProgressReports() {
  const { staff } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [memberId, setMemberId] = useState('');
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [preview, setPreview] = useState('');
  const load = () => {
    supabase.from('members').select('id,name').order('name').then(({ data }) => setMembers(data ?? []));
    supabase.from('progress_reports').select('*,members(name)').order('period', { ascending: false }).limit(50).then(({ data }) => setRows(data ?? []));
  };
  useEffect(() => { load(); }, []);
  const compose = async () => {
    if (!memberId) return;
    const [{ data: att }, { data: matches }, { data: fb }, { data: goals }, { data: ranks }] = await Promise.all([
      supabase.from('attendance_records').select('status').eq('member_id', memberId),
      supabase.from('matches').select('result,played_on').eq('member_id', memberId).order('played_on'),
      supabase.from('player_feedback').select('ratings,created_at').eq('member_id', memberId).order('created_at'),
      supabase.from('member_goals').select('status').eq('member_id', memberId),
      supabase.from('rankings').select('platform,rank_value,as_of').eq('member_id', memberId).order('as_of'),
    ]);
    const ratingSeries: Record<string, { at: string; score: number }[]> = {};
    for (const f of fb ?? []) {
      for (const [k, v] of Object.entries((f as any).ratings ?? {})) {
        ratingSeries[k] = ratingSeries[k] ?? [];
        ratingSeries[k].push({ at: (f as any).created_at, score: Number(v) });
      }
    }
    const rankingsByPlatform: Record<string, { source: string; value: number; asOfDate: string }[]> = {};
    for (const r of ranks ?? []) {
      rankingsByPlatform[r.platform] = rankingsByPlatform[r.platform] ?? [];
      rankingsByPlatform[r.platform].push({ source: r.platform, value: r.rank_value, asOfDate: r.as_of });
    }
    const s = buildProgressSummary({
      attendance: (att ?? []).map((a: any) => ({ status: a.status })) as any,
      ratingSeries, rankingsByPlatform,
      matches: (matches ?? []).map((m: any) => ({ result: m.result, date: m.played_on })) as any,
      goals: (goals ?? []).map((g: any) => ({ status: g.status })),
    });
    const name = members.find((m: any) => m.id === memberId)?.name ?? '';
    const lines = [
      `Progress report — ${name} (${period})`, '',
      `Attendance: ${s.attendancePct}%`,
      `Match record: ${s.winLoss.wins}W ${s.winLoss.losses}L ${s.winLoss.draws}D · form ${s.form.join('') || '—'}`,
      `Goals: ${Object.entries(s.goals).map(([k, v]) => `${k}×${v}`).join(', ') || 'none set'}`,
      ...Object.entries(s.ratingTrends).map(([k, v]) => `Rating ${k}: ${v}`),
      ...Object.entries(s.rankMovement).map(([k, v]) => `Rank ${k}: ${v}`),
    ];
    setPreview(lines.join('\n'));
  };
  const save = async (status: string) => {
    const { data } = await supabase.from('progress_reports').upsert(
      { organization_id: staff?.organization_id, member_id: memberId, period, status },
      { onConflict: 'member_id,period' }).select('id').single();
    if (status === 'sent' && data) {
      const { data: m } = await supabase.from('members').select('customers(email)').eq('id', memberId).single();
      const email = (m as any)?.customers?.email;
      if (email) {
        await fetch(functionsUrl('send-email'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId: staff?.organization_id, to: email, subject: `Progress report ${period}`, body: preview, template: 'progressReport', kind: 'report' }) });
        await supabase.from('progress_reports').update({ sent_at: new Date().toISOString() }).eq('id', data.id);
      }
    }
    load();
  };
  const approve = async (r: any) => {
    await supabase.from('progress_reports').update({ status: 'approved', approved_by: staff?.user_id }).eq('id', r.id);
    load();
  };
  return (
    <div>
      <PageTitle title="Progress reports" sub="Draft → coach approval → send to guardian" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
        <select className="input" style={{ width: 200 }} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Member…</option>{members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <label className="text-sm">Period <input className="input" style={{ width: 110 }} value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
        <button className="btn btn-ghost" onClick={compose}>Compose</button>
        <button className="btn btn-ghost" onClick={() => save('draft')}>Save draft</button>
        <button className="btn btn-primary" onClick={() => save('sent')}>Send now</button>
      </div>
      {preview && <pre className="card p-4 mb-4 text-sm" style={{ whiteSpace: 'pre-wrap' }}>{preview}</pre>}
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Member</th><th>Period</th><th>Status</th><th>Sent</th><th></th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}><td className="font-semibold">{r.members?.name}</td><td>{r.period}</td><td>{r.status}</td><td>{r.sent_at?.slice(0, 10) ?? '—'}</td>
            <td>{r.status === 'draft' && <button className="btn btn-primary" onClick={() => approve(r)}>Approve</button>}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Phase 6: coach performance snapshot ---------- */
export function CoachPerformance() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data: coaches } = await supabase.from('mentis_staff').select('id,display_name');
      const out = [];
      for (const c of coaches ?? []) {
        const [{ count: sessions }, { data: fb }] = await Promise.all([
          supabase.from('session_staffing').select('id', { count: 'exact', head: true }).eq('staff_id', c.id),
          supabase.from('player_feedback').select('ratings').eq('coach_id', c.id).limit(50),
        ]);
        const vals = (fb ?? []).flatMap((f: any) => Object.values(f.ratings ?? {})) as number[];
        out.push({ name: c.display_name, sessions: sessions ?? 0, feedback: (fb ?? []).length,
          avg: vals.length ? (vals.reduce((a, b) => a + Number(b), 0) / vals.length).toFixed(1) : '—' });
      }
      setRows(out);
    })();
  }, []);
  return (
    <div>
      <PageTitle title="Coach performance" sub="Sessions staffed · feedback volume · avg rating" />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Coach</th><th>Sessions</th><th>Feedback notes</th><th>Avg rating</th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.name}><td className="font-semibold">{r.name}</td><td>{r.sessions}</td><td>{r.feedback}</td><td>{r.avg}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Phase 6: sparring matcher (shared sessions + style) ---------- */
export function SparringMatcher() {
  const [pairs, setPairs] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data: members } = await supabase.from('members').select('id,name,playing_style');
      const { data: enroll } = await supabase.from('enrollments').select('session_id,member_id');
      const byMember: Record<string, Set<string>> = {};
      for (const e of enroll ?? []) {
        byMember[e.member_id] = byMember[e.member_id] ?? new Set();
        byMember[e.member_id].add(e.session_id);
      }
      const list = members ?? [];
      const out: any[] = [];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const shared = [...(byMember[list[i].id] ?? [])].filter((s) => (byMember[list[j].id] ?? new Set()).has(s)).length;
        if (shared > 0) out.push({ a: list[i], b: list[j], shared });
      }
      setPairs(out.sort((x, y) => y.shared - x.shared).slice(0, 30));
    })();
  }, []);
  return (
    <div>
      <PageTitle title="Sparring matcher" sub="Pairs sharing sessions (style-aware shortlist)" />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Player A</th><th>Player B</th><th>Shared sessions</th><th>Styles</th></tr></thead>
        <tbody>{pairs.map((p: any, i: number) => (
          <tr key={i}><td className="font-semibold">{p.a.name}</td><td className="font-semibold">{p.b.name}</td>
            <td>{p.shared}</td><td className="text-xs">{p.a.playing_style ?? '—'} × {p.b.playing_style ?? '—'}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Phase 6: competition auto-suggest (entry gaps → suggested) ---------- */
export function AutoSuggest() {
  const { staff } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const load = async () => {
    const [{ data: e }, { data: m }, { data: en }] = await Promise.all([
      supabase.from('events').select('id,name,starts_on,entry_deadline').eq('status', 'published').order('starts_on'),
      supabase.from('members').select('id,name'),
      supabase.from('event_entries').select('event_id,member_id'),
    ]);
    setEvents(e ?? []); setMembers(m ?? []); setEntries(en ?? []);
  };
  useEffect(() => { load(); }, []);
  const suggest = async (eventId: string) => {
    const have = new Set(entries.filter((e: any) => e.event_id === eventId).map((e: any) => e.member_id));
    const missing = members.filter((m: any) => !have.has(m.id));
    for (const m of missing) {
      await supabase.from('event_entries').insert({ event_id: eventId, member_id: m.id, status: 'suggested', suggested_by: staff?.user_id });
    }
    setMsg(`Suggested ${missing.length} members.`);
    load();
  };
  return (
    <div>
      <PageTitle title="Competition auto-suggest" sub="Members with no entry → suggested" />
      {msg && <p className="text-sm mb-2">{msg}</p>}
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Event</th><th>Starts</th><th>Entries</th><th></th></tr></thead>
        <tbody>{events.map((e: any) => {
          const n = entries.filter((x: any) => x.event_id === e.id).length;
          return <tr key={e.id}><td className="font-semibold">{e.name}</td><td>{e.starts_on}</td><td>{n}/{members.length}</td>
            <td><button className="btn btn-primary" onClick={() => suggest(e.id)}>Suggest missing</button></td></tr>;
        })}</tbody>
      </table></div>
    </div>
  );
}
