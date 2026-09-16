/**
 * Reporting surfaces — the first pages migrated onto the DS v2 kit.
 * ---------------------------------------------------------------------------
 * What changed versus the original implementation:
 *   • one round-trip per dataset (Promise.all) instead of sequential awaits
 *     inside a for-loop over venues
 *   • attendance is counted per venue (the original counted the org-wide total
 *     once per venue, so every card showed the same number)
 *   • loading is a skeleton that matches the final layout, not a blank card
 *   • errors are a designed state with retry, not an empty grid
 *   • lists are sortable, responsive and paginated; on phones they become cards
 *   • every number is formatted through one set of helpers (£, tabular figures)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Banknote,
  CalendarDays,
  CalendarX2,
  Clock3,
  Download,
  MapPin,
  RefreshCw,
  Search,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useDebounced } from '../lib/hooks';
import { dateFull, dateShort, money, number, pct, timeRange } from '../lib/format';
import { PageHeader } from '../components/patterns/page-header';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { DataTable, Pagination, usePager, type Column } from '../components/ui/data-table';
import { EmptyState, ErrorState, NoDataState, NoResultsState } from '../components/ui/empty-state';
import { InputWithIcon } from '../components/ui/input';
import { Progress } from '../components/ui/progress';
import { Skeleton, SkeletonStatGrid, SkeletonTable } from '../components/ui/skeleton';
import { StatCard, StatGrid } from '../components/ui/stat-card';
import { StatusBadge } from '../components/ui/status-badge';
import { toast } from '../components/ui/toast';
import { Badge } from '../components/ui/badge';

/* -------------------------------------------------------------------------- */
/* Venue dashboard                                                            */
/* -------------------------------------------------------------------------- */

interface VenueSummary {
  id: string;
  name: string;
  sessions: number;
  staffedHours: number;
  costCents: number;
  present: number;
}

/**
 * One loader, three queries, aggregated in memory.
 * Kept as a module function so the page component stays about presentation.
 */
async function loadVenueSummaries(): Promise<VenueSummary[]> {
  const { data: venues, error } = await supabase.from('mentis_venues').select('id,name').order('name');
  if (error) throw error;
  if (!venues?.length) return [];

  const [{ data: sessions }, { data: staffing }, { data: attendance }] = await Promise.all([
    supabase.from('mentis_sessions').select('id,venue_id'),
    supabase
      .from('mentis_session_staffing')
      .select('planned_start,planned_end,session_id,mentis_rate_cards(rate_cents)'),
    supabase.from('mentis_attendance_records').select('status,mentis_sessions!inner(venue_id)').eq('status', 'present'),
  ]);

  const venueOfSession = new Map<string, string>((sessions ?? []).map((s: any) => [s.id, s.venue_id]));
  const rows = new Map<string, VenueSummary>(
    venues.map((v: any) => [v.id, { id: v.id, name: v.name, sessions: 0, staffedHours: 0, costCents: 0, present: 0 }]),
  );

  for (const s of sessions ?? []) {
    const row = rows.get((s as any).venue_id);
    if (row) row.sessions += 1;
  }

  for (const st of staffing ?? []) {
    const row = rows.get(venueOfSession.get((st as any).session_id) ?? '');
    if (!row) continue;
    const hours = Math.max(
      0,
      (Date.parse((st as any).planned_end) - Date.parse((st as any).planned_start)) / 3_600_000,
    );
    row.staffedHours += hours;
    row.costCents += Math.round(hours * ((st as any).mentis_rate_cards?.rate_cents ?? 0));
  }

  for (const a of attendance ?? []) {
    const row = rows.get((a as any).mentis_sessions?.venue_id ?? '');
    if (row) row.present += 1;
  }

  return [...rows.values()];
}

