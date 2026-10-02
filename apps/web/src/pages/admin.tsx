import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, functionsUrl } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { rankResults, coachHours, tasterFunnel, csvOf, exportToCSV, anonymiseMember, qualificationReminderStatus } from '@mentis/core';

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
  const [staffTagTypes, setStaffTagTypes] = useState<any[]>([]);
  const [staffTagValues, setStaffTagValues] = useState<any[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [selectedStaffTags, setSelectedStaffTags] = useState<Record<string, string[]>>({});
  const [qualificationTypes, setQualificationTypes] = useState<any[]>([]);
  const [qualifications, setQualifications] = useState<any[]>([]);
  const [qualificationForm, setQualificationForm] = useState({
    qualification_type_id: '',
    title: '',
    issue_date: '',
    expires_at: '',
    document_name: '',
    document_url: '',
    notes: '',
  });

  const load = async (staffId = selectedStaffId) => {
    const { data } = await supabase.from('mentis_staff').select('*');
    const nextRows = data ?? [];
    setRows(nextRows);
    if (staffId) {
      const { data: currentTags } = await supabase.from('mentis_entity_tags')
        .select('tag_type_id, tag_value_id, entity_type')
        .eq('entity_id', staffId)
        .in('entity_type', ['coach', 'sparrer']);
      const next: Record<string, string[]> = {};
      for (const row of currentTags ?? []) {
        next[row.tag_type_id] = [...(next[row.tag_type_id] ?? []), row.tag_value_id];
      }
      setSelectedStaffTags(next);
    }
  };

  const loadQualificationConfig = async (staffId = selectedStaffId) => {
    if (!staffId) {
      setQualifications([]);
      setQualificationTypes([]);
      return;
    }
    const selected = rows.find((r: any) => r.id === staffId) ?? null;
    if (!selected) return;
    const [typeResult, qualificationResult] = await Promise.all([
      supabase.from('mentis_qualification_types').select('*').eq('organization_id', selected.organization_id).order('name', { ascending: true }),
      supabase.from('mentis_staff_qualifications').select('*, mentis_qualification_types(*)').eq('staff_id', staffId).order('expires_at', { ascending: true }),
    ]);
    setQualificationTypes(typeResult.data ?? []);
    setQualifications(qualificationResult.data ?? []);
  };

  useEffect(() => {
    const loadTagConfig = async () => {
      const [typeResult, valueResult] = await Promise.all([
        supabase.from('mentis_tag_types').select('*').eq('is_active', true).in('scope', ['coach', 'sparrer']).order('sort_order', { ascending: true }),
        supabase.from('mentis_tag_values').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      ]);
      setStaffTagTypes(typeResult.data ?? []);
      setStaffTagValues(valueResult.data ?? []);
    };
    load();
    loadTagConfig();
  }, []);

  useEffect(() => {
    if (selectedStaffId) {
      void loadQualificationConfig(selectedStaffId);
    }
  }, [selectedStaffId, rows]);

  const setRoles = async (id: string, roles: string[]) => {
    await supabase.from('mentis_staff').update({ roles }).eq('id', id);
    load();
  };

  const handleDocumentUpload = (event: any) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setQualificationForm((current) => ({ ...current, document_name: file.name, document_url: String(reader.result ?? '') }));
    };
    reader.readAsDataURL(file);
  };

  const saveQualification = async () => {
    if (!selectedStaffId) return;
    const selectedStaff = rows.find((r: any) => r.id === selectedStaffId);
    if (!selectedStaff || !qualificationForm.qualification_type_id) return;
    const type = qualificationTypes.find((entry: any) => entry.id === qualificationForm.qualification_type_id);
    const expiresAt = qualificationForm.expires_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const status = qualificationReminderStatus(new Date().toISOString(), expiresAt, type?.reminder_days ?? 30);
    const { error } = await supabase.from('mentis_staff_qualifications').insert({
      organization_id: selectedStaff.organization_id,
      staff_id: selectedStaffId,
      qualification_type_id: qualificationForm.qualification_type_id,
      title: (qualificationForm.title || type?.name || 'Qualification').trim(),
      issue_date: qualificationForm.issue_date || null,
      expires_at: expiresAt,
      document_url: qualificationForm.document_url || null,
      document_name: qualificationForm.document_name || null,
      status,
      notes: qualificationForm.notes || null,
    });
    if (!error) {
      setQualificationForm({
        qualification_type_id: '',
        title: '',
        issue_date: '',
        expires_at: '',
        document_name: '',
        document_url: '',
        notes: '',
      });
      void loadQualificationConfig(selectedStaffId);
    }
  };

  const selectedStaff = rows.find((r: any) => r.id === selectedStaffId) ?? rows[0] ?? null;
  const relevantTagTypes = staffTagTypes.filter((tagType: any) => {
    const roles = selectedStaff?.roles ?? [];
    return (tagType.scope === 'coach' && roles.includes('COACH')) || (tagType.scope === 'sparrer' && roles.includes('SPARRER'));
  });

  const toggleStaffTag = (typeId: string, valueId: string, allowMultiple: boolean) => {
    setSelectedStaffTags((current) => {
      const existing = current[typeId] ?? [];
      if (!allowMultiple) return { ...current, [typeId]: [valueId] };
      const next = existing.includes(valueId) ? existing.filter((id) => id !== valueId) : [...existing, valueId];
      return { ...current, [typeId]: next };
    });
  };

  const saveStaffTags = async () => {
    if (!selectedStaffId) return;
    const scopeSet = new Set<string>();
    const staffRoles = selectedStaff?.roles ?? [];
    if (staffRoles.includes('COACH')) scopeSet.add('coach');
    if (staffRoles.includes('SPARRER')) scopeSet.add('sparrer');
    if (!scopeSet.size) return;

    const rowsToDelete = Array.from(scopeSet).map((scope) => ({ entity_id: selectedStaffId, entity_type: scope }));
    for (const row of rowsToDelete) {
      await supabase.from('mentis_entity_tags').delete().match(row);
    }

    const insertRows: any[] = [];
    for (const tagType of staffTagTypes) {
      const selected = selectedStaffTags[tagType.id] ?? [];
      if (!selected.length) continue;
      if (!scopeSet.has(tagType.scope)) continue;
      for (const valueId of selected) {
        const value = staffTagValues.find((entry: any) => entry.id === valueId && entry.tag_type_id === tagType.id);
        if (!value) continue;
        insertRows.push({
          organization_id: selectedStaff?.organization_id,
          tag_type_id: tagType.id,
          tag_value_id: valueId,
          entity_type: tagType.scope,
          entity_id: selectedStaffId,
        });
      }
    }
    if (insertRows.length) {
      await supabase.from('mentis_entity_tags').insert(insertRows);
    }
  };

  return (
    <div>
      <PageTitle title="Users & roles" sub="Staff accounts come from Rally · Mentis roles assigned here" />
      <div className="card p-2 mb-4"><table className="grid">
        <thead><tr><th>Name</th><th>Roles (multi-role)</th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id} className={selectedStaffId === r.id ? 'bg-slate-50' : ''}><td className="font-semibold"><button className="text-left underline" onClick={() => { setSelectedStaffId(r.id); void load(r.id); }}>{r.display_name}</button></td>
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

      {selectedStaff && (selectedStaff.roles.includes('COACH') || selectedStaff.roles.includes('SPARRER')) && (
        <div className="card p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-semibold">Coach & sparrer tags</div>
              <div className="text-xs uppercase tracking-[0.08em] text-slate-500">{selectedStaff.display_name}</div>
            </div>
            <button className="btn btn-primary" onClick={() => void saveStaffTags()}>Save tags</button>
          </div>
          <div className="space-y-3">
            {relevantTagTypes.map((tagType: any) => {
              const values = staffTagValues.filter((value: any) => value.tag_type_id === tagType.id);
              if (!values.length) return null;
              const selected = selectedStaffTags[tagType.id] ?? [];
              return (
                <div key={tagType.id}>
                  <div className="text-xs uppercase tracking-[0.08em] text-slate-500 mb-1">{tagType.label}</div>
                  {tagType.allow_multiple ? (
                    <div className="flex flex-wrap gap-2">
                      {values.map((value: any) => (
                        <label key={value.id} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={selected.includes(value.id)}
                            onChange={() => toggleStaffTag(tagType.id, value.id, true)}
                          />
                          {value.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <select
                      className="input"
                      value={selected[0] ?? ''}
                      onChange={(e) => toggleStaffTag(tagType.id, e.target.value, false)}
                    >
                      <option value="">Select {tagType.label}</option>
                      {values.map((value: any) => (
                        <option key={value.id} value={value.id}>{value.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedStaff && selectedStaff.roles.includes('COACH') && (
        <div className="card p-4 mt-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-semibold">Coach qualification profile</div>
              <div className="text-xs uppercase tracking-[0.08em] text-slate-500">{selectedStaff.display_name}</div>
            </div>
          </div>

          <div className="space-y-3">
            {qualifications.length === 0 ? (
              <div className="text-sm text-slate-500">No qualification records yet.</div>
            ) : (
              qualifications.map((qualification: any) => {
                const type = qualification.mentis_qualification_types ?? qualificationTypes.find((entry: any) => entry.id === qualification.qualification_type_id);
                const status = qualificationReminderStatus(new Date().toISOString(), qualification.expires_at, type?.reminder_days ?? 30);
                const badgeColor = status === 'expired' ? 'var(--danger)' : status === 'expiring_soon' ? 'var(--warning)' : 'var(--success)';
                return (
                  <div key={qualification.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-sm">{qualification.title || type?.name || 'Qualification'}</div>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-slate-500">{type?.category || 'certificate'} · {qualification.expires_at ? new Date(qualification.expires_at).toLocaleDateString('en-GB') : 'No expiry date'}</div>
                      </div>
                      <span className="badge" style={{ background: badgeColor }}>{status}</span>
                    </div>
                    <div className="mt-2 text-xs flex flex-wrap items-center gap-3 text-slate-600">
                      {qualification.document_url ? <a href={qualification.document_url} target="_blank" rel="noreferrer" className="underline">View proof</a> : <span>No proof uploaded</span>}
                      {qualification.document_name && <span>({qualification.document_name})</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3 space-y-3">
            <div className="text-sm font-semibold">Add qualification entry</div>
            <div className="grid md:grid-cols-2 gap-2">
              <select className="input" value={qualificationForm.qualification_type_id} onChange={(e) => setQualificationForm({ ...qualificationForm, qualification_type_id: e.target.value })}>
                <option value="">Select qualification type…</option>
                {qualificationTypes.map((type: any) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
              <input className="input" placeholder="Title override" value={qualificationForm.title} onChange={(e) => setQualificationForm({ ...qualificationForm, title: e.target.value })} />
            </div>
            <div className="grid md:grid-cols-2 gap-2">
              <label className="text-sm">Issue date <input type="date" className="input" value={qualificationForm.issue_date} onChange={(e) => setQualificationForm({ ...qualificationForm, issue_date: e.target.value })} /></label>
              <label className="text-sm">Expiry date <input type="date" className="input" value={qualificationForm.expires_at} onChange={(e) => setQualificationForm({ ...qualificationForm, expires_at: e.target.value })} /></label>
            </div>
            <div className="grid md:grid-cols-2 gap-2">
              <label className="text-sm">Proof document <input type="file" className="input" accept="image/*,.pdf" onChange={handleDocumentUpload} /></label>
              <input className="input" placeholder="Notes" value={qualificationForm.notes} onChange={(e) => setQualificationForm({ ...qualificationForm, notes: e.target.value })} />
            </div>
            {qualificationForm.document_name && <div className="text-xs text-slate-600">Uploaded: {qualificationForm.document_name}</div>}
            <button className="btn btn-primary" onClick={() => void saveQualification()}>Save qualification</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Settings: org, action types, broadcast ---------- */
export function Settings() {
  const { staff, canDo } = useAuth();
  const [types, setTypes] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [groups, setGroups] = useState<any[]>([]);
  const [tagTypes, setTagTypes] = useState<any[]>([]);
  const [tagValues, setTagValues] = useState<any[]>([]);
  const [qualificationTypes, setQualificationTypes] = useState<any[]>([]);
  const [newTagTypeCode, setNewTagTypeCode] = useState('');
  const [newTagTypeLabel, setNewTagTypeLabel] = useState('');
  const [newTagTypeScope, setNewTagTypeScope] = useState('member');
  const [newTagValueTypeId, setNewTagValueTypeId] = useState('');
  const [newTagValueLabel, setNewTagValueLabel] = useState('');
  const [newQualificationType, setNewQualificationType] = useState({
    name: '',
    category: 'certificate',
    validity_months: 12,
    reminder_days: 30,
    requires_document_upload: true,
    is_mandatory: true,
  });
  const [broadcast, setBroadcast] = useState({ group: '', subject: 'Half-term arrangements', body: '' });

  const loadTagConfig = async () => {
    if (!staff?.organization_id) return;
    const [tagResult, valueResult, qualificationResult] = await Promise.all([
      supabase.from('mentis_tag_types').select('*').eq('organization_id', staff.organization_id).order('sort_order', { ascending: true }),
      supabase.from('mentis_tag_values').select('*').eq('organization_id', staff.organization_id).order('sort_order', { ascending: true }),
      supabase.from('mentis_qualification_types').select('*').eq('organization_id', staff.organization_id).order('name', { ascending: true }),
    ]);
    setTagTypes(tagResult.data ?? []);
    setTagValues(valueResult.data ?? []);
    setQualificationTypes(qualificationResult.data ?? []);
    if ((tagResult.data ?? []).length && !newTagValueTypeId) {
      setNewTagValueTypeId((tagResult.data ?? [])[0].id);
    }
  };

  useEffect(() => {
    supabase.from('mentis_action_types').select('*').then(({ data }) => setTypes(data ?? []));
    supabase.from('mentis_groups').select('id,name').then(({ data }) => setGroups(data ?? []));
    loadTagConfig();
  }, [staff?.organization_id]);

  const addType = async () => {
    if (!name.trim()) return;
    await supabase.from('mentis_action_types').insert({ organization_id: staff?.organization_id, name, trigger: 'manual' });
    setName('');
    supabase.from('mentis_action_types').select('*').then(({ data }) => setTypes(data ?? []));
  };

  const addCustomTagType = async () => {
    if (!staff?.organization_id || !newTagTypeCode.trim() || !newTagTypeLabel.trim()) return;
    const code = newTagTypeCode.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const { error } = await supabase.from('mentis_tag_types').insert({
      organization_id: staff.organization_id,
      scope: newTagTypeScope,
      code,
      label: newTagTypeLabel.trim(),
      kind: 'custom',
      allow_multiple: true,
      is_system: false,
      is_active: true,
      sort_order: (tagTypes.filter((t: any) => t.kind === 'custom').length + 1) * 10,
    });
    if (!error) {
      setNewTagTypeCode('');
      setNewTagTypeLabel('');
      setNewTagTypeScope('member');
      loadTagConfig();
    }
  };

  const addCustomTagValue = async () => {
    if (!staff?.organization_id || !newTagValueTypeId || !newTagValueLabel.trim()) return;
    const code = newTagValueLabel.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const { error } = await supabase.from('mentis_tag_values').insert({
      organization_id: staff.organization_id,
      tag_type_id: newTagValueTypeId,
      code,
      label: newTagValueLabel.trim(),
      is_active: true,
      sort_order: (tagValues.filter((v: any) => v.tag_type_id === newTagValueTypeId).length + 1) * 10,
    });
    if (!error) {
      setNewTagValueLabel('');
      loadTagConfig();
    }
  };

  const addQualificationType = async () => {
    if (!staff?.organization_id || !newQualificationType.name.trim()) return;
    const { error } = await supabase.from('mentis_qualification_types').insert({
      organization_id: staff.organization_id,
      name: newQualificationType.name.trim(),
      category: newQualificationType.category,
      validity_months: Number(newQualificationType.validity_months) || 12,
      reminder_days: Number(newQualificationType.reminder_days) || 30,
      requires_document_upload: Boolean(newQualificationType.requires_document_upload),
      is_mandatory: Boolean(newQualificationType.is_mandatory),
      active: true,
    });
    if (!error) {
      setNewQualificationType({
        name: '',
        category: 'certificate',
        validity_months: 12,
        reminder_days: 30,
        requires_document_upload: true,
        is_mandatory: true,
      });
      loadTagConfig();
    }
  };

  const sendBroadcast = async () => {
    const { data: members } = await supabase
      .from('mentis_group_members')
      .select('member_id,mentis_members!member_id_fkey(mentis_customers!customer_id_fkey(email))')
      .eq('group_id', broadcast.group);
    for (const m of members ?? []) {
      const email = (m as any).mentis_members?.mentis_customers?.email;
      if (email) await fetch(functionsUrl('send-email'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: staff?.organization_id, to: email, subject: broadcast.subject, body: broadcast.body, template: 'custom', kind: 'broadcast', groupId: broadcast.group }) });
    }
    alert('Broadcast queued.');
  };

  const tagValuesByType = tagTypes.reduce((acc: Record<string, any[]>, tagType: any) => {
    acc[tagType.id] = tagValues.filter((value: any) => value.tag_type_id === tagType.id);
    return acc;
  }, {});

  return (
    <div>
      <PageTitle title="Settings" sub="Organization, action types, custom tags, broadcasts" />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="font-bold mb-2">Custom action types</h3>
          {types.map((t: any) => <div key={t.id} className="text-sm py-1">• {t.name} <em>({t.trigger})</em></div>)}
          {canDo('org.manage') && <div className="flex gap-2 mt-2"><input className="input" placeholder="New type…" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn btn-primary" onClick={addType}>Add</button></div>}
        </div>

        <div className="card p-4">
          <h3 className="font-bold mb-2">Qualification catalogue</h3>
          <div className="space-y-2">
            {(qualificationTypes.length ? qualificationTypes : []).map((qualification: any) => (
              <div key={qualification.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="font-semibold">{qualification.name}</div>
                <div className="text-xs uppercase tracking-[0.08em] text-slate-500">{qualification.category} · reminder {qualification.reminder_days}d</div>
                <div className="text-xs text-slate-600">{qualification.requires_document_upload ? 'Proof upload required' : 'No proof upload'} · {qualification.is_mandatory ? 'Mandatory' : 'Optional'}</div>
              </div>
            ))}
            {!qualificationTypes.length && <div className="text-sm text-slate-500">No qualification types configured yet.</div>}

            {canDo('org.manage') && (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-3 space-y-2">
                <input className="input" placeholder="Qualification name" value={newQualificationType.name} onChange={(e) => setNewQualificationType({ ...newQualificationType, name: e.target.value })} />
                <div className="grid md:grid-cols-2 gap-2">
                  <select className="input" value={newQualificationType.category} onChange={(e) => setNewQualificationType({ ...newQualificationType, category: e.target.value })}>
                    <option value="certificate">Certificate</option>
                    <option value="course">Course</option>
                    <option value="safeguarding">Safeguarding</option>
                    <option value="dbs">DBS</option>
                    <option value="first_aid">First aid</option>
                    <option value="other">Other</option>
                  </select>
                  <input className="input" type="number" min="1" value={newQualificationType.validity_months} onChange={(e) => setNewQualificationType({ ...newQualificationType, validity_months: Number(e.target.value) })} />
                </div>
                <div className="grid md:grid-cols-2 gap-2">
                  <input className="input" type="number" min="0" value={newQualificationType.reminder_days} onChange={(e) => setNewQualificationType({ ...newQualificationType, reminder_days: Number(e.target.value) })} />
                  <label className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-slate-500"><input type="checkbox" checked={newQualificationType.requires_document_upload} onChange={(e) => setNewQualificationType({ ...newQualificationType, requires_document_upload: e.target.checked })} /> proof upload</label>
                </div>
                <label className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-slate-500"><input type="checkbox" checked={newQualificationType.is_mandatory} onChange={(e) => setNewQualificationType({ ...newQualificationType, is_mandatory: e.target.checked })} /> mandatory</label>
                <button className="btn btn-primary" onClick={addQualificationType}>Add qualification type</button>
              </div>
            )}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="font-bold mb-2">Tag taxonomy</h3>
          <div className="space-y-3">
            {tagTypes.map((tagType: any) => (
              <div key={tagType.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm">{tagType.label}</div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-slate-500">{tagType.scope} · {tagType.kind}</div>
                  </div>
                  <span className="badge" style={{ background: tagType.is_system ? 'var(--surface-inset)' : 'var(--surface-alt)' }}>{tagType.is_system ? 'system' : 'custom'}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(tagValuesByType[tagType.id] ?? []).slice(0, 8).map((value: any) => (
                    <span key={value.id} className="badge" style={{ background: 'var(--surface-inset)' }}>{value.label}</span>
                  ))}
                  {!(tagValuesByType[tagType.id] ?? []).length && <span className="text-xs text-slate-500">No values configured yet</span>}
                </div>
              </div>
            ))}
          </div>

          {canDo('org.manage') && (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3">
              <div className="text-sm font-semibold mb-2">Add custom tag type</div>
              <div className="grid md:grid-cols-2 gap-2">
                <input className="input" placeholder="Code e.g. athlete_band" value={newTagTypeCode} onChange={(e) => setNewTagTypeCode(e.target.value)} />
                <input className="input" placeholder="Label e.g. Athlete band" value={newTagTypeLabel} onChange={(e) => setNewTagTypeLabel(e.target.value)} />
                <select className="input" value={newTagTypeScope} onChange={(e) => setNewTagTypeScope(e.target.value)}>
                  <option value="member">Member</option>
                  <option value="coach">Coach</option>
                  <option value="sparrer">Sparrer</option>
                  <option value="program">Program</option>
                  <option value="program_template">Program template</option>
                  <option value="session">Session</option>
                </select>
                <button className="btn btn-primary" onClick={addCustomTagType}>Add type</button>
              </div>
            </div>
          )}

          {canDo('org.manage') && (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3">
              <div className="text-sm font-semibold mb-2">Add value to selected tag type</div>
              <div className="grid md:grid-cols-[1.2fr_1fr_auto] gap-2">
                <select className="input" value={newTagValueTypeId} onChange={(e) => setNewTagValueTypeId(e.target.value)}>
                  <option value="">Tag type…</option>
                  {tagTypes.map((tagType: any) => (
                    <option key={tagType.id} value={tagType.id}>{tagType.label}</option>
                  ))}
                </select>
                <input className="input" placeholder="Value label" value={newTagValueLabel} onChange={(e) => setNewTagValueLabel(e.target.value)} />
                <button className="btn btn-primary" onClick={addCustomTagValue}>Add value</button>
              </div>
            </div>
          )}
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
    const { data: m } = await supabase.from('mentis_members').select('*,mentis_customers!customer_id_fkey(*)').eq('id', memberId).single();
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
