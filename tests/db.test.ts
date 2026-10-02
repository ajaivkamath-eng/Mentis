/* Database suite: applies every migration to throwaway PGlite Postgres,
 * then runs the RLS matrix + guard tests (supabase/tests/rls_matrix.sql) and
 * the session-blueprint suite (supabase/tests/session_templates.sql).
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
        create role anon;
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
        -- Supabase grants the API roles usage on the auth schema; without it a
        -- caller who is not the owner cannot reach auth.uid().
        grant usage on schema auth to authenticated, service_role;
        grant execute on function auth.uid() to authenticated, service_role;
      `);
      const requiredFiles = [
        '0001_foundation.sql',
        '0002_scheduling_billing.sql',
        '0003_entities.sql',
        '0004_competition.sql',
        '0005_money_comms.sql',
        '0006_rls_matrix.sql',
        '0007_seeds.sql',
        '0008_automation.sql',
        '0009_trigger_fix.sql',
        '0010_phase_gaps.sql',
        '0011_staffing_roles_availability.sql',
        '0012_diary_calendar.sql',
        '0013_session_templates.sql',
        '0014_session_member_ranges.sql',
        '0015_template_member_cascade.sql',
        '0016_session_series_roster.sql',
        '0017_program_terminology_alignment.sql',
        '0018_session_series_delete.sql',
        '0019_coach_qualifications.sql',
        '0021_tagging_system.sql',
        '0022_api_role_grants.sql',
      ];

      expect(requiredFiles.length).toBeGreaterThan(0);
      for (const f of requiredFiles) {
        await db.exec(transform(readFileSync(resolve(MIG, f), 'utf8')));
      }
      await db.exec(`
        insert into mentis_staff (id, organization_id, user_id, display_name)
        values ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-000000000111', 'Migration test coach');
        insert into mentis_staff_availability
          (id, organization_id, staff_id, starts_at, ends_at, available, availability_type, reason, recorded_by)
        values ('00000000-0000-0000-0000-000000000113', '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-000000000112', '2026-09-28T09:00:00Z', '2026-09-28T10:00:00Z',
                false, 'vacation', 'Vacation', '00000000-0000-0000-0000-000000000111');
      `);
      await db.exec(readFileSync(resolve(MIG, '0025_staff_availability_leave.sql'), 'utf8'));
      const converted = await db.query<{ availability_type: string; reason: string }>(`
        select availability_type::text, reason from mentis_staff_availability
        where id = '00000000-0000-0000-0000-000000000113'`);
      expect(converted.rows).toEqual([{ availability_type: 'vacation', reason: 'Vacation' }]);
      await db.exec(readFileSync(resolve(MIG, '0026_restore_staff_vacation.sql'), 'utf8'));
      await db.exec(`update mentis_staff_availability set availability_type = 'vacation'
        where id = '00000000-0000-0000-0000-000000000113'`);
      const vacation = await db.query<{ availability_type: string }>(`
        select availability_type::text from mentis_staff_availability
        where id = '00000000-0000-0000-0000-000000000113'`);
      expect(vacation.rows).toEqual([{ availability_type: 'vacation' }]);
      const vacationLabel = await db.query<{ label: string }>(`select availability_kind_label('vacation') as label`);
      expect(vacationLabel.rows).toEqual([{ label: 'Vacation' }]);
      // PostgREST connects as `authenticated`, never as the table owner, so a
      // missing grant is a 403 in the browser even when RLS would allow the row.
      const grants = await db.query<{ staff: boolean; usage: boolean; anon_staff: boolean }>(`
        select has_table_privilege('authenticated','public.mentis_staff','select') as staff,
               has_schema_privilege('authenticated','public','usage') as usage,
               has_table_privilege('anon','public.mentis_staff','select') as anon_staff`);
      expect(grants.rows[0]).toEqual({ staff: true, usage: true, anon_staff: false });

      // Each suite throws on its first violated invariant. Session settings are
      // reset between them: a rolled-back `set_config` leaves `request.jwt.claims`
      // as an empty string, which the stubbed `auth.uid()` cannot cast to json.
      const missingSeriesId = '5b9220be-392e-4e93-ad4a-04268a715115';
      await expect(db.exec(`select delete_session_series_occurrences('${missingSeriesId}'::uuid, null, null, true);`)).resolves.toBeTruthy();

      for (const suite of ['rls_matrix.sql', 'session_templates.sql']) {
        await db.exec(`select set_config('request.jwt.claims', '{}', false);
          select set_config('role', 'service_role', false);`);
        await db.exec(readFileSync(resolve(root, 'supabase/tests', suite), 'utf8'));
      }
    } finally {
      await db.close();
    }
  }, 120_000);
});
