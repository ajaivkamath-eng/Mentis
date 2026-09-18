/**
 * Diary calendar view-model.
 *
 * Colours, icons and labels for every event kind, plus small date/time
 * helpers shared by the calendar board, panels and planner. Colours map to
 * the Mentis design tokens wherever one exists; the extra hues (violet,
 * pink, cyan) are used for kinds without a token. Every kind also differs
 * by *icon and fill pattern*, not colour alone (colour-vision safety).
 */
import {
  BookmarkCheck, Briefcase, CalendarDays, CalendarOff, CircleDot, ClipboardList,
  GraduationCap, HeartPulse, Luggage, MapPinned, Palmtree, Sparkles, Stethoscope,
  Timer, UserRound, Wrench, type LucideIcon,
} from 'lucide-react';
import type { AvailabilityKind, CoachRole, DiaryEvent, DiarySourceType } from '@mentis/core';

export type { DiaryEvent, AvailabilityKind, CoachRole };

export type EventKind = AvailabilityKind | 'session' | 'task';

export interface KindStyle {
  label: string;
  /** Accent colour — left bar, dot, text. */
  color: string;
  /** Soft fill for the event chip. */
  soft: string;
  icon: LucideIcon;
  bucket: 'available' | 'regular' | 'unavailable' | 'duty' | 'session' | 'task';
  /** Blocks coaching (drives conflicts + RED sessions). */
  blocking: boolean;
  /** Diagonal-stripe fill to signal "blocked" beyond colour alone. */
  striped?: boolean;
}

const soft = (hex: string, alpha = '14') => `color-mix(in srgb, ${hex} ${parseInt(alpha, 16)}%, transparent)`;

export const KIND: Record<EventKind, KindStyle> = {
  available: { label: 'Available for coaching', color: 'var(--brand)', soft: 'var(--brand-soft)', icon: Sparkles, bucket: 'available', blocking: false },
  working_hours: { label: 'Regular working hours', color: 'var(--info)', soft: 'var(--info-soft)', icon: Timer, bucket: 'regular', blocking: false },
  holiday: { label: 'Holiday / annual leave', color: 'var(--warning)', soft: 'var(--warning-soft)', icon: Palmtree, bucket: 'unavailable', blocking: true, striped: true },
  sick_leave: { label: 'Sick leave', color: 'var(--danger)', soft: 'var(--danger-soft)', icon: HeartPulse, bucket: 'unavailable', blocking: true, striped: true },
  unavailable_other: { label: 'Unavailable', color: '#ef4444', soft: soft('#ef4444'), icon: CalendarOff, bucket: 'unavailable', blocking: true, striped: true },
  personal_appointment: { label: 'Personal appointment', color: 'var(--accent)', soft: 'var(--accent-soft)', icon: Stethoscope, bucket: 'unavailable', blocking: true, striped: true },
  out_of_office: { label: 'Out of office', color: '#64748b', soft: soft('#64748b'), icon: Luggage, bucket: 'unavailable', blocking: true, striped: true },
  other: { label: 'Other', color: 'var(--ink-faint)', soft: 'var(--surface-inset)', icon: CircleDot, bucket: 'unavailable', blocking: false, striped: true },
  on_duty: { label: 'Club duty', color: 'var(--chart-2)', soft: soft('var(--chart-2)'), icon: Wrench, bucket: 'duty', blocking: false },
  club_duty: { label: 'Club duty', color: 'var(--chart-2)', soft: soft('var(--chart-2)'), icon: Wrench, bucket: 'duty', blocking: false },
  duty_outside_club: { label: 'Duty outside club', color: '#8b5cf6', soft: soft('#8b5cf6'), icon: MapPinned, bucket: 'duty', blocking: true, striped: true },
  working_elsewhere: { label: 'Working elsewhere', color: '#ec4899', soft: soft('#ec4899'), icon: Briefcase, bucket: 'duty', blocking: true, striped: true },
  training: { label: 'Training / development', color: '#06b6d4', soft: soft('#06b6d4'), icon: GraduationCap, bucket: 'duty', blocking: false },
  session: { label: 'Booked session', color: 'var(--brand-press)', soft: soft('var(--brand-press)', '1f'), icon: CalendarDays, bucket: 'session', blocking: true },
  task: { label: 'Booked task', color: 'var(--accent)', soft: 'var(--accent-soft)', icon: ClipboardList, bucket: 'task', blocking: true },
};

/** Session allocations take their colour from the coach role (§8). */
export const ROLE_COLOR: Record<CoachRole, string> = {
  lead: 'var(--brand-press)',
  responsible: 'var(--chart-2)',
  assistant: 'var(--info)',
  spare: '#64748b',
};

export const ROLE_LABEL: Record<CoachRole, string> = {
  responsible: 'Responsible coach',
  lead: 'Leading coach',
  assistant: 'Assisting coach',
  spare: 'Spare coach',
};

export function kindStyle(ev: DiaryEvent): KindStyle {
  const base = KIND[ev.kind];
  if (ev.kind === 'session' && ev.coachRole) {
    return { ...base, color: ROLE_COLOR[ev.coachRole] };
  }
  return base;
}

export const SOURCE_LABEL: Record<DiarySourceType, string> = {
  manual: 'Personal diary',
  planner: 'Regular availability',
  session: 'Session booking',
  task: 'Task',
  admin: 'Admin',
  booking: 'Booking',
};

/* ---------------- date & time helpers (club-local) ---------------- */

export const MS_MIN = 60_000;
export const MS_HOUR = 3_600_000;
export const MS_DAY = 86_400_000;

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** yyyy-mm-dd in local time (never toISOString — that shifts to UTC). */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** Monday-first week start. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const shift = (x.getDay() + 6) % 7;
  return addDays(x, -shift);
}

export function sameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function fmtTimeRange(start: string, end: string): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

export function fmtDayLong(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function fmtMoney(cents?: number | null): string {
  if (cents == null) return '';
  return `£${(cents / 100).toFixed(2)}`;
}

/** yyyy-MM-ddTHH:mm for <input type=datetime-local> in local time. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dateKey(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(v: string): Date {
  return new Date(v);
}

/** Snap a Date to the slot grid. */
export function snap(d: Date, slotMinutes: number): Date {
  const ms = slotMinutes * MS_MIN;
  return new Date(Math.round(d.getTime() / ms) * ms);
}

export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function clampDate(d: Date, min: Date, max: Date): Date {
  return d < min ? min : d > max ? max : d;
}

/** Events overlapping [dayStart, dayStart+24h) — multi-day events appear each day. */
export function eventsOnDay(events: DiaryEvent[], day: Date): DiaryEvent[] {
  const from = startOfDay(day).getTime();
  const to = from + MS_DAY;
  return events.filter((e) => Date.parse(e.start) < to && Date.parse(e.end) > from);
}

/** True when a regular/availability block is fully or partly overridden by a blocking entry. */
export function overriddenBy(ev: DiaryEvent, all: DiaryEvent[]): DiaryEvent | undefined {
  if (ev.kind !== 'working_hours' && ev.kind !== 'available') return undefined;
  return all.find(
    (o) =>
      o.id !== ev.id &&
      o.staffId === ev.staffId &&
      KIND[o.kind]?.blocking &&
      Date.parse(o.start) <= Date.parse(ev.start) &&
      Date.parse(o.end) >= Date.parse(ev.end),
  );
}
