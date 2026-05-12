import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.warn("STRIPE_SECRET_KEY not set - Stripe payments will not work");
}

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2025-12-15.clover" })
  : null;

import { TIER_PRICING } from "@shared/schema";

export const PREMIUM_PRICE_MONTHLY = TIER_PRICING.premium.monthly;
export const PREMIUM_PRICE_YEARLY = TIER_PRICING.premium.yearly;
export const PLUS_PRICE_MONTHLY = TIER_PRICING.plus.monthly;
export const PLUS_PRICE_YEARLY = TIER_PRICING.plus.yearly;

export interface SubscriptionConfig {
  priceId?: string;
  productName: string;
  amount: number;
  interval: "month" | "year";
}

export const SUBSCRIPTION_CONFIGS: Record<string, SubscriptionConfig> = {
  plus: {
    productName: "AccessiBooks Plus",
    amount: PLUS_PRICE_MONTHLY,
    interval: "month",
  },
  premium: {
    productName: "AccessiBooks Premium",
    amount: PREMIUM_PRICE_MONTHLY,
    interval: "month",
  },
};

export const SUBSCRIPTION_CONFIG = SUBSCRIPTION_CONFIGS.premium;

export const DONATION_AMOUNTS = [500, 1000, 2500, 5000]; // $5, $10, $25, $50 in cents

export interface DonationConfig {
  productName: string;
  description: string;
}

export const DONATION_CONFIG: DonationConfig = {
  productName: "AccessiBooks Donation",
  description: "Thank you for supporting accessible audiobooks!",
};

/**
 * Resolve a Stripe price ID to a subscription tier ("plus" | "premium") based on
 * env-configured price IDs. Returns null if the price ID does not match any
 * configured tier (caller should log and fall back conservatively).
 *
 * Required env vars:
 *   STRIPE_PLUS_MONTHLY_PRICE_ID
 *   STRIPE_PLUS_YEARLY_PRICE_ID
 *   STRIPE_PREMIUM_MONTHLY_PRICE_ID
 *   STRIPE_PREMIUM_YEARLY_PRICE_ID
 */
// Startup warning: surface missing Stripe price-ID configuration immediately so
// it isn't only discovered on the first webhook delivery.
const STRIPE_PRICE_ID_ENV_VARS = [
  "STRIPE_PLUS_MONTHLY_PRICE_ID",
  "STRIPE_PLUS_YEARLY_PRICE_ID",
  "STRIPE_PREMIUM_MONTHLY_PRICE_ID",
  "STRIPE_PREMIUM_YEARLY_PRICE_ID",
] as const;
const _missingPriceIdEnv = STRIPE_PRICE_ID_ENV_VARS.filter((k) => !process.env[k]);
if (_missingPriceIdEnv.length > 0) {
  console.warn(
    `[Stripe] WARNING: Missing price-ID env vars: ${_missingPriceIdEnv.join(", ")}. ` +
    `Subscriptions on these unmapped price IDs will resolve to the "free" tier ` +
    `(no entitlement granted) until configured.`
  );
}

export function tierFromPriceId(priceId: string | null | undefined): "plus" | "premium" | null {
  if (!priceId) return null;
  const plusIds = [process.env.STRIPE_PLUS_MONTHLY_PRICE_ID, process.env.STRIPE_PLUS_YEARLY_PRICE_ID].filter(Boolean);
  const premiumIds = [process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID, process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID].filter(Boolean);
  if (plusIds.includes(priceId)) return "plus";
  if (premiumIds.includes(priceId)) return "premium";
  return null;
}

/**
 * Extract the primary price ID from a Stripe Subscription object (first item).
 * Tolerant of both expanded and unexpanded shapes.
 */
export function extractSubscriptionPriceId(subscription: any): string | null {
  const item = subscription?.items?.data?.[0];
  if (!item) return null;
  const price = item.price;
  if (!price) return null;
  if (typeof price === "string") return price;
  return price.id || null;
}

export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string
): Stripe.Event | null {
  if (!stripe) return null;
  
  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return null;
  }
}
