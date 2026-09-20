import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const availabilityLabels: Record<string, string> = {
  available: 'Available',
  on_duty: 'On duty',
  holiday: 'Holiday / annual leave',
  duty_outside_club: 'Duty outside club',
  unavailable_other: 'Other unavailable',
};

const formatAvailabilityLabel = (value?: string | null) => availabilityLabels[value ?? ''] ?? 'Unavailable';

export function Availability() {
  const [rows, setRows] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const [availabilityRes, staffRes] = await Promise.all([
        supabase
          .from('mentis_staff_availability')
          .select('*, mentis_staff!staff_availability_staff_id_fkey(display_name)')
          .order('starts_at', { ascending: false })
          .limit(200),
        supabase.from('mentis_staff').select('id, display_name').order('display_name', { ascending: true }),
      ]);

      if (!active) return;
      setRows(availabilityRes.data ?? []);
      setStaffList(staffRes.data ?? []);
      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    if (selectedStaffFilter === 'all') return rows;
    return rows.filter((row) => row.staff_id === selectedStaffFilter);
  }, [rows, selectedStaffFilter]);

  return (
    <div className="space-y-5 p-4 text-slate-900">
      <header className="flex flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Coach diary</p>
        <h1 className="text-2xl font-bold text-slate-900">Availability &amp; planning</h1>
        <p className="text-sm text-slate-600">Review availability windows, manage leave, and filter records by staff.</p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-slate-700">Staff display</div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span>View:</span>
            <select
              className="rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs"
              value={selectedStaffFilter}
              onChange={(event) => setSelectedStaffFilter(event.target.value)}
            >
              <option value="all">All coaches</option>
              {staffList.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.display_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-5 text-sm text-slate-500">Loading availability…</div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
            No diary entries available for this selection.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRows.map((row) => (
              <div
                key={row.id}
                className={`rounded-lg border p-3 ${row.available ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="font-semibold text-slate-800">{row.mentis_staff?.display_name ?? 'Unknown staff'}</div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {row.available ? 'Available' : formatAvailabilityLabel(row.availability_type)}
                  </div>
                </div>

                <div className="mt-2 text-sm text-slate-600">
                  {new Date(row.starts_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} →{' '}
                  {new Date(row.ends_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </div>

                {row.reason && <div className="mt-2 text-sm text-slate-600">{row.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}