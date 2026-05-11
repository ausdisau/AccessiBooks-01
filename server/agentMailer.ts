// AgentMail integration — uses @replit/connectors-sdk to send transactional emails
// without requiring external SMTP credentials. Includes RFC 3834 compliant
// auto-response helpers for safe automated replies.
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

// ---------------------------------------------------------------------------
// RFC 3834 — auto-response support
// ---------------------------------------------------------------------------

/**
 * RFC 3834 §2 responder classes. Determines the value of `Auto-Submitted`
 * and which "when not to send" rules apply.
 *  - personal: a human's auto-reply (vacation responder); requires the
 *    recipient to appear explicitly in To/Cc/Bcc/Resent-* before replying.
 *  - group:    a list/group auto-reply; same recipient check applies.
 *  - service:  an automated service responder (confirmation, receipt,
 *    "we got your support ticket"); no recipient-in-To check; uses
 *    `Auto-Submitted: auto-generated`.
 */
export type AutoResponderClass = "personal" | "group" | "service";

/** Headers parsed from an inbound ("subject") message that we may reply to. */
export interface SubjectMessageHeaders {
  /** RFC 5322 Message-ID of the inbound message (with or without angle brackets). */
  messageId?: string;
  /** Existing References chain on the inbound message, if any. */
  references?: string;
  /** Inbound Subject — used to derive the reply Subject (`Auto:` prefix). */
  subject?: string;
  /** Envelope sender (MAIL FROM / Return-Path). May be `<>` for null path. */
  returnPath?: string;
  /** Header `From:` address. */
  from?: string;
  /** Value of inbound `Auto-Submitted:` header (RFC 3834). Default: `no`. */
  autoSubmitted?: string;
  /** Inbound `To:` recipient list (raw string or array of addresses). */
  to?: string | string[];
  /** Inbound `Cc:` list. */
  cc?: string | string[];
  /** Inbound `Bcc:` list. */
  bcc?: string | string[];
  /** Inbound `Resent-To:` list (RFC 3834 §4 considers Resent-* too). */
  resentTo?: string | string[];
  /** Inbound `Resent-Cc:` list. */
  resentCc?: string | string[];
  /** Inbound `List-Id:` (presence indicates a mailing list). */
  listId?: string;
  /** Presence of any `List-*` header indicates a mailing list. */
  hasListHeaders?: boolean;
  /** Presence of `Precedence: bulk|list|junk`. */
  precedence?: string;
}

export interface ShouldAutoRespondInput {
  /** The inbound message we're considering replying to. */
  subject: SubjectMessageHeaders;
  /** Address that would send the reply (must appear in subject.to/cc/bcc for personal/group). */
  recipient: string;
  /** Logical key for de-dup: e.g. "vacation-responder", "limit-warning-90". */
  dedupeKey: string;
  /** Responder class, defaults to "service". */
  responderClass?: AutoResponderClass;
  /** Override clock for testing. */
  now?: number;
}

export interface ShouldAutoRespondResult {
  ok: boolean;
  reason?:
    | "auto-submitted"
    | "null-return-path"
    | "responder-pattern"
    | "list-mail"
    | "recipient-not-addressed"
    | "deduped"
    | "no-sender";
}

const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// In-process dedupe store — sufficient for single-instance deployment.
// Key: `${recipient}|${sender}|${dedupeKey}` (lowercased). Value: expiresAt epoch ms.
const dedupeStore = new Map<string, number>();

function dedupeStoreKey(recipient: string, sender: string, dedupeKey: string): string {
  return `${recipient.trim().toLowerCase()}|${sender.trim().toLowerCase()}|${dedupeKey.trim().toLowerCase()}`;
}

function pruneExpired(now: number): void {
  for (const [k, exp] of Array.from(dedupeStore.entries())) {
    if (exp <= now) dedupeStore.delete(k);
  }
}

