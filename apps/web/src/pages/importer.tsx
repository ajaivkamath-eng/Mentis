import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { parseCSV, validateMemberRows, validateDiaryImport } from '@mentis/core';

/* ---------- CSV import wizard with error reporting ---------- */
type Kind = 'members' | 'diary' | 'matches' | 'rankings';

export function Importer() {
  const { staff } = useAuth();
  const [kind, setKind] = useState<Kind>('members');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([]);
  const [done, setDone] = useState('');

  const onFile = async (f: File) => {
    const text = await f.text();
    const parsed = parseCSV(text);
    setRows(parsed);
    if (kind === 'members') {
      const r = validateMemberRows(parsed);
      setErrors(r.errors);
    } else if (kind === 'diary') {
      const r = validateDiaryImport(parsed as any);
      setErrors(r.errors.map((message, i) => ({ row: i + 2, message })));
    } else {
      setErrors([]);
    }
    setDone('');
  };

  const commit = async () => {
    setDone('');
    if (kind === 'members') {
      const { valid } = validateMemberRows(rows);
      for (const r of valid) {
        const { data: c } = await supabase.from('customers').insert({
          organization_id: staff?.organization_id, name: r.customerName || `${r.name} (guardian)`, phone: r.customerPhone || null,
        }).select('id').single();
        if (c) {
          await supabase.from('members').insert({
            organization_id: staff?.organization_id, customer_id: c.id, name: r.name,
            date_of_birth: r.dateOfBirth, nok_name: r.nokName || null, nok_phone: r.nokPhone || null,
            tte_number: r.tteNumber || null, handedness: r.handedness || null, playing_style: r.playingStyle || null,
          });
        }
      }
      setDone(`Imported ${valid.length} members.`);
    } else if (kind === 'diary') {
      const { valid } = validateDiaryImport(rows as any);
      for (const r of valid) {
        await supabase.from('events').insert({
          organization_id: staff?.organization_id, name: r.name, starts_on: r.startsOn,
          ends_on: r.endsOn, location: r.location || null, source: r.source || 'manual',
          external_ref: r.externalRef || null, status: 'published',
        });
      }
      setDone(`Imported ${valid.length} events.`);
    } else if (kind === 'matches') {
      let n = 0;
      for (const r of rows) {
        if (!r.memberName || !r.opponent || !r.date) continue;
        const { data: m } = await supabase.from('members').select('id').eq('name', r.memberName).limit(1).single();
        if (!m) continue;
        await supabase.from('matches').insert({
          member_id: m.id, played_on: r.date, session_id: r.sessionId || null, opponent: r.opponent,
          games_for: (r.gamesFor || '').split('-').map(Number).filter((x) => !Number.isNaN(x)),
          games_against: (r.gamesAgainst || '').split('-').map(Number).filter((x) => !Number.isNaN(x)),
          result: r.result || 'W', source: r.source || 'manual', source_ref: r.sourceRef || null,
        });
        n += 1;
      }
      setDone(`Imported ${n} matches (skipped rows without a matching member).`);
    } else {
      let n = 0;
      for (const r of rows) {
        if (!r.memberName || !r.platform || !r.rank || !r.asOf) continue;
        const { data: m } = await supabase.from('members').select('id').eq('name', r.memberName).limit(1).single();
        if (!m) continue;
        await supabase.from('rankings').insert({
          member_id: m.id, platform: r.platform, rank_value: Number(r.rank), as_of: r.asOf, source_ref: r.sourceRef || null,
        });
        n += 1;
      }
      setDone(`Imported ${n} rankings.`);
    }
  };

  return (
    <div>
      <PageTitle title="CSV import wizard" sub="Members · diary · matches · rankings — validated before commit" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-center">
        <select className="input" style={{ width: 180 }} value={kind} onChange={(e) => { setKind(e.target.value as Kind); setRows([]); setErrors([]); }}>
          <option value="members">Members</option><option value="diary">Competition diary</option>
          <option value="matches">Matches</option><option value="rankings">Rankings</option>
        </select>
        <input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <span className="text-sm" style={{ color: 'var(--muted)' }}>
          {kind === 'members' && 'Columns: name, dateOfBirth, customerName, customerPhone, nokName, nokPhone, tteNumber, handedness, playingStyle'}
          {kind === 'diary' && 'Columns: name, startsOn, endsOn, location, source, externalRef'}
          {kind === 'matches' && 'Columns: memberName, date, opponent, gamesFor (11-9-7), gamesAgainst, result (W/L/D), source, sessionId?'}
          {kind === 'rankings' && 'Columns: memberName, platform, rank, asOf, sourceRef?'}
        </span>
      </div>
      {rows.length > 0 && (
        <div className="card p-4 mb-4">
          <div className="text-sm mb-2">{rows.length} rows parsed · {errors.length} errors</div>
          {errors.slice(0, 10).map((e, i) => <div key={i} className="text-sm" style={{ color: 'var(--red)' }}>Row {e.row}: {e.message}</div>)}
          <button className="btn btn-primary mt-2" onClick={commit}>Commit valid rows</button>
          {done && <p className="text-sm mt-2">{done}</p>}
        </div>
      )}
    </div>
  );
}
