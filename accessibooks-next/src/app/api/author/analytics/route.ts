import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    const session = await requireSession();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [events, totals] = await Promise.all([
      prisma.contentAnalytic.findMany({
        where: { authorUserId: session.id, createdAt: { gte: since } },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
      prisma.contentAnalytic.groupBy({
        by: ["eventType"],
        where: { authorUserId: session.id },
        _count: { eventType: true },
      }),
    ]);
    return NextResponse.json({ recent: events, totals });
  } catch (err) {
    return handleRouteError(err, "GET /api/author/analytics");
  }
}
