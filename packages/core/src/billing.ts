/* Auditable billing: hourly-rate invoices that lock on approval (rules 5–8, 20, 23). */
import type { CustomerCharge, Invoice, InvoiceLine, Task, TimeEntry } from './domain.js';

export const money = (hours: number, rateCents: number) => Math.round(hours * rateCents);

/** Unbilled, billable, review-clear entries inside [start, end]. */
export function billableEntries(entries: TimeEntry[], start: string, end: string): TimeEntry[] {
  const from = Date.parse(start);
  const to = Date.parse(end);
  return entries.filter(
    (e) =>
      e.billable &&
      e.billState === 'unbilled' &&
      !e.pendingReview &&
      Date.parse(e.date) >= from &&
      Date.parse(e.date) <= to,
  );
}

export function approveInvoice(invoice: Invoice): Invoice {
  if (invoice.status !== 'pendingApproval' && invoice.status !== 'draft')
    throw new Error('only draft invoices can be approved');
  return { ...invoice, status: 'approved' };
}

export function markInvoicePaid(invoice: Invoice, paidAt: string, reference?: string): Invoice {
  if (invoice.status !== 'approved') throw new Error('only approved invoices can be marked paid');
  return { ...invoice, status: 'paid', paidAt, paymentReference: reference };
}

export function invoiceTotalCents(lines: InvoiceLine[]): number {
  return lines.reduce((sum, l) => sum + l.amountCents, 0);
}

/** Rule 6 — billing lock: approved/paid invoices contribute nothing re-billable.
 * Re-invoicing an overlapping period lists only NEW or backfilled items. */
export function reInvoiceable(
  entries: TimeEntry[],
  approvedInvoiceItemIds: Set<string>,
): TimeEntry[] {
  return entries.filter((e) => e.billState === 'unbilled' && !approvedInvoiceItemIds.has(e.id));
}

export interface DraftInput {
  staffId: string;
  periodStart: string;
  periodEnd: string;
  entries: TimeEntry[];
  tasks: Task[];
}
/** Build a draft: unbilled time entries + APPROVED done tasks only (rule 5). */
export function buildDraftLines(input: DraftInput): InvoiceLine[] {
  const lines: InvoiceLine[] = [];
  for (const e of billableEntries(input.entries, input.periodStart, input.periodEnd)) {
    if (e.staffId !== input.staffId) continue;
    lines.push({
      id: `line-${e.id}`, timeEntryId: e.id, staffId: e.staffId,
      hours: e.hours, rateCents: e.rateCents, amountCents: money(e.hours, e.rateCents),
      kind: e.kind,
    });
  }
  for (const t of input.tasks) {
    if (t.assigneeId !== input.staffId) continue;
    if (t.status !== 'done' || !t.approvedAt) continue; // rule 5: unapproved never invoices
    if (t.amountCents == null) continue;
    lines.push({
      id: `line-task-${t.id}`, taskId: t.id, staffId: input.staffId,
      hours: t.workHours ?? 0, rateCents: 0, amountCents: t.amountCents,
    });
  }
  return lines;
}

export type BilledBreakdown = { billed: TimeEntry[]; unbilled: TimeEntry[] };
/** Billed/unbilled range breakdown for any date/time range (§6.7). */
export function billedUnbilled(entries: TimeEntry[], start: string, end: string): BilledBreakdown {
  const from = Date.parse(start);
  const to = Date.parse(end);
  const inRange = entries.filter((e) => {
    const d = Date.parse(e.date);
    return d >= from && d <= to;
  });
  return {
    billed: inRange.filter((e) => e.billState === 'billed'),
    unbilled: inRange.filter((e) => e.billState === 'unbilled'),
  };
}

/** Rule 8 — approved customer charge is either recovered or an outstanding debit. */
export function resolveCustomerCharge(
  charge: CustomerCharge,
  collected: boolean,
  dueDate?: string,
): CustomerCharge {
  if (charge.status !== 'approved') throw new Error('only approved charges can be resolved');
  if (collected) return { ...charge, status: 'recovered', recoveredAt: new Date().toISOString() };
  if (!dueDate) throw new Error('an outstanding debit requires a due date');
  return { ...charge, status: 'outstandingDebit', dueDate };
}

export function customerBalanceDue(charges: CustomerCharge[]): number {
  return charges
    .filter((c) => c.status === 'outstandingDebit')
    .reduce((sum, c) => sum + c.amountCents, 0);
}

export interface BillingDashboard {
  invoicedCents: number;
  outstandingCents: number;
  forecastCents: number;
}
/** Billing dashboard: invoiced by timeline, outstanding, schedule-based forecast. */
export function billingDashboard(
  invoices: Invoice[],
  unbilledEntries: TimeEntry[],
  plannedEntries: TimeEntry[],
): BillingDashboard {
  return {
    invoicedCents: invoices
      .filter((i) => i.status === 'approved' || i.status === 'paid')
      .reduce((s, i) => s + invoiceTotalCents(i.lines), 0),
    outstandingCents:
      invoices
        .filter((i) => i.status === 'approved')
        .reduce((s, i) => s + invoiceTotalCents(i.lines), 0) +
      unbilledEntries.reduce((s, e) => s + money(e.hours, e.rateCents), 0),
    forecastCents: plannedEntries.reduce((s, e) => s + money(e.hours, e.rateCents), 0),
  };
}
