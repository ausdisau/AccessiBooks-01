import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createPortalSession } from "@/lib/integrations/stripe";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session.stripeCustomerId) {
      return jsonError("No Stripe customer for this user", 400);
    }
    const portal = await createPortalSession(
      session.stripeCustomerId,
      `${req.nextUrl.origin}/account/billing`,
    );
    return NextResponse.json(portal);
  } catch (err) {
    return handleRouteError(err, "POST /api/billing/create-portal-session");
  }
}
