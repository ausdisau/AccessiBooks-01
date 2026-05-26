import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { borrowSchema, handleRouteError, jsonError, parseJson } from "@/lib/zod";

const TIER_LIMITS: Record<string, number> = { free: 1, plus: 5, premium: 20 };
const LOAN_DAYS = 14;

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { bookId } = await parseJson(req, borrowSchema);

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return jsonError("Book not found", 404);

    const existing = await prisma.bookLoan.findFirst({
      where: { userId: session.id, bookId, status: "active", expiresAt: { gt: new Date() } },
    });
    if (existing) return jsonError("Already borrowed", 409, { loan: existing });

    const tier = session.subscriptionTier || "free";
    const max = TIER_LIMITS[tier] ?? 1;
    const active = await prisma.bookLoan.count({
      where: { userId: session.id, status: "active", expiresAt: { gt: new Date() } },
    });
    if (active >= max) {
      return jsonError("Loan limit reached for tier", 403, { tier, max });
    }

    const loan = await prisma.bookLoan.create({
      data: {
        userId: session.id,
        bookId,
        downloadToken: randomUUID(),
        expiresAt: new Date(Date.now() + LOAN_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    return NextResponse.json({ loan }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, "POST /api/loans/borrow");
  }
}
