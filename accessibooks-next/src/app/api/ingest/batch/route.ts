import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { batchIngestSchema, handleRouteError, parseJson } from "@/lib/zod";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { feedUrls } = await parseJson(req, batchIngestSchema);
    const results: { feedUrl: string; status: "created" | "exists" }[] = [];
    for (const feedUrl of feedUrls) {
      const existing = await prisma.podcastFeed.findUnique({ where: { feedUrl } });
      if (existing) {
        results.push({ feedUrl, status: "exists" });
        continue;
      }
      await prisma.podcastFeed.create({ data: { feedUrl, title: feedUrl } });
      results.push({ feedUrl, status: "created" });
    }
    return NextResponse.json({ results }, { status: 202 });
  } catch (err) {
    return handleRouteError(err, "POST /api/ingest/batch");
  }
}
