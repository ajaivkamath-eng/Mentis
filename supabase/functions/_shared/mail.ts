/* Shared mailer: Nodemailer via SMTP, from the Mentis address. */
import nodemailer from 'npm:nodemailer@6.9.14';

export const FROM = 'noreply@mentis.kingfishertabletennisclub.com';

export function mailer() {
  const host = Deno.env.get('SMTP_HOST') ?? 'localhost';
  const port = Number(Deno.env.get('SMTP_PORT') ?? '1025');
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });
}

export async function sendMail(to: string, subject: string, body: string, html?: string) {
  const transport = mailer();
  await transport.sendMail({ from: FROM, to, subject, text: body, html: html ?? `<p>${body}</p>` });
}

export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
}
