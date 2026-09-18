import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { money, gbp, billedUnbilled } from '@mentis/core';

/* ---------- Billing dashboard: invoiced / outstanding / forecast ---------- */
export function Billing() {
  const { staff, canDo } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [who, setWho] = useState('');
  const [range, setRange] = useState({ start: '2026-01-01', end: '2026-12-31' });
  const [draft, setDraft] = useState<any[]>([]);
  const mine = who || staff?.id;

  const load = async () => {
    let q = supabase.from('mentis_invoices').select('id,staff_id,period_start,period_end,status,mentis_invoice_lines(amount_cents)');
    if (!canDo('billing.viewAll')) q = q.eq('staff_id', staff?.id);
    const { data } = await q;
    setInvoices(data ?? []);
    let e = supabase.from('mentis_staff_time_entries').select('*').gte('starts_at', range.start).lte('starts_at', range.end);
    if (!canDo('timesheet.viewAll')) e = e.eq('staff_id', staff?.id);
    const { data: ed } = await e;
    setEntries(ed ?? []);
    if (canDo('billing.viewAll')) {
      const { data: sl } = await supabase.from('mentis_staff').select('id,display_name');
      setStaffList(sl ?? []);
    }
  };
  useEffect(() => { load(); }, [range.start, range.end]);

  const preview = async () => {
    const { data } = await supabase.from('mentis_staff_time_entries').select('*')
      .eq('staff_id', mine).eq('bill_state', 'unbilled').eq('pending_review', false)
      .gte('starts_at', range.start).lte('starts_at', range.end);
    setDraft(data ?? []);
  };
  const createDraft = async () => {
    if (!draft.length) { alert('Nothing billable in this range.'); return; }
    const { data: inv, error } = await supabase.from('mentis_invoices').insert({
      organization_id: staff?.organization_id, staff_id: mine,
      period_start: range.start, period_end: range.end, status: 'draft', created_by: staff?.user_id,
    }).select('id').single();
    if (error) { alert(error.message); return; }
    for (const e of draft) {
      await supabase.from('mentis_invoice_lines').insert({
        invoice_id: inv.id, time_entry_id: e.id, hours: e.hours, rate_cents: e.rate_cents,
      });
    }
    alert('Draft invoice created.'); setDraft([]); load();
  };
  const approve = async (id: string) => {
    const { error } = await supabase.from('mentis_invoices').update({ status: 'approved', approved_by: staff?.user_id, approved_at: new Date().toISOString() }).eq('id', id);
    if (error) alert(error.message); else load();
  };
  const pay = async (id: string) => {
    const ref = prompt('Payment reference:') ?? '';
    await supabase.from('mentis_invoices').update({ status: 'paid', paid_at: new Date().toISOString(), payment_reference: ref }).eq('id', id);
    load();
  };

  const total = (inv: any) => (inv.invoice_lines ?? []).reduce((s: number, l: any) => s + l.amount_cents, 0);
  const invoiced = invoices.filter((i) => i.status === 'approved' || i.status === 'paid').reduce((s, i) => s + total(i), 0);
  const unpaid = invoices.filter((i) => i.status === 'approved').reduce((s, i) => s + total(i), 0);
  const bb = billedUnbilled(entries.map((e) => ({ id: e.id, staffId: e.staff_id, date: e.starts_at, start: e.starts_at, end: e.ends_at, hours: Number(e.hours), rateCents: e.rate_cents, billable: true, billState: e.bill_state, pendingReview: e.pending_review })), range.start, range.end);
  const unbilledCents = bb.unbilled.reduce((s, e) => s + money(e.hours, e.rateCents), 0);

  return (
    <div>
      <PageTitle title="Billing" sub="Planned vs actual hours → locked hourly-rate invoices" />
      <div className="grid md:grid-cols-3 gap-4 mb-4">
        <div className="card p-4"><div className="text-sm" style={{ color: 'var(--ink-muted)' }}>Invoiced</div><div className="text-2xl font-black">{gbp(invoiced)}</div></div>
        <div className="card p-4"><div className="text-sm" style={{ color: 'var(--ink-muted)' }}>Outstanding (unpaid + unbilled)</div><div className="text-2xl font-black">{gbp(unpaid + unbilledCents)}</div></div>
        <div className="card p-4"><div className="text-sm" style={{ color: 'var(--ink-muted)' }}>Range billed / unbilled items</div><div className="text-2xl font-black">{bb.billed.length} / {bb.unbilled.length}</div></div>
      </div>
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
        <label className="text-sm">From <input type="date" className="input" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} /></label>
        <label className="text-sm">To <input type="date" className="input" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} /></label>
        {canDo('billing.viewAll') && (
          <label className="text-sm">Staff <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Me</option>{staffList.map((s: any) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
          </select></label>
        )}
        <button className="btn btn-ghost" onClick={preview}>Preview unbilled ({draft.length || '…'})</button>
        <button className="btn btn-primary" onClick={createDraft}>Create draft invoice</button>
      </div>
      {draft.length > 0 && <div className="card p-3 mb-4 text-sm">Draft will include: {draft.map((d) => `${new Date(d.starts_at).toLocaleDateString()} ${d.hours}h`).join(' · ')}</div>}
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Period</th><th>Status</th><th>Total</th><th></th></tr></thead>
        <tbody>{invoices.map((i: any) => (
          <tr key={i.id}><td>{i.period_start} → {i.period_end}</td>
            <td><span className="badge" style={{ background: 'var(--surface-inset)' }}>{i.status}</span></td>
            <td className="font-bold">{gbp(total(i))}</td>
            <td className="flex gap-2">
              {canDo('invoices.approve') && (i.status === 'draft' || i.status === 'pendingApproval') && <button className="btn btn-primary" onClick={() => approve(i.id)}>Approve (lock)</button>}
              {canDo('invoices.approve') && i.status === 'approved' && <button className="btn btn-ghost" onClick={() => pay(i.id)}>Mark paid</button>}
            </td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Timesheet: planned vs actual + guardrail ---------- */
export function Timesheet() {
  const { staff, canDo } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => {
    let q = supabase.from('mentis_staff_time_entries').select('*,mentis_staff!staff_time_entries_staff_id_fkey(display_name)').order('starts_at', { ascending: false }).limit(100);
    if (!canDo('timesheet.viewAll')) q = q.eq('staff_id', staff?.id);
    const { data } = await q;
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);
  const adjust = async (r: any) => {
    const v = prompt('New hours:', String(r.hours));
    if (v == null) return;
    const hours = Number(v);
    const increased = hours > Number(r.hours);
    await supabase.from('mentis_staff_time_entries').update({ ends_at: new Date(Date.parse(r.starts_at) + hours * 3_600_000).toISOString(), pending_review: increased ? true : r.pending_review }).eq('id', r.id);
    load();
  };
  const approveIncrease = async (r: any) => {
    await supabase.from('mentis_staff_time_entries').update({ pending_review: false }).eq('id', r.id);
    load();
  };
  return (
    <div>
      <PageTitle title="Timesheet" sub="Increases need admin review · decreases apply immediately" />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Staff</th><th>Date</th><th>Hours</th><th>Kind</th><th>Bill</th><th>Review</th><th></th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}><td>{r.mentis_staff?.display_name}</td><td>{new Date(r.starts_at).toLocaleString()}</td>
            <td>{r.hours}</td><td>{r.kind}{r.kind === 'standby' && ' 🏷️'}</td><td>{r.bill_state}</td>
            <td>{r.pending_review ? '⏳ pending' : '—'}</td>
            <td className="flex gap-2">
              <button className="btn btn-ghost" onClick={() => adjust(r)}>Adjust</button>
              {canDo('timesheet.viewAll') && r.pending_review && <button className="btn btn-primary" onClick={() => approveIncrease(r)}>Approve</button>}
            </td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Customer charges & debits ---------- */
export function Charges() {
  const { staff, canDo } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const load = () => supabase.from('mentis_customer_charges').select('*,mentis_customers(name),mentis_tasks(title)').order('created_at', { ascending: false }).limit(100).then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const resolve = async (c: any, collected: boolean) => {
    if (collected) {
      await supabase.from('mentis_customer_charges').update({ status: 'recovered', recovered_at: new Date().toISOString() }).eq('id', c.id);
    } else {
      const due = prompt('Due date (YYYY-MM-DD):');
      if (!due) return;
      await supabase.from('mentis_customer_charges').update({ status: 'outstandingDebit', due_date: due }).eq('id', c.id);
      const { data: types } = await supabase.from('mentis_action_types').select('id').eq('organization_id', staff?.organization_id).eq('name', 'clear outstanding debit').limit(1);
      if (types?.[0]) await supabase.from('mentis_pending_actions').insert({
        organization_id: staff?.organization_id, action_type_id: types[0].id,
        title: `Clear outstanding debit — ${c.customers?.name}`, linked_entity_type: 'customer', linked_entity_id: c.customer_id,
        due_at: new Date(due).toISOString(), status: 'open',
      });
    }
    load();
  };
  const due = rows.filter((r) => r.status === 'outstandingDebit').reduce((s, r) => s + r.amount_cents, 0);
  return (
    <div>
      <PageTitle title="Customer charges" sub={`Outstanding debits: ${gbp(due)}`} />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Customer</th><th>Task</th><th>Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.map((c: any) => (
          <tr key={c.id}><td className="font-semibold">{c.customers?.name}</td><td>{c.tasks?.title}</td>
            <td>{gbp(c.amount_cents)}</td><td><span className="badge" style={{ background: 'var(--surface-inset)' }}>{c.status}</span></td>
            <td>{canDo('charges.manage') && c.status === 'approved' && (
              <span className="flex gap-2">
                <button className="btn btn-primary" onClick={() => resolve(c, true)}>Retrieved</button>
                <button className="btn btn-ghost" onClick={() => resolve(c, false)}>Outstanding debit</button>
              </span>)}
            </td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Operational & Financial Reconciliation Engine ---------- */
export function Reconciliation() {
  const { staff } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [staffing, setStaffing] = useState<any[]>([]);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    const [sessRes, staffRes, teRes, invRes] = await Promise.all([
      supabase.from('mentis_sessions').select('id, name, start_at, end_at, status, venue_id, mentis_venues(name)').order('start_at', { ascending: false }).limit(200),
      supabase.from('mentis_session_staffing').select('*, mentis_staff(display_name), mentis_rate_cards(rate_cents, label)'),
      supabase.from('mentis_staff_time_entries').select('*, mentis_staff(display_name)'),
      supabase.from('mentis_invoices').select('*, mentis_invoice_lines(*)'),
    ]);
    setSessions(sessRes.data ?? []);
    setStaffing(staffRes.data ?? []);
    setTimeEntries(teRes.data ?? []);
    setInvoices(invRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  // Discrepancy checks:
  // 1. Unstaffed scheduled sessions
  const unstaffedSessions = sessions.filter(s => s.status === 'scheduled' && !staffing.some(st => st.session_id === s.id));

  // 2. Completed sessions without logged time entries
  const unloggedCompleted = sessions.filter(s => s.status === 'completed' && !timeEntries.some(te => te.session_id === s.id));

  // 3. Unbilled time entries
  const unbilledTimeEntries = timeEntries.filter(te => te.bill_state === 'unbilled');

  const plannedStaffingCost = staffing.reduce((sum, row) => {
    const hours = Math.max(0, (new Date(row.planned_end).getTime() - new Date(row.planned_start).getTime()) / 3_600_000);
    return sum + hours * ((row.mentis_rate_cards?.rate_cents ?? 0) / 100);
  }, 0);

  return (
    <div className="space-y-4">
      <PageTitle title="Reconciliation Dashboard" sub="Sessions ↔ Staff Assignments ↔ Timesheets ↔ Invoices cross-audit" />

      {loading ? (
        <div className="card p-8 text-center text-xs text-ink-muted">Loading audit records…</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-4">
              <div className="text-xs font-semibold text-ink-muted">Unstaffed Sessions</div>
              <div className="text-2xl font-bold text-danger mt-1">{unstaffedSessions.length}</div>
              <div className="text-[11px] text-ink-faint mt-1">Scheduled sessions with no coach assigned</div>
            </div>

            <div className="card p-4">
              <div className="text-xs font-semibold text-ink-muted">Completed Sessions Missing Timesheets</div>
              <div className="text-2xl font-bold text-warning mt-1">{unloggedCompleted.length}</div>
              <div className="text-[11px] text-ink-faint mt-1">Sessions finished but no hours logged for staff</div>
            </div>

            <div className="card p-4">
              <div className="text-xs font-semibold text-ink-muted">Unbilled Time Entries</div>
              <div className="text-2xl font-bold text-ink mt-1">{unbilledTimeEntries.length}</div>
              <div className="text-[11px] text-ink-faint mt-1">Ready to be included in billing invoices</div>
            </div>
          </div>

          <div className="card p-4 text-sm">
            <div className="font-bold text-ink-muted mb-2">Planned staffing cost</div>
            <div className="text-2xl font-black">£{plannedStaffingCost.toFixed(2)}</div>
            <div className="text-[11px] text-ink-faint mt-1">Calculated from assigned coach rate cards × planned hours</div>
          </div>

          <div className="card p-4">
            <h3 className="font-bold text-sm mb-3">Reconciliation Detail: Unstaffed Sessions</h3>
            <div className="max-h-60 overflow-auto divide-y divide-line text-xs">
              {unstaffedSessions.length === 0 ? (
                <p className="p-4 text-center text-ink-muted">All scheduled sessions have staffing assigned!</p>
              ) : (
                unstaffedSessions.map(s => (
                  <div key={s.id} className="py-2 flex items-center justify-between">
                    <div>
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-ink-muted ml-2">({s.mentis_venues?.name}) · {new Date(s.start_at).toLocaleDateString()} {new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <span className="badge bg-danger-soft text-danger">Needs Staff</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

