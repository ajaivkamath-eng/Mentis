import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

/**
 * Skeletons instead of spinners.
 *
 * A spinner says "wait"; a skeleton says "here is what is coming" and removes
 * the layout jump when data lands. Every async surface in Mentis now reserves
 * its final geometry first. Shimmer is CSS-only (one composited transform) and
 * is switched off wholesale by `prefers-reduced-motion`.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div aria-hidden className={cn('skeleton', className)} {...props} />;
}

/** N lines of text with a shorter last line, mimicking real paragraph rhythm. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3 rounded-xs', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Row-shaped placeholder for list/table bodies. */
export function SkeletonRow({ className, avatar = true }: { className?: string; avatar?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3', className)}>
      {avatar && <Skeleton className="size-9 rounded-full" />}
      <div className="flex-1">
        <Skeleton className="h-3.5 w-2/5 rounded-xs" />
        <Skeleton className="mt-2 h-3 w-1/4 rounded-xs" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
  );
}

export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-line', className)} role="status" aria-label="Loading content">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Mirrors the StatCard grid so KPI numbers pop in without reflow. */
export function SkeletonStatGrid({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-[1.125rem]">
          <Skeleton className="h-3 w-20 rounded-xs" />
          <Skeleton className="mt-3 h-7 w-24 rounded-sm" />
          <Skeleton className="mt-3 h-3 w-16 rounded-xs" />
        </div>
      ))}
    </div>
  );
}

/** Header + rows, matching the DataTable footprint. */
export function SkeletonTable({ rows = 6, columns = 4, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={cn('w-full', className)} role="status" aria-label="Loading table">
      <div className="flex items-center gap-4 border-b border-line px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1 rounded-xs" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3.5 flex-1 rounded-xs', c === 0 && 'w-1/3 flex-none')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('card p-[1.125rem]', className)}>
      <Skeleton className="h-3.5 w-1/3 rounded-xs" />
      <SkeletonText lines={3} className="mt-4" />
    </div>
  );
}

/** Full-page skeleton used by <Protected> while auth resolves. */
export function SkeletonPage({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <Skeleton className="h-8 w-56 rounded-md" />
      <Skeleton className="h-4 w-80 rounded-xs" />
      <SkeletonStatGrid />
      <SkeletonCard className="h-64" />
    </div>
  );
}
