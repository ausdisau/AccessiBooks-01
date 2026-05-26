import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { searchItunes } from "@/lib/integrations/itunes";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function GET(req: NextRequest) {
  try {
    const term = req.nextUrl.searchParams.get("q")?.trim();
    if (!term) return jsonError("q required", 400);
    const data = await searchItunes({
      term,
      media: "podcast",
      limit: Number(req.nextUrl.searchParams.get("limit") || 25),
    });
    return NextResponse.json({
      items: data.results.map((r) => ({
        title: r.trackName,
        author: r.artistName,
        feedUrl: r.feedUrl,
        imageUrl: r.artworkUrl600 ?? r.artworkUrl100,
        genre: r.primaryGenreName,
      })),
    });
  } catch (err) {
    return handleRouteError(err, "GET /api/podcasts/search");
  }
}
