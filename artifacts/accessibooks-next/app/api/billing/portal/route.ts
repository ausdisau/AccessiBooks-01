/**
 * POST /api/billing/portal — return a Stripe Customer Portal URL so the
 * signed-in user can manage their subscription (update payment method,
 * cancel, switch plan, etc.).
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/serverDb";
import { users } from "@workspace/db";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { createPortalSession } from "@/lib/subscriptionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user?.stripeCustomerId) {
    return NextResponse.json(
      { message: "No billing account found" },
      { status: 400 },
    );
  }

  const origin =
    request.headers.get("origin") ||
    (request.headers.get("host")
      ? `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get(
          "host",
        )}`
      : "http://localhost:3000");

  try {
    const { url } = await createPortalSession({
      stripeCustomerId: user.stripeCustomerId,
      returnUrl: origin,
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[Billing] portal failed:", err);
    return NextResponse.json(
      { message: "Failed to create billing portal" },
      { status: 500 },
    );
  }
}
