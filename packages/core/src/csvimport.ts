/* CSV import wizard: members/customers/sessions + error reporting. */
export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  });
}
export interface ImportResult<T> { valid: T[]; errors: { row: number; message: string }[] }
export function validateMemberRows(rows: Record<string, string>[]): ImportResult<Record<string, string>> {
  const valid: Record<string, string>[] = [];
  const errors: { row: number; message: string }[] = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    if (!r.name?.trim()) errors.push({ row, message: 'name is required' });
    else if (!r.dateOfBirth || Number.isNaN(Date.parse(r.dateOfBirth))) errors.push({ row, message: 'dateOfBirth is invalid' });
    else valid.push(r);
  });
  return { valid, errors };
}
