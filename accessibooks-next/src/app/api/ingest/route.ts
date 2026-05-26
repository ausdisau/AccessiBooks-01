import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, ingestSchema, parseJson } from "@/lib/zod";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { feedUrl } = await parseJson(req, ingestSchema);
    const existing = await prisma.podcastFeed.findUnique({ where: { feedUrl } });
    if (existing) {
      logger.info({ feedUrl }, "Feed already registered");
      return NextResponse.json({ feed: existing, status: "exists" });
    }
    const feed = await prisma.podcastFeed.create({
      data: { feedUrl, title: feedUrl, lastFetchedAt: null },
    });
    return NextResponse.json({ feed, status: "queued" }, { status: 202 });
  } catch (err) {
    return handleRouteError(err, "POST /api/ingest");
  }
}
