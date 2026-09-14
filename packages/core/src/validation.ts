/* Entity validation — business rules that must hold (§7). */
import type { Customer, Invoice, Member, Session, Task } from './domain.js';

export function ageAt(dateOfBirth: string, at = new Date()): number {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.valueOf())) return NaN;
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const m = at.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

/** Rule 1 — under-18 members need a partner/guardian customer AND NOK. */
export function validateMember(member: Member, at = new Date()): string[] {
  const dob = new Date(member.dateOfBirth);
  const errors: string[] = [];
  if (Number.isNaN(dob.valueOf())) errors.push('dateOfBirth is invalid');
  const age = ageAt(member.dateOfBirth, at);
  if (age < 18 && !member.customerId) errors.push('members under 18 require a partner or guardian customer');
  if (age < 18 && (!member.nokName || !member.nokPhone)) errors.push('members under 18 require NOK name and phone');
  if (member.tteNumber && !/^[A-Za-z0-9-]{3,20}$/.test(member.tteNumber)) errors.push('TTE registration number is invalid');
  return errors;
}

/** Rule 13 — PlayerFeedback source is mandatory. */
export function assertFeedbackSource(sourceType: 'session' | 'event', sourceId?: string): void {
  if (!sourceId) throw new Error(`${sourceType} feedback requires a source`);
}

/** Rule 21 — cancellation requires a reason. */
export function validateCancellation(session: Session, reason?: string): string[] {
  const errors: string[] = [];
  if (session.status === 'cancelled') errors.push('session is already cancelled');
  if (!reason || !reason.trim()) errors.push('cancellation reason is required');
  return errors;
}

/** Rule 5 — a task is billable only after manager/admin TASK approval. */
export function isTaskBillable(task: Task): boolean {
  return task.status === 'done' && !!task.approvedAt;
}

/** Rule 7 — one invoice per staff per period (uniqueness guard). */
export function invoicePeriodKey(staffId: string, start: string, end: string): string {
  return `${staffId}|${start}|${end}`;
}
export function duplicateInvoice(invoices: Invoice[], staffId: string, start: string, end: string): boolean {
  const key = invoicePeriodKey(staffId, start, end);
  return invoices.some((i) => invoicePeriodKey(i.staffId, i.periodStart, i.periodEnd) === key);
}

/** Rule 12 — taster register gate: approved + assigned. */
export function tasterMayAppearInRegister(status: string, approvedSessionIds: string[], sessionId: string): boolean {
  return status === 'approved' && approvedSessionIds.includes(sessionId);
}

export function validateCustomer(customer: Customer): string[] {
  const errors: string[] = [];
  if (!customer.name?.trim()) errors.push('customer name is required');
  return errors;
}

/** Rule 26 — consent expiry warnings (no silent expiry). */
export function expiredConsents(customer: Customer, at = new Date().toISOString()): string[] {
  return (customer.consents ?? [])
    .filter((c) => c.granted && c.validUntil && c.validUntil < at)
    .map((c) => c.kind);
}
