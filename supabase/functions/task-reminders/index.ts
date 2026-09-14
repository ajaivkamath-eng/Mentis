/* Scheduler (hourly): due-soon + overdue tasks → email + push nudges.
 * Assignee email resolved via the service-role auth admin API. */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendMail } from '../_shared/mail.ts';

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, key);
  const horizon = new Date(Date.now() + 26 * 3_600_000).toISOString();
  const { data: tasks } = await supabase.from('tasks').select('id,title,due_at,organization_id,assignee_id')
    .neq('status', 'done').not('due_at', 'is', null).lte('due_at', horizon).limit(200);
  let nudged = 0;
  for (const t of tasks ?? []) {
    if (!t.assignee_id) continue;
    const { data: staff } = await supabase.from('mentis_staff').select('user_id,display_name').eq('id', t.assignee_id).single();
    if (!staff) continue;
    const { data: user } = await supabase.auth.admin.getUserById(staff.user_id);
    const email = user?.user?.email;
    if (email) {
      await sendMail(email, `Reminder: ${t.title}`,
        `Hi ${staff.display_name}, a reminder that "${t.title}" is due ${t.due_at}.`);
      await supabase.from('communication_log').insert({
        organization_id: t.organization_id, kind: 'reminder', template: 'taskReminder', recipient: email,
      });
    }
    try {
      await fetch(`${url}/functions/v1/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ userId: staff.user_id, title: `Reminder: ${t.title}`, body: `Due ${t.due_at}` }),
      });
    } catch { /* push is best-effort */ }
    nudged += 1;
  }
  return Response.json({ ok: true, nudged });
});
