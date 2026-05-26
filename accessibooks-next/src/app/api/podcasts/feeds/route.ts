import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/zod";

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 200);
    const where = q
      ? { OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { author: { contains: q, mode: "insensitive" as const } },
        ] }
      : {};
    const items = await prisma.podcastFeed.findMany({
      where,
      take: limit,
      orderBy: { title: "asc" },
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/podcasts/feeds");
  }
}
