import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { transition } from '../../lib/motion';

export type ProgressTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const toneFills: Record<ProgressTone, string> = {
  brand: 'bg-[linear-gradient(90deg,var(--brand),#818cf8)]',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  accent: 'bg-accent',
};

/** Pick a tone from completion — used by capacity/attendance meters. */
export function toneForRatio(ratio: number, invert = false): ProgressTone {
  const r = invert ? 1 - ratio : ratio;
  if (r >= 0.7) return 'success';
  if (r >= 0.35) return 'brand';
  if (r >= 0.15) return 'warning';
  return 'danger';
}

export function Progress({
  value,
  max = 100,
  tone = 'brand',
  label,
  hint,
  size = 'md',
  className,
}: {
  value: number;
  max?: number;
  tone?: ProgressTone;
  label?: ReactNode;
  hint?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || hint) && (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-ink-muted">{label}</span>
          <span className="tabular-nums text-ink-faint">{hint ?? `${Math.round(pct)}%`}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={typeof label === 'string' ? label : undefined}
        className={cn('w-full overflow-hidden rounded-full bg-surface-inset', size === 'sm' ? 'h-1.5' : 'h-2')}
      >
        <motion.div
          className={cn('h-full rounded-full', toneFills[tone])}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ ...transition.smooth, delay: 0.05 }}
        />
      </div>
    </div>
  );
}

/**
 * ProgressRing — SVG arc for at-a-glance completion inside dense rows
 * (session attendance, register progress, goal tracking).
 */
export function ProgressRing({
  value,
  max = 100,
  size = 44,
  strokeWidth = 4,
  tone = 'brand',
  children,
  className,
  ariaLabel,
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  tone?: ProgressTone;
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(1, value / max));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const strokeColor = {
    brand: 'var(--brand)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
    info: 'var(--info)',
    accent: 'var(--accent)',
  }[tone];

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={reduce ? { strokeDashoffset: c * (1 - pct) } : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={transition.smooth}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums text-ink">
        {children ?? `${Math.round(pct * 100)}%`}
      </span>
    </div>
  );
}

/** Domain-flavoured wrapper: "18 / 24 places". */
export function CapacityMeter({
  taken,
  capacity,
  className,
  compact,
}: {
  taken: number;
  capacity: number | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  if (!capacity || capacity <= 0) {
    return (
      <span className={cn('text-xs text-ink-faint', className)}>
        {taken} {compact ? '' : 'booked'}
      </span>
    );
  }
  const ratio = taken / capacity;
  const tone: ProgressTone = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warning' : ratio >= 0.4 ? 'brand' : 'info';
  const overflow = taken > capacity;
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs font-semibold tabular-nums text-ink">
        {taken}
        <span className="text-ink-faint">/{capacity}</span>
      </span>
      {!compact && (
        <Progress
          value={Math.min(taken, capacity)}
          max={capacity}
          tone={overflow ? 'danger' : tone}
          size="sm"
          className="w-16"
        />
      )}
    </div>
  );
}
