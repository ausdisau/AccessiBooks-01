import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { searchLibriVox } from "@/lib/integrations/librivox";
import { handleRouteError } from "@/lib/zod";

export async function GET(req: NextRequest) {
  try {
    const items = await searchLibriVox({
      title: req.nextUrl.searchParams.get("title") ?? undefined,
      author: req.nextUrl.searchParams.get("author") ?? undefined,
      limit: Number(req.nextUrl.searchParams.get("limit") || 25),
      offset: Number(req.nextUrl.searchParams.get("offset") || 0),
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/external-search/librivox");
  }
}
