import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    const items = await prisma.book.findMany({
      where: { readingLevel: { lte: 6 } },
      take: 50,
      orderBy: { readingLevel: "asc" },
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/books/easy-read");
  }
}
