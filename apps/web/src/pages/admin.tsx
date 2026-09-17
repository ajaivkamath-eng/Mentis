import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, functionsUrl } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { rankResults, coachHours, tasterFunnel, csvOf, exportToCSV, anonymiseMember } from '@mentis/core';

const LAST_LOGIN_EMAIL_KEY = 'mentis.lastLoginEmail';

/* ---------- Login (Supabase Auth — same credentials as Rally) ---------- */
export function Login() {
  const [email, setEmail] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.localStorage.getItem(LAST_LOGIN_EMAIL_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const trimmed = email.trim();
      if (trimmed) window.localStorage.setItem(LAST_LOGIN_EMAIL_KEY, trimmed);
      else window.localStorage.removeItem(LAST_LOGIN_EMAIL_KEY);
    } catch {
      /* ignore private-mode / quota errors */
    }
  }, [email]);

  const go = async () => {
    const trimmedEmail = email.trim();
    const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
    if (error) setErr(error.message);
    else window.location.href = '/';
  };
  return (
    <div className="dark flex items-center justify-center" style={{ minHeight: '100vh' }}>
      <div className="card p-6" style={{ width: 380 }}>
        <h1 className="text-2xl font-black mb-1">Mentis</h1>
        <p className="text-sm mb-4" style={{ color: 'var(--ink-muted)' }}>Kingfisher TTC — sign in with your Rally account</p>
        <input className="input mb-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input mb-3" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        {err && <p className="text-sm mb-2" style={{ color: 'var(--danger)' }}>{err}</p>}
        <button className="btn btn-primary w-full justify-center" onClick={go}>Sign in</button>
      </div>
    </div>
  );
}

/* ---------- Role-based dashboards ---------- */
export function Dashboard() {
  const { role, staff, canDo } = useAuth();
  const [stats, setStats] = useState({ members: 0, tasters: 0, breached: 0, debits: 0, funnel: {} as Record<string, number> });
  useEffect(() => {
    (async () => {
      const [m, t, b, c] = await Promise.all([
        supabase.from('mentis_members').select('id', { count: 'exact', head: true }),
        supabase.from('mentis_prospects').select('status'),
        supabase.from('mentis_pending_actions').select('id', { count: 'exact', head: true }).eq('status', 'breached'),
        supabase.from('mentis_customer_charges').select('amount_cents').eq('status', 'outstandingDebit'),
      ]);
      setStats({
        members: m.count ?? 0, tasters: (t.data ?? []).filter((x: any) => x.status === 'requested').length,
        breached: b.count ?? 0, debits: (c.data ?? []).reduce((s: number, r: any) => s + r.amount_cents, 0),
        funnel: tasterFunnel((t.data ?? []) as any),
      });
    })();
  }, []);
  return (
    <div>
      <PageTitle title={`Welcome, ${staff?.display_name ?? ''}`} sub={`Active role: ${role}`} />
      <div className="grid md:grid-cols-4 gap-4">
        <Link to="/members" className="card p-4"><div className="text-sm" style={{ color: 'var(--ink-muted)' }}>Members</div><div className="text-2xl font-black">{stats.members}</div></Link>
        <Link to="/tasters" className="card p-4"><div className="text-sm" style={{ color: 'var(--ink-muted)' }}>Taster requests</div><div className="text-2xl font-black">{stats.tasters}</div><div className="text-xs" style={{ color: 'var(--ink-muted)' }}>tried {stats.funnel.tried ?? 0} · converted {stats.funnel.converted ?? 0}</div></Link>
        <Link to="/inbox" className="card p-4"><div className="text-sm" style={{ color: 'var(--ink-muted)' }}>Breached actions</div><div className="text-2xl font-black">{stats.breached}</div></Link>
        <Link to="/charges" className="card p-4"><div className="text-sm" style={{ color: 'var(--ink-muted)' }}>Outstanding debits</div><div className="text-2xl font-black">£{(stats.debits / 100).toFixed(2)}</div></Link>
      </div>
      {role === 'COACH' && <div className="card p-4 mt-4"><Link to="/today" className="btn btn-primary">Open today's sessions</Link></div>}
      {role === 'SPARRER' && <div className="card p-4 mt-4 text-sm">Your assigned sessions are under <Link to="/today" className="underline">Today</Link>. Registers are read-only for sparrers.</div>}
      {canDo('diary.manage') && <div className="card p-4 mt-4"><Link to="/diary-manage" className="btn btn-ghost">Manager diary</Link> <Link to="/scheduling" className="btn btn-ghost ml-2">Scheduling</Link></div>}
    </div>
  );
}

/* ---------- Global search (RLS-respecting) ---------- */
export function SearchPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const [m, c, s, t2, e] = await Promise.all([
        supabase.from('mentis_members').select('id,name').ilike('name', `%${q}%`).limit(5),
        supabase.from('mentis_customers').select('id,name').ilike('name', `%${q}%`).limit(5),
        supabase.from('mentis_sessions').select('id,name').ilike('name', `%${q}%`).limit(5),
        supabase.from('mentis_tasks').select('id,title').ilike('title', `%${q}%`).limit(5),
        supabase.from('mentis_events').select('id,name').ilike('name', `%${q}%`).limit(5),
      ]);
      const all = [
        ...(m.data ?? []).map((r: any) => ({ kind: 'member', id: r.id, title: r.name })),
        ...(c.data ?? []).map((r: any) => ({ kind: 'customer', id: r.id, title: r.name })),
        ...(s.data ?? []).map((r: any) => ({ kind: 'session', id: r.id, title: r.name })),
        ...(t2.data ?? []).map((r: any) => ({ kind: 'task', id: r.id, title: r.title })),
        ...(e.data ?? []).map((r: any) => ({ kind: 'event', id: r.id, title: r.name })),
      ];
      setResults(rankResults(q, all as any));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const link = (r: any) => r.kind === 'member' ? `/members/${r.id}` : r.kind === 'session' ? `/register/${r.id}` : r.kind === 'event' ? '/events' : r.kind === 'task' ? '/tasks' : '/customers';
  return (
    <div>
      <PageTitle title="Global search" sub="Results respect your role (RLS)" />
      <input className="input mb-3" placeholder="Members, customers, sessions, tasks, events…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card p-2">{results.map((r: any) => (
        <Link key={`${r.kind}-${r.id}`} to={link(r)} className="flex gap-2 py-2 border-b last:border-0 px-2" style={{ borderColor: 'var(--border)' }}>
          <span className="badge" style={{ background: 'var(--surface-inset)' }}>{r.kind}</span><span className="font-semibold">{r.title}</span>
        </Link>))}
      </div>
    </div>
  );
}

