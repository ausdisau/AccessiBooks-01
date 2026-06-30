// Commercial catalog: credits, packs & bundles (Task #213)
//
// An Audible-style credit economy on top of AccessiBooks. Users buy credit
// packs (Stripe, never expire) or receive a monthly per-tier allowance
// (expires at period end), then redeem 1 credit to permanently own a premium
// title. Bundles are sold for cash and grant ownership of several titles.
//
// Money-correctness rules (do not weaken without re-review):
//  - Every balance mutation runs inside a single DB transaction that first
//    locks the user's credit_accounts row (SELECT ... FOR UPDATE), so all
//    concurrent grants/debits for one user are serialized.
//  - Debits consume grants FIFO by soonest expiry (expires_at ASC NULLS LAST,
//    created_at ASC) and can never drive the balance below zero.
//  - Grants are idempotent via a unique idempotency_key (Stripe session id for
//    packs, `allowance:<user>:<period>` for monthly allowance).
//  - credit_ledger is an append-only audit trail; credit_accounts.balance is a
//    cached sum reconciled on every locked transaction (expiry sweep first).

import { type Express, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { pool, db } from "./db";
import {
  CREDIT_PACKS,
  TIER_CREDIT_ALLOWANCE,
  TITLE_CREDIT_COST,
  COMMERCIAL_TITLES,
  purchases,
  commercialBundles,
  type CommercialTitleItem,
} from "@workspace/db";
import { isAuthenticated } from "./multiAuth";
import { storage } from "./storage";
import { stripe } from "./stripe";
import { and, eq, inArray } from "drizzle-orm";
import type { PoolClient } from "pg";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InsufficientCreditsError extends Error {
  constructor(public readonly balance: number, public readonly required: number) {
    super("Insufficient credits");
    this.name = "InsufficientCreditsError";
  }
}

export class AlreadyOwnedError extends Error {
  constructor() {
    super("You already own this title");
    this.name = "AlreadyOwnedError";
  }
}

export class TitleNotFoundError extends Error {
  constructor() {
    super("Title not found in the commercial catalog");
    this.name = "TitleNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserId(req: Request): string | null {
  const u = req.user as any;
  return u?.claims?.sub || u?.id || null;
}

export function findCommercialTitle(bookId: string): CommercialTitleItem | undefined {
  return COMMERCIAL_TITLES.find((t) => t.bookId === bookId);
}

// Run `fn` with the user's credit account row locked for the duration of a
// single transaction. Ensures the account row exists and sweeps expired
// grants before handing control to `fn`.
async function withUserLock<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO credit_accounts (user_id, balance) VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    await client.query(`SELECT balance FROM credit_accounts WHERE user_id = $1 FOR UPDATE`, [userId]);
    await expireGrants(client, userId);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Zero out any grants whose expiry has passed and record a single ledger
// `expire` entry. Must be called while holding the account lock.
async function expireGrants(client: PoolClient, userId: string): Promise<void> {
  const { rows } = await client.query(
    `SELECT id, remaining FROM credit_grants
     WHERE user_id = $1 AND remaining > 0 AND expires_at IS NOT NULL AND expires_at <= now()
     FOR UPDATE`,
    [userId],
  );
  let totalExpired = 0;
  for (const r of rows) {
    totalExpired += Number(r.remaining);
    await client.query(`UPDATE credit_grants SET remaining = 0 WHERE id = $1`, [r.id]);
  }
  if (totalExpired > 0) {
    const { rows: acctRows } = await client.query(
      `UPDATE credit_accounts SET balance = GREATEST(balance - $2, 0), updated_at = now()
       WHERE user_id = $1 RETURNING balance`,
      [userId, totalExpired],
    );
    const balanceAfter = Number(acctRows[0]?.balance ?? 0);
    await client.query(
      `INSERT INTO credit_ledger (user_id, type, amount, balance_after, description)
       VALUES ($1, 'expire', $2, $3, 'Credits expired')`,
      [userId, -totalExpired, balanceAfter],
    );
  }
}

// ---------------------------------------------------------------------------
// Service: reads
// ---------------------------------------------------------------------------

export async function getBalance(userId: string): Promise<number> {
  // Reconcile (expire) under lock, then return the cached balance.
  return withUserLock(userId, async (client) => {
    const { rows } = await client.query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [userId]);
    return Number(rows[0]?.balance ?? 0);
  });
}

export async function getHistory(userId: string, limit = 100): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, type, amount, balance_after, book_id, bundle_id, source, source_id, description, created_at
     FROM credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    amount: Number(r.amount),
    balanceAfter: Number(r.balance_after),
    bookId: r.book_id,
    bundleId: r.bundle_id,
    source: r.source,
    sourceId: r.source_id,
    description: r.description,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Service: grants
// ---------------------------------------------------------------------------

export interface GrantArgs {
  userId: string;
  amount: number;
  source: string;
  sourceId?: string | null;
  idempotencyKey?: string | null;
  expiresAt?: Date | null;
  description?: string | null;
}

export interface GrantResult {
  granted: boolean;
  duplicate: boolean;
  balance: number;
}

export async function grantCredits(args: GrantArgs): Promise<GrantResult> {
  const { userId, amount, source, sourceId, idempotencyKey, expiresAt, description } = args;
  if (amount <= 0) {
    const balance = await getBalance(userId);
    return { granted: false, duplicate: false, balance };
  }
  return withUserLock(userId, async (client) => {
    if (idempotencyKey) {
      const { rows: dupe } = await client.query(
        `SELECT id FROM credit_grants WHERE idempotency_key = $1`,
        [idempotencyKey],
      );
      if (dupe.length > 0) {
        const { rows } = await client.query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [userId]);
        return { granted: false, duplicate: true, balance: Number(rows[0]?.balance ?? 0) };
      }
    }
    const { rows: grantRows } = await client.query(
      `INSERT INTO credit_grants (user_id, amount, remaining, source, source_id, idempotency_key, expires_at)
       VALUES ($1, $2, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, amount, source, sourceId ?? null, idempotencyKey ?? null, expiresAt ?? null],
    );
    const grantId = grantRows[0].id;
    const { rows: acctRows } = await client.query(
      `UPDATE credit_accounts SET balance = balance + $2, updated_at = now()
       WHERE user_id = $1 RETURNING balance`,
      [userId, amount],
    );
    const balanceAfter = Number(acctRows[0].balance);
    await client.query(
      `INSERT INTO credit_ledger (user_id, type, amount, balance_after, grant_id, source, source_id, description)
       VALUES ($1, 'grant', $2, $3, $4, $5, $6, $7)`,
      [userId, amount, balanceAfter, grantId, source, sourceId ?? null, description ?? null],
    );
    return { granted: true, duplicate: false, balance: balanceAfter };
  });
}

// Grant a tier's monthly allowance, idempotent per billing period. Allowance
// credits expire at period end (falling back to +30 days when unknown).
export async function grantMonthlyAllowance(args: {
  userId: string;
  tier: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}): Promise<GrantResult> {
  const { userId, tier } = args;
  const amount = TIER_CREDIT_ALLOWANCE[tier] ?? 0;
  if (amount <= 0) {
    const balance = await getBalance(userId).catch(() => 0);
    return { granted: false, duplicate: false, balance };
  }
  const periodStart = args.periodStart ?? new Date();
  const periodKey = periodStart.toISOString().slice(0, 10);
  const expiresAt = args.periodEnd ?? new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  return grantCredits({
    userId,
    amount,
    source: "subscription_allowance",
    sourceId: periodKey,
    idempotencyKey: `allowance:${userId}:${periodKey}`,
    expiresAt,
    description: `Monthly ${tier} credit allowance`,
  });
}

// ---------------------------------------------------------------------------
// Service: debit / redeem
// ---------------------------------------------------------------------------

// Consume `cost` credits FIFO by expiry. Caller must hold the account lock.
async function debitCredits(
  client: PoolClient,
  userId: string,
  cost: number,
  meta: { bookId?: string | null; bundleId?: string | null; description?: string | null },
): Promise<number> {
  const { rows: acctRows } = await client.query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [userId]);
  const balance = Number(acctRows[0]?.balance ?? 0);
  if (balance < cost) throw new InsufficientCreditsError(balance, cost);

  const { rows: grants } = await client.query(
    `SELECT id, remaining FROM credit_grants
     WHERE user_id = $1 AND remaining > 0
     ORDER BY expires_at ASC NULLS LAST, created_at ASC
     FOR UPDATE`,
    [userId],
  );
  let toDebit = cost;
  let firstGrantId: string | null = null;
  for (const g of grants) {
    if (toDebit <= 0) break;
    const take = Math.min(Number(g.remaining), toDebit);
    await client.query(`UPDATE credit_grants SET remaining = remaining - $2 WHERE id = $1`, [g.id, take]);
    if (!firstGrantId) firstGrantId = g.id;
    toDebit -= take;
  }
  if (toDebit > 0) throw new InsufficientCreditsError(balance, cost); // safety net

  const { rows: updated } = await client.query(
    `UPDATE credit_accounts SET balance = balance - $2, updated_at = now()
     WHERE user_id = $1 RETURNING balance`,
    [userId, cost],
  );
  const balanceAfter = Number(updated[0].balance);
  await client.query(
    `INSERT INTO credit_ledger (user_id, type, amount, balance_after, grant_id, book_id, bundle_id, description)
     VALUES ($1, 'spend', $2, $3, $4, $5, $6, $7)`,
    [userId, -cost, balanceAfter, firstGrantId, meta.bookId ?? null, meta.bundleId ?? null, meta.description ?? null],
  );
  return balanceAfter;
}

export interface RedeemResult {
  bookId: string;
  balance: number;
  cost: number;
}

export async function redeemTitle(userId: string, bookId: string): Promise<RedeemResult> {
  const title = findCommercialTitle(bookId);
  if (!title) throw new TitleNotFoundError();
  const cost = title.creditCost ?? TITLE_CREDIT_COST;

  return withUserLock(userId, async (client) => {
    // Atomically CLAIM ownership before spending a credit. Inserting first (with
    // the unique ux_purchases_user_book index enforcing one row per user+book)
    // closes the race with concurrent cash fulfillment: if the title is already
    // owned — by a prior redeem or a Stripe purchase that landed between a plain
    // ownership check and the debit — the insert no-ops and we refuse to charge.
    // If debitCredits throws (insufficient balance), withUserLock rolls back the
    // whole transaction, so this reservation is undone.
    const { rowCount } = await client.query(
      `INSERT INTO purchases (user_id, book_id, book_title, amount_cents, currency, status)
       VALUES ($1, $2, $3, 0, 'usd', 'completed')
       ON CONFLICT (user_id, book_id) DO NOTHING`,
      [userId, bookId, title.title],
    );
    if (!rowCount) throw new AlreadyOwnedError();

    const balanceAfter = await debitCredits(client, userId, cost, {
      bookId,
      description: `Redeemed: ${title.title}`,
    });

    return { bookId, balance: balanceAfter, cost };
  });
}

// ---------------------------------------------------------------------------
// Service: fulfillment (called from the Stripe webhook)
// ---------------------------------------------------------------------------

export function findCreditPack(packId: string) {
  return CREDIT_PACKS.find((p) => p.id === packId);
}

// Grant pack credits (never expire). Idempotent via the Stripe session id.
export async function fulfillCreditPack(args: {
  userId: string;
  packId: string;
  sessionId: string;
}): Promise<GrantResult> {
  const pack = findCreditPack(args.packId);
  if (!pack) throw new Error(`Unknown credit pack: ${args.packId}`);
  return grantCredits({
    userId: args.userId,
    amount: pack.credits,
    source: "credit_pack",
    sourceId: args.sessionId,
    idempotencyKey: `stripe:checkout_session:${args.sessionId}`,
    expiresAt: null,
    description: `Credit pack: ${pack.name}`,
  });
}

// Grant ownership of every title in a bundle. Idempotent: each purchase insert
// is ON CONFLICT DO NOTHING, and the webhook also de-dupes via paymentTransactions.
export async function fulfillBundle(args: {
  userId: string;
  bundleId: string;
}): Promise<{ granted: number; titles: number }> {
  const [bundle] = await db.select().from(commercialBundles).where(eq(commercialBundles.id, args.bundleId)).limit(1);
  if (!bundle) throw new Error(`Unknown bundle: ${args.bundleId}`);
  const items = (bundle.items as CommercialTitleItem[]) || [];
  let granted = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of items) {
      const { rowCount } = await client.query(
        `INSERT INTO purchases (user_id, book_id, book_title, amount_cents, currency, status)
         VALUES ($1, $2, $3, 0, 'usd', 'completed')
         ON CONFLICT (user_id, book_id) DO NOTHING`,
        [args.userId, item.bookId, item.title],
      );
      granted += rowCount ?? 0;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return { granted, titles: items.length };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const redeemSchema = z.object({ bookId: z.string().trim().min(1).max(120) });
const checkoutPackSchema = z.object({ packId: z.string().trim().min(1).max(40) });

async function ownedBookIds(userId: string, bookIds: string[]): Promise<Set<string>> {
  if (bookIds.length === 0) return new Set();
  const rows = await db
    .select({ bookId: purchases.bookId })
    .from(purchases)
    .where(and(eq(purchases.userId, userId), inArray(purchases.bookId, bookIds)));
  return new Set(rows.map((r) => r.bookId));
}

export function registerCommercialCreditsRoutes(app: Express): void {
  // GET /api/commercial/titles — public catalog; annotates ownership if authed.
  app.get("/api/commercial/titles", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).isAuthenticated?.() ? getUserId(req) : null;
      const owned = userId ? await ownedBookIds(userId, COMMERCIAL_TITLES.map((t) => t.bookId)) : new Set<string>();
      res.json({
        titles: COMMERCIAL_TITLES.map((t) => ({
          ...t,
          creditCost: t.creditCost ?? TITLE_CREDIT_COST,
          owned: owned.has(t.bookId),
        })),
        titleCreditCost: TITLE_CREDIT_COST,
      });
    } catch (err: any) {
      req.log?.error?.({ err }, "[CommercialCredits] list titles failed");
      res.status(500).json({ message: "Failed to load catalog" });
    }
  });

  // GET /api/credits/packs — public pricing.
  app.get("/api/credits/packs", (_req: Request, res: Response) => {
    res.json({ packs: CREDIT_PACKS, currency: "usd" });
  });

  // GET /api/credits/balance — current balance + tier allowance.
  app.get("/api/credits/balance", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);
      const tier = (user?.subscriptionTier || "free") as string;
      const balance = await getBalance(userId);
      res.json({ balance, tier, monthlyAllowance: TIER_CREDIT_ALLOWANCE[tier] ?? 0 });
    } catch (err: any) {
      req.log?.error?.({ err }, "[CommercialCredits] balance failed");
      res.status(500).json({ message: "Failed to load balance" });
    }
  });

  // GET /api/credits/history — ledger audit trail.
  app.get("/api/credits/history", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const history = await getHistory(userId, 100);
      res.json({ history });
    } catch (err: any) {
      req.log?.error?.({ err }, "[CommercialCredits] history failed");
      res.status(500).json({ message: "Failed to load history" });
    }
  });

  // POST /api/credits/checkout — Stripe checkout for a credit pack.
  app.post("/api/credits/checkout", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!stripe) return res.status(503).json({ message: "Payment system not configured" });
      const parsed = checkoutPackSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "packId is required" });
      const pack = findCreditPack(parsed.data.packId);
      if (!pack) return res.status(404).json({ message: "Unknown credit pack" });

      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await storage.updateUserSubscription(userId, { stripeCustomerId: customerId });
      }

      const origin = (req.headers.origin as string) || "http://localhost:8080";
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `${pack.name} — ${pack.credits} credits`,
                description: `${pack.credits} AccessiBooks credits to redeem premium titles. Credits never expire.`,
              },
              unit_amount: pack.priceCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}?credits=success&pack=${pack.id}`,
        cancel_url: `${origin}?credits=cancelled`,
        metadata: {
          userId: user.id,
          type: "credit_pack",
          packId: pack.id,
          credits: pack.credits.toString(),
          amountCents: pack.priceCents.toString(),
        },
      });
      res.json({ url: session.url });
    } catch (err: any) {
      req.log?.error?.({ err }, "[CommercialCredits] pack checkout failed");
      res.status(500).json({ message: "Failed to start checkout" });
    }
  });

  // POST /api/credits/redeem — spend credits to permanently own a title.
  app.post("/api/credits/redeem", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const parsed = redeemSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "bookId is required" });
      const userId = getUserId(req)!;
      const result = await redeemTitle(userId, parsed.data.bookId);
      res.json({ success: true, ...result });
    } catch (err: any) {
      if (err instanceof InsufficientCreditsError) {
        return res.status(402).json({ message: "Not enough credits", balance: err.balance, required: err.required });
      }
      if (err instanceof AlreadyOwnedError) {
        return res.status(409).json({ message: err.message });
      }
      if (err instanceof TitleNotFoundError) {
        return res.status(404).json({ message: err.message });
      }
      req.log?.error?.({ err }, "[CommercialCredits] redeem failed");
      res.status(500).json({ message: "Failed to redeem title" });
    }
  });

  // GET /api/bundles — active bundles with per-user ownership annotation.
  app.get("/api/bundles", async (req: Request, res: Response) => {
    try {
      const rows = await db.select().from(commercialBundles).where(eq(commercialBundles.isActive, true));
      const userId = (req as any).isAuthenticated?.() ? getUserId(req) : null;
      let owned = new Set<string>();
      if (userId) {
        const allBookIds = rows.flatMap((b) => ((b.items as CommercialTitleItem[]) || []).map((i) => i.bookId));
        owned = await ownedBookIds(userId, allBookIds);
      }
      res.json({
        bundles: rows.map((b) => {
          const items = (b.items as CommercialTitleItem[]) || [];
          return {
            id: b.id,
            slug: b.slug,
            title: b.title,
            description: b.description,
            coverImage: b.coverImage,
            priceCents: b.priceCents,
            originalPriceCents: b.originalPriceCents,
            items,
            ownedCount: items.filter((i) => owned.has(i.bookId)).length,
            fullyOwned: items.length > 0 && items.every((i) => owned.has(i.bookId)),
          };
        }),
        currency: "usd",
      });
    } catch (err: any) {
      req.log?.error?.({ err }, "[CommercialCredits] list bundles failed");
      res.status(500).json({ message: "Failed to load bundles" });
    }
  });

  // POST /api/bundles/:id/checkout — Stripe checkout for a cash bundle.
  app.post("/api/bundles/:id/checkout", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!stripe) return res.status(503).json({ message: "Payment system not configured" });
      const bundleId = req.params.id;
      const [bundle] = await db.select().from(commercialBundles).where(eq(commercialBundles.id, bundleId)).limit(1);
      if (!bundle || !bundle.isActive) return res.status(404).json({ message: "Bundle not found" });

      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await storage.updateUserSubscription(userId, { stripeCustomerId: customerId });
      }

      const origin = (req.headers.origin as string) || "http://localhost:8080";
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: bundle.title,
                description: bundle.description || `AccessiBooks bundle — ${((bundle.items as CommercialTitleItem[]) || []).length} titles`,
              },
              unit_amount: bundle.priceCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}?bundle=success&slug=${bundle.slug}`,
        cancel_url: `${origin}?bundle=cancelled`,
        metadata: {
          userId: user.id,
          type: "bundle_purchase",
          bundleId: bundle.id,
          bundleSlug: bundle.slug,
          amountCents: bundle.priceCents.toString(),
        },
      });
      res.json({ url: session.url });
    } catch (err: any) {
      req.log?.error?.({ err }, "[CommercialCredits] bundle checkout failed");
      res.status(500).json({ message: "Failed to start checkout" });
    }
  });
}
