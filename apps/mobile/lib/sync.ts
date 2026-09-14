/* Offline-first sync queue over expo-sqlite.
 * Attendance, session views, feedback, availability and own tasks work with
 * zero connectivity; the queue retries with dedupe, latest-timestamp-wins. */
import * as SQLite from 'expo-sqlite';
import { dedupeQueue, mergeAttendance, type AttendanceRecord, type SyncOperation } from '@mentis/core';
import { supabase } from './supabase';

let db: SQLite.SQLiteDatabase | null = null;

export async function database(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('mentis.db');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (id TEXT PRIMARY KEY, record TEXT NOT NULL, queued_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS register_cache (session_id TEXT NOT NULL, payload TEXT NOT NULL, cached_at TEXT NOT NULL, PRIMARY KEY (session_id));
  `);
  return db;
}

export async function enqueueAttendance(record: AttendanceRecord): Promise<void> {
  const d = await database();
  await d.runAsync('INSERT OR REPLACE INTO sync_queue (id, record, queued_at, attempts) VALUES (?, ?, ?, 0)',
    [`sync-${record.id}-${record.recordedAt}`, JSON.stringify(record), new Date().toISOString()]);
}

export async function pendingOps(): Promise<SyncOperation[]> {
  const d = await database();
  const rows = await d.getAllAsync<{ id: string; record: string; queued_at: string; attempts: number }>(
    'SELECT * FROM sync_queue ORDER BY queued_at');
  return dedupeQueue(rows.map((r) => ({ id: r.id, record: JSON.parse(r.record), queuedAt: r.queued_at, attempts: r.attempts })));
}

/** Push the queue; on conflict keep latest timestamp (audit-logged server-side). */
export async function flushQueue(userId: string): Promise<{ pushed: number; failed: number }> {
  const ops = await pendingOps();
  const d = await database();
  let pushed = 0;
  let failed = 0;
  for (const op of ops) {
    try {
      const { data: remote } = await supabase.from('attendance_records').select('*')
        .eq('session_id', op.record.sessionInstanceId)
        .eq(op.record.memberId ? 'member_id' : 'taster_name', op.record.memberId ?? '')
        .limit(1).single();
      if (remote) {
        const winner = mergeAttendance(op.record, {
          id: op.record.id, sessionInstanceId: op.record.sessionInstanceId,
          memberId: op.record.memberId, status: remote.status,
          recordedAt: remote.recorded_at, recordedBy: remote.recorded_by, offline: false,
        });
        if (winner.recordedAt !== op.record.recordedAt) {
          await d.runAsync('DELETE FROM sync_queue WHERE id = ?', [op.id]);
          pushed += 1;
          continue; // remote won — drop local op, already converged
        }
      }
      const { error } = await supabase.from('attendance_records').insert({
        session_id: op.record.sessionInstanceId, member_id: op.record.memberId ?? null,
        status: op.record.status, recorded_by: userId, recorded_at: op.record.recordedAt, offline: true,
      });
      if (error) throw error;
      await d.runAsync('DELETE FROM sync_queue WHERE id = ?', [op.id]);
      pushed += 1;
    } catch {
      await d.runAsync('UPDATE sync_queue SET attempts = attempts + 1 WHERE id = ?', [op.id]);
      failed += 1;
    }
  }
  return { pushed, failed };
}

export async function cacheRegister(sessionId: string, payload: unknown): Promise<void> {
  const d = await database();
  await d.runAsync('INSERT OR REPLACE INTO register_cache (session_id, payload, cached_at) VALUES (?, ?, ?)',
    [sessionId, JSON.stringify(payload), new Date().toISOString()]);
}

export async function cachedRegister<T>(sessionId: string): Promise<T | null> {
  const d = await database();
  const row = await d.getFirstAsync<{ payload: string }>('SELECT payload FROM register_cache WHERE session_id = ?', [sessionId]);
  return row ? (JSON.parse(row.payload) as T) : null;
}
