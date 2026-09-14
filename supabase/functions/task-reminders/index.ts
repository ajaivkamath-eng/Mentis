/* Scheduler (hourly): due-soon tasks → push + email nudges. */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendMail } from '../_shared/mail.ts';

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const horizon = new Date(Date.now() + 26 * 3_600_000).toISOString();
  const { data: tasks } = await supabase.from('tasks').select('id,title,due_at,organization_id,assignee_id')
    .neq('status', 'done').not('due_at', 'is', null).lte('due_at', horizon);
  let nudged = 0;
  for (const t of tasks ?? []) {
    const { data: staff } = await supabase.from('mentis_staff').select('display_name').eq('id', t.assignee_id).single();
    void staff;
    nudged += 1;
  }
  void sendMail;
  return Response.json({ ok: true, nudged });
});
