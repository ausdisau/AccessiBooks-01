import Stripe from "stripe";
import { storage } from "./storage";
import { recordTransaction } from "./billing";
import {
  PLUS_PRICE_MONTHLY,
  PLUS_PRICE_YEARLY,
  PREMIUM_PRICE_MONTHLY,
  PREMIUM_PRICE_YEARLY,
  SUBSCRIPTION_CONFIGS,
  DONATION_CONFIG,
} from "./stripe";

const GRACE_PERIOD_DAYS = parseInt(process.env.BILLING_GRACE_PERIOD_DAYS || "3", 10);

// Log a startup warning if any Price IDs are missing
const PRICE_IDS = {
  plusMonthly: process.env.STRIPE_PLUS_MONTHLY_PRICE_ID || null,
  plusYearly: process.env.STRIPE_PLUS_YEARLY_PRICE_ID || null,
  premiumMonthly: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || null,
  premiumYearly: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID || null,
};

const missingPriceIds = Object.entries(PRICE_IDS)
  .filter(([, v]) => !v)
  .map(([k]) => `STRIPE_${k.replace(/([A-Z])/g, "_$1").toUpperCase()}_PRICE_ID`);

if (missingPriceIds.length > 0) {
  console.warn(
    `[Billing] WARNING: The following Stripe Price ID env vars are not set — checkout will fall back to inline price_data (blocks Customer Portal plan-switching):\n  ${missingPriceIds.join("\n  ")}`
  );
}

/**
 * Resolve a Stripe Price ID to a subscription tier string.
 * Returns "plus" | "premium" | null (unknown).
 */
export function resolveTierFromPriceId(priceId: string | null | undefined): "plus" | "premium" | null {
  if (!priceId) return null;
  if (priceId === PRICE_IDS.plusMonthly || priceId === PRICE_IDS.plusYearly) return "plus";
  if (priceId === PRICE_IDS.premiumMonthly || priceId === PRICE_IDS.premiumYearly) return "premium";
  return null;
}

// -------------------------------------------------------
// Idempotency guard: evict events older than 24 h
// -------------------------------------------------------
const processedEvents = new Map<string, number>(); // eventId -> timestamp ms

function isEventAlreadyProcessed(eventId: string): boolean {
  const now = Date.now();
  // Evict stale entries
  for (const [id, ts] of processedEvents.entries()) {
    if (now - ts > 24 * 60 * 60 * 1000) {
      processedEvents.delete(id);
    }
  }
  return processedEvents.has(eventId);
}

function markEventProcessed(eventId: string): void {
  processedEvents.set(eventId, Date.now());
}

// -------------------------------------------------------
// Service interface
// -------------------------------------------------------
export interface SubscriptionStatusResult {
  tier: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
}

export interface ISubscriptionService {
  createCheckoutSession(params: {
    userId: string;
    userEmail: string | null | undefined;
    stripeCustomerId: string | null | undefined;
    tier: string;
    plan: string;
    originUrl: string;
  }): Promise<{ url: string; customerId: string }>;

  createPortalSession(params: {
    stripeCustomerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;

  cancelSubscription(params: {
    stripeSubscriptionId: string;
  }): Promise<{ cancelAt: number | null }>;

  syncSubscriptionFromEvent(event: Stripe.Event): Promise<void>;

  getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResult>;
}

// -------------------------------------------------------
// Stripe implementation
// -------------------------------------------------------
export class StripeSubscriptionService implements ISubscriptionService {
  constructor(private stripe: Stripe) {}

  async createCheckoutSession(params: {
    userId: string;
    userEmail: string | null | undefined;
    stripeCustomerId: string | null | undefined;
    tier: string;
    plan: string;
    originUrl: string;
  }): Promise<{ url: string; customerId: string }> {
    const { userId, userEmail, tier, plan, originUrl } = params;
    let customerId = params.stripeCustomerId || null;

    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: userEmail || undefined,
        metadata: { userId },
      });
      customerId = customer.id;
    }

    const isAnnual = plan === "annual";
    const config = SUBSCRIPTION_CONFIGS[tier];

    // Determine amount for fallback
    const amount = isAnnual
      ? tier === "plus" ? PLUS_PRICE_YEARLY : PREMIUM_PRICE_YEARLY
      : tier === "plus" ? PLUS_PRICE_MONTHLY : PREMIUM_PRICE_MONTHLY;
    const interval: "month" | "year" = isAnnual ? "year" : "month";

    // Prefer stable Price IDs if available
    let priceId: string | null = null;
    if (tier === "plus" && isAnnual) priceId = PRICE_IDS.plusYearly;
    else if (tier === "plus") priceId = PRICE_IDS.plusMonthly;
    else if (tier === "premium" && isAnnual) priceId = PRICE_IDS.premiumYearly;
    else if (tier === "premium") priceId = PRICE_IDS.premiumMonthly;

