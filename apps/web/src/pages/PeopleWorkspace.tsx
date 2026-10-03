import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, LockKeyhole, ShieldAlert, UsersRound, UserRound, UserRoundCheck, Wallet } from 'lucide-react';
import { PageHeader } from '../components/patterns/page-header';
import { Button, Card, ErrorState, SkeletonStatGrid, StatCard, StatGrid, Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui';
import { Customers, Members } from './entities';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { demoEnabled, isDemoSession } from '../lib/demo';
import { demoCustomersSnapshot, demoMembersSnapshot } from '../lib/people-data';

interface PeopleSignals {
  activeMembers: number;
  needsAttention: number;
  lowAttendance: number;
  outstandingCents: number;
}

const demoMode = () => demoEnabled || isDemoSession();
const financialPermission = (canDo: (permission: 'charges.manage' | 'billing.viewAll') => boolean) =>
  canDo('charges.manage') || canDo('billing.viewAll');

/**
 * People Workspace is the single Coaching → People home. Members and Customers
 * remain separate domains and records; the tabs only change the directory view.
 */
export function PeopleWorkspace() {
  const { staff, canDo } = useAuth();
  const demo = demoMode();
  const canSeeBalances = financialPermission(canDo);
  const [directory, setDirectory] = useState<'members' | 'customers'>('members');
  const [signals, setSignals] = useState<PeopleSignals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  const loadSignals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (demo) {
        const members = demoMembersSnapshot();
        const customers = demoCustomersSnapshot();
        const lowAttendanceIds = new Set(members
          .filter((member) => member.sessionsTotal >= 3 && member.attendancePct < 70)
          .map((member) => member.id));
        const followUpIds = new Set(members.filter((member) => member.status === 'atRisk' || member.alert).map((member) => member.id));
        const attentionIds = new Set([...lowAttendanceIds, ...followUpIds]);
        setSignals({
          activeMembers: members.filter((member) => member.status !== 'inactive').length,
          needsAttention: attentionIds.size,
          lowAttendance: lowAttendanceIds.size,
          outstandingCents: canSeeBalances ? customers.reduce((sum, customer) => sum + (customer.charges?.filter((charge) => charge.status === 'outstandingDebit').reduce((total, charge) => total + charge.amountCents, 0) ?? Math.max(0, customer.balanceCents)), 0) : 0,
        });
        return;
      }

      let memberQuery: any = supabase.from('mentis_members').select('id,erased_at').order('created_at', { ascending: false });
      if (staff?.organization_id) memberQuery = memberQuery.eq('organization_id', staff.organization_id);
      const [memberResult, attendanceResult, actionsResult, chargesResult] = await Promise.all([
        memberQuery,
        supabase.from('mentis_attendance_records').select('member_id,status,recorded_at').order('recorded_at', { ascending: false }).limit(10000),
        (() => { let query: any = supabase.from('mentis_pending_actions').select('linked_entity_id').eq('linked_entity_type', 'member').eq('status', 'open').limit(5000); if (staff?.organization_id) query = query.eq('organization_id', staff.organization_id); return query; })(),
        canSeeBalances
          ? (() => { let query: any = supabase.from('mentis_customer_charges').select('amount_cents,status').eq('status', 'outstandingDebit').limit(5000); if (staff?.organization_id) query = query.eq('organization_id', staff.organization_id); return query; })()
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (memberResult.error) throw new Error(memberResult.error.message);
      if (attendanceResult.error) throw new Error(attendanceResult.error.message);
      if (actionsResult.error) throw new Error(actionsResult.error.message);
      if (chargesResult.error) throw new Error(chargesResult.error.message);

      const active = (memberResult.data ?? []).filter((member: any) => !member.erased_at);
      const visibleIds = new Set(active.map((member: any) => member.id));
      const attendanceByMember = new Map<string, { attended: number; total: number }>();
      for (const record of attendanceResult.data ?? []) {
        if (!record.member_id || !visibleIds.has(record.member_id)) continue;
        const value = attendanceByMember.get(record.member_id) ?? { attended: 0, total: 0 };
        value.total += 1;
        if (record.status === 'present' || record.status === 'late') value.attended += 1;
        attendanceByMember.set(record.member_id, value);
      }
      const lowAttendanceIds = new Set([...attendanceByMember.entries()]
        .filter(([, value]) => value.total >= 3 && Math.round((value.attended / value.total) * 100) < 70)
        .map(([memberId]) => memberId));
      const openFollowUpIds = new Set((actionsResult.data ?? [])
        .map((action: any) => action.linked_entity_id)
        .filter((id: string | null) => id && visibleIds.has(id)));
      const attentionIds = new Set([...lowAttendanceIds, ...openFollowUpIds]);
      const outstandingCents = canSeeBalances
        ? (chargesResult.data ?? []).reduce((sum: number, charge: any) => sum + Number(charge.amount_cents ?? 0), 0)
        : 0;
      setSignals({ activeMembers: active.length, needsAttention: attentionIds.size, lowAttendance: lowAttendanceIds.size, outstandingCents });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'People signals could not be loaded.');
      setSignals(null);
    } finally {
      setLoading(false);
    }
  }, [canSeeBalances, demo, staff?.organization_id, retry]);

  useEffect(() => { void loadSignals(); }, [loadSignals]);

  const signalSummary = useMemo(() => signals ? `${signals.activeMembers} active members · ${signals.needsAttention} follow-ups` : 'Operational snapshot', [signals]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Coaching / People"
        title="People"
        subtitle="Keep player development distinct from the household account that supports it. Search either directory without merging their histories."
        breadcrumbs={[{ label: 'Coaching', to: '/sessions' }, { label: 'People' }]}
        actions={
          <>
            {canDo('customers.manage') && <Link to="/customers/new" className="btn btn-secondary"><Building2 className="size-4" /> Add customer</Link>}
            {canDo('customers.manage') && <Link to="/members/new" className="btn btn-primary"><UserRound className="size-4" /> Add member</Link>}
          </>
        }
      />

      <section aria-label="People operational signals" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <span className="grid size-7 place-items-center rounded-lg bg-brand-soft text-brand-text"><UserRoundCheck className="size-3.5" aria-hidden /></span>
            <span>{signalSummary}</span>
          </div>
          {error && <button type="button" onClick={() => setRetry((value) => value + 1)} className="btn btn-ghost btn-sm">Retry signals</button>}
        </div>
        {loading ? <SkeletonStatGrid count={4} /> : error ? (
          <div className="card p-3" role="alert"><ErrorState message={error} onRetry={() => setRetry((value) => value + 1)} /></div>
        ) : signals && (
          <StatGrid>
            <StatCard label="Active members" value={signals.activeMembers} icon={UsersRound} tone="brand" hint="profiles in the roster" />
            <StatCard label="Needs attention" value={signals.needsAttention} icon={ShieldAlert} tone={signals.needsAttention ? 'warning' : 'success'} hint="open follow-up or low attendance" />
            <StatCard label="Low attendance queue" value={signals.lowAttendance} icon={UserRound} tone={signals.lowAttendance ? 'warning' : 'success'} hint="below 70% across 3+ sessions" />
            {canSeeBalances ? (
              <StatCard label="Outstanding balances" value={signals.outstandingCents / 100} format={(value) => `£${value.toFixed(2)}`} icon={Wallet} tone={signals.outstandingCents ? 'warning' : 'success'} hint="outstanding debits only" />
            ) : (
              <Card className="flex min-h-[110px] flex-col justify-between p-[1.125rem]" aria-label="Outstanding balances restricted">
                <div className="flex items-start justify-between gap-3"><div><div className="overline">Outstanding balances</div><div className="mt-2 font-display text-2xl font-extrabold text-ink">Restricted</div></div><LockKeyhole className="size-4 text-ink-faint" aria-hidden /></div>
                <span className="text-xs text-ink-faint">Available to finance-authorised roles</span>
              </Card>
            )}
          </StatGrid>
        )}
      </section>

      <Tabs value={directory} onValueChange={(value) => setDirectory(value as typeof directory)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="overline">Directory</div>
            <h2 className="mt-1 font-display text-lg font-bold text-ink">One workspace, two people records</h2>
            <p className="mt-1 text-xs text-ink-muted">Customers are account holders. Members are athletes with their own activity history.</p>
          </div>
          <TabsList aria-label="People directories" className="w-fit">
            <TabsTrigger value="members"><UserRound className="size-3.5" /> Members</TabsTrigger>
            <TabsTrigger value="customers"><Building2 className="size-3.5" /> Customers</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="members" forceMount className="mt-4 data-[state=inactive]:hidden">
          <Members embedded />
        </TabsContent>
        <TabsContent value="customers" forceMount className="mt-4 data-[state=inactive]:hidden">
          <Customers embedded />
        </TabsContent>
      </Tabs>

      <p className="sr-only">Directory tabs are keyboard navigable. {signalSummary}.</p>
    </div>
  );
}
