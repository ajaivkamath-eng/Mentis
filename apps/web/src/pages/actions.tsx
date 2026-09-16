import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { createManualAction } from '@mentis/core';

/* ---------- Manual actions on others, linked to ANY entity ---------- */
const LINK_TABLES: Record<string, { table: string; label: string }> = {
  session: { table: 'sessions', label: 'name' },
  task: { table: 'tasks', label: 'title' },
  venue: { table: 'venues', label: 'name' },
  member: { table: 'members', label: 'name' },
  event: { table: 'events', label: 'name' },
  invoice: { table: 'invoices', label: 'period_start' },
};

export function ActionCreate() {
  const { staff } = useAuth();
  const [types, setTypes] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [linkType, setLinkType] = useState('session');
  const [linkRows, setLinkRows] = useState<any[]>([]);
  const [form, setForm] = useState({ type_id: '', title: '', assignee_id: '', linked_id: '', due_at: '', breach_at: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => {
    supabase.from('mentis_action_types').select('*').then(({ data }) => { setTypes(data ?? []); setForm((f) => ({ ...f, type_id: f.type_id || data?.[0]?.id || '' })); });
    supabase.from('mentis_staff').select('id,display_name').then(({ data }) => setStaffList(data ?? []));
  }, []);
  useEffect(() => {
    const t = LINK_TABLES[linkType];
    supabase.from(t.table).select(`id,${t.label}`).limit(30).then(({ data }) => setLinkRows(data ?? []));
  }, [linkType]);
  const save = async () => {
    try {
      const draft = createManualAction({
        title: form.title, assigneeId: form.assignee_id, linkedEntityType: linkType,
        linkedEntityId: form.linked_id, dueAt: new Date(form.due_at).toISOString(),
        breachAt: form.breach_at ? new Date(form.breach_at).toISOString() : undefined,
      }, form.type_id);
      await supabase.from('mentis_pending_actions').insert({
        organization_id: staff?.organization_id, action_type_id: draft.actionTypeId, title: draft.title,
        assignee_id: draft.assigneeId, linked_entity_type: draft.linkedEntityType,
        linked_entity_id: draft.linkedEntityId, due_at: draft.dueAt, breach_at: draft.breachAt ?? null, status: 'open',
      });
      setMsg('Action created.');
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  return (
    <div>
      <PageTitle title="New manual action" sub="Any manager & staff can create actions on others (§6.9)" />
      <div className="card p-4 flex flex-col gap-2" style={{ maxWidth: 560 }}>
        <select className="input" value={form.type_id} onChange={(e) => setForm({ ...form, type_id: e.target.value })}>
          {types.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.trigger})</option>)}
        </select>
        <input className="input" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <select className="input" value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
          <option value="">Assignee…</option>{staffList.map((s: any) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={linkType} onChange={(e) => setLinkType(e.target.value)}>
            {Object.keys(LINK_TABLES).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select className="input" value={form.linked_id} onChange={(e) => setForm({ ...form, linked_id: e.target.value })}>
            <option value="">Linked {linkType}…</option>
            {linkRows.map((r: any) => <option key={r.id} value={r.id}>{r[LINK_TABLES[linkType].label]}</option>)}
          </select>
          <label className="text-sm">Due <input type="datetime-local" className="input" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></label>
          <label className="text-sm">Breach at <input type="datetime-local" className="input" value={form.breach_at} onChange={(e) => setForm({ ...form, breach_at: e.target.value })} /></label>
        </div>
        <button className="btn btn-primary" style={{ width: 'fit-content' }} onClick={save}>Create action</button>
        {msg && <p className="text-sm">{msg}</p>}
      </div>
    </div>
  );
}
