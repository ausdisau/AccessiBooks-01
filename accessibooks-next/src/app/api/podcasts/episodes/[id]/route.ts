import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const episode = await prisma.podcastEpisode.findUnique({
      where: { id },
      include: { feed: true },
    });
    if (!episode) return jsonError("Episode not found", 404);
    return NextResponse.json(episode);
  } catch (err) {
    return handleRouteError(err, "GET /api/podcasts/episodes/[id]");
  }
}
