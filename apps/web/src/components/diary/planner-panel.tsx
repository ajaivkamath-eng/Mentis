/**
 * Regular Availability Planner — Viva-Insights-style weekly working pattern.
 *
 * “I normally work Monday 12:00–20:00 and Tuesday 16:00–17:00; I do not work
 * weekends. Apply from 1 October to 31 December.” → the pattern is defined
 * here, previewed, and applied: the calendar materialises light regular-
 * availability blocks for every matching day in the effective range.
 */
import { useMemo, useState } from 'react';
import type { AvailabilityRule, DayPattern, IsoWeekday } from '@mentis/core';
import { expandAvailabilityPattern } from '@mentis/core';
import { CalendarRange, Check, Copy, Eraser, ListTree, Plus, Trash2, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input, Label, Select } from '../ui/input';
import { WEEKDAYS_LONG, addDays, dateKey, fmtTime, startOfWeek } from '../../lib/diary/model';
import type { StaffOption } from '../../lib/diary/store';

type Window = { start: string; end: string };

export interface PlannerValue {
  id?: string;
  staffId: string;
  label: string;
  pattern: DayPattern[];
  effectiveFrom: string;
  effectiveTo: string | null;
  scope: 'one_month' | 'indefinite' | 'custom';
}

export function emptyPlanner(staffId: string): PlannerValue {
  return {
    staffId,
    label: 'Regular availability',
    pattern: [1, 2, 3, 4, 5, 6, 7].map((w) => ({ weekday: w as IsoWeekday, windows: [] })),
    effectiveFrom: dateKey(addDays(startOfWeek(new Date()), 7)),
    effectiveTo: null,
    scope: 'indefinite',
  };
}

export function plannerFromRule(rule: AvailabilityRule): PlannerValue {
  return {
    staffId: rule.staffId,
    label: rule.label,
    pattern: [1, 2, 3, 4, 5, 6, 7].map((w) => {
      const day = rule.pattern.find((p) => p.weekday === w);
      return { weekday: w as IsoWeekday, windows: day ? day.windows.map((x) => ({ ...x })) : [] };
    }),
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
    scope: rule.scope,
  };
}

