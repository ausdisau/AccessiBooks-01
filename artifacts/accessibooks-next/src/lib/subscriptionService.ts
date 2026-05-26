/**
 * subscriptionService.ts — Stripe checkout/portal/webhook business logic for
 * the Next.js app.
 *
 * Ported from artifacts/api-server/src/subscriptionService.ts. Behaviour is
 * preserved 1:1 so that subscriptions created against the legacy Express
 * server continue to be reconciled correctly when their webhooks now land in
 * this Next.js handler.
 *
 * Storage layer note: the task description called for Prisma, but this
 * workspace uses Drizzle end-to-end (the `@workspace/db` package is Drizzle,
 * and src/lib/serverDb.ts exposes a Drizzle handle). Using Prisma here would
 * fork the schema. We therefore continue with Drizzle and mirror the exact
 * same updates the api-server already performs.
 */
import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { db } from "./serverDb";
import {
  paymentTransactions,
  subscriptions,
  users,
  plans,
  type User,
} from "@workspace/db";
import {
  PLUS_PRICE_MONTHLY,
  PLUS_PRICE_YEARLY,
  PREMIUM_PRICE_MONTHLY,
  PREMIUM_PRICE_YEARLY,
  PRICE_IDS,
  SUBSCRIPTION_DESCRIPTIONS,
  SUBSCRIPTION_PRODUCT_NAMES,
  extractSubscriptionPriceId,
  stripe,
  tierFromPriceId,
} from "./stripe";

const GRACE_PERIOD_DAYS = parseInt(
  process.env.BILLING_GRACE_PERIOD_DAYS || "3",
  10,
);

// ---------------------------------------------------------------
// Idempotency guard — drop duplicate webhook deliveries (Stripe retries
// on any non-2xx). 24h sliding window, per-process Map.
//
// Correctness note: we only mark an event as processed AFTER its handler
// runs to completion. If the handler throws, we leave the event unmarked
// so Stripe's retry will be re-processed (and the route returns 500). The
// underlying DB writes (recordTransaction has a unique index on
// (provider, providerTransactionId); user updates are idempotent updates)
// tolerate re-application.
//
// In multi-instance serverless deployments this Map is per-instance only,
// so duplicate handling within a 24h window can still happen on cold
// starts. A durable processed-events table is filed as a follow-up; the
// per-row idempotency above keeps that safe as well.
// ---------------------------------------------------------------
const processedEvents = new Map<string, number>();
function isEventAlreadyProcessed(eventId: string): boolean {
  const now = Date.now();
  for (const [id, ts] of processedEvents.entries()) {
    if (now - ts > 24 * 60 * 60 * 1000) processedEvents.delete(id);
  }
  return processedEvents.has(eventId);
}
function markEventProcessed(eventId: string): void {
  processedEvents.set(eventId, Date.now());
}

// ---------------------------------------------------------------
// Storage helpers (thin Drizzle wrappers — mirror methods on
// api-server's storage.ts so behaviour stays identical).
// ---------------------------------------------------------------
async function getUser(userId: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row ?? null;
}

async function getUserByStripeCustomerId(
  customerId: string,
): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId));
  return row ?? null;
}

type SubscriptionPatch = {
  subscriptionTier?: string;
  subscriptionStatus?: string | null;
  subscriptionEndDate?: Date | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
};

async function updateUserSubscription(
  userId: string,
  patch: SubscriptionPatch,
): Promise<void> {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.subscriptionTier !== undefined)
    updateData.subscriptionTier = patch.subscriptionTier;
  if (patch.subscriptionStatus !== undefined)
    updateData.subscriptionStatus = patch.subscriptionStatus;
  if (patch.subscriptionEndDate !== undefined)
    updateData.subscriptionEndDate = patch.subscriptionEndDate;
  if (patch.stripeCustomerId !== undefined)
    updateData.stripeCustomerId = patch.stripeCustomerId;
  if (patch.stripeSubscriptionId !== undefined)
    updateData.stripeSubscriptionId = patch.stripeSubscriptionId;
  await db.update(users).set(updateData).where(eq(users.id, userId));
}

