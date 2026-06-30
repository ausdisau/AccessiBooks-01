// Gift & sponsor a subscription (Task #214)
//
// Two related flows built on top of the #213 credits ledger and the existing
// gift_cards table:
//
//  - GIFT: a buyer purchases a subscription term or a credit pack that a
//    specific recipient redeems with a one-time code. The card is created
//    `pending` at checkout and only becomes redeemable (`active`) once the
//    Stripe webhook confirms payment.
//
//  - SPONSORSHIP: a supporter funds a subscription term or credit pack into a
//    shared pool (`subscription_sponsorships`). The row is `pending` at
//    checkout, flips to `funded` on the webhook, and an eligible (free-tier)
//    user later CLAIMS it (`claimed`).
//
// Money-correctness rules (do not weaken without re-review):
//  - Server is the sole source of price. The client only chooses an option key
//    or pack id; cents are looked up here.
//  - Fulfillment is webhook-gated and idempotent: a conditional UPDATE that only
//    advances a `pending` row is the source-of-truth gate (NOT recordTransaction).
//  - Redeem/claim run in a single transaction on a dedicated client: the benefit
//    (comp subscription or credit grant) is applied on the SAME client that
//    flips the row's status, so either both commit or both roll back.
//  - Redeem locks the gift_cards row FOR UPDATE; claim locks the claimant's user
//    row FOR UPDATE and picks a pool row with FOR UPDATE SKIP LOCKED. A partial
//    unique index enforces at most one claimed sponsorship per user.
//  - Subscription redeem/claim is blocked for users with an active Stripe-billed
//    subscription so comp grants never fight the Stripe-driven sync.
//  - Redemption codes are crypto-generated and NEVER logged; redeem failures
//    return one generic message so codes cannot be enumerated.

import { type Express, type Request, type Response } from "express";
import { randomInt } from "crypto";
import rateLimit from "express-rate-limit";
import { eq, desc } from "drizzle-orm";
import { CREDIT_PACKS, giftCards, subscriptionSponsorships } from "@workspace/db";
import type { PoolClient } from "pg";
import { pool, db } from "./db";
import { isAuthenticated } from "./multiAuth";
import { stripe } from "./stripe";
import { grantCreditsTx } from "./commercialCredits";

// ---------------------------------------------------------------------------
// Options & pricing (server-authoritative)
// ---------------------------------------------------------------------------

// Subscription terms that can be gifted or sponsored. Prices mirror the
// historical gift catalogue (multi-month bundles at a small discount).
export const GIFT_SUBSCRIPTION_OPTIONS: Record<
  string,
  { tier: string; months: number; priceCents: number; label: string }
> = {
  "plus-1": { tier: "plus", months: 1, priceCents: 499, label: "1 Month Plus" },
  "plus-3": { tier: "plus", months: 3, priceCents: 1397, label: "3 Months Plus" },
  "plus-6": { tier: "plus", months: 6, priceCents: 2694, label: "6 Months Plus" },
  "plus-12": { tier: "plus", months: 12, priceCents: 4999, label: "12 Months Plus" },
  "premium-1": { tier: "premium", months: 1, priceCents: 999, label: "1 Month Premium" },
  "premium-3": { tier: "premium", months: 3, priceCents: 2797, label: "3 Months Premium" },
  "premium-6": { tier: "premium", months: 6, priceCents: 5394, label: "6 Months Premium" },
  "premium-12": { tier: "premium", months: 12, priceCents: 9999, label: "12 Months Premium" },
};

// Credit gifts/sponsorships reuse the #213 prepaid packs (single source of truth
// for credit pricing) instead of bespoke dollar amounts.
function findPack(packId: string) {
  return CREDIT_PACKS.find((p) => p.id === packId);
}

type GiftKind = "subscription" | "credits";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

// Expected, user-facing failures. Routes map these to their HTTP status; any
// other thrown error becomes a generic 500.
export class GiftSponsorError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "GiftSponsorError";
  }
}

