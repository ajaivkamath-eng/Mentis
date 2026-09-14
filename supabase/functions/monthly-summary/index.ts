/* Scheduler (1st of month): per-member attendance summary → customer email.
 * Paused members skipped; outstanding debit included; templates editable. */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendMail, render } from '../_shared/mail.ts';

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59));
  const { data: members } = await supabase.from('members').select('id,name,organization_id,customer_id');
  let sent = 0;
  for (const m of members ?? []) {
    const { data: paused } = await supabase.from('enrollments').select('id')
      .eq('member_id', m.id).eq('status', 'paused').limit(1);
    if (paused?.length) continue;
    const { data: records } = await supabase.from('attendance_records').select('status,session_id')
      .eq('member_id', m.id).gte('recorded_at', first.toISOString()).lte('recorded_at', last.toISOString());
    const total = records?.length ?? 0;
    if (!total) continue;
    const attended = (records ?? []).filter((r) => r.status === 'present' || r.status === 'late').length;
    const pct = Math.round((attended / total) * 100);
    const { data: customer } = await supabase.from('customers').select('email,name').eq('id', m.customer_id).single();
    if (!customer?.email) continue;
    const { data: debits } = await supabase.from('customer_charges').select('amount_cents')
      .eq('customer_id', m.customer_id).eq('status', 'outstandingDebit');
    const due = (debits ?? []).reduce((s, d) => s + d.amount_cents, 0);
    await sendMail(customer.email, `Monthly attendance summary for ${m.name}`,
      render('{{member}}: {{attended}}/{{total}} ({{pct}}%). {{debit}}', {
        member: m.name, attended: String(attended), total: String(total), pct: String(pct),
        debit: due ? `Outstanding balance: £${(due / 100).toFixed(2)}.` : 'No outstanding balance.',
      }));
    await supabase.from('communication_log').insert({
      organization_id: m.organization_id, kind: 'summary', template: 'attendanceSummary', recipient: customer.email,
    });
    sent += 1;
  }
  return Response.json({ ok: true, sent });
});
