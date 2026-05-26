import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const book = await prisma.book.findUnique({
      where: { id },
      include: { chapters: { orderBy: { chapterNumber: "asc" } } },
    });
    if (!book) return jsonError("Book not found", 404);
    return NextResponse.json(book);
  } catch (err) {
    return handleRouteError(err, "GET /api/books/[id]");
  }
}
