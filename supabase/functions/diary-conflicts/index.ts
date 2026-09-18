/* Scheduler (daily, via the mentis-diary-conflict-escalation cron hook):
 * unresolved diary conflicts escalate as the session approaches.
 *   > 30 days out   — silent (reminder window not open yet)
 *   ≤ 30 days out   — email the assigned coach + responsible admin
 *   ≤ 7 days out    — email again daily, marked urgent
 * Sessions that stay conflicted are what the session diary renders red.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendMail } from '../_shared/mail.ts';

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, key);

  const { data: conflicts } = await supabase
    .from('mentis_diary_conflicts')
    .select('id, organization_id, staff_id, session_id, message, status, overlap_minutes')
    .neq('status', 'resolved')
    .limit(200);

  let emailed = 0;
  for (const c of conflicts ?? []) {
    if (!c.session_id) continue;
    const { data: session } = await supabase
      .from('mentis_sessions')
      .select('id, name, start_at, responsible_coach_id')
      .eq('id', c.session_id)
      .single();
    if (!session) continue;

    const daysOut = (Date.parse(session.start_at) - Date.now()) / 86_400_000;
    if (daysOut > 30 || daysOut < 0) continue; // escalation window: T-30d → T-0
    const urgent = daysOut <= 7;

    // Recipients: the conflicted coach + the responsible coach (session owner).
    const recipients = new Map<string, string>();
    for (const staffId of [c.staff_id, session.responsible_coach_id].filter(Boolean) as string[]) {
      const { data: staff } = await supabase.from('mentis_staff').select('user_id,display_name').eq('id', staffId).single();
      if (!staff) continue;
      const { data: user } = await supabase.auth.admin.getUserById(staff.user_id);
      if (user?.user?.email) recipients.set(user.user.email, staff.display_name);
    }

    for (const [email, name] of recipients) {
      await sendMail(
        email,
        `${urgent ? 'URGENT: ' : ''}Diary conflict — ${session.name}`,
        `Hi ${name},\n\n${c.message}\n\nSession: ${session.name} at ${session.start_at}` +
          `\nStatus: ${c.status} · ${daysOut.toFixed(1)} days to go.\n\n` +
          `Open the coach diary to resolve or reassign this conflict.`,
      );
      await supabase.from('communication_log').insert({
        organization_id: c.organization_id, kind: 'reminder', template: 'diaryConflict', recipient: email,
      });
      emailed += 1;
    }
  }
  return Response.json({ ok: true, emailed });
});
