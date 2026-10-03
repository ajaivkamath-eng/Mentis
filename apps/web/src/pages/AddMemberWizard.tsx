import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, CircleUserRound, FileText, ImagePlus, ShieldCheck, Sparkles, UserRound, UsersRound } from 'lucide-react';
import { ageAt, TAG_TYPE_DEFINITIONS, validateMember } from '@mentis/core';
import { Button, Card, Badge, Avatar } from '../components/ui';
import { PageHeader } from '../components/patterns/page-header';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { demoEnabled, isDemoSession } from '../lib/demo';
import { addDemoCustomer, addDemoMember, demoCustomersSnapshot, updateDemoCustomer } from '../lib/people-data';

interface CustomerChoice {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  nokName?: string | null;
  nokPhone?: string | null;
  guardianA?: string | null;
  guardianB?: string | null;
}

type WizardStep = 1 | 2 | 3 | 4;
type CustomerMode = 'existing' | 'create' | 'self';
type TagSelection = Record<string, string[]>;

interface FormState {
  name: string;
  dateOfBirth: string;
  memberCode: string;
  handedness: '' | 'L' | 'R';
  playingStyle: string;
  equipmentNotes: string;
  sport: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  guardianA: string;
  guardianB: string;
  nokName: string;
  nokPhone: string;
  tags: TagSelection;
}

const initialForm: FormState = {
  name: '', dateOfBirth: '', memberCode: '', handedness: '', playingStyle: '', equipmentNotes: '', sport: 'Table tennis',
  customerId: '', customerName: '', customerPhone: '', customerEmail: '', guardianA: '', guardianB: '', nokName: '', nokPhone: '',
  tags: { skill_level: [], performance_stream: [], membership: [] },
};

const wizardSteps = [
  { step: 1, label: 'Player details', icon: UserRound },
  { step: 2, label: 'Customer / household', icon: UsersRound },
  { step: 3, label: 'Sport profile & tags', icon: Sparkles },
  { step: 4, label: 'Review & save', icon: CheckCircle2 },
] as const;

const demoMode = () => demoEnabled || isDemoSession();
const fieldClass = 'input min-h-10 w-full';

function Field({ label, hint, children, required }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block min-w-0 space-y-1.5 text-sm font-medium text-ink">
      <span className="flex items-center gap-1.5">{label}{required && <span aria-hidden className="text-danger">*</span>}</span>
      {children}
      {hint && <span className="block text-xs font-normal leading-relaxed text-ink-faint">{hint}</span>}
    </label>
  );
}