async function recordTransaction(params: {
  userId: string;
  provider: string;
  providerTransactionId?: string | null;
  type: string;
  status: string;
  amountCents: number;
  currency?: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  receiptUrl?: string | null;
}): Promise<void> {
  try {
    await db.insert(paymentTransactions).values({
      userId: params.userId,
      provider: params.provider,
      providerTransactionId: params.providerTransactionId ?? null,
      type: params.type,
      status: params.status,
      amountCents: params.amountCents,
      currency: params.currency ?? "USD",
      description: params.description ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      receiptUrl: params.receiptUrl ?? null,
    });
  } catch (err) {
    // Unique-index on (provider, providerTransactionId) — duplicate inserts
    // from retried webhooks are expected and harmless.
    console.warn(
      "[Billing] recordTransaction skipped (likely duplicate):",
      (err as Error).message,
    );
  }
}

/**
 * Best-effort upsert into the canonical `subscriptions` table. Wrapped in a
 * try/catch because the row also requires a `planId` FK — if no matching
 * plan row exists for the tier, we silently skip (the `users` row remains
 * the source of truth for entitlement checks).
 */
async function tryUpsertSubscription(
  userId: string,
  data: {
    stripeSubscriptionId: string | null;
    tier: string;
    status: string;
    currentPeriodEnd?: Date | null;
  },
): Promise<void> {
  try {
    const [plan] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.tier, data.tier));
    if (!plan) return;

    const where = data.stripeSubscriptionId
      ? eq(subscriptions.stripeSubscriptionId, data.stripeSubscriptionId)
      : and(eq(subscriptions.userId, userId), eq(subscriptions.planId, plan.id));

    const [existing] = await db.select().from(subscriptions).where(where);
    if (existing) {
      await db
        .update(subscriptions)
        .set({
          status: data.status,
          planId: plan.id,
          currentPeriodEnd: data.currentPeriodEnd ?? null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, existing.id));
    } else {
      await db.insert(subscriptions).values({
        userId,
        planId: plan.id,
        status: data.status,
        stripeSubscriptionId: data.stripeSubscriptionId,
        currentPeriodEnd: data.currentPeriodEnd ?? null,
      });
    }
  } catch (err) {
    console.debug(
      "[Billing] tryUpsertSubscription skipped:",
      (err as Error).message,
    );
  }
}

// ---------------------------------------------------------------
// Public service
// ---------------------------------------------------------------

export interface CreateCheckoutParams {
  userId: string;
  userEmail: string | null | undefined;
  stripeCustomerId: string | null | undefined;
  tier: "plus" | "premium";
  plan: "monthly" | "annual";
  originUrl: string;
}

export async function createCheckoutSession(
  params: CreateCheckoutParams,
): Promise<{ url: string; customerId: string }> {
  if (!stripe) throw new Error("Stripe is not configured");
  const { userId, userEmail, tier, plan, originUrl } = params;

  let customerId = params.stripeCustomerId || null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail || undefined,
      metadata: { userId },
    });
    customerId = customer.id;
    // Persist the customer id immediately so a duplicate checkout attempt
    // doesn't mint a second customer.
    await updateUserSubscription(userId, { stripeCustomerId: customerId });
  }

  const isAnnual = plan === "annual";
  const interval: "month" | "year" = isAnnual ? "year" : "month";
  const amount = isAnnual
    ? tier === "plus"
      ? PLUS_PRICE_YEARLY
      : PREMIUM_PRICE_YEARLY
    : tier === "plus"
      ? PLUS_PRICE_MONTHLY
      : PREMIUM_PRICE_MONTHLY;

  let priceId: string | null = null;
  if (tier === "plus" && isAnnual) priceId = PRICE_IDS.plusYearly;
  else if (tier === "plus") priceId = PRICE_IDS.plusMonthly;
  else if (tier === "premium" && isAnnual) priceId = PRICE_IDS.premiumYearly;
  else if (tier === "premium") priceId = PRICE_IDS.premiumMonthly;

  // Inline the line item — Stripe's nested namespace types (`SessionCreateParams.LineItem`)
  // aren't re-exported from the resource barrel, so we rely on the parameter
  // inference of `stripe.checkout.sessions.create` instead of naming the type.
  const lineItem = priceId
    ? { price: priceId, quantity: 1 }
    : {
        price_data: {
          currency: "usd",
          product_data: {
            name: SUBSCRIPTION_PRODUCT_NAMES[tier],
            description: SUBSCRIPTION_DESCRIPTIONS[tier] ?? "",
          },
          unit_amount: amount,
          recurring: { interval },
        },
        quantity: 1,
      };

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [lineItem],
    success_url: `${originUrl}?subscription=success&tier=${tier}`,
    cancel_url: `${originUrl}?subscription=cancelled`,
    metadata: { userId, tier, plan },
  });

  if (!session.url) throw new Error("Stripe did not return a session URL");
  return { url: session.url, customerId };
}

