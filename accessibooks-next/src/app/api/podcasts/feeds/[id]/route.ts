import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const feed = await prisma.podcastFeed.findUnique({ where: { id } });
    if (!feed) return jsonError("Feed not found", 404);
    return NextResponse.json(feed);
  } catch (err) {
    return handleRouteError(err, "GET /api/podcasts/feeds/[id]");
  }
}
