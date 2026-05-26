import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createCheckoutSession } from "@/lib/integrations/stripe";
import { checkoutSchema, handleRouteError, parseJson } from "@/lib/zod";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { tier, plan } = await parseJson(req, checkoutSchema);
    const origin = req.nextUrl.origin;
    const checkout = await createCheckoutSession({
      userId: session.id,
      email: session.email,
      tier,
      plan,
      successUrl: `${origin}/account/billing?status=success`,
      cancelUrl: `${origin}/account/billing?status=cancelled`,
    });
    return NextResponse.json(checkout);
  } catch (err) {
    return handleRouteError(err, "POST /api/billing/checkout");
  }
}
