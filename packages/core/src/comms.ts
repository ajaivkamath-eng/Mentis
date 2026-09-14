/* Communication templates — from noreply@mentis.kingfishertabletennisclub.com */
export const MENTIS_FROM_EMAIL = 'noreply@mentis.kingfishertabletennisclub.com';
export type EmailTemplateId =
  | 'sessionInvite' | 'tasterApproval' | 'taskReminder' | 'breachAlert'
  | 'debitNotice' | 'actionAlert' | 'welcomePack' | 'cancellation'
  | 'halfTerm' | 'eventReminder' | 'attendanceSummary' | 'progressReport';
export interface EmailTemplate { id: EmailTemplateId; subject: string; body: string }
const T = (id: EmailTemplateId, subject: string, body: string): EmailTemplate => ({ id, subject, body });
export const EMAIL_TEMPLATES: Record<EmailTemplateId, EmailTemplate> = {
  sessionInvite: T('sessionInvite', 'Session invitation: {{session}}', 'Hi {{name}}, you are invited to {{session}} at {{venue}} on {{when}}.'),
  tasterApproval: T('tasterApproval', 'Your taster session is approved', 'Hi {{name}}, your taster at {{venue}} on {{when}} is approved. Your coach is {{coach}}.'),
  taskReminder: T('taskReminder', 'Reminder: {{task}} due {{due}}', 'Hi {{name}}, a reminder that "{{task}}" is due {{due}}.'),
  breachAlert: T('breachAlert', 'Staffing breach: {{session}}', '{{session}} on {{when}} is {{colour}}. Action required: {{action}}.'),
  debitNotice: T('debitNotice', 'Outstanding balance: {{amount}}', 'Hi {{name}}, your Kingfisher account has an outstanding balance of {{amount}} due {{due}}.'),
  actionAlert: T('actionAlert', 'Action breached: {{action}}', '"{{action}}" breached its timeline. Linked: {{entity}}.'),
  welcomePack: T('welcomePack', 'Welcome to Kingfisher TTC', 'Hi {{name}}! {{welcome}} Equipment: {{guide}} {{note}}'),
  cancellation: T('cancellation', 'Session cancelled: {{session}}', '{{session}} on {{when}} is cancelled ({{reason}}). {{rescheduled}}'),
  halfTerm: T('halfTerm', 'Half-term arrangements', 'Hi {{name}}, {{body}}'),
  eventReminder: T('eventReminder', 'Upcoming event: {{event}}', '{{event}} runs {{when}} at {{location}}. Entry deadline: {{deadline}}.'),
  attendanceSummary: T('attendanceSummary', 'Monthly attendance summary for {{member}}', '{{member}}: {{attended}}/{{total}} ({{pct}}%). {{absences}} {{debit}}'),
  progressReport: T('progressReport', 'Progress report: {{member}} ({{period}})', 'Dear {{guardian}}, please find {{member}}\u2019s progress report attached.'),
};
export function renderTemplate(t: EmailTemplate, vars: Record<string, string>): { subject: string; body: string } {
  const render = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
  return { subject: render(t.subject), body: render(t.body) };
}
