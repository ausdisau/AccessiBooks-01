import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/zod";

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 200);
    if (!q) return NextResponse.json({ items: [], total: 0 });
    const where = {
      OR: [
        { title: { contains: q, mode: "insensitive" as const } },
        { author: { contains: q, mode: "insensitive" as const } },
        { description: { contains: q, mode: "insensitive" as const } },
      ],
    };
    const [items, total] = await Promise.all([
      prisma.book.findMany({ where, take: limit, orderBy: { title: "asc" } }),
      prisma.book.count({ where }),
    ]);
    return NextResponse.json({ items, total });
  } catch (err) {
    return handleRouteError(err, "GET /api/books/search");
  }
}
