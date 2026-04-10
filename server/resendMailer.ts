import { Resend } from "resend";
import type { EmailMessage } from "./mailer";

let client: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendViaResend(msg: EmailMessage): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    console.warn(`[Resend] RESEND_API_KEY not set — skipping email to ${msg.to}`);
    return false;
  }
  try {
    const from = process.env.RESEND_FROM_EMAIL || "AccessiBooks <noreply@accessibooks.app>";
    const { error } = await resend.emails.send({
      from,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    });
    if (error) {
      console.error(`[Resend] Send failed:`, error);
      return false;
    }
    console.log(`[Resend] Sent email to ${msg.to} — ${msg.subject}`);
    return true;
  } catch (err) {
    console.error(`[Resend] Unexpected error:`, err);
    return false;
  }
}
