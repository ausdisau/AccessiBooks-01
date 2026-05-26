/**
 * POST /api/billing/checkout — create a Stripe Checkout Session for the
 * signed-in user and return its URL. Body: { tier, plan }.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/serverDb";
import { users } from "@workspace/db";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { createCheckoutSession } from "@/lib/subscriptionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originFromRequest(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json(
      { message: "Stripe is not configured" },
      { status: 503 },
    );
  }

  const session = await auth();
  const userId = session?.user && (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { tier?: string; plan?: string } = {};
  try {
    body = (await request.json()) as { tier?: string; plan?: string };
  } catch {
    /* allow empty body — fall back to query/defaults below */
  }
  const url = new URL(request.url);
  const tierRaw = (body.tier ?? url.searchParams.get("tier") ?? "premium")
    .toString()
    .toLowerCase();
  const planRaw = (body.plan ?? url.searchParams.get("plan") ?? "monthly")
    .toString()
    .toLowerCase();

  if (tierRaw !== "plus" && tierRaw !== "premium") {
    return NextResponse.json(
      { message: "tier must be 'plus' or 'premium'" },
      { status: 400 },
    );
  }
  if (planRaw !== "monthly" && planRaw !== "annual") {
    return NextResponse.json(
      { message: "plan must be 'monthly' or 'annual'" },
      { status: 400 },
    );
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  try {
    const { url: checkoutUrl } = await createCheckoutSession({
      userId: user.id,
      userEmail: user.email,
      stripeCustomerId: user.stripeCustomerId,
      tier: tierRaw,
      plan: planRaw,
      originUrl: originFromRequest(request),
    });
    return NextResponse.json({ url: checkoutUrl });
  } catch (err) {
    console.error("[Billing] checkout failed:", err);
    return NextResponse.json(
      { message: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
