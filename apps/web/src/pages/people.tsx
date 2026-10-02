import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { demoEnabled, isDemoSession } from '../lib/demo';
import { addDemoCustomer, addDemoMember, demoCustomersSnapshot } from '../lib/people-data';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { validateMember, ageAt, TAG_TYPE_DEFINITIONS, createQualificationReminderAction, qualificationDocumentStoragePath, qualificationReminderStatus, coachQualificationChecklistSummary } from '@mentis/core';

const demoPeopleMode = () => demoEnabled || isDemoSession();

/* ---------- Member create/edit (under-18 validation blocks save) ---------- */
export function MemberForm() {
  const { staff } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [memberTagTypes, setMemberTagTypes] = useState<any[]>([]);
  const [memberTagValues, setMemberTagValues] = useState<any[]>([]);
  const [selectedTags, setSelectedTags] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState({ name: '', dateOfBirth: '', customer_id: '', nokName: '', nokPhone: '', tteNumber: '', handedness: '', playingStyle: '', equipmentNotes: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (demoPeopleMode()) {
      setCustomers(demoCustomersSnapshot().map((customer) => ({ id: customer.id, name: customer.name })));
      setMemberTagTypes(TAG_TYPE_DEFINITIONS.filter((tag) => tag.scope === 'member'));
      setMemberTagValues(TAG_TYPE_DEFINITIONS.flatMap((tag) => tag.options.map((option) => ({ id: `${tag.scope}:${tag.code}:${option.code}`, tag_type_id: tag.code, label: option.label, code: option.code, tag_type_code: tag.code, tag_type_scope: tag.scope }))));
      return;
    }
    supabase.from('mentis_customers').select('id,name').order('name').then(({ data }) => setCustomers(data ?? []));
    Promise.all([
      supabase.from('mentis_tag_types').select('*').eq('scope', 'member').eq('is_active', true).order('sort_order', { ascending: true }),
      supabase.from('mentis_tag_values').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    ]).then(([typesResult, valuesResult]) => {
      const types = typesResult.data ?? [];
      setMemberTagTypes(types);
      setMemberTagValues(valuesResult.data ?? []);
      setSelectedTags(Object.fromEntries(types.map((type: any) => [type.id, type.allow_multiple ? [] : []])));
    });
  }, []);

  const toggleTag = (typeId: string, allowMultiple: boolean, valueId: string) => {
    setSelectedTags((current) => {
      const existing = current[typeId] ?? [];
      if (!allowMultiple) return { ...current, [typeId]: [valueId] };
      const next = existing.includes(valueId)
        ? existing.filter((id) => id !== valueId)
        : [...existing, valueId];
      return { ...current, [typeId]: next };
    });
  };

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
    const { data: member, error } = await supabase.from('mentis_members').insert({
      organization_id: staff?.organization_id, name: form.name, date_of_birth: form.dateOfBirth,
      customer_id: form.customer_id || null, tte_number: form.tteNumber || null,
      handedness: form.handedness || null, playing_style: form.playingStyle || null,
      equipment_notes: form.equipmentNotes || null,
    }).select('id').single();
    if (error) { setMsg(error.message); return; }
    const tagRows: any[] = [];
    for (const tagType of memberTagTypes) {
      const chosen = selectedTags[tagType.id] ?? [];
      for (const valueId of chosen) {
        const tagValue = memberTagValues.find((item: any) => item.id === valueId);
        if (!tagValue) continue;
        tagRows.push({
          organization_id: staff?.organization_id,
          tag_type_id: tagType.id,
          tag_value_id: valueId,
          entity_type: 'member',
          entity_id: member.id,
        });
      }
    }
    if (tagRows.length) {
      await supabase.from('mentis_entity_tags').insert(tagRows);
    }
    if (form.customer_id && (form.nokName || form.nokPhone)) {
      await supabase.from('mentis_customers').update({ nok_name: form.nokName || null, nok_phone: form.nokPhone || null }).eq('id', form.customer_id);
    }
    setMsg(`Saved (age ${ageAt(form.dateOfBirth)}).`);
    setForm({ ...form, name: '' });
    setSelectedTags({});
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

        {!demoPeopleMode() && memberTagTypes.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-sm font-semibold mb-2">Member tags</div>
            <div className="space-y-3">
              {memberTagTypes.map((tagType: any) => {
                const values = memberTagValues.filter((item: any) => item.tag_type_id === tagType.id || item.tag_type_code === tagType.code);
                if (!values.length) return null;
                const selected = selectedTags[tagType.id] ?? [];
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
                              onChange={() => toggleTag(tagType.id, true, value.id)}
                            />
                            {value.label}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <select
                        className="input"
                        value={selected[0] ?? ''}
                        onChange={(e) => toggleTag(tagType.id, false, e.target.value)}
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
    supabase.from('mentis_session_occurrences').select('id,name,start_at').order('start_at', { ascending: false }).limit(30).then(({ data }) => setSessions(data ?? []));
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

export function CoachProfile() {
  const { staff } = useAuth();
  const [qualificationTypes, setQualificationTypes] = useState<any[]>([]);
  const [qualifications, setQualifications] = useState<any[]>([]);
  const [form, setForm] = useState({ qualification_type_id: '', title: '', issue_date: '', expires_at: '', document_name: '', document_url: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const mandatoryChecklist = coachQualificationChecklistSummary(qualificationTypes, qualifications);
  const requiredChecklist = mandatoryChecklist.filter((item) => item.required);

  const load = async () => {
    if (!staff?.id || !staff.organization_id) return;
    const [typesResult, qualsResult] = await Promise.all([
      supabase.from('mentis_qualification_types').select('*').eq('organization_id', staff.organization_id).order('name', { ascending: true }),
      supabase.from('mentis_staff_qualifications').select('*, mentis_qualification_types(*)').eq('staff_id', staff.id).order('expires_at', { ascending: true }),
    ]);
    setQualificationTypes(typesResult.data ?? []);
    setQualifications(qualsResult.data ?? []);
  };

  useEffect(() => { void load(); }, [staff?.id, staff?.organization_id]);

  const handleDocumentUpload = async (event: any) => {
    const file = event.target?.files?.[0];
    if (!file || !staff?.id || !staff.organization_id) return;
    const type = qualificationTypes.find((entry: any) => entry.id === form.qualification_type_id);
    const path = qualificationDocumentStoragePath({
      organizationId: staff.organization_id,
      staffId: staff.id,
      qualificationTypeId: form.qualification_type_id || 'custom',
      fileName: file.name,
    });
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
    if (uploadError) {
      alert(uploadError.message);
      return;
    }
    const { data: signed } = await supabase.storage.from('documents').createSignedUrl(path, 60 * 60 * 24 * 7);
    setForm((current) => ({
      ...current,
      document_name: file.name,
      document_url: signed?.signedUrl ?? '',
      title: current.title || type?.name || 'Qualification',
    }));
  };

  const saveQualification = async () => {
    if (!staff?.id || !staff.organization_id || !form.qualification_type_id) return;
    setLoading(true);
    const type = qualificationTypes.find((entry: any) => entry.id === form.qualification_type_id);
    const expiresAt = form.expires_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const status = qualificationReminderStatus(new Date().toISOString(), expiresAt, type?.reminder_days ?? 30);
    const nextTitle = (form.title || type?.name || 'Qualification').trim();
    const { data: row, error } = await supabase.from('mentis_staff_qualifications').insert({
      organization_id: staff.organization_id,
      staff_id: staff.id,
      qualification_type_id: form.qualification_type_id,
      title: nextTitle,
      issue_date: form.issue_date || null,
      expires_at: expiresAt,
      document_url: form.document_url || null,
      document_name: form.document_name || null,
      status,
      notes: form.notes || null,
    }).select('id').single();

    if (!error && row && status === 'expiring_soon') {
      const action = createQualificationReminderAction({
        coachStaffId: staff.id,
        qualificationTitle: nextTitle,
        expiresAt,
        reminderDays: type?.reminder_days ?? 30,
        organizationId: staff.organization_id,
      });
      const { data: existingType } = await supabase.from('mentis_action_types').select('id').eq('organization_id', staff.organization_id).eq('name', 'renew qualification').limit(1).maybeSingle();
      let actionTypeId = existingType?.id;
      if (!actionTypeId) {
        const { data: insertedType } = await supabase.from('mentis_action_types').insert({
          organization_id: staff.organization_id,
          name: 'renew qualification',
          trigger: 'manual',
        }).select('id').single();
        actionTypeId = insertedType?.id;
      }
      if (actionTypeId) {
        await supabase.from('mentis_pending_actions').insert({
          organization_id: action.organizationId,
          action_type_id: actionTypeId,
          title: action.title,
          assignee_id: action.assigneeId,
          due_at: action.dueAt,
          linked_entity_type: 'staff',
          linked_entity_id: staff.id,
          status: 'open',
        });
      }
    }
    if (!error) {
      setForm({ qualification_type_id: '', title: '', issue_date: '', expires_at: '', document_name: '', document_url: '', notes: '' });
      await load();
    }
    setLoading(false);
  };

  return (
    <div>
      <PageTitle title="My coach profile" sub="Certificates, safeguarding, DBS and other coach requirements" />
      <div className="space-y-4">
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">Mandatory checklist</div>
            <span className="badge" style={{ background: 'var(--surface-inset)' }}>{requiredChecklist.filter((item) => item.isComplete).length}/{requiredChecklist.length} complete</span>
          </div>
          {requiredChecklist.length === 0 ? (
            <div className="text-sm text-slate-500">No required qualification types configured.</div>
          ) : (
            <div className="space-y-2">
              {requiredChecklist.map((item) => (
                <div key={item.qualificationTypeId} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                  <div>
                    <div className="text-sm font-semibold">{item.name}</div>
                    <div className="text-[11px] uppercase tracking-[0.08em] text-slate-500">{item.category} · {item.requiresDocumentUpload ? 'proof required' : 'proof optional'}</div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-medium" style={{ color: item.isComplete ? 'var(--success)' : item.status === 'expired' ? 'var(--danger)' : 'var(--warning)' }}>{item.isComplete ? 'Complete' : item.status === 'expired' ? 'Expired' : item.status === 'expiring_soon' ? 'Action needed' : 'Missing'}</div>
                    <div className="text-slate-500">{item.hasDocument ? 'proof uploaded' : item.requiresDocumentUpload ? 'proof missing' : 'no proof required'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="mb-3 text-sm font-semibold">Current qualifications</div>
          {qualifications.length === 0 ? (
            <div className="text-sm text-slate-500">No qualifications added yet.</div>
          ) : (
            <div className="space-y-3">
              {qualifications.map((qualification: any) => {
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
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      {qualification.document_url ? <a href={qualification.document_url} target="_blank" rel="noreferrer" className="underline">View proof</a> : <span>No proof uploaded</span>}
                      {qualification.document_name && <span>({qualification.document_name})</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="mb-3 text-sm font-semibold">Add or renew a qualification</div>
          <div className="grid md:grid-cols-2 gap-2">
            <select className="input" value={form.qualification_type_id} onChange={(e) => setForm({ ...form, qualification_type_id: e.target.value })}>
              <option value="">Select qualification type…</option>
              {qualificationTypes.map((type: any) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
            <input className="input" placeholder="Title override" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid md:grid-cols-2 gap-2 mt-2">
            <label className="text-sm">Issue date <input type="date" className="input" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></label>
            <label className="text-sm">Expiry date <input type="date" className="input" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></label>
          </div>
          <div className="grid md:grid-cols-2 gap-2 mt-2">
            <label className="text-sm">Proof document <input type="file" className="input" accept="image/*,.pdf" onChange={handleDocumentUpload} /></label>
            <input className="input" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {form.document_name && <div className="mt-2 text-xs text-slate-600">Uploaded: {form.document_name}</div>}
          <button className="btn btn-primary mt-3" onClick={() => void saveQualification()} disabled={loading}>{loading ? 'Saving…' : 'Save qualification'}</button>
        </div>
      </div>
    </div>
  );
}