export function PlannerPanel({
  value, onChange, staffOptions, existingRules, onApply, onDeleteRule, onPreviewInCalendar, meId, canRecordForOthers,
}: {
  value: PlannerValue;
  onChange: (patch: Partial<PlannerValue>) => void;
  staffOptions: StaffOption[];
  existingRules: AvailabilityRule[];
  onApply: () => Promise<void> | void;
  onDeleteRule: (id: string) => Promise<void> | void;
  onPreviewInCalendar: () => void;
  meId: string;
  canRecordForOthers: boolean;
}) {
  const [copiedWeek, setCopiedWeek] = useState<Window[][] | null>(null);
  const [applied, setApplied] = useState(false);
  const [saving, setSaving] = useState(false);

  const staffName = staffOptions.find((s) => s.id === value.staffId)?.name ?? '';

  const dayValue = (wd: IsoWeekday): DayPattern =>
    value.pattern.find((p) => p.weekday === wd) ?? { weekday: wd, windows: [] };

  const setDay = (wd: IsoWeekday, day: DayPattern) => {
    onChange({ pattern: [...value.pattern.filter((p) => p.weekday !== wd), day].sort((a, b) => a.weekday - b.weekday) });
  };

  const addWindow = (wd: IsoWeekday) => {
    const day = dayValue(wd);
    const prevEnd = day.windows[day.windows.length - 1]?.end ?? '09:00';
    const [h, m] = prevEnd.split(':').map(Number);
    const start = `${String(Math.min(22, h)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const endHour = Math.min(23, h + 2);
    setDay(wd, { weekday: wd, windows: [...day.windows, { start, end: `${String(endHour).padStart(2, '0')}:00` }] });
  };

  const updateWindow = (wd: IsoWeekday, idx: number, patch: Partial<Window>) => {
    const day = dayValue(wd);
    setDay(wd, { weekday: wd, windows: day.windows.map((w, i) => (i === idx ? { ...w, ...patch } : w)) });
  };

  const copyMonday = (targets: IsoWeekday[]) => {
    const src = dayValue(1).windows.map((w) => ({ ...w }));
    for (const t of targets) setDay(t, { weekday: t, windows: src.map((w) => ({ ...w })) });
  };

  const clearDay = (wd: IsoWeekday) => setDay(wd, { weekday: wd, windows: [] });
  const clearAll = () => onChange({ pattern: [1, 2, 3, 4, 5, 6, 7].map((w) => ({ weekday: w as IsoWeekday, windows: [] })) });

  /** Preview: exactly what the calendar will generate (same function as the store). */
  const preview = useMemo(() => {
    const rule = {
      id: value.id ?? 'preview', staffId: value.staffId, label: value.label, pattern: value.pattern,
      effectiveFrom: value.effectiveFrom, effectiveTo: value.effectiveTo, scope: value.scope,
    };
    // Expansion window is capped at 10 weeks for the preview; indefinite rules
    // simply keep generating as the calendar advances.
    const hardStop = dateKey(addDays(new Date(`${value.effectiveFrom}T12:00`), 70));
    const endBound = value.effectiveTo && value.effectiveTo < hardStop ? value.effectiveTo : hardStop;
    const entries = expandAvailabilityPattern(rule, value.effectiveFrom, endBound);
    return { entries, sample: entries.slice(0, 8) };
  }, [value]);

  const totalHours = useMemo(
    () => value.pattern.reduce((acc, d) => acc + d.windows.reduce((a, w) => {
      const [sh, sm] = w.start.split(':').map(Number);
      const [eh, em] = w.end.split(':').map(Number);
      return a + (eh * 60 + em - (sh * 60 + sm)) / 60;
    }, 0), 0),
    [value.pattern],
  );

  const activeRules = existingRules.filter((r) => r.isActive && r.staffId === value.staffId);

  return (
    <aside aria-label="Regular availability planner" className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="grid size-7 place-items-center rounded-md bg-info-soft text-info"><ListTree className="size-4" /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-black">Regular availability planner</h2>
          <p className="text-[11px] text-ink-muted">Default weekly pattern → auto-generated calendar blocks</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="pl-staff">Coach</Label>
            <Select id="pl-staff" value={value.staffId} disabled={!canRecordForOthers} onChange={(e) => onChange({ staffId: e.target.value })}>
              {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}{s.id === meId ? ' (me)' : ''}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="pl-label">Pattern name</Label>
            <Input id="pl-label" value={value.label} onChange={(e) => onChange({ label: e.target.value })} />
          </div>
        </div>

        {/* Week grid */}
        <div className="space-y-1.5">
          {WEEKDAYS_LONG.map((name, i) => {
            const wd = (i + 1) as IsoWeekday;
            const day = dayValue(wd);
            const empty = day.windows.length === 0;
            return (
              <div key={name} className={cn('rounded-lg border p-2', empty ? 'border-line bg-surface-inset/40' : 'border-line bg-surface')}>
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs font-black">{name}</span>
                  {empty ? (
                    <Badge tone="neutral" size="sm">Not available</Badge>
                  ) : (
                    <span className="flex-1 space-y-1">
                      {day.windows.map((w, idx) => (
                        <span key={idx} className="flex items-center gap-1">
                          <Input type="time" step={300} className="h-7 w-[92px] py-0 text-xs" value={w.start} aria-label={`${name} window ${idx + 1} start`} onChange={(e) => updateWindow(wd, idx, { start: e.target.value })} />
                          <span className="text-ink-faint">–</span>
                          <Input type="time" step={300} className="h-7 w-[92px] py-0 text-xs" value={w.end} aria-label={`${name} window ${idx + 1} end`} onChange={(e) => updateWindow(wd, idx, { end: e.target.value })} />
                          <button type="button" aria-label={`Remove ${name} window ${idx + 1}`} className="rounded p-0.5 text-ink-faint hover:bg-surface-hover hover:text-danger" onClick={() => setDay(wd, { weekday: wd, windows: day.windows.filter((_, j) => j !== idx) })}>
                            <X className="size-3.5" />
                          </button>
                        </span>
                      ))}
                    </span>
                  )}
                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    <button type="button" aria-label={`Add window on ${name}`} title="Add window" className="rounded p-1 text-ink-muted hover:bg-surface-hover hover:text-brand" onClick={() => addWindow(wd)}><Plus className="size-3.5" /></button>
                    <button type="button" aria-label={`Copy Monday to ${name}`} title="Copy Monday’s hours" className="rounded p-1 text-ink-muted hover:bg-surface-hover hover:text-brand" onClick={() => copyMonday([wd])}><Copy className="size-3.5" /></button>
                    <button type="button" aria-label={`Clear ${name}`} title="Clear day" className="rounded p-1 text-ink-muted hover:bg-surface-hover hover:text-danger" onClick={() => clearDay(wd)}><Eraser className="size-3.5" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Week tools */}
        <div className="flex flex-wrap gap-1.5">
          <Button intent="secondary" size="sm" onClick={() => copyMonday([2, 3, 4, 5])}>Copy Mon → weekdays</Button>
          <Button intent="secondary" size="sm" onClick={() => copyMonday([2, 3, 4, 5, 6, 7])}>Copy Mon → all</Button>
          <Button intent="secondary" size="sm" onClick={() => setCopiedWeek([1, 2, 3, 4, 5, 6, 7].map((w) => dayValue(w as IsoWeekday).windows.map((x) => ({ ...x }))))}>Copy week</Button>
          <Button intent="secondary" size="sm" disabled={!copiedWeek} onClick={() => { if (copiedWeek) onChange({ pattern: [1, 2, 3, 4, 5, 6, 7].map((w, i) => ({ weekday: w as IsoWeekday, windows: copiedWeek[i].map((x) => ({ ...x })) })) }); }}>Paste week</Button>
          <Button intent="danger" size="sm" onClick={clearAll}>Clear pattern</Button>
        </div>

        {/* Effective range */}
        <fieldset className="rounded-lg border border-line p-2.5">
          <legend className="flex items-center gap-1 px-1 text-[11px] font-bold text-ink-muted"><CalendarRange className="size-3" />Effective</legend>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="pl-from">From</Label>
              <Input id="pl-from" type="date" value={value.effectiveFrom} onChange={(e) => onChange({ effectiveFrom: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="pl-scope">Duration</Label>
              <Select id="pl-scope" value={value.scope} onChange={(e) => {
                const scope = e.target.value as PlannerValue['scope'];
                onChange({
                  scope,
                  effectiveTo: scope === 'custom' ? dateKey(addDays(new Date(), 90)) : null,
                });
              }}>
                <option value="one_month">Apply for one month</option>
                <option value="indefinite">Apply indefinitely</option>
                <option value="custom">Custom date range</option>
              </Select>
            </div>
          </div>
          {value.scope === 'custom' && (
            <div className="mt-2">
              <Label htmlFor="pl-to">Until</Label>
              <Input id="pl-to" type="date" value={value.effectiveTo ?? ''} onChange={(e) => onChange({ effectiveTo: e.target.value })} />
            </div>
          )}
        </fieldset>

        {/* Preview */}
        <div className="rounded-lg border border-info/30 bg-info-soft/60 p-2.5">
          <p className="mb-1 flex items-center gap-1 text-xs font-black text-info"><ListTree className="size-3.5" />Preview</p>
          <p className="text-[11px] leading-relaxed text-ink">
            <strong>{preview.entries.length}+ availability blocks</strong> ({Math.round(totalHours)}h/week) will appear
            on <strong>{staffName}</strong>’s calendar as light regular-availability entries
            from {new Date(value.effectiveFrom + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
            {value.scope === 'one_month' ? ' for one month' : value.scope === 'custom' && value.effectiveTo ? ` until ${new Date(value.effectiveTo + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ', indefinitely'}.
            Individual occurrences stay editable without touching this pattern.
          </p>
          {preview.sample.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[10px] tabular-nums text-ink-muted">
              {preview.sample.map((g, i) => (
                <li key={i}>{new Date(`${g.date}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtTime(g.startLocal + ':00')}–{fmtTime(g.endLocal + ':00')}</li>
              ))}
              {preview.entries.length > preview.sample.length && <li>… and {preview.entries.length - preview.sample.length} more in the next 10 weeks</li>}
            </ul>
          )}
        </div>

        {/* Existing patterns */}
        {activeRules.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Saved patterns for {staffName}</p>
            <ul className="space-y-1">
              {activeRules.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{r.label}</span>
                    <span className="text-[10px] text-ink-faint">from {r.effectiveFrom}{r.effectiveTo ? ` to ${r.effectiveTo}` : ' · indefinite'}</span>
                  </span>
                  <Button intent="ghost" size="sm" onClick={() => onChange(plannerFromRulePatch(r))}>Load</Button>
                  <Button intent="ghost" size="sm" className="text-danger" aria-label={`Delete pattern ${r.label}`} onClick={() => void onDeleteRule(r.id)}><Trash2 className="size-3.5" /></Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="space-y-2 border-t border-line bg-surface-inset/50 p-3">
        <Button
          intent="primary"
          size="sm"
          className="w-full"
          loading={saving}
          disabled={totalHours <= 0 || !value.effectiveFrom}
          onClick={async () => {
            setSaving(true);
            try { await onApply(); setApplied(true); setTimeout(() => setApplied(false), 2500); } finally { setSaving(false); }
          }}
        >
          {applied ? <Check className="size-3.5" /> : <Check className="size-3.5" />} {applied ? 'Pattern applied — calendar updated' : 'Apply pattern to calendar'}
        </Button>
        <Button intent="secondary" size="sm" className="w-full" onClick={onPreviewInCalendar}>
          Preview generated entries in calendar
        </Button>
      </footer>
    </aside>
  );
}

function plannerFromRulePatch(rule: AvailabilityRule): Partial<PlannerValue> {
  return { ...plannerFromRule(rule), id: rule.id };
}
