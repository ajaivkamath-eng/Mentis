/* Authenticated push via OneSignal (external_id = auth user id).
 * Mobile sets the external id at login. Skips cleanly when keys are absent. */
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { organizationId, userId, title, body } = await req.json();
  if (!userId || !title) return new Response('userId/title required', { status: 400 });
  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_API_KEY');
  if (!appId || !apiKey) return Response.json({ ok: false, skipped: 'OneSignal keys not configured' });
  const r = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${apiKey}` },
    body: JSON.stringify({
      app_id: appId,
      include_aliases: { external_id: [userId] },
      target_channel: 'push',
      headings: { en: title },
      contents: { en: body ?? '' },
    }),
  });
  if (organizationId) {
    await supabase.from('mentis_communication_log').insert({
      organization_id: organizationId, kind: 'alert', template: 'push', recipient: userId,
    });
  }
  return Response.json({ ok: r.ok, status: r.status });
});
