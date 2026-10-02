const fs = require('fs');
const path = require('path');
const suite = fs.readFileSync(path.join('d:/OneDrive/AppMaster/Mentis/Mentis', 'supabase/tests/session_templates.sql'), 'utf8');

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
      if (m) {
        const tag = m[1] || '';
        if (tag === dollarTag) {
          buf += m[0];
          i += m[0].length - 1;
          dollarTag = null;
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
      const m = rest.match(/^\$[a-zA-Z_][a-zA-Z0-9_]*\$/) || rest.match(/^\$\$/);
      if (m) {
        buf += m[0];
        dollarTag = m[0].slice(1, -1);
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

const stmts = splitSql(suite);
for (let i = 0; i < 30 && i < stmts.length; i++) {
  console.log('INDEX', i + 1);
  console.log(stmts[i].slice(0, 220));
  console.log('---');
}
console.log('TOTAL', stmts.length);
