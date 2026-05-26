import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/zod";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const chapters = await prisma.chapter.findMany({
      where: { bookId: id },
      orderBy: { chapterNumber: "asc" },
    });
    return NextResponse.json({ items: chapters });
  } catch (err) {
    return handleRouteError(err, "GET /api/books/[id]/chapters");
  }
}
