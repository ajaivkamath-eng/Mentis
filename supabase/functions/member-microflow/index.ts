/* Member micro-flow: QR/emailed link + member code → event availability + diary.
 * Code = member id prefix check (v1); full member auth arrives in Phase 6. */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const memberId = url.searchParams.get('memberId');
    const code = url.searchParams.get('code');
    if (!memberId || code !== memberId.slice(0, 8)) {
      return Response.json({ error: 'invalid member code' }, { status: 401, headers: cors });
    }
    const { data: member } = await supabase.from('mentis_members').select('id,name,organization_id').eq('id', memberId).single();
    if (!member) return Response.json({ error: 'unknown member' }, { status: 404, headers: cors });
    const { data: events } = await supabase.from('mentis_events').select('id,name,starts_on,ends_on,location,entry_deadline')
      .eq('organization_id', member.organization_id).eq('status', 'published')
      .gte('ends_on', new Date().toISOString().slice(0, 10)).order('starts_on');
    const { data: entries } = await supabase.from('mentis_event_entries').select('event_id,status').eq('member_id', memberId);
    const { data: bookings } = await supabase.from('mentis_bookings').select('id,starts_at,status,slot_id').eq('member_id', memberId).neq('status', 'cancelled').order('starts_at');
    const { data: reports } = await supabase.from('mentis_progress_reports').select('id,period,status,sent_at').eq('member_id', memberId).eq('status', 'sent').order('period', { ascending: false });
    return Response.json({ member, events: events ?? [], entries: entries ?? [], bookings: bookings ?? [], reports: reports ?? [] }, { headers: cors });
  }
  if (req.method === 'POST') {
    const { memberId, code, eventId, status } = await req.json();
    if (!memberId || code !== String(memberId).slice(0, 8)) {
      return Response.json({ error: 'invalid member code' }, { status: 401, headers: cors });
    }
    if (!['available', 'notAvailable', 'interested'].includes(status)) {
      return Response.json({ error: 'invalid status' }, { status: 400, headers: cors });
    }
    const { error } = await supabase.from('mentis_event_entries')
      .upsert({ event_id: eventId, member_id: memberId, status }, { onConflict: 'event_id,member_id,sub_event_id' });
    if (error) return Response.json({ error: error.message }, { status: 500, headers: cors });
    return Response.json({ ok: true }, { headers: cors });
  }
  return new Response('method not allowed', { status: 405 });
});
