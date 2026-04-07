// AgentMail integration — uses @replit/connectors-sdk to send transactional emails
// without requiring external SMTP credentials.
import { ReplitConnectors } from "@replit/connectors-sdk";

import type { EmailMessage } from "./mailer";

interface AgentMailInbox {
  id: string;
  username?: string;
  address?: string;
}

interface AgentMailListResponse {
  inboxes?: AgentMailInbox[];
}

// Derive a stable, URL-safe inbox username from repl/env metadata with fallback
const rawSlug = (process.env.REPL_SLUG ?? process.env.REPL_ID ?? "accessibooks")
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, "-")
  .slice(0, 30);
const INBOX_USERNAME = rawSlug || "accessibooks";
let cachedInboxId: string | null = null;

async function getOrCreateInbox(connectors: ReplitConnectors): Promise<string | null> {
  if (cachedInboxId) return cachedInboxId;

  try {
    // Try to find an existing inbox with our username
    const listRes = await connectors.proxy("agentmail", "/inboxes", { method: "GET" });
    if (listRes.ok) {
      const data: AgentMailInbox[] | AgentMailListResponse = await listRes.json();
      const list: AgentMailInbox[] = Array.isArray(data)
        ? data
        : (data.inboxes ?? []);
      const match = list.find((i) => i.username === INBOX_USERNAME);
      if (match) {
        cachedInboxId = match.id;
        console.log(`[AgentMail] Reusing inbox ${INBOX_USERNAME}: ${cachedInboxId}`);
        return cachedInboxId;
      }
    }

    // Create a new inbox for this app
    const createRes = await connectors.proxy("agentmail", "/inboxes", {
      method: "POST",
      body: { username: INBOX_USERNAME },
    });
    if (createRes.ok) {
      const inbox: AgentMailInbox = await createRes.json();
      cachedInboxId = inbox.id;
      console.log(`[AgentMail] Created inbox ${INBOX_USERNAME}: ${cachedInboxId} (${inbox.address ?? ""})`);
      return cachedInboxId;
    }
    const errText = await createRes.text();
    console.error(`[AgentMail] Failed to create inbox: ${createRes.status} ${errText}`);
    return null;
  } catch (err) {
    console.error("[AgentMail] Error getting/creating inbox:", err);
    return null;
  }
}

export async function sendViaAgentMail(msg: EmailMessage): Promise<boolean> {
  try {
    const connectors = new ReplitConnectors();
    const inboxId = await getOrCreateInbox(connectors);
    if (!inboxId) return false;

    const res = await connectors.proxy("agentmail", `/inboxes/${inboxId}/messages`, {
      method: "POST",
      body: {
        to: [{ email: msg.to }],
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
      },
    });

    if (res.ok) {
      console.log(`[AgentMail] Sent email to ${msg.to} — ${msg.subject}`);
      return true;
    }
    const errText = await res.text();
    console.error(`[AgentMail] Send failed (${res.status}): ${errText}`);
    return false;
  } catch (err) {
    console.error("[AgentMail] Unexpected error sending email:", err);
    return false;
  }
}
