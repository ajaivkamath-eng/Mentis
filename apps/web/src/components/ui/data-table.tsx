import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './button';
import { SkeletonTable } from './skeleton';

export type SortDirection = 'asc' | 'desc';

export interface Column<T> {
  /** Stable id; also the default sort key. */
  key: string;
  header: ReactNode;
  /** Cell renderer — receives the row and its index. */
  cell: (row: T, index: number) => ReactNode;
  /** Value used for sorting / CSV export; falls back to `key` lookup on the row. */
  sortValue?: (row: T) => string | number | Date | null | undefined;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Tailwind width utility, e.g. `w-32`. */
  width?: string;
  /** Hide this column below a breakpoint (keeps small laptops readable). */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
  /** Extra classes for both th and td. */
  className?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  /** Rendered when `data` is empty and not loading — always pass an <EmptyState>. */
  empty?: ReactNode;
  /** Card renderer for < md viewports; without it rows become labelled stacks. */
  mobileCard?: (row: T, index: number) => ReactNode;
  onRowClick?: (row: T) => void;
  /** Rendered above the table inside the same card. */
  toolbar?: ReactNode;
  /** Initial sort. */
  defaultSort?: { key: string; direction: SortDirection };
  dense?: boolean;
  /** Freeze the header while the body scrolls (needs a max height). */
  stickyHeader?: boolean;
  maxHeight?: number | string;
  /** Footer slot — pagination, totals, "showing 20 of 240". */
  footer?: ReactNode;
  /** Wrap rows in the stagger animation (best for < ~30 rows). */
  animateRows?: boolean;
  className?: string;
  caption?: string;
}

const hideClass = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
} as const;

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

/**
 * DataTable — the single list primitive for the console.
 *
 * Replaces the ~18 hand-rolled `<table className="grid">` blocks with one
 * component that gets the hard parts right:
 *   • responsive: real table ≥ md, stacked label/value cards below
 *   • loading: skeleton rows that match final row height (no reflow)
 *   • empty: your EmptyState, in the right place, with correct padding
 *   • a11y: semantic table, `aria-sort` on sortable headers, keyboard-activatable rows
 *   • motion: optional stagger-in capped at 8 rows so long lists stay instant
 */
export function DataTable<T>({
  data,
  columns,
  rowKey,
  loading = false,
  empty,
  mobileCard,
  onRowClick,
  toolbar,
  defaultSort,
  dense = false,
  stickyHeader = false,
  maxHeight,
  footer,
  animateRows = false,
  className,
  caption,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | undefined>(defaultSort);

  const rows = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return data;
    const read = (row: T) =>
      col.sortValue?.(row) ?? (row as Record<string, unknown>)[col.key] ?? null;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = read(a);
      const bv = read(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av instanceof Date || bv instanceof Date) {
        return (Number(new Date(av as Date)) - Number(new Date(bv as Date))) * dir;
      }
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'en-GB', { numeric: true, sensitivity: 'base' }) * dir;
    });
  }, [data, columns, sort]);

  const toggleSort = (key: string) => {
    setSort((prev) =>
      prev?.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  };

  const cellPad = dense ? 'px-3 py-2' : 'px-4 py-3';

  const body = (
    <>
      {loading ? (
        <SkeletonTable rows={5} columns={Math.min(columns.length, 5)} />
      ) : rows.length === 0 ? (
        <div className="py-2">{empty}</div>
      ) : (
        <>
          {/* ---------- desktop / tablet: real table ---------- */}
          <div
            className={cn('grid-table-wrap hidden md:block', !mobileCard && 'mask-fade-r')}
            style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
          >
            <table className="grid">
              {caption && <caption className="sr-only">{caption}</caption>}
              <thead className={stickyHeader ? 'sticky top-0 z-10' : undefined}>
                <tr>
                  {columns.map((c) => {
                    const active = sort?.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : c.sortable ? 'none' : undefined}
                        className={cn(
                          c.width,
                          c.className,
                          alignClass[c.align ?? 'left'],
                          c.hideBelow && hideClass[c.hideBelow],
                        )}
                      >
                        {c.sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className={cn(
                              'group/sort inline-flex items-center gap-1 rounded-xs px-1 py-0.5 uppercase transition-colors hover:text-ink',
                              active && 'text-brand-text',
                            )}
                          >
                            {c.header}
                            {active ? (
                              sort?.direction === 'asc' ? (
                                <ArrowUp className="size-3" />
                              ) : (
                                <ArrowDown className="size-3" />
                              )
                            ) : (
                              <ChevronsUpDown className="size-3 opacity-0 transition-opacity group-hover/sort:opacity-60" />
                            )}
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              {/* Rows animate in via the CSS `stagger-in` helper: transform+opacity
                  animations on <tr> are composited and cost nothing per row. */}
              <tbody className={animateRows ? 'stagger-in' : undefined}>
                {rows.map((row, i) => {
                  const clickable = Boolean(onRowClick);
                  return (
                    <tr
                      key={rowKey(row, i)}
                      data-clickable={clickable || undefined}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onKeyDown={
                        clickable
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onRowClick?.(row);
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        'group/row',
                        clickable &&
                          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]',
                      )}
                    >
                      {columns.map((c) => (
                        <td
                          key={c.key}
                          className={cn(cellPad, c.className, alignClass[c.align ?? 'left'], c.hideBelow && hideClass[c.hideBelow])}
                        >
                          {c.cell(row, i)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ---------- phones: labelled stacks or a bespoke card ---------- */}
          <div className={cn('divide-y divide-line md:hidden')} data-mobile-list>
            {rows.map((row, i) =>
              mobileCard ? (
                <div key={rowKey(row, i)} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                  {mobileCard(row, i)}
                </div>
              ) : (
                <div
                  key={rowKey(row, i)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn('flex flex-col gap-1.5 px-4 py-3', onRowClick && 'cursor-pointer active:bg-surface-hover')}
                >
                  {columns.map((c) => (
                    <div key={c.key} className="flex items-baseline justify-between gap-3">
                      <span className="overline shrink-0">{c.header}</span>
                      <span className={cn('min-w-0 text-sm text-ink', alignClass[c.align ?? 'left'])}>{c.cell(row, i)}</span>
                    </div>
                  ))}
                </div>
              ),
            )}
          </div>
        </>
      )}
    </>
  );

  return (
    <div className={cn('card overflow-hidden', className)}>
      {toolbar}
      {body}
      {footer}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                 */
/* -------------------------------------------------------------------------- */

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  className,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  className?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className={cn('flex items-center justify-between gap-3 border-t border-line px-4 py-2.5', className)}>
      <p className="text-xs text-ink-faint">
        Showing <span className="font-semibold tabular-nums text-ink-muted">{from}–{to}</span> of{' '}
        <span className="font-semibold tabular-nums text-ink-muted">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          intent="ghost"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="px-1 text-xs tabular-nums text-ink-muted">
          {page} / {pageCount}
        </span>
        <Button
          size="icon"
          intent="ghost"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/** Simple client-side pager hook — keeps page state + slicing in one place. */
export function usePager<T>(rows: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = page > pageCount ? pageCount : page;
  return {
    page: current,
    pageCount,
    pageSize,
    total: rows.length,
    slice: rows.slice((current - 1) * pageSize, current * pageSize),
    setPage,
  };
}
