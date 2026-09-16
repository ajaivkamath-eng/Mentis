/** Formatting helpers — one set of rules for money, dates and numbers. */

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 });
const gbpCompact = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', notation: 'compact', maximumFractionDigits: 1 });
const int = new Intl.NumberFormat('en-GB');
const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });

/** Pence → "£1,240.50" (Mentis stores money as integer pence everywhere). */
export const money = (pence: number | null | undefined, opts?: { compact?: boolean }) => {
  const value = (pence ?? 0) / 100;
  return opts?.compact && Math.abs(value) >= 10_000 ? gbpCompact.format(value) : gbp.format(value);
};

export const number = (n: number | null | undefined) => int.format(n ?? 0);
export const compactNumber = (n: number | null | undefined) => (Math.abs(n ?? 0) >= 10_000 ? compact.format(n ?? 0) : int.format(n ?? 0));
export const percentChange = (ratio: number) => percent.format(ratio);
export const pct = (ratio: number | null | undefined, digits = 0) =>
  `${((ratio ?? 0) * 100).toFixed(digits)}%`;

export const dateShort = (d: string | number | Date | null | undefined) =>
  d ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(d)) : '—';

export const dateFull = (d: string | number | Date | null | undefined) =>
  d ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d)) : '—';

export const timeShort = (d: string | number | Date | null | undefined) =>
  d ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d)) : '—';

/** "09:30 – 11:00" for session rows. */
export const timeRange = (start: string | number | Date | null | undefined, end?: string | number | Date | null) =>
  end ? `${timeShort(start)} – ${timeShort(end)}` : timeShort(start);

/** Duration between two stamps, as "1h 45m". */
export function durationBetween(start: string | Date, end: string | Date) {
  const mins = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

export const titleCase = (s: string) =>
  s.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Debounced-search helper used by list pages. */
export const normalize = (s: string) => s.trim().toLowerCase();
