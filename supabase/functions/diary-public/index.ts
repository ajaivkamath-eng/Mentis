/* Public read-only competition diary (shareable link, no login). */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*' };

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId');
  if (!organizationId) return Response.json({ error: 'organizationId required' }, { status: 400, headers: cors });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data } = await supabase.from('events')
    .select('id,name,starts_on,ends_on,location,entry_deadline,source')
    .eq('organization_id', organizationId).eq('status', 'published')
    .gte('ends_on', new Date().toISOString().slice(0, 10)).order('starts_on');
  return Response.json({ events: data ?? [] }, { headers: cors });
});
