import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth";
import { handleRouteError } from "@/lib/zod";

export async function GET(_req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const session = await getServerSession();
    const { bookId } = await params;
    if (!session) return NextResponse.json({ borrowed: false, waitlisted: false });
    const [loan, waitlist] = await Promise.all([
      prisma.bookLoan.findFirst({
        where: { userId: session.id, bookId, status: "active", expiresAt: { gt: new Date() } },
      }),
      prisma.loanWaitlist.findFirst({
        where: { userId: session.id, bookId, status: "waiting" },
      }),
    ]);
    return NextResponse.json({ borrowed: Boolean(loan), loan, waitlisted: Boolean(waitlist), waitlist });
  } catch (err) {
    return handleRouteError(err, "GET /api/loans/book/[bookId]/status");
  }
}
