/* Scheduler (every 15 min): staffing-breach → PendingAction + breach email.
 * Timelines come from the ActionType row (all configurable in Mentis). */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendMail } from '../_shared/mail.ts';

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: rows } = await supabase.from('session_staffing_status').select('session_id,colour').neq('colour', 'GREEN');
  let created = 0;
  for (const row of rows ?? []) {
    const { data: session } = await supabase.from('mentis_sessions')
      .select('id,organization_id,name,start_at').eq('id', row.session_id).single();
    if (!session) continue;
    const { data: types } = await supabase.from('mentis_action_types').select('id,due_offset,breach_offset')
      .eq('organization_id', session.organization_id).eq('name', 'name replacement staff').limit(1);
    const type = types?.[0];
    if (!type) continue;
    const { data: existing } = await supabase.from('mentis_pending_actions').select('id')
      .eq('linked_entity_id', session.id).neq('status', 'closed').limit(1);
    if (existing?.length) continue;
    const start = Date.parse(session.start_at);
    const dueMs = 30 * 86_400_000;
    const breachMs = 7 * 86_400_000;
    const { data: action, error } = await supabase.from('mentis_pending_actions').insert({
      organization_id: session.organization_id, action_type_id: type.id,
      title: `Name replacement staff — ${session.name} (${row.colour})`,
      linked_entity_type: 'session', linked_entity_id: session.id,
      due_at: new Date(start - dueMs).toISOString(),
      breach_at: new Date(start - breachMs).toISOString(), status: 'open',
    }).select('id').single();
    if (error || !action) continue;
    created += 1;
    void sendMail;
  }
  // Breach alerts: open actions past breach_at → email manager + lead coach.
  const { data: breached } = await supabase.from('mentis_pending_actions').select('id,title,organization_id,linked_entity_id')
    .eq('status', 'open').lt('breach_at', new Date().toISOString());
  let alerted = 0;
  for (const a of breached ?? []) {
    await supabase.from('mentis_pending_actions').update({ status: 'breached' }).eq('id', a.id);
    const adminEmail = Deno.env.get('ADMIN_NOTIFY_EMAIL');
    if (adminEmail) {
      await sendMail(adminEmail, `Action breached: ${a.title}`, `"${a.title}" breached its timeline.`);
      await supabase.from('mentis_communication_log').insert({
        organization_id: a.organization_id, kind: 'alert', template: 'actionAlert', recipient: adminEmail,
      });
    }
    alerted += 1;
  }
  return Response.json({ ok: true, created, alerted });
});
