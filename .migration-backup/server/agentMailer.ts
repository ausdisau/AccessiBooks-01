// AgentMail integration — uses @replit/connectors-sdk to send transactional emails
// without requiring external SMTP credentials. Includes RFC 3834 compliant
// auto-response helpers for safe automated replies.
import crypto from "crypto";
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

// ---------------------------------------------------------------------------
// Auto-response dedupe store (Task #133)
//
// All read AND write decisions about the suppression window route through
// the `AutoResponseStore` interface below. The default in-process
// implementation keeps the existing `Map`-based behaviour (and is what
// every test exercises). Production wires a DB-backed implementation that
// extends the in-memory store with write-through persistence and a
// rehydrate-from-DB step at boot, so the suppression window survives
// server restarts.
// ---------------------------------------------------------------------------

function dedupeStoreKey(recipient: string, sender: string, dedupeKey: string): string {
  return `${recipient.trim().toLowerCase()}|${sender.trim().toLowerCase()}|${dedupeKey.trim().toLowerCase()}`;
}

/** Synchronous read/write surface used by `shouldAutoRespond`/`recordAutoResponse`. */
export interface AutoResponseStore {
  has(recipient: string, sender: string, dedupeKey: string, now: number): boolean;
  set(recipient: string, sender: string, dedupeKey: string, expiresAtMs: number): void;
  pruneExpired(now: number): void;
  clear(): void;
  size(): number;
}

/** Pure in-memory implementation. Used by tests and as the default. */
export class InMemoryAutoResponseStore implements AutoResponseStore {
  private map = new Map<string, number>();
  has(recipient: string, sender: string, dedupeKey: string, now: number): boolean {
    const exp = this.map.get(dedupeStoreKey(recipient, sender, dedupeKey));
    return Boolean(exp && exp > now);
  }
  set(recipient: string, sender: string, dedupeKey: string, expiresAtMs: number): void {
    this.map.set(dedupeStoreKey(recipient, sender, dedupeKey), expiresAtMs);
  }
  pruneExpired(now: number): void {
    for (const [k, exp] of Array.from(this.map.entries())) {
      if (exp <= now) this.map.delete(k);
    }
  }
  clear(): void {
    this.map.clear();
  }
  size(): number {
    return this.map.size;
  }
}

/**
 * Persistence layer for the DB-backed store. Production wires
 * `server/storage.ts`; tests can pass a fake.
 */
export interface AutoResponseStorage {
  recordAutoResponse(recipient: string, sender: string, dedupeKey: string, expiresAt: Date): Promise<void>;
  getActiveAutoResponses(now?: Date): Promise<Array<{ recipient: string; sender: string; dedupeKey: string; expiresAt: Date }>>;
  pruneExpiredAutoResponses?(now?: Date): Promise<number>;
}

/**
 * DB-backed store. Reads are served from a hot in-memory cache that is
 * (a) seeded from the DB at boot via `hydrate()`, and (b) updated
 * write-through whenever `set` is called. Persistence failures are logged
 * but never thrown — the local process always has a correct view of the
 * windows it has issued.
 *
 * Consistency note: `has()` is a cache read, not a DB read-through. That
 * means cross-instance dedupe is *eventually consistent*: a write on
 * instance A is not visible to instance B until B re-hydrates (today,
 * only at boot). This is sufficient for the restart-persistence goal of
 * Task #133. Stronger multi-instance consistency would require either a
 * periodic refresh, a short-TTL read-through, or moving `has()` to a DB
 * lookup — see follow-up #141.
 */
export class DbBackedAutoResponseStore implements AutoResponseStore {
  private cache = new InMemoryAutoResponseStore();
  constructor(private storage: AutoResponseStorage) {}

  has(recipient: string, sender: string, dedupeKey: string, now: number): boolean {
    return this.cache.has(recipient, sender, dedupeKey, now);
  }

  set(recipient: string, sender: string, dedupeKey: string, expiresAtMs: number): void {
    this.cache.set(recipient, sender, dedupeKey, expiresAtMs);
    this.storage
      .recordAutoResponse(
        recipient.trim().toLowerCase(),
        sender.trim().toLowerCase(),
        dedupeKey.trim().toLowerCase(),
        new Date(expiresAtMs),
      )
      .catch((err) => {
        console.warn("[AgentMail] persistAutoResponse failed:", err);
      });
  }

