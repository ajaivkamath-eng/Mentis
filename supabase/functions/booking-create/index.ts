/* Phase 6 — public 1-2-1 booking (member-code auth, same as micro-flow).
 * POST: conflict-checked booking + approval-gated chargeable task (rule 30).
 * DELETE: cancellation inside the window only. */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };
const overlap = (aS: string, aE: string, bS: string, bE: string) =>
  Date.parse(aS) < Date.parse(bE) && Date.parse(bS) < Date.parse(aE);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  if (req.method === 'POST') {
    const { memberId, code, slotId, startsAt } = await req.json();
    if (!memberId || code !== String(memberId).slice(0, 8)) {
      return Response.json({ error: 'invalid member code' }, { status: 401, headers: cors });
    }
    const { data: slot } = await supabase.from('mentis_booking_slots').select('*').eq('id', slotId).single();
    if (!slot || slot.status !== 'open') return Response.json({ error: 'slot is not open' }, { status: 400, headers: cors });
    const { data: member } = await supabase.from('mentis_members').select('id,customer_id,organization_id').eq('id', memberId).single();
    if (!member) return Response.json({ error: 'unknown member' }, { status: 404, headers: cors });
    const end = new Date(Date.parse(startsAt) + slot.duration_minutes * 60_000).toISOString();
    const { data: staffing } = await supabase.from('mentis_session_staffing').select('session_id,mentis_sessions(start_at,end_at)').eq('staff_id', slot.coach_id);
    const clash = (staffing ?? []).some((s: { sessions: { start_at: string; end_at: string } }) =>
      overlap(s.sessions.start_at, s.sessions.end_at, startsAt, end));
    if (clash) return Response.json({ error: 'coach has a conflicting session' }, { status: 409, headers: cors });
    const { data: task, error: taskErr } = await supabase.from('mentis_tasks').insert({
      organization_id: member.organization_id, title: `1-2-1 with member ${memberId}`,
      task_type: 'oneOnOne', assignee_id: slot.coach_id, due_at: startsAt, status: 'todo',
      amount_cents: slot.fixed_price_cents, customer_id: member.customer_id, chargeable_to_customer: true,
    }).select('id').single();
    if (taskErr) return Response.json({ error: taskErr.message }, { status: 500, headers: cors });
    const { data: booking, error } = await supabase.from('mentis_bookings').insert({
      organization_id: member.organization_id, slot_id: slotId, member_id: memberId,
      starts_at: startsAt, status: 'booked', task_id: task.id, cancellation_window_hours: 24,
    }).select('id').single();
    if (error) return Response.json({ error: error.message }, { status: 500, headers: cors });
    return Response.json({ ok: true, id: booking.id, taskId: task.id }, { headers: cors });
  }

  if (req.method === 'DELETE') {
    const { bookingId, memberId, code } = await req.json();
    if (!memberId || code !== String(memberId).slice(0, 8)) {
      return Response.json({ error: 'invalid member code' }, { status: 401, headers: cors });
    }
    const { data: booking } = await supabase.from('mentis_bookings').select('*').eq('id', bookingId).single();
    if (!booking || booking.member_id !== memberId) return Response.json({ error: 'unknown booking' }, { status: 404, headers: cors });
    const ms = Date.parse(booking.starts_at) - Date.now();
    if (ms < booking.cancellation_window_hours * 3_600_000) {
      return Response.json({ error: 'inside the cancellation window' }, { status: 400, headers: cors });
    }
    await supabase.from('mentis_bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    return Response.json({ ok: true }, { headers: cors });
  }
  return new Response('method not allowed', { status: 405 });
});
