/**
 * The status vocabulary — one table, both platforms.
 *
 * Domain statuses arrive in every casing the database and UI produce
 * (`pending_approval`, `outstandingDebit`, `breached`, `Paid`). This module
 * normalises them and decides the *semantic tone*; each platform then maps that
 * tone to its own palette (Tailwind classes on web, hex on native).
 *
 * Before: "breached" was red in the inbox, grey on the dashboard and amber in
 * reports. After: it is `danger` everywhere, forever, because there is exactly
 * one place to change it.
 */

export type StatusTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const TONES: Record<string, StatusTone> = {
  /* healthy / finished */
  active: 'success',
  enabled: 'success',
  approved: 'success',
  published: 'success',
  completed: 'success',
  complete: 'success',
  done: 'success',
  paid: 'success',
  present: 'success',
  converted: 'success',
  confirmed: 'success',
  validated: 'success',
  /* in-flight / informational */
  invited: 'info',
  scheduled: 'info',
  open: 'info',
  new: 'info',
  inprogress: 'info',
  inreview: 'info',
  submitted: 'info',
  sent: 'info',
  processing: 'info',
  /* waiting on someone */
  pending: 'warning',
  pendingapproval: 'warning',
  requested: 'warning',
  trialing: 'warning',
  provisional: 'warning',
  due: 'warning',
  late: 'warning',
  awaitingpayment: 'warning',
  /* inert */
  draft: 'neutral',
  paused: 'neutral',
  inactive: 'neutral',
  archived: 'neutral',
  closed: 'neutral',
  cancelled: 'neutral',
  canceled: 'neutral',
  skipped: 'neutral',
  excused: 'neutral',
  withdrawn: 'neutral',
  lost: 'neutral',
  /* attention required */
  breached: 'danger',
  overdue: 'danger',
  failed: 'danger',
  rejected: 'danger',
  declined: 'danger',
  outstandingdebit: 'danger',
  absent: 'danger',
  locked: 'danger',
  revoked: 'danger',
  error: 'danger',
  /* achievement */
  tried: 'accent',
  won: 'accent',
  promoted: 'accent',
  awarded: 'accent',
};

/** Normalise any casing/separator style to the lookup key. */
function key(status: string): string {
  return status.replace(/[\s_-]+/g, '').toLowerCase();
}

export function toneForStatus(status: string | null | undefined): StatusTone {
  if (!status) return 'neutral';
  return TONES[key(status)] ?? 'neutral';
}

/** `outstandingDebit` → `Outstanding debit`, `pending_approval` → `Pending approval`. */
export function humanStatus(status: string): string {
  const spaced = status
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Every status the domain recognises — useful for audit tooling and tests. */
export const KNOWN_STATUSES = Object.keys(TONES);
