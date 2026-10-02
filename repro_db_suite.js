const { PGlite } = require('@electric-sql/pglite');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');

const root = 'd:/OneDrive/AppMaster/Mentis/Mentis';
const MIG = resolve(root, 'supabase/migrations');

function transform(sql) {
  const out = [];
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

(async () => {
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
      grant usage on schema auth to authenticated, service_role;
      grant execute on function auth.uid() to authenticated, service_role;
    `);

    const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const path = resolve(MIG, f);
      const sql = readFileSync(path, 'utf8');
      console.log('Applying migration:', f);
      try {
        await db.exec(transform(sql));
      } catch (e) {
        console.error('Migration failed:', f, '\n', e.message);
        process.exit(1);
      }
    }

    await db.exec(`grant all on all tables in schema public to authenticated;
      grant usage, select on all sequences in schema public to authenticated;`);

    for (const suite of ['rls_matrix.sql', 'session_templates.sql']) {
      const path = resolve(root, 'supabase/tests', suite);
      console.log('Running suite:', suite);
      try {
        await db.exec(`select set_config('request.jwt.claims', '{}', false);
          select set_config('role', 'service_role', false);`);
        await db.exec(readFileSync(path, 'utf8'));
      } catch (e) {
        console.error('Suite failed:', suite, '\n', e.message);
        process.exit(1);
      }
    }

    console.log('All good');
  } finally {
    await db.close();
  }
})();
