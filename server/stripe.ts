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
