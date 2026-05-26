import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fetchGutenbergPage } from "@/lib/integrations/gutenberg";
import { handleRouteError } from "@/lib/zod";

export async function GET(req: NextRequest) {
  try {
    const data = await fetchGutenbergPage({
      search: req.nextUrl.searchParams.get("q") ?? undefined,
      page: Number(req.nextUrl.searchParams.get("page") || 1),
      languages: req.nextUrl.searchParams.get("languages") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    return handleRouteError(err, "GET /api/external-search/gutenberg");
  }
}