  pruneExpired(now: number): void {
    this.cache.pruneExpired(now);
  }
  clear(): void {
    this.cache.clear();
  }
  size(): number {
    return this.cache.size();
  }

  /**
   * Repopulate the hot cache from the DB. Should be awaited at server
   * boot so the first inbound webhook after restart sees the same dedupe
   * window the previous process had recorded.
   */
  async hydrate(now: number = Date.now()): Promise<number> {
    let loaded = 0;
    try {
      const rows = await this.storage.getActiveAutoResponses(new Date(now));
      for (const row of rows) {
        const exp = row.expiresAt instanceof Date ? row.expiresAt.getTime() : new Date(row.expiresAt).getTime();
        if (exp > now) {
          this.cache.set(row.recipient, row.sender, row.dedupeKey, exp);
          loaded++;
        }
      }
      if (loaded > 0) {
        console.log(`[AgentMail] Hydrated ${loaded} auto-response dedupe entries from storage`);
      }
      if (this.storage.pruneExpiredAutoResponses) {
        this.storage.pruneExpiredAutoResponses(new Date(now)).catch((err) => {
          console.warn("[AgentMail] pruneExpiredAutoResponses failed:", err);
        });
      }
    } catch (err) {
      console.error("[AgentMail] DbBackedAutoResponseStore.hydrate failed:", err);
    }
    return loaded;
  }
}

let autoResponseStore: AutoResponseStore = new InMemoryAutoResponseStore();

/** Get the active store. All read AND write paths must route through this. */
export function getAutoResponseStore(): AutoResponseStore {
  return autoResponseStore;
}

/** Swap the active store (e.g. install the DB-backed one in production). */
export function setAutoResponseStore(s: AutoResponseStore): void {
  autoResponseStore = s;
}

/** Restore the default in-memory store (used by tests between cases). */
export function resetAutoResponseStoreForTesting(): void {
  autoResponseStore = new InMemoryAutoResponseStore();
}

// ----- Back-compat thin wrappers (keep existing call sites + index.ts working) -----

/** @deprecated Use `setAutoResponseStore(new DbBackedAutoResponseStore(storage))` instead. */
export function setAutoResponseStorage(storage: AutoResponseStorage | null): void {
  autoResponseStore = storage
    ? new DbBackedAutoResponseStore(storage)
    : new InMemoryAutoResponseStore();
}

/**
 * Hydrate the active store from its persistence layer, if any.
 * Returns the number of rows loaded; 0 for stores that have no backing DB.
 */
