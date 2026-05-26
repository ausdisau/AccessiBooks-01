import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/zod";

export async function GET(_req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await params;
    const items = await prisma.bookTranscript.findMany({
      where: { bookId },
      orderBy: { chapterIndex: "asc" },
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/transcripts/[bookId]");
  }
}
