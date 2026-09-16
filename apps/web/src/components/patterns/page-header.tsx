import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ChevronRight, Home } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';

export interface Crumb {
  label: string;
  to?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Breadcrumb trail, excluding the implicit Home + current page. */
  breadcrumbs?: Crumb[];
  /** Primary and secondary actions, right-aligned on desktop. */
  actions?: ReactNode;
  /** Tab strip / segmented filter that belongs to the page, not the toolbar. */
  tabs?: ReactNode;
  /** Small caps label above the title ("Today · Tue 16 Sep"). */
  eyebrow?: ReactNode;
  className?: string;
}

/**
 * PageHeader — replaces the bare `<div><h1>…</h1><p>…</p></div>` pattern.
 *
 * Adds what the original lacked: a breadcrumb for orientation, an eyebrow line
 * for context, an action cluster that wraps instead of overflowing, and an
 * optional tab strip — all with a top-lit hairline that ties the header to the
 * card system below it.
 */
export function PageHeader({ title, subtitle, breadcrumbs, actions, tabs, eyebrow, className }: PageHeaderProps) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 64], [1, 0]);

  return (
    <motion.header
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
      className={cn('relative mb-5 flex flex-col gap-3', className)}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-ink-faint">
          <Link to="/" className="flex items-center gap-1 rounded-xs px-1 transition-colors hover:text-ink">
            <Home className="size-3" aria-hidden />
            <span className="sr-only sm:not-sr-only">Home</span>
          </Link>
          {breadcrumbs.map((c) => (
            <Fragment key={`${c.label}-${c.to ?? ''}`}>
              <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden />
              {c.to ? (
                <Link to={c.to} className="truncate rounded-xs px-1 transition-colors hover:text-ink">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate px-1 text-ink-muted" aria-current="page">
                  {c.label}
                </span>
              )}
            </Fragment>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {eyebrow && (
            <motion.div style={reduce ? undefined : { opacity }} className="overline mb-1.5">
              {eyebrow}
            </motion.div>
          )}
          <h1 className="font-display text-2xl font-extrabold leading-tight tracking-[-0.025em] text-ink sm:text-3xl">
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {tabs && <div className="-mb-1 flex overflow-x-auto pb-1 no-scrollbar">{tabs}</div>}
      <div
        aria-hidden
        className="h-px w-full bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-70"
      />
    </motion.header>
  );
}

/** Section header used inside pages (between cards) for scannable grouping. */
export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div>
        <h2 className="font-display text-base font-bold tracking-[-0.01em] text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