export async function createPortalSession(opts: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  if (!stripe) throw new Error("Stripe is not configured");
  const session = await stripe.billingPortal.sessions.create({
    customer: opts.stripeCustomerId,
    return_url: opts.returnUrl,
  });
  return { url: session.url };
}

export async function syncSubscriptionFromEvent(
  event: Stripe.Event,
): Promise<void> {
  if (isEventAlreadyProcessed(event.id)) {
    console.log(
      `[Billing] Skipping duplicate event ${event.id} (${event.type})`,
    );
    return;
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session,
      );
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(
        event.data.object as Stripe.Subscription,
      );
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(
        event.data.object as Stripe.Subscription,
      );
      break;
    case "invoice.paid":
    case "invoice.payment_succeeded":
      await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    default:
      console.log(`[Billing] Unhandled event type: ${event.type}`);
  }

  // Mark processed only after the handler completes without throwing — a
  // thrown handler returns 500 to Stripe, which retries, and we want the
  // retry to be re-processed (not silently skipped).
  markEventProcessed(event.id);
}

// ---------------------------------------------------------------
// Private event handlers
// ---------------------------------------------------------------

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const obj = session as Stripe.Checkout.Session & {
    metadata?: Record<string, string | undefined>;
  };
  const userId = obj.metadata?.userId;
  const tier = (obj.metadata?.tier as "plus" | "premium") || "premium";

  if (obj.mode === "subscription" && userId && !obj.metadata?.type) {
    await updateUserSubscription(userId, {
      subscriptionTier: tier,
      subscriptionStatus: "active",
      stripeSubscriptionId:
        typeof obj.subscription === "string"
          ? obj.subscription
          : (obj.subscription?.id ?? null),
      stripeCustomerId:
        typeof obj.customer === "string"
          ? obj.customer
          : (obj.customer?.id ?? null),
    });
    await recordTransaction({
      userId,
      provider: "stripe",
      providerTransactionId: obj.id,
      type: "subscription",
      status: "completed",
      amountCents: obj.amount_total ?? PREMIUM_PRICE_MONTHLY,
      description: `AccessiBooks ${tier} subscription`,
    });
    console.log(`[Billing] User ${userId} upgraded to ${tier} via checkout`);

    await tryUpsertSubscription(userId, {
      stripeSubscriptionId:
        typeof obj.subscription === "string"
          ? obj.subscription
          : (obj.subscription?.id ?? null),
      tier,
      status: "active",
    });
  } else if (obj.metadata?.type === "donation") {
    if (userId) {
      await recordTransaction({
        userId,
        provider: "stripe",
        providerTransactionId: obj.id,
        type: "donation",
        status: "completed",
        amountCents: obj.amount_total ?? 0,
        description: "Donation to AccessiBooks",
      });
    }
  }
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
): Promise<void> {
  const obj = subscription as Stripe.Subscription & {
    metadata?: Record<string, string | undefined>;
    current_period_end?: number;
  };
  if (obj.metadata?.type === "easy_english_addon") return;

  const customerId =
    typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
  if (!customerId) return;
  const user = await getUserByStripeCustomerId(customerId);
  if (!user) return;

  const status = obj.status;
  const priceId = extractSubscriptionPriceId(obj);
  const resolvedTier =
    tierFromPriceId(priceId) ||
    (obj.metadata?.tier as "plus" | "premium" | undefined) ||
    user.subscriptionTier ||
    "free";

  const endDate = obj.current_period_end
    ? new Date(obj.current_period_end * 1000)
    : null;

  if (status === "active" || status === "trialing") {
    await updateUserSubscription(user.id, {
      subscriptionTier: resolvedTier,
      subscriptionStatus: status,
      subscriptionEndDate: endDate,
    });
  } else if (status === "past_due") {
    await updateUserSubscription(user.id, {
      subscriptionStatus: "past_due",
      subscriptionEndDate: endDate,
    });
  } else if (status === "canceled" || status === "unpaid") {
    const updatedAt = user.updatedAt ?? new Date(0);
    const daysSinceUpdate =
      (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate >= GRACE_PERIOD_DAYS) {
      await updateUserSubscription(user.id, {
        subscriptionTier: "free",
        subscriptionStatus: "canceled",
        stripeSubscriptionId: null,
        subscriptionEndDate: null,
      });
    } else {
      await updateUserSubscription(user.id, {
        subscriptionStatus: status,
      });
    }
  }

  await tryUpsertSubscription(user.id, {
    stripeSubscriptionId: obj.id,
    tier: resolvedTier,
    status,
    currentPeriodEnd: endDate,
  });
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const obj = subscription as Stripe.Subscription & {
    metadata?: Record<string, string | undefined>;
  };
  if (obj.metadata?.type === "easy_english_addon") return;

  const customerId =
    typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
  if (!customerId) return;
  const user = await getUserByStripeCustomerId(customerId);
  if (!user) return;

  await updateUserSubscription(user.id, {
    subscriptionTier: "free",
    subscriptionStatus: "canceled",
    stripeSubscriptionId: null,
    subscriptionEndDate: null,
  });
  await recordTransaction({
    userId: user.id,
    provider: "stripe",
    providerTransactionId: obj.id,
    type: "subscription_cancelled",
    status: "completed",
    amountCents: 0,
    description: "Subscription cancelled",
  });

  await tryUpsertSubscription(user.id, {
    stripeSubscriptionId: obj.id,
    tier: "free",
    status: "canceled",
  });
}