export async function hydrateAutoResponseDedupeFromStorage(now: number = Date.now()): Promise<number> {
  const s = autoResponseStore;
  if (s instanceof DbBackedAutoResponseStore) {
    return await s.hydrate(now);
  }
  return 0;
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

  // (6) Per-sender rate limit / loop prevention. Routes through the
  // active store so DB-backed deployments (Task #133) see the same
  // suppression window across restarts.
  const store = autoResponseStore;
  store.pruneExpired(now);
  if (store.has(input.recipient, envelopeFrom, input.dedupeKey, now)) {
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
  const expiresAtMs = now + windowMs;
  // Routes through the active store; the DB-backed store also persists
  // write-through so the suppression survives a process restart.
  autoResponseStore.set(recipient, sender, dedupeKey, expiresAtMs);
}

/**
 * Test/admin helpers. Delegate to the active store so they see entries
 * regardless of whether tests use the default in-memory store or wire a
 * DB-backed one.
 */
export const autoResponseDedupe = {
  clear(): void {
    autoResponseStore.clear();
  },
  size(): number {
    return autoResponseStore.size();
  },
  has(recipient: string, sender: string, dedupeKey: string, now: number = Date.now()): boolean {
    return autoResponseStore.has(recipient, sender, dedupeKey, now);
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

// ---------------------------------------------------------------------------
// Inbound webhook — feed AgentMail-delivered messages into sendAutoResponse
// ---------------------------------------------------------------------------

/**
 * Verify an HMAC-SHA256 webhook signature from AgentMail.
 *
 * Expected header format (mirrors GitHub/Stripe-style webhooks):
 *   `sha256=<hex>` — raw `<hex>` is also accepted.
 *
 * Returns false on any malformed input. Uses constant-time comparison so a
 * mismatched signature does not leak via timing.
 */
export function verifyAgentMailWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  if (!/^[0-9a-f]+$/i.test(provided)) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(provided.toLowerCase(), "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Header bag from an inbound webhook payload (case-insensitive lookups). */
function pickHeader(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const lname = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lname) {
      if (Array.isArray(v)) return v.map(String).join(", ");
      return v == null ? undefined : String(v);
    }
  }
  return undefined;
}

/**
 * Shape of an AgentMail inbound webhook payload that we care about.
 * AgentMail's exact JSON varies; we accept either a flat layout (top-level
 * `from`, `to`, `subject`, `headers`) or a nested `message: { ... }` envelope.
 */
export interface AgentMailInboundPayload {
  from?: string;
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, unknown>;
  message?: AgentMailInboundPayload;
}

/** Parse an inbound AgentMail webhook payload into RFC 3834 SubjectMessageHeaders. */
export function parseInboundAgentMailMessage(
  payload: AgentMailInboundPayload,
): { headers: SubjectMessageHeaders; sender: string; recipients: string[] } {
  const m: AgentMailInboundPayload = payload.message ?? payload;
  const h = m.headers ?? {};
  const messageId = pickHeader(h, "Message-ID") ?? pickHeader(h, "Message-Id");
  const references = pickHeader(h, "References");
  const autoSubmitted = pickHeader(h, "Auto-Submitted");
  const returnPath = pickHeader(h, "Return-Path");
  const fromHeader = m.from ?? pickHeader(h, "From");
  const toHeader = m.to ?? pickHeader(h, "To");
  const ccHeader = m.cc ?? pickHeader(h, "Cc");
  const bccHeader = m.bcc ?? pickHeader(h, "Bcc");
  const resentTo = pickHeader(h, "Resent-To");
  const resentCc = pickHeader(h, "Resent-Cc");
  const listId = pickHeader(h, "List-Id");
  const precedence = pickHeader(h, "Precedence");
  // Any other List-* header indicates list mail, even without List-Id.
  const hasListHeaders = Object.keys(h).some((k) => k.toLowerCase().startsWith("list-"));

  const headers: SubjectMessageHeaders = {
    messageId,
    references,
    subject: m.subject ?? pickHeader(h, "Subject"),
    returnPath,
    from: fromHeader,
    autoSubmitted,
    to: toHeader,
    cc: ccHeader,
    bcc: bccHeader,
    resentTo,
    resentCc,
    listId,
    hasListHeaders,
    precedence,
  };

  const sender = extractEmail(returnPath || fromHeader || "");
  const recipients = [
    ...listAddresses(toHeader),
    ...listAddresses(ccHeader),
    ...listAddresses(bccHeader),
  ];
  return { headers, sender, recipients };
}

/**
 * Policy entry: when an inbound message is addressed to `match` (an exact
 * lowercased mailbox or a string-match function), reply with the configured
 * service-class receipt.
 */
export interface InboundAutoReplyPolicy {
  /** Exact local-part or full address (lowercased), or a predicate. */
  match: string | ((recipient: string) => boolean);
  /** Logical dedupe key, e.g. "support-receipt", "vacation-responder". */
  dedupeKey: string;
  /** Reply body. */
  text: string;
  /** Optional override subject (otherwise derived from the inbound subject). */
  subject?: string;
  /** Responder class. Defaults to "service". */
  responderClass?: AutoResponderClass;
  /** Re-respond window in ms. Defaults to 7 days. */
  windowMs?: number;
}

const DEFAULT_INBOUND_POLICY: InboundAutoReplyPolicy[] = [
  {
    match: (r) => r.startsWith("support@") || r.startsWith("support+"),
    dedupeKey: "support-receipt",
    text:
      "Thanks for contacting AccessiBooks support. We've received your message " +
      "and a teammate will reply within 1 business day. " +
      "If your request is urgent, please include 'URGENT' in the subject line.",
  },
];

let activeInboundPolicy: InboundAutoReplyPolicy[] = DEFAULT_INBOUND_POLICY;

/** Replace the policy used by `processInboundAgentMailWebhook`. Pass null to reset. */
export function setInboundAutoReplyPolicy(policy: InboundAutoReplyPolicy[] | null): void {
  activeInboundPolicy = policy ?? DEFAULT_INBOUND_POLICY;
}

export function getInboundAutoReplyPolicy(): InboundAutoReplyPolicy[] {
  return activeInboundPolicy;
}

function findPolicyForRecipients(
  recipients: string[],
  policies: InboundAutoReplyPolicy[],
): { policy: InboundAutoReplyPolicy; recipient: string } | null {
  for (const recipient of recipients) {
    for (const policy of policies) {
      const matched =
        typeof policy.match === "function"
          ? policy.match(recipient)
          : recipient === policy.match.toLowerCase();
      if (matched) return { policy, recipient };
    }
  }
  return null;
}

export interface ProcessInboundResult {
  ok: boolean;
  status: number;
  /** Stable machine-readable outcome code for tests/observability. */
  outcome:
    | "sent"
    | "skipped"
    | "no-policy-match"
    | "no-sender"
    | "invalid-payload"
    | "invalid-signature"
    | "send-failed";
  reason?: ShouldAutoRespondResult["reason"] | "send-failed";
  matchedPolicy?: string;
}

export interface ProcessInboundOptions {
  rawBody: Buffer | string;
  /** Pre-parsed JSON body (skip re-parsing rawBody when provided). */
  parsedBody?: AgentMailInboundPayload;
  /** Value of the AgentMail signature header, if any. */
  signature?: string | null;
  /** Shared secret used for HMAC verification. If absent, signature check is skipped. */
  secret?: string | null;
  /** Override policy list (otherwise uses module-level activeInboundPolicy). */
  policies?: InboundAutoReplyPolicy[];
}

/**
 * End-to-end inbound webhook handler. Verifies signature (if a secret is
 * configured), parses the inbound message into RFC 3834 headers, finds a
 * matching policy by recipient, and calls `sendAutoResponse`. Always returns
 * a structured result instead of throwing — the route handler maps it to HTTP.
 */
export async function processInboundAgentMailWebhook(
  opts: ProcessInboundOptions,
): Promise<ProcessInboundResult> {
  if (opts.secret) {
    if (!verifyAgentMailWebhookSignature(opts.rawBody, opts.signature ?? "", opts.secret)) {
      return { ok: false, status: 401, outcome: "invalid-signature" };
    }
  }

  let payload: AgentMailInboundPayload | undefined = opts.parsedBody;
  if (!payload) {
    try {
      const text = Buffer.isBuffer(opts.rawBody) ? opts.rawBody.toString("utf8") : opts.rawBody;
      payload = JSON.parse(text) as AgentMailInboundPayload;
    } catch {
      return { ok: false, status: 400, outcome: "invalid-payload" };
    }
  }
  if (!payload || typeof payload !== "object") {
    return { ok: false, status: 400, outcome: "invalid-payload" };
  }

  const parsed = parseInboundAgentMailMessage(payload);
  if (!parsed.sender) {
    // No usable From/Return-Path — can't reply safely.
    return { ok: true, status: 202, outcome: "no-sender" };
  }

  const policies = opts.policies ?? activeInboundPolicy;
  const match = findPolicyForRecipients(parsed.recipients, policies);
  if (!match) {
    return { ok: true, status: 202, outcome: "no-policy-match" };
  }

  const result = await sendAutoResponse({
    to: parsed.sender,
    text: match.policy.text,
    subject: match.policy.subject,
    inReplyTo: parsed.headers,
    dedupeKey: match.policy.dedupeKey,
    recipient: match.recipient,
    responderClass: match.policy.responderClass ?? "service",
    windowMs: match.policy.windowMs,
  });

  if (result.sent) {
    return {
      ok: true,
      status: 202,
      outcome: "sent",
      matchedPolicy: match.policy.dedupeKey,
    };
  }
  if (result.skippedReason === "send-failed") {
    return {
      ok: false,
      status: 502,
      outcome: "send-failed",
      reason: "send-failed",
      matchedPolicy: match.policy.dedupeKey,
    };
  }
  return {
    ok: true,
    status: 202,
    outcome: "skipped",
    reason: result.skippedReason,
    matchedPolicy: match.policy.dedupeKey,
  };
}
