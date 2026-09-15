/* Authenticated transactional email + CommunicationLog write. */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendMail } from '../_shared/mail.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { organizationId, to, subject, body, template, kind, groupId, scheduledFor } = await req.json();
  if (!to || !subject || !body) return new Response('to/subject/body required', { status: 400 });
  if (!scheduledFor) await sendMail(to, subject, body);
  await supabase.from('mentis_communication_log').insert({
    organization_id: organizationId, kind: kind ?? 'alert', template: template ?? 'custom',
    recipient: to, group_id: groupId ?? null, scheduled_for: scheduledFor ?? null,
  });
  return Response.json({ ok: true, queued: !!scheduledFor });
});