// Single generic message for every redeem failure mode (not found / wrong
// status / expired / self) so a gift code cannot be probed for validity.
const GENERIC_REDEEM_ERR = "This gift code is invalid or can no longer be redeemed.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Unambiguous alphabet (no 0/O/1/I) for human-shareable codes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(len = 16): string {
  let code = "";
  for (let i = 0; i < len; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

// Crypto-random, collision-checked against the table. Codes are never logged.
async function generateUniqueGiftCode(): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode();
    const { rows } = await pool.query(`SELECT 1 FROM gift_cards WHERE code = $1 LIMIT 1`, [code]);
    if (rows.length === 0) return code;
  }
  throw new Error("Could not generate a unique gift code");
}

const TIER_RANK: Record<string, number> = { free: 0, plus: 1, premium: 2 };
function maxTier(a: string, b: string): string {
  return (TIER_RANK[b] ?? 0) > (TIER_RANK[a] ?? 0) ? b : a;
}

function userKey(req: Request): string {
  const u = (req as any).user;
  return u?.id || u?.claims?.sub || "anon";
}

function getUserId(req: Request): string | null {
  const u = (req as any).user;
  return u?.id || u?.claims?.sub || null;
}

// Apply a complimentary subscription term inside the caller's transaction. Locks
// the user row, blocks users with an active Stripe-billed subscription, upgrades
// to the higher of current/new tier, and STACKS the term onto any remaining time
// (max(now, existing end) + months). Leaves stripe_subscription_id untouched so
// the Stripe sync path is never disturbed.
async function applyCompSubscriptionTx(
  client: PoolClient,
  userId: string,
  tier: string,
  months: number,
): Promise<void> {
  const { rows } = await client.query(
    `SELECT subscription_tier, subscription_status, subscription_end_date, stripe_subscription_id
     FROM users WHERE id = $1 FOR UPDATE`,
    [userId],
  );
  if (rows.length === 0) throw new GiftSponsorError(404, "Account not found.");
  const r = rows[0];
  const status = (r.subscription_status || "").toLowerCase();
  if (r.stripe_subscription_id && (status === "active" || status === "trialing")) {
    throw new GiftSponsorError(
      409,
      "You already have an active paid subscription. Please use this once your current plan ends.",
    );
  }
  const now = new Date();
  const existingEnd = r.subscription_end_date ? new Date(r.subscription_end_date) : null;
  const base = existingEnd && existingEnd > now ? existingEnd : now;
  const newEnd = new Date(base);
  newEnd.setMonth(newEnd.getMonth() + months);
  const newTier = maxTier((r.subscription_tier || "free").toLowerCase(), tier);
  await client.query(
    `UPDATE users SET subscription_tier = $2, subscription_status = 'active', subscription_end_date = $3, updated_at = now()
     WHERE id = $1`,
    [userId, newTier, newEnd],
  );
}

// ---------------------------------------------------------------------------
// Checkout creation (server-priced, status = pending)
// ---------------------------------------------------------------------------