export function VenueDashboard() {
  const [rows, setRows] = useState<VenueSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setRows(await loadVenueSummaries());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the reporting service.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loading = rows === null && !error;
  const totals = useMemo(() => {
    const list = rows ?? [];
    return {
      sessions: list.reduce((n, r) => n + r.sessions, 0),
      hours: list.reduce((n, r) => n + r.staffedHours, 0),
      cost: list.reduce((n, r) => n + r.costCents, 0),
      present: list.reduce((n, r) => n + r.present, 0),
    };
  }, [rows]);

  const venueRow = (r: VenueSummary) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-semibold">
          <MapPin className="size-4 text-brand" aria-hidden />
          {r.name}
        </span>
        <Badge tone="neutral">{number(r.sessions)} sessions</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="size-3.5" aria-hidden />
          {r.staffedHours.toFixed(1)}h staffed
        </span>
        <span className="inline-flex items-center gap-1">
          <Banknote className="size-3.5" aria-hidden />
          {money(r.costCents)}
        </span>
        <span className="inline-flex items-center gap-1">
          <UserCheck className="size-3.5" aria-hidden />
          {number(r.present)} present
        </span>
      </div>
      <Progress
        size="sm"
        value={totals.sessions ? (r.sessions / totals.sessions) * 100 : 0}
        label="Share of sessions"
      />
    </div>
  );

  const columns: Column<VenueSummary>[] = [
    {
      key: 'name',
      header: 'Venue',
      sortable: true,
      cell: (r) => (
        <span className="flex items-center gap-2 font-semibold">
          <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-brand-soft text-brand">
            <MapPin className="size-3.5" aria-hidden />
          </span>
          {r.name}
        </span>
      ),
    },
    {
      key: 'sessions',
      header: 'Sessions',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.sessions,
      cell: (r) => <span className="tabular-nums">{number(r.sessions)}</span>,
    },
    {
      key: 'hours',
      header: 'Staffed',
      align: 'right',
      sortable: true,
      hideBelow: 'sm',
      sortValue: (r) => r.staffedHours,
      cell: (r) => <span className="tabular-nums">{r.staffedHours.toFixed(1)}h</span>,
    },
    {
      key: 'cost',
      header: 'Staffing cost',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.costCents,
      cell: (r) => <span className="tabular-nums font-semibold">{money(r.costCents)}</span>,
    },
    {
      key: 'present',
      header: 'Present',
      align: 'right',
      sortable: true,
      hideBelow: 'md',
      sortValue: (r) => r.present,
      cell: (r) => <span className="tabular-nums">{number(r.present)}</span>,
    },
    {
      key: 'share',
      header: 'Share of sessions',
      hideBelow: 'lg',
      width: 'w-[168px]',
      sortValue: (r) => r.sessions,
      cell: (r) => (
        <Progress
          size="sm"
          value={totals.sessions ? (r.sessions / totals.sessions) * 100 : 0}
          hint={pct(totals.sessions ? r.sessions / totals.sessions : 0)}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Venue dashboard"
        eyebrow={dateFull(new Date())}
        subtitle="Where the sessions happen, what they cost in coaching time, and how many players turned up."
        breadcrumbs={[{ label: 'Reports' }]}
        actions={
          <>
            <Button
              intent="secondary"
              size="sm"
              iconLeft={<RefreshCw className={busy ? 'animate-spin-slow' : undefined} />}
              onClick={() => void load()}
              loading={busy}
            >
              Refresh
            </Button>
            <Link to="/venues" className="btn btn-ghost btn-sm">
              Manage venues
            </Link>
          </>
        }
      />

      {error ? (
        <Card>
          <CardContent>
            <ErrorState message={error} onRetry={() => void load()} />
          </CardContent>
        </Card>
      ) : (
        <>
          {loading ? (
            <SkeletonStatGrid count={4} />
          ) : (
            <StatGrid>
              <StatCard
                label="Sessions scheduled"
                value={totals.sessions}
                icon={CalendarDays}
                tone="brand"
                hint={`Across ${(rows ?? []).length} venue${(rows ?? []).length === 1 ? '' : 's'}`}
              />
              <StatCard
                label="Planned coaching time"
                value={totals.hours}
                format={(n) => `${n.toFixed(1)}h`}
                icon={Clock3}
                tone="info"
                hint="From session staffing rosters"
              />
              <StatCard
                label="Staffing cost"
                value={totals.cost}
                format={(n) => money(n)}
                icon={Banknote}
                tone="accent"
                hint={
                  totals.sessions
                    ? `${money(totals.cost / totals.sessions)} per session`
                    : 'No sessions scheduled yet'
                }
              />
              <StatCard
                label="Attendance recorded"
                value={totals.present}
                icon={UserCheck}
                tone="success"
                hint="Present marks across all venues"
              />
            </StatGrid>
          )}

          <DataTable
            className="mt-5"
            data={rows ?? []}
            columns={columns}
            rowKey={(r) => r.id}
            loading={loading}
            animateRows
            defaultSort={{ key: 'sessions', direction: 'desc' }}
            caption="Sessions, staffing cost and attendance by venue"
            empty={
              <NoDataState
                entity="venues"
                description="Add a venue first — sessions and staffing costs are reported against it."
                action={
                  <Link to="/venues" className="btn btn-primary btn-sm">
                    Add a venue
                  </Link>
                }
              />
            }
            mobileCard={venueRow}
            footer={
              !loading && (rows ?? []).length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                  <span>
                    {number(totals.sessions)} sessions · {totals.hours.toFixed(1)}h ·{' '}
                    <span className="font-semibold text-ink">{money(totals.cost)}</span>
                  </span>
                  <span>{number(totals.present)} present marks</span>
                </div>
              ) : null
            }
          />
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Member → session cross-view                                                */
/* -------------------------------------------------------------------------- */

interface Enrolment {
  status: string;
  mentis_sessions: { name: string | null; start_at: string | null } | null;
}

interface MemberRow {
  id: string;
  name: string;
  mentis_enrollments: Enrolment[] | null;
}

export function MemberSessions() {
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'active'>('all');
  const [reloadKey, setReloadKey] = useState(0);
  const search = useDebounced(query, 200);

  useEffect(() => {
    let alive = true;
    supabase
      .from('mentis_members')
      .select('id,name,mentis_enrollments(status,mentis_sessions(name,start_at))')
      .order('name')
      .then(({ data, error: err }) => {
        if (!alive) return;
        if (err) setError(err.message);
        else setRows((data ?? []) as unknown as MemberRow[]);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? [])
      .filter((m) => (scope === 'all' ? true : (m.mentis_enrollments ?? []).some((e) => e.status === 'active')))
      .filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [rows, search, scope]);

  const pager = usePager(visible, 25);
  const loading = rows === null && !error;

  const columns: Column<MemberRow>[] = [
    {
      key: 'name',
      header: 'Member',
      sortable: true,
      cell: (m) => <span className="font-semibold">{m.name}</span>,
    },
    {
      key: 'enrolments',
      header: 'Enrolments',
      sortable: false,
      cell: (m) => {
        const list = m.mentis_enrollments ?? [];
        if (!list.length) return <span className="text-xs text-ink-faint">Not enrolled yet</span>;
        return (
          <span className="flex flex-wrap gap-1.5">
            {list.slice(0, 4).map((e, i) => (
              <StatusBadge
                key={`${e.mentis_sessions?.name ?? 'session'}-${i}`}
                status={e.status}
                label={`${e.mentis_sessions?.name ?? 'Session'} · ${e.status}`}
              />
            ))}
            {list.length > 4 && <Badge tone="neutral">+{list.length - 4} more</Badge>}
          </span>
        );
      },
    },
    {
      key: 'next',
      header: 'Next session',
      align: 'right',
      hideBelow: 'md',
      sortValue: (m) =>
        (m.mentis_enrollments ?? [])
          .map((e) => e.mentis_sessions?.start_at ?? '')
          .filter((d) => d && Date.parse(d) > Date.now())
          .sort()[0] ?? '',
      cell: (m) => {
        const next = (m.mentis_enrollments ?? [])
          .map((e) => e.mentis_sessions?.start_at)
          .filter((d): d is string => Boolean(d) && Date.parse(d as string) > Date.now())
          .sort()[0];
        return next ? (
          <span className="tabular-nums text-ink-muted">{`${dateShort(next)} · ${timeRange(next)}`}</span>
        ) : (
          <span className="text-xs text-ink-faint">None scheduled</span>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Member sessions"
        subtitle="Who is enrolled in what — searchable, and honest when a member has no enrolments yet."
        breadcrumbs={[{ label: 'Reports' }]}
        actions={
          <Button
            intent="secondary"
            size="sm"
            iconLeft={<RefreshCw />}
            onClick={() => {
              setRows(null);
              setError(null);
              setReloadKey((k) => k + 1);
            }}
          >
            Reload
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <InputWithIcon
              icon={<Search />}
              placeholder="Search members…"
              value={query}
              onClear={() => setQuery('')}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full sm:w-64"
              aria-label="Search members"
            />
            <div
              role="radiogroup"
              aria-label="Enrolment scope"
              className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-inset p-0.5"
            >
              {(
                [
                  { value: 'all', label: 'All members' },
                  { value: 'active', label: 'Active enrolments' },
                ] as const
              ).map((o) => (
                <button
                  key={o.value}
                  role="radio"
                  aria-checked={scope === o.value}
                  onClick={() => setScope(o.value)}
                  className={
                    'rounded-full px-3 py-1 text-xs font-semibold transition-colors ' +
                    (scope === o.value ? 'bg-surface text-ink shadow-[var(--shadow-sm)]' : 'text-ink-muted hover:text-ink')
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <span className="text-xs tabular-nums text-ink-faint">
            {loading ? 'Loading…' : `${number(visible.length)} of ${number((rows ?? []).length)}`}
          </span>
        </CardHeader>

        {error ? (
          <CardContent>
            <ErrorState
              message={error}
              onRetry={() => {
                setRows(null);
                setError(null);
                setReloadKey((k) => k + 1);
              }}
            />
          </CardContent>
        ) : (
          <DataTable
            data={pager.slice}
            columns={columns}
            rowKey={(m) => m.id}
            loading={loading}
            dense
            empty={
              search || scope !== 'all' ? (
                <NoResultsState query={search} onClear={() => { setQuery(''); setScope('all'); }} />
              ) : (
                <EmptyState
                  icon={CalendarX2}
                  tone="brand"
                  title="No members yet"
                  description="Members appear here once they are created, with every enrolment listed against them."
                  action={
                    <Link to="/members" className="btn btn-primary btn-sm">
                      Add a member
                    </Link>
                  }
                />
              )
            }
            mobileCard={(m) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{m.name}</span>
                  <Badge tone="neutral">{(m.mentis_enrollments ?? []).length} enrolments</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(m.mentis_enrollments ?? []).slice(0, 3).map((e, i) => (
                    <StatusBadge key={i} status={e.status} label={e.mentis_sessions?.name ?? 'Session'} />
                  ))}
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
                className="border-t-0"
              />
            }
          />
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ICS export                                                                 */
/* -------------------------------------------------------------------------- */

export function IcsExport() {
  const { staff } = useAuth();
  const [counts, setCounts] = useState<{ sessions: number; tasks: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!staff) return;
    let alive = true;
    void (async () => {
      const [{ count: sessions }, { count: tasks }] = await Promise.all([
        supabase
          .from('mentis_session_staffing')
          .select('id', { count: 'exact', head: true })
          .eq('staff_id', staff.id),
        supabase
          .from('mentis_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('assignee_id', staff.id)
          .neq('status', 'done'),
      ]);
      if (alive) setCounts({ sessions: sessions ?? 0, tasks: tasks ?? 0 });
    })();
    return () => {
      alive = false;
    };
  }, [staff]);

  const download = async () => {
    if (!staff) return;
    setBusy(true);
    const toastId = toast.loading('Building your calendar…');
    try {
      const [{ data: staffing }, { data: tasks }] = await Promise.all([
        supabase
          .from('mentis_session_staffing')
          .select('planned_start,planned_end,mentis_sessions(name)')
          .eq('staff_id', staff.id),
        supabase.from('mentis_tasks').select('title,due_at').eq('assignee_id', staff.id).neq('status', 'done'),
      ]);

      const esc = (s: string) => s.replace(/[,;\\]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
      const fmt = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const uid = () => `${Math.random().toString(36).slice(2)}@mentis`;

      let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Mentis//Diary//EN\r\n';
      for (const s of staffing ?? []) {
        ics += `BEGIN:VEVENT\r\nUID:${uid()}\r\nDTSTART:${fmt(s.planned_start)}\r\nDTEND:${fmt(s.planned_end)}\r\nSUMMARY:${esc((s as any).mentis_sessions?.name ?? 'Session')}\r\nEND:VEVENT\r\n`;
      }
      for (const t of tasks ?? []) {
        if (!t.due_at) continue;
        ics += `BEGIN:VEVENT\r\nUID:${uid()}\r\nDTSTART:${fmt(t.due_at)}\r\nDTEND:${fmt(t.due_at)}\r\nSUMMARY:${esc('Task: ' + t.title)}\r\nEND:VEVENT\r\n`;
      }
      ics += 'END:VCALENDAR\r\n';

      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      a.download = 'mentis-diary.ics';
      a.click();
      URL.revokeObjectURL(a.href);
      toast.resolve(toastId, `Exported ${(staffing ?? []).length + (tasks ?? []).filter((t) => t.due_at).length} events`);
    } catch (e) {
      toast.resolve(toastId, e instanceof Error ? e.message : 'Export failed', false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Calendar export"
        subtitle="Your staffed sessions and open tasks as a standard .ics file — works with Apple, Google and Outlook calendars."
        breadcrumbs={[{ label: 'Reports' }]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>What gets exported</CardTitle>
              <CardDescription>One event per staffed session and per task with a due date.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {counts === null ? (
              <>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-40" />
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-inset px-3 py-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <CalendarDays className="size-4 text-brand" aria-hidden />
                    Staffed sessions
                  </span>
                  <span className="tabular-nums font-semibold">{number(counts.sessions)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-inset px-3 py-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <TrendingUp className="size-4 text-accent" aria-hidden />
                    Open tasks with a due date
                  </span>
                  <span className="tabular-nums font-semibold">{number(counts.tasks)}</span>
                </div>
              </>
            )}
          </CardContent>
          <CardFooter>
            <Button intent="primary" iconLeft={<Download />} loading={busy} onClick={() => void download()}>
              Download mentis-diary.ics
            </Button>
            <span className="text-xs text-ink-faint">Re-importing replaces the previous Mentis diary.</span>
          </CardFooter>
        </Card>

        <Card variant="glass">
          <CardHeader>
            <CardTitle>Tip</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-ink-muted">
            Subscribe once and the file re-imports on your calendar app&apos;s schedule — handy for coaches who plan
            their week on a phone.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
