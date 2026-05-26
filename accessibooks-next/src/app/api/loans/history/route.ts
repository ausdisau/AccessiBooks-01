import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    const session = await requireSession();
    const loans = await prisma.bookLoan.findMany({
      where: { userId: session.id },
      include: { book: true },
      orderBy: { loanedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ items: loans });
  } catch (err) {
    return handleRouteError(err, "GET /api/loans/history");
  }
}
