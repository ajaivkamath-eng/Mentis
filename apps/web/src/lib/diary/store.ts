/**
 * Diary data layer.
 *
 * One interface, two adapters:
 *  - Demo (design-review) mode — seeded in-memory dataset that supports every
 *    calendar interaction (create, move, resize, copy/paste, planner apply,
 *    conflict resolution, undo/redo).
 *  - Live mode — Supabase. Diary entries live in `mentis_staff_availability`,
 *    sessions in `mentis_session_staffing` (+ sessions/venues/rate cards),
 *    tasks in `mentis_tasks`, planner patterns in `mentis_availability_rules`
 *    and conflicts in `mentis_diary_conflicts`.
 *
 * Planner patterns are *expanded on load*: generated occurrences are virtual
 * until the coach edits one, which writes an exception row
 * (`source_type='planner'`, `rule_id`, `occurrence_date`) — the pattern itself
 * is never mutated by a single-occurrence edit.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  conflictMessage, expandAvailabilityPattern, type AvailabilityRule, type ConflictRecord,
  type DiaryEvent, type DiarySourceType, type IsoWeekday,
} from '@mentis/core';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import { demoEnabled, isDemoSession } from '../demo';
import { KIND, addDays, dateKey, type EventKind } from './model';
import { buildDemoDiary, DEMO_ME, type DemoStaff } from './demo';

export interface StaffOption { id: string; name: string; roles: string[]; initials: string }

export interface EntryDraft {
  staffId: string;
  title: string;
  kind: EventKind;
  start: Date;
  end: Date;
  allDay?: boolean;
  notes?: string;
  visibility?: 'private' | 'staff' | 'public';
  /** Save-and-repeat: weekly on the given weekdays until the date (yyyy-mm-dd). */
  repeat?: { weekdays: IsoWeekday[]; until: string } | null;
}

export interface RuleDraft {
  id?: string;
  staffId: string;
  label: string;
  pattern: { weekday: IsoWeekday; windows: { start: string; end: string }[] }[];
  effectiveFrom: string;
  effectiveTo: string | null;
  scope: 'one_month' | 'indefinite' | 'custom';
}

export interface DiaryState {
  events: DiaryEvent[];
  rules: AvailabilityRule[];
  conflicts: ConflictRecord[];
  staff: StaffOption[];
  meId: string;
  loading: boolean;
  range: { from: string; to: string };
}

export interface DiaryOps {
  refresh(): Promise<void>;
  createEntry(draft: EntryDraft): Promise<DiaryEvent | null>;
  updateEntry(id: string, patch: Partial<EntryDraft>): Promise<void>;
  deleteEntries(ids: string[]): Promise<void>;
  duplicateEntry(id: string, staffId?: string): Promise<DiaryEvent | null>;
  saveRule(draft: RuleDraft): Promise<'saved'>;
  deleteRule(id: string): Promise<void>;
  setConflictStatus(id: string, status: 'acknowledged' | 'resolved'): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  canUndo(): boolean;
  canRedo(): boolean;
}

const initialsOf = (name: string) =>
  name.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';

const blockingKind = (k: EventKind) => KIND[k]?.blocking === true;

/* ------------------------------------------------------------------ */
/* Demo adapter                                                        */
/* ------------------------------------------------------------------ */

interface HistoryStep { label: string; undo(): Promise<void> | void; redo(): Promise<void> | void }