export async function createGiftCheckout(args: {
  userId: string;
  kind: GiftKind;
  optionKey?: string;
  packId?: string;
  toEmail?: string | null;
  message?: string | null;
  origin: string;
}): Promise<{ checkoutUrl: string; code: string }> {
  if (!stripe) throw new GiftSponsorError(503, "Payment system is not configured.");

  let amountCents = 0;
  let tierGift: string | null = null;
  let monthsGift: number | null = null;
  let creditAmount: number | null = null;
  let packId: string | null = null;
  let label = "";

  if (args.kind === "subscription") {
    const opt = args.optionKey ? GIFT_SUBSCRIPTION_OPTIONS[args.optionKey] : undefined;
    if (!opt) throw new GiftSponsorError(400, "Invalid subscription option.");
    amountCents = opt.priceCents;
    tierGift = opt.tier;
    monthsGift = opt.months;
    label = `Gift: ${opt.label}`;
  } else {
    const pack = args.packId ? findPack(args.packId) : undefined;
    if (!pack) throw new GiftSponsorError(400, "Invalid credit pack.");
    amountCents = pack.priceCents;
    creditAmount = pack.credits;
    packId = pack.id;
    label = `Gift: ${pack.name} (${pack.credits} credits)`;
  }

  const code = await generateUniqueGiftCode();
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const [card] = await db
    .insert(giftCards)
    .values({
      code,
      fromUserId: args.userId,
      toEmail: args.toEmail || null,
      amountCents,
      balanceRemaining: amountCents,
      type: args.kind,
      tierGift,
      monthsGift,
      creditAmount,
      packId,
      message: args.message || null,
      status: "pending",
      expiresAt,
      redeemedBy: null,
    })
    .returning();

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: { currency: "usd", product_data: { name: label }, unit_amount: amountCents },
          quantity: 1,
        },
      ],
      metadata: { type: "gift_card", giftId: card.id, userId: args.userId },
      success_url: `${args.origin}/gifts?gift=success&code=${code}`,
      cancel_url: `${args.origin}/gifts?gift=cancelled`,
    });
  } catch (e) {
    // Stripe failed before a session existed — drop the orphan pending row.
    await db.delete(giftCards).where(eq(giftCards.id, card.id)).catch(() => {});
    throw new GiftSponsorError(502, "Could not start checkout. Please try again.");
  }

  await db.update(giftCards).set({ stripeSessionId: session.id }).where(eq(giftCards.id, card.id));
  if (!session.url) throw new GiftSponsorError(502, "Could not start checkout. Please try again.");
  return { checkoutUrl: session.url, code };
}

export async function createSponsorshipCheckout(args: {
  userId: string;
  kind: GiftKind;
  optionKey?: string;
  packId?: string;
  message?: string | null;
  origin: string;
}): Promise<{ checkoutUrl: string; sponsorshipId: string }> {
  if (!stripe) throw new GiftSponsorError(503, "Payment system is not configured.");

  let amountCents = 0;
  let tier: string | null = null;
  let termMonths: number | null = null;
  let creditAmount: number | null = null;
  let packId: string | null = null;
  let label = "";

  if (args.kind === "subscription") {
    const opt = args.optionKey ? GIFT_SUBSCRIPTION_OPTIONS[args.optionKey] : undefined;
    if (!opt) throw new GiftSponsorError(400, "Invalid subscription option.");
    amountCents = opt.priceCents;
    tier = opt.tier;
    termMonths = opt.months;
    label = `Sponsor: ${opt.label}`;
  } else {
    const pack = args.packId ? findPack(args.packId) : undefined;
    if (!pack) throw new GiftSponsorError(400, "Invalid credit pack.");
    amountCents = pack.priceCents;
    creditAmount = pack.credits;
    packId = pack.id;
    label = `Sponsor: ${pack.name} (${pack.credits} credits)`;
  }

  const [sp] = await db
    .insert(subscriptionSponsorships)
    .values({
      sponsorUserId: args.userId,
      kind: args.kind,
      tier,
      termMonths,
      creditAmount,
      packId,
      amountCents,
      currency: "USD",
      message: args.message || null,
      status: "pending",
    })
    .returning();

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: { currency: "usd", product_data: { name: label }, unit_amount: amountCents },
          quantity: 1,
        },
      ],
      metadata: { type: "sub_sponsorship", sponsorshipId: sp.id, userId: args.userId },
      success_url: `${args.origin}/gifts?sponsor=success`,
      cancel_url: `${args.origin}/gifts?sponsor=cancelled`,
    });
  } catch (e) {
    await db.delete(subscriptionSponsorships).where(eq(subscriptionSponsorships.id, sp.id)).catch(() => {});
    throw new GiftSponsorError(502, "Could not start checkout. Please try again.");
  }

  await db
    .update(subscriptionSponsorships)
    .set({ stripeSessionId: session.id })
    .where(eq(subscriptionSponsorships.id, sp.id));
  if (!session.url) throw new GiftSponsorError(502, "Could not start checkout. Please try again.");
  return { checkoutUrl: session.url, sponsorshipId: sp.id };
}

