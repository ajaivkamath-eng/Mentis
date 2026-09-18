import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { PageTitle } from '../lib/ui';

/* ---------- Manager diary calendar (month grid, schema-aligned) ---------- */
export function DiaryCalendar() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [sessions, setSessions] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  useEffect(() => {
    setLoading(true);
    const from = `${month}-01T00:00:00Z`;
    const to = `${month}-31T23:59:59Z`;
    supabase.from('mentis_sessions').select('id,name,start_at,end_at,status,mentis_venues(name)').gte('start_at', from).lte('start_at', to).order('start_at').then(({ data }) => setSessions(data ?? []));
    supabase.from('mentis_events').select('id,name,starts_on,location').gte('starts_on', `${month}-01`).lte('starts_on', `${month}-31`).then(({ data }) => { setEvents(data ?? []); setLoading(false); });
  }, [month]);
  const days: Record<string, { sessions: any[]; events: any[] }> = {};
  for (const s of sessions) {
    const d = s.start_at.slice(0, 10);
    days[d] = days[d] ?? { sessions: [], events: [] };
    days[d].sessions.push(s);
  }
  for (const e of events) {
    days[e.starts_on] = days[e.starts_on] ?? { sessions: [], events: [] };
    days[e.starts_on].events.push(e);
  }
  const first = new Date(`${month}-01T00:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  const cursor = new Date(first);
  while (cursor.toISOString().slice(0, 7) === month) {
    cells.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const visibleCells = view === 'month' ? cells : view === 'week' ? cells.slice(Math.max(0, lead), Math.max(0, lead) + 7) : cells.slice(Math.max(0, lead), Math.max(0, lead) + 1);
  const visibleLabels = view === 'month' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : visibleCells.map(d => d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short' }) : '');

  return (
    <div>
      <PageTitle title="Diary" sub="Sessions + competitions" right={
        <span className="flex gap-1 rounded-md border border-line p-1">{(['day', 'week', 'month'] as const).map(v => <button key={v} className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}</span><input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
      } />
      {!loading && <div className="mb-3 flex flex-wrap gap-3 text-xs text-ink-muted">{Array.from(new Set(sessions.map(s => s.mentis_venues?.name).filter(Boolean))).map((venue: any, i) => <span key={venue}><i className="mr-1 inline-block size-2 rounded-full" style={{ background: ['var(--brand)', 'var(--accent)', 'var(--info)', 'var(--success)'][i % 4] }} />{venue}</span>)}</div>}
      {loading ? <div className="card p-10 text-center text-ink-muted"><span className="inline-block size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" /> Loading diary…</div> : <div className={`grid gap-1 ${view === 'day' ? 'grid-cols-1' : view === 'week' ? 'grid-cols-7' : 'grid-cols-7'}`}>
        {visibleLabels.map((d, i) => <div key={`${d}-${i}`} className="text-xs font-bold p-1" style={{ color: 'var(--ink-muted)' }}>{d}</div>)}
        {visibleCells.map((d, i) => (
          <div key={i} className="card p-1" style={{ minHeight: 90, opacity: d ? 1 : 0.25 }}>
            {d && <>
              <div className="text-xs font-bold">{d.slice(8)}</div>
              {(days[d]?.sessions ?? []).map((s: any) => (
                <Link key={s.id} to={`/register/${s.id}`} className="block text-xs truncate" title={`${s.name} · ${s.venues?.name}`}>
                  {s.start_at.slice(11, 16)} {s.name}{s.status !== 'scheduled' ? ` (${s.status})` : ''}
                </Link>
              ))}
              {(days[d]?.events ?? []).map((e: any) => (
                <div key={e.id} className="text-xs truncate" style={{ color: 'var(--warning)' }}>🏆 {e.name}</div>
              ))}
            </>}
          </div>
        ))}
      </div>}
    </div>
  );
}
