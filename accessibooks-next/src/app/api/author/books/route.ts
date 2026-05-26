import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    const session = await requireSession();
    const items = await prisma.userSubmission.findMany({
      where: { userId: session.id },
      orderBy: { id: "desc" },
      take: 100,
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/author/books");
  }
}