    const descriptions: Record<string, string> = {
      plus: "Ad-free listening, unlimited skips, 192kbps audio, 3 devices",
      premium: "Ad-free listening, 320kbps audio, offline downloads, 5 devices, unlimited TTS",
    };

    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          price_data: {
            currency: "usd",
            product_data: {
              name: config.productName,
              description: descriptions[tier] || "",
            },
            unit_amount: amount,
            recurring: { interval },
          },
          quantity: 1,
        };

    const session = await this.stripe.checkout.sessions.create({
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

  async createPortalSession(params: {
    stripeCustomerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: params.stripeCustomerId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  async cancelSubscription(params: {
    stripeSubscriptionId: string;
  }): Promise<{ cancelAt: number | null }> {
    const subscription = await this.stripe.subscriptions.update(
      params.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );
    return { cancelAt: (subscription as any).cancel_at ?? null };
  }

  async getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResult> {
    const user = await storage.getUser(userId);
    if (!user) {
      return { tier: "free", status: "active", currentPeriodEnd: null, cancelAtPeriodEnd: false, trialEnd: null };
    }

    let currentPeriodEnd: string | null = user.subscriptionEndDate
      ? user.subscriptionEndDate.toISOString()
      : null;
    let cancelAtPeriodEnd = false;
    let trialEnd: string | null = null;
    const status = (user as any).subscriptionStatus || "active";

    // Try to enrich from Stripe live data
    if (user.stripeSubscriptionId) {
      try {
        const sub = await this.stripe.subscriptions.retrieve(user.stripeSubscriptionId) as any;
        currentPeriodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : currentPeriodEnd;
        cancelAtPeriodEnd = sub.cancel_at_period_end || false;
        trialEnd = sub.trial_end
          ? new Date(sub.trial_end * 1000).toISOString()
          : null;
      } catch {
        // fall back to DB data
      }
    }

    return {
      tier: user.subscriptionTier || "free",
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      trialEnd,
    };
  }

  async syncSubscriptionFromEvent(event: Stripe.Event): Promise<void> {
    if (isEventAlreadyProcessed(event.id)) {
      console.log(`[Billing] Skipping duplicate event ${event.id} (${event.type})`);
      return;
    }
    markEventProcessed(event.id);

    switch (event.type) {
      case "checkout.session.completed": {
        await this._handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      }
      case "customer.subscription.updated": {
        await this._handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        await this._handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.payment_succeeded": {
        await this._handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      }
      case "invoice.payment_failed": {
        await this._handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      }
      default:
        console.log(`[Billing] Unhandled event type: ${event.type}`);
    }
  }

  // ----------------------------------------------------------
  // Private handlers
  // ----------------------------------------------------------

  private async _handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const obj = session as any;
    const userId = obj.metadata?.userId;
    const tier = obj.metadata?.tier || "premium";

    if (obj.mode === "subscription" && userId && !obj.metadata?.type) {
      await storage.updateUserSubscription(userId, {
        subscriptionTier: tier,
        subscriptionStatus: "active",
        stripeSubscriptionId: obj.subscription,
        stripeCustomerId: obj.customer,
      });
      await recordTransaction({
        userId,
        provider: "stripe",
        providerTransactionId: obj.id,
        type: "subscription",
        status: "completed",
        amountCents: obj.amount_total || PREMIUM_PRICE_MONTHLY,
        description: `AccessiBooks ${tier} subscription`,
        receiptUrl: obj.receipt_url || null,
      });
      console.log(`[Billing] User ${userId} upgraded to ${tier} via checkout`);

      // Upsert subscriptions table if it exists (Task #43)
      await this._tryUpsertSubscription(userId, {
        stripeSubscriptionId: obj.subscription,
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
          amountCents: obj.amount_total || 0,
          description: "Donation to AccessiBooks",
        });
      }
      console.log(`[Billing] Donation received: $${((obj.amount_total || 0) / 100).toFixed(2)} from ${userId || "anonymous"}`);
    }
  }

  private async _handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const obj = subscription as any;

    // Skip Easy English add-on
    if (obj.metadata?.type === "easy_english_addon") return;

    const user = await storage.getUserByStripeCustomerId(obj.customer);
    if (!user) return;

    const status: string = obj.status; // active | trialing | past_due | canceled | unpaid | incomplete | incomplete_expired | paused

    // Resolve tier from Price ID first; fall back to session metadata or existing tier
    const priceId = obj.items?.data?.[0]?.price?.id || null;
    const resolvedTier = resolveTierFromPriceId(priceId)
      || obj.metadata?.tier
      || user.subscriptionTier
      || "free";

    const endDate = obj.current_period_end
      ? new Date(obj.current_period_end * 1000)
      : null;

    if (status === "active" || status === "trialing") {
      await storage.updateUserSubscription(user.id, {
        subscriptionTier: resolvedTier,
        subscriptionStatus: status,
        subscriptionEndDate: endDate,
      });
    } else if (status === "past_due") {
      // Keep tier but flag status — grace period handled by invoice.payment_failed
      await storage.updateUserSubscription(user.id, {
        subscriptionStatus: "past_due",
        subscriptionEndDate: endDate,
      });
    } else if (status === "canceled" || status === "unpaid") {
      // Check grace period: if past_due for longer than grace days, downgrade
      const updatedAt: Date = (user as any).updatedAt || new Date(0);
      const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate >= GRACE_PERIOD_DAYS) {
        await storage.updateUserSubscription(user.id, {
          subscriptionTier: "free",
          subscriptionStatus: "canceled",
          stripeSubscriptionId: null,
          subscriptionEndDate: null,
        });
        console.log(`[Billing] User ${user.id} downgraded to free after grace period (status: ${status})`);
      } else {
        await storage.updateUserSubscription(user.id, {
          subscriptionStatus: status,
        });
      }
    }

    console.log(`[Billing] Subscription updated for user ${user.id}: status=${status}, tier=${resolvedTier}`);

    await this._tryUpsertSubscription(user.id, {
      stripeSubscriptionId: obj.id,
      tier: resolvedTier,
      status,
    });
  }

  private async _handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const obj = subscription as any;

    // Skip Easy English add-on
    if (obj.metadata?.type === "easy_english_addon") return;

    const user = await storage.getUserByStripeCustomerId(obj.customer);
    if (!user) return;

    await storage.updateUserSubscription(user.id, {
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
    console.log(`[Billing] Subscription deleted for user ${user.id} — downgraded to free`);

    await this._tryUpsertSubscription(user.id, {
      stripeSubscriptionId: obj.id,
      tier: "free",
      status: "canceled",
    });
  }

  private async _handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const obj = invoice as any;
    const user = await storage.getUserByStripeCustomerId(obj.customer);
    if (!user) return;

    await recordTransaction({
      userId: user.id,
      provider: "stripe",
      providerTransactionId: obj.id,
      type: "subscription_renewal",
      status: "completed",
      amountCents: obj.amount_paid || 0,
      description: "Subscription renewal payment",
      receiptUrl: obj.hosted_invoice_url || null,
    });

    // On successful payment, restore active status if previously past_due
    if ((user as any).subscriptionStatus === "past_due") {
      await storage.updateUserSubscription(user.id, {
        subscriptionStatus: "active",
      });
      console.log(`[Billing] User ${user.id} payment succeeded — restored to active`);
    }

    console.log(`[Billing] Payment succeeded for invoice ${obj.id}`);
  }

  private async _handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const obj = invoice as any;
    const user = await storage.getUserByStripeCustomerId(obj.customer);
    if (!user) return;

    await storage.updateUserSubscription(user.id, {
      subscriptionStatus: "past_due",
    });

    await recordTransaction({
      userId: user.id,
      provider: "stripe",
      providerTransactionId: obj.id,
      type: "subscription_renewal",
      status: "failed",
      amountCents: obj.amount_due || 0,
      description: "Payment failed for subscription renewal",
    });

    console.warn(`[Billing] Payment failed for user ${user.id}, invoice ${obj.id} — status set to past_due`);

    // Schedule a grace-period downgrade using setTimeout
    const gracePeriodMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
    setTimeout(async () => {
      try {
        const freshUser = await storage.getUser(user.id);
        if (freshUser && (freshUser as any).subscriptionStatus === "past_due") {
          await storage.updateUserSubscription(user.id, {
            subscriptionTier: "free",
            subscriptionStatus: "canceled",
            stripeSubscriptionId: null,
            subscriptionEndDate: null,
          });
          console.log(`[Billing] Grace period expired for user ${user.id} — downgraded to free`);
        }
      } catch (err) {
        console.error(`[Billing] Grace-period downgrade failed for user ${user.id}:`, err);
      }
    }, gracePeriodMs);
  }

  /**
   * Attempt to upsert a row in the subscriptions table (added by Task #43).
   * Wrapped in try/catch so it is a no-op if the table does not yet exist.
   */
  private async _tryUpsertSubscription(
    userId: string,
    data: { stripeSubscriptionId: string | null | undefined; tier: string; status: string }
  ): Promise<void> {
    try {
      if (typeof (storage as any).upsertSubscription === "function") {
        await (storage as any).upsertSubscription({
          userId,
          stripeSubscriptionId: data.stripeSubscriptionId || null,
          tier: data.tier,
          status: data.status,
        });
      }
    } catch (err) {
      // Graceful degradation — subscriptions table may not exist yet
      console.debug("[Billing] upsertSubscription skipped:", (err as Error).message);
    }
  }
}
