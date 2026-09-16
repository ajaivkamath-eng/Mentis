import { Badge, type BadgeProps } from './badge';

type Tone = NonNullable<BadgeProps['tone']>;

/**
 * Domain status → semantic tone, in one place.
 *
 * Before: every page invented its own colour for the same word ("breached" was
 * red in the inbox and grey in the dashboard). Now statuses are normalised
 * (camelCase / snake_case / kebab-case all resolve) and rendered identically
 * everywhere — and the same map is mirrored on mobile in
 * `apps/mobile/lib/status.ts` so an action looks the same on a phone.
 */
const STATUS_TONES: Record<string, Tone> = {
  /* lifecycle */
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
  invited: 'info',
  scheduled: 'info',
  open: 'info',
  inprogress: 'info',
  inreview: 'info',
  submitted: 'info',
  sent: 'info',
  pending: 'warning',
  pendingapproval: 'warning',
  requested: 'warning',
  trialing: 'warning',
  provisional: 'warning',
  draft: 'neutral',
  new: 'info',
  paused: 'neutral',
  inactive: 'neutral',
  archived: 'neutral',
  closed: 'neutral',
  cancelled: 'neutral',
  canceled: 'neutral',
  skipped: 'neutral',
  excused: 'neutral',
  breached: 'danger',
  overdue: 'danger',
  failed: 'danger',
  rejected: 'danger',
  declined: 'danger',
  outstandingdebit: 'danger',
  absent: 'danger',
  locked: 'danger',
  revoked: 'danger',
  late: 'warning',
  due: 'warning',
  tries: 'accent',
  tried: 'accent',
  won: 'accent',
  lost: 'neutral',
};

/** Human label: `outstandingDebit` → `Outstanding debit`. */
export function humanStatus(status: string): string {
  const spaced = status
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function toneForStatus(status: string | null | undefined): Tone {
  if (!status) return 'neutral';
  return STATUS_TONES[status.replace(/[\s_-]/g, '').toLowerCase()] ?? 'neutral';
}

export interface StatusBadgeProps extends Omit<BadgeProps, 'tone' | 'children'> {
  status: string | null | undefined;
  /** Override the rendered label while keeping the tone map. */
  label?: string;
}

export function StatusBadge({ status, label, dot = true, ...props }: StatusBadgeProps) {
  if (!status) return <span className="text-ink-faint">—</span>;
  return (
    <Badge tone={toneForStatus(status)} dot={dot} {...props}>
      {label ?? humanStatus(status)}
    </Badge>
  );
}
