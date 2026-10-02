const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');

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

    const dir = path.join(process.cwd(), 'supabase/migrations');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      let sql = fs.readFileSync(path.join(dir, f), 'utf8');
      const out = [];
      let inCron = false;
      for (const line of sql.split('\n')) {
        if (/create extension if not exists pg_(cron|net)/.test(line)) continue;
        if (/create extension if not exists pgcrypto/.test(line)) continue;
        if (/select cron\.schedule/.test(line)) { inCron = true; continue; }
        if (inCron) { if (/where false;/.test(line)) inCron = false; continue; }
        out.push(line);
      }
      sql = out.join('\n');
      console.log('Applying', f);
      await db.exec(sql);
    }
    console.log('ALL_OK');
  } catch (err) {
    console.error('ERR', err && err.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
