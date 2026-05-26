import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    const session = await requireSession();
    const items = await prisma.loanWaitlist.findMany({
      where: { userId: session.id, status: "waiting" },
      include: { book: true },
      orderBy: { joinedAt: "asc" },
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/loans/waitlist");
  }
}
