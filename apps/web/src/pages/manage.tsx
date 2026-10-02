import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';
import { ReviewAndConfirmBanner, ConfirmDialog } from '../components/ui/dialog';

const spreadsheetGridStyle = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  msUserSelect: 'none',
  MozUserSelect: 'none',
} as const;

/* ---------- Venues ---------- */
export function Venues() {
  const { staff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [selection, setSelection] = useState<{ startRow: number; endRow: number; startCol: number; endCol: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; row: number | null } | null>(null);

  const columns = [
    { key: 'name', label: 'Name', width: 180 },
    { key: 'address', label: 'Address', width: 220 },
    { key: 'phone', label: 'Phone', width: 140 },
    { key: 'capacity', label: 'Capacity', width: 90 },
    { key: 'concurrent_session_limit', label: 'Limit', width: 90 },
    { key: 'status', label: 'Status', width: 120 },
  ] as const;

  const load = async () => {
    const { data } = await supabase.from('mentis_venues').select('*').order('name');
    const normalized = (data ?? []).map((row: any) => ({
      ...row,
      status: row.status ?? ((row.name && row.address) ? 'Active' : 'Maintenance'),
      capacity: row.capacity ?? '',
      concurrent_session_limit: row.concurrent_session_limit ?? 1,
    }));
    setRows(normalized);
    if (!normalized.length) {
      setFocusedCell({ row: 0, col: 0 });
      setSelection(null);
    }
  };

  useEffect(() => { void load(); }, []);

  const formatCellValue = (row: any, key: string) => {
    const value = row[key];
    if (key === 'status') return value ?? 'Active';
    if (key === 'capacity') return value ?? '';
    if (key === 'concurrent_session_limit') return value ?? 1;
    return value ?? '';
  };

  const setCell = (rowIndex: number, key: string, rawValue: string) => {
    const nextValue = String(rawValue ?? '').trim();
    setRows((prev) => prev.map((row, index) => {
      if (index !== rowIndex) return row;
      const updated = { ...row };
      if (key === 'name') updated.name = nextValue;
      if (key === 'address') updated.address = nextValue;
      if (key === 'phone') updated.phone = nextValue;
      if (key === 'capacity') updated.capacity = nextValue === '' ? '' : Number(nextValue);
      if (key === 'concurrent_session_limit') updated.concurrent_session_limit = nextValue === '' ? 1 : Number(nextValue);
      if (key === 'status') updated.status = ['Active', 'Maintenance', 'Closed'].includes(nextValue) ? nextValue : 'Active';
      return updated;
    }));
  };

  const addRow = () => {
    const emptyRow = {
      id: '',
      name: '',
      address: '',
      phone: '',
      capacity: '',
      concurrent_session_limit: 1,
      status: 'Active',
    };
    setRows((prev) => [...prev, emptyRow]);
    const nextRow = rows.length;
    setFocusedCell({ row: nextRow, col: 0 });
    setSelection({ startRow: nextRow, endRow: nextRow, startCol: 0, endCol: columns.length - 1 });
  };

  const removeRow = async (rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row) return;
    if (row.id) {
      await supabase.from('mentis_venues').delete().eq('id', row.id);
    }
    setRows((prev) => prev.filter((_, index) => index !== rowIndex));
    if (rows.length <= 1) {
      setSelection(null);
    }
    await load();
  };

  const saveChanges = async () => {
    setSaveError(null);
    try {
      for (const row of rows) {
        const payload = {
          organization_id: staff?.organization_id ?? null,
          name: row.name ?? '',
          address: row.address || null,
          phone: row.phone || null,
          capacity: row.capacity === '' || row.capacity == null ? null : Number(row.capacity),
          concurrent_session_limit: Number(row.concurrent_session_limit ?? 1),
          notes: row.notes ?? null,
        };

        if (!row.name?.trim()) continue;

        if (row.id) {
          const { error } = await supabase.from('mentis_venues').update(payload).eq('id', row.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from('mentis_venues').insert(payload).select('id').single();
          if (error) throw error;
          if (data) row.id = data.id;
        }
      }
      await load();
    } catch (error: any) {
      console.error('Venue save failed', error);
      setSaveError(error?.message ?? 'Unable to save venue changes.');
    }
  };

  const renderCellValue = (row: any, key: string) => {
    const value = formatCellValue(row, key);
    if (key === 'status') {
      const statusMap: Record<string, string> = {
        Active: 'bg-emerald-100 text-emerald-700',
        Maintenance: 'bg-amber-100 text-amber-700',
        Closed: 'bg-slate-200 text-slate-600',
      };
      const cls = statusMap[String(value)] ?? 'bg-slate-100 text-slate-600';
      return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${cls}`}>{value}</span>;
    }
    if (key === 'name' || key === 'address' || key === 'phone') {
      return <span className="block truncate">{value || '—'}</span>;
    }
    return <span className="block text-right">{value || '—'}</span>;
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
      <PageTitle title="Venues" sub="Concurrency limit defaults to 1 (rule 17)" />
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
      <div className="card overflow-auto rounded-[18px] border-[2px] border-[#3a53d8] bg-white p-2" style={spreadsheetGridStyle} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ visible: true, x: event.clientX, y: event.clientY, row: focusedCell.row }); }}>
        <table className="min-w-[860px] w-full border-collapse">
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
              <tr key={row.id || `new-venue-${rowIndex}`} className="align-top">
                <td className="select-none border border-slate-200 bg-slate-50 px-1 py-1 text-center text-[11px] font-semibold text-slate-500">{rowIndex + 1}</td>
                {columns.map((column, colIndex) => {
                  const isActiveCell = focusedCell.row === rowIndex && focusedCell.col === colIndex;
                  const isHighlight = isSelected(rowIndex, colIndex);
                  const value = formatCellValue(row, column.key);
                  const invalid = column.key === 'name' && !String(row.name ?? '').trim();
                  return (
                    <td
                      key={`${column.key}-${rowIndex}`}
                      className={`border border-slate-200 px-2 py-1 text-sm ${isHighlight ? 'bg-blue-50' : 'bg-white'} ${invalid ? 'shadow-[inset_0_0_0_1px_rgba(245,158,11,0.75)]' : ''}`}
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
                        />
                      ) : (
                        <div className={`flex min-h-[28px] items-center ${isActiveCell ? 'rounded-sm ring-2 ring-[#3a53d8]' : ''}`}>
                          {column.key === 'status' ? renderCellValue(row, column.key) : renderCellValue(row, column.key)}
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
      {contextMenu?.visible && (
        <div className="fixed z-50 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseLeave={() => setContextMenu(null)}>
          <button className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100" onClick={() => { void navigator.clipboard.writeText(''); setContextMenu(null); }}>Copy</button>
          <button className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100" onClick={() => setContextMenu(null)}>Cut</button>
          <button className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100" onClick={() => setContextMenu(null)}>Paste</button>
          <button className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100" onClick={() => { if (contextMenu.row != null) { void removeRow(contextMenu.row); } setContextMenu(null); }}>Delete Row</button>
        </div>
      )}
    </div>
  );
}

/* ---------- Groups ---------- */
export function Groups() {
  const { staff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [venueId, setVenueId] = useState('');
  const load = () => {
    supabase.from('mentis_groups').select('*,mentis_venues(name)').then(({ data }) => setRows(data ?? []));
    supabase.from('mentis_venues').select('id,name').then(({ data }) => setVenues(data ?? []));
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!name.trim()) return;
    await supabase.from('mentis_groups').insert({ organization_id: staff?.organization_id, name, venue_id: venueId || null });
    setName(''); load();
  };
  return (
    <div>
      <PageTitle title="Groups" sub="Venue-scoped cohorts for tasks, reminders, broadcasts" />
      <div className="card p-4 mb-4 flex gap-2">
        <input className="input" style={{ width: 220 }} placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input" style={{ width: 200 }} value={venueId} onChange={(e) => setVenueId(e.target.value)}>
          <option value="">Org-wide</option>{venues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <button className="btn btn-primary" onClick={save}>Add group</button>
      </div>
      <div className="card p-4">{rows.map((g: any) => <div key={g.id} className="py-1 text-sm">• {g.name} <span style={{ color: 'var(--ink-muted)' }}>{g.venues?.name ?? 'org-wide'}</span></div>)}</div>
    </div>
  );
}

/* ---------- Rate cards (native spreadsheet UI with keyboard navigation and clipboard support) ---------- */
export function RateCards() {
  const { staff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [form, setForm] = useState({ staff_id: '', label: '', rate: '', valid_from: new Date().toISOString().slice(0, 10), valid_to: '' });
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [selectionRange, setSelectionRange] = useState<{ startRow: number; endRow: number; startCol: number; endCol: number } | null>(null);
  const [selectionRanges, setSelectionRanges] = useState<Array<{ startRow: number; endRow: number; startCol: number; endCol: number }>>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; row: number | null; col: number | null }>({
    visible: false, x: 0, y: 0, row: null, col: null,
  });
  const [headerContextMenu, setHeaderContextMenu] = useState<{ visible: boolean; x: number; y: number; col: number | null }>({
    visible: false, x: 0, y: 0, col: null,
  });
  const [filterPopup, setFilterPopup] = useState<{ visible: boolean; x: number; y: number; col: number | null }>({
    visible: false, x: 0, y: 0, col: null,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editorValue, setEditorValue] = useState('');
  const [status, setStatus] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const dragAnchorRef = useRef<{ row: number; col: number } | null>(null);
  const selectionAnchorRef = useRef<{ row: number; col: number } | null>(null);

  const columns = [
    { key: 'staff', label: 'Staff' },
    { key: 'label', label: 'Label' },
    { key: 'rate', label: 'Rate £/h' },
    { key: 'start', label: 'Start' },
    { key: 'end', label: 'End' },
  ] as const;

  const gridNoSelectStyle = {
    userSelect: 'none',
    WebkitUserSelect: 'none',
    msUserSelect: 'none',
    MozUserSelect: 'none',
  } as const;

  const load = () => {
    supabase.from('mentis_rate_cards').select('*,mentis_staff(display_name)').order('valid_from', { ascending: false }).then(({ data }) => setRows(data ?? []));
    supabase.from('mentis_staff').select('id,display_name').then(({ data }) => setStaffList(data ?? []));
  };

  useEffect(() => { load(); }, []);

  const getStaffOptions = (): Array<{ value: string; label: string }> =>
    staffList.map((staffMember) => ({ value: staffMember.id, label: staffMember.display_name }));
  const getLabelOptions = (): Array<{ value: string; label: string }> => ['Standard', 'Premium'].map((value) => ({ value, label: value }));

  const getCellValue = (row: any, key: string) => {
    switch (key) {
      case 'staff':
        return row.mentis_staff?.display_name ?? '—';
      case 'label':
        return row.label ?? '';
      case 'rate':
        return row.rate_cents == null ? '' : (row.rate_cents / 100).toFixed(2);
      case 'start':
        return row.valid_from ?? '';
      case 'end':
        return row.valid_to ?? '';
      default:
        return '';
    }
  };

  const setCellValue = (row: any, key: string, rawValue: string) => {
    const value = rawValue.trim();
    switch (key) {
      case 'staff': {
        const match = staffList.find((person) => person.display_name === value || person.id === value);
        return match ? { staff_id: match.id } : {};
      }
      case 'label':
        return { label: value };
      case 'rate': {
        const parsed = Number(value);
        return { rate_cents: Number.isFinite(parsed) ? Math.round(parsed * 100) : 0 };
      }
      case 'start':
        return { valid_from: value || null };
      case 'end':
        return { valid_to: value || null };
      default:
        return {};
    }
  };

  const persistRowChange = async (rowId: string, updates: Record<string, any>) => {
    if (!Object.keys(updates).length) return;
    const { error } = await supabase.from('mentis_rate_cards').update(updates).eq('id', rowId);
    if (error) {
      setStatus(`Save failed: ${error.message}`);
      return;
    }
    setStatus('Saved');
    load();
  };

  const commitEditor = async (nextValue?: string) => {
    const value = typeof nextValue === 'string' ? nextValue : editorValue;
    const activeRows = visibleRows.length ? visibleRows : rows;
    const row = activeRows[focusedCell.row];
    if (!row) return;
    const column = columns[focusedCell.col];
    const updates = setCellValue(row, column.key, value);
    await persistRowChange(row.id, updates);
    setIsEditing(false);
  };

  const clearSelection = () => {
    setSelectionRange(null);
    setIsDragging(false);
    dragAnchorRef.current = null;
    setStatus('');
  };

  const ensureInBounds = (row: number, col: number) => ({
    row: Math.min(Math.max(row, 0), Math.max(rows.length - 1, 0)),
    col: Math.min(Math.max(col, 0), Math.max(columns.length - 1, 0)),
  });

  const makeRange = (startRow: number, endRow: number, startCol: number, endCol: number) => ({
    startRow: Math.min(startRow, endRow),
    endRow: Math.max(startRow, endRow),
    startCol: Math.min(startCol, endCol),
    endCol: Math.max(startCol, endCol),
  });

  const isCellInSelection = (row: number, col: number) => {
    const ranges = selectionRanges.length ? selectionRanges : selectionRange ? [selectionRange] : [];
    return ranges.some((range) => (
      row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol
    ));
  };

  const setCellFocus = (row: number, col: number, maintainSelection = false) => {
    const next = ensureInBounds(row, col);
    setFocusedCell(next);
    if (!maintainSelection) {
      setSelectionRange({
        startRow: next.row,
        endRow: next.row,
        startCol: next.col,
        endCol: next.col,
      });
      selectionAnchorRef.current = next;
    }
  };

  const onCellPointerDown = (event: React.MouseEvent<HTMLTableCellElement>, row: number, col: number) => {
    event.preventDefault();
    const next = { row, col };
    dragAnchorRef.current = next;
    selectionAnchorRef.current = next;
    setFocusedCell(next);
    setIsDragging(true);

    const newRange = {
      startRow: next.row,
      endRow: next.row,
      startCol: next.col,
      endCol: next.col,
    };

    if (event.shiftKey && selectionAnchorRef.current) {
      const anchor = selectionAnchorRef.current;
      const range = makeRange(anchor.row, next.row, anchor.col, next.col);
      setSelectionRange(range);
      setSelectionRanges([range]);
    } else if (event.ctrlKey || event.metaKey) {
      setSelectionRange(newRange);
      setSelectionRanges((previous) => [...previous, newRange]);
    } else {
      setSelectionRange(newRange);
      setSelectionRanges([newRange]);
    }

    if (event.detail === 2) {
      setEditorValue(getCellValue(rows[row], columns[col].key));
      setIsEditing(true);
    }
  };

  const onCellPointerEnter = (row: number, col: number) => {
    if (!isDragging || !dragAnchorRef.current) return;
    const anchor = dragAnchorRef.current;
    setSelectionRange(makeRange(anchor.row, row, anchor.col, col));
    setFocusedCell({ row, col });
  };

  const onCellPointerUp = () => {
    setIsDragging(false);
    dragAnchorRef.current = null;
  };

  const sortRows = (key: string) => {
    setSortConfig((current) => {
      const direction = current?.key === key && current.direction === 'asc' ? 'desc' : 'asc';
      setRows((previous) => [...previous].sort((a, b) => {
        const left = getCellValue(a, key);
        const right = getCellValue(b, key);
        const leftNum = Number(left);
        const rightNum = Number(right);
        const isNumeric = Number.isFinite(leftNum) && Number.isFinite(rightNum);
        const comparison = isNumeric
          ? leftNum - rightNum
          : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
        return direction === 'asc' ? comparison : -comparison;
      }));
      return { key, direction };
    });
  };

  const onRowHeaderClick = (row: number, event?: React.MouseEvent<HTMLTableCellElement>) => {
    const anchor = selectionAnchorRef.current ?? { row, col: focusedCell.col };
    const nextRange = { startRow: row, endRow: row, startCol: 0, endCol: columns.length - 1 };
    if (event?.shiftKey) {
      const range = makeRange(anchor.row, row, 0, columns.length - 1);
      setSelectionRange(range);
      setSelectionRanges([range]);
    } else if (event?.ctrlKey || event?.metaKey) {
      setSelectionRange(nextRange);
      setSelectionRanges((previous) => [...previous, nextRange]);
    } else {
      setSelectionRange(nextRange);
      setSelectionRanges([nextRange]);
      selectionAnchorRef.current = { row, col: 0 };
    }
    setFocusedCell({ row, col: 0 });
  };

  const onColumnHeaderClick = (col: number, event?: React.MouseEvent<HTMLTableCellElement>) => {
    const anchor = selectionAnchorRef.current ?? { row: focusedCell.row, col };
    const maxRow = Math.max(rows.length - 1, 0);
    const nextRange = { startRow: 0, endRow: maxRow, startCol: col, endCol: col };
    if (event?.shiftKey) {
      const range = makeRange(anchor.row, focusedCell.row, anchor.col, col);
      setSelectionRange(range);
      setSelectionRanges([range]);
    } else if (event?.ctrlKey || event?.metaKey) {
      setSelectionRange(nextRange);
      setSelectionRanges((previous) => [...previous, nextRange]);
    } else {
      setSelectionRange(nextRange);
      setSelectionRanges([nextRange]);
      selectionAnchorRef.current = { row: 0, col };
    }
    setFocusedCell({ row: focusedCell.row, col });
  };

  const getColumnValues = (columnKey: string) => {
    const values = rows.map((row) => getCellValue(row, columnKey)).filter((value) => value !== '' && value !== '—');
    return [...new Set(values)];
  };

  const activeFilterColumn = filterPopup.col !== null ? columns[filterPopup.col] : null;

  const visibleRows = rows.filter((row) => columns.every((column) => {
    const activeValues = columnFilters[column.key] ?? [];
    if (!activeValues.length) return true;
    const value = getCellValue(row, column.key);
    return activeValues.includes(value) || activeValues.includes(String(value));
  }));

  const applyHeaderFilter = (col: number, selectedValues: string[]) => {
    const columnKey = columns[col].key;
    setColumnFilters((previous) => {
      const next = { ...previous };
      if (!selectedValues.length) delete next[columnKey];
      else next[columnKey] = selectedValues;
      return next;
    });
    setFilterPopup({ visible: false, x: 0, y: 0, col: null });
    setHeaderContextMenu({ visible: false, x: 0, y: 0, col: null });
  };

  const getSelectionMatrix = () => {
    const activeSelection = selectionRange ?? (selectionRanges[0] ?? null);
    if (!activeSelection) return [] as string[][];
    const activeRows = visibleRows.length ? visibleRows : rows;
    const selRows = activeRows.slice(activeSelection.startRow, activeSelection.endRow + 1);
    const selectedColumnKeys = columns.slice(activeSelection.startCol, activeSelection.endCol + 1).map((column) => column.key);
    return selRows.map((row) => selectedColumnKeys.map((key) => getCellValue(row, key)));
  };

  const writeClipboardText = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch (error) {
      // fall back below
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const readClipboardText = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        return await navigator.clipboard.readText();
      }
    } catch (error) {
      // fall through
    }

    return '';
  };

  const copySelectionToClipboard = async () => {
    const matrix = getSelectionMatrix();
    const activeRows = visibleRows.length ? visibleRows : rows;
    const text = matrix.length
      ? matrix.map((row) => row.join('\t')).join('\n')
      : getCellValue(activeRows[focusedCell.row], columns[focusedCell.col].key);
    if (text === undefined || text === null || text === '') {
      setStatus('Nothing to copy');
      return;
    }
    await writeClipboardText(String(text));
    setStatus('Copied to clipboard');
  };

  const cutSelectionToClipboard = async () => {
    await copySelectionToClipboard();
    if (!selectionRange) {
      const row = rows[focusedCell.row];
      if (!row) return;
      const updates = setCellValue(row, columns[focusedCell.col].key, '');
      await persistRowChange(row.id, updates);
      return;
    }

    const { startRow, endRow, startCol, endCol } = selectionRange;
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
      const row = rows[rowIndex];
      if (!row) continue;
      for (let colIndex = startCol; colIndex <= endCol; colIndex += 1) {
        const updates = setCellValue(row, columns[colIndex].key, '');
        await persistRowChange(row.id, updates);
      }
    }
    setSelectionRange(null);
  };

  const parseTabularClipboard = (text: string) => {
    const rows = text.replace(/\r/g, '').split('\n').filter((line) => line.length > 0);
    return rows.map((line) => line.split('\t'));
  };

  const pasteClipboardIntoGrid = async () => {
    const rawText = await readClipboardText();
    if (!rawText.trim()) {
      setStatus('Clipboard is empty');
      return;
    }
    const matrix = parseTabularClipboard(rawText);
    const range = selectionRange ?? {
      startRow: focusedCell.row,
      endRow: focusedCell.row,
      startCol: focusedCell.col,
      endCol: focusedCell.col,
    };
    const activeRows = visibleRows.length ? visibleRows : rows;

    for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
      const targetRowIndex = range.startRow + rowOffset;
      const row = activeRows[targetRowIndex];
      if (!row) continue;
      const pasteRow = matrix[rowOffset] ?? [];
      for (let colOffset = 0; colOffset < pasteRow.length; colOffset += 1) {
        const targetColIndex = range.startCol + colOffset;
        if (targetColIndex >= columns.length) break;
        const updates = setCellValue(row, columns[targetColIndex].key, pasteRow[colOffset] ?? '');
        await persistRowChange(row.id, updates);
      }
    }
    setStatus('Pasted clipboard');
    load();
  };

  const startInlineEdit = (value?: string) => {
    const activeRows = visibleRows.length ? visibleRows : rows;
    const row = activeRows[focusedCell.row];
    if (!row) return;
    setEditorValue(typeof value === 'string' ? value : getCellValue(row, columns[focusedCell.col].key));
    setIsEditing(true);
  };

  const handleGlobalKeydown = async (event: KeyboardEvent) => {
    const tagName = (event.target as HTMLElement | null)?.tagName;
    const isTypingTarget = !!tagName && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName);
    if (isTypingTarget) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      await copySelectionToClipboard();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      await cutSelectionToClipboard();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      await pasteClipboardIntoGrid();
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      startInlineEdit();
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      startInlineEdit(event.key);
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const deltaRow = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      const deltaCol = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      const next = ensureInBounds(focusedCell.row + deltaRow, focusedCell.col + deltaCol);
      const anchor = selectionAnchorRef.current ?? { row: focusedCell.row, col: focusedCell.col };
      if (event.shiftKey) {
        setSelectionRange(makeRange(anchor.row, next.row, anchor.col, next.col));
      } else {
        setSelectionRange({ startRow: next.row, endRow: next.row, startCol: next.col, endCol: next.col });
        selectionAnchorRef.current = next;
      }
      setFocusedCell(next);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const nextCol = event.shiftKey ? focusedCell.col - 1 : focusedCell.col + 1;
      const nextRow = focusedCell.row;
      setCellFocus(nextRow, nextCol, false);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      setCellFocus(focusedCell.row + (event.shiftKey ? -1 : 1), focusedCell.col, false);
      return;
    }

    if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      const value = getCellValue(rows[focusedCell.row], columns[focusedCell.col].key);
      startInlineEdit(value);
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      const row = rows[focusedCell.row];
      if (!row) return;
      const updates = setCellValue(row, columns[focusedCell.col].key, '');
      await persistRowChange(row.id, updates);
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, [focusedCell, rows, selectionRange, columns, staffList, editorValue]);

  const save = async () => {
    if (!form.staff_id || !form.label.trim() || !form.rate) return;
    const { error } = await supabase.from('mentis_rate_cards').insert({
      organization_id: staff?.organization_id, staff_id: form.staff_id, label: form.label,
      rate_cents: Math.round(Number(form.rate) * 100), valid_from: form.valid_from, valid_to: form.valid_to || null,
    });
    if (error) {
      setStatus(`Save failed: ${error.message}`);
      return;
    }
    setForm({ ...form, label: '', rate: '', valid_to: '' });
    setStatus('Saved');
    load();
  };

  const renderCell = (rowIndex: number, colIndex: number) => {
    const row = visibleRows[rowIndex] ?? rows[rowIndex];
    const key = columns[colIndex].key;
    const currentValue = getCellValue(row, key);
    const isSelected = rowIndex === focusedCell.row && colIndex === focusedCell.col;
    const isInSelection = isCellInSelection(rowIndex, colIndex);
    const dropdownOptions: Array<{ value: string; label: string }> = key === 'staff'
      ? getStaffOptions()
      : key === 'label'
        ? getLabelOptions()
        : [];

    if (isEditing && isSelected) {
      if (dropdownOptions.length) {
        const selectedOption = dropdownOptions.find((option) => option.label === currentValue || option.value === currentValue);
        return (
          <select
            autoFocus
            value={selectedOption?.value ?? currentValue}
            className="w-full border-0 bg-transparent text-[12px] outline-none"
            onChange={(event) => {
              const nextValue = event.target.value;
              void commitEditor(nextValue);
            }}
            onBlur={() => void commitEditor()}
          >
            {dropdownOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        );
      }

      return (
        <input
          autoFocus
          className="w-full border-0 bg-transparent text-[12px] outline-none"
          value={editorValue}
          onChange={(event) => setEditorValue(event.target.value)}
          onBlur={() => void commitEditor()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commitEditor();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setIsEditing(false);
            }
          }}
        />
      );
    }

    return (
      <div className="relative flex min-h-[24px] items-center justify-between gap-2 text-[12px] leading-6 text-slate-700">
        <span className="block min-w-0 flex-1 truncate">{currentValue || '—'}</span>
        {dropdownOptions.length > 0 && isSelected && (
          <span className="pointer-events-none text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">▾</span>
        )}
      </div>
    );
  };

  return (
    <div>
      <PageTitle title="Rate cards" sub="Spreadsheet-style edits, copy/paste and bulk updates (rule 20)" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
        <select className="input" style={{ width: 180 }} value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>
          <option value="">Staff…</option>{staffList.map((s: any) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
        </select>
        <input className="input" style={{ width: 160 }} placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <label className="text-sm">£/hr <input className="input" style={{ width: 90 }} placeholder="25.00" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></label>
        <label className="text-sm">Start <input type="date" className="input" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></label>
        <label className="text-sm">End <input type="date" className="input" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} /></label>
        <button className="btn btn-primary" onClick={save}>Add card</button>
      </div>

      <div className="mb-4 rounded-[20px] border-[2px] border-[#3a53d8] bg-white p-3 shadow-[0_0_0_1px_rgba(58,83,216,0.08)]">
        <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
          <button type="button" title="Copy" onClick={() => { void copySelectionToClipboard(); }} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:border-[#3a53d8] hover:bg-[#eef2ff] hover:text-[#2d44d0]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect x="9" y="9" width="10" height="10" rx="1.5" /><path d="M7 7V6.5A1.5 1.5 0 0 1 8.5 5H15a2 2 0 0 1 2 2v8" /></svg>
          </button>
          <button type="button" title="Cut" onClick={() => { void cutSelectionToClipboard(); }} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:border-[#3a53d8] hover:bg-[#eef2ff] hover:text-[#2d44d0]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M8 7.5A2.5 2.5 0 1 1 8 12.5A2.5 2.5 0 0 1 8 7.5Zm0 0 8 9M8 12.5l8-9" /><path d="M15.5 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5Z" /></svg>
          </button>
          <button type="button" title="Paste" onClick={() => { void pasteClipboardIntoGrid(); }} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:border-[#3a53d8] hover:bg-[#eef2ff] hover:text-[#2d44d0]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M9 4.5v2.5M15 4.5v2.5M8 7h8a2 2 0 0 1 2 2v8.5A2.5 2.5 0 0 1 15.5 20h-7A2.5 2.5 0 0 1 6 17.5V9a2 2 0 0 1 2-2Z" /><path d="M9 12h6M9 15h6" /></svg>
          </button>
          <button type="button" title="Clear" onClick={clearSelection} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:border-[#3a53d8] hover:bg-[#eef2ff] hover:text-[#2d44d0]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M5 5l14 14M19 5L5 19" /></svg>
          </button>
          <div className="ml-auto flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#3a53d8]" /><span className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">excel</span></div>
        </div>
        {status && <div className="text-xs text-slate-500">{status}</div>}
      </div>

      <div className="card p-2 overflow-auto rounded-[18px] border-[2px] border-[#3a53d8]" style={gridNoSelectStyle} onDragStart={(event) => event.preventDefault()}>
        <table className="w-full min-w-[760px] border-collapse" style={gridNoSelectStyle}>
          <thead>
            <tr>
              <th
                style={gridNoSelectStyle}
                onMouseDown={(event) => {
                  event.preventDefault();
                  const maxRow = Math.max(visibleRows.length - 1, 0);
                  const maxCol = Math.max(columns.length - 1, 0);
                  const range = { startRow: 0, endRow: maxRow, startCol: 0, endCol: maxCol };
                  setSelectionRange(range);
                  setSelectionRanges([range]);
                  setFocusedCell({ row: 0, col: 0 });
                }}
                onClick={() => {
                  const maxRow = Math.max(visibleRows.length - 1, 0);
                  const maxCol = Math.max(columns.length - 1, 0);
                  const range = { startRow: 0, endRow: maxRow, startCol: 0, endCol: maxCol };
                  setSelectionRange(range);
                  setSelectionRanges([range]);
                  setFocusedCell({ row: 0, col: 0 });
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setHeaderContextMenu({ visible: true, x: event.clientX, y: event.clientY, col: null });
                }}
                className="min-w-[52px] cursor-pointer border border-slate-200 bg-slate-100 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500"
              >
                #
              </th>
              {columns.map((column, index) => (
                <th
                  key={column.key}
                  style={gridNoSelectStyle}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onColumnHeaderClick(index, event);
                  }}
                  onClick={(event) => onColumnHeaderClick(index, event)}
                  onDoubleClick={() => sortRows(column.key)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setHeaderContextMenu({ visible: true, x: event.clientX, y: event.clientY, col: index });
                  }}
                  className="min-w-[120px] cursor-pointer border border-slate-200 bg-slate-100 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-200"
                >
                  <span className="inline-flex items-center gap-1">
                    {column.label}
                    {sortConfig?.key === column.key && (
                      <span className="text-[10px] text-slate-500">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row: any, rowIndex: number) => (
              <tr key={row.id ?? `draft-${rowIndex}`}>
                <th
                  style={gridNoSelectStyle}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onRowHeaderClick(rowIndex, event);
                  }}
                  onClick={(event) => onRowHeaderClick(rowIndex, event)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, row: rowIndex, col: null });
                  }}
                  className="min-w-[52px] cursor-pointer border border-slate-200 bg-slate-100 px-2 py-2 text-center text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200"
                >
                  {rowIndex + 1}
                </th>
                {columns.map((column, colIndex) => {
                  const isSelected = rowIndex === focusedCell.row && colIndex === focusedCell.col;
                  const inSelection = isCellInSelection(rowIndex, colIndex);
                  return (
                    <td
                      key={`${row.id ?? `draft-${rowIndex}`}-${column.key}`}
                      style={gridNoSelectStyle}
                      onMouseDown={(event) => onCellPointerDown(event, rowIndex, colIndex)}
                      onMouseEnter={() => onCellPointerEnter(rowIndex, colIndex)}
                      onMouseUp={onCellPointerUp}
                      onDoubleClick={() => {
                        setEditorValue(getCellValue(row, column.key));
                        setContextMenu((current) => ({ ...current, visible: false }));
                        setIsEditing(true);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setFocusedCell({ row: rowIndex, col: colIndex });
                        setContextMenu({ visible: true, x: event.clientX, y: event.clientY, row: rowIndex, col: colIndex });
                      }}
                      className={[
                        'min-w-[120px] border border-slate-200 bg-white px-2 py-1 align-middle transition',
                        isSelected ? 'bg-[#eef2ff] ring-1 ring-[#3a53d8] ring-inset' : '',
                        inSelection && !isSelected ? 'bg-slate-50' : '',
                      ].join(' ')}
                    >
                      {renderCell(rowIndex, colIndex)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {headerContextMenu.visible && (
        <div
          className="fixed z-50 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-[0_12px_40px_rgba(15,23,42,0.18)]"
          style={{ left: headerContextMenu.x, top: headerContextMenu.y }}
          onClick={() => setHeaderContextMenu({ visible: false, x: 0, y: 0, col: null })}
        >
          <button type="button" className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); if (headerContextMenu.col !== null) { sortRows(columns[headerContextMenu.col].key); } }}>
            Sort A-Z
          </button>
          <button type="button" className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); if (headerContextMenu.col !== null) { setRows((previous) => [...previous].reverse()); setSortConfig({ key: columns[headerContextMenu.col].key, direction: 'desc' }); } }}>
            Sort Z-A
          </button>
          <button type="button" className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); if (headerContextMenu.col !== null) { setFilterPopup({ visible: true, x: headerContextMenu.x + 220, y: headerContextMenu.y, col: headerContextMenu.col }); } }}>
            Filter by Value
          </button>
          <button type="button" className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); if (headerContextMenu.col !== null) { const columnKey = columns[headerContextMenu.col].key; setColumnFilters((previous) => { const next = { ...previous }; delete next[columnKey]; return next; }); } }}>
            Clear Filter
          </button>
        </div>
      )}

      {filterPopup.visible && activeFilterColumn && (
        <div
          className="fixed z-[60] w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_12px_40px_rgba(15,23,42,0.18)]"
          style={{ left: filterPopup.x, top: filterPopup.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{activeFilterColumn.label}</div>
          <div className="max-h-52 space-y-1 overflow-auto pr-1">
            {getColumnValues(activeFilterColumn.key).map((value) => {
              const selected = columnFilters[activeFilterColumn.key]?.includes(value) ?? false;
              return (
                <label key={String(value)} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-100">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      const key = activeFilterColumn.key;
                      setColumnFilters((previous) => {
                        const current = previous[key] ?? [];
                        const next = selected ? current.filter((item) => item !== value) : [...current, value];
                        const copy = { ...previous };
                        if (!next.length) delete copy[key];
                        else copy[key] = next;
                        return copy;
                      });
                    }}
                  />
                  <span>{value}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between gap-2 border-t border-slate-200 pt-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (filterPopup.col !== null) { applyHeaderFilter(filterPopup.col, []); } }}>Clear</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setFilterPopup({ visible: false, x: 0, y: 0, col: null })}>Apply</button>
          </div>
        </div>
      )}

      {contextMenu.visible && (
        <div
          className="fixed z-50 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-[0_12px_40px_rgba(15,23,42,0.18)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={() => setContextMenu({ visible: false, x: 0, y: 0, row: null, col: null })}
        >
          <button type="button" className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); void copySelectionToClipboard(); }}>
            Copy <span className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Ctrl+C</span>
          </button>
          <button type="button" className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); void cutSelectionToClipboard(); }}>
            Cut <span className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Ctrl+X</span>
          </button>
          <button type="button" className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); void pasteClipboardIntoGrid(); }}>
            Paste <span className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Ctrl+V</span>
          </button>
          <div className="my-1 h-px bg-slate-200" />
          <button type="button" className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); const rowIndex = contextMenu.row ?? focusedCell.row; setRows((previous) => { const next = [...previous]; next.splice(rowIndex, 0, { id: `draft-${Date.now()}`, organization_id: staff?.organization_id ?? null, staff_id: '', label: 'Standard', rate_cents: 0, valid_from: new Date().toISOString().slice(0, 10), valid_to: null, mentis_staff: null }); return next; }); setFocusedCell({ row: rowIndex, col: 0 }); setSelectionRange({ startRow: rowIndex, endRow: rowIndex, startCol: 0, endCol: columns.length - 1 }); setStatus('Inserted row'); }}>
            Insert row above
          </button>
          <button type="button" className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); const rowIndex = (contextMenu.row ?? focusedCell.row) + 1; setRows((previous) => { const next = [...previous]; next.splice(rowIndex, 0, { id: `draft-${Date.now()}`, organization_id: staff?.organization_id ?? null, staff_id: '', label: 'Standard', rate_cents: 0, valid_from: new Date().toISOString().slice(0, 10), valid_to: null, mentis_staff: null }); return next; }); setFocusedCell({ row: rowIndex, col: 0 }); setSelectionRange({ startRow: rowIndex, endRow: rowIndex, startCol: 0, endCol: columns.length - 1 }); setStatus('Inserted row'); }}>
            Insert row below
          </button>
          <button type="button" className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50" onClick={(event) => { event.stopPropagation(); const rowIndex = contextMenu.row ?? focusedCell.row; const row = rows[rowIndex]; if (row && row.id && String(row.id).startsWith('draft-') === false) { void supabase.from('mentis_rate_cards').delete().eq('id', row.id); } setRows((previous) => previous.filter((_, index) => index !== rowIndex)); setStatus('Deleted row'); }}>
            Delete row
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Holiday calendar entries ---------- */
export function Holidays() {
  const { staff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [selection, setSelection] = useState<{ startRow: number; endRow: number; startCol: number; endCol: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [draftValue, setDraftValue] = useState('');

  const columns = [
    { key: 'name', label: 'Name', width: 200 },
    { key: 'type', label: 'Type', width: 180 },
    { key: 'from', label: 'From', width: 150 },
    { key: 'to', label: 'To', width: 150 },
    { key: 'status', label: 'Status', width: 120 },
    { key: 'exclude_sessions', label: 'Exclude Sessions?', width: 180 },
    { key: 'notes', label: 'Notes', width: 270 },
  ] as const;

  const load = async () => {
    const { data } = await supabase.from('mentis_holiday_calendar').select('*').order('starts_on');
    setRows((data ?? []).map((row: any) => ({
      ...row,
      type: row.kind ?? 'manual',
      from: row.starts_on ?? '',
      to: row.ends_on ?? '',
      exclude_sessions: row.exclude_sessions ?? 'No',
      status: row.status ?? (() => {
        if (!row.starts_on || !row.ends_on) return 'Upcoming';
        const from = new Date(row.starts_on);
        const to = new Date(row.ends_on);
        const today = new Date();
        if (from > to) return 'Invalid';
        if (today < from) return 'Upcoming';
        if (today <= to) return 'Active';
        return 'Expired';
      })(),
      notes: row.notes ?? '',
    })));
  };

  useEffect(() => { void load(); }, []);

  const setCell = (rowIndex: number, key: string, raw: string) => {
    const value = String(raw ?? '').trim();
    setRows((prev) => prev.map((row, index) => {
      if (index !== rowIndex) return row;
      const next = { ...row };
      if (key === 'name') next.name = value;
      if (key === 'type') next.type = ['Bank holiday', 'Term break', 'Manual closure', 'Staff leave'].includes(value) ? value : 'Manual closure';
      if (key === 'from') next.from = value;
      if (key === 'to') next.to = value;
      if (key === 'exclude_sessions') next.exclude_sessions = value === 'Yes' ? 'Yes' : 'No';
      if (key === 'notes') next.notes = value;
      const fromDate = next.from ? new Date(next.from) : null;
      const toDate = next.to ? new Date(next.to) : null;
      const now = new Date();
      if (fromDate && toDate && fromDate > toDate) next.status = 'Invalid';
      else if (fromDate && now < fromDate) next.status = 'Upcoming';
      else if (fromDate && toDate && now <= toDate) next.status = 'Active';
      else if (fromDate) next.status = 'Expired';
      else next.status = 'Upcoming';
      return next;
    }));
  };

  const addRow = () => {
    const next = {
      id: '',
      name: '',
      type: 'Manual closure',
      from: '',
      to: '',
      status: 'Upcoming',
      exclude_sessions: 'No',
      notes: '',
    };
    setRows((prev) => [...prev, next]);
    const rowIndex = rows.length;
    setFocusedCell({ row: rowIndex, col: 0 });
    setSelection({ startRow: rowIndex, endRow: rowIndex, startCol: 0, endCol: columns.length - 1 });
  };

  const saveChanges = async () => {
    setSaveError(null);
    try {
      for (const row of rows) {
        const payload = {
          organization_id: staff?.organization_id ?? null,
          name: row.name ?? '',
          kind: row.type === 'Bank holiday' ? 'bank_holiday' : row.type === 'Term break' ? 'term_break' : 'manual',
          starts_on: row.from || null,
          ends_on: row.to || null,
        };

        if (!row.name?.trim() || !row.from || !row.to) continue;

        if (row.id) {
          const { error } = await supabase.from('mentis_holiday_calendar').update(payload).eq('id', row.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from('mentis_holiday_calendar').insert(payload).select('id').single();
          if (error) throw error;
          if (data) row.id = data.id;
        }
      }
      await load();
    } catch (error: any) {
      console.error('Holiday save failed', error);
      setSaveError(error?.message ?? 'Unable to save holiday calendar changes.');
    }
  };

  const removeRow = async (rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row) return;
    if (row.id) {
      await supabase.from('mentis_holiday_calendar').delete().eq('id', row.id);
    }
    setRows((prev) => prev.filter((_, index) => index !== rowIndex));
    await load();
  };

  const renderStatus = (value: string) => {
    const map: Record<string, string> = {
      Active: 'bg-emerald-100 text-emerald-700',
      Upcoming: 'bg-blue-100 text-blue-700',
      Expired: 'bg-slate-200 text-slate-600',
      Invalid: 'bg-amber-100 text-amber-700',
    };
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${map[String(value)] ?? 'bg-slate-100 text-slate-600'}`}>{value || 'Upcoming'}</span>;
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
      <PageTitle title="Holiday calendar" sub="Term breaks, bank holidays, manual no-session ranges" />
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
      <div className="card overflow-auto rounded-[18px] border-[2px] border-[#3a53d8] bg-white p-2" style={spreadsheetGridStyle}>
        <table className="min-w-[1100px] w-full border-collapse">
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
              <tr key={row.id || `new-holiday-${rowIndex}`} className="align-top">
                <td className="select-none border border-slate-200 bg-slate-50 px-1 py-1 text-center text-[11px] font-semibold text-slate-500">{rowIndex + 1}</td>
                {columns.map((column, colIndex) => {
                  const value = row[column.key];
                  const isActiveCell = focusedCell.row === rowIndex && focusedCell.col === colIndex;
                  const invalid = column.key === 'from' && row.from && row.to && new Date(row.from) > new Date(row.to);
                  const isHighlight = isSelected(rowIndex, colIndex);
                  return (
                    <td
                      key={`${column.key}-${rowIndex}`}
                      className={`border border-slate-200 px-2 py-1 text-sm ${isHighlight ? 'bg-blue-50' : 'bg-white'} ${invalid ? 'shadow-[inset_0_0_0_1px_rgba(245,158,11,0.75)]' : ''}`}
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
                          type={column.key === 'from' || column.key === 'to' ? 'date' : 'text'}
                        />
                      ) : (
                        <div className={`flex min-h-[28px] items-center ${isActiveCell ? 'rounded-sm ring-2 ring-[#3a53d8]' : ''}`}>
                          {column.key === 'status' ? renderStatus(String(value || 'Upcoming')) : (value ?? '—')}
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

/* ---------- Schedule overrides with affected-instance preview ---------- */
export function Overrides() {
  const { staff } = useAuth();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ schedule_id: '', starts_at: '', ends_at: '', venue_id: '' });
  const [preview, setPreview] = useState<any[]>([]);
  const load = () => {
    supabase.from('mentis_weekly_schedules').select('id,name').then(({ data }) => setSchedules(data ?? []));
    supabase.from('mentis_venues').select('id,name').then(({ data }) => setVenues(data ?? []));
    supabase.from('mentis_schedule_overrides').select('*').order('starts_at', { ascending: false }).limit(30).then(({ data }) => setRows(data ?? []));
  };
  useEffect(() => { load(); }, []);
  const doPreview = async () => {
    if (!form.schedule_id || !form.starts_at || !form.ends_at) return;
    const { data } = await supabase.from('mentis_session_occurrences').select('id,name,start_at,mentis_venues(name)')
      .eq('schedule_id', form.schedule_id).gte('start_at', form.starts_at).lte('end_at', form.ends_at);
    setPreview(data ?? []);
  };
  const save = async () => {
    if (!preview.length) { alert('Preview first — overrides need affected instances.'); return; }
    await supabase.from('mentis_schedule_overrides').insert({
      organization_id: staff?.organization_id, schedule_id: form.schedule_id,
      starts_at: form.starts_at, ends_at: form.ends_at, venue_id: form.venue_id || null,
      original_values: {}, override_values: { venue_id: form.venue_id || null }, created_by: staff?.user_id,
    });
    if (form.venue_id) {
      for (const p of preview) await supabase.from('mentis_session_occurrences').update({ venue_id: form.venue_id }).eq('id', p.id);
    }
    setPreview([]); load();
  };
  return (
    <div>
      <PageTitle title="Schedule overrides" sub="Range-based · precedence + badge + originals (rule 19)" />
      <div className="card p-4 mb-4 flex flex-wrap gap-2 items-end">
        <select className="input" style={{ width: 200 }} value={form.schedule_id} onChange={(e) => setForm({ ...form, schedule_id: e.target.value })}>
          <option value="">Schedule…</option>{schedules.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="text-sm">From <input type="datetime-local" className="input" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></label>
        <label className="text-sm">To <input type="datetime-local" className="input" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></label>
        <select className="input" style={{ width: 160 }} value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })}>
          <option value="">New venue…</option>{venues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <button className="btn btn-ghost" onClick={doPreview}>Preview affected ({preview.length})</button>
        <button className="btn btn-primary" onClick={save}>Apply override</button>
      </div>
      {preview.length > 0 && (
        <div className="mb-4">
          <ReviewAndConfirmBanner
            title="Review and confirm"
            description="This override affects the matching recurring sessions in the selected date range. Review the impacted dates before saving."
            count={preview.length}
            range={`${form.starts_at || '—'} → ${form.ends_at || '—'}`}
            skipBankHolidays={false}
            skipTermHolidays={false}
            tone={preview.length >= 5 ? 'warning' : 'neutral'}
          />
        </div>
      )}
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Range</th><th>Override</th><th>At</th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}><td>{new Date(r.starts_at).toLocaleString()} → {new Date(r.ends_at).toLocaleString()}</td>
            <td className="text-xs">{JSON.stringify(r.override_values)}</td><td>{new Date(r.created_at).toLocaleDateString()}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Action-type timelines (all configurable, rule 10) ---------- */
export function ActionTimelines() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => supabase.from('mentis_action_types').select('*').order('name').then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const save = async (t: any, field: string, days: string) => {
    await supabase.from('mentis_action_types').update({ [field]: `${Number(days)} days` }).eq('id', t.id);
    load();
  };
  return (
    <div>
      <PageTitle title="Action timelines" sub="Due/breach offsets per type (rule 10)" />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Type</th><th>Trigger</th><th>Due offset (days before)</th><th>Breach offset (days before)</th></tr></thead>
        <tbody>{rows.map((t: any) => (
          <tr key={t.id}><td className="font-semibold">{t.name}</td><td>{t.trigger}</td>
            <td><input type="number" className="input" style={{ width: 80 }} defaultValue={parseInterval(t.due_offset)} onBlur={(e) => save(t, 'due_offset', e.target.value)} /></td>
            <td><input type="number" className="input" style={{ width: 80 }} defaultValue={parseInterval(t.breach_offset)} onBlur={(e) => save(t, 'breach_offset', e.target.value)} /></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
function parseInterval(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'object') return (v as { days?: number }).days ?? 0;
  const m = /(\d+)/.exec(String(v));
  return m ? Number(m[1]) : 0;
}

/* ---------- Devices: per-device revocation (rule 27) ---------- */
export function Devices() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => supabase.from('mentis_devices').select('*').order('last_seen', { ascending: false }).then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const revoke = async (id: string, revoked: boolean) => {
    await supabase.from('mentis_devices').update({ revoked: !revoked }).eq('id', id);
    load();
  };
  return (
    <div>
      <PageTitle title="Devices" sub="Lost phone? Revoke its session here" />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Label</th><th>Last seen</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.map((d: any) => (
          <tr key={d.id}><td className="font-semibold">{d.label}</td><td>{d.last_seen ? new Date(d.last_seen).toLocaleString() : '—'}</td>
            <td>{d.revoked ? '⛔ revoked' : '✅ active'}</td>
            <td><button className="btn btn-ghost" onClick={() => revoke(d.id, d.revoked)}>{d.revoked ? 'Restore' : 'Revoke'}</button></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- Audit-log viewer ---------- */
export function AuditViewer() {
  const [rows, setRows] = useState<any[]>([]);
  const [action, setAction] = useState('');
  useEffect(() => {
    let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100);
    if (action) q = q.eq('action', action);
    q.then(({ data }) => setRows(data ?? []));
  }, [action]);
  return (
    <div>
      <PageTitle title="Audit log" sub="Actor · action · entity · field · period" right={
        <select className="input" style={{ width: 'auto' }} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {['medical.read', 'medical.write', 'role.change', 'task.approval', 'invoice.status', 'charge.move'].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      } />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>ID</th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}><td>{new Date(r.created_at).toLocaleString()}</td><td className="text-xs">{r.actor_id?.slice(0, 8)}</td>
            <td className="font-semibold">{r.action}</td><td>{r.entity}</td><td className="text-xs">{r.entity_id?.slice(0, 8)}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
