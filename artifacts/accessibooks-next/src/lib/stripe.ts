/**
 * stripe.ts — Stripe SDK singleton + tier mapping helpers for the Next.js app.
 *
 * Ported from artifacts/api-server/src/stripe.ts. The Next.js process runs the
 * Stripe SDK directly (no Express middleware), but the price-ID → tier
 * mapping must stay bit-for-bit identical to the legacy server's so existing
 * subscriptions continue to resolve to the same tier when webhooks land here.
 */
import Stripe from "stripe";
import { TIER_PRICING } from "@workspace/db";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.warn(
    "[Stripe] STRIPE_SECRET_KEY not set — billing routes will return 503.",
  );
}

// Pin the request API version to the legacy api-server's so response shapes
// (subscription.current_period_end, invoice.* fields, etc.) stay identical
// during the cutover. The installed Stripe SDK's TS types want the newer
// "dahlia" version; the cast is intentional — Stripe respects whatever
// version string we pass regardless of SDK release.
export const stripe: Stripe | null = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiVersion: "2025-12-15.clover" as any,
    })
  : null;

export const PLUS_PRICE_MONTHLY = TIER_PRICING.plus.monthly;
export const PLUS_PRICE_YEARLY = TIER_PRICING.plus.yearly;
export const PREMIUM_PRICE_MONTHLY = TIER_PRICING.premium.monthly;
export const PREMIUM_PRICE_YEARLY = TIER_PRICING.premium.yearly;

export const SUBSCRIPTION_PRODUCT_NAMES = {
  plus: "AccessiBooks Plus",
  premium: "AccessiBooks Premium",
} as const;

export const SUBSCRIPTION_DESCRIPTIONS: Record<string, string> = {
  plus: "Ad-free listening, unlimited skips, 192kbps audio, 3 devices",
  premium:
    "Ad-free listening, 320kbps audio, offline downloads, 5 devices, unlimited TTS",
};

const STRIPE_PRICE_ID_ENV_VARS = [
  "STRIPE_PLUS_MONTHLY_PRICE_ID",
  "STRIPE_PLUS_YEARLY_PRICE_ID",
  "STRIPE_PREMIUM_MONTHLY_PRICE_ID",
  "STRIPE_PREMIUM_YEARLY_PRICE_ID",
] as const;

const _missingPriceIdEnv = STRIPE_PRICE_ID_ENV_VARS.filter(
  (k) => !process.env[k],
);
if (_missingPriceIdEnv.length > 0) {
  console.warn(
    `[Stripe] Missing price-ID env vars: ${_missingPriceIdEnv.join(", ")}. ` +
      `Checkout will fall back to inline price_data (Stripe Customer Portal plan ` +
      `switching requires stable price IDs). Subscriptions on unmapped price IDs ` +
      `resolve to "free" tier in tierFromPriceId.`,
  );
}

export const PRICE_IDS = {
  plusMonthly: process.env.STRIPE_PLUS_MONTHLY_PRICE_ID || null,
  plusYearly: process.env.STRIPE_PLUS_YEARLY_PRICE_ID || null,
  premiumMonthly: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || null,
  premiumYearly: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID || null,
} as const;

/**
 * Resolve a Stripe Price ID to a subscription tier. Matches the mapping in
 * api-server/src/subscriptionService.ts:resolveTierFromPriceId so the same
 * Stripe price continues to grant the same tier after the migration.
 */
export function tierFromPriceId(
  priceId: string | null | undefined,
): "plus" | "premium" | null {
  if (!priceId) return null;
  if (
    priceId === PRICE_IDS.plusMonthly ||
    priceId === PRICE_IDS.plusYearly
  ) {
    return "plus";
  }
  if (
    priceId === PRICE_IDS.premiumMonthly ||
    priceId === PRICE_IDS.premiumYearly
  ) {
    return "premium";
  }
  return null;
}

/** Pull the primary price ID off a Subscription, tolerant of unexpanded shape. */
export function extractSubscriptionPriceId(
  subscription: Stripe.Subscription | null | undefined,
): string | null {
  const item = subscription?.items?.data?.[0];
  const price = item?.price;
  if (!price) return null;
  if (typeof price === "string") return price;
  return price.id || null;
}

/** Verify webhook signature; returns the Event or null on any failure. */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string,
): Stripe.Event | null {
  if (!stripe) return null;
  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    console.error("[Stripe] Webhook signature verification failed:", err);
    return null;
  }
}
