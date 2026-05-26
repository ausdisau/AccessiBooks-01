import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    const items = await prisma.book.findMany({
      where: { isPremium: false, coverImage: { not: null } },
      take: 12,
      orderBy: { title: "asc" },
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/books/featured");
  }
}
