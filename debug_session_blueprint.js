const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');

(async () => {
  const db = new PGlite();
  const root = 'd:/OneDrive/AppMaster/Mentis/Mentis';
  const files = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();

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

  for (const f of files) {
    const sql = fs.readFileSync(path.join(root, 'supabase/migrations', f), 'utf8');
    const out = [];
    let inCron = false;
    for (const line of sql.split('\n')) {
      if (/create extension if not exists pg_(cron|net)/.test(line)) continue;
      if (/create extension if not exists pgcrypto/.test(line)) continue;
      if (/select cron\.schedule/.test(line)) { inCron = true; continue; }
      if (inCron) {
        if (/where false;/.test(line)) { inCron = false; }
        continue;
      }
      out.push(line);
    }
    await db.exec(out.join('\n'));
  }

  await db.exec(`grant all on all tables in schema public to authenticated; grant usage, select on all sequences in schema public to authenticated;`);

  const suite = fs.readFileSync(path.join(root, 'supabase/tests/session_templates.sql'), 'utf8');
  const marker = "select mentis_tmpl_ok('the first three Mondays are materialised'";
  const pos = suite.indexOf(marker);
  const before = suite.slice(0, pos);

  await db.exec(`select set_config('request.jwt.claims', '{}', false); select set_config('role', 'service_role', false);`);
  await db.exec(before);

  const tpl = await db.query("select key, value from tpl_results order by key");
  console.log('TPL_RESULTS');
  console.dir(tpl.rows, { depth: 10 });

  const series = await db.query("select id, template_id, recurrence_rule_id, starts_on, ends_on, status from mentis_session_series order by starts_on");
  console.log('SERIES');
  console.dir(series.rows, { depth: 10 });

  const sessions = await db.query("select id, template_id, series_id, occurrence_date, start_at, end_at, status from mentis_sessions order by occurrence_date");
  console.log('SESSIONS');
  console.dir(sessions.rows, { depth: 10 });

  await db.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