// ---------------------------------------------------------------------------
// Webhook fulfillment (idempotent status gates)
// ---------------------------------------------------------------------------

// Flip a gift from pending -> active. The conditional UPDATE is the idempotency
// gate: a redelivered webhook (or any non-pending row) returns false and grants
// nothing. Returns true only on the first transition.
export async function fulfillGiftPaid(giftId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `UPDATE gift_cards SET status = 'active', paid_at = now()
     WHERE id = $1 AND status = 'pending' RETURNING id`,
    [giftId],
  );
  return rows.length > 0;
}

// Flip a sponsorship from pending -> funded (available to claim). Same
// idempotency gate as gifts.
export async function fulfillSponsorshipFunded(sponsorshipId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `UPDATE subscription_sponsorships SET status = 'funded', funded_at = now()
     WHERE id = $1 AND status = 'pending' RETURNING id`,
    [sponsorshipId],
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Redeem & claim (atomic benefit + status flip)
// ---------------------------------------------------------------------------

export interface RedeemOutcome {
  kind: GiftKind;
  tier: string | null;
  months: number | null;
  credits: number | null;
}

export async function redeemGift(userId: string, rawCode: string): Promise<RedeemOutcome> {
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!code) throw new GiftSponsorError(400, GENERIC_REDEEM_ERR);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock the card row for the whole transaction: concurrent redeems serialize
    // here, so the second attempt sees status='redeemed' and fails.
    const { rows } = await client.query(`SELECT * FROM gift_cards WHERE code = $1 FOR UPDATE`, [code]);
    const card = rows[0];
    const now = new Date();
    if (
      !card ||
      card.status !== "active" ||
      (card.expires_at && new Date(card.expires_at) < now) ||
      card.from_user_id === userId
    ) {
      throw new GiftSponsorError(400, GENERIC_REDEEM_ERR);
    }

    const kind: GiftKind = card.type === "subscription" ? "subscription" : "credits";
    if (kind === "subscription") {
      if (!card.tier_gift || !card.months_gift) throw new GiftSponsorError(400, GENERIC_REDEEM_ERR);
      await applyCompSubscriptionTx(client, userId, card.tier_gift, card.months_gift);
    } else {
      const amount = card.credit_amount ?? 0;
      if (amount <= 0) throw new GiftSponsorError(400, GENERIC_REDEEM_ERR);
      await grantCreditsTx(client, {
        userId,
        amount,
        source: "gift",
        sourceId: card.id,
        idempotencyKey: `gift:${card.id}`,
        expiresAt: null,
        description: "Redeemed gift credits",
      });
    }

    await client.query(
      `UPDATE gift_cards SET status = 'redeemed', redeemed_by = $2, redeemed_at = now(), balance_remaining = 0
       WHERE id = $1`,
      [card.id, userId],
    );
    await client.query("COMMIT");
    return {
      kind,
      tier: card.tier_gift ?? null,
      months: card.months_gift ?? null,
      credits: kind === "credits" ? (card.credit_amount ?? null) : null,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function claimSponsorship(userId: string): Promise<RedeemOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock the claimant row first so one user's concurrent claims serialize.
    const { rows: userRows } = await client.query(
      `SELECT subscription_tier, subscription_status, stripe_subscription_id FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    if (userRows.length === 0) throw new GiftSponsorError(404, "Account not found.");
    const u = userRows[0];
    const tier = (u.subscription_tier || "free").toLowerCase();
    const status = (u.subscription_status || "").toLowerCase();
    const hasActiveStripe = !!u.stripe_subscription_id && (status === "active" || status === "trialing");
    if (tier !== "free" || hasActiveStripe) {
      throw new GiftSponsorError(403, "Sponsored access is only available to free-tier members.");
    }

    // Friendly per-user lifetime cap check (the partial unique index is the hard
    // guarantee against races).
    const { rows: already } = await client.query(
      `SELECT 1 FROM subscription_sponsorships WHERE claimed_by_user_id = $1 AND status = 'claimed' LIMIT 1`,
      [userId],
    );
    if (already.length > 0) throw new GiftSponsorError(409, "You've already claimed sponsored access.");

    // Grab the oldest available pool row, skipping any locked by a concurrent claim.
    const { rows: spRows } = await client.query(
      `SELECT * FROM subscription_sponsorships
       WHERE status = 'funded' AND sponsor_user_id <> $1
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED LIMIT 1`,
      [userId],
    );
    const sp = spRows[0];
    if (!sp) throw new GiftSponsorError(404, "No sponsored access is available right now. Please check back soon.");

    const kind: GiftKind = sp.kind === "subscription" ? "subscription" : "credits";
    if (kind === "subscription") {
      if (!sp.tier || !sp.term_months) throw new GiftSponsorError(400, "This sponsorship is misconfigured.");
      await applyCompSubscriptionTx(client, userId, sp.tier, sp.term_months);
    } else {
      const amount = sp.credit_amount ?? 0;
      if (amount <= 0) throw new GiftSponsorError(400, "This sponsorship is misconfigured.");
      await grantCreditsTx(client, {
        userId,
        amount,
        source: "sponsorship",
        sourceId: sp.id,
        idempotencyKey: `sponsorship:${sp.id}`,
        expiresAt: null,
        description: "Claimed sponsored credits",
      });
    }

    try {
      await client.query(
        `UPDATE subscription_sponsorships SET status = 'claimed', claimed_by_user_id = $2, claimed_at = now()
         WHERE id = $1 AND status = 'funded'`,
        [sp.id, userId],
      );
    } catch (e: any) {
      // Partial unique index violation -> user already holds a claimed row.
      if (e?.code === "23505") throw new GiftSponsorError(409, "You've already claimed sponsored access.");
      throw e;
    }

    await client.query("COMMIT");
    return {
      kind,
      tier: sp.tier ?? null,
      months: sp.term_months ?? null,
      credits: kind === "credits" ? (sp.credit_amount ?? null) : null,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function listGiftsSent(userId: string) {
  return db.select().from(giftCards).where(eq(giftCards.fromUserId, userId)).orderBy(desc(giftCards.createdAt));
}

export function listGiftsReceived(userId: string) {
  return db.select().from(giftCards).where(eq(giftCards.redeemedBy, userId)).orderBy(desc(giftCards.redeemedAt));
}

export function listSponsorshipsMine(userId: string) {
  return db
    .select()
    .from(subscriptionSponsorships)
    .where(eq(subscriptionSponsorships.sponsorUserId, userId))
    .orderBy(desc(subscriptionSponsorships.createdAt));
}

export async function poolStats(): Promise<{ available: number; subscriptions: number; credits: number }> {
  const { rows } = await pool.query(
    `SELECT kind, count(*)::int AS count FROM subscription_sponsorships WHERE status = 'funded' GROUP BY kind`,
  );
  let subscriptions = 0;
  let credits = 0;
  for (const r of rows) {
    if (r.kind === "subscription") subscriptions = Number(r.count);
    else if (r.kind === "credits") credits = Number(r.count);
  }
  return { available: subscriptions + credits, subscriptions, credits };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Keyed by user id (these are all authenticated routes) to avoid the express-
// rate-limit IPv6 keyGenerator pitfall.
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `giftsponsor:checkout:${userKey(req)}`,
  message: { message: "Too many requests. Please try again later." },
});

const redeemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `giftsponsor:redeem:${userKey(req)}`,
  message: { message: "Too many attempts. Please try again later." },
});

function handleErr(res: Response, err: unknown, fallback: string): void {
  if (err instanceof GiftSponsorError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  // Never log request bodies here — redemption codes must not reach the logs.
  console.error("[GiftSponsor] Unexpected error:", err);
  res.status(500).json({ message: fallback });
}

export function registerGiftAndSponsorshipRoutes(app: Express): void {
  // Public catalogue of giftable / sponsorable options.
  app.get("/api/gifts/options", (_req, res) => {
    res.json({
      subscriptions: Object.entries(GIFT_SUBSCRIPTION_OPTIONS).map(([key, o]) => ({ key, ...o })),
      creditPacks: CREDIT_PACKS,
      currency: "usd",
    });
  });

  app.post("/api/gifts/checkout", isAuthenticated, checkoutLimiter, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const { kind, optionKey, packId, toEmail, message } = (req.body || {}) as Record<string, unknown>;
      if (kind !== "subscription" && kind !== "credits") {
        res.status(400).json({ message: "Invalid gift type." });
        return;
      }
      const origin = (req.headers.origin as string) || "http://localhost:8080";
      const result = await createGiftCheckout({
        userId,
        kind,
        optionKey: typeof optionKey === "string" ? optionKey : undefined,
        packId: typeof packId === "string" ? packId : undefined,
        toEmail: typeof toEmail === "string" ? toEmail : null,
        message: typeof message === "string" ? message : null,
        origin,
      });
      res.json(result);
    } catch (err) {
      handleErr(res, err, "Failed to create gift checkout.");
    }
  });

  app.get("/api/gifts/sent", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      res.json(await listGiftsSent(userId));
    } catch (err) {
      handleErr(res, err, "Failed to fetch sent gifts.");
    }
  });

  app.get("/api/gifts/received", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      res.json(await listGiftsReceived(userId));
    } catch (err) {
      handleErr(res, err, "Failed to fetch received gifts.");
    }
  });

  app.post("/api/gifts/redeem", isAuthenticated, redeemLimiter, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const code = (req.body || {}).code;
      if (!code || typeof code !== "string") {
        res.status(400).json({ message: GENERIC_REDEEM_ERR });
        return;
      }
      const result = await redeemGift(userId, code);
      res.json({ success: true, ...result });
    } catch (err) {
      handleErr(res, err, GENERIC_REDEEM_ERR);
    }
  });

  // Subscription sponsorships live under /api/sponsor-subs/* because
  // /api/sponsorships/* is owned by the advertising sponsorship system.
  app.post("/api/sponsor-subs/checkout", isAuthenticated, checkoutLimiter, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const { kind, optionKey, packId, message } = (req.body || {}) as Record<string, unknown>;
      if (kind !== "subscription" && kind !== "credits") {
        res.status(400).json({ message: "Invalid sponsorship type." });
        return;
      }
      const origin = (req.headers.origin as string) || "http://localhost:8080";
      const result = await createSponsorshipCheckout({
        userId,
        kind,
        optionKey: typeof optionKey === "string" ? optionKey : undefined,
        packId: typeof packId === "string" ? packId : undefined,
        message: typeof message === "string" ? message : null,
        origin,
      });
      res.json(result);
    } catch (err) {
      handleErr(res, err, "Failed to create sponsorship checkout.");
    }
  });

  app.get("/api/sponsor-subs/mine", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      res.json(await listSponsorshipsMine(userId));
    } catch (err) {
      handleErr(res, err, "Failed to fetch sponsorships.");
    }
  });

  // Public: how much sponsored access is currently available.
  app.get("/api/sponsor-subs/pool", async (_req: Request, res: Response) => {
    try {
      res.json(await poolStats());
    } catch (err) {
      handleErr(res, err, "Failed to fetch sponsorship pool.");
    }
  });

  app.post("/api/sponsor-subs/claim", isAuthenticated, redeemLimiter, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const result = await claimSponsorship(userId);
      res.json({ success: true, ...result });
    } catch (err) {
      handleErr(res, err, "Failed to claim sponsored access.");
    }
  });
}