/** Extract a bare email address from a header value like `"Foo" <foo@bar>`. */
export function extractEmail(value: string | undefined | null): string {
  if (!value) return "";
  const m = value.match(/<([^>]+)>/);
  const raw = (m ? m[1] : value).trim();
  return raw.replace(/^["']|["']$/g, "").toLowerCase();
}

function listAddresses(v: string | string[] | undefined): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : v.split(",");
  return arr.map(extractEmail).filter(Boolean);
}

const RESPONDER_LOCALPARTS = [
  "mailer-daemon",
  "postmaster",
  "no-reply",
  "noreply",
  "do-not-reply",
  "donotreply",
  "bounce",
  "bounces",
  "abuse",
];

function looksLikeResponder(addr: string): boolean {
  if (!addr) return true;
  const local = addr.split("@")[0]?.toLowerCase() ?? "";
  if (!local) return true;
  if (RESPONDER_LOCALPARTS.includes(local)) return true;
  // RFC 2369 / mailing list bot conventions: owner-foo, foo-request, foo-bounces
  if (/^owner-/.test(local)) return true;
  if (/-(request|bounces?|owner|admin|errors?)$/.test(local)) return true;
  return false;
}

/**
 * RFC 3834 §2 "When not to send" decision. Pure function — no side effects.
 */
export function shouldAutoRespond(input: ShouldAutoRespondInput): ShouldAutoRespondResult {
  const responderClass = input.responderClass ?? "service";
  const now = input.now ?? Date.now();
  const subj = input.subject;

  // (1) Honor existing Auto-Submitted: anything other than `no` (or absent)
  // means the message is itself automated. RFC 3834 §5 — never reply.
  const auto = (subj.autoSubmitted ?? "no").trim().toLowerCase();
  if (auto && auto !== "no") {
    return { ok: false, reason: "auto-submitted" };
  }

  // (2) Null return path (`<>`) is a bounce / non-delivery — never reply.
  const returnPath = subj.returnPath?.trim() ?? "";
  if (returnPath === "<>" || returnPath === "" && !subj.from) {
    return { ok: false, reason: "null-return-path" };
  }
  const envelopeFrom = extractEmail(returnPath || subj.from || "");
  if (!envelopeFrom) return { ok: false, reason: "no-sender" };

  // (3) Common responder / list-bot localparts — never reply.
  if (looksLikeResponder(envelopeFrom)) {
    return { ok: false, reason: "responder-pattern" };
  }

  // (4) Mailing-list indicators (List-Id, List-*, Precedence: bulk/list/junk).
  const precedence = (subj.precedence ?? "").trim().toLowerCase();
  if (subj.listId || subj.hasListHeaders || ["bulk", "list", "junk"].includes(precedence)) {
    return { ok: false, reason: "list-mail" };
  }

  // (5) Personal / group responders only reply when the recipient address
  // explicitly appears in To/Cc/Bcc/Resent-* (RFC 3834 §3 personal absence rule).
  if (responderClass !== "service") {
    const me = input.recipient.trim().toLowerCase();
    const addressed = new Set([
      ...listAddresses(subj.to),
      ...listAddresses(subj.cc),
      ...listAddresses(subj.bcc),
      ...listAddresses(subj.resentTo),
      ...listAddresses(subj.resentCc),
    ]);
    if (!addressed.has(me)) {
      return { ok: false, reason: "recipient-not-addressed" };
    }
  }

  // (6) Per-sender rate limit / loop prevention.
  pruneExpired(now);
  const key = dedupeStoreKey(input.recipient, envelopeFrom, input.dedupeKey);
  const exp = dedupeStore.get(key);
  if (exp && exp > now) {
    return { ok: false, reason: "deduped" };
  }

  return { ok: true };
}

/** Mark that an auto-response was sent so we don't repeat within the window. */
export function recordAutoResponse(
  recipient: string,
  sender: string,
  dedupeKey: string,
  windowMs: number = DEFAULT_WINDOW_MS,
  now: number = Date.now(),
): void {
  dedupeStore.set(dedupeStoreKey(recipient, sender, dedupeKey), now + windowMs);
}

/** Test/admin helpers for the in-memory dedupe store. */
export const autoResponseDedupe = {
  clear(): void {
    dedupeStore.clear();
  },
  size(): number {
    return dedupeStore.size;
  },
  has(recipient: string, sender: string, dedupeKey: string, now: number = Date.now()): boolean {
    const exp = dedupeStore.get(dedupeStoreKey(recipient, sender, dedupeKey));
    return Boolean(exp && exp > now);
  },
};

function ensureAngleBrackets(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("<") ? trimmed : `<${trimmed}>`;
}

function deriveAutoSubject(original: string | undefined): string {
  const base = (original ?? "").trim();
  if (!base) return "Auto: (no subject)";
  // Strip any existing Re:/Fwd:/Auto: prefixes once, then add Auto:.
  const stripped = base.replace(/^(re|fwd|fw|auto)\s*:\s*/i, "").trim();
  if (/^auto\s*:/i.test(base)) return base;
  return `Auto: ${stripped || base}`;
}

export interface AutoResponseOptions {
  /** Address being replied to (the sender of the inbound message). */
  to: string;
  /** Reply body (plain-text). HTML is intentionally not used by default. */
  text: string;
  /** Optional override subject. If omitted, derived from subject.subject. */
  subject?: string;
  /** Inbound message we're replying to. */
  inReplyTo: SubjectMessageHeaders;
  /** Logical dedupe key, e.g. "vacation-responder", "ticket-receipt". */
  dedupeKey: string;
  /** Responder class. Default "service" (auto-generated). */
  responderClass?: AutoResponderClass;
  /** Re-respond window. Default 7 days. */
  windowMs?: number;
  /**
   * The address this responder receives mail at — used both for the
   * "recipient is in To/Cc/Bcc" check (personal/group) and as the
   * recipient component of the dedupe key. Strongly recommended; if
   * omitted, defaults to `opts.to` which can cause dedupe collisions
   * when one app runs multiple responder mailboxes.
   */
  recipient?: string;
}

export interface AutoResponseResult {
  sent: boolean;
  skippedReason?: ShouldAutoRespondResult["reason"] | "send-failed";
}

/** Build the headers we want AgentMail to set on the outgoing reply. */
export function buildAutoResponseHeaders(
  inReplyTo: SubjectMessageHeaders,
  responderClass: AutoResponderClass,
): Record<string, string> {
  const headers: Record<string, string> = {
    // RFC 3834 §5: service responders use "auto-generated"; personal/group use "auto-replied".
    "Auto-Submitted":
      responderClass === "service" ? "auto-generated" : "auto-replied",
    // De facto Outlook/Exchange opt-out hint to suppress further auto-replies.
    // (RFC 3834 itself relies on Auto-Submitted; this header is purely advisory.)
    "X-Auto-Response-Suppress": "All",
  };
  const mid = inReplyTo.messageId ? ensureAngleBrackets(inReplyTo.messageId) : "";
  if (mid) {
    headers["In-Reply-To"] = mid;
    const refs = (inReplyTo.references ?? "").trim();
    headers["References"] = refs ? `${refs} ${mid}`.trim() : mid;
  }
  return headers;
}

// Pluggable transport so the verification script can exercise the helpers
// without hitting AgentMail. Production path uses the real proxy.
export type AgentMailTransport = (
  payload: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    headers?: Record<string, string>;
    inReplyTo?: string;
    references?: string;
  },
) => Promise<boolean>;

