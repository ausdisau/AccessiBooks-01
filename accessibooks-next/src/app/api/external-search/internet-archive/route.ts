import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { searchInternetArchive } from "@/lib/integrations/internetArchive";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q) return jsonError("q required", 400);
    const data = await searchInternetArchive(
      q,
      Number(req.nextUrl.searchParams.get("rows") || 25),
      Number(req.nextUrl.searchParams.get("page") || 1),
    );
    return NextResponse.json(data);
  } catch (err) {
    return handleRouteError(err, "GET /api/external-search/internet-archive");
  }
}
