import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { searchItunes } from "@/lib/integrations/itunes";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function GET(req: NextRequest) {
  try {
    const term = req.nextUrl.searchParams.get("term")?.trim();
    if (!term) return jsonError("term required", 400);
    const media = (req.nextUrl.searchParams.get("media") as "podcast" | "audiobook") ?? "podcast";
    const data = await searchItunes({
      term,
      media,
      limit: Number(req.nextUrl.searchParams.get("limit") || 25),
    });
    return NextResponse.json(data);
  } catch (err) {
    return handleRouteError(err, "GET /api/external-search/itunes");
  }
}
