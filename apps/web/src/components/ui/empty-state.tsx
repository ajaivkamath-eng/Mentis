import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarX2,
  Inbox,
  Lock,
  PartyPopper,
  RefreshCw,
  SearchX,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { fadeUp, transition } from '../../lib/motion';
import { Button } from './button';

export type EmptyTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const toneStyles: Record<EmptyTone, { ring: string; icon: string; glow: string }> = {
  neutral: { ring: 'border-line bg-surface-hover', icon: 'text-ink-muted', glow: 'from-[color-mix(in_oklab,var(--ink)_18%,transparent)]' },
  brand: { ring: 'border-transparent bg-brand-soft', icon: 'text-brand-text', glow: 'from-[color-mix(in_oklab,var(--brand)_40%,transparent)]' },
  success: { ring: 'border-transparent bg-success-soft', icon: 'text-success', glow: 'from-[color-mix(in_oklab,var(--success)_40%,transparent)]' },
  warning: { ring: 'border-transparent bg-warning-soft', icon: 'text-warning', glow: 'from-[color-mix(in_oklab,var(--warning)_40%,transparent)]' },
  danger: { ring: 'border-transparent bg-danger-soft', icon: 'text-danger', glow: 'from-[color-mix(in_oklab,var(--danger)_40%,transparent)]' },
};

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Primary action, e.g. a `<Button>` or `<Link className="btn btn-primary">`. */
  action?: ReactNode;
  secondaryAction?: ReactNode;
  tone?: EmptyTone;
  /** `inline` sits inside a card/table; `page` centres in a full-height region. */
  variant?: 'inline' | 'page';
  className?: string;
  /** Extra content under the actions (hints, keyboard shortcuts, recipes). */
  footnote?: ReactNode;
}

/**
 * EmptyState — the most under-designed screen in the original app ("No sessions
 * today." in 13px grey). Every empty surface now explains itself: what is
 * missing, why it might be missing, and the one thing to do next.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  secondaryAction,
  tone = 'neutral',
  variant = 'inline',
  className,
  footnote,
}: EmptyStateProps) {
  const reduce = useReducedMotion();
  const t = toneStyles[tone];

  return (
    <motion.div
      variants={fadeUp}
      initial={reduce ? false : 'hidden'}
      animate="show"
      className={cn(
        'relative isolate flex flex-col items-center justify-center overflow-hidden gap-3 px-6 text-center',
        variant === 'page' ? 'min-h-[52vh] py-16' : 'py-12',
        className,
      )}
    >
      {/* soft radial light so emptiness feels intentional, not broken */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -z-10 size-56 rounded-full bg-gradient-to-b to-transparent blur-3xl opacity-60',
          t.glow,
        )}
      />
      <div className={cn('flex size-12 items-center justify-center rounded-2xl border', t.ring)}>
        <Icon className={cn('size-5.5', t.icon)} aria-hidden />
      </div>
      <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
      {description && <p className="max-w-md text-sm leading-relaxed text-ink-muted">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
      {footnote && <div className="mt-2 text-xs text-ink-faint">{footnote}</div>}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Presets — the sentences your product actually needs to say                 */
/* -------------------------------------------------------------------------- */

export function NoResultsState({
  query,
  onClear,
  className,
}: {
  query?: string;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      className={className}
      icon={SearchX}
      tone="neutral"
      title="No matches"
      description={
        query ? (
          <>
            Nothing matched <span className="font-semibold text-ink">“{query}”</span>. Try a shorter search, or check
            the spelling of the member’s name.
          </>
        ) : (
          'Adjust your filters or clear the search to see everything again.'
        )
      }
      action={
        onClear && (
          <Button intent="secondary" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        )
      }
    />
  );
}

export function NoDataState({
  entity,
  action,
  description,
  className,
}: {
  entity: string;
  action?: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <EmptyState
      className={className}
      icon={CalendarX2}
      tone="brand"
      title={`No ${entity} yet`}
      description={description ?? `${entity} will appear here as soon as they are created.`}
      action={action}
    />
  );
}

export function ErrorState({
  message = 'We could not load this. The connection might have dropped.',
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      className={className}
      icon={AlertTriangle}
      tone="danger"
      title="Something went wrong"
      description={message}
      action={
        onRetry && (
          <Button intent="secondary" size="sm" iconLeft={<RefreshCw />} onClick={onRetry}>
            Try again
          </Button>
        )
      }
    />
  );
}

export function PermissionState({ role, className }: { role?: string; className?: string }) {
  return (
    <EmptyState
      className={className}
      icon={Lock}
      tone="warning"
      title="Not permitted"
      description={
        <>
          The <span className="font-semibold text-ink">{role ?? 'current'}</span> role does not have access to this
          area. Switch role in the sidebar, or ask a Super Admin to extend your roles.
        </>
      }
    />
  );
}

export function InboxZeroState({ className, footnote }: { className?: string; footnote?: ReactNode }) {
  return (
    <EmptyState
      className={className}
      icon={PartyPopper}
      tone="success"
      title="Inbox zero"
      description="Every pending action is closed. New ones appear here automatically when a trigger fires or a task becomes due."
      footnote={footnote}
      variant="page"
    />
  );
}
