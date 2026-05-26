import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { searchOpenLibrary } from "@/lib/integrations/openlibrary";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q) return jsonError("q required", 400);
    const limit = Number(req.nextUrl.searchParams.get("limit") || 25);
    const offset = Number(req.nextUrl.searchParams.get("offset") || 0);
    const data = await searchOpenLibrary(q, limit, offset);
    return NextResponse.json(data);
  } catch (err) {
    return handleRouteError(err, "GET /api/external-search/openlibrary");
  }
}
