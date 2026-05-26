/**
 * POST /api/billing/webhook — Stripe webhook receiver.
 *
 * Runs on the Node.js runtime (NOT Edge) because:
 *   1. We need the raw request body (bytes) to verify the Stripe signature;
 *      Next's automatic JSON body parsing would corrupt the bytes Stripe
 *      signed. In App Router we get the raw body via `request.text()`.
 *   2. The Stripe SDK's webhook helpers depend on the Node `crypto` module.
 *
 * The handler must always return quickly (≤ 30 s) and idempotently so that
 * Stripe retries on transient failures don't double-apply entitlements.
 * Idempotency is enforced inside `syncSubscriptionFromEvent`.
 */
import { NextResponse } from "next/server";
import { stripe, verifyWebhookSignature } from "@/lib/stripe";
import { syncSubscriptionFromEvent } from "@/lib/subscriptionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      { message: "Stripe webhooks are not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { message: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  // Raw body — DO NOT use request.json(); the signature is over the exact
  // bytes Stripe sent.
  const rawBody = await request.text();
  const event = verifyWebhookSignature(rawBody, signature, webhookSecret);
  if (!event) {
    return NextResponse.json({ message: "Invalid signature" }, { status: 400 });
  }

  try {
    await syncSubscriptionFromEvent(event);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[Billing] Webhook handler failed for ${event.type}:`, err);
    // Returning 500 tells Stripe to retry — appropriate for transient DB
    // failures. Signature errors are 400 above so they aren't retried.
    return NextResponse.json(
      { message: "Webhook handler failed" },
      { status: 500 },
    );
  }
}
