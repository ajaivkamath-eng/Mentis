import { useEffect, useId, useState } from 'react';
import { Plus, Tag } from 'lucide-react';
import type { BatchGrouping } from '@mentis/core';
import { batchGroupingStatusForDates } from '@mentis/core';
import { supabase } from '../../lib/supabase';
import { demoEnabled } from '../../lib/demo';
import { Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Select, Textarea, toast } from '../ui';

export interface BatchGroupingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId?: string;
  initialName?: string;
  initialCode?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  onCreated: (grouping: BatchGrouping) => void;
}

const isoToday = () => new Date().toISOString().slice(0, 10);
const nextYear = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Small, reusable creation dialog shared by program-run and weekly-pattern flows. */
export function BatchGroupingModal({
  open,
  onOpenChange,
  organizationId,
  initialName = '',
  initialCode = '',
  initialStartDate,
  initialEndDate,
  onCreated,
}: BatchGroupingModalProps) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(initialCode);
  const [startDate, setStartDate] = useState(initialStartDate ?? isoToday());
  const [endDate, setEndDate] = useState(initialEndDate ?? nextYear(initialStartDate ?? isoToday()));
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const start = initialStartDate ?? isoToday();
    setName(initialName);
    setCode(initialCode);
    setStartDate(start);
    setEndDate(initialEndDate ?? nextYear(start));
    setDescription('');
  }, [open, initialName, initialCode, initialStartDate, initialEndDate]);

  const save = async () => {
    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanName || !cleanCode || !startDate || !endDate) {
      toast.error('Complete the required batch grouping fields');
      return;
    }
    if (!/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(cleanCode)) {
      toast.error('Use 2–20 letters, numbers, hyphens or underscores for the code');
      return;
    }
    if (endDate < startDate) {
      toast.error('The end date must be on or after the start date');
      return;
    }

    setSaving(true);
    const status = batchGroupingStatusForDates(startDate, endDate);
    if (demoEnabled) {
      const grouping: BatchGrouping = {
        id: globalThis.crypto?.randomUUID?.() ?? `demo-batch-${Date.now()}`,
        name: cleanName,
        code: cleanCode,
        startDate,
        endDate,
        status,
        description: description.trim() || undefined,
      };
      onCreated(grouping);
      setSaving(false);
      onOpenChange(false);
      toast.success('Batch grouping created', { description: `${grouping.name} · ${grouping.code}` });
      return;
    }

    if (!organizationId) {
      setSaving(false);
      toast.error('Choose an organisation before creating a batch grouping');
      return;
    }

    const { data, error } = await supabase
      .from('mentis_batch_groupings')
      .insert({
        organization_id: organizationId,
        name: cleanName,
        code: cleanCode,
        start_date: startDate,
        end_date: endDate,
        status,
        description: description.trim() || null,
      })
      .select('id,name,code,start_date,end_date,status,description')
      .single();
    setSaving(false);
    if (error || !data) {
      toast.error('Could not create batch grouping', { description: error?.message ?? 'Please try again.' });
      return;
    }

    const grouping: BatchGrouping = {
      id: data.id,
      name: data.name,
      code: data.code,
      startDate: data.start_date,
      endDate: data.end_date,
      status: data.status,
      description: data.description ?? undefined,
    };
    onCreated(grouping);
    onOpenChange(false);
    toast.success('Batch grouping created', { description: `${grouping.name} · ${grouping.code}` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Create a batch / season grouping</DialogTitle>
          <DialogDescription>
            Create a cohort once, then assign it to program runs, weekly patterns, and their generated sessions.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <label className="block text-xs font-semibold text-ink-muted" htmlFor="batch-grouping-name">
            Name <span className="text-danger">*</span>
            <Input id="batch-grouping-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="2026/2027 Academic Year" className="mt-1" />
          </label>
          <label className="block text-xs font-semibold text-ink-muted" htmlFor="batch-grouping-code">
            Code <span className="text-danger">*</span>
            <Input id="batch-grouping-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="AY-2627" maxLength={20} className="mt-1" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-ink-muted" htmlFor="batch-grouping-start-date">
              Start date <span className="text-danger">*</span>
              <Input id="batch-grouping-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1" />
            </label>
            <label className="block text-xs font-semibold text-ink-muted" htmlFor="batch-grouping-end-date">
              End date <span className="text-danger">*</span>
              <Input id="batch-grouping-end-date" type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1" />
            </label>
          </div>
          <label className="block text-xs font-semibold text-ink-muted" htmlFor="batch-grouping-description">
            Description <span className="font-normal text-ink-faint">(optional)</span>
            <Textarea id="batch-grouping-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Notes about this cohort or season" rows={2} className="mt-1" />
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
            <Tag className="size-3.5 shrink-0" />
            The grouping status is set from its dates: upcoming, active, or completed.
          </div>
        </DialogBody>
        <DialogFooter>
          <Button intent="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void save()} loading={saving} disabled={saving || !name.trim() || !code.trim() || !startDate || !endDate}>
            <Plus className="size-3.5" /> Create grouping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface BatchGroupingFieldProps {
  value: string;
  groupings: BatchGrouping[];
  organizationId?: string;
  onChange: (id: string) => void;
  onCreated?: (grouping: BatchGrouping) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  initialStartDate?: string;
  initialEndDate?: string;
  compact?: boolean;
}

/** Existing-group selector with the inline create affordance required by both flows. */
export function BatchGroupingField({
  value,
  groupings,
  organizationId,
  onChange,
  onCreated,
  label = 'Batch / Season Grouping',
  required = true,
  disabled,
  initialStartDate,
  initialEndDate,
  compact = false,
}: BatchGroupingFieldProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const selectId = useId();
  const [createdDefaults, setCreatedDefaults] = useState({ startDate: initialStartDate, endDate: initialEndDate });

  const handleCreate = () => {
    setCreatedDefaults({ startDate: initialStartDate, endDate: initialEndDate });
    setCreateOpen(true);
  };

  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor={selectId} className="block text-xs font-semibold tracking-[0.01em] text-ink-muted">
          {label}{required && <span className="ml-0.5 text-danger">*</span>}
        </label>
        <div className={`flex flex-col gap-2 ${compact ? 'sm:flex-row' : 'sm:flex-row'}`}>
          <Select
            id={selectId}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required={required}
            disabled={disabled}
            aria-label={label}
            className="min-w-0 flex-1"
          >
            <option value="">Select an existing batch grouping…</option>
            {groupings.map((grouping) => (
              <option key={grouping.id} value={grouping.id}>
                {grouping.name} · {grouping.code} · {grouping.status}
              </option>
            ))}
          </Select>
          <Button type="button" size="sm" intent="secondary" onClick={handleCreate} disabled={disabled}>
            <Plus className="size-3.5" /> Create new
          </Button>
        </div>
      </div>
      <BatchGroupingModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizationId={organizationId}
        initialStartDate={createdDefaults.startDate}
        initialEndDate={createdDefaults.endDate}
        onCreated={(grouping) => {
          onCreated?.(grouping);
          onChange(grouping.id);
        }}
      />
    </>
  );
}
