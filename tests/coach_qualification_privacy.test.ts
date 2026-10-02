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

describe('coach qualification privacy', () => {
  it('allows only super admin and the owning coach to read qualification rows', async () => {
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
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
        create schema storage;
        create table storage.buckets (id text primary key, name text, public boolean);
        grant usage on schema auth to authenticated, service_role;
        grant execute on function auth.uid() to authenticated, service_role;
      `);

      const files = readdirSync(MIG)
        .filter((f) => /^\d{4}_.+\.sql$/.test(f) && f !== '0020_session_roster_templates_seed.sql')
        .sort();

      for (const file of files) {
        await db.exec(transform(readFileSync(resolve(MIG, file), 'utf8')));
      }

      await db.exec(`
        insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
        values
          ('a0000000-0000-0000-0000-000000000001', 'super@example.com', 'x', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
          ('a0000000-0000-0000-0000-000000000002', 'admin@example.com', 'x', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
          ('a0000000-0000-0000-0000-000000000003', 'coach@example.com', 'x', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
          ('a0000000-0000-0000-0000-000000000004', 'sparrer@example.com', 'x', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated');

        insert into mentis_organizations (id, name) values ('00000000-0000-0000-0000-000000000001', 'Coach Org')
        on conflict (id) do nothing;

        insert into mentis_staff (organization_id, user_id, roles, display_name)
        values
          ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', array['SUPER_ADMIN']::mentis_role[], 'Super Admin'),
          ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', array['ADMIN']::mentis_role[], 'Admin User'),
          ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', array['COACH']::mentis_role[], 'Coach User'),
          ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', array['SPARRER']::mentis_role[], 'Sparrer User');

        insert into mentis_qualification_types (organization_id, name, category, validity_months, reminder_days, requires_document_upload, is_mandatory)
        values ('00000000-0000-0000-0000-000000000001', 'Safeguarding', 'safeguarding', 12, 30, true, true);

        insert into mentis_staff_qualifications (organization_id, staff_id, qualification_type_id, title, issue_date, expires_at, document_url, status)
        values (
          '00000000-0000-0000-0000-000000000001',
          (select id from mentis_staff where user_id = 'a0000000-0000-0000-0000-000000000003'),
          (select id from mentis_qualification_types where organization_id = '00000000-0000-0000-0000-000000000001' and name = 'Safeguarding'),
          'Safeguarding',
          '2026-01-01',
          '2027-01-01',
          'https://example.com/proof.pdf',
          'valid'
        );
      `);

      const apps = [
        ['super', 'a0000000-0000-0000-0000-000000000001'],
        ['coach', 'a0000000-0000-0000-0000-000000000003'],
        ['admin', 'a0000000-0000-0000-0000-000000000002'],
        ['sparrer', 'a0000000-0000-0000-0000-000000000004'],
      ] as const;

      for (const [label, uid] of apps) {
        await db.exec(`
          select set_config('request.jwt.claims', json_build_object('sub', '${uid}')::text, true);
          select set_config('role', 'authenticated', true);
          do $$
          declare v_count integer;
          begin
            select count(*) into v_count from mentis_staff_qualifications where staff_id = (select id from mentis_staff where user_id = 'a0000000-0000-0000-0000-000000000003');
            if ('${label}' in ('super', 'coach') and v_count = 0) then
              raise exception 'expected visible row for %', '${label}';
            end if;
            if ('${label}' not in ('super', 'coach') and v_count <> 0) then
              raise exception 'unexpected visibility for %', '${label}';
            end if;
          end $$;
        `);
      }
    } finally {
      await db.close();
    }
  }, 120_000);
});
