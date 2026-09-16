import * as RadixDialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Command, CornerDownLeft, Moon, Search, Sun } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { scaledSheetVariants, scrimVariants } from '../../lib/motion';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { filterNavByPermission, type NavItem } from '../../lib/nav';
import { Badge } from '../ui/badge';

/* -------------------------------------------------------------------------- */
/* Provider — owns the open state, the global shortcut and the mounting       */
/* -------------------------------------------------------------------------- */

interface PaletteCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

const Ctx = createContext<PaletteCtx>({ open: false, setOpen: () => {}, toggle: () => {} });

export function useCommandPalette() {
  return useContext(Ctx);
}

export function CommandPaletteProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, enabled]);

  const value = useMemo(() => ({ open: enabled && open, setOpen, toggle }), [open, enabled, toggle]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {enabled && <CommandPalette />}
    </Ctx.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                   */
/* -------------------------------------------------------------------------- */

/** Cheap fuzzy score: contiguous prefix > word start > scattered subsequence. */
function score(query: string, item: NavItem, extraLabel?: string) {
  const q = query.toLowerCase();
  const label = `${item.label} ${extraLabel ?? ''} ${item.keywords ?? ''} ${item.to}`.toLowerCase();
  if (!q) return 1;
  const direct = label.indexOf(q);
  if (direct === 0) return 1000;
  if (direct > 0) return label[direct - 1] === ' ' ? 700 - direct : 400 - direct;
  let i = 0;
  let gaps = 0;
  for (const ch of q) {
    const next = label.indexOf(ch, i);
    if (next === -1) return 0;
    gaps += next - i;
    i = next + 1;
  }
  return Math.max(1, 120 - gaps);
}

/* -------------------------------------------------------------------------- */
/* Palette                                                                    */
/* -------------------------------------------------------------------------- */

interface Entry extends NavItem {
  group: string;
  action?: () => void;
  shortcut?: string;
}

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const navigate = useNavigate();
  const { canDo, signOut, staff, role } = useAuth();
  const { theme, setMode } = useTheme();
  const reduce = useReducedMotion();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem('mentis.recentRoutes') ?? '[]'));
    } catch {
      setRecent([]);
    }
  }, [open]);

  const groups = useMemo(() => filterNavByPermission(canDo), [canDo]);

  const entries = useMemo<Entry[]>(() => {
    const nav: Entry[] = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
    const actions: Entry[] = [
      {
        to: '__theme',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        group: 'Preferences',
        icon: theme === 'dark' ? Sun : Moon,
        action: () => setMode(theme === 'dark' ? 'light' : 'dark'),
        keywords: 'appearance colour mode',
      },
      {
        to: '__signout',
        label: 'Sign out',
        group: 'Account',
        icon: Command,
        action: () => void signOut(),
        keywords: 'log out exit',
      },
    ];
    return [...nav, ...actions];
  }, [groups, theme, setMode, signOut]);

  const results = useMemo(() => {
    const scored = entries
      .map((e) => ({ e, s: score(query, e) + (query ? 0 : recent.includes(e.to) ? 30 : 0) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 9)
      .map((r) => r.e);
    return scored;
  }, [entries, query, recent]);

  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const r of results) {
      const list = map.get(r.group) ?? [];
      list.push(r);
      map.set(r.group, list);
    }
    return [...map.entries()];
  }, [results]);

  const flat = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);

  useEffect(() => setActive(0), [query, open]);

  const commit = useCallback(
    (entry?: Entry) => {
      const chosen = entry ?? flat[active];
      if (!chosen) return;
      setOpen(false);
      setQuery('');
      if (chosen.action) {
        chosen.action();
        return;
      }
      const next = [chosen.to, ...recent.filter((r) => r !== chosen.to)].slice(0, 5);
      setRecent(next);
      try {
        localStorage.setItem('mentis.recentRoutes', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      navigate(chosen.to);
    },
    [active, flat, navigate, recent, setOpen],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % Math.max(flat.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + flat.length) % Math.max(flat.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                variants={scrimVariants}
                initial="hidden"
                animate="show"
                exit="exit"
                className="fixed inset-0 z-[70] bg-scrim backdrop-blur-[6px]"
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content asChild forceMount aria-label="Command palette">
              <motion.div
                variants={scaledSheetVariants}
                initial="hidden"
                animate="show"
                exit="exit"
                className="fixed left-1/2 top-[12vh] z-[71] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface-raised/95 shadow-[var(--shadow-e4)] backdrop-blur-2xl"
              >
                <RadixDialog.Title className="sr-only">Command palette</RadixDialog.Title>
                <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
                  <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Jump to anything — members, sessions, settings…"
                    aria-label="Search commands"
                    className="h-6 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
                  />
                  <kbd className="hidden shrink-0 items-center gap-0.5 rounded-[6px] border border-line bg-surface-inset px-1.5 py-0.5 font-mono text-2xs text-ink-faint sm:flex">
                    ESC
                  </kbd>
                </div>

                <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2" role="listbox">
                  {flat.length === 0 && (
                    <p className="px-3 py-8 text-center text-sm text-ink-muted">
                      No matches for <span className="font-semibold text-ink">“{query}”</span>
                    </p>
                  )}
                  {grouped.map(([group, items]) => (
                    <div key={group} className="mb-1 last:mb-0">
                      <div className="overline px-3 py-1.5">{group}</div>
                      {items.map((item) => {
                        const index = flat.indexOf(item);
                        const isActive = index === active;
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.to}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            data-active={isActive}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => commit(item)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                              isActive ? 'bg-surface-hover text-ink' : 'text-ink-muted',
                            )}
                          >
                            <Icon className={cn('size-4 shrink-0', isActive ? 'text-brand-text' : 'text-ink-faint')} />
                            <span className="flex-1 truncate font-medium">{item.label}</span>
                            {item.perm && <Badge tone="outline" size="sm">{item.perm}</Badge>}
                            {isActive && <CornerDownLeft className="size-3.5 shrink-0 text-ink-faint" />}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-inset/60 px-4 py-2 text-2xs text-ink-faint">
                  <span className="flex items-center gap-2">
                    <Key>↑</Key>
                    <Key>↓</Key> navigate
                    <Key>↵</Key> open
                  </span>
                  <span className="truncate">
                    {staff?.display_name}
                    {role ? ` · ${role}` : ''}
                  </span>
                </div>
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-line bg-surface px-1.5 py-0.5 font-mono text-2xs">{children}</kbd>
  );
}

/** The header's search affordance — looks like an input, opens the palette. */
export function PaletteTrigger({ className }: { className?: string }) {
  const { setOpen } = useCommandPalette();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        'group flex h-9 items-center gap-2 rounded-md border border-line bg-surface-inset/70 px-3 text-sm text-ink-faint',
        'transition-colors hover:border-[var(--border-strong)] hover:text-ink-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]',
        className,
      )}
      aria-label="Search and jump to (Command K)"
    >
      <Search className="size-3.5" aria-hidden />
      <span className="hidden min-w-24 text-left lg:inline">Search…</span>
      <span className="ml-auto hidden items-center gap-0.5 lg:flex">
        <Key>⌘</Key>
        <Key>K</Key>
      </span>
    </button>
  );
}
