const { PGlite } = require('@electric-sql/pglite');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');

const root = 'd:/OneDrive/AppMaster/Mentis/Mentis';
const MIG = resolve(root, 'supabase/migrations');
const SUITE = resolve(root, 'supabase/tests/session_templates.sql');

function splitSql(sql) {
  const out = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  let dollarTag = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const rest = sql.slice(i);
    if (inSingle) {
      buf += ch;
      if (ch === "'" && sql[i - 1] !== '\\') inSingle = false;
      continue;
    }
    if (inDouble) {
      buf += ch;
      if (ch === '"' && sql[i - 1] !== '\\') inDouble = false;
      continue;
    }
    if (dollarTag !== null) {
      const m = rest.match(/^\$([a-zA-Z_][a-zA-Z0-9_]*)?\$/);
      if (m && (m[1] || '') === dollarTag) {
        buf += m[0];
        i += m[0].length - 1;
        dollarTag = null;
        continue;
      }
      buf += ch;
      continue;
    }
    if (ch === "'") { buf += ch; inSingle = true; continue; }
    if (ch === '"') { buf += ch; inDouble = true; continue; }
    if (ch === '$') {
      const m = rest.match(/^\$[a-zA-Z_][a-zA-Z0-9_]*\$/) || rest.match(/^\$\$/);
      if (m) {
        buf += m[0];
        dollarTag = (m[0].slice(1, -1) || '');
        i += m[0].length - 1;
        continue;
      }
    }
    if (ch === ';') {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

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
  await db.exec(`
    create role authenticated;
    create role service_role with superuser;
    create schema auth;
    create table auth.users (id uuid primary key, email text, encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, aud text, role text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
    grant usage on schema auth to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role;
  `);

  const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const statements = splitSql(transform(readFileSync(resolve(MIG, f), 'utf8')));
    for (let i = 0; i < statements.length; i++) {
      try {
        await db.exec(statements[i]);
      } catch (e) {
        console.log('MIGRATION ERROR', f, i + 1, '\n', e.message);
        process.exit(1);
      }
    }
  }

  await db.exec(`grant all on all tables in schema public to authenticated; grant usage, select on all sequences in schema public to authenticated;`);
  const suiteStatements = splitSql(readFileSync(SUITE, 'utf8'));
  for (let i = 0; i < suiteStatements.length; i++) {
    const stmt = suiteStatements[i];
    try {
      await db.exec(stmt);
      if ((i + 1) % 10 === 0) console.log('suite ok', i + 1);
    } catch (e) {
      console.log('SUITE ERROR at statement', i + 1, '\n----');
      console.log(stmt.slice(0, 2000));
      console.log('\nERROR:', e.message);
      process.exit(1);
    }
  }
})();
