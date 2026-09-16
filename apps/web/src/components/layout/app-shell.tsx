import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Bell,
  ChevronsLeft,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeft,
  ShieldCheck,
  Sun,
  WifiOff,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { transition } from '../../lib/motion';
import { useTheme, type ThemeMode } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { useAlertCount, usePersistentState } from '../../lib/hooks';
import { ALL_NAV_ITEMS, MOBILE_PRIMARY } from '../../lib/nav';
import { Avatar } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, SheetContent } from '../ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipProvider,
} from '../ui/menu';
import { PaletteTrigger } from '../patterns/command-palette';
import { PageTransition } from '../patterns/page-transition';
import { BrandMark, NavList } from './nav-list';

const RAIL_WIDTH = { collapsed: 84, expanded: 272 };

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Header title, derived from the nav model so route and label can never drift. */
function useCurrentPage() {
  const { pathname } = useLocation();
  return useMemo(() => {
    const exact = ALL_NAV_ITEMS.find((i) => i.to === pathname);
    if (exact) return exact;
    const prefix = ALL_NAV_ITEMS.filter((i) => i.to !== '/' && pathname.startsWith(i.to)).sort(
      (a, b) => b.to.length - a.to.length,
    )[0];
    if (prefix) return prefix;
    if (pathname.startsWith('/members/')) return ALL_NAV_ITEMS.find((i) => i.to === '/members');
    if (pathname.startsWith('/register/')) return ALL_NAV_ITEMS.find((i) => i.to === '/today');
    return undefined;
  }, [pathname]);
}

/* -------------------------------------------------------------------------- */
/* Theme control                                                              */
/* -------------------------------------------------------------------------- */

