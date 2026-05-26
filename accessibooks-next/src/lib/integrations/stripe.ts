import { logger } from "../logger";

/**
 * Thin Stripe wrapper. Real Stripe SDK wiring + webhook handling is
 * scheduled as a separate downstream task (see Task #182 "Out of scope").
 * This stub keeps the route handler shape stable: callers receive a
 * checkout-session-like object and we log when running without a key.
 */
export interface CheckoutSessionInput {
  userId: string;
  email: string | null;
  tier: "plus" | "premium";
  plan: "monthly" | "annual";
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
  customer: string | null;
  mode: "subscription";
}

/**
 * NOTE: Real Stripe SDK + webhook signing live in a downstream task. To keep
 * `/api/billing/*` non-failing regardless of whether STRIPE_SECRET_KEY is set
 * in this environment, we always return a placeholder session here. When the
 * downstream task lands it will swap this body for a real Stripe SDK call.
 */
export async function createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession> {
  const hasKey = Boolean(process.env.STRIPE_SECRET_KEY);
  logger.info({ userId: input.userId, tier: input.tier, plan: input.plan, hasKey }, "createCheckoutSession (placeholder)");
  return {
    id: `cs_placeholder_${Date.now()}`,
    url: `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}placeholder=1`,
    customer: null,
    mode: "subscription",
  };
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
  const hasKey = Boolean(process.env.STRIPE_SECRET_KEY);
  logger.info({ customerId, hasKey }, "createPortalSession (placeholder)");
  return { url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}placeholder=1` };
}
