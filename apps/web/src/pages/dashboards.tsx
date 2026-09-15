import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageTitle } from '../lib/ui';

/* ---------- Venue dashboard: utilization + staffing cost ---------- */
export function VenueDashboard() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data: venues } = await supabase.from('mentis_venues').select('id,name');
      const out = [];
      for (const v of venues ?? []) {
        const [{ data: sessions }, { data: staffing }] = await Promise.all([
          supabase.from('mentis_sessions').select('id').eq('venue_id', v.id),
          supabase.from('mentis_session_staffing').select('planned_start,planned_end,mentis_rate_cards(rate_cents),session_id,mentis_sessions!inner(venue_id)').eq('sessions.venue_id', v.id),
        ]);
        const ids = new Set((sessions ?? []).map((s: any) => s.id));
        let cost = 0;
        for (const st of staffing ?? []) {
          const h = (Date.parse(st.planned_end) - Date.parse(st.planned_start)) / 3600000;
          cost += h * ((st as any).rate_cards?.rate_cents ?? 0);
        }
        const { count: present } = await supabase.from('mentis_attendance_records').select('id', { count: 'exact', head: true }).eq('status', 'present');
        out.push({ name: v.name, sessions: ids.size, staffingCost: (cost / 100).toFixed(2), present: present ?? 0 });
      }
      setRows(out);
    })();
  }, []);
  return (
    <div>
      <PageTitle title="Venue dashboard" sub="Sessions · staffing cost · attendance" />
      <div className="grid md:grid-cols-3 gap-3" style={{ maxWidth: 900 }}>
        {rows.map((r: any) => (
          <div key={r.name} className="card p-4">
            <div className="font-bold">{r.name}</div>
            <div className="text-sm">Sessions: <strong>{r.sessions}</strong></div>
            <div className="text-sm">Staffing cost: <strong>£{r.staffingCost}</strong></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Member → sessions cross-view ---------- */
export function MemberSessions() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    supabase.from('mentis_members').select('id,name,mentis_enrollments(status,mentis_sessions(name,start_at))').order('name').then(({ data }) => setRows(data ?? []));
  }, []);
  const visible = rows.filter((r: any) => r.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageTitle title="Member sessions" sub="Who is enrolled where" right={
        <input className="input" style={{ width: 200 }} placeholder="Search member…" value={q} onChange={(e) => setQ(e.target.value)} />
      } />
      <div className="card p-2"><table className="grid">
        <thead><tr><th>Member</th><th>Enrolments</th></tr></thead>
        <tbody>{visible.slice(0, 100).map((m: any) => (
          <tr key={m.id}><td className="font-semibold">{m.name}</td>
            <td className="text-sm">{(m.enrollments ?? []).map((e: any) => `${e.sessions?.name} (${e.status})`).join(' · ') || '—'}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ---------- ICS export: my sessions + tasks ---------- */
export function IcsExport() {
  const { staff } = useAuth();
  const download = async () => {
    if (!staff) return;
    const [{ data: staffing }, { data: tasks }] = await Promise.all([
      supabase.from('mentis_session_staffing').select('planned_start,planned_end,mentis_sessions(name)').eq('staff_id', staff.id),
      supabase.from('mentis_tasks').select('title,due_at').eq('assignee_id', staff.id).neq('status', 'done'),
    ]);
    const esc = (s: string) => s.replace(/[,;\\]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
    const fmt = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Mentis//Diary//EN\r\n';
    for (const s of staffing ?? []) {
      ics += `BEGIN:VEVENT\r\nUID:${Math.random().toString(36).slice(2)}@mentis\r\nDTSTART:${fmt(s.planned_start)}\r\nDTEND:${fmt(s.planned_end)}\r\nSUMMARY:${esc((s.sessions as any)?.name ?? 'Session')}\r\nEND:VEVENT\r\n`;
    }
    for (const t of tasks ?? []) {
      if (!t.due_at) continue;
      ics += `BEGIN:VEVENT\r\nUID:${Math.random().toString(36).slice(2)}@mentis\r\nDTSTART:${fmt(t.due_at)}\r\nDTEND:${fmt(t.due_at)}\r\nSUMMARY:${esc('Task: ' + t.title)}\r\nEND:VEVENT\r\n`;
    }
    ics += 'END:VCALENDAR\r\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'mentis-diary.ics';
    a.click();
  };
  return (
    <div>
      <PageTitle title="Calendar export" sub="My staffed sessions + open tasks as ICS" />
      <button className="btn btn-primary" onClick={download}>Download ICS</button>
    </div>
  );
}
