import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Download,
  Filter,
  Grid2X2,
  HeartPulse,
  History,
  Mail,
  MessageCircle,
  NotebookPen,
  Phone,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TriangleAlert,
  UserPlus,
  Users,
  UsersRound,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { supabase, functionsUrl } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { demoCustomerById, demoMemberById, demoMembersForCustomer, demoCustomersSnapshot, demoMembersSnapshot, DEMO_MEMBERS, type DemoAttendance, type DemoCustomer, type DemoGoal, type DemoMatch } from '../lib/people-data';
import { demoEnabled, isDemoSession } from '../lib/demo';
import { PageHeader, SectionHeader } from '../components/patterns/page-header';
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  InputWithIcon,
  NoDataState,
  NoResultsState,
  Progress,
  ProgressRing,
  SegmentedControl,
  Skeleton,
  SkeletonList,
  SkeletonStatGrid,
  SkeletonTable,
  StatCard,
  StatGrid,
} from '../components/ui';
import { csvOf } from '@mentis/core';

/* -------------------------------------------------------------------------- *
 * People model helpers
 * -------------------------------------------------------------------------- */

type PersonStatus = 'active' | 'atRisk' | 'inactive';
type FilterValue = 'all' | 'active' | 'attention' | 'inactive';

type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'outline';

interface MemberRow {
  id: string;
  name: string;
  dateOfBirth: string;
  memberCode: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerNokName?: string | null;
  customerNokPhone?: string | null;
  status: PersonStatus;
  attendancePct: number;
  sessionsAttended: number;
  sessionsTotal: number;
  lastAttended: string | null;
  nextSession: string | null;
  groups: string[];
  handedness: 'L' | 'R' | null;
  playingStyle: string | null;
  equipmentNotes: string | null;
  specialNeedsFlag: boolean;
  alert?: string;
  createdAt?: string | null;
}

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  guardianA: string | null;
  guardianB: string | null;
  nokName: string | null;
  nokPhone: string | null;
  status: 'active' | 'attention' | 'inactive';
  members: MemberRow[];
  lastContact: string | null;
  balanceCents: number;
  consentLabels: string[];
  createdAt: string | null;
}

interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  date: string;
  tone: BadgeTone;
}

interface MemberProfile {
  member: MemberRow;
  attendance: DemoAttendance[];
  goals: DemoGoal[];
  matches: DemoMatch[];
  feedback: { id: string; date: string; body: string; coach: string }[];
  timeline: ActivityItem[];
  rankings: { platform: string; value: number; asOf: string }[];
  medicalNote?: string | null;
}

interface CustomerProfile {
  customer: CustomerRow;
  activities: ActivityItem[];
}

const demoMode = () => demoEnabled || isDemoSession();

function firstRelation(value: any): any | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function relationArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function formatDate(value: string | null | undefined, withYear = false) {
  if (!value) return '—';
  const parsed = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(parsed);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(parsed);
}

