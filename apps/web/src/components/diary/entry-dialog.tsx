import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Check, Clock3, Repeat, Trash2, X } from 'lucide-react';
import type { DiaryEvent, IsoWeekday } from '@mentis/core';
import { KIND, WEEKDAYS, WEEKDAYS_LONG, dateKey, toLocalInput, type EventKind } from '../../lib/diary/model';
import type { StaffOption } from '../../lib/diary/store';
import type { EditorDraft } from './editor-panel';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input, Label, Select, Textarea } from '../ui/input';

const TYPE_GROUPS: { label: string; kinds: EventKind[] }[] = [
  { label: 'Availability', kinds: ['available', 'working_hours'] },
  { label: 'Time off', kinds: ['vacation', 'sick_leave', 'personal_appointment', 'out_of_office', 'unavailable_other'] },
  { label: 'Duty & events', kinds: ['club_duty', 'on_duty', 'duty_outside_club', 'working_elsewhere', 'training', 'other'] },
];

function updateLocalDate(value: string, date: string, timeFallback: string) {
  return `${date}T${value.slice(11, 16) || timeFallback}`;
}

export function DiaryEntryDialog({
  open, draft, onChange, staffOptions, meId, canRecordForOthers, conflicts, error, saving,
  onSave, onSaveAndRepeat, onDelete, onClose,
}: {
  open: boolean;
  draft: EditorDraft | null;
  onChange: (patch: Partial<EditorDraft>) => void;
  staffOptions: StaffOption[];
  meId: string;
  canRecordForOthers: boolean;
  conflicts: { message: string; assignment: DiaryEvent }[];
  error?: string | null;
  saving?: boolean;
  onSave: (keepAnyway: boolean) => Promise<void> | void;
  onSaveAndRepeat: (keepAnyway: boolean) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [keepAnyway, setKeepAnyway] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const conflictKey = conflicts.map((c) => `${c.assignment.id}:${c.message}`).join('|');
  const start = draft ? new Date(draft.startLocal) : new Date(NaN);
  const end = draft ? new Date(draft.endLocal) : new Date(NaN);
  const dateError = useMemo(() => {
    if (!draft) return '';
    if (!draft.startLocal || Number.isNaN(start.getTime())) return 'Choose a valid start date and time.';
    if (!draft.endLocal || Number.isNaN(end.getTime())) return 'Choose a valid end date and time.';
    if (end <= start) return 'The end must be after the start. Your entry is still here — adjust the time to continue.';
    return '';
  }, [draft?.startLocal, draft?.endLocal]);
  const repeatError = draft?.repeat.enabled
    ? !draft.repeat.weekdays.length
      ? 'Choose at least one weekday for the repeat pattern.'
      : !draft.repeat.until || draft.repeat.until < draft.startLocal.slice(0, 10)
        ? 'The repeat end date must be on or after the first entry.'
        : ''
    : '';
  const hasConflict = conflicts.length > 0;
  const style = draft ? KIND[draft.kind] : KIND.available;
  const Icon = style.icon;
  const isNew = !draft?.id;

  useEffect(() => {
    setKeepAnyway(false);
  }, [conflictKey, draft?.kind, draft?.startLocal, draft?.endLocal, draft?.staffId]);

  if (!draft) return null;

  const toggleWeekday = (weekday: IsoWeekday) => {
    const selected = draft.repeat.weekdays.includes(weekday);
    onChange({
      repeat: {
        ...draft.repeat,
        weekdays: selected ? draft.repeat.weekdays.filter((day) => day !== weekday) : [...draft.repeat.weekdays, weekday].sort(),
      },
    });
  };

  const setAllDay = (allDay: boolean) => {
    if (allDay) {
      const startDate = draft.startLocal.slice(0, 10);
      const endDate = draft.endLocal.slice(0, 10) || startDate;
      onChange({ allDay: true, startLocal: `${startDate}T00:00`, endLocal: `${endDate}T23:59` });
      return;
    }
    const startDate = draft.startLocal.slice(0, 10);
    const endDate = draft.endLocal.slice(0, 10) || startDate;
    onChange({ allDay: false, startLocal: `${startDate}T09:00`, endLocal: `${endDate}T10:00` });
  };

  const canSubmit = !dateError && !repeatError && (!hasConflict || keepAnyway) && !saving;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        size="lg"
        hideClose
        className="diary-entry-dialog flex max-h-[min(92dvh,860px)] flex-col overflow-hidden p-0"
      >
        <DialogHeader className="flex-row items-center gap-3 border-b border-line px-5 py-4 pr-14">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: style.soft, color: style.color }}>
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle>{isNew ? 'New diary entry' : 'Edit diary entry'}</DialogTitle>
            <DialogDescription>{isNew ? 'Add time to your personal or operational diary.' : 'Update this entry. A planner occurrence is changed on this date only.'}</DialogDescription>
          </div>
          <button type="button" onClick={onClose} aria-label="Close diary entry dialog" className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
            <X className="size-4" />
          </button>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => { event.preventDefault(); if (canSubmit) void onSave(keepAnyway); }}
        >
          <DialogBody className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {error && <div role="alert" className="rounded-lg border border-danger/35 bg-danger-soft/35 px-3 py-2 text-sm text-danger">{error}</div>}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="diary-entry-type">Entry type</Label>
                <Select id="diary-entry-type" value={draft.kind} onChange={(event) => onChange({ kind: event.target.value as EventKind, title: draft.title && draft.title !== KIND[draft.kind].label ? draft.title : '' })}>
                  {TYPE_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.kinds.map((kind) => <option key={kind} value={kind}>{KIND[kind].label}</option>)}
                    </optgroup>
                  ))}
                </Select>
                <p className="text-[11px] text-ink-faint">Use availability for open time, regular hours for your normal operating pattern, and time off or duty for blocking commitments.</p>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="diary-entry-title">Title <span className="font-normal text-ink-faint">· optional</span></Label>
                <Input id="diary-entry-title" value={draft.title} maxLength={120} placeholder={style.label} onChange={(event) => onChange({ title: event.target.value })} />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="diary-entry-notes">Notes / reason <span className="font-normal text-ink-faint">· optional</span></Label>
                <Textarea id="diary-entry-notes" rows={2} value={draft.notes} maxLength={1000} placeholder="Add useful context for staff who can see this entry" onChange={(event) => onChange({ notes: event.target.value })} />
              </div>

              <fieldset className="space-y-3 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <legend className="flex items-center gap-2 text-xs font-bold text-ink-muted"><CalendarDays className="size-4 text-brand-text" />When</legend>
                  <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-xs font-semibold text-ink-muted hover:bg-surface-hover">
                    <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={draft.allDay} onChange={(event) => setAllDay(event.target.checked)} />
                    All day / multi-day
                  </label>
                </div>
                {draft.allDay ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label htmlFor="diary-start-date">From</Label><Input id="diary-start-date" type="date" value={draft.startLocal.slice(0, 10)} onChange={(event) => {
                      const next = event.target.value;
                      onChange({ startLocal: `${next}T00:00`, endLocal: draft.endLocal.slice(0, 10) < next ? `${next}T23:59` : draft.endLocal });
                    }} /></div>
                    <div className="space-y-1.5"><Label htmlFor="diary-end-date">To</Label><Input id="diary-end-date" type="date" value={draft.endLocal.slice(0, 10)} min={draft.startLocal.slice(0, 10)} onChange={(event) => onChange({ endLocal: `${event.target.value}T23:59` })} /></div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label htmlFor="diary-start-time">Starts</Label><Input id="diary-start-time" type="datetime-local" step={900} value={draft.startLocal} aria-invalid={Boolean(dateError && dateError.includes('start'))} onChange={(event) => onChange({ startLocal: event.target.value })} /></div>
                    <div className="space-y-1.5"><Label htmlFor="diary-end-time">Ends</Label><Input id="diary-end-time" type="datetime-local" step={900} value={draft.endLocal} aria-invalid={Boolean(dateError && dateError.includes('end'))} onChange={(event) => onChange({ endLocal: event.target.value })} /></div>
                  </div>
                )}
                {dateError && <p role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-danger"><AlertTriangle className="size-3.5" />{dateError}</p>}
                {!dateError && <p className="flex items-center gap-1.5 text-[11px] text-ink-faint"><Clock3 className="size-3.5" />Times snap to 15 minutes on the calendar. Entries can cross midnight.</p>}
              </fieldset>

              <div className="space-y-1.5">
                <Label htmlFor="diary-entry-owner">User / staff</Label>
                <Select id="diary-entry-owner" value={draft.staffId} disabled={!canRecordForOthers} onChange={(event) => onChange({ staffId: event.target.value })}>
                  {staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}{staff.id === meId ? ' (me)' : ''}</option>)}
                </Select>
                {!canRecordForOthers && <p className="text-[11px] text-ink-faint">You can record entries for your own diary.</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="diary-entry-visibility">Visibility</Label>
                <Select id="diary-entry-visibility" value={draft.visibility} onChange={(event) => onChange({ visibility: event.target.value as EditorDraft['visibility'] })}>
                  <option value="private">Private · only me</option>
                  <option value="staff">Staff · club team</option>
                  <option value="public">Public · public diary</option>
                </Select>
              </div>

              {isNew && (
                <fieldset className="space-y-3 rounded-xl border border-line bg-surface-inset/50 p-3 sm:col-span-2">
                  <legend className="flex items-center gap-2 px-1 text-xs font-bold text-ink-muted"><Repeat className="size-4 text-brand-text" />Weekly repeat</legend>
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs font-semibold text-ink-muted">
                    <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={draft.repeat.enabled} onChange={(event) => onChange({ repeat: { ...draft.repeat, enabled: event.target.checked } })} />
                    Repeat this entry on selected days
                  </label>
                  {draft.repeat.enabled && (
                    <div className="grid gap-3 sm:grid-cols-[1fr_220px] sm:items-end">
                      <div className="space-y-1.5">
                        <span className="block text-[11px] font-semibold text-ink-faint">Repeat every week on</span>
                        <div className="flex flex-wrap gap-1.5">
                          {WEEKDAYS.map((day, index) => {
                            const weekday = (index + 1) as IsoWeekday;
                            const active = draft.repeat.weekdays.includes(weekday);
                            return <button key={day} type="button" aria-label={`Repeat on ${WEEKDAYS_LONG[index]}`} aria-pressed={active} onClick={() => toggleWeekday(weekday)} className={`min-h-9 min-w-10 rounded-lg border px-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${active ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface text-ink-muted hover:bg-surface-hover'}`}>{day}</button>;
                          })}
                        </div>
                      </div>
                      <div className="space-y-1.5"><Label htmlFor="diary-repeat-until">Repeat until</Label><Input id="diary-repeat-until" type="date" min={draft.startLocal.slice(0, 10)} value={draft.repeat.until} onChange={(event) => onChange({ repeat: { ...draft.repeat, until: event.target.value } })} /></div>
                      {repeatError && <p role="alert" className="text-xs font-semibold text-danger sm:col-span-2">{repeatError}</p>}
                    </div>
                  )}
                </fieldset>
              )}
            </div>

            {hasConflict && (
              <section aria-label="Booking conflict preview" className="rounded-xl border border-danger/35 bg-danger-soft/35 p-3">
                <div className="flex items-start gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger"><AlertTriangle className="size-4" /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-danger">This blocking entry overlaps scheduled time</h3><Badge tone="danger" size="sm">{conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}</Badge></div>
                    <p className="mt-1 text-xs leading-relaxed text-ink">The other booking or commitment will not move. Any booking conflict stays flagged until it is resolved.</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {conflicts.slice(0, 4).map((conflict) => <li key={conflict.assignment.id} className="rounded-lg border border-danger/20 bg-surface/70 px-3 py-2 text-xs leading-relaxed text-ink">{conflict.message}</li>)}
                </ul>
                <label className="mt-3 flex min-h-10 cursor-pointer items-start gap-2 rounded-lg border border-danger/25 bg-surface/60 p-2.5 text-xs font-bold text-danger">
                  <input type="checkbox" className="mt-0.5 size-4 accent-[var(--danger)]" checked={keepAnyway} onChange={(event) => setKeepAnyway(event.target.checked)} />
                  Keep anyway — save despite the overlap and leave any booking conflict flagged for review.
                </label>
              </section>
            )}
          </DialogBody>

          <DialogFooter className="justify-between gap-3 bg-surface-inset/60 px-5 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {onDelete && !isNew && <Button type="button" intent={confirmDelete ? 'danger' : 'ghost'} size="md" disabled={saving} onClick={() => {
                if (!confirmDelete) { setConfirmDelete(true); return; }
                void onDelete();
              }}><Trash2 className="size-4" />{confirmDelete ? 'Confirm delete' : 'Delete'}</Button>}
              {confirmDelete && <span className="w-full text-xs font-semibold text-danger">This personal entry will be removed. Confirm delete to continue.</span>}
            </div>
            <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
              <Button type="button" intent="ghost" size="md" disabled={saving} onClick={onClose}>Cancel</Button>
              <Button type="submit" intent="primary" size="md" loading={saving} disabled={!canSubmit}><Check className="size-4" />Save</Button>
              {isNew && <Button type="button" intent="secondary" size="md" loading={saving} disabled={!canSubmit || !draft.repeat.enabled} onClick={() => void onSaveAndRepeat(keepAnyway)}><Repeat className="size-4" />Save &amp; repeat</Button>}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function makeEditorDraft({
  staffId, start, end, kind = 'available', allDay = false, event,
}: {
  staffId: string;
  start: Date;
  end: Date;
  kind?: EventKind;
  allDay?: boolean;
  event?: DiaryEvent;
}): EditorDraft {
  const startValue = event ? toLocalInput(new Date(event.start)) : toLocalInput(start);
  const endValue = event ? toLocalInput(new Date(event.end)) : toLocalInput(end);
  const initialStart = event ? new Date(event.start) : start;
  return {
    id: event?.id,
    staffId: event?.staffId ?? staffId,
    title: event?.title ?? '',
    kind: event?.kind ?? kind,
    startLocal: startValue,
    endLocal: endValue,
    allDay: event?.allDay ?? allDay,
    notes: event?.notes ?? '',
    visibility: event?.visibility ?? 'staff',
    repeat: { enabled: false, weekdays: [((initialStart.getDay() + 6) % 7 + 1) as IsoWeekday], until: dateKey(new Date(initialStart.getTime() + 28 * 86_400_000)) },
    system: event?.system,
    sourceType: event?.sourceType,
    staffName: event?.staffName,
    linkTo: event?.linkTo,
    rateCents: event?.rateCents,
    rateLabel: event?.rateLabel,
    coachRole: event?.coachRole,
  };
}