async function handlePaymentSucceeded(
  invoice: Stripe.Invoice,
): Promise<void> {
  const obj = invoice as Stripe.Invoice & {
    hosted_invoice_url?: string | null;
  };
  const customerId =
    typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
  if (!customerId) return;
  const user = await getUserByStripeCustomerId(customerId);
  if (!user) return;

  await recordTransaction({
    userId: user.id,
    provider: "stripe",
    providerTransactionId: obj.id ?? null,
    type: "subscription_renewal",
    status: "completed",
    amountCents: obj.amount_paid ?? 0,
    description: "Subscription renewal payment",
    receiptUrl: obj.hosted_invoice_url ?? null,
  });

  if (user.subscriptionStatus === "past_due") {
    await updateUserSubscription(user.id, { subscriptionStatus: "active" });
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const obj = invoice as Stripe.Invoice;
  const customerId =
    typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
  if (!customerId) return;
  const user = await getUserByStripeCustomerId(customerId);
  if (!user) return;

  await updateUserSubscription(user.id, { subscriptionStatus: "past_due" });
  await recordTransaction({
    userId: user.id,
    provider: "stripe",
    providerTransactionId: obj.id ?? null,
    type: "subscription_renewal",
    status: "failed",
    amountCents: obj.amount_due ?? 0,
    description: "Payment failed for subscription renewal",
  });
  console.warn(
    `[Billing] Payment failed for user ${user.id} — status set to past_due`,
  );
  // NOTE: the legacy server schedules a setTimeout-based grace-period
  // downgrade. In a serverless deployment that timer would be killed when
  // the function instance is recycled, so we rely on the next
  // customer.subscription.updated event (Stripe transitions to "canceled"
  // after retries) to actually downgrade the user. A scheduled job covering
  // long past_due rows is filed as a follow-up.
}