function ageFromDob(value: string | null | undefined) {
  if (!value) return null;
  const dob = new Date(`${value}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const month = now.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

function statusLabel(status: PersonStatus | CustomerRow['status']) {
  if (status === 'atRisk' || status === 'attention') return 'Needs attention';
  if (status === 'inactive') return 'Inactive';
  return 'Active';
}

function statusTone(status: PersonStatus | CustomerRow['status']): BadgeTone {
  if (status === 'atRisk' || status === 'attention') return 'warning';
  if (status === 'inactive') return 'neutral';
  return 'success';
}

function resultTone(result: string): BadgeTone {
  if (result === 'W' || result === 'achieved' || result === 'present') return 'success';
  if (result === 'L' || result === 'missed' || result === 'absent') return 'danger';
  return 'warning';
}

function memberFromDemo(member: (typeof DEMO_MEMBERS)[number]): MemberRow {
  const customer = demoCustomerById(member.customerId ?? undefined);
  return {
    id: member.id,
    name: member.name,
    dateOfBirth: member.dateOfBirth,
    memberCode: member.memberCode,
    customerId: member.customerId,
    customerName: member.customerName,
    customerPhone: customer?.phone,
    customerEmail: customer?.email,
    customerNokName: customer?.nokName,
    customerNokPhone: customer?.nokPhone,
    status: member.status,
    attendancePct: member.attendancePct,
    sessionsAttended: member.sessionsAttended,
    sessionsTotal: member.sessionsTotal,
    lastAttended: member.lastAttended,
    nextSession: member.nextSession,
    groups: member.groups,
    handedness: member.handedness,
    playingStyle: member.playingStyle,
    equipmentNotes: member.equipmentNotes,
    specialNeedsFlag: member.specialNeedsFlag,
    alert: member.alert,
    createdAt: member.createdAt,
  };
}

function memberFromRaw(row: any, stats?: { attendance?: any[]; enrollments?: any[] }): MemberRow {
  const customer = firstRelation(row.mentis_customers ?? row.customers);
  const attendance = stats?.attendance ?? [];
  const attended = attendance.filter((item: any) => item.status === 'present' || item.status === 'late');
  const attendancePct = attendance.length ? Math.round((attended.length / attendance.length) * 100) : 0;
  const sortedAttendance = [...attendance].sort((a: any, b: any) => String(b.recorded_at ?? b.date ?? '').localeCompare(String(a.recorded_at ?? a.date ?? '')));
  const enrollments = stats?.enrollments ?? [];
  const nextEnrollment = enrollments
    .map((item: any) => firstRelation(item.mentis_sessions ?? item.sessions))
    .filter((session: any) => session?.start_at && new Date(session.start_at).getTime() >= Date.now())
    .sort((a: any, b: any) => String(a.start_at).localeCompare(String(b.start_at)))[0];
  const alert = row.special_needs_flag ? 'Support note on file' : attendancePct > 0 && attendancePct < 70 ? 'Attendance needs attention' : undefined;
  return {
    id: row.id,
    name: row.name,
    dateOfBirth: row.date_of_birth,
    memberCode: row.member_code ?? row.tte_number ?? 'Not set',
    customerId: row.customer_id ?? customer?.id ?? null,
    customerName: customer?.name ?? null,
    customerPhone: customer?.phone ?? null,
    customerEmail: customer?.email ?? null,
    customerNokName: customer?.nok_name ?? null,
    customerNokPhone: customer?.nok_phone ?? null,
    status: row.erased_at ? 'inactive' : alert || (attendancePct > 0 && attendancePct < 70) ? 'atRisk' : 'active',
    attendancePct,
    sessionsAttended: attended.length,
    sessionsTotal: attendance.length,
    lastAttended: sortedAttendance.find((item: any) => item.status === 'present' || item.status === 'late')?.recorded_at ?? null,
    nextSession: nextEnrollment?.start_at ?? null,
    groups: [],
    handedness: row.handedness ?? null,
    playingStyle: row.playing_style ?? null,
    equipmentNotes: row.equipment_notes ?? null,
    specialNeedsFlag: Boolean(row.special_needs_flag),
    alert,
    createdAt: row.created_at ?? null,
  };
}

function memberRowsForCustomer(rawMembers: any[], attendanceByMember = new Map<string, any[]>()) {
  return rawMembers.map((member) => memberFromRaw(member, { attendance: attendanceByMember.get(member.id) ?? [] }));
}

function customerFromDemo(customer: DemoCustomer): CustomerRow {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    guardianA: customer.guardianA,
    guardianB: customer.guardianB,
    nokName: customer.nokName,
    nokPhone: customer.nokPhone,
    status: customer.status,
    members: demoMembersForCustomer(customer.id).map(memberFromDemo),
    lastContact: customer.lastContact,
    balanceCents: customer.balanceCents,
    consentLabels: customer.consentLabels,
    createdAt: customer.lastContact,
  };
}

function labelsFromConsents(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === 'string' ? item : item?.label ?? item?.name ?? '')).filter(Boolean);
}

function customerFromRaw(raw: any, members: MemberRow[] = memberRowsForCustomer(relationArray(raw.mentis_members ?? raw.members))) {
  const membersRaw = relationArray(raw.mentis_members ?? raw.members);
  const memberRows = members.length ? members : memberRowsForCustomer(membersRaw);
  const balanceCents = Number(raw.balance_cents ?? 0);
  return {
    id: raw.id,
    name: raw.name,
    phone: raw.phone ?? null,
    email: raw.email ?? null,
    guardianA: raw.guardian_a ?? null,
    guardianB: raw.guardian_b ?? null,
    nokName: raw.nok_name ?? null,
    nokPhone: raw.nok_phone ?? null,
    status: balanceCents > 0 ? 'attention' : memberRows.length ? 'active' : 'inactive',
    members: memberRows,
    lastContact: raw.last_contact ?? raw.updated_at ?? raw.created_at ?? null,
    balanceCents,
    consentLabels: labelsFromConsents(raw.consents),
    createdAt: raw.created_at ?? null,
  } satisfies CustomerRow;
}

function exportRows(filename: string, rows: Record<string, string | number>[]) {
  const blob = new Blob([csvOf(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function loadMembersFromSupabase(organizationId?: string) {
  const memberQuery: any = supabase
    .from('mentis_members')
    .select('id,name,date_of_birth,customer_id,member_code,tte_number,handedness,playing_style,equipment_notes,special_needs_flag,erased_at,created_at,mentis_customers(id,name,phone,email)')
    .order('name');
  if (organizationId) memberQuery.eq('organization_id', organizationId);

  const [membersResult, attendanceResult] = await Promise.all([
    memberQuery,
    supabase.from('mentis_attendance_records').select('member_id,status,recorded_at').limit(5000),
  ]);
  if (membersResult.error) throw new Error(membersResult.error.message);
  const attendanceByMember = new Map<string, any[]>();
  for (const record of attendanceResult.data ?? []) {
    const list = attendanceByMember.get(record.member_id) ?? [];
    list.push(record);
    attendanceByMember.set(record.member_id, list);
  }
  return (membersResult.data ?? []).map((member: any) => memberFromRaw(member, { attendance: attendanceByMember.get(member.id) ?? [] }));
}

async function loadCustomersFromSupabase(organizationId?: string) {
  const query: any = supabase
    .from('mentis_customers')
    .select('id,name,phone,email,guardian_a,guardian_b,nok_name,nok_phone,consents,created_at,updated_at,mentis_members(id,name,date_of_birth,customer_id,member_code,tte_number,handedness,playing_style,equipment_notes,special_needs_flag,erased_at,created_at)')
    .order('name');
  if (organizationId) query.eq('organization_id', organizationId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((customer: any) => customerFromRaw(customer));
}

function memberFilterMatch(member: MemberRow, query: string) {
  const haystack = [member.name, member.memberCode, member.customerName, member.customerEmail, member.playingStyle, ...member.groups]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

function customerFilterMatch(customer: CustomerRow, query: string) {
  const haystack = [customer.name, customer.email, customer.phone, ...customer.members.map((member) => member.name)].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

function MemberStatusBadge({ member }: { member: MemberRow }) {
  return <Badge tone={statusTone(member.status)} dot>{statusLabel(member.status)}</Badge>;
}

function CustomerStatusBadge({ customer }: { customer: CustomerRow }) {
  return <Badge tone={statusTone(customer.status)} dot>{statusLabel(customer.status)}</Badge>;
}

function AttentionMarker({ member }: { member: MemberRow }) {
  if (!member.alert && !member.specialNeedsFlag) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-2xs font-semibold text-warning" title={member.alert ?? 'Support note on file'}>
      <TriangleAlert className="size-3" aria-hidden />
      <span className="sr-only">Needs attention</span>
    </span>
  );
}

function MemberRowCard({ member }: { member: MemberRow }) {
  return (
    <Link to={`/members/${member.id}`} className="card card-interactive block p-4">
      <div className="flex items-start gap-3">
        <Avatar name={member.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display font-bold text-ink">{member.name}</span>
            <AttentionMarker member={member} />
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-muted">{member.customerName ?? 'No linked customer'} · {member.memberCode}</div>
        </div>
        <ArrowUpRight className="size-4 shrink-0 text-ink-faint" aria-hidden />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Progress value={member.attendancePct} max={100} size="sm" label="Attendance" hint={`${member.attendancePct}%`} tone={member.attendancePct >= 80 ? 'success' : member.attendancePct >= 70 ? 'brand' : 'warning'} />
        </div>
        <MemberStatusBadge member={member} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-faint">
        <span>{member.groups[0] ?? 'No group assigned'}</span>
        <span>{member.lastAttended ? `Last ${formatDate(member.lastAttended)}` : 'No attendance yet'}</span>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- *
 * Members list
 * -------------------------------------------------------------------------- */

export function Members() {
  const { staff, canDo } = useAuth();
  const demo = demoMode();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [sort, setSort] = useState<'name' | 'attendance' | 'recent'>('name');
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    if (demo) {
      setRows(demoMembersSnapshot().map(memberFromDemo));
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    loadMembersFromSupabase(staff?.organization_id)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'The member roster could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [demo, reloadKey, staff?.organization_id]);

  const counts = useMemo(() => ({
    all: rows.length,
    active: rows.filter((row) => row.status === 'active').length,
    attention: rows.filter((row) => row.status === 'atRisk' || row.specialNeedsFlag).length,
    inactive: rows.filter((row) => row.status === 'inactive').length,
  }), [rows]);

  const filteredRows = useMemo(() => {
    const next = rows.filter((member) => {
      const matchesSearch = !query || memberFilterMatch(member, query);
      const matchesFilter = filter === 'all' || (filter === 'attention' ? member.status === 'atRisk' || member.specialNeedsFlag : member.status === filter);
      return matchesSearch && matchesFilter;
    });
    return next.sort((a, b) => {
      if (sort === 'attendance') return b.attendancePct - a.attendancePct;
      if (sort === 'recent') return String(b.lastAttended ?? '').localeCompare(String(a.lastAttended ?? ''));
      return a.name.localeCompare(b.name);
    });
  }, [filter, query, rows, sort]);

  const averageAttendance = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.attendancePct, 0) / rows.length) : 0;
  const attentionRows = rows.filter((row) => row.status === 'atRisk' || row.specialNeedsFlag).sort((a, b) => a.attendancePct - b.attendancePct);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="People / roster"
        title="Members"
        subtitle={demo ? 'A single view of every player, their household, and the next best action. Demo data is ready to explore.' : 'A single view of every player, their household, and the next best action.'}
        breadcrumbs={[{ label: 'People' }, { label: 'Members' }]}
        actions={
          <>
            <button className="btn btn-ghost" type="button" onClick={() => exportRows('members.csv', filteredRows.map((row) => ({ name: row.name, memberCode: row.memberCode, customer: row.customerName ?? '', attendance: `${row.attendancePct}%`, status: statusLabel(row.status) })))}>
              <Download className="size-4" aria-hidden /> Export
            </button>
            {canDo('customers.manage') && <Link to="/members/new" className="btn btn-primary"><Plus className="size-4" aria-hidden /> Add member</Link>}
          </>
        }
      />

      <div className="card aurora overflow-hidden p-5 sm:p-6">
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="overline text-brand-text">Roster pulse</div>
            <h2 className="mt-2 max-w-xl font-display text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-3xl">Keep every player moving forward.</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">See attendance, household context, goals, and follow-up signals without opening five different screens.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="badge badge-brand badge-dot">{counts.active} active members</span>
            <span className="badge badge-warning badge-dot">{counts.attention} need attention</span>
            <span className="badge badge-outline">{counts.inactive} inactive</span>
          </div>
        </div>
      </div>

      {loading ? <SkeletonStatGrid count={4} /> : (
        <StatGrid>
          <StatCard label="Active members" value={counts.active} icon={UsersRound} tone="brand" hint="currently on the roster" to="/members" />
          <StatCard label="Average attendance" value={averageAttendance} format={(value) => `${Math.round(value)}%`} icon={HeartPulse} tone={averageAttendance >= 80 ? 'success' : 'warning'} hint="present or late" sparkline={rows.slice(0, 8).map((row) => row.attendancePct)} />
          <StatCard label="Follow-up queue" value={counts.attention} icon={TriangleAlert} tone={counts.attention ? 'warning' : 'success'} hint={counts.attention ? 'attendance or support signal' : 'all clear'} to="#follow-up" />
          <StatCard label="Linked households" value={new Set(rows.map((row) => row.customerId).filter(Boolean)).size} icon={UserRoundCheck} tone="info" hint="with a customer record" to="/customers" />
        </StatGrid>
      )}

      <div className="card p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <InputWithIcon value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery('')} icon={<Search />} placeholder="Search name, member code, customer…" aria-label="Search members" className="sm:max-w-md" />
            <div className="flex items-center gap-2 text-xs text-ink-faint">
              <Filter className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Show</span>
              <SegmentedControl
                ariaLabel="Member status filter"
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All', count: counts.all },
                  { value: 'active', label: 'Active', count: counts.active },
                  { value: 'attention', label: 'Attention', count: counts.attention },
                  { value: 'inactive', label: 'Inactive', count: counts.inactive },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <label className="flex items-center gap-2 text-xs text-ink-muted">Sort
              <select className="input w-auto py-1.5" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort members">
                <option value="name">Name</option><option value="attendance">Attendance</option><option value="recent">Most recent</option>
              </select>
            </label>
            <div className="flex rounded-md border border-line bg-surface-inset p-0.5" role="group" aria-label="Member view">
              <button type="button" className={`rounded-sm p-1.5 ${view === 'table' ? 'bg-surface text-brand-text shadow-sm' : 'text-ink-faint'}`} onClick={() => setView('table')} aria-label="Table view" aria-pressed={view === 'table'}><SlidersHorizontal className="size-4 rotate-90" /></button>
              <button type="button" className={`rounded-sm p-1.5 ${view === 'cards' ? 'bg-surface text-brand-text shadow-sm' : 'text-ink-faint'}`} onClick={() => setView('cards')} aria-label="Card view" aria-pressed={view === 'cards'}><Grid2X2 className="size-4" /></button>
            </div>
          </div>
        </div>
        {(query || filter !== 'all') && <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-ink-muted"><span>Showing {filteredRows.length} of {rows.length}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters <X className="size-3" /></button></div>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="card min-w-0 overflow-hidden" aria-label="Member roster">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
            <div><h2 className="font-display text-base font-bold text-ink">Roster</h2><p className="mt-0.5 text-xs text-ink-faint">{filteredRows.length} people in this view</p></div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReloadKey((key) => key + 1)}><RefreshCw className="size-3.5" /> Refresh</button>
          </div>
          {loading ? <SkeletonTable rows={6} columns={5} /> : error ? <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} /> : filteredRows.length === 0 ? rows.length === 0 && !query && filter === 'all' ? <NoDataState entity="members" description="Start with a member record, then link them to the household that manages their account." action={canDo('customers.manage') && <Link to="/members/new" className="btn btn-primary"><Plus className="size-4" /> Add member</Link>} /> : <NoResultsState query={query} onClear={() => { setQuery(''); setFilter('all'); }} /> : view === 'cards' ? (
            <div className="grid gap-3 p-4 sm:grid-cols-2">{filteredRows.map((member) => <MemberRowCard key={member.id} member={member} />)}</div>
          ) : (
            <div className="grid-table-wrap">
              <table className="grid">
                <thead><tr><th>Member</th><th>Household</th><th>Attendance</th><th>Last seen</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead>
                <tbody>{filteredRows.map((member) => (
                  <tr key={member.id} data-clickable>
                    <td><div className="flex min-w-[190px] items-center gap-3"><Avatar name={member.name} size="sm" /><div className="min-w-0"><div className="flex items-center gap-2"><Link to={`/members/${member.id}`} className="truncate font-semibold text-ink hover:text-brand-text">{member.name}</Link><AttentionMarker member={member} /></div><div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-faint"><span>{member.memberCode}</span>{member.playingStyle && <><span>·</span><span>{member.playingStyle}</span></>}</div></div></div></td>
                    <td><div className="min-w-[130px]">{member.customerId ? <Link to={`/customers/${member.customerId}`} className="font-medium text-ink-muted hover:text-brand-text">{member.customerName}</Link> : <span className="text-ink-faint">Unlinked</span>}<div className="mt-0.5 text-xs text-ink-faint">{member.groups[0] ?? 'No group assigned'}</div></div></td>
                    <td><div className="w-28"><Progress value={member.attendancePct} max={100} size="sm" tone={member.attendancePct >= 80 ? 'success' : member.attendancePct >= 70 ? 'brand' : 'warning'} label="" hint={`${member.attendancePct}%`} /></div></td>
                    <td className="whitespace-nowrap">{member.lastAttended ? formatDate(member.lastAttended) : 'No record'}</td>
                    <td><MemberStatusBadge member={member} /></td>
                    <td><Link to={`/members/${member.id}`} className="btn btn-ghost btn-sm" aria-label={`Open ${member.name}`}>Open <ArrowRight className="size-3.5" /></Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <aside id="follow-up" className="space-y-4">
          <div className="card overflow-hidden">
            <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-4"><div><h2 className="font-display text-base font-bold text-ink">Follow-up queue</h2><p className="mt-0.5 text-xs text-ink-muted">Small signals worth acting on today.</p></div><span className="grid size-8 place-items-center rounded-xl bg-warning-soft text-warning"><TriangleAlert className="size-4" /></span></div>
            <div className="divide-y divide-line">{attentionRows.length ? attentionRows.slice(0, 4).map((member) => <Link key={member.id} to={`/members/${member.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"><Avatar name={member.name} size="sm" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-ink">{member.name}</div><div className="truncate text-xs text-ink-muted">{member.alert ?? 'Support note on file'}</div></div><ArrowUpRight className="size-3.5 text-ink-faint" /></Link>) : <div className="p-5"><EmptyState icon={CheckCircle2} tone="success" title="All clear" description="No member follow-ups are waiting." className="py-5" /></div>}</div>
            {attentionRows.length > 4 && <Link to="/members" className="flex items-center justify-between border-t border-line px-4 py-3 text-xs font-semibold text-brand-text hover:bg-surface-hover">View all follow-ups <ArrowRight className="size-3.5" /></Link>}
          </div>
          <div className="card p-4"><SectionHeader title="Quick actions" description="Keep the admin work close to the roster." /><div className="flex flex-col gap-2"><Link to="/enrolments" className="btn btn-ghost justify-start"><CalendarDays className="size-4 text-brand-text" /> Manage enrolments <ArrowRight className="ml-auto size-3.5" /></Link><Link to="/customers" className="btn btn-ghost justify-start"><Users className="size-4 text-brand-text" /> Open customer 360 <ArrowRight className="ml-auto size-3.5" /></Link><Link to="/actions/new" className="btn btn-ghost justify-start"><MessageCircle className="size-4 text-brand-text" /> Create follow-up <ArrowRight className="ml-auto size-3.5" /></Link></div></div>
        </aside>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 * Customer list
 * -------------------------------------------------------------------------- */

export function Customers() {
  const { staff, canDo } = useAuth();
  const demo = demoMode();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    if (demo) {
      setRows(demoCustomersSnapshot().map(customerFromDemo));
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    loadCustomersFromSupabase(staff?.organization_id)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'The customer directory could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [demo, reloadKey, staff?.organization_id]);

  const counts = useMemo(() => ({
    all: rows.length,
    active: rows.filter((row) => row.status === 'active').length,
    attention: rows.filter((row) => row.status === 'attention').length,
    inactive: rows.filter((row) => row.status === 'inactive').length,
  }), [rows]);

  const filteredRows = useMemo(() => rows.filter((customer) => {
    const matchesSearch = !query || customerFilterMatch(customer, query);
    const matchesFilter = filter === 'all' || (filter === 'attention' ? customer.status === 'attention' : customer.status === filter);
    return matchesSearch && matchesFilter;
  }).sort((a, b) => a.name.localeCompare(b.name)), [filter, query, rows]);

  const linkedMembers = rows.reduce((sum, row) => sum + row.members.length, 0);
  const householdsWithChildren = rows.filter((row) => row.members.some((member) => (ageFromDob(member.dateOfBirth) ?? 18) < 18)).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="People / households"
        title="Customers"
        subtitle={demo ? 'The account holder, payer, guardian, and communication context around every member.' : 'The account holder, payer, guardian, and communication context around every member.'}
        breadcrumbs={[{ label: 'People' }, { label: 'Customers' }]}
        actions={
          <>
            <button className="btn btn-ghost" type="button" onClick={() => exportRows('customers.csv', filteredRows.map((row) => ({ name: row.name, email: row.email ?? '', phone: row.phone ?? '', members: row.members.map((member) => member.name).join('; '), status: statusLabel(row.status) })))}><Download className="size-4" /> Export</button>
            {canDo('customers.manage') && <Link to="/customers/new" className="btn btn-primary"><Plus className="size-4" /> Add customer</Link>}
          </>
        }
      />

      <div className="card aurora overflow-hidden p-5 sm:p-6">
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div className="max-w-2xl"><div className="overline text-brand-text">Customer 360</div><h2 className="mt-2 max-w-xl font-display text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-3xl">Turn a contact record into a relationship.</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">Household members, attendance, consent, billing signals, and recent conversations — together in one calm view.</p></div><div className="flex flex-wrap gap-2"><span className="badge badge-brand badge-dot">{linkedMembers} linked members</span><span className="badge badge-info">{householdsWithChildren} junior households</span></div></div>
      </div>

      {loading ? <SkeletonStatGrid count={4} /> : <StatGrid><StatCard label="Households" value={counts.active + counts.attention} icon={UsersRound} tone="brand" hint="active customer records" to="/customers" /><StatCard label="Linked members" value={linkedMembers} icon={UserRoundCheck} tone="info" hint="across these households" to="/members" /><StatCard label="Needs a reply" value={counts.attention} icon={MessageCircle} tone={counts.attention ? 'warning' : 'success'} hint="payment or contact signal" /><StatCard label="Junior households" value={householdsWithChildren} icon={ShieldCheck} tone="accent" hint="guardian context ready" /></StatGrid>}

      <div className="card p-3 sm:p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center"><InputWithIcon value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery('')} icon={<Search />} placeholder="Search household, email, member…" aria-label="Search customers" className="sm:max-w-md" /><SegmentedControl ariaLabel="Customer status filter" size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All', count: counts.all }, { value: 'active', label: 'Active', count: counts.active }, { value: 'attention', label: 'Attention', count: counts.attention }, { value: 'inactive', label: 'Inactive', count: counts.inactive }]} /></div><div className="text-xs text-ink-faint">{filteredRows.length} customer records</div></div>{(query || filter !== 'all') && <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-ink-muted"><span>Showing {filteredRows.length} of {rows.length}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters <X className="size-3" /></button></div>}</div>

      <section className="card min-w-0 overflow-hidden" aria-label="Customer directory"><div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5"><div><h2 className="font-display text-base font-bold text-ink">Household directory</h2><p className="mt-0.5 text-xs text-ink-faint">Open a customer 360 to see the full relationship.</p></div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setReloadKey((key) => key + 1)}><RefreshCw className="size-3.5" /> Refresh</button></div>{loading ? <SkeletonTable rows={6} columns={5} /> : error ? <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} /> : filteredRows.length === 0 ? rows.length === 0 && !query && filter === 'all' ? <NoDataState entity="customers" description="Create the account holder first, then link one or more members to their household." action={canDo('customers.manage') && <Link to="/customers/new" className="btn btn-primary"><Plus className="size-4" /> Add customer</Link>} /> : <NoResultsState query={query} onClear={() => { setQuery(''); setFilter('all'); }} /> : <div className="grid-table-wrap"><table className="grid"><thead><tr><th>Customer</th><th>Contact</th><th>Members</th><th>Last touch</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{filteredRows.map((customer) => <tr key={customer.id} data-clickable><td><div className="flex min-w-[200px] items-center gap-3"><Avatar name={customer.name} size="sm" /><div className="min-w-0"><Link to={`/customers/${customer.id}`} className="truncate font-semibold text-ink hover:text-brand-text">{customer.name}</Link><div className="mt-0.5 text-xs text-ink-faint">{customer.members.length ? `${customer.members.length} linked ${customer.members.length === 1 ? 'member' : 'members'}` : 'No members linked'}</div></div></div></td><td><div className="min-w-[170px]">{customer.email ? <a href={`mailto:${customer.email}`} className="block truncate text-ink-muted hover:text-brand-text">{customer.email}</a> : <span className="text-ink-faint">No email</span>}{customer.phone && <a href={`tel:${customer.phone}`} className="mt-0.5 block text-xs text-ink-faint hover:text-brand-text">{customer.phone}</a>}</div></td><td><div className="flex min-w-[170px] -space-x-2">{customer.members.slice(0, 4).map((member) => <Link key={member.id} to={`/members/${member.id}`} title={member.name} className="rounded-full ring-2 ring-[var(--surface)]"><Avatar name={member.name} size="sm" /></Link>)}{customer.members.length > 4 && <span className="grid size-8 place-items-center rounded-full bg-surface-inset text-xs font-semibold text-ink-muted ring-2 ring-[var(--surface)]">+{customer.members.length - 4}</span>}<span className="ml-3 self-center text-xs text-ink-muted">{customer.members.length ? customer.members.map((member) => member.name).join(', ') : '—'}</span></div></td><td className="whitespace-nowrap">{customer.lastContact ? formatDate(customer.lastContact) : 'No activity'}</td><td><CustomerStatusBadge customer={customer} />{customer.balanceCents > 0 && <div className="mt-1 text-xs font-medium text-warning">£{(customer.balanceCents / 100).toFixed(2)} due</div>}</td><td><Link to={`/customers/${customer.id}`} className="btn btn-ghost btn-sm" aria-label={`Open ${customer.name}`}>360 <ArrowRight className="size-3.5" /></Link></td></tr>)}</tbody></table></div>}</section>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 * Customer 360
 * -------------------------------------------------------------------------- */

function activityIcon(tone: BadgeTone) {
  if (tone === 'success') return CheckCircle2;
  if (tone === 'warning' || tone === 'danger') return TriangleAlert;
  if (tone === 'info') return Mail;
  if (tone === 'accent') return BadgeCheck;
  return Activity;
}

function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  if (!items.length) return <EmptyState icon={History} title="No activity yet" description="Attendance, payments, messages, and coach updates will appear here." className="py-8" />;
  return <div className="divide-y divide-line">{items.map((item) => { const Icon = activityIcon(item.tone); return <div key={item.id} className="flex gap-3 px-4 py-3.5"><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ${item.tone === 'success' ? 'bg-success-soft text-success' : item.tone === 'warning' || item.tone === 'danger' ? 'bg-warning-soft text-warning' : item.tone === 'info' ? 'bg-info-soft text-info' : 'bg-brand-soft text-brand-text'}`}><Icon className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-semibold text-ink">{item.title}</p><time className="text-xs text-ink-faint">{formatDate(item.date, true)}</time></div><p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{item.detail}</p></div></div>; })}</div>;
}

function CustomerMemberCard({ member }: { member: MemberRow }) {
  return <Link to={`/members/${member.id}`} className="card card-interactive block p-4"><div className="flex items-start gap-3"><Avatar name={member.name} size="md" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-display text-base font-bold text-ink">{member.name}</h3><AttentionMarker member={member} /></div><p className="mt-0.5 text-xs text-ink-muted">{ageFromDob(member.dateOfBirth) ?? '—'} years · {member.groups[0] ?? 'No group assigned'}</p></div><ArrowUpRight className="size-4 text-ink-faint" /></div><div className="mt-4 grid grid-cols-2 gap-3"><div><div className="overline">Attendance</div><div className="mt-1 font-display text-lg font-bold text-ink">{member.attendancePct}%</div></div><div><div className="overline">Next session</div><div className="mt-1 text-sm font-semibold text-ink">{member.nextSession ? formatDateTime(member.nextSession) : 'Not booked'}</div></div></div><div className="mt-3"><Progress value={member.attendancePct} max={100} size="sm" tone={member.attendancePct >= 80 ? 'success' : member.attendancePct >= 70 ? 'brand' : 'warning'} /></div></Link>;
}

export function Customer360() {
  const { id } = useParams();
  const { staff, canDo } = useAuth();
  const demo = demoMode();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [tab, setTab] = useState<'overview' | 'members' | 'activity'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    if (demo) {
      const customer = demoCustomerById(id);
      if (!customer) {
        setError('That demo customer could not be found.');
        setLoading(false);
        return () => { cancelled = true; };
      }
      setProfile({ customer: customerFromDemo(customer), activities: customer.activity });
      setLoading(false);
      return () => { cancelled = true; };
    }

    const load = async () => {
      const query: any = supabase.from('mentis_customers').select('*,mentis_members(id,name,date_of_birth,customer_id,member_code,tte_number,handedness,playing_style,equipment_notes,special_needs_flag,erased_at,created_at)').eq('id', id).limit(1).single();
      if (staff?.organization_id) query.eq('organization_id', staff.organization_id);
      const { data, error: customerError } = await query;
      if (customerError) throw new Error(customerError.message);
      const memberRowsRaw = relationArray(data?.mentis_members ?? data?.members);
      const memberIds = memberRowsRaw.map((member: any) => member.id).filter(Boolean);
      const attendanceResult = memberIds.length ? await supabase.from('mentis_attendance_records').select('id,member_id,status,recorded_at,session_id').in('member_id', memberIds).order('recorded_at', { ascending: false }).limit(1000) : { data: [], error: null };
      const chargesResult = await supabase.from('mentis_customer_charges').select('id,amount_cents,status,due_date,created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(50);
      const attendanceByMember = new Map<string, any[]>();
      for (const record of attendanceResult.data ?? []) {
        const list = attendanceByMember.get(record.member_id) ?? [];
        list.push(record);
        attendanceByMember.set(record.member_id, list);
      }
      const members = memberRowsForCustomer(memberRowsRaw, attendanceByMember);
      const charges = chargesResult.data ?? [];
      const customer = customerFromRaw({ ...data, balance_cents: charges.filter((charge: any) => charge.status === 'outstandingDebit' || charge.status === 'pendingApproval').reduce((sum: number, charge: any) => sum + Number(charge.amount_cents ?? 0), 0) }, members);
      const activities: ActivityItem[] = [
        ...charges.map((charge: any) => ({ id: `charge-${charge.id}`, title: charge.status === 'recovered' ? 'Payment received' : 'Charge recorded', detail: `£${(Number(charge.amount_cents ?? 0) / 100).toFixed(2)} · ${charge.status}`, date: charge.created_at, tone: charge.status === 'recovered' ? 'success' : 'warning' as BadgeTone })),
        ...(attendanceResult.data ?? []).slice(0, 8).map((record: any) => ({ id: `attendance-${record.id}`, title: 'Attendance updated', detail: `${record.status} · ${members.find((member) => member.id === record.member_id)?.name ?? 'Member'}`, date: record.recorded_at, tone: resultTone(record.status) })),
      ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return { customer, activities };
    };
    load().then((data) => { if (!cancelled) setProfile(data); }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'The customer record could not be loaded.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [demo, id, reloadKey, staff?.organization_id]);

  if (loading) return <div className="space-y-5"><PageHeader title="Customer 360" subtitle="Loading household context…" breadcrumbs={[{ label: 'People' }, { label: 'Customers', to: '/customers' }]} /><Skeleton className="h-44 rounded-xl" /><SkeletonStatGrid count={4} /><SkeletonList rows={5} /></div>;
  if (error || !profile) return <div className="space-y-5"><PageHeader title="Customer 360" subtitle="We could not open this customer record." breadcrumbs={[{ label: 'People' }, { label: 'Customers', to: '/customers' }]} /><div className="card"><ErrorState message={error || 'Customer not found.'} onRetry={() => setReloadKey((key) => key + 1)} /></div></div>;

  const { customer, activities } = profile;
  const averageAttendance = customer.members.length ? Math.round(customer.members.reduce((sum, member) => sum + member.attendancePct, 0) / customer.members.length) : 0;
  const attendedSessions = customer.members.reduce((sum, member) => sum + member.sessionsAttended, 0);

  return <div className="space-y-5"><PageHeader eyebrow="People / customer 360" title={customer.name} subtitle={`${customer.members.length} linked ${customer.members.length === 1 ? 'member' : 'members'} · last touched ${customer.lastContact ? formatDate(customer.lastContact, true) : 'not yet'}`} breadcrumbs={[{ label: 'People' }, { label: 'Customers', to: '/customers' }, { label: customer.name }]} actions={<><Link to="/customers" className="btn btn-ghost"><ArrowLeft className="size-4" /> Directory</Link>{customer.email && <a href={`mailto:${customer.email}`} className="btn btn-primary"><Mail className="size-4" /> Email</a>}{customer.phone && <a href={`tel:${customer.phone}`} className="btn btn-ghost"><Phone className="size-4" /> Call</a>}{canDo('customers.manage') && <Link to="/members/new" className="btn btn-ghost"><UserPlus className="size-4" /> Add member</Link>}</>} />

    <div className="card aurora overflow-hidden p-5 sm:p-6"><div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-4 sm:gap-5"><Avatar name={customer.name} size="lg" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">{customer.name}</h2><CustomerStatusBadge customer={customer} /></div><p className="mt-1 text-sm text-ink-muted">Primary household contact · customer record created {formatDate(customer.createdAt, true)}</p><div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-muted">{customer.email && <a href={`mailto:${customer.email}`} className="badge badge-outline hover:border-[var(--brand)] hover:text-brand-text"><Mail className="size-3" /> {customer.email}</a>}{customer.phone && <a href={`tel:${customer.phone}`} className="badge badge-outline hover:border-[var(--brand)] hover:text-brand-text"><Phone className="size-3" /> {customer.phone}</a>}</div></div></div><div className="flex flex-wrap gap-2 lg:justify-end"><span className="badge badge-brand"><Users className="size-3" /> {customer.members.length} linked {customer.members.length === 1 ? 'member' : 'members'}</span>{customer.balanceCents > 0 && <span className="badge badge-warning"><CircleDollarSign className="size-3" /> £{(customer.balanceCents / 100).toFixed(2)} due</span>}{customer.consentLabels.map((label) => <span key={label} className="badge badge-outline"><Check className="size-3 text-success" /> {label}</span>)}</div></div></div>

    <StatGrid><StatCard label="Linked members" value={customer.members.length} icon={UsersRound} tone="brand" hint="players in this household" /><StatCard label="Average attendance" value={averageAttendance} format={(value) => `${Math.round(value)}%`} icon={HeartPulse} tone={averageAttendance >= 80 ? 'success' : 'warning'} hint="present or late" /><StatCard label="Sessions attended" value={attendedSessions} icon={CalendarDays} tone="info" hint="across linked members" /><StatCard label="Account balance" value={customer.balanceCents / 100} format={(value) => `£${value.toFixed(2)}`} icon={ReceiptText} tone={customer.balanceCents ? 'warning' : 'success'} hint={customer.balanceCents ? 'needs review' : 'account is clear'} /></StatGrid>

    <SegmentedControl ariaLabel="Customer 360 sections" value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'members', label: 'Members', count: customer.members.length }, { value: 'activity', label: 'Activity', count: activities.length }]} />

    {tab === 'overview' && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"><section className="space-y-5"><div><SectionHeader title="People in this household" description="Attendance and next session at a glance." />{customer.members.length ? <div className="grid gap-4 sm:grid-cols-2">{customer.members.map((member) => <CustomerMemberCard key={member.id} member={member} />)}</div> : <div className="card"><NoDataState entity="linked members" action={canDo('customers.manage') && <Link to="/members/new" className="btn btn-primary"><UserPlus className="size-4" /> Add first member</Link>} /></div>}</div><div className="card overflow-hidden"><div className="border-b border-line px-4 py-4"><SectionHeader title="Recent activity" description="The latest changes across this household." /></div><ActivityTimeline items={activities.slice(0, 5)} />{activities.length > 5 && <button type="button" className="flex w-full items-center justify-center gap-2 border-t border-line px-4 py-3 text-xs font-semibold text-brand-text hover:bg-surface-hover" onClick={() => setTab('activity')}>View full activity <ArrowRight className="size-3.5" /></button>}</div></section><aside className="space-y-5"><div className="card p-4"><SectionHeader title="Relationship record" description="Who to contact and what is agreed." /><dl className="space-y-3 text-sm"><div><dt className="overline">Guardians</dt><dd className="mt-1 text-ink">{[customer.guardianA, customer.guardianB].filter(Boolean).join(' · ') || 'Not recorded'}</dd></div><div><dt className="overline">Next of kin</dt><dd className="mt-1 text-ink">{customer.nokName || 'Not recorded'}{customer.nokPhone && <a href={`tel:${customer.nokPhone}`} className="mt-0.5 block text-xs text-brand-text">{customer.nokPhone}</a>}</dd></div><div><dt className="overline">Contact preferences</dt><dd className="mt-1 text-ink">{customer.consentLabels.length ? customer.consentLabels.join(' · ') : 'No consent preferences recorded'}</dd></div></dl><div className="mt-4 border-t border-line pt-4"><Link to="/members/new" className="btn btn-ghost w-full justify-center"><UserPlus className="size-3.5" /> Add another member</Link></div></div><div className="card p-4"><SectionHeader title="Useful next steps" /><div className="flex flex-col gap-2"><button type="button" className="btn btn-ghost justify-start" onClick={() => customer.email && (window.location.href = `mailto:${customer.email}`)}><Send className="size-4 text-brand-text" /> Send a message <ArrowRight className="ml-auto size-3.5" /></button><Link to="/enrolments" className="btn btn-ghost justify-start"><CalendarDays className="size-4 text-brand-text" /> Review enrolments <ArrowRight className="ml-auto size-3.5" /></Link><Link to="/charges" className="btn btn-ghost justify-start"><ReceiptText className="size-4 text-brand-text" /> Open charges <ArrowRight className="ml-auto size-3.5" /></Link></div></div></aside></div>}
    {tab === 'members' && <section className="card overflow-hidden"><div className="border-b border-line px-4 py-4"><SectionHeader title="Linked members" description="Open a member 360 for attendance, goals, and development history." /></div>{customer.members.length ? <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">{customer.members.map((member) => <CustomerMemberCard key={member.id} member={member} />)}</div> : <NoDataState entity="linked members" />}</section>}
    {tab === 'activity' && <section className="card overflow-hidden"><div className="border-b border-line px-4 py-4"><SectionHeader title="Household activity" description="A joined timeline of payments, contact, attendance, and notes." /></div><ActivityTimeline items={activities} /></section>}
  </div>;
}

/* -------------------------------------------------------------------------- *
 * Member 360
 * -------------------------------------------------------------------------- */

function attendanceFromDemo(member: (typeof DEMO_MEMBERS)[number]): DemoAttendance[] {
  return member.attendance;
}

function normalizeAttendance(rows: any[], member: MemberRow): DemoAttendance[] {
  return rows.map((row: any) => ({ id: row.id, date: row.recorded_at ?? row.date, session: firstRelation(row.mentis_sessions ?? row.sessions)?.name ?? 'Session', venue: firstRelation(firstRelation(row.mentis_sessions ?? row.sessions)?.mentis_venues)?.name ?? 'Venue not set', coach: row.coach ?? 'Coach', status: row.status }));
}

function memberActivityFromProfile(member: MemberRow, attendance: DemoAttendance[], goals: DemoGoal[], feedback: { id: string; date: string; body: string; coach: string }[]): ActivityItem[] {
  return [
    ...attendance.slice(0, 5).map((item) => ({ id: `attendance-${item.id}`, title: item.status === 'absent' ? 'Absent from session' : 'Attendance recorded', detail: `${member.name} · ${item.session}`, date: item.date, tone: resultTone(item.status) })),
    ...goals.filter((goal) => goal.status === 'achieved').map((goal) => ({ id: `goal-${goal.id}`, title: 'Goal achieved', detail: goal.description, date: goal.targetDate, tone: 'success' as BadgeTone })),
    ...feedback.slice(0, 3).map((item) => ({ id: `feedback-${item.id}`, title: 'Coach feedback added', detail: `Coach ${item.coach}`, date: item.date, tone: 'brand' as BadgeTone })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function GoalList({ goals }: { goals: DemoGoal[] }) {
  if (!goals.length) return <EmptyState icon={Target} title="No goals yet" description="Add a goal after the next review to make progress visible." className="py-8" />;
  return <div className="divide-y divide-line">{goals.map((goal) => <div key={goal.id} className="flex items-start gap-3 px-4 py-3.5"><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ${goal.status === 'achieved' ? 'bg-success-soft text-success' : goal.status === 'missed' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand-text'}`}><Target className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-semibold text-ink">{goal.description}</p><Badge tone={resultTone(goal.status)}>{goal.status === 'inProgress' ? 'In progress' : goal.status === 'achieved' ? 'Achieved' : 'Missed'}</Badge></div><p className="mt-1 text-xs text-ink-faint">Target {formatDate(goal.targetDate, true)} · {goal.type}</p></div></div>)}</div>;
}

function AttendanceList({ attendance }: { attendance: DemoAttendance[] }) {
  if (!attendance.length) return <EmptyState icon={CalendarDays} title="No attendance yet" description="Attendance records will appear after the first register is completed." className="py-8" />;
  return <div className="divide-y divide-line">{attendance.map((item) => <div key={item.id} className="flex items-center gap-3 px-4 py-3"><span className={`grid size-8 shrink-0 place-items-center rounded-xl ${item.status === 'present' ? 'bg-success-soft text-success' : item.status === 'late' ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger'}`}>{item.status === 'present' ? <Check className="size-4" /> : item.status === 'late' ? <Clock3 className="size-4" /> : <X className="size-4" />}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-ink">{item.session}</div><div className="mt-0.5 truncate text-xs text-ink-muted">{item.venue}{item.coach ? ` · Coach ${item.coach}` : ''}</div></div><div className="text-right"><Badge tone={resultTone(item.status)}>{item.status}</Badge><div className="mt-1 text-xs text-ink-faint">{formatDate(item.date, true)}</div></div></div>)}</div>;
}

export function Member360() {
  const { id } = useParams();
  const { staff, canDo } = useAuth();
  const demo = demoMode();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [tab, setTab] = useState<'overview' | 'attendance' | 'development' | 'profile'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    if (demo) {
      const demoMember = demoMemberById(id);
      if (!demoMember) {
        setError('That demo member could not be found.');
        setLoading(false);
        return () => { cancelled = true; };
      }
      const member = memberFromDemo(demoMember);
      const attendance = attendanceFromDemo(demoMember);
      const feedback = demoMember.feedback;
      setProfile({ member, attendance, goals: demoMember.goals, matches: demoMember.matches, feedback, timeline: demoMember.timeline, rankings: demoMember.matches.length ? [{ platform: 'Club ladder', value: 18, asOf: '2026-09-12' }] : [] });
      setLoading(false);
      return () => { cancelled = true; };
    }

    const load = async () => {
      const memberQuery: any = supabase.from('mentis_members').select('*,mentis_customers(*)').eq('id', id).limit(1).single();
      if (staff?.organization_id) memberQuery.eq('organization_id', staff.organization_id);
      const { data: rawMember, error: memberError } = await memberQuery;
      if (memberError) throw new Error(memberError.message);
      const [attendanceResult, rankingResult, matchResult, feedbackResult, goalsResult, enrollmentResult] = await Promise.all([
        supabase.from('mentis_attendance_records').select('id,status,recorded_at,session_id,mentis_sessions(name,start_at,mentis_venues(name))').eq('member_id', id).order('recorded_at', { ascending: false }).limit(100),
        supabase.from('mentis_rankings').select('platform,rank_value,as_of').eq('member_id', id).order('as_of', { ascending: false }).limit(20),
        supabase.from('mentis_matches').select('id,played_on,opponent,result,source').eq('member_id', id).order('played_on', { ascending: false }).limit(20),
        supabase.from('mentis_player_feedback').select('id,body,created_at,coach_id').eq('member_id', id).order('created_at', { ascending: false }).limit(20),
        supabase.from('mentis_member_goals').select('id,description,status,target_date,goal_type').eq('member_id', id).order('target_date'),
        supabase.from('mentis_enrollments').select('status,expected,session_id,mentis_sessions(id,name,start_at,mentis_venues(name))').eq('member_id', id).limit(50),
      ]);
      const attendance = normalizeAttendance(attendanceResult.data ?? [], memberFromRaw(rawMember));
      const member = memberFromRaw(rawMember, { attendance: attendanceResult.data ?? [], enrollments: enrollmentResult.data ?? [] });
      const goals: DemoGoal[] = (goalsResult.data ?? []).map((goal: any) => ({ id: goal.id, description: goal.description, status: goal.status, targetDate: goal.target_date, type: goal.goal_type ?? 'free' }));
      const matches: DemoMatch[] = (matchResult.data ?? []).map((match: any) => ({ id: match.id, date: match.played_on, opponent: match.opponent, result: match.result, event: match.source ?? 'Match' }));
      const feedback = (feedbackResult.data ?? []).map((item: any) => ({ id: item.id, date: item.created_at, body: item.body, coach: item.coach_id ? `Coach ${String(item.coach_id).slice(0, 6)}` : 'Coach' }));
      const rankings = (rankingResult.data ?? []).map((ranking: any) => ({ platform: ranking.platform, value: ranking.rank_value, asOf: ranking.as_of }));
      const timeline = memberActivityFromProfile(member, attendance, goals, feedback);
      return { member, attendance, goals, matches, feedback, timeline, rankings };
    };
    load().then((data) => { if (!cancelled) setProfile(data); }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'The member record could not be loaded.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [demo, id, reloadKey, staff?.organization_id]);

  if (loading) return <div className="space-y-5"><PageHeader title="Member 360" subtitle="Loading player context…" breadcrumbs={[{ label: 'People' }, { label: 'Members', to: '/members' }]} /><Skeleton className="h-48 rounded-xl" /><SkeletonStatGrid count={4} /><SkeletonList rows={6} /></div>;
  if (error || !profile) return <div className="space-y-5"><PageHeader title="Member 360" subtitle="We could not open this member record." breadcrumbs={[{ label: 'People' }, { label: 'Members', to: '/members' }]} /><div className="card"><ErrorState message={error || 'Member not found.'} onRetry={() => setReloadKey((key) => key + 1)} /></div></div>;

  const { member, attendance, goals, matches, feedback, rankings, timeline } = profile;
  const customer = member.customerId ? (demo ? demoCustomerById(member.customerId) : null) : null;
  const nokName = customer?.nokName ?? member.customerNokName;
  const nokPhone = customer?.nokPhone ?? member.customerNokPhone;
  const wins = matches.filter((match) => match.result === 'W').length;
  const matchRate = matches.length ? Math.round((wins / matches.length) * 100) : 0;
  const age = ageFromDob(member.dateOfBirth);

  return <div className="space-y-5"><PageHeader eyebrow="People / member 360" title={member.name} subtitle={`${age != null ? `${age} years` : 'Age not set'} · ${member.memberCode} · ${member.customerName ? `linked to ${member.customerName}` : 'no customer linked'}`} breadcrumbs={[{ label: 'People' }, { label: 'Members', to: '/members' }, { label: member.name }]} actions={<><Link to="/members" className="btn btn-ghost"><ArrowLeft className="size-4" /> Roster</Link>{member.customerId && <Link to={`/customers/${member.customerId}`} className="btn btn-ghost"><Users className="size-4" /> Customer 360</Link>}{member.customerEmail && <a href={`mailto:${member.customerEmail}`} className="btn btn-primary"><Mail className="size-4" /> Message</a>}{canDo('customers.manage') && <Link to="/members/new" className="btn btn-ghost"><UserPlus className="size-4" /> Add member</Link>}</>} />

    <div className="card aurora overflow-hidden p-5 sm:p-6"><div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-4 sm:gap-5"><Avatar name={member.name} size="lg" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">{member.name}</h2><MemberStatusBadge member={member} />{member.specialNeedsFlag && <Badge tone="warning" icon={<TriangleAlert />}>Support note</Badge>}</div><p className="mt-1 text-sm text-ink-muted">{member.playingStyle ?? 'Playing style not set'}{member.handedness ? ` · ${member.handedness === 'R' ? 'Right' : 'Left'} handed` : ''}{member.groups.length ? ` · ${member.groups.join(' · ')}` : ''}</p><div className="mt-3 flex flex-wrap gap-2"><span className="badge badge-outline">Member code · {member.memberCode}</span>{member.customerName && <Link to={member.customerId ? `/customers/${member.customerId}` : '#'} className="badge badge-brand"><Users className="size-3" /> {member.customerName}</Link>}{member.alert && <span className="badge badge-warning"><TriangleAlert className="size-3" /> {member.alert}</span>}</div></div></div><div className="flex flex-wrap gap-2 lg:justify-end">{member.customerPhone && <a href={`tel:${member.customerPhone}`} className="btn btn-ghost"><Phone className="size-4" /> Call household</a>}<Link to="/actions/new" className="btn btn-primary"><MessageCircle className="size-4" /> Create follow-up</Link></div></div></div>

    <StatGrid><StatCard label="Attendance" value={member.attendancePct} format={(value) => `${Math.round(value)}%`} icon={HeartPulse} tone={member.attendancePct >= 80 ? 'success' : 'warning'} hint={`${member.sessionsAttended} of ${member.sessionsTotal || '—'} recorded`} sparkline={attendance.slice(0, 8).reverse().map((item) => item.status === 'present' ? 100 : item.status === 'late' ? 75 : 15)} /><StatCard label="Sessions attended" value={member.sessionsAttended} icon={CalendarDays} tone="brand" hint={member.nextSession ? `next ${formatDateTime(member.nextSession)}` : 'no upcoming session'} /><StatCard label="Goals in progress" value={goals.filter((goal) => goal.status === 'inProgress').length} icon={Target} tone="info" hint={`${goals.filter((goal) => goal.status === 'achieved').length} achieved`} /><StatCard label="Match win rate" value={matchRate} format={(value) => matches.length ? `${Math.round(value)}%` : '—'} icon={BadgeCheck} tone={matchRate >= 50 ? 'success' : 'neutral'} hint={matches.length ? `${wins} wins from ${matches.length}` : 'no matches recorded'} /></StatGrid>

    <SegmentedControl ariaLabel="Member 360 sections" value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'attendance', label: 'Attendance', count: attendance.length }, { value: 'development', label: 'Development', count: goals.length + feedback.length }, { value: 'profile', label: 'Profile' }]} />

    {tab === 'overview' && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"><section className="space-y-5"><div className="card overflow-hidden"><div className="flex items-start justify-between gap-3 border-b border-line px-4 py-4"><SectionHeader title="Attendance pulse" description="Recent register history and the next planned session." /><ProgressRing value={member.attendancePct} max={100} tone={member.attendancePct >= 80 ? 'success' : 'warning'} ariaLabel="Attendance percentage">{member.attendancePct}%</ProgressRing></div><AttendanceList attendance={attendance.slice(0, 5)} />{attendance.length > 5 && <button type="button" className="flex w-full items-center justify-center gap-2 border-t border-line px-4 py-3 text-xs font-semibold text-brand-text hover:bg-surface-hover" onClick={() => setTab('attendance')}>View all attendance <ArrowRight className="size-3.5" /></button>}</div><div className="card overflow-hidden"><div className="border-b border-line px-4 py-4"><SectionHeader title="Goals" description="What the next coaching conversation should move forward." /></div><GoalList goals={goals.slice(0, 4)} />{goals.length > 4 && <button type="button" className="flex w-full items-center justify-center gap-2 border-t border-line px-4 py-3 text-xs font-semibold text-brand-text" onClick={() => setTab('development')}>View all goals <ArrowRight className="size-3.5" /></button>}</div></section><aside className="space-y-5"><div className="card p-4"><SectionHeader title="Household contact" description="The safest route for updates and reminders." /><div className="flex items-center gap-3"><Avatar name={member.customerName} size="md" /><div className="min-w-0"><div className="truncate text-sm font-bold text-ink">{member.customerName ?? 'No linked customer'}</div>{member.customerEmail && <a href={`mailto:${member.customerEmail}`} className="mt-0.5 block truncate text-xs text-brand-text">{member.customerEmail}</a>}{member.customerPhone && <a href={`tel:${member.customerPhone}`} className="mt-0.5 block text-xs text-ink-muted">{member.customerPhone}</a>}</div></div>{(nokName || nokPhone) && <div className="mt-4 rounded-lg bg-surface-inset p-3 text-xs text-ink-muted"><div className="overline">Next of kin</div><div className="mt-1 text-sm text-ink">{nokName ?? 'Not recorded'}</div><div className="mt-0.5">{nokPhone ?? 'No NOK phone'}</div></div>}<div className="mt-4 flex gap-2">{member.customerId && <Link to={`/customers/${member.customerId}`} className="btn btn-ghost btn-sm flex-1">Open customer 360</Link>}{member.customerPhone && <a href={`tel:${member.customerPhone}`} className="btn btn-ghost btn-icon" aria-label="Call household"><Phone className="size-4" /></a>}</div></div><div className="card overflow-hidden"><div className="border-b border-line px-4 py-4"><SectionHeader title="Coach timeline" description="The last few meaningful moments." /></div><ActivityTimeline items={timeline.slice(0, 5)} />{timeline.length === 0 && <EmptyState icon={History} title="No timeline yet" description="Attendance and coach updates will build this view." className="py-6" />}</div></aside></div>}
    {tab === 'attendance' && <section className="card overflow-hidden"><div className="border-b border-line px-4 py-4"><SectionHeader title="Attendance history" description="Present, late, and absent records across venues." /></div><AttendanceList attendance={attendance} /></section>}
    {tab === 'development' && <div className="grid gap-5 lg:grid-cols-2"><section className="card overflow-hidden"><div className="border-b border-line px-4 py-4"><SectionHeader title="Goals" description="Progress and target dates." /></div><GoalList goals={goals} /></section><section className="card overflow-hidden"><div className="border-b border-line px-4 py-4"><SectionHeader title="Match form" description="Recent competition and ladder results." /></div>{matches.length ? <div className="divide-y divide-line">{matches.map((match) => <div key={match.id} className="flex items-center gap-3 px-4 py-3"><span className={`grid size-8 place-items-center rounded-xl text-xs font-bold ${match.result === 'W' ? 'bg-success-soft text-success' : match.result === 'L' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}>{match.result}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-ink">vs {match.opponent}</div><div className="mt-0.5 truncate text-xs text-ink-muted">{match.event}</div></div><span className="text-xs text-ink-faint">{formatDate(match.date, true)}</span></div>)}</div> : <EmptyState icon={BadgeCheck} title="No matches yet" description="Competition results will become part of the player story here." className="py-10" />}</section><section className="card overflow-hidden lg:col-span-2"><div className="border-b border-line px-4 py-4"><SectionHeader title="Coach feedback" description="Keep context from sessions and events in one timeline." /></div>{feedback.length ? <div className="divide-y divide-line">{feedback.map((item) => <div key={item.id} className="px-4 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="badge badge-brand"><NotebookPen className="size-3" /> Coach {item.coach}</span><time className="text-xs text-ink-faint">{formatDate(item.date, true)}</time></div><p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">{item.body}</p></div>)}</div> : <EmptyState icon={NotebookPen} title="No feedback yet" description="Coach notes will show here after a session review is saved." className="py-10" />}</section></div>}
    {tab === 'profile' && <div className="grid gap-5 lg:grid-cols-2"><section className="card p-5"><SectionHeader title="Player profile" description="The practical details coaches need before a session." /><dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2"><div><dt className="overline">Date of birth</dt><dd className="mt-1 text-sm text-ink">{formatDate(member.dateOfBirth, true)}{age != null && ` · age ${age}`}</dd></div><div><dt className="overline">Member code</dt><dd className="mt-1 text-sm text-ink">{member.memberCode}</dd></div><div><dt className="overline">Handedness</dt><dd className="mt-1 text-sm text-ink">{member.handedness === 'R' ? 'Right' : member.handedness === 'L' ? 'Left' : 'Not set'}</dd></div><div><dt className="overline">Playing style</dt><dd className="mt-1 text-sm text-ink">{member.playingStyle ?? 'Not set'}</dd></div><div className="sm:col-span-2"><dt className="overline">Equipment notes</dt><dd className="mt-1 text-sm leading-relaxed text-ink">{member.equipmentNotes ?? 'No equipment notes.'}</dd></div></dl></section><section className="card p-5"><SectionHeader title="Safety & access" description="Sensitive details are permission-gated and access logged." />{member.specialNeedsFlag ? canDo('medical.view') ? <div className="rounded-lg border border-warning/30 bg-warning-soft p-4"><div className="flex items-center gap-2 text-sm font-bold text-warning"><ShieldCheck className="size-4" /> Support note available</div><p className="mt-2 text-sm leading-relaxed text-ink-muted">Medical or support details are held in the protected record. Open the medical panel from the register to view the logged note.</p></div> : <div className="rounded-lg border border-line bg-surface-inset p-4"><div className="flex items-center gap-2 text-sm font-bold text-ink"><ShieldCheck className="size-4 text-ink-faint" /> Protected support record</div><p className="mt-2 text-sm leading-relaxed text-ink-muted">You can see that a support note exists, but your role cannot view its contents.</p></div> : <EmptyState icon={ShieldCheck} tone="success" title="No support note flagged" description="Nothing sensitive is flagged on this member record." className="py-8" />}</section></div>}

    {rankings.length > 0 && <div className="card p-4"><div className="flex flex-wrap items-center gap-3"><span className="overline">Rankings</span>{rankings.map((ranking) => <span key={`${ranking.platform}-${ranking.asOf}`} className="badge badge-accent"><BadgeCheck className="size-3" /> {ranking.platform} · #{ranking.value} <span className="opacity-70">{formatDate(ranking.asOf)}</span></span>)}</div></div>}
  </div>;
}

/* -------------------------------------------------------------------------- *
 * Tasters (admin pipeline)
 * -------------------------------------------------------------------------- */

export function Tasters() {
  const { staff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const load = () => supabase.from('mentis_prospects').select('*').order('created_at', { ascending: false }).then(({ data }) => setRows(data ?? []));
  useEffect(() => {
    load();
    supabase.from('mentis_sessions').select('id,name,start_at').eq('status', 'scheduled').order('start_at').limit(20).then(({ data }) => setSessions(data ?? []));
  }, []);
  const approve = async (t: any, sessionId: string) => {
    if (!sessionId) return;
    await supabase.from('mentis_prospects').update({ status: 'approved', approved_session_ids: [sessionId] }).eq('id', t.id);
    await fetch(functionsUrl('send-email'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: staff?.organization_id, to: t.contact, subject: 'Taster approved', body: `Hi ${t.name}, your taster is approved.`, template: 'tasterApproval', kind: 'invitation' }) });
    load();
  };
  const convert = async (t: any) => {
    const { data: c } = await supabase.from('mentis_customers').insert({ organization_id: staff?.organization_id, name: `${t.name} (guardian)`, phone: t.contact }).select('id').single();
    if (c) await supabase.from('mentis_members').insert({ organization_id: staff?.organization_id, customer_id: c.id, name: t.name, date_of_birth: '2015-01-01' });
    await supabase.from('mentis_prospects').update({ status: 'converted' }).eq('id', t.id);
    const { data: sport } = await supabase.from('mentis_sport_profiles').select('equipment_guide').limit(1).single();
    if (t.contact && t.contact.includes('@')) {
      await fetch(functionsUrl('send-email'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: staff?.organization_id, to: t.contact, subject: 'Welcome to Kingfisher TTC', body: `Hi ${t.name}! Welcome to Kingfisher Table Tennis Club. Your coach will confirm your first session shortly. Equipment: ${sport?.equipment_guide ?? 'racket, indoor shoes, sportswear, water bottle.'}`, template: 'welcomePack', kind: 'invitation' }) });
    }
    load();
  };
  const formUrl = `${window.location.origin}/taster?org=${staff?.organization_id ?? ''}`;
  return <div><PageHeader title="Tasters" subtitle="Requested → approved → attended → converted" actions={<span className="text-xs text-ink-muted">Public form: {formUrl} (QR it at venues)</span>} /><div className="card p-2"><table className="grid"><thead><tr><th>Name</th><th>Age</th><th>Contact</th><th>Status</th><th>Approve → session</th><th /></tr></thead><tbody>{rows.map((t) => <tr key={t.id}><td className="font-semibold">{t.name}</td><td>{t.age}</td><td>{t.contact}</td><td><Badge tone="neutral">{t.status}</Badge></td><td>{t.status === 'requested' && <select className="input w-auto" defaultValue="" onChange={(event) => approve(t, event.target.value)}><option value="">Assign…</option>{sessions.map((session: any) => <option key={session.id} value={session.id}>{session.name} {formatDate(session.start_at)}</option>)}</select>}</td><td>{(t.status === 'approved' || t.status === 'attended') && <button className="btn btn-primary" onClick={() => convert(t)}>Convert</button>}</td></tr>)}</tbody></table></div></div>;
}
