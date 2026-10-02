const { PGlite } = require('@electric-sql/pglite');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');

const root = 'd:/OneDrive/AppMaster/Mentis/Mentis';
const MIG = resolve(root, 'supabase/migrations');
const SUITE = resolve(root, 'supabase/tests/session_templates.sql');

function splitSql(sql) {
  const out = [];
  let buf = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingle) {
      buf += ch;
      if (ch === "'" && sql[i - 1] !== '\\') inSingle = false;
      i++; continue;
    }
    if (inDouble) {
      buf += ch;
      if (ch === '"' && sql[i - 1] !== '\\') inDouble = false;
      i++; continue;
    }
    if (inLineComment) {
      buf += ch;
      if (ch === '\n') inLineComment = false;
      i++; continue;
    }
    if (inBlockComment) {
      buf += ch;
      if (ch === '*' && next === '/') {
        buf += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i++; continue;
    }
    if (dollarTag !== null) {
      const marker = '$' + dollarTag + '$';
      if (sql.startsWith(marker, i)) {
        buf += marker;
        i += marker.length;
        dollarTag = null;
        continue;
      }
      buf += ch;
      i++; continue;
    }

    if (ch === '-' && next === '-') {
      inLineComment = true;
      buf += ch;
      i++; continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      buf += ch;
      i++; continue;
    }
    if (ch === "'") {
      buf += ch;
      inSingle = true;
      i++; continue;
    }
    if (ch === '"') {
      buf += ch;
      inDouble = true;
      i++; continue;
    }
    if (ch === '$') {
      const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$/) || sql.slice(i).match(/^\$\$/);
      if (match) {
        buf += match[0];
        dollarTag = match[0].slice(1, -1);
        i += match[0].length;
        continue;
      }
    }
    if (ch === ';') {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = '';
      i++; continue;
    }

    buf += ch;
    i++;
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
  await db.exec(`create role authenticated; create role service_role with superuser; create schema auth; create table auth.users (id uuid primary key, email text, encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, aud text, role text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$; create schema storage; create table storage.buckets (id text primary key, name text, public boolean); grant usage on schema auth to authenticated, service_role; grant execute on function auth.uid() to authenticated, service_role;`);

  const migrateFiles = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
  for (const f of migrateFiles) {
    const sql = transform(readFileSync(resolve(MIG, f), 'utf8'));
    const statements = splitSql(sql);
    for (let i = 0; i < statements.length; i++) {
      try {
        await db.exec(statements[i]);
      } catch (e) {
        console.error('MIGRATION FAIL', f, 'stmt', i + 1, '\n', e.message);
        process.exit(1);
      }
    }
    console.log('loaded', f);
  }

  await db.exec(`grant all on all tables in schema public to authenticated; grant usage, select on all sequences in schema public to authenticated;`);

  const suiteStmts = splitSql(readFileSync(SUITE, 'utf8'));
  for (let i = 0; i < suiteStmts.length; i++) {
    const stmt = suiteStmts[i];
    try {
      await db.exec(stmt);
      console.log('suite OK', i + 1);
    } catch (e) {
      console.error('SUITE FAIL', i + 1, '\n');
      console.error('ERROR', e.message);
      console.error(stmt.slice(0, 1800));
      process.exit(1);
    }
  }
})();
