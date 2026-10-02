const fs = require('fs');
const path = require('path');

const root = 'd:/OneDrive/AppMaster/Mentis/Mentis';
const file = path.join(root, 'supabase/tests/session_templates.sql');

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
      buf += ch; inSingle = true; i++; continue;
    }
    if (ch === '"') {
      buf += ch; inDouble = true; i++; continue;
    }
    if (ch === '$') {
      const match = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (match) {
        buf += match[0];
        dollarTag = match[1] || '';
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

const sql = fs.readFileSync(file, 'utf8');
const stmts = splitSql(sql);
console.log('count', stmts.length);
for (let i = 0; i < Math.min(stmts.length, 50); i++) {
  const s = stmts[i].slice(0, 120);
  console.log(i + 1, s.replace(/\n/g, ' '));
}
