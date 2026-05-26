import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { handleRouteError } from "@/lib/zod";

const LIMITS: Record<string, { maxListeners: number; canHost: boolean; maxRooms: number }> = {
  free: { maxListeners: 0, canHost: false, maxRooms: 0 },
  plus: { maxListeners: 10, canHost: true, maxRooms: 2 },
  premium: { maxListeners: 50, canHost: true, maxRooms: 10 },
};

export async function GET() {
  try {
    const session = await getServerSession();
    const tier = session?.subscriptionTier ?? "free";
    return NextResponse.json({ tier, limits: LIMITS[tier] ?? LIMITS.free });
  } catch (err) {
    return handleRouteError(err, "GET /api/listening-party/tier-limits");
  }
}
