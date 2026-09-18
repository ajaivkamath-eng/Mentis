/* Scheduler (every 15 min): staffing-breach → PendingAction + breach email.
 * Timelines come from the ActionType row (all configurable in Mentis). */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendMail } from '../_shared/mail.ts';

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const nowIso = new Date().toISOString();

  // 1) Detect staffing warning states and create staffing action records if missing.
  const { data: rows } = await supabase
    .from('session_staffing_status')
    .select('session_id, colour')
    .neq('colour', 'GREEN');

  let created = 0;
  for (const row of rows ?? []) {
    const { data: session } = await supabase
      .from('mentis_sessions')
      .select('id, organization_id, name, start_at')
      .eq('id', row.session_id)
      .single();

    if (!session) continue;

    const { data: types } = await supabase
      .from('mentis_action_types')
      .select('id, due_offset, breach_offset')
      .eq('organization_id', session.organization_id)
      .eq('name', 'confirm staffing')
      .limit(1);

    const type = types?.[0];
    if (!type) continue;

    const { data: existing } = await supabase
      .from('mentis_pending_actions')
      .select('id')
      .eq('linked_entity_type', 'session')
      .eq('linked_entity_id', session.id)
      .neq('status', 'closed')
      .limit(1);

    if (existing?.length) continue;

    const start = Date.parse(session.start_at ?? nowIso);
    const dueOffsetMs = type.due_offset ? (Number(type.due_offset.days ?? 0) * 86_400_000) + ((type.due_offset.hours ?? 0) * 3_600_000) : 30 * 86_400_000;
    const breachOffsetMs = type.breach_offset ? (Number(type.breach_offset.days ?? 0) * 86_400_000) + ((type.breach_offset.hours ?? 0) * 3_600_000) : 7 * 86_400_000;

    const { data: action, error } = await supabase
      .from('mentis_pending_actions')
      .insert({
        organization_id: session.organization_id,
        action_type_id: type.id,
        title: `Staffing confirmation required — ${session.name} (${row.colour})`,
        linked_entity_type: 'session',
        linked_entity_id: session.id,
        due_at: new Date(start - dueOffsetMs).toISOString(),
        breach_at: new Date(start - breachOffsetMs).toISOString(),
        status: 'open',
      })
      .select('id')
      .single();

    if (error || !action) continue;
    created += 1;
  }

  // 2) Mark overdue open actions as breached and send direct emails.
  const { data: breached } = await supabase
    .from('mentis_pending_actions')
    .select('id, title, organization_id, linked_entity_id, assignee_id, breach_at')
    .eq('status', 'open')
    .lt('breach_at', nowIso);

  let alerted = 0;
  for (const a of breached ?? []) {
    await supabase.from('mentis_pending_actions').update({ status: 'breached' }).eq('id', a.id);

    let recipient = Deno.env.get('ADMIN_NOTIFY_EMAIL');
    let recipientName = 'Mentis admin';

    if (a.assignee_id) {
      const { data: staff } = await supabase.from('mentis_staff').select('user_id, display_name').eq('id', a.assignee_id).single();
      if (staff?.user_id) {
        const { data: user } = await supabase.auth.admin.getUserById(staff.user_id);
        if (user?.user?.email) {
          recipient = user.user.email;
          recipientName = staff.display_name ?? 'staff member';
        }
      }
    }

    if (recipient) {
      await sendMail(
        recipient,
        `Action breached: ${a.title}`,
        `Hi ${recipientName}, the action "${a.title}" has breached its timeline and requires attention.`
      );
      await supabase.from('mentis_communication_log').insert({
        organization_id: a.organization_id,
        kind: 'alert',
        template: 'actionAlert',
        recipient,
        scheduled_for: null,
      });
    }

    alerted += 1;
  }

  return Response.json({ ok: true, created, alerted });
});
