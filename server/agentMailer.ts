// AgentMail integration — uses @replit/connectors-sdk to send transactional emails
// without requiring external SMTP credentials.
import { ReplitConnectors } from "@replit/connectors-sdk";

import type { EmailMessage } from "./mailer";

let cachedInboxId: string | null = null;

async function getOrCreateInbox(connectors: ReplitConnectors): Promise<string | null> {
  if (cachedInboxId) return cachedInboxId;

  try {
    const listRes = await connectors.proxy("agentmail", "/inboxes", { method: "GET" });
    if (listRes.ok) {
      const data = await listRes.json() as { inboxes?: Array<{ id: string; username: string }> } | Array<{ id: string }>;
      const list: Array<{ id: string }> = Array.isArray(data) ? data : ((data as any).inboxes ?? []);
      const existing = list.find((i: any) => i.username === "accessibooks" || i.id);
      if (existing) {
        cachedInboxId = existing.id;
        console.log(`[AgentMail] Reusing inbox: ${cachedInboxId}`);
        return cachedInboxId;
      }
    }

    const createRes = await connectors.proxy("agentmail", "/inboxes", {
      method: "POST",
      body: { username: "accessibooks" },
    });
    if (createRes.ok) {
      const inbox = await createRes.json() as { id: string; address?: string };
      cachedInboxId = inbox.id;
      console.log(`[AgentMail] Created inbox: ${cachedInboxId} (${inbox.address ?? ""})`);
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
