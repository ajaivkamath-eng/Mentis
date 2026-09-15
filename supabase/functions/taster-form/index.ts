/* Public taster registration (no login) — the one intentionally-public path.
 * Service role insert + admin notification. Rate-limit via gateway in prod. */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendMail, render } from '../_shared/mail.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { organizationId, name, age, contact, preferredSessionId } = await req.json();
  if (!organizationId || !name?.trim()) {
    return Response.json({ error: 'organizationId and name are required' }, { status: 400, headers: cors });
  }
  const { data, error } = await supabase.from('mentis_prospects').insert({
    organization_id: organizationId, name: name.trim(), age: age ?? null,
    contact: contact ?? null, preferred_session_id: preferredSessionId ?? null, status: 'requested',
  }).select('id').single();
  if (error) return Response.json({ error: error.message }, { status: 500, headers: cors });
  const adminEmail = Deno.env.get('ADMIN_NOTIFY_EMAIL');
  if (adminEmail) {
    await sendMail(adminEmail, 'New taster request',
      render('{{name}} ({{contact}}) requested a taster.', { name, contact: contact ?? 'no contact' }));
  }
  return Response.json({ ok: true, id: data.id }, { headers: cors });
});