function createDemoStore(): DiaryOps & { state(): DiaryState; version: number; bump(): void } {
  const seed = buildDemoDiary();
  const events = new Map<string, DiaryEvent>(seed.events.map((e) => [e.id, e]));
  const rules = new Map<string, AvailabilityRule>(seed.rules.map((r) => [r.id, { ...r }]));
  const conflicts = new Map<string, ConflictRecord>(
    seed.conflicts.map((c, i) => [`cf-${i}`, { ...c, id: `cf-${i}`, status: 'open', blocker: { ...c.blocker }, assignment: { ...c.assignment } }]),
  );
  let ci = seed.conflicts.length;

  const staff: StaffOption[] = seed.staff.map((s) => ({ id: s.id, name: s.name, roles: s.roles, initials: s.initials }));
  let history: HistoryStep[] = [];
  let hIndex = 0;
  let version = 0;
  const listeners = new Set<() => void>();

  const bump = () => {
    version += 1;
    listeners.forEach((l) => l());
  };
  const pushHistory = (step: HistoryStep) => {
    history = history.slice(0, hIndex);
    history.push(step);
    hIndex = history.length;
  };

  /** Generated occurrences: `${ruleId}|${date}|${HH:MM}` */
  const occurrenceKey = (e: DiaryEvent) => (e.ruleId && e.id.startsWith('gen:')
    ? `${e.ruleId}|${dateKey(new Date(e.start))}|${e.start.slice(11, 16)}`
    : null);
  const suppress = new Map<string, 'remove' | DiaryEvent>(); // key → removed or replacing entry

  const visibleEvents = (): DiaryEvent[] => {
    const out: DiaryEvent[] = [];
    for (const e of events.values()) {
      const key = occurrenceKey(e);
      if (key && suppress.has(key)) {
        const s = suppress.get(key);
        if (s === 'remove') continue;
        out.push({ ...(s as DiaryEvent), id: e.id, ruleId: e.ruleId, exceptionStatus: 'exception' });
        continue;
      }
      out.push(e);
    }
    return out;
  };

  const recomputeConflicts = () => {
    const list = visibleEvents();
    const blockers = list.filter((e) => blockingKind(e.kind));
    const assignments = list.filter((e) => e.kind === 'session' || e.kind === 'task');
    const found: ConflictRecord[] = [];
    for (const b of blockers) {
      for (const a of assignments) {
        if (b.staffId !== a.staffId) continue;
        const mins = Math.max(0, Math.round((Math.min(Date.parse(a.end), Date.parse(b.end)) - Math.max(Date.parse(a.start), Date.parse(b.start))) / 60000));
        if (mins <= 0) continue;
        const existing = [...conflicts.values()].find((c) => c.blocker.id === b.id && c.assignment.id === a.id);
        if (existing) { found.push(existing); continue; }
        b.conflictStatus = 'open'; a.conflictStatus = 'open';
        found.push({
          id: `cf-${ci++}`, status: 'open', staffId: b.staffId, staffName: b.staffName,
          blocker: b, assignment: a, overlapMinutes: mins,
          message: conflictMessage(b.staffName ?? 'This coach', b, a),
        });
      }
    }
    conflicts.clear();
    for (const c of found) conflicts.set(c.id!, c);
  };

  const expandRule = (rule: AvailabilityRule) => {
    const from = dateKey(addDays(new Date(), -35));
    const to = dateKey(addDays(new Date(), 70));
    for (const g of expandAvailabilityPattern(rule, from, to)) {
      const gid = `gen:${g.ruleId}:${g.date}:${g.startLocal.slice(11, 16)}`;
      events.set(gid, {
        id: gid, staffId: g.staffId, staffName: staff.find((s) => s.id === g.staffId)?.name,
        title: g.title, kind: g.kind,
        start: new Date(g.startLocal).toISOString(), end: new Date(g.endLocal).toISOString(),
        sourceType: 'planner', ruleId: g.ruleId, system: true, exceptionStatus: 'none',
      });
    }
  };
  for (const r of rules.values()) expandRule(r);
  recomputeConflicts();

  const api = {
    version,
    bump,
    subscribe: (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    state: (): DiaryState => ({
      events: visibleEvents(),
      rules: [...rules.values()],
      conflicts: [...conflicts.values()],
      staff,
      meId: DEMO_ME,
      loading: false,
      range: { from: dateKey(addDays(new Date(), -35)), to: dateKey(addDays(new Date(), 70)) },
    }),

    refresh: async () => { bump(); },

    createEntry: async (draft: EntryDraft): Promise<DiaryEvent | null> => {
      const created: DiaryEvent[] = [];
      const make = (start: Date, end: Date, idStr: string): DiaryEvent => ({
        id: idStr, staffId: draft.staffId,
        staffName: staff.find((s) => s.id === draft.staffId)?.name,
        title: draft.title || KIND[draft.kind].label,
        kind: draft.kind, start: start.toISOString(), end: end.toISOString(),
        allDay: draft.allDay, notes: draft.notes, sourceType: 'manual',
        visibility: draft.visibility ?? 'staff', exceptionStatus: 'none',
      });
      const baseId = `ent-${Date.now().toString(36)}`;
      created.push(make(draft.start, draft.end, baseId));

      if (draft.repeat && draft.repeat.weekdays.length) {
        const until = new Date(`${draft.repeat.until}T23:59:59`);
        let cursor = new Date(draft.start);
        let count = 0;
        while (cursor <= until && count < 60) {
          cursor = addDays(cursor, 1);
          const wd = ((cursor.getDay() + 6) % 7 + 1) as IsoWeekday;
          if (!draft.repeat.weekdays.includes(wd)) continue;
          const dur = draft.end.getTime() - draft.start.getTime();
          const start = new Date(cursor);
          start.setHours(draft.start.getHours(), draft.start.getMinutes(), 0, 0);
          const end = new Date(start.getTime() + dur);
          created.push(make(start, end, `${baseId}-r${count}`));
          count += 1;
        }
      }

      for (const c of created) events.set(c.id, c);
      recomputeConflicts();
      const snapshot = created.map((c) => c.id);
      pushHistory({
        label: 'create entry',
        undo: () => { snapshot.forEach((sid) => events.delete(sid)); recomputeConflicts(); bump(); },
        redo: () => {
          for (const c of created) events.set(c.id, c);
          recomputeConflicts(); bump();
        },
      });
      bump();
      return created[0] ?? null;
    },

    updateEntry: async (id: string, patch: Partial<EntryDraft>) => {
      const prev = events.get(id);
      if (!prev) return;
      const next: DiaryEvent = {
        ...prev,
        title: patch.title ?? prev.title,
        kind: patch.kind ?? prev.kind,
        start: patch.start ? patch.start.toISOString() : prev.start,
        end: patch.end ? patch.end.toISOString() : prev.end,
        allDay: patch.allDay ?? prev.allDay,
        notes: patch.notes ?? prev.notes,
        visibility: patch.visibility ?? prev.visibility,
        staffId: patch.staffId ?? prev.staffId,
      };
      if (prev.sourceType === 'planner') {
        // Single-occurrence exception: never mutate the pattern itself.
        const key = `${prev.ruleId}|${dateKey(new Date(prev.start))}|${prev.start.slice(11, 16)}`;
        suppress.set(key, { ...next, sourceType: 'manual', system: false, exceptionStatus: 'exception' });
      } else {
        events.set(id, next);
      }
      recomputeConflicts();
      pushHistory({
        label: 'edit entry',
        undo: () => {
          if (prev.sourceType === 'planner') suppress.delete(`${prev.ruleId}|${dateKey(new Date(prev.start))}|${prev.start.slice(11, 16)}`);
          else events.set(id, prev);
          recomputeConflicts(); bump();
        },
        redo: () => {
          if (prev.sourceType === 'planner') suppress.set(`${prev.ruleId}|${dateKey(new Date(prev.start))}|${prev.start.slice(11, 16)}`, { ...next, sourceType: 'manual', system: false, exceptionStatus: 'exception' });
          else events.set(id, next);
          recomputeConflicts(); bump();
        },
      });
      bump();
    },

    deleteEntries: async (ids: string[]) => {
      const removed: DiaryEvent[] = [];
      const removedKeys: string[] = [];
      for (const id of ids) {
        const ev = events.get(id);
        if (!ev) continue;
        removed.push(ev);
        if (ev.sourceType === 'planner') {
          const key = `${ev.ruleId}|${dateKey(new Date(ev.start))}|${ev.start.slice(11, 16)}`;
          suppress.set(key, 'remove');
          removedKeys.push(key);
        } else {
          events.delete(id);
        }
      }
      recomputeConflicts();
      pushHistory({
        label: 'delete entries',
        undo: () => {
          for (const ev of removed) {
            if (ev.sourceType === 'planner') suppress.delete(`${ev.ruleId}|${dateKey(new Date(ev.start))}|${ev.start.slice(11, 16)}`);
            else events.set(ev.id, ev);
          }
          recomputeConflicts(); bump();
        },
        redo: () => {
          for (const ev of removed) {
            if (ev.sourceType === 'planner') suppress.set(`${ev.ruleId}|${dateKey(new Date(ev.start))}|${ev.start.slice(11, 16)}`, 'remove');
            else events.delete(ev.id);
          }
          recomputeConflicts(); bump();
        },
      });
      bump();
    },

    duplicateEntry: async (id: string, staffId?: string) => {
      const src = events.get(id);
      if (!src) return null;
      const copy: DiaryEvent = {
        ...src,
        id: `ent-${Date.now().toString(36)}-copy`,
        staffId: staffId ?? src.staffId,
        sourceType: 'manual', system: false, ruleId: null,
        conflictStatus: 'none', exceptionStatus: 'none',
        title: src.title,
      };
      events.set(copy.id, copy);
      recomputeConflicts();
      pushHistory({
        label: 'duplicate entry',
        undo: () => { events.delete(copy.id); recomputeConflicts(); bump(); },
        redo: () => { events.set(copy.id, copy); recomputeConflicts(); bump(); },
      });
      bump();
      return copy;
    },

    saveRule: async (draft: RuleDraft) => {
      const id = draft.id ?? `rule-${Date.now().toString(36)}`;
      const prev = rules.get(id);
      const rule: AvailabilityRule = {
        id, staffId: draft.staffId, label: draft.label || 'Regular availability',
        pattern: draft.pattern, effectiveFrom: draft.effectiveFrom,
        effectiveTo: draft.effectiveTo, scope: draft.scope, isActive: true,
      };
      // Re-materialise: drop this rule's previous generated occurrences.
      for (const [eid, e] of [...events]) if (e.ruleId === id && e.id.startsWith('gen:')) events.delete(eid);
      rules.set(id, rule);
      expandRule(rule);
      recomputeConflicts();
      pushHistory({
        label: 'save pattern',
        undo: () => {
          if (prev) { rules.set(id, prev); expandRule(prev); } else {
            rules.delete(id);
            for (const [eid, e] of [...events]) if (e.ruleId === id) events.delete(eid);
          }
          recomputeConflicts(); bump();
        },
        redo: () => {
          for (const [eid, e] of [...events]) if (e.ruleId === id && e.id.startsWith('gen:')) events.delete(eid);
          rules.set(id, rule); expandRule(rule);
          recomputeConflicts(); bump();
        },
      });
      bump();
      return 'saved' as const;
    },

    deleteRule: async (id: string) => {
      const prev = rules.get(id);
      if (!prev) return;
      const removedGen = [...events.values()].filter((e) => e.ruleId === id);
      rules.delete(id);
      removedGen.forEach((e) => events.delete(e.id));
      recomputeConflicts();
      pushHistory({
        label: 'delete pattern',
        undo: () => { rules.set(id, prev); expandRule(prev); recomputeConflicts(); bump(); },
        redo: () => {
          rules.delete(id);
          removedGen.forEach((e) => events.delete(e.id));
          recomputeConflicts(); bump();
        },
      });
      bump();
    },

    setConflictStatus: async (id: string, status: 'acknowledged' | 'resolved') => {
      const c = conflicts.get(id);
      if (!c) return;
      const prev = c.status ?? 'open';
      c.status = status;
      if (status === 'resolved') {
        c.assignment.conflictStatus = 'resolved';
        c.blocker.conflictStatus = 'resolved';
      } else {
        c.assignment.conflictStatus = 'acknowledged';
      }
      pushHistory({
        label: `${status} conflict`,
        undo: () => { c.status = prev; c.assignment.conflictStatus = prev === 'resolved' ? 'resolved' : 'open'; c.blocker.conflictStatus = c.assignment.conflictStatus; bump(); },
        redo: () => { c.status = status; c.assignment.conflictStatus = status === 'resolved' ? 'resolved' : status; c.blocker.conflictStatus = status === 'resolved' ? 'resolved' : 'open'; bump(); },
      });
      bump();
    },

    undo: async () => {
      if (hIndex > 0) { hIndex -= 1; await history[hIndex].undo(); }
    },
    redo: async () => {
      if (hIndex < history.length) { await history[hIndex].redo(); hIndex += 1; }
    },
    canUndo: () => hIndex > 0,
    canRedo: () => hIndex < history.length,
  };
  return api;
}

/* ------------------------------------------------------------------ */
/* Live adapter                                                        */
/* ------------------------------------------------------------------ */

type AnyRow = Record<string, any>;

async function loadLive(meOrgId: string, staffIds: string[]): Promise<DiaryState> {
  const fromIso = new Date(Date.now() - 40 * 86400000).toISOString();
  const toIso = new Date(Date.now() + 75 * 86400000).toISOString();

  const [staffRes, availRes, rulesRes, conflictsRes] = await Promise.all([
    supabase.from('mentis_staff').select('id, display_name, roles'),
    supabase.from('mentis_staff_availability').select('*, mentis_staff!staff_availability_staff_id_fkey(display_name)')
      .in('staff_id', staffIds.length ? staffIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('starts_at', fromIso).lte('starts_at', toIso).limit(2000),
    supabase.from('mentis_availability_rules').select('*').in('staff_id', staffIds.length ? staffIds : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('mentis_diary_conflicts').select('*').neq('status', 'resolved')
      .in('staff_id', staffIds.length ? staffIds : ['00000000-0000-0000-0000-000000000000']).limit(200),
  ]);
  if (availRes.error) throw availRes.error;

  const staffList: StaffOption[] = (staffRes.data ?? []).map((s: AnyRow) => ({
    id: s.id, name: s.display_name, roles: s.roles ?? [], initials: initialsOf(s.display_name),
  }));
  const nameOf = (sid: string) => staffList.find((s) => s.id === sid)?.name;

  const events: DiaryEvent[] = [];

  // Manual + planner-exception diary entries.
  for (const r of availRes.data ?? []) {
    const kindRaw = (r.availability_type ?? 'unavailable_other') as EventKind;
    let kind: EventKind = kindRaw;
    if (r.available === false && !KIND[kind]?.blocking) kind = 'unavailable_other';
    if (r.available === true && KIND[kind]?.blocking) kind = 'available';
    if (r.exception_status === 'exception' && r.available === false && r.visibility === 'private') continue; // removal marker
    events.push({
      id: r.id, staffId: r.staff_id, staffName: r.mentis_staff?.display_name ?? nameOf(r.staff_id),
      title: r.title || r.reason || KIND[kind].label, kind,
      start: r.starts_at, end: r.ends_at, allDay: false,
      notes: r.reason, sourceType: (r.source_type ?? 'manual') as DiarySourceType,
      ruleId: r.rule_id ?? null, system: r.source_type === 'planner',
      exceptionStatus: r.exception_status ?? 'none',
      conflictStatus: r.conflict_status ?? 'none',
      visibility: r.visibility ?? 'staff',
    });
  }

  // Sessions (partial allocations included) + tasks, clipped to the window.
  const sessFrom = new Date(Date.now() - 10 * 86400000).toISOString();
  const sessTo = new Date(Date.now() + 45 * 86400000).toISOString();
  const [staffingRes, ratesRes, tasksRes] = await Promise.all([
    supabase.from('mentis_session_staffing').select(`
      id, session_id, staff_id, capacity, planned_start, planned_end,
      mentis_staff(display_name),
      mentis_sessions(id, name, start_at, end_at, venue_id, mentis_venues(name))`)
      .in('staff_id', staffIds.length ? staffIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('planned_end', sessFrom).lte('planned_start', sessTo).limit(1000),
    supabase.from('mentis_rate_cards').select('id, staff_id, label, rate_cents, valid_from'),
    supabase.from('mentis_tasks').select('id, title, assignee_id, due_at, work_hours, amount_cents')
      .in('assignee_id', staffIds.length ? staffIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('due_at', sessFrom).lte('due_at', sessTo).limit(300),
  ]);

  const rateOf = (sid: string) => (ratesRes.data ?? []).filter((r: AnyRow) => r.staff_id === sid)
    .sort((a: AnyRow, b: AnyRow) => (a.valid_from < b.valid_from ? 1 : -1))[0];

  for (const s of staffingRes.data ?? []) {
    const role = s.capacity === 'sparrer' ? 'spare' : (s.capacity as 'lead' | 'assistant');
    const rate = rateOf(s.staff_id);
    const sess = (s.mentis_sessions ?? {}) as AnyRow;
    const venueName = Array.isArray(sess.mentis_venues) ? (sess.mentis_venues[0] as AnyRow | undefined)?.name : (sess.mentis_venues as AnyRow | undefined)?.name;
    const staffName = Array.isArray(s.mentis_staff) ? (s.mentis_staff[0] as AnyRow | undefined)?.display_name : (s.mentis_staff as AnyRow | undefined)?.display_name;
    events.push({
      id: s.id, staffId: s.staff_id, staffName: staffName ?? nameOf(s.staff_id),
      title: sess.name ?? 'Session', kind: 'session', coachRole: role,
      start: s.planned_start, end: s.planned_end,
      location: venueName ?? null,
      sourceType: 'session', sourceId: s.session_id, system: true,
      chargeable: true, rateCents: rate?.rate_cents ?? null, rateLabel: rate?.label ?? null,
      linkTo: `/register/${s.session_id}`,
    });
  }

  for (const t of tasksRes.data ?? []) {
    const end = t.due_at ? new Date(t.due_at) : null;
    if (!end) continue;
    const hours = Number(t.work_hours ?? 2);
    const start = new Date(end.getTime() - hours * 3600000);
    const rate = rateOf(t.assignee_id);
    events.push({
      id: t.id, staffId: t.assignee_id, staffName: nameOf(t.assignee_id),
      title: t.title, kind: 'task', start: start.toISOString(), end: end.toISOString(),
      sourceType: 'task', sourceId: t.id, system: true,
      chargeable: (t.amount_cents ?? 0) > 0, rateCents: rate?.rate_cents ?? null, rateLabel: rate?.label ?? null,
    });
  }

  // Planner rules → virtual occurrences.
  const rules: AvailabilityRule[] = (rulesRes.data ?? []).map((r: AnyRow) => ({
    id: r.id, staffId: r.staff_id, label: r.label, pattern: r.pattern,
    effectiveFrom: r.effective_from, effectiveTo: r.effective_to ?? null,
    scope: r.scope ?? 'indefinite', isActive: r.is_active ?? true,
  }));
  const window = { from: dateKey(new Date(Date.now() - 40 * 86400000)), to: dateKey(new Date(Date.now() + 75 * 86400000)) };
  for (const rule of rules) {
    for (const g of expandAvailabilityPattern(rule, window.from, window.to)) {
      events.push({
        id: `gen:${g.ruleId}:${g.date}:${g.startLocal.slice(11, 16)}`,
        staffId: g.staffId, staffName: nameOf(g.staffId), title: g.title, kind: g.kind,
        start: new Date(g.startLocal).toISOString(), end: new Date(g.endLocal).toISOString(),
        sourceType: 'planner', ruleId: g.ruleId, system: true, exceptionStatus: 'none',
      });
    }
  }

  // Suppress occurrences that carry an exception row.
  const exceptions = (availRes.data ?? []).filter((r: AnyRow) => r.rule_id && r.occurrence_date && r.source_type === 'planner');
  const events2 = events.filter((e) => {
    if (!e.id.startsWith('gen:')) return true;
    return !exceptions.some((x: AnyRow) =>
      x.rule_id === e.ruleId
      && x.occurrence_date === e.start.slice(0, 10)
      && (x.starts_at ?? '').slice(11, 16) === e.start.slice(11, 16));
  });

  const conflicts: ConflictRecord[] = [];
  for (const c of conflictsRes.data ?? []) {
    const blocker = events2.find((e) => e.id === c.availability_id);
    const assignment = events2.find((e) => e.id === c.staffing_id || (e.kind === 'task' && e.id === c.task_id));
    if (!blocker || !assignment) continue;
    conflicts.push({
      staffId: c.staff_id, staffName: blocker.staffName, blocker, assignment,
      overlapMinutes: c.overlap_minutes, message: c.message,
    });
    blocker.conflictStatus = c.status; assignment.conflictStatus = c.status;
  }

  return {
    events: events2, rules, conflicts, staff: staffList,
    meId: '', loading: false, range: window,
  };
}

function createLiveStore(meStaffId: string, orgId: string) {
  let state: DiaryState = { events: [], rules: [], conflicts: [], staff: [], meId: meStaffId, loading: true, range: { from: '', to: '' } };
  const listeners = new Set<() => void>();
  const bump = () => listeners.forEach((l) => l());
  const setState = (patch: Partial<DiaryState>) => { state = { ...state, ...patch }; bump(); };
  const history: HistoryStep[] = [];
  let hIndex = 0;
  const push = (s: HistoryStep) => { history.splice(hIndex); history.push(s); hIndex = history.length; };

  const refresh = async () => {
    setState({ loading: true });
    try {
      const ids = state.staff.length ? state.staff.map((s) => s.id) : [];
      const next = await loadLive(orgId, ids);
      setState({ ...next, meId: meStaffId, loading: false });
    } catch {
      setState({ loading: false });
    }
  };

  const kindValue = (kind: EventKind) => (kind === 'session' || kind === 'task' ? 'other' : kind);

  const api: DiaryOps & { state(): DiaryState; subscribe(cb: () => void): () => void; loadStaff(): Promise<void> } = {
    state: () => state,
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    loadStaff: async () => {
      const { data } = await supabase.from('mentis_staff').select('id, display_name, roles');
      setState({ staff: (data ?? []).map((s: AnyRow) => ({ id: s.id, name: s.display_name, roles: s.roles ?? [], initials: initialsOf(s.display_name) })) });
    },
    refresh,
    createEntry: async (draft) => {
      const row = {
        organization_id: orgId, staff_id: draft.staffId,
        starts_at: draft.start.toISOString(), ends_at: draft.end.toISOString(),
        available: !blockingKind(draft.kind), availability_type: kindValue(draft.kind),
        title: draft.title || KIND[draft.kind].label, reason: draft.notes || null,
        source_type: 'manual', visibility: draft.visibility ?? 'staff',
        recorded_by: meStaffId, created_by: meStaffId,
      };
      const { data, error } = await supabase.from('mentis_staff_availability').insert(row).select().single();
      if (error) throw error;
      await refresh();
      const id = (data as AnyRow).id;
      push({ label: 'create', undo: async () => { await supabase.from('mentis_staff_availability').delete().eq('id', id); await refresh(); }, redo: async () => { await supabase.from('mentis_staff_availability').insert(row); await refresh(); } });
      return null;
    },
    updateEntry: async (id, patch) => {
      const prevRow: AnyRow = {};
      const row: AnyRow = {};
      if (patch.start) row.starts_at = patch.start.toISOString();
      if (patch.end) row.ends_at = patch.end.toISOString();
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.notes !== undefined) row.reason = patch.notes;
      if (patch.kind) { row.availability_type = kindValue(patch.kind); row.available = !blockingKind(patch.kind); }
      if (patch.staffId) row.staff_id = patch.staffId;
      row.updated_by = meStaffId; row.updated_at = new Date().toISOString();
      // Planner exceptions: write an exception row instead of mutating the rule.
      if (id.startsWith('gen:')) {
        const [, , date, hhmm] = id.split(':');
        await supabase.from('mentis_staff_availability').insert({
          organization_id: orgId, staff_id: patch.staffId, starts_at: patch.start!.toISOString(), ends_at: patch.end!.toISOString(),
          available: !(patch.kind ? blockingKind(patch.kind) : true),
          availability_type: patch.kind ? kindValue(patch.kind) : 'working_hours',
          title: patch.title, reason: patch.notes || null, source_type: 'planner',
          rule_id: null, occurrence_date: date, exception_status: 'exception',
          visibility: 'staff', recorded_by: meStaffId, created_by: meStaffId,
        });
        await refresh();
        return;
      }
      const { data } = await supabase.from('mentis_staff_availability').select('*').eq('id', id).single();
      Object.assign(prevRow, data ?? {});
      await supabase.from('mentis_staff_availability').update(row).eq('id', id);
      await refresh();
      push({
        label: 'edit',
        undo: async () => { await supabase.from('mentis_staff_availability').update(prevRow).eq('id', id); await refresh(); },
        redo: async () => { await supabase.from('mentis_staff_availability').update(row).eq('id', id); await refresh(); },
      });
    },
    deleteEntries: async (ids) => {
      for (const id of ids) {
        if (id.startsWith('gen:')) {
          const [, , date, hhmm] = id.split(':');
          const target = state.events.find((e) => e.id === id);
          await supabase.from('mentis_staff_availability').insert({
            organization_id: orgId, staff_id: target?.staffId, starts_at: target!.start, ends_at: new Date(new Date(target!.start).getTime() + 60000).toISOString(),
            available: false, availability_type: 'other', source_type: 'planner',
            rule_id: target?.ruleId ?? null, occurrence_date: date, exception_status: 'exception',
            visibility: 'private', recorded_by: meStaffId, created_by: meStaffId,
          });
        } else {
          await supabase.from('mentis_staff_availability').delete().eq('id', id);
        }
      }
      await refresh();
    },
    duplicateEntry: async (id) => {
      const src = state.events.find((e) => e.id === id);
      if (!src || src.system) return null;
      await api.createEntry({
        staffId: src.staffId, title: src.title, kind: src.kind,
        start: new Date(src.start), end: new Date(src.end), notes: src.notes ?? undefined,
      });
      return null;
    },
    saveRule: async (draft) => {
      const row = {
        organization_id: orgId, staff_id: draft.staffId, label: draft.label || 'Regular availability',
        pattern: draft.pattern, effective_from: draft.effectiveFrom, effective_to: draft.effectiveTo,
        scope: draft.scope, is_active: true, created_by: meStaffId,
      };
      if (draft.id) await supabase.from('mentis_availability_rules').update(row).eq('id', draft.id);
      else await supabase.from('mentis_availability_rules').insert(row);
      await refresh();
      return 'saved' as const;
    },
    deleteRule: async (id) => {
      await supabase.from('mentis_availability_rules').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id);
      await refresh();
    },
    setConflictStatus: async (id, status) => {
      const row: AnyRow = { status };
      if (status === 'resolved') { row.resolved_by = meStaffId; row.resolved_at = new Date().toISOString(); }
      else { row.acknowledged_by = meStaffId; row.acknowledged_at = new Date().toISOString(); }
      await supabase.from('mentis_diary_conflicts').update(row).eq('id', id);
      await refresh();
    },
    undo: async () => { if (hIndex > 0) { hIndex -= 1; await history[hIndex].undo(); } },
    redo: async () => { if (hIndex < history.length) { await history[hIndex].redo(); hIndex += 1; } },
    canUndo: () => hIndex > 0,
    canRedo: () => hIndex < history.length,
  };
  return api;
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

let demoSingleton: ReturnType<typeof createDemoStore> | null = null;

export type DiaryApi = DiaryOps & {
  state: DiaryState;
  isDemo: boolean;
};

export function useDiaryData(): DiaryApi {
  const { staff } = useAuth();
  const isDemo = demoEnabled || isDemoSession();
  const adapterRef = useRef<{ key: string; api: any } | null>(null);
  const [, forceTick] = useState(0);

  const key = isDemo ? 'demo' : `${staff?.id ?? ''}|${staff?.organization_id ?? ''}`;
  if (!adapterRef.current || adapterRef.current.key !== key) {
    if (isDemo) {
      demoSingleton ??= createDemoStore();
      adapterRef.current = { key, api: demoSingleton };
    } else if (staff) {
      adapterRef.current = { key, api: createLiveStore(staff.id, staff.organization_id) };
    }
  }
  const adapter = adapterRef.current?.api;

  useEffect(() => {
    if (!adapter) return;
    const unsub = adapter.subscribe ? adapter.subscribe(() => forceTick((t) => t + 1)) : undefined;
    return () => unsub?.();
  }, [adapter]);

  // Load staff list once (live mode).
  useEffect(() => {
    if (adapter?.loadStaff && !adapter.state().staff.length) void adapter.loadStaff();
  }, [adapter]);

  const state: DiaryState = useMemo(() => (adapter ? adapter.state() : {
    events: [], rules: [], conflicts: [], staff: [], meId: staff?.id ?? '', loading: true, range: { from: '', to: '' },
  }), [adapter, adapter?.version]);

  const ops = useMemo<DiaryOps>(() => ({
    refresh: async () => adapter?.refresh(),
    createEntry: async (d) => (adapter ? adapter.createEntry(d) : null),
    updateEntry: async (id, p) => adapter?.updateEntry(id, p),
    deleteEntries: async (ids) => adapter?.deleteEntries(ids),
    duplicateEntry: async (id, sid) => (adapter ? adapter.duplicateEntry(id, sid) : null),
    saveRule: async (r) => (adapter ? adapter.saveRule(r) : 'saved'),
    deleteRule: async (id) => adapter?.deleteRule(id),
    setConflictStatus: async (id, s) => adapter?.setConflictStatus(id, s),
    undo: async () => adapter?.undo(),
    redo: async () => adapter?.redo(),
    canUndo: () => (adapter ? adapter.canUndo() : false),
    canRedo: () => (adapter ? adapter.canRedo() : false),
  }), [adapter]);

  return { ...ops, state, isDemo };
}
