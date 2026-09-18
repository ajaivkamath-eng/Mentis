/**
 * Compact event editing surfaces — a side panel for full create/edit, a quick
 * popover for drag-created ranges, a details popover for clicks and a paste
 * options popover for clipboard actions. These replace the old full-width
 * From/To form: the calendar is the primary surface, these are its helpers.
 */
import { useMemo, useState } from 'react';
import type { DiaryEvent, IsoWeekday } from '@mentis/core';
import {
  AlertTriangle, CalendarClock, Check, Copy, Link2, Lock, Pencil, Repeat, Scissors, Trash2, Users,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input, Label, Select, Textarea } from '../ui/input';
import {
  KIND, ROLE_LABEL, SOURCE_LABEL, WEEKDAYS, WEEKDAYS_LONG, fmtMoney, fmtTimeRange,
  kindStyle, toLocalInput, type EventKind,
} from '../../lib/diary/model';
import type { StaffOption } from '../../lib/diary/store';
import { FloatingCard, type Anchor } from './floating';

/* ------------------------------------------------------------------ */
/* Draft model                                                         */
/* ------------------------------------------------------------------ */

export interface EditorDraft {
  id?: string;
  staffId: string;
  title: string;
  kind: EventKind;
  startLocal: string; // datetime-local value
  endLocal: string;
  allDay: boolean;
  notes: string;
  visibility: 'private' | 'staff' | 'public';
  repeat: { enabled: boolean; weekdays: IsoWeekday[]; until: string };
  system?: boolean;
  sourceType?: DiaryEvent['sourceType'];
  staffName?: string;
  linkTo?: string | null;
  rateCents?: number | null;
  rateLabel?: string | null;
  coachRole?: DiaryEvent['coachRole'];
}

const KIND_GROUPS: { group: string; kinds: EventKind[] }[] = [
  { group: 'Availability', kinds: ['available', 'working_hours'] },
  { group: 'Time off', kinds: ['holiday', 'sick_leave', 'personal_appointment', 'out_of_office', 'unavailable_other'] },
  { group: 'Duty & development', kinds: ['club_duty', 'duty_outside_club', 'working_elsewhere', 'training'] },
];

/* ------------------------------------------------------------------ */
/* Side panel (create + edit)                                          */
/* ------------------------------------------------------------------ */

