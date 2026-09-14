/* Database suite: applies every migration to throwaway PGlite Postgres,
 * then runs the RLS matrix + guard tests (supabase/tests/rls_matrix.sql).
 * Supabase-hosted-only bits (pg_cron/pg_net) are stripped; auth + storage
 * schemas are stubbed the way Supabase provides them. */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = resolve(root, 'supabase/migrations');

function transform(sql: string): string {
  const out: string[] = [];
  let inCron = false;
  for (const line of sql.split('\n')) {
    if (/create extension if not exists pg_(cron|net)/.test(line)) continue;
    if (/create extension if not exists pgcrypto/.test(line)) continue;
    if (/select cron\.schedule/.test(line)) { inCron = true; continue; }
    if (inCron) { if (/where false;/.test(line)) inCron = false; continue; }
    out.push(line);
  }
  return out.join('\n');
}

describe('postgres migrations + RLS matrix', () => {
  it('applies all migrations and passes the RLS suite', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role authenticated;
        create role service_role with superuser;
        create schema auth;
        create table auth.users (id uuid primary key, email text, encrypted_password text,
          email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz,
          raw_app_meta_data jsonb, raw_user_meta_data jsonb, aud text, role text);
        create function auth.uid() returns uuid language sql stable as
          $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
        create schema storage;
        create table storage.buckets (id text primary key, name text, public boolean);
      `);
      const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) {
        await db.exec(transform(readFileSync(resolve(MIG, f), 'utf8')));
      }
      await db.exec(`grant all on all tables in schema public to authenticated;
        grant usage, select on all sequences in schema public to authenticated;`);
      // Throws on any matrix violation.
      await db.exec(readFileSync(resolve(root, 'supabase/tests/rls_matrix.sql'), 'utf8'));
    } finally {
      await db.close();
    }
  }, 120_000);
});
