import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    const items = await prisma.liveEvent.findMany({
      where: { scheduledStartAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { scheduledStartAt: "asc" },
      take: 50,
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/community/events");
  }
}
