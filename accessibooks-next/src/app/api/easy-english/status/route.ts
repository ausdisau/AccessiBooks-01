import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    const session = await getServerSession();
    const tier = session?.subscriptionTier ?? "free";
    const enabled = Boolean(process.env.OPENAI_API_KEY);
    const entitled = tier === "premium" || tier === "plus";
    return NextResponse.json({ enabled, entitled, tier });
  } catch (err) {
    return handleRouteError(err, "GET /api/easy-english/status");
  }
}