function ThemeControl({ compact, pillKey = 'theme-pill' }: { compact?: boolean; pillKey?: string }) {
  const { mode, setMode } = useTheme();
  const options: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ];
  const current = options.find((o) => o.value === mode) ?? options[2];

  if (compact) {
    return (
      <Tooltip label={`Theme: ${current.label} — click to flip, right-click for system`}>
        <button
          type="button"
          onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
          onContextMenu={(e) => {
            e.preventDefault();
            setMode('system');
          }}
          aria-label={`Colour theme: ${current.label}`}
          className="flex size-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={mode}
              initial={{ rotate: -35, opacity: 0, scale: 0.75 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 35, opacity: 0, scale: 0.75 }}
              transition={transition.fast}
              className="flex"
            >
              <current.icon className="size-4.5" />
            </motion.span>
          </AnimatePresence>
        </button>
      </Tooltip>
    );
  }

  return (
    <div role="radiogroup" aria-label="Colour theme" className="flex gap-1 rounded-lg border border-line bg-surface-inset p-0.5">
      {options.map((o) => {
        const active = mode === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(o.value)}
            className={cn(
              'relative flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-2 py-1.5 text-2xs font-semibold transition-colors',
              active ? 'text-ink' : 'text-ink-faint hover:text-ink-muted',
            )}
          >
            {active && (
              <motion.span
                layoutId={pillKey}
                className="absolute inset-0 -z-10 rounded-[7px] bg-surface-raised shadow-[var(--shadow-sm)]"
                transition={transition.fast}
              />
            )}
            <o.icon className="size-3.5" aria-hidden />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* User block                                                                 */
/* -------------------------------------------------------------------------- */

function UserMenu({ collapsed }: { collapsed?: boolean }) {
  const { staff, role, roles, setRole, signOut } = useAuth();
  const switchable = roles.length > 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'group flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface-inset/60 p-2 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-surface-hover',
            collapsed && 'justify-center border-transparent bg-transparent',
          )}
        >
          <Avatar name={staff?.display_name} size="sm" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-xs font-semibold text-ink">{staff?.display_name ?? 'Signed in'}</span>
                <span className="block truncate text-2xs text-ink-faint">{role ?? 'No role'}</span>
              </span>
              {switchable && (
                <Badge tone="brand" size="sm">
                  {roles.length}
                </Badge>
              )}
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>{staff?.display_name ?? 'Account'}</DropdownMenuLabel>
        <div className="px-2.5 pb-1.5">
          <Badge tone="outline" dot>
            {role ?? 'no role'}
          </Badge>
        </div>
        {switchable && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Switch active role</DropdownMenuLabel>
            {roles.map((r) => (
              <DropdownMenuItem key={r} onSelect={() => setRole(r)} className={cn(r === role && 'text-brand-text')}>
                <ShieldCheck aria-hidden />
                {r}
                {r === role && <span className="ml-auto text-2xs font-semibold">active</span>}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <ShieldCheck aria-hidden />
            Organisation settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void signOut()}
          className="text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger"
        >
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------------------------------------------------------------- */
/* App shell                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * AppShell — the frame around every authenticated screen.
 *
 * • glass rail (desktop) that collapses to an icon strip and remembers it
 * • glass top bar with page context, ⌘K search, live action counts, theme + user menus
 * • glass bottom bar (mobile) with 4 primary destinations + drawer for the rest
 * • offline is surfaced instead of silently failing a save
 * • route changes animate through <PageTransition> and reset scroll
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { userId, loading, staff, signOut } = useAuth();
  const reduce = useReducedMotion();
  const current = useCurrentPage();
  const online = useOnline();
  const alerts = useAlertCount(Boolean(userId) && !loading);
  const [collapsed, setCollapsed] = usePersistentState('mentis.railCollapsed', false);
  const [drawer, setDrawer] = useState(false);

  return (
    // The shell owns a tooltip provider so it is self-contained: any subtree it
    // renders (including tests and isolated previews) can use <Tooltip>.
    <TooltipProvider delayDuration={280} skipDelayDuration={400}>
    <div className="relative min-h-dvh bg-bg text-ink">
      {/* Ambient brand light: the flat canvas now has depth and direction. */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[42vh] overflow-hidden">
        <div className="absolute -left-24 -top-32 size-[38rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--brand)_22%,transparent),transparent_68%)] blur-3xl" />
        <div className="absolute -right-32 -top-40 size-[34rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,#6366f1_20%,transparent),transparent_70%)] blur-3xl" />
      </div>

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-md focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm focus:shadow-[var(--shadow-e3)]"
      >
        Skip to content
      </a>

      {!online && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 border-b border-line bg-warning-soft px-4 py-1.5 text-xs font-medium text-warning"
        >
          <WifiOff className="size-3.5" aria-hidden />
          You are offline — changes will not save until the connection returns.
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1600px]">
        {/* ------------------------------ desktop rail ----------------------------- */}
        <motion.aside
          animate={{ width: collapsed ? RAIL_WIDTH.collapsed : RAIL_WIDTH.expanded }}
          transition={reduce ? { duration: 0 } : transition.base}
          className="sticky top-0 hidden h-dvh shrink-0 p-3 lg:block"
        >
          <div className="card card-glass flex h-full flex-col gap-2 overflow-hidden p-2.5">
            <div className={cn('flex items-center gap-2 px-1.5 py-1.5', collapsed ? 'flex-col' : 'justify-between')}>
              <Link to="/" aria-label="Mentis home" className="min-w-0">
                <BrandMark collapsed={collapsed} />
              </Link>
              <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side={collapsed ? 'right' : 'bottom'}>
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => !c)}
                  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  aria-expanded={!collapsed}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {collapsed ? <PanelLeft className="size-4" /> : <ChevronsLeft className="size-4" />}
                </button>
              </Tooltip>
            </div>

            {!collapsed && <PaletteTrigger className="mx-1" />}

            <div className="mx-2 my-1 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />

            <NavList collapsed={collapsed} layoutKey="rail" className="min-h-0 flex-1 px-1" />

            <div className="mt-1 flex flex-col gap-2">
              {!collapsed && <ThemeControl pillKey="theme-pill-rail" />}
              <UserMenu collapsed={collapsed} />
            </div>
          </div>
        </motion.aside>

        {/* ------------------------------ main column ----------------------------- */}
        <div className="flex min-h-dvh w-full min-w-0 flex-1 flex-col">
          <header className="glass safe-top sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-line px-3 sm:px-4">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label="Open navigation"
              className="flex size-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink lg:hidden"
            >
              <Menu className="size-5" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {current?.icon && <current.icon className="size-4 shrink-0 text-brand-text" aria-hidden />}
                <span className="truncate font-display text-sm font-bold tracking-[-0.01em] text-ink">
                  {current?.label ?? 'Mentis'}
                </span>
              </div>
              <p className="hidden truncate text-2xs text-ink-faint sm:block">
                {staff?.display_name} ·{' '}
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>

            <PaletteTrigger className="hidden w-56 md:flex lg:w-64" />

            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Action queue: ${alerts.breached} breached, ${alerts.open} open`}
                    className="relative flex size-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]"
                  >
                    <Bell className="size-4.5" />
                    {alerts.breached > 0 && (
                      <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white shadow-[0_0_0_2px_var(--surface)]">
                        {alerts.breached > 99 ? '99+' : alerts.breached}
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-72">
                  <DropdownMenuLabel>Action queue</DropdownMenuLabel>
                  <div className="grid grid-cols-2 gap-2 p-2">
                    <Link
                      to="/inbox"
                      className="rounded-lg border border-line bg-surface-inset p-2.5 transition-colors hover:border-[var(--border-strong)]"
                    >
                      <div className="overline">Breached</div>
                      <div className="mt-1 font-display text-xl font-extrabold tabular-nums text-danger">{alerts.breached}</div>
                    </Link>
                    <Link
                      to="/inbox"
                      className="rounded-lg border border-line bg-surface-inset p-2.5 transition-colors hover:border-[var(--border-strong)]"
                    >
                      <div className="overline">Open</div>
                      <div className="mt-1 font-display text-xl font-extrabold tabular-nums text-ink">{alerts.open}</div>
                    </Link>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/inbox">
                      <Bell aria-hidden />
                      Open the inbox
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={alerts.refresh}>Refresh counts</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <ThemeControl compact />

              <div className="lg:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label="Account menu" className="flex items-center rounded-full p-0.5">
                      <Avatar name={staff?.display_name} size="sm" ring />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>{staff?.display_name ?? 'Account'}</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <Link to="/settings">
                        <ShieldCheck aria-hidden />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void signOut()}>
                      <LogOut aria-hidden />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          <main id="main" className="min-w-0 flex-1 px-3 pb-28 pt-5 sm:px-5 lg:pb-10">
            <div className="mx-auto w-full max-w-(--content-max)">
              <PageTransition>{children}</PageTransition>
            </div>
          </main>
        </div>
      </div>

      {/* ----------------------------- mobile bottom bar ---------------------------- */}
      <nav
        aria-label="Primary"
        className="glass fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-line px-1 pt-1 pb-safe lg:hidden"
      >
        {MOBILE_PRIMARY.map((item) => (
          <MobileTab key={item.to} item={item} />
        ))}
        <button
          type="button"
          onClick={() => setDrawer(true)}
          className="flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-ink-faint transition-transform active:scale-95"
        >
          <Menu className="size-5" aria-hidden />
          <span className="text-[10px] font-semibold">More</span>
        </button>
      </nav>

      {/* ------------------------------- mobile drawer ------------------------------ */}
      <Dialog open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="p-3" hideClose>
          <div className="flex items-center justify-between px-1">
            <BrandMark />
            <button
              type="button"
              onClick={() => setDrawer(false)}
              aria-label="Close navigation"
              className="flex size-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-hover"
            >
              <X className="size-4.5" />
            </button>
          </div>
          <div className="mt-3">
            <PaletteTrigger className="w-full" />
          </div>
          <NavList layoutKey="drawer" onNavigate={() => setDrawer(false)} className="mt-3 pb-4" />
          <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
            <ThemeControl pillKey="theme-pill-drawer" />
            <UserMenu />
            <Button intent="ghost" size="sm" iconLeft={<LogOut />} onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </SheetContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}

/** Bottom-bar tab with an animated active indicator. */
function MobileTab({ item }: { item: (typeof MOBILE_PRIMARY)[number] }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className="flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 transition-colors active:scale-95"
    >
      <span className={cn('relative flex flex-col items-center gap-1', active ? 'text-brand-text' : 'text-ink-faint')}>
        {active && (
          <motion.span
            layoutId={reduce ? undefined : 'tab-active'}
            className="absolute -top-1 h-0.5 w-8 rounded-full bg-brand"
            transition={transition.base}
          />
        )}
        <Icon className="size-5" aria-hidden />
        <span className="text-[10px] font-semibold">{item.label}</span>
      </span>
    </NavLink>
  );
}
