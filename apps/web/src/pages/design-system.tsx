/* eslint-disable @typescript-eslint/no-explicit-any */
import { motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  ClipboardList,
  Command,
  Filter,
  Inbox,
  Info,
  Layers,
  Plus,
  Search,
  Settings,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { Reveal } from '../components/patterns/page-transition';
import { PageHeader, SectionHeader } from '../components/patterns/page-header';
import {
  Avatar,
  Badge,
  Button,
  CapacityMeter,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CardToolbar,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Field,
  InboxZeroState,
  Input,
  InputWithIcon,
  NoResultsState,
  Pagination,
  Progress,
  ProgressRing,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonList,
  SkeletonStatGrid,
  Sparkline,
  StatCard,
  StatGrid,
  StatusBadge,
  Tooltip,
  usePager,
  toast,
  type Column,
} from '../components/ui';
import { dateShort, money, timeRange } from '../lib/format';
import { useTheme } from '../lib/theme';
import { DS_NAME, DS_VERSION, duration, easing, radii, spring, typeScale } from '@mentis/core';

/* -------------------------------------------------------------------------- */
/* Sample data for the component gallery                                      */
/* -------------------------------------------------------------------------- */

interface SessionRow {
  id: string;
  name: string;
  venue: string;
  start: string;
  end: string;
  coach: string;
  places: number;
  capacity: number;
  status: string;
  fee: number;
}

const SESSIONS: SessionRow[] = [
  { id: 's1', name: 'Junior Development', venue: 'Main Hall', start: '2026-09-16T16:30:00Z', end: '2026-09-16T18:00:00Z', coach: 'Ava Kamath', places: 18, capacity: 20, status: 'scheduled', fee: 900 },
  { id: 's2', name: 'Adult Improvers', venue: 'Court 2', start: '2026-09-16T18:15:00Z', end: '2026-09-16T19:45:00Z', coach: 'Rueben Silva', places: 12, capacity: 12, status: 'open', fee: 1200 },
  { id: 's3', name: 'Performance Squad', venue: 'Court 1', start: '2026-09-16T19:00:00Z', end: '2026-09-16T21:00:00Z', coach: 'Ava Kamath', places: 6, capacity: 10, status: 'pending', fee: 1500 },
  { id: 's4', name: 'Taster Session', venue: 'Main Hall', start: '2026-09-17T10:00:00Z', end: '2026-09-17T11:00:00Z', coach: 'Jonas Wills', places: 4, capacity: 16, status: 'draft', fee: 0 },
  { id: 's5', name: 'Veterans Social', venue: 'Court 3', start: '2026-09-17T14:00:00Z', end: '2026-09-17T16:00:00Z', coach: 'Rueben Silva', places: 14, capacity: 24, status: 'breached', fee: 800 },
];

const SPARK = [12, 14, 13, 19, 22, 21, 26, 31];

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export function DesignSystem() {
  const { theme, mode, setMode } = useTheme();
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<'all' | 'today' | 'flagged'>('all');
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  const rows = SESSIONS.filter((s) => (filter === 'flagged' ? s.status === 'breached' : true));
  const pager = usePager(rows, 4);

  const columns: Column<SessionRow>[] = [
    {
      key: 'name',
      header: 'Session',
      sortable: true,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-text">
            <CalendarDays className="size-4" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-ink">{r.name}</span>
            <span className="block text-2xs text-ink-faint">{r.venue}</span>
          </span>
        </div>
      ),
      sortValue: (r) => r.name,
    },
    { key: 'time', header: 'Time', sortable: true, cell: (r) => timeRange(r.start, r.end), sortValue: (r) => r.start },
    { key: 'coach', header: 'Coach', cell: (r) => <span className="flex items-center gap-2"><Avatar name={r.coach} size="xs" />{r.coach}</span>, sortable: true, hideBelow: 'lg' },
    { key: 'places', header: 'Places', align: 'center', cell: (r) => <CapacityMeter taken={r.places} capacity={r.capacity} />, sortValue: (r) => r.places / r.capacity },
    { key: 'fee', header: 'Fee', align: 'right', cell: (r) => (r.fee ? money(r.fee) : 'Free'), sortable: true, sortValue: (r) => r.fee, hideBelow: 'sm' },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} />, sortable: true },
  ];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow={`${DS_NAME} · v${DS_VERSION}`}
        title="Design system"
        subtitle="Every token, primitive and motion preset the console is built from — rendered live, so it can be reviewed and regression-checked in the browser."
        breadcrumbs={[{ label: 'Design system' }]}
        actions={
          <>
            <Badge tone="brand" dot>
              {mode} mode
            </Badge>
            <SegmentedControl
              ariaLabel="Preview theme"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'Auto' },
              ]}
            />
          </>
        }
        tabs={
          <nav className="flex gap-1 overflow-x-auto no-scrollbar">
            {[
              ['Foundations', '#foundations'],
              ['Colour', '#colour'],
              ['Type', '#type'],
              ['Motion', '#motion'],
              ['Components', '#components'],
              ['Patterns', '#patterns'],
              ['Native parity', '#native'],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
              >
                {label}
              </a>
            ))}
          </nav>
        }
      />

      {/* ------------------------------ foundations ----------------------------- */}
      <section id="foundations" className="scroll-mt-24">
        <SectionHeader
          title="Foundations"
          description="Radii, elevation and density. Values live in packages/core/src/tokens.ts and are asserted against both stylesheets in CI."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <Card pad="md">
            <CardTitle as="h4">Radii</CardTitle>
            <CardDescription>Radius grows with the size of the surface it wraps.</CardDescription>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {Object.entries(radii).map(([name, value]) => (
                <div key={name} className="flex flex-col items-center gap-1.5">
                  <div
                    className="size-12 border border-line bg-surface-inset"
                    style={{ borderRadius: value === 999 ? 999 : value }}
                    aria-hidden
                  />
                  <span className="text-2xs font-semibold text-ink-muted">{name}</span>
                  <span className="text-2xs tabular-nums text-ink-faint">{value === 999 ? 'full' : `${value}px`}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card pad="md">
            <CardTitle as="h4">Elevation</CardTitle>
            <CardDescription>Four levels plus two brand glows. Dark mode swaps ambient shadow for a top sheen.</CardDescription>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(['e1', 'e2', 'e3', 'e4'] as const).map((level) => (
                <div key={level} className="flex flex-col items-center gap-2">
                  <div className="grid h-16 w-full place-items-center rounded-lg border border-line bg-surface" style={{ boxShadow: `var(--shadow-${level})` }}>
                    <span className="text-2xs font-bold uppercase tracking-wider text-ink-muted">{level}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card pad="md">
            <CardTitle as="h4">Motion tokens</CardTitle>
            <CardDescription>One duration table, shared with React Native Reanimated.</CardDescription>
            <dl className="mt-3 divide-y divide-line text-xs">
              {Object.entries(duration).map(([name, ms]) => (
                <div key={name} className="flex items-center justify-between py-1.5">
                  <dt className="font-mono text-ink-muted">{name}</dt>
                  <dd className="tabular-nums text-ink">{ms}ms</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-2xs text-ink-faint">
              Easings: {Object.keys(easing).join(' · ')}
              <br />
              Springs: {Object.keys(spring).join(' · ')}
            </p>
          </Card>
        </div>
      </section>

      {/* --------------------------------- colour ------------------------------- */}
      <section id="colour" className="scroll-mt-24">
        <SectionHeader
          title="Colour"
          description="Semantic tokens only — components never reference raw hex. Every pair below is contrast-checked for its actual use (body text, large text, or non-text UI)."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Card pad="md">
            <CardTitle as="h4">Surfaces &amp; text</CardTitle>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                ['bg', 'Canvas'],
                ['surface', 'Card'],
                ['surface-hover', 'Hover'],
                ['surface-inset', 'Inset'],
                ['ink', 'Primary text'],
                ['ink-muted', 'Secondary'],
              ].map(([token, label]) => (
                <div key={token} className="rounded-lg border border-line p-2">
                  <div className="h-9 rounded-md border border-line" style={{ background: `var(--${token})` }} aria-hidden />
                  <div className="mt-1.5 text-2xs font-semibold text-ink">{label}</div>
                  <div className="font-mono text-2xs text-ink-faint">--{token}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card pad="md">
            <CardTitle as="h4">Accents &amp; functional</CardTitle>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                ['brand', 'Brand'],
                ['accent', 'Gold'],
                ['success', 'Success'],
                ['warning', 'Warning'],
                ['danger', 'Danger'],
                ['info', 'Info'],
              ].map(([token, label]) => (
                <div key={token} className="rounded-lg border border-line p-2">
                  <div className="h-9 rounded-md" style={{ background: `var(--${token})` }} aria-hidden />
                  <div className="mt-1.5 text-2xs font-semibold text-ink">{label}</div>
                  <div className="font-mono text-2xs text-ink-faint">--{token}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="brand" dot>Brand</Badge>
              <Badge tone="success" dot>Success</Badge>
              <Badge tone="warning" dot>Warning</Badge>
              <Badge tone="danger" dot>Danger</Badge>
              <Badge tone="info" dot>Info</Badge>
              <Badge tone="accent" icon={<Trophy />}>Gold</Badge>
              <Badge tone="outline">Outline</Badge>
            </div>
            <p className="mt-3 text-2xs text-ink-faint">
              Current theme: <span className="font-mono text-ink-muted">{theme}</span> · status words map to tones
              centrally (<span className="font-mono">breached → danger</span>, <span className="font-mono">paid → success</span>).
            </p>
          </Card>
        </div>
      </section>

      {/* ---------------------------------- type -------------------------------- */}
      <section id="type" className="scroll-mt-24">
        <SectionHeader
          title="Typography"
          description="Plus Jakarta Sans for display (confident, geometric), Inter for interface text (best-in-class at 13px). Figures are tabular everywhere numbers stack."
        />
        <Card pad="md">
          <div className="flex flex-col gap-1">
            {Object.entries(typeScale).map(([name, spec]) => (
              <div key={name} className="flex flex-wrap items-baseline gap-3 border-b border-line py-2.5 last:border-0">
                <span className="w-16 shrink-0 font-mono text-2xs text-ink-faint">{name}</span>
                <span
                  className={name === 'display' || name === '4xl' || name === '3xl' ? 'font-display font-extrabold' : 'font-sans'}
                  style={{ fontSize: name === 'display' ? '2.25rem' : spec.native, fontWeight: Number(spec.native) >= 24 ? 800 : 500 }}
                >
                  {name === 'display' ? 'Match day readiness' : 'Register marked 18 of 24'}
                </span>
                <span className="ml-auto font-mono text-2xs text-ink-faint">
                  {spec.web} · {spec.native}px native · {spec.lineHeight}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <div className="overline mb-1.5">Tabular figures</div>
              <p className="font-display text-2xl font-extrabold tabular-nums">£12,480.50</p>
            </div>
            <div>
              <div className="overline mb-1.5">Display</div>
              <p className="font-display text-xl font-extrabold tracking-[-0.03em]">Junior Development</p>
            </div>
            <div>
              <div className="overline mb-1.5">Overline label</div>
              <p className="overline">Attendance · this week</p>
            </div>
          </div>
        </Card>
      </section>

      {/* --------------------------------- motion ------------------------------- */}
      <section id="motion" className="scroll-mt-24">
        <SectionHeader
          title="Motion"
          description="Every animation answers one of four questions: did that register, what changed, where am I, or what should I do next. Reduced-motion collapses all of it."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card pad="md">
            <CardTitle as="h4">Micro-interactions</CardTitle>
            <CardDescription>Try them — hover, press and release.</CardDescription>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button intent="primary" iconLeft={<Zap />}>Press me</Button>
              <Button intent="soft" iconLeft={<Sparkles />}>Soft</Button>
              <Button intent="ghost" iconLeft={<Filter />}>Ghost</Button>
              <Button intent="danger" iconLeft={<Trash2 />}>Danger</Button>
              <Button
                intent="secondary"
                loading={busy}
                onClick={() => {
                  setBusy(true);
                  toast.loading('Saving register…', { description: '18 of 24 marked present' });
                  window.setTimeout(() => {
                    setBusy(false);
                    toast.success('Register saved', { description: 'Synced just now', action: { label: 'Undo', onClick: () => toast.info('Undone') } });
                  }, 1600);
                }}
              >
                Simulate save
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Card interactive pad="sm" className="w-40">
                <div className="overline">Hover lift</div>
                <div className="mt-1 text-sm font-semibold">2dp + shadow</div>
              </Card>
              <div className="flex h-[68px] w-40 flex-col justify-center gap-2 rounded-lg border border-line bg-surface p-3">
                <div className="overline">Stagger</div>
                <div className="stagger-in flex gap-1.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="size-3 rounded-full bg-brand" />
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card pad="md">
            <CardTitle as="h4">Feedback verbs</CardTitle>
            <CardDescription>Four toast intents replace alert() and silent failures.</CardDescription>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" intent="secondary" onClick={() => toast.success('Session closed', { description: 'Charges queued for approval' })}>Success</Button>
              <Button size="sm" intent="secondary" onClick={() => toast.error('Sync failed', { description: 'Offline — 3 marks queued locally' })}>Error</Button>
              <Button size="sm" intent="secondary" onClick={() => toast.warning('Rate card expiring', { description: 'Junior rate ends 30 Sep' })}>Warning</Button>
              <Button size="sm" intent="secondary" onClick={() => toast.info('Breach window updated', { description: 'Now 48h before due' })}>Info</Button>
              <Button size="sm" intent="secondary" onClick={() => toast.undoable('Member archived', () => toast.info('Restored'))}>Undo pattern</Button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3">
                <ProgressRing value={18} max={24} ariaLabel="Register progress" />
                <div>
                  <div className="text-xs font-semibold text-ink">Register</div>
                  <div className="text-2xs text-ink-faint">18 of 24 marked</div>
                </div>
              </div>
              <div className="flex flex-col justify-center gap-2.5">
                <Progress value={82} tone="success" label="Attendance" hint="82%" />
                <Progress value={46} tone="warning" label="Capacity" hint="11 / 24" />
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* ------------------------------- components ----------------------------- */}
      <section id="components" className="scroll-mt-24 flex flex-col gap-4">
        <SectionHeader title="Components" description="The primitives every page composes from." />

        <StatGrid>
          <StatCard label="Members" value={482} icon={Users} tone="brand" delta={{ value: 4.2, label: 'vs last month' }} sparkline={SPARK} to="/members" />
          <StatCard label="Outstanding debits" value={129450} format={(n) => money(n)} icon={Wallet} tone="danger" delta={{ value: 11, invert: true }} hint="9 accounts" to="/charges" />
          <StatCard label="Breached actions" value={3} icon={Bell} tone="warning" delta={{ value: -25, invert: true }} to="/inbox" />
          <StatCard label="Taster conversions" value={27} icon={Target} tone="success" delta={{ value: 0 }} hint="of 61 trialled" to="/tasters" />
        </StatGrid>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card pad="md">
            <CardTitle as="h4">Inputs &amp; fields</CardTitle>
            <CardDescription>Wired labels, hints and error states — ids and aria attributes are generated, not hand-written.</CardDescription>
            <div className="mt-4 flex flex-col gap-4">
              <Field label="Member name" hint="As it should appear on registers" required>
                {(ids) => <Input {...ids} placeholder="e.g. Ana Rodrigues" />}
              </Field>
              <Field label="Search" >
                {(ids) => <InputWithIcon {...ids} value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery('')} placeholder="Search members, sessions, events…" />}
              </Field>
              <Field label="Session" error="Choose a session before saving the register">
                {(ids) => (
                  <Select {...(ids as any)}>
                    <option>Junior Development</option>
                    <option>Adult Improvers</option>
                  </Select>
                )}
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  ariaLabel="List filter"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'All', count: SESSIONS.length },
                    { value: 'today', label: 'Today', count: 3 },
                    { value: 'flagged', label: 'Flagged', count: 1 },
                  ]}
                />
                <Tooltip label="Filters respect your role">
                  <Button size="icon" intent="ghost" aria-label="Filters">
                    <Filter />
                  </Button>
                </Tooltip>
              </div>
            </div>
          </Card>

          <Card pad="md">
            <CardTitle as="h4">Overlays &amp; menus</CardTitle>
            <CardDescription>Spring-entrance dialogs, sheets, menus and tooltips — Radix behaviour, brand surface.</CardDescription>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button intent="primary" iconLeft={<Plus />} onClick={() => setDialog(true)}>Open dialog</Button>
              <Button intent="secondary" onClick={() => setConfirm(true)}>Confirm pattern</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button intent="ghost" iconLeft={<Settings />}>Row actions</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Session</DropdownMenuLabel>
                  <DropdownMenuItem><Activity />Open register<DropdownMenuShortcut>G R</DropdownMenuShortcut></DropdownMenuItem>
                  <DropdownMenuItem><ClipboardList />Duplicate</DropdownMenuItem>
                  <DropdownMenuItem><Trophy />Publish results</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-danger data-[highlighted]:bg-danger-soft"><Trash2 />Cancel session</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip label="Skeletons replace spinners">
                <Button intent="ghost" iconLeft={<Info />}>Tooltip</Button>
              </Tooltip>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Avatar name="Ava Kamath" size="sm" />
              <Avatar name="Rueben Silva" />
              <Avatar name="Jonas Wills" size="lg" ring />
              <div className="text-2xs text-ink-faint">Deterministic gradient per name hash</div>
            </div>
            <div className="mt-4">
              <div className="overline mb-2">Sparkline</div>
              <Sparkline data={SPARK} />
            </div>
          </Card>
        </div>

        <Card>
          <CardToolbar>
            <div>
              <CardTitle as="h4">Sessions</CardTitle>
              <CardDescription>Sortable, responsive, skeleton-first, with a real empty state.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <InputWithIcon icon={<Search />} value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery('')} placeholder="Filter…" className="w-40" />
              <Button intent="primary" size="sm" iconLeft={<Plus />}>New session</Button>
            </div>
          </CardToolbar>
          <DataTable
            data={pager.slice}
            columns={columns}
            rowKey={(r) => r.id}
            defaultSort={{ key: 'time', direction: 'asc' }}
            onRowClick={(r) => toast.info(`Open ${r.name}`, { description: 'Wired to /register/:id in the app' })}
            animateRows
            empty={<NoResultsState query={query || undefined} onClear={() => setQuery('')} />}
            mobileCard={(r) => (
              <div className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-ink">{r.name}</div>
                    <div className="text-2xs text-ink-faint">{r.venue} · {timeRange(r.start, r.end)}</div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex items-center justify-between">
                  <CapacityMeter taken={r.places} capacity={r.capacity} />
                  <span className="text-sm font-semibold tabular-nums">{r.fee ? money(r.fee) : 'Free'}</span>
                </div>
              </div>
            )}
            footer={
              <Pagination
                page={pager.page}
                pageCount={pager.pageCount}
                total={pager.total}
                pageSize={pager.pageSize}
                onPage={pager.setPage}
              />
            }
          />
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card pad="none">
            <CardHeader>
              <div>
                <CardTitle as="h4">Loading states</CardTitle>
                <CardDescription>Geometry is reserved before data lands — no reflow, no spinners.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <SkeletonStatGrid count={2} className="sm:grid-cols-2" />
              <div className="mt-4 card overflow-hidden">
                <SkeletonList rows={3} />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-3.5 w-1/3 rounded-xs" />
                  <Skeleton className="mt-2 h-3 w-1/2 rounded-xs" />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <span className="text-2xs text-ink-faint">Shimmer is one composited transform, disabled under reduced motion.</span>
            </CardFooter>
          </Card>

          <Card pad="none">
            <CardHeader>
              <div>
                <CardTitle as="h4">Empty &amp; error states</CardTitle>
                <CardDescription>Six presets that say what happened and what to do next.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="rounded-xl border border-line">
                <NoResultsState query="smith" onClear={() => undefined} />
              </div>
              <div className="rounded-xl border border-line">
                <ErrorState onRetry={() => toast.info('Retrying…')} />
              </div>
              <div className="rounded-xl border border-line">
                <EmptyState
                  icon={Inbox}
                  tone="brand"
                  title="No sessions today"
                  description="Nothing is scheduled for Wednesday. Your next session is Friday at 16:30."
                  action={<Button size="sm" intent="primary" iconLeft={<CalendarDays />}>Browse the diary</Button>}
                  secondaryAction={<Button size="sm" intent="ghost">Add one-off</Button>}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* -------------------------------- patterns ------------------------------ */}
      <section id="patterns" className="scroll-mt-24 flex flex-col gap-4">
        <SectionHeader title="Patterns" description="Cross-cutting behaviours the audit called out as missing." />
        <div className="grid gap-4 lg:grid-cols-3">
          <Card pad="md">
            <CardTitle as="h4">Command palette</CardTitle>
            <CardDescription>⌘K / Ctrl-K from anywhere, or press <span className="font-mono">/</span>.</CardDescription>
            <ul className="mt-3 flex flex-col gap-1.5 text-xs text-ink-muted">
              <li className="flex items-center gap-2"><Command className="size-3.5 text-brand-text" />Jump to any permitted route</li>
              <li className="flex items-center gap-2"><Search className="size-3.5 text-brand-text" />Fuzzy match on labels + keywords</li>
              <li className="flex items-center gap-2"><Sparkles className="size-3.5 text-brand-text" />Recents remembered locally</li>
            </ul>
          </Card>
          <Card pad="md">
            <CardTitle as="h4">List rows</CardTitle>
            <CardDescription>Web: hover reveals actions. Native: swipe reveals them.</CardDescription>
            <div className="mt-3 flex flex-col divide-y divide-line">
              {['Ana Rodrigues · Junior', 'Kwame Osei · Adult', 'Lily Chen · Squad'].map((label) => (
                <div key={label} className="group flex items-center justify-between gap-3 py-2.5">
                  <span className="flex items-center gap-2.5 text-xs">
                    <Avatar name={label} size="xs" />
                    <span className="font-medium text-ink">{label}</span>
                  </span>
                  <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="icon" intent="ghost" aria-label="Mark present"><Check /></Button>
                    <Button size="icon" intent="ghost" aria-label="Archive"><Trash2 /></Button>
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card pad="md">
            <CardTitle as="h4">Inbox zero</CardTitle>
            <CardDescription>Success is designed too — never a blank panel.</CardDescription>
            <div className="mt-3 rounded-xl border border-line">
              <InboxZeroState />
            </div>
          </Card>
        </div>
      </section>

      {/* ------------------------------ native parity --------------------------- */}
      <section id="native" className="scroll-mt-24">
        <SectionHeader
          title="Native parity"
          description="The same tokens drive Expo + NativeWind + Reanimated. Duration, radius and colour values are shared — not re-typed."
        />
        <Card pad="md" className="grid gap-4 lg:grid-cols-2">
          <div>
            <CardTitle as="h4">Shared token import</CardTitle>
            <CardDescription>One module, two renderers.</CardDescription>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface-inset p-3 text-2xs leading-relaxed text-ink-muted">
{`// apps/mobile/lib/theme.ts
import { radii, duration, spring, themes } from '@mentis/core';

export const theme = themes.dark;      // colours
export const r = radii;                // 16 → r.lg
export const d = duration;             // 220 → d.base
export const springPress = spring.swift;`}
            </pre>
          </div>
          <div>
            <CardTitle as="h4">Parity guarantees</CardTitle>
            <ul className="mt-3 flex flex-col gap-2 text-xs text-ink-muted">
              <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" />Colour, radius and duration values are asserted against both platforms by <span className="font-mono">tests/design_tokens.test.ts</span>.</li>
              <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" />Press feedback: 0.97 scale, 90–140ms on both.</li>
              <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" />Status vocabulary is shared, so “breached” is the same red everywhere.</li>
              <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" />Mobile adds what web cannot: haptic ticks, swipe actions, sheet gestures.</li>
            </ul>
            <div className="mt-4 flex items-center gap-2">
              <Badge tone="brand" dot>Reanimated spring(config: swift)</Badge>
              <Badge tone="info" dot>Reduced-motion aware</Badge>
            </div>
          </div>
        </Card>
      </section>

      {/* -------------------------------- dialogs ------------------------------- */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>New session</DialogTitle>
            <DialogDescription>
              Sessions inherit the venue’s rate card unless overridden. Fields marked with an asterisk are required by the
              scheduling rules.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Session name" required>
              {(ids) => <Input {...ids} placeholder="e.g. Junior Development" />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts" hint="24h, club local time">
                {(ids) => <Input {...ids} type="datetime-local" />}
              </Field>
              <Field label="Capacity" hint="Leave blank for unlimited">
                {(ids) => <Input {...ids} type="number" min={1} placeholder="24" />}
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button intent="ghost" onClick={() => setDialog(false)}>Cancel</Button>
            <Button
              intent="primary"
              onClick={() => {
                setDialog(false);
                toast.success('Session created', { description: 'Junior Development · Fri 16:30' });
              }}
            >
              Create session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Cancel this session?"
        description="Twelve members are enrolled and four have been notified. Cancelling keeps the record and releases the venue slot."
        confirmLabel="Cancel session"
        destructive
        onConfirm={() => toast.success('Session cancelled', { action: { label: 'Undo', onClick: () => toast.info('Restored') } })}
      />

      {reduce && (
        <p className="text-2xs text-ink-faint">
          Reduced motion is on — entrance and transition animations are disabled.
        </p>
      )}
      <p className="text-2xs text-ink-faint">
        Last reviewed {dateShort(new Date())} · tokens are the contract; components are the proof.
      </p>
    </div>
  );
}
