import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/zod";

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(
      Number(req.nextUrl.searchParams.get("limit") || 20),
      100,
    );
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const top = await prisma.listeningHistory.groupBy({
      by: ["bookId"],
      where: { lastPlayedAt: { gte: since } },
      _count: { bookId: true },
      orderBy: { _count: { bookId: "desc" } },
      take: limit,
    });
    if (top.length === 0) {
      const fallback = await prisma.book.findMany({ take: limit, orderBy: { title: "asc" } });
      return NextResponse.json({ items: fallback });
    }
    const ids = top.map((t) => t.bookId);
    const books = await prisma.book.findMany({ where: { id: { in: ids } } });
    const byId = new Map(books.map((b) => [b.id, b]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    return NextResponse.json({ items: ordered });
  } catch (err) {
    return handleRouteError(err, "GET /api/books/trending");
  }
}
