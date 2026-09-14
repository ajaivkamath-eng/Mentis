import type { Invoice, TimeEntry } from './domain.js';
export const money = (hours:number, rateCents:number) => Math.round(hours * rateCents);
export function billableEntries(entries:TimeEntry[], start:string, end:string):TimeEntry[] {
  const from = Date.parse(start), to = Date.parse(end);
  return entries.filter(e => e.billable && e.billState === 'unbilled' && !e.pendingReview && Date.parse(e.date) >= from && Date.parse(e.date) <= to);
}
export function approveInvoice(invoice:Invoice):Invoice {
  if (invoice.status !== 'pendingApproval' && invoice.status !== 'draft') throw new Error('only draft invoices can be approved');
  return {...invoice, status:'approved'};
}
