import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';

export function getActiveRateCardsForStaff(staffId: string, rates: any[]) {
  if (!staffId) return [];
  const today = new Date().toISOString().slice(0, 10);
  return rates.filter((r: any) => {
    if (r.staff_id !== staffId) return false;
    const startsOn = r.valid_from ?? '0000-00-00';
    const endsOn = r.valid_to ?? '9999-12-31';
    return startsOn <= today && endsOn >= today;
  });
}

export function getDefaultRateCardId(staffId: string, rates: any[]) {
  const active = getActiveRateCardsForStaff(staffId, rates);
  if (!active.length) return '';

  const standard = active
    .filter((r: any) => r.label === 'Standard')
    .sort((a: any, b: any) => (b.valid_from ?? '').localeCompare(a.valid_from ?? ''))[0];

  const candidate = standard ?? [...active].sort((a: any, b: any) => (b.valid_from ?? '').localeCompare(a.valid_from ?? ''))[0];
  return candidate?.id ?? '';
}

/* ---------- Session staffing: assign + availability/overlap guards ---------- */
export function Staffing() {
  const { staff } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [selection, setSelection] = useState<{ startRow: number; endRow: number; startCol: number; endCol: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [draftValue, setDraftValue] = useState('');

  const columns = [
    { key: 'session', label: 'Session / Blueprint', width: 220 },
    { key: 'staff', label: 'Staff Member', width: 180 },
    { key: 'role', label: 'Role', width: 150 },
    { key: 'rate_card', label: 'Rate Card', width: 150 },
    { key: 'from', label: 'From', width: 160 },
    { key: 'to', label: 'To', width: 160 },
    { key: 'status', label: 'Status', width: 120 },
  ] as const;

  useEffect(() => {
    const loadMeta = async () => {
      const [{ data: sessionsData }, { data: staffData }, { data: ratesData }] = await Promise.all([
        supabase.from('mentis_session_occurrences').select('id,name,start_at,end_at,status').order('start_at', { ascending: false }).limit(30),
        supabase.from('mentis_staff').select('id,display_name').order('display_name'),
        supabase.from('mentis_rate_cards').select('id,label,staff_id,rate_cents,valid_from,valid_to').order('valid_from', { ascending: false }),
      ]);
      setSessions(sessionsData ?? []);
      setStaffList(staffData ?? []);
      setRates(ratesData ?? []);
    };
    void loadMeta();
  }, []);

  const loadRows = async () => {
    const { data } = await supabase.from('mentis_session_staffing').select('*,mentis_staff(display_name),mentis_rate_cards(label,rate_cents)').order('planned_start', { ascending: false });
    const mapped = (data ?? []).map((row: any) => {
      const session = sessions.find((s: any) => s.id === row.session_id) ?? { name: 'Session' };
      const staffName = row.mentis_staff?.display_name ?? 'Unassigned';
      const rateLabel = row.mentis_rate_cards?.label ?? 'Standard';
      const role = row.capacity ?? 'Assistant Coach';
      const from = row.planned_start ? new Date(row.planned_start).toISOString().slice(0, 16) : '';
      const to = row.planned_end ? new Date(row.planned_end).toISOString().slice(0, 16) : '';
      const status = (() => {
        if (!from || !to) return 'Assigned';
        const matching = rows.filter((existing: any) => existing.staff === staffName && existing.id !== row.id);
        const hasConflict = matching.some((existing: any) => {
          const existingFrom = existing.from ? new Date(existing.from) : null;
          const existingTo = existing.to ? new Date(existing.to) : null;
          const candidateFrom = new Date(from);
          const candidateTo = new Date(to);
          return existingFrom && existingTo && candidateFrom < existingTo && candidateTo > existingFrom;
        });
        return hasConflict ? 'Conflict' : 'Assigned';
      })();
      return {
        id: row.id,
        session: session.name,
        session_id: row.session_id,
        staff: staffName,
        staff_id: row.staff_id,
        role,
        rate_card: rateLabel,
        rate_card_id: row.rate_card_id,
        from,
        to,
        status,
      };
    });
    setRows(mapped);
  };

  useEffect(() => {
    void loadRows();
  }, [sessions]);

  const addRow = () => {
    const blank = {
      id: '',
      session: sessions[0]?.name ?? 'New session',
      session_id: sessions[0]?.id ?? '',
      staff: staffList[0]?.display_name ?? 'Unassigned',
      staff_id: staffList[0]?.id ?? '',
      role: 'Assistant Coach',
      rate_card: 'Standard',
      rate_card_id: rates.find((rate) => rate.label === 'Standard')?.id ?? '',
      from: sessions[0]?.start_at ? new Date(sessions[0].start_at).toISOString().slice(0, 16) : '',
      to: sessions[0]?.end_at ? new Date(sessions[0].end_at).toISOString().slice(0, 16) : '',
      status: 'Assigned',
    };
    setRows((prev) => [...prev, blank]);
    const rowIndex = rows.length;
    setFocusedCell({ row: rowIndex, col: 0 });
    setSelection({ startRow: rowIndex, endRow: rowIndex, startCol: 0, endCol: columns.length - 1 });
  };

  const setCell = (rowIndex: number, key: string, raw: string) => {
    const value = String(raw ?? '').trim();
    setRows((prev) => prev.map((row, index) => {
      if (index !== rowIndex) return row;
      const next = { ...row };
      if (key === 'session') next.session = value;
      if (key === 'staff') next.staff = value;
      if (key === 'role') next.role = value;
      if (key === 'rate_card') next.rate_card = value;
      if (key === 'from') next.from = value;
      if (key === 'to') next.to = value;
      const hasConflict = next.from && next.to && rows.some((existing: any) => existing.id !== next.id && existing.staff === next.staff && existing.from && existing.to && new Date(next.from) < new Date(existing.to) && new Date(next.to) > new Date(existing.from));
      next.status = hasConflict ? 'Conflict' : 'Assigned';
      return next;
    }));
  };

  const normalizeCapacity = (value?: string) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized || normalized.includes('assistant')) return 'assistant';
    if (normalized.includes('lead')) return 'lead';
    if (normalized.includes('sparrer') || normalized.includes('sparring')) return 'sparrer';
    return 'assistant';
  };

  const saveChanges = async () => {
    setSaveError(null);
    try {
      for (const row of rows) {
        if (!row.staff_id && !row.staff) continue;
        const sessionId = row.session_id || sessions.find((s: any) => s.name === row.session)?.id || '';
        const staffId = row.staff_id || staffList.find((member: any) => member.display_name === row.staff)?.id || '';
        const rateCardId = row.rate_card_id || rates.find((rate: any) => rate.label === row.rate_card)?.id || '';
        const payload = {
          session_id: sessionId,
          staff_id: staffId,
          capacity: normalizeCapacity(row.role),
          rate_card_id: rateCardId,
          planned_start: row.from ? new Date(row.from).toISOString() : null,
          planned_end: row.to ? new Date(row.to).toISOString() : null,
        };
        if (!payload.session_id || !payload.staff_id || !payload.rate_card_id || !payload.planned_start || !payload.planned_end) continue;
        if (row.id) {
          const { error } = await supabase.from('mentis_session_staffing').update(payload).eq('id', row.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from('mentis_session_staffing').insert(payload).select('id').single();
          if (error) throw error;
          if (data) row.id = data.id;
        }
      }
      await loadRows();
    } catch (error: any) {
      console.error('Staffing save failed', error);
      setSaveError(error?.message ?? 'Unable to save staffing changes.');
    }
  };

  const removeRow = async (rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row) return;
    if (row.id) {
      await supabase.from('mentis_session_staffing').delete().eq('id', row.id);
    }
    setRows((prev) => prev.filter((_, index) => index !== rowIndex));
    await loadRows();
  };

  const renderStatus = (value: string) => {
    const map: Record<string, string> = {
      Assigned: 'bg-emerald-100 text-emerald-700',
      Conflict: 'bg-rose-100 text-rose-700',
      Completed: 'bg-slate-200 text-slate-600',
    };
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${map[String(value)] ?? 'bg-slate-100 text-slate-600'}`}>{value || 'Assigned'}</span>;
  };

  const isSelected = (rowIndex: number, colIndex: number) => {
    if (!selection) return focusedCell.row === rowIndex && focusedCell.col === colIndex;
    const minRow = Math.min(selection.startRow, selection.endRow);
    const maxRow = Math.max(selection.startRow, selection.endRow);
    const minCol = Math.min(selection.startCol, selection.endCol);
    const maxCol = Math.max(selection.startCol, selection.endCol);
    return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol;
  };

  return (
    <div>
      <PageTitle title="Staffing" sub="Assign coaches per session (split hours supported, overlap guarded, rule 21)" />
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <button type="button" className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100" onClick={addRow}>[+] Add Row</button>
        <button type="button" className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">[Copy]</button>
        <button type="button" className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">[Cut]</button>
        <button type="button" className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">[Paste]</button>
        <button type="button" className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100" onClick={() => rows.length && void removeRow(focusedCell.row)}>Delete Row</button>
        <button type="button" className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Sort A-Z</button>
        <button type="button" className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Filter</button>
        <button type="button" className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Undo</button>
        <button type="button" className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Redo</button>
        <button type="button" className="ml-auto rounded-md bg-[#3a53d8] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#2d45c7]" onClick={() => void saveChanges()}>Save Changes</button>
      </div>
      {saveError && <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{saveError}</div>}
      <div className="card overflow-auto rounded-[18px] border-[2px] border-[#3a53d8] bg-white p-2" style={{ userSelect: 'none', WebkitUserSelect: 'none', msUserSelect: 'none', MozUserSelect: 'none' }}>
        <table className="min-w-[1000px] w-full border-collapse">
          <thead>
            <tr>
              <th className="w-12 min-w-[48px] border border-slate-200 bg-slate-100 px-1 py-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">#</th>
              {columns.map((column) => (
                <th key={column.key} className="border border-slate-200 bg-slate-100 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600" style={{ width: column.width }}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id || `new-staff-row-${rowIndex}`} className="align-top">
                <td className="select-none border border-slate-200 bg-slate-50 px-1 py-1 text-center text-[11px] font-semibold text-slate-500">{rowIndex + 1}</td>
                {columns.map((column, colIndex) => {
                  const value = row[column.key];
                  const isActiveCell = focusedCell.row === rowIndex && focusedCell.col === colIndex;
                  const isHighlight = isSelected(rowIndex, colIndex);
                  const hasConflict = row.status === 'Conflict';
                  return (
                    <td
                      key={`${column.key}-${rowIndex}`}
                      className={`border border-slate-200 px-2 py-1 text-sm ${isHighlight ? 'bg-blue-50' : 'bg-white'} ${hasConflict && column.key === 'status' ? 'shadow-[inset_0_0_0_1px_rgba(239,68,68,0.8)]' : ''}`}
                      style={{ minWidth: column.width }}
                      onClick={() => { setFocusedCell({ row: rowIndex, col: colIndex }); setSelection({ startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex }); }}
                      onDoubleClick={() => {
                        setEditingCell({ row: rowIndex, col: colIndex });
                        setDraftValue(String(value ?? ''));
                      }}
                    >
                      {editingCell?.row === rowIndex && editingCell?.col === colIndex ? (
                        <input
                          autoFocus
                          value={draftValue}
                          onChange={(event) => setDraftValue(event.target.value)}
                          onBlur={() => {
                            setCell(rowIndex, column.key, draftValue);
                            setEditingCell(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              setCell(rowIndex, column.key, draftValue);
                              setEditingCell(null);
                              setFocusedCell({ row: Math.min(rows.length - 1, rowIndex + 1), col: colIndex });
                            }
                            if (event.key === 'Escape') setEditingCell(null);
                          }}
                          className="w-full border-none bg-transparent text-sm text-slate-800 outline-none"
                          type={column.key === 'from' || column.key === 'to' ? 'datetime-local' : 'text'}
                        />
                      ) : (
                        <div className={`flex min-h-[28px] items-center ${isActiveCell ? 'rounded-sm ring-2 ring-[#3a53d8]' : ''}`}>
                          {column.key === 'status' ? renderStatus(String(value || 'Assigned')) : (value ?? '—')}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Session close-out: actuals → pay-ready time entries ---------- */
export function SessionClose() {
  const { staff } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [actuals, setActuals] = useState<Record<string, { starts_at: string; ends_at: string }>>({});
  const [done, setDone] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    supabase.from('mentis_session_occurrences').select('id,name,start_at,end_at,status').eq('status', 'scheduled').order('start_at', { ascending: false }).limit(30).then(({ data }) => setSessions(data ?? []));
  }, []);
  const load = async () => {
    if (!sessionId) return;
    const { data } = await supabase.from('mentis_session_staffing').select('*,mentis_staff(display_name),mentis_rate_cards(rate_cents)').eq('session_id', sessionId);
    setRows(data ?? []);
    const { data: entries } = await supabase.from('mentis_staff_time_entries').select('staff_id').eq('session_id', sessionId).eq('kind', 'actual');
    setDone((entries ?? []).map((e: any) => e.staff_id));
    const init: Record<string, { starts_at: string; ends_at: string }> = {};
    for (const r of data ?? []) init[r.id] = { starts_at: r.planned_start.slice(0, 16), ends_at: r.planned_end.slice(0, 16) };
    setActuals(init);
  };
  useEffect(() => { load(); }, [sessionId]);
  const saveActual = async (r: any) => {
    const a = actuals[r.id];
    if (!a?.starts_at || !a?.ends_at) { setMsg('Enter actual start/end.'); return; }
    const { error } = await supabase.from('mentis_staff_time_entries').insert({
      organization_id: staff?.organization_id, staff_id: r.staff_id, session_id: sessionId, kind: 'actual',
      starts_at: new Date(a.starts_at).toISOString(), ends_at: new Date(a.ends_at).toISOString(),
      rate_cents: r.rate_cards?.rate_cents ?? 0,
    });
    setMsg(error ? error.message : `Actual saved for ${r.mentis_staff?.display_name}.`);
    load();
  };
  const complete = async () => {
    if (rows.length && !rows.every((r: any) => done.includes(r.staff_id))) { setMsg('Log actuals for all staff first (or remove them).'); return; }
    await supabase.from('mentis_session_occurrences').update({ status: 'completed' }).eq('id', sessionId);
    setMsg('Session completed.');
  };
  return (
    <div>
      <PageTitle title="Session close-out" sub="Actuals → pay-ready time entries → completed" />
      <div className="card p-4 mb-4 flex gap-2 items-end">
        <select className="input" style={{ width: 280 }} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          <option value="">Session…</option>{sessions.map((s: any) => <option key={s.id} value={s.id}>{s.name} — {new Date(s.start_at).toLocaleString()}</option>)}
        </select>
        <button className="btn btn-primary" onClick={complete}>Mark completed</button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Staff</th><th>Planned</th><th>Actual start</th><th>Actual end</th><th></th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}><td className="font-semibold">{r.mentis_staff?.display_name}{done.includes(r.staff_id) && ' ✓'}</td>
            <td className="text-xs">{new Date(r.planned_start).toLocaleString()} → {new Date(r.planned_end).toLocaleTimeString()}</td>
            <td><input type="datetime-local" className="input" value={actuals[r.id]?.starts_at ?? ''} onChange={(e) => setActuals({ ...actuals, [r.id]: { ...actuals[r.id], starts_at: e.target.value } })} /></td>
            <td><input type="datetime-local" className="input" value={actuals[r.id]?.ends_at ?? ''} onChange={(e) => setActuals({ ...actuals, [r.id]: { ...actuals[r.id], ends_at: e.target.value } })} /></td>
            <td><button className="btn btn-ghost" disabled={done.includes(r.staff_id)} onClick={() => saveActual(r)}>Save actual</button></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
