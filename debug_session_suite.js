const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');

function splitSql(sql) {
  const out = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  let dollar = null;

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
    if (dollar !== null) {
      const tag = rest.match(/^\$([a-zA-Z_][a-zA-Z0-9_]*)?\$/);
      if (tag) {
        const tagName = tag[1] || '';
        if (dollar === tagName) {
          buf += tag[0];
          i += tag[0].length - 1;
          dollar = null;
        } else {
          buf += ch;
        }
        continue;
      }
      buf += ch;
      continue;
    }
    if (ch === "'") {
      buf += ch;
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      buf += ch;
      inDouble = true;
      continue;
    }
    if (ch === '$') {
      const tag = rest.match(/^\$[a-zA-Z_][a-zA-Z0-9_]*\$/) || rest.match(/^\$\$/);
      if (tag) {
        buf += tag[0];
        dollar = tag[0].slice(1, -1);
        i += tag[0].length - 1;
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

(async () => {
  const db = new PGlite();
  const root = 'd:/OneDrive/AppMaster/Mentis/Mentis';
  const MIG = path.join(root, 'supabase/migrations');
  const files = fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();

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
    const sql = fs.readFileSync(path.join(MIG, f), 'utf8');
    const normalized = [];
    let inCron = false;
    for (const line of sql.split('\n')) {
      if (/create extension if not exists pg_(cron|net)/.test(line)) continue;
      if (/create extension if not exists pgcrypto/.test(line)) continue;
      if (/select cron\.schedule/.test(line)) { inCron = true; continue; }
      if (inCron) {
        if (/where false;/.test(line)) inCron = false;
        continue;
      }
      normalized.push(line);
    }
    await db.exec(normalized.join('\n'));
  }

  await db.exec(`grant all on all tables in schema public to authenticated; grant usage, select on all sequences in schema public to authenticated;`);
  const suite = fs.readFileSync(path.join(root, 'supabase/tests/session_templates.sql'), 'utf8');
  const statements = splitSql(suite);

  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i];
    try {
      await db.exec(sql);
    } catch (err) {
      console.log('FAILED STATEMENT INDEX:', i + 1);
      console.log('ERROR:', err.message);
      console.log('SQL HEAD:');
      console.log(sql.slice(0, 800));
      process.exit(1);
    }
  }

  console.log('ALL SESSION_TEMPLATE STATEMENTS PASSED');
  await db.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
