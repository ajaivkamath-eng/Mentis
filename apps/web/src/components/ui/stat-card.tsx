import { animate, motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { springs, transition } from '../../lib/motion';
import { Skeleton } from './skeleton';

/* -------------------------------------------------------------------------- */
/* Animated number                                                            */
/* -------------------------------------------------------------------------- */

export interface AnimatedNumberProps {
  value: number;
  /** Formats the tweened value (currency, compact, percent…). */
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}

/**
 * Tweens a number into place once, when it scrolls into view. Uses a motion
 * value + direct DOM writes (no per-frame React renders) so a dashboard of
 * eight KPIs animates without dropping frames.
 */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toString(), duration = 0.9, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce || !inView) {
      if (reduce) node.textContent = format(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = format(v);
      },
      onComplete: () => {
        node.textContent = format(value);
      },
    });
    return () => controls.stop();
  }, [value, inView, reduce, duration, format]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {format(value)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Sparkline                                                                  */
/* -------------------------------------------------------------------------- */

export function Sparkline({
  data,
  className,
  stroke = 'var(--brand)',
  height = 34,
}: {
  data: number[];
  className?: string;
  stroke?: string;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const w = 100;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((d - min) / span) * (height - 6) - 3;
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} ${w},${height} 0,${height}`;
  const id = `spark-${data.length}-${Math.round(max)}`;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cn('h-8 w-full', className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <motion.polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* StatCard                                                                   */
/* -------------------------------------------------------------------------- */

export type StatTone = 'brand' | 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const toneMap: Record<StatTone, { chip: string; icon: string; spark: string }> = {
  brand: { chip: 'bg-brand-soft', icon: 'text-brand-text', spark: 'var(--brand)' },
  accent: { chip: 'bg-accent-soft', icon: 'text-accent', spark: 'var(--accent)' },
  info: { chip: 'bg-info-soft', icon: 'text-info', spark: 'var(--info)' },
  success: { chip: 'bg-success-soft', icon: 'text-success', spark: 'var(--success)' },
  warning: { chip: 'bg-warning-soft', icon: 'text-warning', spark: 'var(--warning)' },
  danger: { chip: 'bg-danger-soft', icon: 'text-danger', spark: 'var(--danger)' },
  neutral: { chip: 'bg-surface-hover', icon: 'text-ink-muted', spark: 'var(--ink-muted)' },
};

export interface StatCardProps {
  label: string;
  value: number;
  /** Formats both the animated number and the skeleton width. */
  format?: (n: number) => string;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Secondary line under the value. */
  hint?: ReactNode;
  /** Period-over-period delta; renders a directional chip. */
  delta?: { value: number; label?: string; /** true when an increase is bad (e.g. breaches) */ invert?: boolean };
  sparkline?: number[];
  /** Makes the whole card a link with a hover lift. */
  to?: string;
  loading?: boolean;
  className?: string;
}

/**
 * StatCard — a KPI that is legible at a glance and honest about movement:
 * label → number (tweened) → trend → sparkline, in a fixed reading order.
 */
export function StatCard({
  label,
  value,
  format = (n) => Math.round(n).toLocaleString('en-GB'),
  icon: Icon,
  tone = 'brand',
  hint,
  delta,
  sparkline,
  to,
  loading,
  className,
}: StatCardProps) {
  const reduce = useReducedMotion();
  const t = toneMap[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="overline truncate">{label}</div>
          <div className="mt-2 font-display text-[1.75rem] font-extrabold leading-none tracking-[-0.02em] text-ink">
            {loading ? <Skeleton className="h-7 w-24 rounded-sm" /> : <AnimatedNumber value={value} format={format} />}
          </div>
        </div>
        {Icon && (
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', t.chip)}>
            <Icon className={cn('size-4.5', t.icon)} aria-hidden />
          </span>
        )}
      </div>

      {(hint || delta) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {delta && <DeltaChip {...delta} />}
          {hint && <span className="text-xs text-ink-faint">{hint}</span>}
        </div>
      )}

      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 -mb-1 opacity-90">
          <Sparkline data={sparkline} stroke={t.spark} />
        </div>
      )}
    </>
  );

  const classes = cn('group relative block p-[1.125rem]', className);

  if (to) {
    return (
      <motion.div whileHover={reduce ? undefined : { y: -2 }} whileTap={reduce ? undefined : { scale: 0.995 }} transition={transition.fast}>
        <Link to={to} className={cn(classes, 'card')} aria-label={`${label}: ${format(value)}`}>
          {body}
          <span
            aria-hidden
            className="absolute inset-0 rounded-lg ring-brand-soft transition-shadow duration-200 group-hover:ring-4 group-focus-visible:ring-4"
          />
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className={cn(classes, 'card')}
    >
      {body}
    </motion.div>
  );
}

function DeltaChip({ value, label, invert }: { value: number; label?: string; invert?: boolean }) {
  const up = value > 0;
  const flat = value === 0;
  const good = invert ? !up : up;
  const tone = flat ? 'text-ink-faint bg-surface-hover' : good ? 'text-success bg-success-soft' : 'text-danger bg-danger-soft';
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-bold tabular-nums', tone)}>
      <Icon className="size-3" aria-hidden />
      {Math.abs(value)}%
      {label && <span className="font-medium opacity-80">{label}</span>}
    </span>
  );
}

/** Responsive KPI grid that keeps 1 → 2 → 4 columns and equal heights. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>;
}