export function EventEditorPanel({
  draft, onChange, staffOptions, meId, canRecordForOthers, conflicts, existingForStaff, onSave, onSaveAndRepeat, onDelete, onClose, createdAt,
}: {
  draft: EditorDraft;
  onChange: (patch: Partial<EditorDraft>) => void;
  staffOptions: StaffOption[];
  meId: string;
  canRecordForOthers: boolean;
  /** Conflicts this draft would create (blocking overlaps with bookings). */
  conflicts: { message: string; assignment: DiaryEvent }[];
  existingForStaff: number;
  onSave: (confirmConflict: boolean) => void;
  onSaveAndRepeat: (confirmConflict: boolean) => void;
  onDelete?: () => void;
  onClose: () => void;
  createdAt?: string;
}) {
  const [confirmConflict, setConfirmConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !draft.id;
  const style = KIND[draft.kind];
  const editable = !draft.system;

  const repeatToggle = (wd: IsoWeekday) => {
    const has = draft.repeat.weekdays.includes(wd);
    onChange({ repeat: { ...draft.repeat, weekdays: has ? draft.repeat.weekdays.filter((w) => w !== wd) : [...draft.repeat.weekdays, wd] } });
  };

  return (
    <aside
      role="complementary"
      aria-label={isNew ? 'Create diary entry' : 'Edit diary entry'}
      className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-surface"
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="grid size-7 place-items-center rounded-md" style={{ backgroundColor: style.soft, color: style.color }}>
          <style.icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-black">{isNew ? 'New diary entry' : 'Edit diary entry'}</h2>
          <p className="truncate text-[11px] text-ink-muted">
            {draft.system
              ? `System-generated · ${SOURCE_LABEL[draft.sourceType ?? 'manual']}`
              : isNew ? 'Calendar-first: pick a type and save' : SOURCE_LABEL[draft.sourceType ?? 'manual']}
          </p>
        </div>
        <Button intent="ghost" size="icon" aria-label="Close panel" onClick={onClose} className="ml-auto"><Pencil className="hidden" /></Button>
      </header>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3">
        {!editable && (
          <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-soft p-2.5 text-xs text-ink">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-info" />
            <span>
              This entry comes from a {draft.sourceType === 'session' ? 'session booking' : 'task'} — it is managed
              by the scheduling system and can’t be edited in the personal diary.
              {draft.linkTo && <a className="ml-1 inline-flex items-center gap-0.5 font-bold text-brand-text underline" href={draft.linkTo}><Link2 className="size-3" />Open {draft.sourceType === 'session' ? 'session' : 'task'}</a>}
            </span>
          </div>
        )}

        {/* Event type */}
        <fieldset className="space-y-1.5" disabled={!editable}>
          <Label>Type</Label>
          <div className="space-y-2">
            {KIND_GROUPS.map((g) => (
              <div key={g.group}>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{g.group}</p>
                <div className="flex flex-wrap gap-1">
                  {g.kinds.map((k) => {
                    const ks = KIND[k];
                    const active = draft.kind === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onChange({ kind: k, title: draft.title && draft.title !== KIND[draft.kind].label ? draft.title : '' })}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition-colors',
                          active ? 'border-transparent text-white' : 'border-line bg-surface text-ink hover:bg-surface-hover',
                        )}
                        style={active ? { backgroundColor: ks.color } : undefined}
                      >
                        <ks.icon className="size-3" /> {ks.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        {/* Title + notes */}
        <fieldset className="space-y-2" disabled={!editable}>
          <div>
            <Label htmlFor="ev-title">Title</Label>
            <Input id="ev-title" value={draft.title} placeholder={style.label} onChange={(e) => onChange({ title: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="ev-notes">Notes / reason</Label>
            <Textarea id="ev-notes" rows={2} value={draft.notes} placeholder="Optional context, e.g. GP appointment, summer break…" onChange={(e) => onChange({ notes: e.target.value })} />
          </div>
        </fieldset>

        {/* When */}
        <fieldset className="space-y-2" disabled={!editable}>
          <div className="flex items-center justify-between">
            <Label className="mb-0">When</Label>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
              <input type="checkbox" className="accent-[var(--brand)]" checked={draft.allDay} onChange={(e) => onChange({ allDay: e.target.checked })} />
              All day
            </label>
          </div>
          {draft.allDay ? (
            <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="ev-from">From</Label><Input id="ev-from" type="date" value={draft.startLocal.slice(0, 10)} onChange={(e) => onChange({ startLocal: `${e.target.value}T00:00` })} /></div>
              <div><Label htmlFor="ev-to">To</Label><Input id="ev-to" type="date" value={draft.endLocal.slice(0, 10)} onChange={(e) => onChange({ endLocal: `${e.target.value}T23:59` })} /></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="ev-start">Starts</Label><Input id="ev-start" type="datetime-local" value={draft.startLocal} onChange={(e) => onChange({ startLocal: e.target.value })} /></div>
              <div><Label htmlFor="ev-end">Ends</Label><Input id="ev-end" type="datetime-local" value={draft.endLocal} onChange={(e) => onChange({ endLocal: e.target.value })} /></div>
            </div>
          )}
          <p className="text-[10px] text-ink-faint">Entries may span midnight and multiple days.</p>
        </fieldset>

        {/* Who */}
        <div>
          <Label htmlFor="ev-staff">Coach / staff</Label>
          <Select id="ev-staff" value={draft.staffId} disabled={!canRecordForOthers || !editable} onChange={(e) => onChange({ staffId: e.target.value })}>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.id === meId ? ' (me)' : ''}</option>
            ))}
          </Select>
          {!canRecordForOthers && <p className="mt-1 text-[10px] text-ink-faint">Only your own diary — coordinators can record for others.</p>}
        </div>

        {/* Recurrence */}
        <fieldset className="rounded-lg border border-line p-2.5" disabled={!editable}>
          <legend className="flex items-center gap-1 px-1 text-[11px] font-bold text-ink-muted"><Repeat className="size-3" />Repeat</legend>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
            <input type="checkbox" className="accent-[var(--brand)]" checked={draft.repeat.enabled} onChange={(e) => onChange({ repeat: { ...draft.repeat, enabled: e.target.checked, weekdays: draft.repeat.weekdays.length ? draft.repeat.weekdays : [1] } })} />
            Repeat weekly until
          </label>
          {draft.repeat.enabled && (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((d, i) => {
                  const wd = (i + 1) as IsoWeekday;
                  const active = draft.repeat.weekdays.includes(wd);
                  return (
                    <button key={d} type="button" onClick={() => repeatToggle(wd)}
                      className={cn('size-7 rounded-full border text-[10px] font-bold', active ? 'border-transparent bg-brand text-brand-ink' : 'border-line text-ink-muted hover:bg-surface-hover')}>
                      {d[0]}
                    </button>
                  );
                })}
              </div>
              <Input type="date" aria-label="Repeat until" value={draft.repeat.until} onChange={(e) => onChange({ repeat: { ...draft.repeat, until: e.target.value } })} />
            </div>
          )}
        </fieldset>

        {/* Visibility */}
        <div>
          <Label htmlFor="ev-vis">Visibility</Label>
          <Select id="ev-vis" value={draft.visibility} disabled={!editable} onChange={(e) => onChange({ visibility: e.target.value as EditorDraft['visibility'] })}>
            <option value="staff">Staff — visible to club staff</option>
            <option value="private">Private — only me</option>
            <option value="public">Public — shown on public diary</option>
          </Select>
        </div>

        {/* Conflict preview */}
        {conflicts.length > 0 && (
          <div className="rounded-lg border border-danger/40 bg-danger-soft/30 p-2.5">
            <p className="mb-1 flex items-center gap-1 text-xs font-black text-danger"><AlertTriangle className="size-3.5" /> {conflicts.length} booking conflict{conflicts.length > 1 ? 's' : ''}</p>
            <ul className="space-y-1 text-[11px] text-ink">
              {conflicts.slice(0, 3).map((c, i) => <li key={i}>{c.message}</li>)}
            </ul>
            <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-danger">
              <input type="checkbox" className="accent-[var(--danger)]" checked={confirmConflict} onChange={(e) => setConfirmConflict(e.target.checked)} />
              Keep anyway — the session stays flagged red until resolved
            </label>
          </div>
        )}

        {createdAt && <p className="text-[10px] text-ink-faint">{createdAt}</p>}
        {existingForStaff > 0 && <p className="text-[10px] text-ink-faint">{existingForStaff} other entries for this coach in view.</p>}
      </div>

      {/* Footer actions */}
      <footer className="space-y-2 border-t border-line bg-surface-inset/50 p-3">
        <div className="flex gap-2">
          <Button intent="primary" size="sm" className="flex-1" disabled={!editable || (conflicts.length > 0 && !confirmConflict)} onClick={() => onSave(confirmConflict)}>
            <Check className="size-3.5" /> Save
          </Button>
          {isNew && (
            <Button intent="secondary" size="sm" className="flex-1" disabled={!editable || !draft.repeat.enabled || (conflicts.length > 0 && !confirmConflict)} onClick={() => onSaveAndRepeat(confirmConflict)}>
              <CalendarClock className="size-3.5" /> Save &amp; repeat
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {onDelete && !isNew && (
            <Button
              intent={confirmDelete ? 'danger' : 'ghost'}
              size="sm"
              className="flex-1"
              disabled={!editable}
              onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
            >
              <Trash2 className="size-3.5" /> {confirmDelete ? 'Confirm delete' : 'Delete'}
            </Button>
          )}
          <Button intent="ghost" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
        </div>
      </footer>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Quick create popover (after click / drag on empty space)            */
/* ------------------------------------------------------------------ */

const QUICK_KINDS: EventKind[] = ['available', 'holiday', 'unavailable_other', 'personal_appointment', 'club_duty', 'training'];

export function QuickCreatePopover({
  anchor, range, draft, onChange, onSave, onMoreDetails, staffName,
}: {
  anchor: Anchor;
  range: { start: Date; end: Date };
  draft: EditorDraft;
  onChange: (patch: Partial<EditorDraft>) => void;
  onSave: () => void;
  onMoreDetails: () => void;
  staffName?: string;
}) {
  return (
    <FloatingCard anchor={anchor} width={300} label="Quick create entry" onClose={onMoreDetails}>
      <p className="mb-2 pr-4 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
        New entry · {fmtTimeRange(range.start.toISOString(), range.end.toISOString())}
      </p>
      <div className="mb-2 flex flex-wrap gap-1">
        {QUICK_KINDS.map((k) => {
          const ks = KIND[k];
          const active = draft.kind === k;
          return (
            <button key={k} type="button" onClick={() => onChange({ kind: k })}
              className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold', active ? 'border-transparent text-white' : 'border-line hover:bg-surface-hover')}
              style={active ? { backgroundColor: ks.color } : undefined}>
              <ks.icon className="size-3" />{ks.label}
            </button>
          );
        })}
      </div>
      <Input className="mb-2" autoFocus placeholder="Title (optional)" value={draft.title} onChange={(e) => onChange({ title: e.target.value })} aria-label="Entry title" />
      <div className="mb-2 grid grid-cols-2 gap-2">
        <Input type="time" step={300} value={draft.startLocal.slice(11, 16)} aria-label="Start time" onChange={(e) => onChange({ startLocal: `${draft.startLocal.slice(0, 10)}T${e.target.value}` })} />
        <Input type="time" step={300} value={draft.endLocal.slice(11, 16)} aria-label="End time" onChange={(e) => onChange({ endLocal: `${draft.endLocal.slice(0, 10)}T${e.target.value}` })} />
      </div>
      {staffName && <p className="mb-2 text-[10px] text-ink-faint">For <strong>{staffName}</strong></p>}
      <div className="flex gap-2">
        <Button intent="primary" size="sm" className="flex-1" onClick={onSave}><Check className="size-3.5" /> Save</Button>
        <Button intent="secondary" size="sm" className="flex-1" onClick={onMoreDetails}>More details…</Button>
      </div>
    </FloatingCard>
  );
}

/* ------------------------------------------------------------------ */
/* Details popover (single click on an event)                          */
/* ------------------------------------------------------------------ */

export function EventDetailsPopover({
  anchor, ev, onClose, onEdit, onDuplicate, onDelete, onCopy, onCut, onOpenLink, multiStaff,
}: {
  anchor: Anchor;
  ev: DiaryEvent;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete?: () => void;
  onCopy: () => void;
  onCut?: () => void;
  onOpenLink?: () => void;
  multiStaff?: boolean;
}) {
  const style = kindStyle(ev);
  const Icon = style.icon;
  // Planner-generated occurrences are individually editable (exceptions);
  // session/task bookings are system-owned and read-only in the diary.
  const editable = !ev.system || ev.sourceType === 'planner';
  return (
    <FloatingCard anchor={anchor} width={300} label="Entry details" onClose={onClose}>
      <div className="mb-1 flex items-center gap-2 pr-4">
        <span className="grid size-8 place-items-center rounded-lg" style={{ backgroundColor: style.soft, color: style.color }}><Icon className="size-4" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{ev.title}</p>
          <p className="truncate text-[11px] font-semibold" style={{ color: style.color }}>{KIND[ev.kind].label}</p>
        </div>
      </div>
      <dl className="mb-2 space-y-1 text-[11px] text-ink-muted">
        <div className="flex gap-1"><dt className="w-14 shrink-0 font-bold">When</dt><dd>{fmtTimeRange(ev.start, ev.end)}</dd></div>
        {ev.staffName && <div className="flex gap-1"><dt className="w-14 shrink-0 font-bold">Coach</dt><dd>{ev.staffName}</dd></div>}
        {ev.coachRole && <div className="flex gap-1"><dt className="w-14 shrink-0 font-bold">Role</dt><dd>{ROLE_LABEL[ev.coachRole]}</dd></div>}
        {ev.location && <div className="flex gap-1"><dt className="w-14 shrink-0 font-bold">Venue</dt><dd>{ev.location}</dd></div>}
        {ev.notes && <div className="flex gap-1"><dt className="w-14 shrink-0 font-bold">Notes</dt><dd className="italic">{ev.notes}</dd></div>}
        <div className="flex gap-1"><dt className="w-14 shrink-0 font-bold">Source</dt><dd>{SOURCE_LABEL[ev.sourceType]}{ev.system ? ' · system' : ''}</dd></div>
        <div className="flex gap-1"><dt className="w-14 shrink-0 font-bold">Access</dt><dd>{editable ? 'Editable by you' : 'Read-only in diary'}</dd></div>
        {ev.chargeable && (
          <div className="flex gap-1"><dt className="w-14 shrink-0 font-bold">Charges</dt>
            <dd><Badge tone="success" size="sm">chargeable · {ev.rateLabel ?? 'rate'} {fmtMoney(ev.rateCents)}/h</Badge></dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-1.5">
        {ev.linkTo && <Button intent="secondary" size="sm" onClick={onOpenLink}><Link2 className="size-3.5" />Open</Button>}
        {editable && <Button intent="primary" size="sm" onClick={onEdit}><Pencil className="size-3.5" />Edit</Button>}
        {editable && <Button intent="secondary" size="sm" onClick={onDuplicate}><Copy className="size-3.5" />Duplicate</Button>}
        <Button intent="secondary" size="sm" onClick={onCopy}><Copy className="size-3.5" />Copy</Button>
        {editable && onCut && <Button intent="secondary" size="sm" onClick={onCut}><Scissors className="size-3.5" />Cut</Button>}
        {editable && onDelete && <Button intent="danger" size="sm" onClick={onDelete}><Trash2 className="size-3.5" />Delete</Button>}
      </div>
    </FloatingCard>
  );
}

/* ------------------------------------------------------------------ */
/* Paste options popover                                               */
/* ------------------------------------------------------------------ */

export interface PasteOptions {
  mode: 'once' | 'range' | 'weekdays';
  from: string;
  to: string;
  weekdays: IsoWeekday[];
  timeMode: 'original' | 'custom';
  newTime: string;
}

export function PastePopover({
  anchor, options, onChange, onApply, count, onClose,
}: {
  anchor: Anchor;
  options: PasteOptions;
  onChange: (patch: Partial<PasteOptions>) => void;
  onApply: () => void;
  count: number;
  onClose: () => void;
}) {
  const toggleWd = (wd: IsoWeekday) => {
    const has = options.weekdays.includes(wd);
    onChange({ weekdays: has ? options.weekdays.filter((w) => w !== wd) : [...options.weekdays, wd] });
  };
  const estimated = useMemo(() => {
    if (options.mode === 'once') return count;
    if (options.mode === 'weekdays') return count * Math.max(1, options.weekdays.length);
    const days = Math.max(1, Math.round((Date.parse(options.to) - Date.parse(options.from)) / 86_400_000) + 1);
    return count * days;
  }, [options, count]);

  return (
    <FloatingCard anchor={anchor} width={310} label="Paste options" onClose={onClose}>
      <p className="mb-2 pr-4 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Paste {count} copied entr{count === 1 ? 'y' : 'ies'}</p>
      <div className="mb-2 grid grid-cols-3 gap-1">
        {(['once', 'range', 'weekdays'] as const).map((m) => (
          <button key={m} type="button" onClick={() => onChange({ mode: m })}
            className={cn('rounded-lg border px-2 py-1.5 text-[11px] font-bold capitalize', options.mode === m ? 'border-brand bg-brand-soft text-brand-text' : 'border-line hover:bg-surface-hover')}>
            {m === 'once' ? 'Once' : m === 'range' ? 'Date range' : 'Weekdays'}
          </button>
        ))}
      </div>
      {options.mode === 'range' && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <div><Label htmlFor="paste-from">From</Label><Input id="paste-from" type="date" value={options.from} onChange={(e) => onChange({ from: e.target.value })} /></div>
          <div><Label htmlFor="paste-to">To</Label><Input id="paste-to" type="date" value={options.to} onChange={(e) => onChange({ to: e.target.value })} /></div>
        </div>
      )}
      {options.mode === 'weekdays' && (
        <div className="mb-2 flex flex-wrap gap-1">
          {WEEKDAYS_LONG.map((d, i) => {
            const wd = (i + 1) as IsoWeekday;
            const active = options.weekdays.includes(wd);
            return (
              <button key={d} type="button" onClick={() => toggleWd(wd)}
                className={cn('rounded-full border px-2 py-1 text-[10px] font-bold', active ? 'border-transparent bg-brand text-brand-ink' : 'border-line text-ink-muted hover:bg-surface-hover')}>
                {d.slice(0, 3)}
              </button>
            );
          })}
        </div>
      )}
      <div className="mb-2 flex items-center gap-2">
        <Label className="mb-0 shrink-0">Time</Label>
        <div className="flex flex-1 gap-1">
          <button type="button" onClick={() => onChange({ timeMode: 'original' })}
            className={cn('flex-1 rounded-lg border px-2 py-1 text-[11px] font-bold', options.timeMode === 'original' ? 'border-brand bg-brand-soft text-brand-text' : 'border-line hover:bg-surface-hover')}>Original</button>
          <button type="button" onClick={() => onChange({ timeMode: 'custom' })}
            className={cn('flex-1 rounded-lg border px-2 py-1 text-[11px] font-bold', options.timeMode === 'custom' ? 'border-brand bg-brand-soft text-brand-text' : 'border-line hover:bg-surface-hover')}>New time</button>
        </div>
        {options.timeMode === 'custom' && <Input type="time" className="w-24" value={options.newTime} onChange={(e) => onChange({ newTime: e.target.value })} aria-label="New time" />}
      </div>
      <p className="mb-2 flex items-center gap-1 text-[10px] text-ink-faint"><Users className="size-3" />≈ {estimated} entr{estimated === 1 ? 'y' : 'ies'} will be created on the selected coach’s diary.</p>
      <Button intent="primary" size="sm" className="w-full" disabled={count === 0 || (options.mode === 'weekdays' && options.weekdays.length === 0)} onClick={onApply}>
        <Copy className="size-3.5" /> Paste
      </Button>
    </FloatingCard>
  );
}
