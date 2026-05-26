import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError } from "@/lib/zod";

/**
 * Earnings are derived from listening minutes × tier rate. The Express
 * version had a dedicated CreatorEarnings table; the Next.js port computes
 * the same totals on the fly from ContentAnalytic until a dedicated payout
 * ledger is added in a downstream task.
 */
const CENTS_PER_MINUTE = 1;

export async function GET() {
  try {
    const session = await requireSession();
    const minutes = await prisma.contentAnalytic.aggregate({
      where: { authorUserId: session.id, eventType: "listen" },
      _sum: { duration: true },
    });
    const totalSeconds = minutes._sum.duration ?? 0;
    const totalCents = Math.floor(totalSeconds / 60) * CENTS_PER_MINUTE;
    return NextResponse.json({
      totalCents,
      totalMinutes: Math.floor(totalSeconds / 60),
      ratePerMinuteCents: CENTS_PER_MINUTE,
    });
  } catch (err) {
    return handleRouteError(err, "GET /api/author/earnings");
  }
}