/* ---------- Users & roles (Super Admin) ---------- */
export function Users() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => supabase.from('mentis_staff').select('*').then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const setRoles = async (id: string, roles: string[]) => {
    await supabase.from('mentis_staff').update({ roles }).eq('id', id);
    load();
  };
  return (
    <div>
      <PageTitle title="Users & roles" sub="Staff accounts come from Rally · Mentis roles assigned here" />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Name</th><th>Roles (multi-role)</th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}><td className="font-semibold">{r.display_name}</td>
            <td>{['SUPER_ADMIN', 'ADMIN', 'COACH', 'SPARRER'].map((role) => (
              <label key={role} className="mr-3 text-sm">
                <input type="checkbox" checked={r.roles.includes(role)} onChange={(e) => {
                  const next = e.target.checked ? [...r.roles, role] : r.roles.filter((x: string) => x !== role);
                  setRoles(r.id, next);
                }} /> {role}
              </label>))}
            </td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Settings: org, action types, broadcast ---------- */
export function Settings() {
  const { staff, canDo } = useAuth();
  const [types, setTypes] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [groups, setGroups] = useState<any[]>([]);
  const [broadcast, setBroadcast] = useState({ group: '', subject: 'Half-term arrangements', body: '' });
  useEffect(() => {
    supabase.from('mentis_action_types').select('*').then(({ data }) => setTypes(data ?? []));
    supabase.from('mentis_groups').select('id,name').then(({ data }) => setGroups(data ?? []));
  }, []);
  const addType = async () => {
    if (!name.trim()) return;
    await supabase.from('mentis_action_types').insert({ organization_id: staff?.organization_id, name, trigger: 'manual' });
    setName('');
    supabase.from('mentis_action_types').select('*').then(({ data }) => setTypes(data ?? []));
  };
  const sendBroadcast = async () => {
    const { data: members } = await supabase.from('mentis_group_members').select('member_id,mentis_members(mentis_customers(email))').eq('group_id', broadcast.group);
    for (const m of members ?? []) {
      const email = (m as any).mentis_members?.mentis_customers?.email;
      if (email) await fetch(functionsUrl('send-email'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: staff?.organization_id, to: email, subject: broadcast.subject, body: broadcast.body, template: 'custom', kind: 'broadcast', groupId: broadcast.group }) });
    }
    alert('Broadcast queued.');
  };
  return (
    <div>
      <PageTitle title="Settings" sub="Organization, action types, broadcasts" />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="font-bold mb-2">Custom action types</h3>
          {types.map((t: any) => <div key={t.id} className="text-sm py-1">• {t.name} <em>({t.trigger})</em></div>)}
          {canDo('org.manage') && <div className="flex gap-2 mt-2"><input className="input" placeholder="New type…" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn btn-primary" onClick={addType}>Add</button></div>}
        </div>
        <div className="card p-4">
          <h3 className="font-bold mb-2">Group broadcast</h3>
          <select className="input mb-2" value={broadcast.group} onChange={(e) => setBroadcast({ ...broadcast, group: e.target.value })}>
            <option value="">Group…</option>{groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <input className="input mb-2" value={broadcast.subject} onChange={(e) => setBroadcast({ ...broadcast, subject: e.target.value })} />
          <textarea className="input mb-2" rows={3} value={broadcast.body} onChange={(e) => setBroadcast({ ...broadcast, body: e.target.value })} />
          <button className="btn btn-primary" onClick={sendBroadcast}>Send broadcast</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Reports: coaches & hours, GDPR export/erasure ---------- */
export function Reports() {
  const [rows, setRows] = useState<any[]>([]);
  const [memberId, setMemberId] = useState('');
  useEffect(() => {
    supabase.from('mentis_staff_time_entries').select('staff_id,hours,kind,mentis_staff!staff_time_entries_staff_id_fkey(display_name)').then(({ data }) => {
      const list: any[] = (data ?? []) as any[];
      const table = coachHours(list.map((e) => ({ staffId: e.staff_id, hours: Number(e.hours), kind: e.kind })), {});
      setRows(table.map((r) => ({ ...r, name: list.find((d) => d.staff_id === r.staffId)?.mentis_staff?.display_name ?? r.staffId })));
    });
  }, []);
  const gdprExport = async () => {
    const { data: m } = await supabase.from('mentis_members').select('*,mentis_customers(*)').eq('id', memberId).single();
    if (!m) { alert('Member not found'); return; }
    const blob = new Blob([exportToCSV('member', [m])], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gdpr-${memberId}.csv`; a.click();
  };
  const erase = async () => {
    if (!confirm('Anonymise this member (financial records retained)?')) return;
    const { data: m } = await supabase.from('mentis_members').select('*').eq('id', memberId).single();
    if (!m) return;
    const anon = anonymiseMember(m);
    await supabase.from('mentis_members').update({ name: anon.name, photo_ref: null, erased_at: new Date().toISOString() }).eq('id', memberId);
    await supabase.from('mentis_member_medical').delete().eq('member_id', memberId);
    alert('Member anonymised.');
  };
  return (
    <div>
      <PageTitle title="Reports" sub="Coaches & hours · GDPR toolkit" right={
        <button className="btn btn-ghost" onClick={() => {
          const blob = new Blob([csvOf(rows.map((r) => ({ coach: r.name, planned: r.planned, actual: r.actual, total: r.total })))], { type: 'text/csv' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'coach-hours.csv'; a.click();
        }}>Export CSV</button>
      } />
      <div className="card p-2 mb-4"><table className="grid">
        <thead><tr><th>Coach</th><th>Planned</th><th>Actual</th><th>Total</th></tr></thead>
        <tbody>{rows.map((r: any) => <tr key={r.staffId}><td className="font-semibold">{r.name}</td><td>{r.planned}</td><td>{r.actual}</td><td>{r.total}</td></tr>)}</tbody>
      </table></div>
      <div className="card p-4 flex gap-2 items-end">
        <label className="text-sm">Member ID <input className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)} /></label>
        <button className="btn btn-ghost" onClick={gdprExport}>Full record export</button>
        <button className="btn btn-ghost" onClick={erase}>Erasure (anonymise)</button>
      </div>
    </div>
  );
}
