import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || "noreply@adbid.example.com";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    console.warn(`[Mailer] SMTP not configured — email not sent to ${msg.to}. Subject: ${msg.subject}`);
    return false;
  }
  try {
    await t.sendMail({ from: SMTP_FROM, ...msg });
    console.log(`[Mailer] Sent email to ${msg.to} — ${msg.subject}`);
    return true;
  } catch (err) {
    console.error(`[Mailer] Failed to send email to ${msg.to}:`, err);
    return false;
  }
}

export function isEmailConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}
