import {
  Activity,
  BadgeCheck,
  BellRing,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CalendarX2,
  ClipboardList,
  Download,
  Gauge,
  HandCoins,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Layers,
  LineChart,
  MapPin,
  Medal,
  Palette,
  Receipt,
  Repeat,
  ScrollText,
  Search,
  Settings,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Swords,
  Target,
  Ticket,
  Timer,
  TrendingUp,
  Trophy,
  Upload,
  UserCog,
  UserPlus,
  Users,
  Users2,
  Wallet,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@mentis/core';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  perm?: Permission;
  /** Shown in the mobile bottom bar. */
  primary?: boolean;
  /** Extra search terms for the command palette. */
  keywords?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * One navigation model for the sidebar, the mobile bar, the drawer and the
 * ⌘K palette. Previously the nav was a flat 18-item list inside `ui.tsx`, which
 * is why nothing was findable: no grouping, no keywords, no search.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, keywords: 'home kpi summary' },
      { to: '/today', label: 'Today', icon: CalendarDays, perm: 'sessions.assigned', primary: true, keywords: 'sessions register now' },
    ],
  },
  {
    id: 'coaching',
    label: 'Coaching',
    items: [
      { to: '/sessions', label: 'Sessions', icon: CalendarRange, perm: 'sessions.manage', keywords: 'classes timetable' },
      { to: '/diary-manage', label: 'Diary', icon: CalendarClock, perm: 'diary.manage', keywords: 'calendar bookings' },
      { to: '/scheduling', label: 'Scheduling', icon: Repeat, perm: 'sessions.manage', keywords: 'patterns generate' },
      { to: '/availability', label: 'Coach diary', icon: CalendarDays, perm: 'availability.recordSelf', keywords: 'diary availability calendar holiday planner hours' },
      { to: '/staffing', label: 'Staffing', icon: Users2, perm: 'staffing.manage', keywords: 'assign coach' },
      { to: '/closeout', label: 'Close-out', icon: CalendarCheck, perm: 'staffing.manage', keywords: 'session close reconciliation' },
      { to: '/overrides', label: 'Overrides', icon: SlidersHorizontal, perm: 'sessions.manage', keywords: 'exceptions changes' },
      { to: '/holidays', label: 'Holidays', icon: CalendarX2, perm: 'sessions.manage', keywords: 'closure term dates' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { to: '/members', label: 'Members', icon: Users, perm: 'customers.view', primary: true, keywords: 'players athletes' },
      { to: '/customers', label: 'Customers', icon: Building2, perm: 'customers.view', keywords: 'payer account guardian' },
      { to: '/enrolments', label: 'Enrolments', icon: UserPlus, perm: 'sessions.manage', keywords: 'join class' },
      { to: '/tasters', label: 'Tasters', icon: Sparkles, perm: 'tasters.manage', keywords: 'prospects leads funnel' },
    ],
  },
  {
    id: 'work',
    label: 'My work',
    items: [
      { to: '/tasks', label: 'Tasks', icon: ClipboardList, perm: 'tasks.viewOwn', primary: true, keywords: 'todo assign' },
      { to: '/inbox', label: 'Inbox', icon: Inbox, perm: 'actions.closeOwn', primary: true, keywords: 'pending actions approvals' },
      { to: '/actions/new', label: 'New action', icon: BellRing, perm: 'actions.createManual', keywords: 'manual reminder' },
      { to: '/action-timelines', label: 'Timelines', icon: Activity, perm: 'tasks.approve', keywords: 'history audit trail' },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    items: [
      { to: '/billing', label: 'Billing', icon: Wallet, perm: 'billing.viewOwn', keywords: 'invoices charges' },
      { to: '/charges', label: 'Charges', icon: Receipt, perm: 'charges.viewOwn', keywords: 'debits refunds' },
      { to: '/timesheet', label: 'Timesheet', icon: Timer, perm: 'timesheet.self', keywords: 'hours worked pay' },
      { to: '/rates', label: 'Rate cards', icon: HandCoins, perm: 'rates.manage', keywords: 'pricing hourly' },
      { to: '/reports', label: 'Reports', icon: LineChart, perm: 'billing.viewAll', keywords: 'export finance' },
    ],
  },
  {
    id: 'competition',
    label: 'Competition',
    items: [
      { to: '/events', label: 'Events', icon: Trophy, perm: 'events.viewOwn', keywords: 'tournaments matches' },
      { to: '/matches/new', label: 'Match entry', icon: Swords, perm: 'events.manage', keywords: 'results scores' },
      { to: '/rankings', label: 'Rankings', icon: Medal, perm: 'events.manage', keywords: 'league table rating' },
      { to: '/goals', label: 'Goals', icon: Target, perm: 'events.manage', keywords: 'objectives targets' },
      { to: '/bookings', label: 'Bookings', icon: Ticket, perm: 'events.manage', keywords: 'court hire' },
      { to: '/slots', label: 'Booking slots', icon: Timer, perm: 'events.manage', keywords: 'availability slot' },
      { to: '/sparring', label: 'Sparring', icon: Swords, perm: 'events.manage', keywords: 'pairing partner' },
      { to: '/analytics', label: 'Analytics', icon: TrendingUp, perm: 'events.viewOwn', keywords: 'charts insight' },
      { to: '/progress', label: 'Progress', icon: Gauge, perm: 'events.manage', keywords: 'reports growth' },
      { to: '/coach-perf', label: 'Coach performance', icon: BadgeCheck, perm: 'billing.viewOwn', keywords: 'retention' },
      { to: '/suggest', label: 'Auto-suggest', icon: Wand2, perm: 'events.manage', keywords: 'recommendations' },
    ],
  },
  {
    id: 'club',
    label: 'Club',
    items: [
      { to: '/venues', label: 'Venues', icon: MapPin, perm: 'venues.manage', keywords: 'tables site rooms' },
      { to: '/groups', label: 'Groups', icon: Layers, perm: 'groups.manage', keywords: 'squads cohorts' },
      { to: '/import', label: 'Import', icon: Upload, perm: 'sessions.manage', keywords: 'csv bulk upload' },
      { to: '/venue-dashboard', label: 'Venue dashboard', icon: LayoutGrid, perm: 'billing.viewAll', keywords: 'utilisation' },
      { to: '/member-sessions', label: 'Member sessions', icon: CalendarCheck, perm: 'billing.viewAll', keywords: 'attendance history' },
      { to: '/ics', label: 'Calendar export', icon: Download, perm: 'timesheet.self', keywords: 'ics subscribe' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      { to: '/users', label: 'Users & roles', icon: UserCog, perm: 'users.manage', keywords: 'permissions staff' },
      { to: '/devices', label: 'Devices', icon: Smartphone, perm: 'devices.revoke', keywords: 'sessions revoke mobile' },
      { to: '/audit', label: 'Audit log', icon: ScrollText, perm: 'audit.view', keywords: 'history compliance' },
      { to: '/settings', label: 'Settings', icon: Settings, perm: 'org.manage', keywords: 'organisation action types broadcast' },
      { to: '/search', label: 'Global search', icon: Search, keywords: 'find everything' },
      { to: '/design-system', label: 'Design system', icon: Palette, keywords: 'tokens components style guide' },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Items for the mobile bottom bar (always ≤ 5 for thumb reach). */
export const MOBILE_PRIMARY: NavItem[] = [
  ...ALL_NAV_ITEMS.filter((i) => i.primary).slice(0, 4),
];

export function filterNavByPermission(canDo: (p: Permission) => boolean) {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || canDo(i.perm)) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Permission required to view a path — used by the route table + palette. */
export function permissionFor(path: string): Permission | undefined {
  return ALL_NAV_ITEMS.find((i) => i.to === path)?.perm;
}