let activeTransport: AgentMailTransport | null = null;

export function __setAgentMailTransportForTesting(t: AgentMailTransport | null): void {
  activeTransport = t;
}

async function defaultTransport(payload: Parameters<AgentMailTransport>[0]): Promise<boolean> {
  try {
    const connectors = new ReplitConnectors();
    const inboxId = await getOrCreateInbox(connectors);
    if (!inboxId) return false;

    const body: Record<string, unknown> = {
      to: [{ email: payload.to }],
      subject: payload.subject,
      text: payload.text,
    };
    if (payload.html) body.html = payload.html;
    if (payload.headers) body.headers = payload.headers;
    if (payload.inReplyTo) body.in_reply_to = payload.inReplyTo;
    if (payload.references) body.references = payload.references;

    const res = await connectors.proxy("agentmail", `/inboxes/${inboxId}/messages`, {
      method: "POST",
      body,
    });
    if (res.ok) {
      console.log(`[AgentMail] Sent email to ${payload.to} — ${payload.subject}`);
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

export async function sendViaAgentMail(msg: EmailMessage): Promise<boolean> {
  const transport = activeTransport ?? defaultTransport;
  return transport({
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
}

/**
 * Send an RFC 3834 compliant auto-response. Applies all `shouldAutoRespond`
 * loop-prevention rules; on success records the dedupe entry.
 */
export async function sendAutoResponse(opts: AutoResponseOptions): Promise<AutoResponseResult> {
  const responderClass = opts.responderClass ?? "service";
  const recipient = opts.recipient ?? opts.to; // for service responders the recipient check is skipped
  const decision = shouldAutoRespond({
    subject: opts.inReplyTo,
    recipient,
    dedupeKey: opts.dedupeKey,
    responderClass,
  });
  if (!decision.ok) {
    console.log(
      `[AgentMail] Skipping auto-response to ${opts.to} (${opts.dedupeKey}): ${decision.reason}`,
    );
    return { sent: false, skippedReason: decision.reason };
  }

  const headers = buildAutoResponseHeaders(opts.inReplyTo, responderClass);
  const subject = opts.subject ?? deriveAutoSubject(opts.inReplyTo.subject);
  const transport = activeTransport ?? defaultTransport;
  const ok = await transport({
    to: opts.to,
    subject,
    text: opts.text,
    headers,
    inReplyTo: headers["In-Reply-To"],
    references: headers["References"],
  });
  if (!ok) return { sent: false, skippedReason: "send-failed" };

  const sender = extractEmail(opts.inReplyTo.returnPath || opts.inReplyTo.from || opts.to);
  recordAutoResponse(recipient, sender, opts.dedupeKey, opts.windowMs);
  return { sent: true };
}