function SelectionCard({ selected, title, description, icon, onClick }: { selected: boolean; title: string; description: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-[82px] w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)] ${selected ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:bg-surface-hover'}`}
    >
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${selected ? 'bg-brand text-brand-ink' : 'bg-surface-inset text-ink-muted'}`}>{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-ink">{title}</span><span className="mt-1 block text-xs leading-relaxed text-ink-muted">{description}</span></span>
      {selected && <Check className="mt-1 size-4 shrink-0 text-brand-text" aria-hidden />}
    </button>
  );
}

export function AddMemberWizard() {
  const { staff, canDo } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCustomerId = searchParams.get('customer_id') ?? '';
  const [step, setStep] = useState<WizardStep>(1);
  const [customerMode, setCustomerMode] = useState<CustomerMode>('existing');
  const [form, setForm] = useState<FormState>(() => ({ ...initialForm, customerId: preselectedCustomerId }));
  const [customers, setCustomers] = useState<CustomerChoice[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  const age = form.dateOfBirth ? ageAt(form.dateOfBirth) : Number.NaN;
  const isMinor = Number.isFinite(age) && age < 18;
  const selectedCustomer = customers.find((customer) => customer.id === form.customerId) ?? null;
  const currentTagDefinitions = useMemo(() => TAG_TYPE_DEFINITIONS.filter((tag) => tag.scope === 'member'), []);

  useEffect(() => {
    let cancelled = false;
    setLoadingCustomers(true);
    if (demoMode()) {
      setCustomers(demoCustomersSnapshot().map((customer) => ({
        id: customer.id, name: customer.name, phone: customer.phone, email: customer.email,
        nokName: customer.nokName, nokPhone: customer.nokPhone, guardianA: customer.guardianA, guardianB: customer.guardianB,
      })));
      setLoadingCustomers(false);
      return () => { cancelled = true; };
    }
    (() => { let query: any = supabase.from('mentis_customers').select('id,name,phone,email,nok_name,nok_phone,guardian_a,guardian_b').order('name'); if (staff?.organization_id) query = query.eq('organization_id', staff.organization_id); return query; })()
      .then(({ data, error: queryError }: any) => {
        if (cancelled) return;
        if (queryError) setError(queryError.message);
        setCustomers((data ?? []).map((customer: any) => ({
          id: customer.id, name: customer.name, phone: customer.phone, email: customer.email,
          nokName: customer.nok_name, nokPhone: customer.nok_phone, guardianA: customer.guardian_a, guardianB: customer.guardian_b,
        })));
      })
      .finally(() => { if (!cancelled) setLoadingCustomers(false); });
    return () => { cancelled = true; };
  }, [staff?.organization_id]);

  useEffect(() => {
    if (!photo) { setPhotoPreview(''); return; }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (preselectedCustomerId && !form.customerId) setForm((current) => ({ ...current, customerId: preselectedCustomerId }));
  }, [form.customerId, preselectedCustomerId]);

  const setValue = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setTag = (tagCode: string, optionCode: string, allowMultiple: boolean) => {
    setForm((current) => {
      const selected = current.tags[tagCode] ?? [];
      const next = allowMultiple
        ? selected.includes(optionCode) ? selected.filter((code) => code !== optionCode) : [...selected, optionCode]
        : selected[0] === optionCode ? [] : [optionCode];
      return { ...current, tags: { ...current.tags, [tagCode]: next } };
    });
  };

  const applySelectedCustomer = (customerId: string) => {
    const customer = customers.find((option) => option.id === customerId);
    setForm((current) => ({
      ...current,
      customerId,
      ...(customer ? {
        nokName: current.nokName || customer.nokName || '',
        nokPhone: current.nokPhone || customer.nokPhone || '',
      } : {}),
    }));
  };

  const validateStep = (candidate: WizardStep) => {
    const nextErrors: string[] = [];
    if (candidate === 1) {
      if (!form.name.trim()) nextErrors.push('Enter the member’s full name.');
      if (!form.dateOfBirth) nextErrors.push('Add a date of birth.');
      else if (!Number.isFinite(age) || age < 0) nextErrors.push('Enter a valid date of birth that is not in the future.');
      if (form.memberCode.trim() && !/^[A-Za-z0-9-]{3,20}$/.test(form.memberCode.trim())) nextErrors.push('Member code must be 3–20 letters, numbers, or hyphens.');
    }
    if (candidate === 2) {
      if (customerMode === 'existing' && !form.customerId) nextErrors.push('Select an existing customer or choose a create option.');
      if (customerMode === 'create' && !form.customerName.trim()) nextErrors.push('Add the guardian or account holder name.');
      if (isMinor && customerMode === 'self') nextErrors.push('A member under 18 needs a linked guardian/customer record.');
      if (isMinor && !form.nokName.trim()) nextErrors.push('For a member under 18, next-of-kin name is required.');
      if (isMinor && !form.nokPhone.trim()) nextErrors.push('For a member under 18, next-of-kin phone is required.');
    }
    setFieldErrors(nextErrors);
    return nextErrors.length === 0;
  };

  const validateAll = () => {
    const nextErrors = [
      ...validateMember({
        id: '',
        name: form.name,
        customerId: customerMode === 'existing' ? form.customerId || undefined : customerMode === 'create' || customerMode === 'self' ? 'to-be-created' : undefined,
        dateOfBirth: form.dateOfBirth,
        specialNeedsFlag: false,
        nokName: form.nokName || undefined,
        nokPhone: form.nokPhone || undefined,
        tteNumber: form.memberCode || undefined,
      }).map((message) => message.replace('members under 18', 'members under 18')),
    ];
    if (!form.name.trim()) nextErrors.push('Full name is required.');
    if (customerMode === 'existing' && !form.customerId) nextErrors.push('Link a customer/guardian record.');
    if (customerMode === 'create' && !form.customerName.trim()) nextErrors.push('Customer or guardian name is required.');
    setFieldErrors([...new Set(nextErrors)]);
    return nextErrors.length === 0;
  };

  const nextStep = () => {
    setError('');
    if (!validateStep(step)) return;
    setStep((current) => Math.min(4, current + 1) as WizardStep);
  };

  const handlePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const nextPhoto = event.target.files?.[0] ?? null;
    if (!nextPhoto) { setPhoto(null); return; }
    if (!nextPhoto.type.startsWith('image/')) { setFieldErrors(['Choose an image file.']); return; }
    if (nextPhoto.size > 8 * 1024 * 1024) { setFieldErrors(['Choose an image smaller than 8 MB.']); return; }
    setFieldErrors([]);
    setPhoto(nextPhoto);
  };

  const saveMember = async () => {
    setError('');
    if (!validateAll()) { setStep(4); return; }
    setLoading(true);
    let createdCustomerId = '';
    let memberId = '';
    try {
      const customerDetails = customerMode === 'self'
        ? { name: form.name.trim(), phone: form.customerPhone.trim(), email: form.customerEmail.trim(), guardianA: '', guardianB: '', nokName: form.nokName.trim(), nokPhone: form.nokPhone.trim() }
        : { name: form.customerName.trim(), phone: form.customerPhone.trim(), email: form.customerEmail.trim(), guardianA: form.guardianA.trim(), guardianB: form.guardianB.trim(), nokName: form.nokName.trim(), nokPhone: form.nokPhone.trim() };

      if (demoMode()) {
        const customerId = customerMode === 'existing'
          ? form.customerId
          : addDemoCustomer(customerDetails).id;
        const tags = currentTagDefinitions.flatMap((definition) => (form.tags[definition.code] ?? []).map((optionCode) => {
          const option = definition.options.find((item) => item.code === optionCode);
          return option ? `${definition.label}: ${option.label}` : '';
        })).filter(Boolean);
        const member = addDemoMember({
          name: form.name.trim(), dateOfBirth: form.dateOfBirth, customerId: customerId || undefined,
          tteNumber: form.memberCode.trim() || undefined,
          handedness: form.handedness || undefined,
          playingStyle: form.playingStyle.trim() || undefined,
          equipmentNotes: form.equipmentNotes.trim() || undefined,
          sport: form.sport,
          photoRef: photo?.name,
          tags,
        });
        memberId = member.id;
        createdCustomerId = customerId;
        if (customerMode === 'self') updateDemoCustomer(customerId, { isAlsoMemberId: member.id });
      } else {
        if (!staff?.organization_id) throw new Error('Your staff profile is not linked to an organisation.');
        let customerId = customerMode === 'existing' ? form.customerId : '';
        if (!customerId) {
          const { data: createdCustomer, error: customerError } = await supabase.from('mentis_customers').insert({
            organization_id: staff.organization_id,
            name: customerDetails.name,
            phone: customerDetails.phone || null,
            email: customerDetails.email || null,
            guardian_a: customerDetails.guardianA || null,
            guardian_b: customerDetails.guardianB || null,
            nok_name: customerDetails.nokName || null,
            nok_phone: customerDetails.nokPhone || null,
            consents: [],
          }).select('id').single();
          if (customerError || !createdCustomer) throw new Error(customerError?.message ?? 'Could not create the customer record.');
          customerId = createdCustomer.id;
          createdCustomerId = customerId;
        }

        const { data: member, error: memberError } = await supabase.from('mentis_members').insert({
          organization_id: staff.organization_id,
          name: form.name.trim(),
          date_of_birth: form.dateOfBirth,
          customer_id: customerId || null,
          tte_number: form.memberCode.trim() || null,
          handedness: form.handedness || null,
          playing_style: form.playingStyle.trim() || null,
          equipment_notes: form.equipmentNotes.trim() || null,
          sports: [{ sportId: form.sport, level: form.tags.skill_level?.[0] ?? null }],
          nok_name: form.nokName.trim() || null,
          nok_phone: form.nokPhone.trim() || null,
        }).select('id').single();
        if (memberError || !member) {
          if (createdCustomerId) await supabase.from('mentis_customers').delete().eq('id', createdCustomerId);
          throw new Error(memberError?.message ?? 'Could not save the member record.');
        }
        memberId = member.id;

        if (customerMode === 'self') {
          const { error: linkError } = await supabase.from('mentis_customers').update({ is_also_member_id: member.id }).eq('id', customerId);
          if (linkError) throw new Error(`Member saved but the adult customer/member link did not finish: ${linkError.message}`);
        }

        const selectedCodes = Object.entries(form.tags).flatMap(([code, values]) => values.map((value) => ({ code, value })));
        if (selectedCodes.length) {
          const typeResult = await supabase.from('mentis_tag_types').select('id,code').eq('scope', 'member').eq('organization_id', staff.organization_id);
          const typeIds = new Map((typeResult.data ?? []).map((item: any) => [item.code, item.id]));
          const valueResult = typeIds.size ? await supabase.from('mentis_tag_values').select('id,tag_type_id,code').in('tag_type_id', [...typeIds.values()]) : { data: [], error: null };
          const valueIds = new Map((valueResult.data ?? []).map((item: any) => [`${[...typeIds.entries()].find(([, id]) => id === item.tag_type_id)?.[0]}:${item.code}`, item.id]));
          const tagRows = selectedCodes.flatMap(({ code, value }) => {
            const typeId = typeIds.get(code);
            const valueId = valueIds.get(`${code}:${value}`);
            return typeId && valueId ? [{ organization_id: staff.organization_id, tag_type_id: typeId, tag_value_id: valueId, entity_type: 'member', entity_id: member.id }] : [];
          });
          if (tagRows.length) {
            const { error: tagError } = await supabase.from('mentis_entity_tags').insert(tagRows);
            if (tagError) console.warn('Member saved without one or more optional tags:', tagError.message);
          }
        }

        if (photo) {
          const extension = photo.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
          const path = `${staff.organization_id}/members/${member.id}/profile-${Date.now()}.${extension}`;
          const { error: uploadError } = await supabase.storage.from('photos').upload(path, photo, { upsert: true, contentType: photo.type });
          if (uploadError) console.warn('Member saved without profile photo:', uploadError.message);
          else await supabase.from('mentis_members').update({ photo_ref: path }).eq('id', member.id);
        }
      }
      navigate(`/members/${memberId}`, { state: { created: true, customerId: createdCustomerId, offerEnrollment: true } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The member could not be saved. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderTagChoices = () => currentTagDefinitions.map((definition) => (
    <fieldset key={definition.code} className="min-w-0">
      <legend className="mb-2 text-sm font-semibold text-ink">{definition.label}</legend>
      <div className="flex flex-wrap gap-2">
        {definition.options.map((option) => {
          const checked = (form.tags[definition.code] ?? []).includes(option.code);
          return (
            <button
              key={option.code}
              type="button"
              aria-pressed={checked}
              onClick={() => setTag(definition.code, option.code, definition.allowMultiple)}
              className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)] ${checked ? 'border-brand bg-brand-soft text-brand-text' : 'border-line bg-surface text-ink-muted hover:bg-surface-hover hover:text-ink'}`}
            >
              {checked && <Check className="size-3" aria-hidden />}{option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  ));

  const selectedTagLabels = currentTagDefinitions.flatMap((definition) => (form.tags[definition.code] ?? []).map((code) => definition.options.find((option) => option.code === code)?.label).filter(Boolean));

  if (!canDo('customers.manage')) {
    return <div className="card p-6"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-warning" /><div><h1 className="font-display text-lg font-bold text-ink">Member creation is restricted</h1><p className="mt-1 text-sm text-ink-muted">Your active role can view people records but cannot create or change them.</p></div></div></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow="People / member onboarding"
        title="Add a member"
        subtitle="Create the player profile first. Link a guardian or account-holder customer separately; never duplicate one person as two members."
        breadcrumbs={[{ label: 'Coaching', to: '/sessions' }, { label: 'People', to: '/people' }, { label: 'Add member' }]}
        actions={<Link to="/people" className="btn btn-ghost"><ArrowLeft className="size-4" /> Back to People</Link>}
      />

      <nav aria-label="Add member steps" className="card p-2 sm:p-3">
        <ol className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {wizardSteps.map(({ step: stepNumber, label, icon: Icon }) => {
            const current = stepNumber === step;
            const complete = stepNumber < step;
            return (
              <li key={stepNumber}>
                <button
                  type="button"
                  onClick={() => stepNumber < step ? setStep(stepNumber as WizardStep) : undefined}
                  aria-current={current ? 'step' : undefined}
                  className={`flex min-h-12 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors sm:px-3 ${current ? 'bg-brand-soft text-brand-text' : complete ? 'text-ink' : 'text-ink-faint'}`}
                >
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full ${current ? 'bg-brand text-brand-ink' : complete ? 'bg-success-soft text-success' : 'bg-surface-inset text-ink-faint'}`}>
                    {complete ? <Check className="size-3.5" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
                  </span>
                  <span className="min-w-0"><span className="block text-2xs uppercase tracking-wide opacity-70">Step {stepNumber}</span><span className="block truncate text-xs font-semibold sm:text-sm">{label}</span></span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div>}
      {fieldErrors.length > 0 && <div role="alert" className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink"><div className="flex items-center gap-2 font-semibold text-warning"><AlertCircle className="size-4" />Please check this step</div><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-muted">{fieldErrors.map((message) => <li key={message}>{message}</li>)}</ul></div>}

      <Card className="overflow-hidden">
        {step === 1 && (
          <section aria-labelledby="player-details-title" className="p-4 sm:p-6">
            <div className="mb-5 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-text"><UserRound className="size-5" /></span><div><h2 id="player-details-title" className="font-display text-lg font-bold text-ink">Player details</h2><p className="mt-1 text-sm text-ink-muted">Identity and practical profile information. Medical/support notes are added only through the protected, auditable workflow.</p></div></div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name" required><input autoComplete="name" className={fieldClass} value={form.name} onChange={(event) => setValue('name', event.target.value)} placeholder="e.g. Ava Mitchell" /></Field>
              <Field label="Date of birth" required hint="Used to calculate age and enforce guardian requirements."><input type="date" className={fieldClass} value={form.dateOfBirth} onChange={(event) => setValue('dateOfBirth', event.target.value)} /></Field>
              <Field label="Member code / TTE number" hint="Optional. Letters, numbers, and hyphens only."><input className={fieldClass} value={form.memberCode} onChange={(event) => setValue('memberCode', event.target.value)} placeholder="e.g. KF-1042" /></Field>
              <Field label="Sport"><select className={fieldClass} value={form.sport} onChange={(event) => setValue('sport', event.target.value)}><option>Table tennis</option><option>Other</option></select></Field>
              <Field label="Handedness"><select className={fieldClass} value={form.handedness} onChange={(event) => setValue('handedness', event.target.value as FormState['handedness'])}><option value="">Not set</option><option value="R">Right-handed</option><option value="L">Left-handed</option></select></Field>
              <Field label="Playing style"><input className={fieldClass} value={form.playingStyle} onChange={(event) => setValue('playingStyle', event.target.value)} placeholder="e.g. Attacker, all-round" /></Field>
              <div className="md:col-span-2">
                <Field label="Equipment notes" hint="Practical equipment information only. Do not enter medical or support details here."><textarea className={`${fieldClass} min-h-24 resize-y`} value={form.equipmentNotes} onChange={(event) => setValue('equipmentNotes', event.target.value)} placeholder="Racket setup, grip, or equipment to bring…" /></Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Profile photo" hint="Optional image, up to 8 MB. Photos are stored in Mentis’ private photos bucket.">
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-inset p-3">
                    {photoPreview ? <Avatar name={form.name} src={photoPreview} size="lg" /> : <span className="grid size-14 place-items-center rounded-full bg-surface text-ink-faint"><ImagePlus className="size-5" /></span>}
                    <div className="min-w-0 flex-1"><label className="btn btn-secondary btn-sm cursor-pointer"><ImagePlus className="size-3.5" /> Choose image<input className="sr-only" type="file" accept="image/*" onChange={handlePhoto} /></label><p className="mt-1 text-xs text-ink-faint">{photo?.name ?? 'JPG, PNG, or WebP'}</p></div>
                    {photo && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhoto(null)}>Remove photo</button>}
                  </div>
                </Field>
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby="customer-link-title" className="p-4 sm:p-6">
            <div className="mb-5 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-info-soft text-info"><UsersRound className="size-5" /></span><div><h2 id="customer-link-title" className="font-display text-lg font-bold text-ink">Customer / household</h2><p className="mt-1 text-sm text-ink-muted">Customer and member are distinct records. An adult member can link to their own customer record.</p></div></div>
            {isMinor && <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-ink"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-warning" /><p><strong>Under-18 safeguard.</strong> Select or create a guardian/customer and add a next-of-kin name and phone before saving.</p></div>}
            <div className="grid gap-3 md:grid-cols-2">
              <SelectionCard selected={customerMode === 'existing'} title="Link an existing customer" description="Use the account-holder or guardian record already in Mentis." icon={<UsersRound className="size-4" />} onClick={() => setCustomerMode('existing')} />
              <SelectionCard selected={customerMode === 'create'} title="Create a customer inline" description="Create the guardian or responsible adult record as part of onboarding." icon={<CircleUserRound className="size-4" />} onClick={() => setCustomerMode('create')} />
              {!isMinor && <SelectionCard selected={customerMode === 'self'} title="Adult member is also the customer" description="Create one linked customer record for this adult; no duplicate member profile is created." icon={<UserRound className="size-4" />} onClick={() => setCustomerMode('self')} />}
            </div>
            {customerMode === 'existing' && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Choose customer" required hint="Search is by the account holder/guardian name.">
                  <select className={fieldClass} value={form.customerId} onChange={(event) => applySelectedCustomer(event.target.value)} disabled={loadingCustomers}>
                    <option value="">{loadingCustomers ? 'Loading customers…' : 'Select a customer'}</option>
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}
                  </select>
                </Field>
                {selectedCustomer && <div className="rounded-xl border border-line bg-surface-inset p-3 text-sm"><div className="flex items-center gap-2"><Avatar name={selectedCustomer.name} size="sm" /><span className="font-semibold text-ink">{selectedCustomer.name}</span><Badge tone="info">Customer</Badge></div><div className="mt-2 text-xs text-ink-muted">{[selectedCustomer.email, selectedCustomer.phone].filter(Boolean).join(' · ') || 'No contact details recorded'}</div></div>}
              </div>
            )}
            {(customerMode === 'create' || customerMode === 'self') && (
              <div className="mt-4 rounded-xl border border-line bg-surface-inset p-4">
                <h3 className="text-sm font-bold text-ink">{customerMode === 'self' ? 'Adult account-holder details' : 'Guardian / account-holder details'}</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Customer name" required><input className={fieldClass} value={customerMode === 'self' ? form.name : form.customerName} onChange={(event) => customerMode === 'self' ? setValue('name', event.target.value) : setValue('customerName', event.target.value)} placeholder="Full name" /></Field>
                  <Field label="Phone"><input type="tel" autoComplete="tel" className={fieldClass} value={form.customerPhone} onChange={(event) => setValue('customerPhone', event.target.value)} placeholder="+44…" /></Field>
                  <Field label="Email"><input type="email" autoComplete="email" className={fieldClass} value={form.customerEmail} onChange={(event) => setValue('customerEmail', event.target.value)} placeholder="name@example.com" /></Field>
                  {customerMode === 'create' && <>
                    <Field label="Guardian A"><input className={fieldClass} value={form.guardianA} onChange={(event) => setValue('guardianA', event.target.value)} /></Field>
                    <Field label="Guardian B"><input className={fieldClass} value={form.guardianB} onChange={(event) => setValue('guardianB', event.target.value)} /></Field>
                  </>}
                </div>
              </div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Next-of-kin name" required={isMinor}><input autoComplete="off" className={fieldClass} value={form.nokName} onChange={(event) => setValue('nokName', event.target.value)} placeholder="Full name" /></Field>
              <Field label="Next-of-kin phone" required={isMinor}><input type="tel" autoComplete="off" className={fieldClass} value={form.nokPhone} onChange={(event) => setValue('nokPhone', event.target.value)} placeholder="+44…" /></Field>
            </div>
            <p className="mt-3 text-xs text-ink-faint">For an adult member who is also their own account holder, use the linked adult option above. Existing person records should be selected, not recreated.</p>
          </section>
        )}

        {step === 3 && (
          <section aria-labelledby="sport-tags-title" className="p-4 sm:p-6">
            <div className="mb-5 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><Sparkles className="size-5" /></span><div><h2 id="sport-tags-title" className="font-display text-lg font-bold text-ink">Sport profile & tags</h2><p className="mt-1 text-sm text-ink-muted">Tags help coaches find the right programme. Membership-category tags are labels only—not recurring billing or a payment plan.</p></div></div>
            <div className="space-y-5">{renderTagChoices()}</div>
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-line bg-surface-inset p-3 text-xs leading-relaxed text-ink-muted"><FileText className="mt-0.5 size-4 shrink-0 text-brand-text" /><p>Attendance and session enrolments remain their own operational records. No subscription or auto-pay setup is created here.</p></div>
          </section>
        )}

        {step === 4 && (
          <section aria-labelledby="review-title" className="p-4 sm:p-6">
            <div className="mb-5 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-success-soft text-success"><CheckCircle2 className="size-5" /></span><div><h2 id="review-title" className="font-display text-lg font-bold text-ink">Review & save</h2><p className="mt-1 text-sm text-ink-muted">Check the separate member and customer records before creating them.</p></div></div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-4"><h3 className="text-sm font-bold text-ink">Member profile</h3><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-ink-faint">Name</dt><dd className="text-right font-medium text-ink">{form.name || 'Not set'}{Number.isFinite(age) && ` · ${age}`}</dd></div><div className="flex justify-between gap-3"><dt className="text-ink-faint">Member code</dt><dd className="text-right text-ink">{form.memberCode || 'Not set'}</dd></div><div className="flex justify-between gap-3"><dt className="text-ink-faint">Sport</dt><dd className="text-right text-ink">{form.sport}</dd></div><div className="flex justify-between gap-3"><dt className="text-ink-faint">Playing profile</dt><dd className="text-right text-ink">{[form.handedness === 'R' ? 'Right-handed' : form.handedness === 'L' ? 'Left-handed' : '', form.playingStyle].filter(Boolean).join(' · ') || 'Not set'}</dd></div></dl></Card>
              <Card className="p-4"><h3 className="text-sm font-bold text-ink">Linked customer</h3><p className="mt-3 text-sm font-semibold text-ink">{customerMode === 'existing' ? selectedCustomer?.name ?? 'Choose a customer' : customerMode === 'self' ? form.name || 'Adult member account' : form.customerName || 'Add a customer name'}</p><p className="mt-1 text-xs text-ink-muted">{isMinor ? 'Guardian/customer required for this under-18 member.' : customerMode === 'self' ? 'Customer and member records will be linked as one adult person.' : 'Account holder / responsible adult record.'}</p>{isMinor && <p className="mt-3 text-xs text-ink-muted">Next of kin: {form.nokName || 'Not set'} · {form.nokPhone || 'No phone'}</p>}</Card>
              <Card className="p-4 lg:col-span-2"><h3 className="text-sm font-bold text-ink">Sport tags</h3><div className="mt-3 flex flex-wrap gap-2">{selectedTagLabels.length ? selectedTagLabels.map((label) => <Badge key={label} tone="brand">{label}</Badge>) : <span className="text-sm text-ink-faint">No tags selected</span>}</div></Card>
            </div>
            <div className="mt-4 rounded-xl border border-line bg-surface-inset p-3 text-xs leading-relaxed text-ink-muted"><ShieldCheck className="mr-1.5 inline size-3.5 text-brand-text" />Sensitive support details are not collected here; use the protected, auditable safety workflow if needed.</div>
          </section>
        )}

        <footer className="flex flex-col-reverse gap-2 border-t border-line bg-surface-inset/60 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2 text-xs text-ink-faint"><span>Step {step} of 4</span>{isMinor && <Badge tone="warning">Under 18</Badge>}</div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button intent="ghost" disabled={step === 1 || loading} iconLeft={<ArrowLeft />} onClick={() => { setFieldErrors([]); setStep((current) => Math.max(1, current - 1) as WizardStep); }}>Back</Button>
            {step < 4 ? <Button intent="primary" iconRight={<ArrowRight />} onClick={nextStep}>Continue</Button> : <Button intent="primary" loading={loading} iconLeft={<CheckCircle2 />} onClick={() => void saveMember()}>Save member</Button>}
          </div>
        </footer>
      </Card>

      <p className="sr-only" aria-live="polite">{fieldErrors.length ? fieldErrors.join(' ') : `Step ${step} of 4`}</p>
    </div>
  );
}
