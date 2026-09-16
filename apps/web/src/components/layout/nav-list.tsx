import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { transition } from '../../lib/motion';
import { useAuth } from '../../lib/auth';
import { usePersistentState } from '../../lib/hooks';
import { filterNavByPermission } from '../../lib/nav';
import { Tooltip } from '../ui/menu';

/* -------------------------------------------------------------------------- */
/* Brand mark                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The wordmark is now a designed object rather than black text: a gradient
 * monogram with a court-net motif, plus the organisation line, so the product
 * and the club are both legible at a glance.
 */
export function BrandMark({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,var(--brand),#0d9488_55%,#4f46e5)] shadow-[var(--shadow-glow)]">
        <svg viewBox="0 0 24 24" className="size-5 text-[var(--brand-ink)]" aria-hidden>
          <path d="M5 19V5.5L12 12l7-6.5V19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-white/15" />
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block font-display text-base font-extrabold tracking-[-0.03em] text-ink">Mentis</span>
          <span className="block truncate text-2xs font-medium tracking-[0.02em] text-ink-faint">
            Kingfisher TTC
          </span>
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Nav list                                                                   */
/* -------------------------------------------------------------------------- */

export interface NavListProps {
  /** Icon-only rail mode (desktop collapsed). */
  collapsed?: boolean;
  /** Called after a nav item is chosen — used to close the mobile drawer. */
  onNavigate?: () => void;
  /** Distinct per mounting surface so the sliding active pill never animates
      between the desktop rail and the mobile drawer. */
  layoutKey?: string;
  className?: string;
}

/**
 * Grouped, collapsible navigation with a shared active indicator.
 *
 * The old sidebar was one 18-link wall with no hierarchy. Groups are now named
 * for the job to be done, remember their open state, and always reveal the
 * group you are currently inside.
 */
export function NavList({ collapsed = false, onNavigate, layoutKey = 'sidebar', className }: NavListProps) {
  const { canDo } = useAuth();
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const groups = useMemo(() => filterNavByPermission(canDo), [canDo]);

  const activeGroup = useMemo(
    () => groups.find((g) => g.items.some((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to))))?.id,
    [groups, pathname],
  );

  const [open, setOpen] = usePersistentState<string[]>('mentis.navGroups', ['overview', 'work']);

  // Never hide the section you are working in.
  useEffect(() => {
    if (activeGroup && !open.includes(activeGroup)) setOpen((prev) => [...prev, activeGroup]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup]);

  const toggle = (id: string) => setOpen((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));

  return (
    <nav aria-label="Main" className={cn('flex flex-col gap-0.5 overflow-y-auto py-1 no-scrollbar', className)}>
      {groups.map((group) => {
        const isOpen = collapsed || open.includes(group.id);
        const hasActive = group.id === activeGroup;
        return (
          <div key={group.id} className="mb-1">
            {!collapsed && (
              <button
                type="button"
                onClick={() => toggle(group.id)}
                aria-expanded={isOpen}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors',
                  'hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
                )}
              >
                <span className={cn('overline', hasActive && 'text-brand-text')}>{group.label}</span>
                <motion.span animate={{ rotate: isOpen ? 0 : -90 }} transition={transition.fast} className="text-ink-faint">
                  <ChevronDown className="size-3.5" aria-hidden />
                </motion.span>
              </button>
            )}

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.ul
                  initial={reduce ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduce ? undefined : { height: 0, opacity: 0 }}
                  transition={transition.base}
                  className="overflow-hidden"
                >
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const link = (
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        onClick={onNavigate}
                        className={({ isActive }) => cn('navlink', isActive && 'active', collapsed && 'justify-center px-0')}
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <motion.span
                                layoutId={reduce ? undefined : `${layoutKey}-active`}
                                className="absolute inset-0 -z-10 rounded-md bg-brand-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_22%,transparent)]"
                                transition={transition.base}
                              />
                            )}
                            <Icon className="size-4 shrink-0" aria-hidden />
                            {!collapsed && <span className="truncate">{item.label}</span>}
                          </>
                        )}
                      </NavLink>
                    );
                    return (
                      <li key={item.to} className="relative">
                        {collapsed ? (
                          <Tooltip label={item.label} side="right">
                            <div>{link}</div>
                          </Tooltip>
                        ) : (
                          link
                        )}
                      </li>
                    );
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </nav>
  );
}
