import { cloneElement, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarPlus, CalendarRange, Copy, Layers, Pencil, Play, Plus, RotateCcw,
  Square, Trash2, Undo2, Zap,
} from 'lucide-react';
import {
  describeRecurrence, previewOccurrences, summariseOccurrences, templateCompleteness,
  type Capacity, type Holiday, type RecurrenceRule, type SessionTemplate, type TemplateStaffingSlot,
} from '@mentis/core';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { demoEnabled } from '../lib/demo';
import { cn } from '../lib/cn';
import { PageHeader } from '../components/patterns/page-header';
import {
  Badge, Button, Card, CardContent, CardHeader, ConfirmDialog, DataTable, Dialog,
  DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, Field, Input, Select, Textarea, toast, type Column,
} from '../components/ui';

/* -------------------------------------------------------------------------- */
/* Session blueprints                                                          */
/*                                                                             */
/* The Scheduling screen used to make a recurring session by cloning an        */
/* existing row: the pattern lived in the instances, so "the pattern" was      */
/* whatever the last edit happened to say. This screen inverts that: a         */
/* blueprint (template) is authored once, and one-offs and series are          */
/* instantiated from it. Editing an instance is fine — it is then flagged as   */
/* drifting off the blueprint (and can be re-applied), never silently          */
/* rewriting the pattern.                                                      */
/* -------------------------------------------------------------------------- */

type TemplateRow = {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  description: string | null;
  venue_id: string;
  venue_name: string;
  default_start_time: string;   // 'HH:MM:SS'
  default_end_time: string;
  timezone: string;
  level_band: string | null;
  capacity: number | null;
  min_headcount: number | null;
  default_charge_cents: number | null;
  responsible_coach_id: string | null;
  leading_coach_id: string | null;
  assisting_coach_id: string | null;
  status: 'draft' | 'active' | 'archived';
  version: number;
  tags: string[] | null;
  active_series: number;
  staffing_slots: number;
  roster_size: number;
  upcoming_instances: number;
  drifted_instances: number;
  next_occurrence_at: string | null;
};

type SlotRow = {
  id: string;
  template_id: string;
  capacity: Capacity;
  staff_id: string | null;
  rate_card_id: string | null;
  required: boolean;
  lead_minutes: number;
  trail_minutes: number;
};

type SeriesRow = {
  id: string;
  template_id: string;
  template_name: string;
  label: string;
  venue_id: string;
  venue_name: string;
  starts_on: string;
  ends_on: string;
  status: 'active' | 'paused' | 'ended';
  frequency: RecurrenceRule['frequency'] | null;
  by_weekday: number[] | null;
  template_version: number;
  instance_count: number;
  exception_count: number;
  cancelled_instances: number;
  next_occurrence_at: string | null;
};

type InstanceRow = {
  id: string;
  template_id: string;
  series_id: string | null;
  name: string;
  start_at: string;
  end_at: string;
  status: string;
  occurrence_date: string | null;
  is_exception: boolean;
  overridden_fields: string[] | null;
  blueprint: { version?: number } | null;
};

type VenueRow = { id: string; name: string };
type StaffRow = { id: string; display_name: string };
type MemberRow = { id: string; name: string };
type RateCardRow = { id: string; staff_id: string; label: string; rate_cents: number };
type HolidayRow = { id: string; name: string; kind: string; starts_on: string; ends_on: string };

type RuleDraft = {
  frequency: RecurrenceRule['frequency'];
  intervalCount: number;
  byWeekday: number[];
  startTime: string;
  endTime: string;
  validFrom: string;
  validTo: string;
  horizonDays: number;
  skipTermBreaks: boolean;
  skipBankHolidays: boolean;
  skipManualClosures: boolean;
};

const WEEKDAYS: { iso: number; short: string; label: string }[] = [
  { iso: 1, short: 'Mon', label: 'Monday' },
  { iso: 2, short: 'Tue', label: 'Tuesday' },
  { iso: 3, short: 'Wed', label: 'Wednesday' },
  { iso: 4, short: 'Thu', label: 'Thursday' },
  { iso: 5, short: 'Fri', label: 'Friday' },
  { iso: 6, short: 'Sat', label: 'Saturday' },
  { iso: 7, short: 'Sun', label: 'Sunday' },
];

const today = () => new Date().toISOString().slice(0, 10);
const hhmm = (value?: string | null) => (value ? value.slice(0, 5) : '18:00');
const isoWeekdayOf = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const money = (cents: number) => `£${(cents / 100).toFixed(2)}`;
const dayLabel = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * Default a fresh rule from the blueprint and, when it already runs, from the
 * pattern of its latest series — re-publishing a term should not silently move
 * the session to whatever weekday the next occurrence happens to fall on.
 */
const emptyRule = (template?: TemplateRow | null, fromSeries?: SeriesRow | null): RuleDraft => ({
  frequency: fromSeries?.frequency && fromSeries.frequency !== 'daily' ? fromSeries.frequency : 'weekly',
  intervalCount: 1,
  byWeekday: fromSeries?.by_weekday?.length
    ? [...fromSeries.by_weekday].sort((a, b) => a - b)
    : [isoWeekdayOf(template?.next_occurrence_at?.slice(0, 10) ?? today())],
  startTime: hhmm(template?.default_start_time),
  endTime: hhmm(template?.default_end_time),
  validFrom: today(),
  validTo: '',
  horizonDays: 90,
  skipTermBreaks: true,
  skipBankHolidays: true,
  skipManualClosures: true,
});

/** Core rule object the preview and the RPC both use — one source of truth. */
function toRule(draft: RuleDraft, template: TemplateRow): RecurrenceRule {
  return {
    frequency: draft.frequency,
    intervalCount: Number(draft.intervalCount) || 1,
    byWeekday: draft.frequency === 'daily' ? [] : draft.byWeekday,
    startTime: draft.startTime,
    endTime: draft.endTime,
    timezone: template.timezone || 'Europe/London',
    validFrom: draft.validFrom || today(),
    validTo: draft.validTo || null,
    horizonDays: Number(draft.horizonDays) || 90,
    skipTermBreaks: draft.skipTermBreaks,
    skipBankHolidays: draft.skipBankHolidays,
    skipManualClosures: draft.skipManualClosures,
  };
}

function toCoreTemplate(row: TemplateRow, staffing: SlotRow[], roster: string[]): SessionTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    description: row.description,
    venueId: row.venue_id,
    venueName: row.venue_name,
    levelBand: row.level_band,
    capacity: row.capacity,
    timezone: row.timezone,
    defaultStartTime: hhmm(row.default_start_time),
    defaultEndTime: hhmm(row.default_end_time),
    defaultChargeCents: row.default_charge_cents,
    responsibleCoachId: row.responsible_coach_id,
    leadingCoachId: row.leading_coach_id,
    assistingCoachId: row.assisting_coach_id,
    status: row.status,
    version: row.version,
    tags: row.tags ?? [],
    staffing: staffing.map((s) => ({
      capacity: s.capacity,
      staffId: s.staff_id,
      rateCardId: s.rate_card_id,
      required: s.required,
      leadMinutes: s.lead_minutes,
      trailMinutes: s.trail_minutes,
    })),
    rosterMemberIds: roster,
  };
}

