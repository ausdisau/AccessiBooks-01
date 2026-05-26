import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/zod";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 200);
    const items = await prisma.podcastEpisode.findMany({
      where: { feedId: id },
      take: limit,
      orderBy: { pubDate: "desc" },
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/podcasts/feeds/[id]/episodes");
  }
}
