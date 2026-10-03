import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Check, CircleUserRound, Plus, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { Button, Card, Avatar } from '../components/ui';
import { ageAt } from '@mentis/core';
import { PageHeader } from '../components/patterns/page-header';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { demoEnabled, isDemoSession } from '../lib/demo';
import { localDateKey } from '../lib/format';
import { addDemoCustomer, demoMembersSnapshot, linkDemoMembersToCustomer, updateDemoCustomer } from '../lib/people-data';

interface MemberChoice { id: string; name: string; dateOfBirth: string; memberCode: string; customerId?: string | null; }
interface ConsentDraft { code: string; label: string; state: 'not-recorded' | 'granted' | 'withdrawn'; validUntil: string; }

const consentOptions = [
  { code: 'photo', label: 'Photography & video' },
  { code: 'marketing', label: 'Club / programme updates' },
  { code: 'data', label: 'Data sharing with programme partners' },
  { code: 'medical', label: 'Health information processing' },
];
const demoMode = () => demoEnabled || isDemoSession();
const fieldClass = 'input min-h-10 w-full';

export function AddCustomerWizard() {
  const { staff, canDo } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState<MemberChoice[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selfMemberId, setSelfMemberId] = useState('');
  const [consents, setConsents] = useState<ConsentDraft[]>(consentOptions.map((option) => ({ ...option, state: 'not-recorded', validUntil: '' })));
  const [memberSearch, setMemberSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', guardianA: '', guardianB: '', nokName: '', nokPhone: '' });
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadingMembers(true);
    if (demoMode()) {
      const available = demoMembersSnapshot().filter((member) => !member.customerId).map((member) => ({ id: member.id, name: member.name, dateOfBirth: member.dateOfBirth, memberCode: member.memberCode }));
      setMembers(available);
      setLoadingMembers(false);
      return () => { cancelled = true; };
    }
    let query: any = supabase.from('mentis_members').select('id,name,date_of_birth,tte_number,customer_id').is('customer_id', null).is('erased_at', null).order('name');
    if (staff?.organization_id) query = query.eq('organization_id', staff.organization_id);
    query.then(({ data, error: queryError }: any) => {
      if (cancelled) return;
      if (queryError) setError(queryError.message);
      setMembers((data ?? []).map((member: any) => ({ id: member.id, name: member.name, dateOfBirth: member.date_of_birth, memberCode: member.tte_number ?? '—' })));
    }).finally(() => { if (!cancelled) setLoadingMembers(false); });
    return () => { cancelled = true; };
  }, [staff?.organization_id]);

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    return members.filter((member) => !query || `${member.name} ${member.memberCode}`.toLowerCase().includes(query));
  }, [members, memberSearch]);

  const setConsent = (code: string, patch: Partial<ConsentDraft>) => setConsents((current) => current.map((consent) => consent.code === code ? { ...consent, ...patch } : consent));

  const save = async (thenAddMember = false) => {
    setError('');
    if (!form.name.trim()) { setError('Account-holder name is required.'); return; }
    if (selectedMemberIds.length && selfMemberId && !selectedMemberIds.includes(selfMemberId)) { setError('Choose the adult member from the linked-member selection.'); return; }
    if (selfMemberId) { const selfMember = members.find((member) => member.id === selfMemberId); if (!selfMember || ageAt(selfMember.dateOfBirth) < 18) { setError('Only an adult member can be linked as the same person as the account holder.'); return; } }
    setSaving(true);
    try {
      const consentRecords = consents.map((consent) => ({
        kind: consent.code,
        issuedAt: localDateKey(),
        validUntil: consent.validUntil || null,
        state: consent.state,
        granted: consent.state === 'granted',
        label: consent.label,
      }));
      let customerId = '';
      if (demoMode()) {
        const customer = addDemoCustomer({
          name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(),
          guardianA: form.guardianA.trim(), guardianB: form.guardianB.trim(), nokName: form.nokName.trim(), nokPhone: form.nokPhone.trim(),
          consents: consentRecords,
        });
        customerId = customer.id;
        if (selectedMemberIds.length) linkDemoMembersToCustomer(customerId, selectedMemberIds);
        if (selfMemberId) updateDemoCustomer(customerId, { isAlsoMemberId: selfMemberId });
      } else {
        if (!staff?.organization_id) throw new Error('Your staff profile is not linked to an organisation.');
        const { data, error: insertError } = await supabase.from('mentis_customers').insert({
          organization_id: staff.organization_id,
          name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null,
          guardian_a: form.guardianA.trim() || null, guardian_b: form.guardianB.trim() || null,
          nok_name: form.nokName.trim() || null, nok_phone: form.nokPhone.trim() || null,
          consents: consentRecords,
        }).select('id').single();
        if (insertError || !data) throw new Error(insertError?.message ?? 'Could not create the customer record.');
        customerId = data.id;
        if (selectedMemberIds.length) {
          const { error: linkError } = await supabase.from('mentis_members').update({ customer_id: customerId }).in('id', selectedMemberIds);
          if (linkError) throw new Error(`Customer saved, but member linking needs attention: ${linkError.message}`);
        }
        if (selfMemberId) {
          const { error: selfLinkError } = await supabase.from('mentis_customers').update({ is_also_member_id: selfMemberId }).eq('id', customerId);
          if (selfLinkError) throw new Error(`Customer saved, but the adult member link did not finish: ${selfLinkError.message}`);
        }
      }
      navigate(thenAddMember ? `/members/new?customer_id=${encodeURIComponent(customerId)}` : `/customers/${customerId}`, { state: { created: !thenAddMember, customerId } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The customer record could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggleMember = (memberId: string) => {
    setSelectedMemberIds((current) => current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]);
    setSelfMemberId((current) => current === memberId ? '' : current);
  };

  if (!canDo('customers.manage')) return <div className="card p-6"><h1 className="font-display text-lg font-bold text-ink">Customer creation is restricted</h1><p className="mt-1 text-sm text-ink-muted">Your active role can view household context but cannot create customer records.</p></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow="People / customer onboarding"
        title="Add a customer"
        subtitle="Create the account-holder record, record consent choices, then link any existing members who belong to this household."
        breadcrumbs={[{ label: 'Coaching', to: '/sessions' }, { label: 'People', to: '/people' }, { label: 'Add customer' }]}
        actions={<Link to="/people" className="btn btn-ghost"><ArrowLeft className="size-4" /> Back to People</Link>}
      />
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="p-4 sm:p-6">
            <div className="mb-5 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-text"><CircleUserRound className="size-5" /></span><div><h2 className="font-display text-lg font-bold text-ink">Account holder & household</h2><p className="mt-1 text-sm text-ink-muted">The customer is the account holder, payer, guardian, or responsible adult—not a substitute for a member profile.</p></div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium text-ink sm:col-span-2"><span>Account-holder name <span className="text-danger">*</span></span><input className={fieldClass} autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Full name" /></label>
              <label className="space-y-1.5 text-sm font-medium text-ink"><span>Phone</span><input className={fieldClass} type="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+44…" /></label>
              <label className="space-y-1.5 text-sm font-medium text-ink"><span>Email</span><input className={fieldClass} type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@example.com" /></label>
              <label className="space-y-1.5 text-sm font-medium text-ink"><span>Guardian A</span><input className={fieldClass} value={form.guardianA} onChange={(event) => setForm({ ...form, guardianA: event.target.value })} placeholder="Name" /></label>
              <label className="space-y-1.5 text-sm font-medium text-ink"><span>Guardian B</span><input className={fieldClass} value={form.guardianB} onChange={(event) => setForm({ ...form, guardianB: event.target.value })} placeholder="Optional" /></label>
              <label className="space-y-1.5 text-sm font-medium text-ink"><span>Next-of-kin name</span><input className={fieldClass} value={form.nokName} onChange={(event) => setForm({ ...form, nokName: event.target.value })} /></label>
              <label className="space-y-1.5 text-sm font-medium text-ink"><span>Next-of-kin phone</span><input className={fieldClass} type="tel" value={form.nokPhone} onChange={(event) => setForm({ ...form, nokPhone: event.target.value })} /></label>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <header className="border-b border-line px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand-text" /><h2 className="font-display text-base font-bold text-ink">Consent records</h2></div><p className="mt-1 text-xs text-ink-muted">Consent is specific, dated, and never assumed. Expired or withdrawn consent is not valid.</p></header>
            <div className="divide-y divide-line">
              {consents.map((consent) => {
                const expired = consent.state === 'granted' && Boolean(consent.validUntil) && consent.validUntil < localDateKey();
                const stateLabel = expired ? 'Expired — not valid' : consent.state === 'granted' ? 'Granted' : consent.state === 'withdrawn' ? 'Withdrawn' : 'Not recorded';
                return <div key={consent.code} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)] sm:items-center">
                  <div className="flex items-start gap-3"><span className={`mt-0.5 grid size-8 place-items-center rounded-lg ${expired ? 'bg-danger-soft text-danger' : consent.state === 'granted' ? 'bg-success-soft text-success' : 'bg-surface-inset text-ink-faint'}`}>{expired ? <AlertCircle className="size-4" /> : consent.state === 'granted' ? <Check className="size-4" /> : <ShieldCheck className="size-4" />}</span><div><div className="text-sm font-semibold text-ink">{consent.label}</div><div className={`mt-0.5 text-xs ${expired ? 'font-semibold text-danger' : 'text-ink-muted'}`}>{stateLabel}</div></div></div>
                  <div className="grid grid-cols-2 gap-3"><label className="min-w-0 text-xs text-ink-muted">State<select className="input mt-1 min-h-9 w-full" value={consent.state} onChange={(event) => setConsent(consent.code, { state: event.target.value as ConsentDraft['state'] })}><option value="not-recorded">Not recorded</option><option value="granted">Granted</option><option value="withdrawn">Withdrawn</option></select></label><label className="min-w-0 text-xs text-ink-muted">Expires<input className="input mt-1 min-h-9 w-full" type="date" value={consent.validUntil} onChange={(event) => setConsent(consent.code, { validUntil: event.target.value })} /></label></div>
                </div>;
              })}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <header className="border-b border-line px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><UsersRound className="size-4 text-brand-text" /><h2 className="font-display text-base font-bold text-ink">Link existing members</h2></div><p className="mt-1 text-xs text-ink-muted">Only unlinked member records appear. This links household context without making duplicate player profiles.</p></header>
            <div className="p-4 sm:p-5">
              <input className="input min-h-10 w-full sm:max-w-sm" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search unlinked members…" aria-label="Search unlinked members" />
              {loadingMembers ? <div className="mt-4 space-y-2" aria-label="Loading members"><div className="skeleton h-12" /><div className="skeleton h-12" /></div> : filteredMembers.length ? (
                <div className="mt-3 divide-y divide-line rounded-xl border border-line">
                  {filteredMembers.map((member) => {
                    const checked = selectedMemberIds.includes(member.id);
                    return <div key={member.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"><input type="checkbox" checked={checked} onChange={() => toggleMember(member.id)} /><Avatar name={member.name} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{member.name}</span><span className="block text-xs text-ink-faint">{member.memberCode || 'No member code'}</span></span><span className="text-xs text-ink-muted">{member.dateOfBirth}</span></label>
                      {checked && ageAt(member.dateOfBirth) >= 18 && <label className="flex items-center gap-2 text-xs text-ink-muted"><input type="radio" name="adult-customer-member" checked={selfMemberId === member.id} onChange={() => setSelfMemberId(member.id)} /> Account holder is this member</label>}
                    </div>;
                  })}
                </div>
              ) : <p className="mt-4 rounded-xl bg-surface-inset p-3 text-sm text-ink-muted">{members.length ? 'No unlinked members match your search.' : 'No unlinked members are available. You can add a member after saving this account.'}</p>}
            </div>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <Card className="p-4">
            <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-brand-text"><UserRound className="size-4" /></span><div><div className="text-sm font-bold text-ink">Ready to create</div><div className="text-xs text-ink-faint">Customer / household record</div></div></div>
            <div className="mt-4 space-y-2 text-xs text-ink-muted"><div className="flex justify-between gap-2"><span>Members to link</span><strong className="text-ink">{selectedMemberIds.length}</strong></div><div className="flex justify-between gap-2"><span>Granted consents</span><strong className="text-ink">{consents.filter((consent) => consent.state === 'granted' && (!consent.validUntil || consent.validUntil >= localDateKey())).length}</strong></div></div>
            {selfMemberId && <div className="mt-3 rounded-lg border border-brand/25 bg-brand-soft p-2 text-xs text-brand-text">Adult member link selected</div>}
            <Button className="mt-4" intent="primary" block loading={saving} iconLeft={<Check />} onClick={() => void save(false)}>Save customer</Button>
            {canDo('customers.manage') && <Button className="mt-2" intent="ghost" block loading={saving} iconLeft={<Plus />} onClick={() => void save(true)}>Save & add a member</Button>}
          </Card>
          <Card className="p-4"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-text" /><p className="text-xs leading-relaxed text-ink-muted">Customer and member records stay distinct. No recurring billing, card collection, or automatic payment plan is created.</p></div></Card>
        </aside>
      </div>
    </div>
  );
}
