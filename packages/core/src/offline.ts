/* Offline-first register: sync queue with retry/dedupe, grouped undo,
 * latest-timestamp-wins conflicts with audit trail (rules 3–4). */
import type { AttendanceRecord, AttendanceStatus } from './domain.js';

export type SyncOperation = {
  id: string; record: AttendanceRecord; queuedAt: string;
  attempts?: number; lastError?: string;
};
export type RegisterState = {
  records: Record<string, AttendanceRecord>;
  queue: SyncOperation[];
  undo: AttendanceRecord[];
  /** Undo group sizes: one entry per user gesture (tap = 1, mark-all = N). */
  undoGroups?: number[];
};
export function createRegister(records: AttendanceRecord[] = []): RegisterState {
  return { records: Object.fromEntries(records.map((r) => [r.id, r])), queue: [], undo: [], undoGroups: [] };
}
const NEXT: Record<AttendanceStatus, AttendanceStatus> = {
  present: 'absent', absent: 'present', late: 'present', taster: 'present',
};
export function cycleAttendance(state: RegisterState, id: string, now = new Date().toISOString()): RegisterState {
  const current = state.records[id];
  if (!current) throw new Error('attendance record not found');
  const updated = { ...current, status: NEXT[current.status], recordedAt: now, offline: true };
  return {
    ...state,
    records: { ...state.records, [id]: updated },
    queue: [...state.queue, { id: `sync-${id}-${now}`, record: updated, queuedAt: now, attempts: 0 }],
    undo: [...state.undo, current],
    undoGroups: [...(state.undoGroups ?? []), 1],
  };
}
export function markAllPresent(state: RegisterState, ids: string[], now = new Date().toISOString()): RegisterState {
  let next = state;
  const changed: AttendanceRecord[] = [];
  const records = { ...next.records };
  const queue = [...next.queue];
  for (const id of ids) {
    const current = records[id];
    if (!current || current.status === 'present') continue;
    changed.push(current);
    const updated = { ...current, status: 'present' as const, recordedAt: now, offline: true };
    records[id] = updated;
    queue.push({ id: `sync-${id}-${now}`, record: updated, queuedAt: now, attempts: 0 });
  }
  if (!changed.length) return state;
  return {
    ...next, records, queue,
    undo: [...next.undo, ...changed],
    undoGroups: [...(next.undoGroups ?? []), changed.length],
  };
}
/** Undo the last gesture (a mark-all reverts in one tap). */
export function undoLast(state: RegisterState): RegisterState {
  const groups = state.undoGroups ?? [];
  const size = groups.length ? groups[groups.length - 1] : state.undo.length ? 1 : 0;
  if (!size || state.undo.length < size) return state;
  const records = { ...state.records };
  const queue = [...state.queue];
  const now = new Date().toISOString();
  for (const previous of state.undo.slice(-size)) {
    records[previous.id] = previous;
    queue.push({ id: `undo-${previous.id}-${now}`, record: previous, queuedAt: now, attempts: 0 });
  }
  return {
    ...state, records, queue,
    undo: state.undo.slice(0, -size),
    undoGroups: groups.slice(0, -1),
  };
}
/** Latest timestamp wins; caller audit-logs the loser (rule 4). */
export function mergeAttendance(local: AttendanceRecord, remote: AttendanceRecord): AttendanceRecord {
  return Date.parse(local.recordedAt) >= Date.parse(remote.recordedAt) ? local : remote;
}
export function drainQueue(state: RegisterState, ackedIds: string[]): RegisterState {
  return { ...state, queue: state.queue.filter((op) => !ackedIds.includes(op.id)) };
}
/** Dedupe: keep only the newest op per record (retry-safe). */
export function dedupeQueue(queue: SyncOperation[]): SyncOperation[] {
  const latest = new Map<string, SyncOperation>();
  for (const op of queue) {
    const prev = latest.get(op.record.id);
    if (!prev || Date.parse(op.queuedAt) >= Date.parse(prev.queuedAt)) latest.set(op.record.id, op);
  }
  return [...latest.values()].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}
export function markAttempt(op: SyncOperation, error?: string): SyncOperation {
  return { ...op, attempts: (op.attempts ?? 0) + 1, lastError: error };
}
export function registerProgress(records: AttendanceRecord[]): { marked: number; total: number } {
  return { marked: records.length, total: records.length };
}