/* -------------------------------------------------------------------------- */
/* Demo data (no backend)                                                      */
/* -------------------------------------------------------------------------- */

function demoData() {
  const venueId = 'demo-venue';
  const coachId = 'demo-coach';
  const templates: TemplateRow[] = [{
    id: 'demo-tpl', organization_id: 'demo-org', name: 'U13 Development', code: 'U13-MON',
    description: 'Monday-night development squad for under-13s.',
    venue_id: venueId, venue_name: 'Kingfisher Hall A',
    default_start_time: '18:00:00', default_end_time: '19:30:00', timezone: 'Europe/London',
    level_band: 'U13', capacity: 16, min_headcount: 6, default_charge_cents: 1200,
    responsible_coach_id: coachId, leading_coach_id: coachId, assisting_coach_id: null,
    status: 'active', version: 3, tags: ['squad', 'term-time'], active_series: 1,
    staffing_slots: 2, roster_size: 12, upcoming_instances: 9, drifted_instances: 1,
    next_occurrence_at: `${today().slice(0, 8)}15T18:00:00Z`,
  }];
  const slots: SlotRow[] = [
    { id: 'demo-slot-1', template_id: 'demo-tpl', capacity: 'lead', staff_id: coachId, rate_card_id: 'demo-rc', required: true, lead_minutes: 15, trail_minutes: 0 },
    { id: 'demo-slot-2', template_id: 'demo-tpl', capacity: 'sparrer', staff_id: null, rate_card_id: null, required: false, lead_minutes: 0, trail_minutes: 0 },
  ];
  const series: SeriesRow[] = [{
    id: 'demo-series', template_id: 'demo-tpl', template_name: 'U13 Development', label: 'Spring term Mondays',
    venue_id: venueId, venue_name: 'Kingfisher Hall A', starts_on: today(), ends_on: `${today().slice(0, 4)}-12-31`,
    status: 'active', frequency: 'weekly', by_weekday: [1], template_version: 3,
    instance_count: 10, exception_count: 1, cancelled_instances: 0,
    next_occurrence_at: `${today().slice(0, 8)}15T18:00:00Z`,
  }];
  const instances: InstanceRow[] = [
    { id: 'demo-i-1', template_id: 'demo-tpl', series_id: 'demo-series', name: 'U13 Development', start_at: `${today().slice(0, 8)}15T18:00:00Z`, end_at: `${today().slice(0, 8)}15T19:30:00Z`, status: 'scheduled', occurrence_date: `${today().slice(0, 8)}15`, is_exception: true, overridden_fields: ['start_at'], blueprint: { version: 3 } },
    { id: 'demo-i-2', template_id: 'demo-tpl', series_id: 'demo-series', name: 'U13 Development', start_at: new Date(Date.now() + 7 * 86400000).toISOString(), end_at: new Date(Date.now() + 7 * 86400000 + 5400000).toISOString(), status: 'scheduled', occurrence_date: null, is_exception: false, overridden_fields: [], blueprint: { version: 3 } },
  ];
  return {
    templates, slots, series, instances,
    venues: [{ id: venueId, name: 'Kingfisher Hall A' }] as VenueRow[],
    staff: [{ id: coachId, display_name: 'Sam Coach' }, { id: 'demo-coach-2', display_name: 'Ada Assistant' }] as StaffRow[],
    members: [{ id: 'demo-m1', name: 'Aarav Patel' }, { id: 'demo-m2', name: 'Mia Chen' }] as MemberRow[],
    rateCards: [{ id: 'demo-rc', staff_id: coachId, label: 'standard', rate_cents: 2400 }] as RateCardRow[],
    holidays: [
      { id: 'demo-h1', name: 'February half-term', kind: 'term_break', starts_on: '2026-02-16', ends_on: '2026-02-20' },
      { id: 'demo-h2', name: 'Early May bank holiday', kind: 'bank_holiday', starts_on: '2026-05-04', ends_on: '2026-05-04' },
    ] as HolidayRow[],
  };
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                  */
/* -------------------------------------------------------------------------- */

export function SessionTemplates() {
  const { staff, canDo } = useAuth();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [roster, setRoster] = useState<{ template_id: string; member_id: string }[]>([]);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [rateCards, setRateCards] = useState<RateCardRow[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(!demoEnabled);
  const [saving, setSaving] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [form, setForm] = useState({
    name: '', code: '', description: '', venue_id: '', start_time: '18:00', end_time: '19:30',
    timezone: 'Europe/London', level_band: '', capacity: '', charge: '',
    responsible_coach_id: '', leading_coach_id: '', assisting_coach_id: '', status: 'active' as TemplateRow['status'],
    tags: '',
  });
  const [formSlots, setFormSlots] = useState<TemplateStaffingSlot[]>([]);
  const [formRoster, setFormRoster] = useState<string[]>([]);

  const [publishOpen, setPublishOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(emptyRule());
  const [oneOffOpen, setOneOffOpen] = useState(false);
  const [oneOff, setOneOff] = useState({ start: '', venue_id: '', name: '' });
  const [archiveTarget, setArchiveTarget] = useState<TemplateRow | null>(null);
  const [endTarget, setEndTarget] = useState<SeriesRow | null>(null);

  const canManage = canDo('sessions.manage');

  /* ---------------------------------------------------------------- loading */
  const load = async () => {
    if (demoEnabled) return;
    if (!staff?.organization_id) return;
    setLoading(true);
    const orgId = staff.organization_id;
    const [templateRes, seriesRes, instanceRes, venueRes, staffRes, memberRes, cardRes, holidayRes, slotRes, rosterRes] = await Promise.all([
      supabase.from('session_template_overview').select('*').eq('organization_id', orgId).order('name'),
      supabase.from('session_series_overview').select('*').eq('organization_id', orgId).order('starts_on', { ascending: false }),
      supabase.from('mentis_sessions')
        .select('id,template_id,series_id,name,start_at,end_at,status,occurrence_date,is_exception,overridden_fields,blueprint')
        .eq('organization_id', orgId).not('template_id', 'is', null).order('start_at').limit(300),
      supabase.from('mentis_venues').select('id,name').eq('organization_id', orgId).order('name'),
      supabase.from('mentis_staff').select('id,display_name').eq('organization_id', orgId).order('display_name'),
      supabase.from('mentis_members').select('id,name').eq('organization_id', orgId).order('name').limit(400),
      supabase.from('mentis_rate_cards').select('id,staff_id,label,rate_cents').eq('organization_id', orgId),
      supabase.from('mentis_holiday_calendar').select('id,name,kind,starts_on,ends_on').eq('organization_id', orgId).order('starts_on'),
      supabase.from('mentis_session_template_staffing').select('*'),
      supabase.from('mentis_session_template_members').select('template_id,member_id'),
    ]);
    setTemplates((templateRes.data ?? []) as TemplateRow[]);
    setSeries((seriesRes.data ?? []) as unknown as SeriesRow[]);
    setInstances((instanceRes.data ?? []) as InstanceRow[]);
    setVenues((venueRes.data ?? []) as VenueRow[]);
    setStaffList((staffRes.data ?? []) as StaffRow[]);
    setMembers((memberRes.data ?? []) as MemberRow[]);
    setRateCards((cardRes.data ?? []) as RateCardRow[]);
    setHolidays((holidayRes.data ?? []) as HolidayRow[]);
    setSlots((slotRes.data ?? []) as SlotRow[]);
    setRoster((rosterRes.data ?? []) as { template_id: string; member_id: string }[]);
    setLoading(false);
  };

  useEffect(() => {
    if (demoEnabled) {
      const d = demoData();
      setTemplates(d.templates); setSlots(d.slots); setSeries(d.series); setInstances(d.instances);
      setVenues(d.venues); setStaffList(d.staff); setMembers(d.members); setRateCards(d.rateCards);
      setHolidays(d.holidays); setLoading(false);
      return;
    }
    if (staff?.organization_id) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff?.organization_id]);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? templates[0] ?? null,
    [templates, selectedId],
  );
  const slotsFor = (templateId?: string) => slots.filter((s) => s.template_id === templateId);
  const rosterFor = (templateId?: string) => roster.filter((r) => r.template_id === templateId).map((r) => r.member_id);
  const seriesFor = (templateId?: string) => series.filter((s) => s.template_id === templateId);
  const latestSeriesFor = (templateId?: string) =>
    [...seriesFor(templateId)].sort((a, b) => (b.starts_on ?? '').localeCompare(a.starts_on ?? ''))[0] ?? null;
  const newRuleFor = (template: TemplateRow) => {
    setRuleDraft(emptyRule(template, latestSeriesFor(template.id)));
    setPublishOpen(true);
  };
  const instancesFor = (templateId?: string) => instances.filter((i) => i.template_id === templateId);

  const coreTemplate = useMemo(
    () => (selected ? toCoreTemplate(selected, slotsFor(selected.id), rosterFor(selected.id)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, slots, roster],
  );

  const coreHolidays: Holiday[] = useMemo(
    () => holidays.map((h) => ({ name: h.name, kind: h.kind as Holiday['kind'], startsOn: h.starts_on, endsOn: h.ends_on })),
    [holidays],
  );

  /* ----------------------------------------------------------- preview maths */
  const preview = useMemo(() => {
    if (!selected) return { occurrences: [], summary: null, rule: null as RecurrenceRule | null };
    const rule = toRule(ruleDraft, selected);
    const occurrences = previewOccurrences(rule, coreHolidays);
    return { occurrences, summary: summariseOccurrences(occurrences), rule };
  }, [ruleDraft, selected, coreHolidays]);

  const existingDates = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(instancesFor(selected.id).map((i) => i.occurrence_date).filter(Boolean) as string[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, selected]);

  const previewNew = preview.occurrences.filter((o) => o.action === 'generate' && !existingDates.has(o.date));

  /* ---------------------------------------------------------------- actions */
  const openEditor = (template?: TemplateRow | null) => {
    setEditing(template ?? null);
    const staffing = template ? slotsFor(template.id) : [];
    setFormSlots(template ? staffing.map((s) => ({
      capacity: s.capacity, staffId: s.staff_id, rateCardId: s.rate_card_id,
      required: s.required, leadMinutes: s.lead_minutes, trailMinutes: s.trail_minutes,
    })) : [{ capacity: 'lead', staffId: null, rateCardId: null, required: true, leadMinutes: 15, trailMinutes: 0 }]);
    setFormRoster(template ? rosterFor(template.id) : []);
    setForm({
      name: template?.name ?? '',
      code: template?.code ?? '',
      description: template?.description ?? '',
      venue_id: template?.venue_id ?? '',
      start_time: hhmm(template?.default_start_time),
      end_time: hhmm(template?.default_end_time),
      timezone: template?.timezone ?? 'Europe/London',
      level_band: template?.level_band ?? '',
      capacity: template?.capacity != null ? String(template.capacity) : '',
      charge: template?.default_charge_cents != null ? (template.default_charge_cents / 100).toFixed(2) : '',
      responsible_coach_id: template?.responsible_coach_id ?? '',
      leading_coach_id: template?.leading_coach_id ?? '',
      assisting_coach_id: template?.assisting_coach_id ?? '',
      status: template?.status ?? 'active',
      tags: (template?.tags ?? []).join(', '),
    });
    setEditorOpen(true);
  };

  const draftTemplate = useMemo((): Partial<SessionTemplate> => ({
    name: form.name,
    venueId: form.venue_id,
    defaultStartTime: form.start_time,
    defaultEndTime: form.end_time,
    timezone: form.timezone,
    capacity: form.capacity ? Number(form.capacity) : null,
    leadingCoachId: form.leading_coach_id || null,
    responsibleCoachId: form.responsible_coach_id || null,
    staffing: formSlots,
  }), [form, formSlots]);

  const draftProblems = templateCompleteness(draftTemplate);

  const saveTemplate = async () => {
    if (!staff?.organization_id || draftProblems.length) return;
    setSaving(true);
    const payload = {
      organization_id: staff.organization_id,
      name: form.name.trim(),
      code: form.code.trim() || null,
      description: form.description.trim() || null,
      venue_id: form.venue_id,
      default_start_time: form.start_time,
      default_end_time: form.end_time,
      timezone: form.timezone,
      level_band: form.level_band.trim() || null,
      capacity: form.capacity ? Number(form.capacity) : null,
      default_charge_cents: form.charge ? Math.round(Number(form.charge) * 100) : null,
      responsible_coach_id: form.responsible_coach_id || null,
      leading_coach_id: form.leading_coach_id || null,
      assisting_coach_id: form.assisting_coach_id || null,
      status: form.status,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };

    if (demoEnabled) {
      const id = editing?.id ?? `demo-${Date.now()}`;
      const row: TemplateRow = {
        ...(editing ?? ({} as TemplateRow)), ...payload,
        id, venue_name: venues.find((v) => v.id === payload.venue_id)?.name ?? '',
        version: (editing?.version ?? 0) + 1, active_series: editing?.active_series ?? 0,
        staffing_slots: formSlots.length, roster_size: formRoster.length,
        upcoming_instances: editing?.upcoming_instances ?? 0, drifted_instances: editing?.drifted_instances ?? 0,
        next_occurrence_at: editing?.next_occurrence_at ?? null,
        min_headcount: null, tags: payload.tags,
      } as TemplateRow;
      setTemplates((prev) => (editing ? prev.map((t) => (t.id === id ? row : t)) : [...prev, row]));
      setSlots((prev) => [...prev.filter((s) => s.template_id !== id), ...formSlots.map((s, i) => ({
        id: `${id}-slot-${i}`, template_id: id, capacity: s.capacity, staff_id: s.staffId ?? null,
        rate_card_id: s.rateCardId ?? null, required: s.required, lead_minutes: s.leadMinutes, trail_minutes: s.trailMinutes,
      }))]);
      setRoster((prev) => [...prev.filter((r) => r.template_id !== id), ...formRoster.map((m) => ({ template_id: id, member_id: m }))]);
      setSelectedId(id);
      setEditorOpen(false);
      setSaving(false);
      toast.success(editing ? 'Blueprint updated' : 'Blueprint created');
      return;
    }

    const { data, error } = editing
      ? await supabase.from('mentis_session_templates').update(payload).eq('id', editing.id).select('id').single()
      : await supabase.from('mentis_session_templates').insert({ ...payload, created_by: staff.user_id }).select('id').single();
    if (error || !data) {
      setSaving(false);
      toast.error(error?.message ?? 'The blueprint could not be saved.');
      return;
    }
    const templateId = data.id as string;

    await supabase.from('mentis_session_template_staffing').delete().eq('template_id', templateId);
    if (formSlots.length) {
      const { error: slotError } = await supabase.from('mentis_session_template_staffing').insert(
        formSlots.map((s) => ({
          template_id: templateId, capacity: s.capacity, staff_id: s.staffId || null,
          rate_card_id: s.rateCardId || null, required: s.required ?? true,
          lead_minutes: s.leadMinutes ?? 0, trail_minutes: s.trailMinutes ?? 0,
        })),
      );
      if (slotError) toast.error(`Blueprint saved, staffing plan failed: ${slotError.message}`);
    }
    await supabase.from('mentis_session_template_members').delete().eq('template_id', templateId);
    if (formRoster.length) {
      await supabase.from('mentis_session_template_members').insert(
        formRoster.map((memberId) => ({ template_id: templateId, member_id: memberId })),
      );
    }
    setSaving(false);
    setSelectedId(templateId);
    setEditorOpen(false);
    toast.success(editing ? 'Blueprint updated' : 'Blueprint created', {
      description: 'Sessions you schedule from it will carry this version.',
    });
    await load();
  };

  const publishSeries = async () => {
    if (!selected) return;
    setSaving(true);
    const rule = toRule(ruleDraft, selected);
    const payload = {
      frequency: rule.frequency,
      interval_count: rule.intervalCount,
      by_weekday: rule.byWeekday,
      start_time: rule.startTime,
      end_time: rule.endTime,
      timezone: rule.timezone,
      valid_from: rule.validFrom,
      valid_to: rule.validTo,
      horizon_days: rule.horizonDays,
      skip_term_breaks: rule.skipTermBreaks,
      skip_bank_holidays: rule.skipBankHolidays,
      skip_manual_closures: rule.skipManualClosures,
    };

    if (demoEnabled) {
      const id = `demo-series-${Date.now()}`;
      setSeries((prev) => [{
        id, template_id: selected.id, template_name: selected.name, label: selected.name,
        venue_id: selected.venue_id, venue_name: selected.venue_name, starts_on: rule.validFrom,
        ends_on: rule.validTo ?? rule.validFrom, status: 'active', frequency: rule.frequency,
        by_weekday: rule.byWeekday, template_version: selected.version,
        instance_count: previewNew.length, exception_count: 0, cancelled_instances: 0,
        next_occurrence_at: previewNew[0]?.startsAt ?? null,
      }, ...prev]);
      setPublishOpen(false);
      setSaving(false);
      toast.success(`${previewNew.length} instances created from the blueprint`);
      return;
    }

    const { data, error } = await supabase.rpc('instantiate_session_series', {
      p_template_id: selected.id,
      p_rule: payload,
      // created_by references auth.users, so pass the auth id, not the staff row id
      p_options: { created_by: staff?.user_id ?? null },
    });
    setSaving(false);
    if (error) {
      toast.error('The series could not be published', { description: error.message });
      return;
    }
    const result = data as any;
    setPublishOpen(false);
    toast.success(`${result?.generated ?? 0} instances published`, {
      description: [
        result?.skipped_term_holidays ? `${result.skipped_term_holidays} term-break dates skipped` : null,
        result?.skipped_bank_holidays ? `${result.skipped_bank_holidays} bank holidays skipped` : null,
        result?.skipped_existing ? `${result.skipped_existing} already existed` : null,
        result?.conflicts?.length ? `${result.conflicts.length} slot(s) blocked — see the series` : null,
      ].filter(Boolean).join(' · ') || undefined,
    });
    await load();
  };

  const addOneOff = async () => {
    if (!selected || !oneOff.start) return;
    setSaving(true);
    const startAt = new Date(oneOff.start).toISOString();
    if (demoEnabled) {
      const id = `demo-oneoff-${Date.now()}`;
      setInstances((prev) => [{
        id, template_id: selected.id, series_id: null, name: oneOff.name || selected.name,
        start_at: startAt, end_at: new Date(Date.parse(startAt) + 5400000).toISOString(),
        status: 'scheduled', occurrence_date: startAt.slice(0, 10), is_exception: false,
        overridden_fields: [], blueprint: { version: selected.version },
      }, ...prev]);
      setOneOffOpen(false);
      setSaving(false);
      toast.success('One-off session created from the blueprint');
      return;
    }
    const { data, error } = await supabase.rpc('instantiate_session', {
      p_template_id: selected.id,
      p_start_at: startAt,
      p_options: {
        name: oneOff.name || null,
        venue_id: oneOff.venue_id || null,
        created_by: staff?.user_id ?? null,
      },
    });
    setSaving(false);
    if (error) {
      toast.error('The session could not be created', { description: error.message });
      return;
    }
    const warnings = (data as any)?.warnings ?? [];
    setOneOffOpen(false);
    toast.success('One-off session created from the blueprint', {
      description: warnings.length ? warnings.map((w: any) => w.message).join(' · ') : 'Staffing and roster applied.',
    });
    await load();
  };

  const extendSeries = async (row: SeriesRow) => {
    if (demoEnabled) { toast.info('Demo mode — nothing to extend.'); return; }
    const { data, error } = await supabase.rpc('extend_session_series', { p_series_id: row.id, p_options: {} });
    if (error) { toast.error('The series could not be extended', { description: error.message }); return; }
    const generated = (data as any)?.generated ?? 0;
    toast.success(generated ? `${generated} more instances materialised` : 'Already up to date');
    await load();
  };

  const setSeriesStatus = async (row: SeriesRow, status: SeriesRow['status'], cancelFuture = false) => {
    if (demoEnabled) {
      setSeries((prev) => prev.map((s) => (s.id === row.id ? { ...s, status } : s)));
      toast.success(`Series ${status}`);
      return;
    }
    const { data, error } = await supabase.rpc('set_session_series_status', {
      p_series_id: row.id, p_status: status, p_cancel_future: cancelFuture, p_reason: null,
    });
    if (error) { toast.error('The series could not be updated', { description: error.message }); return; }
    const cancelled = (data as any)?.cancelled_instances ?? 0;
    toast.success(`Series ${status}`, { description: cancelled ? `${cancelled} future instances cancelled` : undefined });
    await load();
  };

  const reapplyBlueprint = async (instance: InstanceRow) => {
    if (demoEnabled) {
      setInstances((prev) => prev.map((i) => (i.id === instance.id ? { ...i, is_exception: false, overridden_fields: [] } : i)));
      toast.success('Instance restored from the blueprint');
      return;
    }
    const { data, error } = await supabase.rpc('apply_blueprint_to_session', {
      p_session_id: instance.id, p_fields: null, p_source: 'blueprint',
    });
    if (error) { toast.error('The blueprint could not be re-applied', { description: error.message }); return; }
    toast.success('Instance restored from the blueprint', {
      description: ((data as any)?.applied ?? []).length ? `Restored: ${(data as any).applied.join(', ')}` : undefined,
    });
    await load();
  };

  const archiveTemplate = async (row: TemplateRow) => {
    if (demoEnabled) { setTemplates((prev) => prev.filter((t) => t.id !== row.id)); return; }
    const { error } = await supabase.from('mentis_session_templates').update({ status: 'archived' }).eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Blueprint archived', { description: 'Existing instances and series keep running.' });
    await load();
  };

  /* --------------------------------------------------------------- columns */
  const seriesColumns: Column<SeriesRow>[] = [
    {
      key: 'label', header: 'Series',
      cell: (s) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink">{s.label}</div>
          <div className="text-xs text-ink-muted">
            {s.frequency ? describeRecurrence({
              frequency: s.frequency, intervalCount: 1, byWeekday: s.by_weekday ?? [],
              startTime: '00:00', endTime: '00:00', timezone: '', validFrom: s.starts_on,
              validTo: s.ends_on, horizonDays: 0, skipTermBreaks: false, skipBankHolidays: false, skipManualClosures: false,
            }).split(',')[0] : 'Pattern'}
            {' · '}{s.instance_count} instances
          </div>
        </div>
      ),
      sortValue: (s) => s.label,
    },
    {
      key: 'status', header: 'Status', width: 'w-28',
      cell: (s) => (
        <Badge tone={s.status === 'active' ? 'success' : s.status === 'paused' ? 'warning' : 'neutral'} dot>
          {s.status}
        </Badge>
      ),
    },
    {
      key: 'next', header: 'Next', hideBelow: 'md',
      cell: (s) => <span className="text-xs text-ink-muted">{dayLabel(s.next_occurrence_at)}</span>,
    },
    {
      key: 'drift', header: 'Off blueprint', width: 'w-32', hideBelow: 'lg',
      cell: (s) => s.exception_count
        ? <Badge tone="info">{s.exception_count} edited</Badge>
        : <span className="text-xs text-ink-faint">in sync</span>,
    },
    {
      key: 'actions', header: '', align: 'right', width: 'w-56',
      cell: (s) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" intent="ghost" onClick={() => void extendSeries(s)} title="Materialise more occurrences up to the horizon">
            <Zap className="size-3.5" /> Extend
          </Button>
          {s.status === 'active' ? (
            <Button size="sm" intent="ghost" onClick={() => void setSeriesStatus(s, 'paused')}>
              <Square className="size-3.5" /> Pause
            </Button>
          ) : s.status === 'paused' ? (
            <Button size="sm" intent="ghost" onClick={() => void setSeriesStatus(s, 'active')}>
              <Play className="size-3.5" /> Resume
            </Button>
          ) : null}
          {s.status !== 'ended' && (
            <Button size="sm" intent="ghost" onClick={() => setEndTarget(s)}>
              <Trash2 className="size-3.5" /> End
            </Button>
          )}
        </div>
      ),
    },
  ];

  const instanceColumns: Column<InstanceRow>[] = [
    {
      key: 'when', header: 'Instance',
      cell: (i) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{i.name}</div>
          <div className="text-xs text-ink-muted">{dayLabel(i.start_at)}</div>
        </div>
      ),
      sortValue: (i) => i.start_at,
    },
    {
      key: 'source', header: 'Came from', hideBelow: 'md',
      cell: (i) => (
        <span className="text-xs text-ink-muted">
          {i.series_id ? 'Series run' : 'One-off'} · blueprint v{i.blueprint?.version ?? '—'}
        </span>
      ),
    },
    {
      key: 'state', header: 'State', width: 'w-44',
      cell: (i) => i.is_exception ? (
        <Badge tone="info" icon={<Undo2 className="size-3" />}>
          {(i.overridden_fields ?? []).length} field(s) off blueprint
        </Badge>
      ) : (
        <Badge tone="neutral">mirrors blueprint</Badge>
      ),
    },
    {
      key: 'actions', header: '', align: 'right', width: 'w-40',
      cell: (i) => (
        <div className="flex justify-end gap-1">
          {i.is_exception && (
            <Button size="sm" intent="ghost" onClick={() => void reapplyBlueprint(i)}>
              <RotateCcw className="size-3.5" /> Re-apply
            </Button>
          )}
          <Link to="/sessions" className="btn btn-ghost btn-sm">Open</Link>
        </div>
      ),
    },
  ];

  /* ----------------------------------------------------------------- render */
  if (!canManage) {
    return (
      <div className="p-8">
        <EmptyState
          icon={Layers}
          tone="warning"
          title="Blueprints are an admin tool"
          description="Ask an admin or super admin to author session blueprints for the organisation."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Session blueprints"
        eyebrow="Scheduling"
        subtitle="A blueprint describes the session — staff, roster, slot. One-offs and recurring runs are instances of it."
        breadcrumbs={[{ label: 'Scheduling', to: '/scheduling' }, { label: 'Blueprints' }]}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/scheduling" className="btn btn-ghost btn-sm">Weekly patterns</Link>
            <Button onClick={() => openEditor(null)} disabled={!canManage}>
              <Plus className="size-4" /> New blueprint
            </Button>
          </div>
        }
      />

      {!loading && !templates.length ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Layers}
              tone="brand"
              title="No blueprints yet"
              description="Author the session once — venue, times, coaches, staffing slots, default roster — then publish a term of recurring sessions from it. Editing a single instance later never rewrites the blueprint."
              action={<Button onClick={() => openEditor(null)}><Plus className="size-4" /> New blueprint</Button>}
              footnote={<span>Existing weekly patterns were imported as blueprints automatically — check <Link to="/scheduling" className="underline">Scheduling</Link>.</span>}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          {/* Blueprint rail */}
          <div className="space-y-2">
            {templates.map((t) => {
              const active = selected?.id === t.id;
              return (
                <Card
                  key={t.id}
                  interactive
                  variant={active ? 'brand' : 'default'}
                  pad="sm"
                  onClick={() => setSelectedId(t.id)}
                  className={cn('transition', active && 'ring-1 ring-brand')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-ink">{t.name}</span>
                        {t.status !== 'active' && <Badge tone="neutral">{t.status}</Badge>}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-ink-muted">
                        {t.venue_name} · {hhmm(t.default_start_time)}–{hhmm(t.default_end_time)}
                        {t.level_band ? ` · ${t.level_band}` : ''}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone="outline">v{t.version}</Badge>
                        {t.active_series > 0 && <Badge tone="success" dot>{t.active_series} active series</Badge>}
                        {t.upcoming_instances > 0 && <Badge tone="info">{t.upcoming_instances} upcoming</Badge>}
                        {t.drifted_instances > 0 && (
                          <Badge tone="warning" title="Instances edited away from the blueprint">
                            {t.drifted_instances} off blueprint
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openEditor(t); }} title="Edit blueprint">
                        <Pencil className="size-3.5" />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setArchiveTarget(t); }} title="Archive blueprint">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  {t.next_occurrence_at && (
                    <div className="mt-2 text-2xs text-ink-faint">Next: {dayLabel(t.next_occurrence_at)}</div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Blueprint detail */}
          {selected && coreTemplate && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-lg font-bold text-ink">{selected.name}</h2>
                      {selected.code && <Badge tone="outline">{selected.code}</Badge>}
                      <Badge tone={selected.status === 'active' ? 'success' : 'neutral'} dot>{selected.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">
                      {selected.description || 'The blueprint every instance of this session is copied from.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button intent="secondary" onClick={() => { setOneOff({ start: '', venue_id: '', name: '' }); setOneOffOpen(true); }}>
                      <CalendarPlus className="size-4" /> One-off
                    </Button>
                    <Button
                      onClick={() => newRuleFor(selected)}
                      disabled={selected.status === 'archived'}
                    >
                      <CalendarRange className="size-4" /> Publish series
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Fact label="Venue" value={selected.venue_name} />
                    <Fact label="Default slot" value={`${hhmm(selected.default_start_time)}–${hhmm(selected.default_end_time)} ${selected.timezone.split('/')[1] ?? ''}`} />
                    <Fact label="Level / capacity" value={[selected.level_band, selected.capacity ? `${selected.capacity} places` : null].filter(Boolean).join(' · ') || '—'} />
                    <Fact label="Charge" value={selected.default_charge_cents != null ? money(selected.default_charge_cents) : '—'} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Coaches</h3>
                      <ul className="space-y-1 text-sm text-ink">
                        <li>Responsible: <strong>{nameOf(staffList, selected.responsible_coach_id)}</strong></li>
                        <li>Leading: <strong>{nameOf(staffList, selected.leading_coach_id)}</strong></li>
                        <li>Assisting: <strong>{nameOf(staffList, selected.assisting_coach_id)}</strong></li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Staffing plan</h3>
                      <ul className="space-y-1 text-sm text-ink">
                        {slotsFor(selected.id).length ? slotsFor(selected.id).map((s) => (
                          <li key={s.id} className="flex items-center gap-2">
                            <Badge tone={s.capacity === 'lead' ? 'brand' : s.capacity === 'assistant' ? 'info' : 'neutral'}>{s.capacity}</Badge>
                            <span className="truncate">{s.staff_id ? nameOf(staffList, s.staff_id) : 'open slot'}</span>
                            {(s.lead_minutes > 0 || s.trail_minutes > 0) && (
                              <span className="text-xs text-ink-faint">
                                {s.lead_minutes ? `−${s.lead_minutes}m` : ''}{s.trail_minutes ? ` +${s.trail_minutes}m` : ''}
                              </span>
                            )}
                          </li>
                        )) : <li className="text-ink-faint">No slots — coaches come from the defaults.</li>}
                      </ul>
                    </div>
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Default roster</h3>
                      <ul className="space-y-1 text-sm text-ink">
                        {rosterFor(selected.id).length
                          ? rosterFor(selected.id).slice(0, 6).map((id) => <li key={id} className="truncate">{nameOf(members, id)}</li>)
                          : <li className="text-ink-faint">Empty — instances start with no enrolments.</li>}
                        {rosterFor(selected.id).length > 6 && (
                          <li className="text-xs text-ink-faint">+{rosterFor(selected.id).length - 6} more</li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {templateCompleteness(coreTemplate).length > 0 && (
                    <div className="rounded-md border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
                      <strong className="font-semibold">Before this blueprint can publish:</strong>
                      <ul className="mt-1 list-disc pl-5">
                        {templateCompleteness(coreTemplate).map((p) => <li key={p}>{p}</li>)}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <h3 className="font-semibold text-ink">Series</h3>
                    <p className="text-xs text-ink-muted">A series is a published run of the blueprint — extend, pause or end it without touching the blueprint.</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <DataTable
                    data={seriesFor(selected.id)}
                    columns={seriesColumns}
                    rowKey={(s) => s.id}
                    animateRows
                    empty={
                      <EmptyState
                        icon={CalendarRange}
                        title="No series yet"
                        description="Publish a recurring run from this blueprint, or add a single one-off session."
                        action={<Button onClick={() => newRuleFor(selected)}>Publish series</Button>}
                      />
                    }
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <h3 className="font-semibold text-ink">Instances</h3>
                    <p className="text-xs text-ink-muted">Every row here is a real session with its own register, diary entry and invoices.</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <DataTable
                    data={instancesFor(selected.id).slice(0, 40)}
                    columns={instanceColumns}
                    rowKey={(i) => i.id}
                    defaultSort={{ key: 'when', direction: 'asc' }}
                    empty={
                      <EmptyState icon={Layers} title="Nothing scheduled yet" description="Publish a series or add a one-off — instances keep their own attendance and billing." />
                    }
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit blueprint' : 'New blueprint'}</DialogTitle>
            <DialogDescription>
              What a session of this kind is. Material edits bump the version, so instances stay traceable to what they came from.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Fielded label="Name" required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="U13 Development" />
              </Fielded>
              <Fielded label="Code" hint="Short handle used in exports">
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="U13-MON" />
              </Fielded>
              <Fielded label="Venue" required>
                <Select value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })}>
                  <option value="">Choose a venue…</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
              </Fielded>
              <Fielded label="Status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TemplateRow['status'] })}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </Select>
              </Fielded>
              <Fielded label="Default start" required>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </Fielded>
              <Fielded label="Default end" required>
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </Fielded>
              <Fielded label="Level band">
                <Input value={form.level_band} onChange={(e) => setForm({ ...form, level_band: e.target.value })} placeholder="U13" />
              </Fielded>
              <Fielded label="Capacity">
                <Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="16" />
              </Fielded>
              <Fielded label="Charge per session (£)">
                <Input value={form.charge} onChange={(e) => setForm({ ...form, charge: e.target.value })} placeholder="12.00" />
              </Fielded>
              <Fielded label="Time zone">
                <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
              </Fielded>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Fielded label="Responsible coach">
                <Select value={form.responsible_coach_id} onChange={(e) => setForm({ ...form, responsible_coach_id: e.target.value })}>
                  <option value="">—</option>
                  {staffList.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                </Select>
              </Fielded>
              <Fielded label="Leading coach">
                <Select value={form.leading_coach_id} onChange={(e) => setForm({ ...form, leading_coach_id: e.target.value })}>
                  <option value="">—</option>
                  {staffList.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                </Select>
              </Fielded>
              <Fielded label="Assisting coach">
                <Select value={form.assisting_coach_id} onChange={(e) => setForm({ ...form, assisting_coach_id: e.target.value })}>
                  <option value="">—</option>
                  {staffList.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                </Select>
              </Fielded>
            </div>

            <Fielded label="Description">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="What this session is for, who it is for." />
            </Fielded>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-ink">Staffing plan</h4>
                <Button
                  size="sm" intent="ghost"
                  onClick={() => setFormSlots([...formSlots, { capacity: 'assistant', staffId: null, rateCardId: null, required: true, leadMinutes: 0, trailMinutes: 0 }])}
                >
                  <Plus className="size-3.5" /> Add slot
                </Button>
              </div>
              <div className="space-y-2">
                {formSlots.length === 0 && <p className="text-xs text-ink-faint">No slots: instances take the default coaches above.</p>}
                {formSlots.map((slot, index) => (
                  <div key={index} className="grid items-end gap-2 rounded-md border border-line p-2 md:grid-cols-[120px_1fr_1fr_90px_90px_40px]">
                    <Fielded label="Role">
                      <Select value={slot.capacity} onChange={(e) => {
                        const next = [...formSlots]; next[index] = { ...slot, capacity: e.target.value as Capacity }; setFormSlots(next);
                      }}>
                        <option value="lead">Lead</option>
                        <option value="assistant">Assistant</option>
                        <option value="sparrer">Sparrer</option>
                      </Select>
                    </Fielded>
                    <Fielded label="Coach" hint="blank = open slot">
                      <Select value={slot.staffId ?? ''} onChange={(e) => {
                        const next = [...formSlots]; next[index] = { ...slot, staffId: e.target.value || null }; setFormSlots(next);
                      }}>
                        <option value="">Open slot</option>
                        {staffList.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                      </Select>
                    </Fielded>
                    <Fielded label="Rate card">
                      <Select value={slot.rateCardId ?? ''} onChange={(e) => {
                        const next = [...formSlots]; next[index] = { ...slot, rateCardId: e.target.value || null }; setFormSlots(next);
                      }}>
                        <option value="">Latest valid card</option>
                        {rateCards
                          .filter((c) => !slot.staffId || c.staff_id === slot.staffId)
                          .map((c) => <option key={c.id} value={c.id}>{c.label} · {money(c.rate_cents)}/h</option>)}
                      </Select>
                    </Fielded>
                    <Fielded label="Lead-in (min)">
                      <Input type="number" min={0} value={slot.leadMinutes} onChange={(e) => {
                        const next = [...formSlots]; next[index] = { ...slot, leadMinutes: Number(e.target.value) }; setFormSlots(next);
                      }} />
                    </Fielded>
                    <Fielded label="Trail (min)">
                      <Input type="number" min={0} value={slot.trailMinutes} onChange={(e) => {
                        const next = [...formSlots]; next[index] = { ...slot, trailMinutes: Number(e.target.value) }; setFormSlots(next);
                      }} />
                    </Fielded>
                    <button className="btn btn-ghost btn-sm" onClick={() => setFormSlots(formSlots.filter((_, i) => i !== index))} title="Remove slot">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-ink">Default roster</h4>
                <span className="text-xs text-ink-muted">{formRoster.length} member(s) enrolled into every instance</span>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border border-line p-2">
                <div className="grid gap-1 sm:grid-cols-2">
                  {members.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={formRoster.includes(m.id)}
                        onChange={(e) => setFormRoster(e.target.checked ? [...formRoster, m.id] : formRoster.filter((id) => id !== m.id))}
                      />
                      <span className="truncate">{m.name}</span>
                    </label>
                  ))}
                  {!members.length && <p className="text-xs text-ink-faint">No members yet.</p>}
                </div>
              </div>
            </div>

            <Fielded label="Tags" hint="comma separated">
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="squad, term-time" />
            </Fielded>

            {form.name.trim() && draftProblems.length > 0 && (
              <ul className="rounded-md border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
                {draftProblems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
          </DialogBody>
          <DialogFooter>
            <Button intent="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveTemplate()} disabled={saving || draftProblems.length > 0}>
              {saving ? 'Saving…' : editing ? 'Save blueprint' : 'Create blueprint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------ publish */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Publish a series</DialogTitle>
            <DialogDescription>
              {selected ? `${selected.name} · ${selected.venue_name}` : ''} — the preview below is produced by the same rules the generator uses, so it is exactly what will be created.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Fielded label="Repeats">
                <Select value={ruleDraft.frequency} onChange={(e) => setRuleDraft({ ...ruleDraft, frequency: e.target.value as RuleDraft['frequency'] })}>
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly (every 2 weeks)</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="daily">Daily</option>
                </Select>
              </Fielded>
              <Fielded label="Every">
                <Input type="number" min={1} max={12} value={ruleDraft.intervalCount} onChange={(e) => setRuleDraft({ ...ruleDraft, intervalCount: Number(e.target.value) })} />
              </Fielded>
              <Fielded label="Materialise ahead (days)" hint="open-ended runs stop here">
                <Input type="number" min={7} max={730} value={ruleDraft.horizonDays} onChange={(e) => setRuleDraft({ ...ruleDraft, horizonDays: Number(e.target.value) })} />
              </Fielded>
              <Fielded label="Start time">
                <Input type="time" value={ruleDraft.startTime} onChange={(e) => setRuleDraft({ ...ruleDraft, startTime: e.target.value })} />
              </Fielded>
              <Fielded label="End time">
                <Input type="time" value={ruleDraft.endTime} onChange={(e) => setRuleDraft({ ...ruleDraft, endTime: e.target.value })} />
              </Fielded>
              <Fielded label="Time zone">
                <Input value={selected?.timezone ?? 'Europe/London'} readOnly />
              </Fielded>
              <Fielded label="From">
                <Input type="date" value={ruleDraft.validFrom} onChange={(e) => setRuleDraft({ ...ruleDraft, validFrom: e.target.value })} />
              </Fielded>
              <Fielded label="Until" hint="blank = rolling horizon">
                <Input type="date" value={ruleDraft.validTo} onChange={(e) => setRuleDraft({ ...ruleDraft, validTo: e.target.value })} />
              </Fielded>
            </div>

            {ruleDraft.frequency !== 'daily' && ruleDraft.frequency !== 'monthly' && ruleDraft.frequency !== 'quarterly' && (
              <div>
                <div className="mb-1 text-sm font-medium text-ink">On these days</div>
                <div className="flex flex-wrap gap-1">
                  {WEEKDAYS.map((w) => {
                    const on = ruleDraft.byWeekday.includes(w.iso);
                    return (
                      <button
                        key={w.iso}
                        className={cn('btn btn-sm', on ? 'btn-primary' : 'btn-ghost')}
                        onClick={() => setRuleDraft({
                          ...ruleDraft,
                          byWeekday: on ? ruleDraft.byWeekday.filter((d) => d !== w.iso) : [...ruleDraft.byWeekday, w.iso].sort(),
                        })}
                      >
                        {w.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Toggle label="Skip term breaks" checked={ruleDraft.skipTermBreaks} onChange={(v) => setRuleDraft({ ...ruleDraft, skipTermBreaks: v })} />
              <Toggle label="Skip bank holidays" checked={ruleDraft.skipBankHolidays} onChange={(v) => setRuleDraft({ ...ruleDraft, skipBankHolidays: v })} />
              <Toggle label="Skip closures" checked={ruleDraft.skipManualClosures} onChange={(v) => setRuleDraft({ ...ruleDraft, skipManualClosures: v })} />
            </div>

            {preview.rule && preview.summary && (
              <div className="rounded-md border border-line bg-surface-hover p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success">{preview.summary.generated} generated</Badge>
                  {preview.summary.skippedTerm > 0 && <Badge tone="warning">{preview.summary.skippedTerm} term-break skipped</Badge>}
                  {preview.summary.skippedBank > 0 && <Badge tone="warning">{preview.summary.skippedBank} bank holiday skipped</Badge>}
                  {preview.summary.skippedManual > 0 && <Badge tone="neutral">{preview.summary.skippedManual} closure skipped</Badge>}
                  {existingDates.size > 0 && <Badge tone="info">{previewNew.length} new on publish</Badge>}
                  <span className="text-xs text-ink-muted">{describeRecurrence(preview.rule)}</span>
                </div>
                <div className="mt-2 max-h-44 overflow-y-auto text-xs">
                  <table className="w-full">
                    <tbody>
                      {preview.occurrences.slice(0, 40).map((o) => (
                        <tr key={o.date} className="border-b border-line/60 last:border-0">
                          <td className="py-1 pr-2 font-medium text-ink">{new Date(`${o.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</td>
                          <td className="py-1 pr-2 text-ink-muted">{o.startsAt?.slice(11, 16) ?? ''} UTC</td>
                          <td className="py-1">
                            {o.action === 'generate'
                              ? (existingDates.has(o.date)
                                ? <Badge tone="info">already exists</Badge>
                                : <Badge tone="success">will be created</Badge>)
                              : <Badge tone="warning">{o.holidayName ?? 'skipped'}</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.occurrences.length > 40 && (
                    <p className="mt-1 text-ink-faint">…and {preview.occurrences.length - 40} more up to {preview.rule.validTo ?? `the ${ruleDraft.horizonDays}-day horizon`}.</p>
                  )}
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button intent="ghost" onClick={() => setPublishOpen(false)}>Cancel</Button>
            <Button onClick={() => void publishSeries()} disabled={saving || !preview.summary?.generated}>
              {saving ? 'Publishing…' : `Publish ${previewNew.length || preview.summary?.generated || 0} instances`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- one-off */}
      <Dialog open={oneOffOpen} onOpenChange={setOneOffOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>One-off from the blueprint</DialogTitle>
            <DialogDescription>
              A single instance: it carries the blueprint's staffing plan, roster and provenance, but belongs to no series.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Fielded label="Starts" required>
              <Input type="datetime-local" value={oneOff.start} onChange={(e) => setOneOff({ ...oneOff, start: e.target.value })} />
            </Fielded>
            <Fielded label="Name override">
              <Input value={oneOff.name} onChange={(e) => setOneOff({ ...oneOff, name: e.target.value })} placeholder={selected?.name ?? ''} />
            </Fielded>
            <Fielded label="Venue override">
              <Select value={oneOff.venue_id} onChange={(e) => setOneOff({ ...oneOff, venue_id: e.target.value })}>
                <option value="">{selected?.venue_name ?? 'Blueprint venue'}</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </Fielded>
          </DialogBody>
          <DialogFooter>
            <Button intent="ghost" onClick={() => setOneOffOpen(false)}>Cancel</Button>
            <Button onClick={() => void addOneOff()} disabled={saving || !oneOff.start}>Create session</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!endTarget}
        onOpenChange={(open) => !open && setEndTarget(null)}
        title="End this series?"
        description={endTarget ? `"${endTarget.label}" stops generating. Instances already scheduled in the future are cancelled — past registers and billing are untouched.` : ''}
        confirmLabel="End and cancel future instances"
        destructive
        onConfirm={() => { if (endTarget) void setSeriesStatus(endTarget, 'ended', true); setEndTarget(null); }}
      />

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Archive this blueprint?"
        description={archiveTarget ? `"${archiveTarget.name}" can no longer be published from. Existing series and instances keep running.` : ''}
        confirmLabel="Archive blueprint"
        destructive
        onConfirm={() => { if (archiveTarget) void archiveTemplate(archiveTarget); setArchiveTarget(null); }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small bits                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `Field` renders its control through a function so the label/hint/aria ids stay
 * wired; this keeps the blueprint form readable (`<Fielded label=…><Input …/>`).
 */
function Fielded({ label, hint, required, children }: { label?: ReactNode; hint?: ReactNode; required?: boolean; children: ReactElement }) {
  return (
    <Field label={label} hint={hint} required={required}>
      {({ id }) => cloneElement(children, { id } as Partial<unknown>)}
    </Field>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xs font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-ink">{value}</div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const nameOf = (rows: { id: string; display_name?: string; name?: string }[], id?: string | null) => {
  if (!id) return '—';
  const row = rows.find((r) => r.id === id);
  return row ? (row.display_name ?? row.name ?? '—') : '—';
};
