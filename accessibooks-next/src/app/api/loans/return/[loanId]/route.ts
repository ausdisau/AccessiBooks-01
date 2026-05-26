import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function POST(_req: Request, { params }: { params: Promise<{ loanId: string }> }) {
  try {
    const session = await requireSession();
    const { loanId } = await params;
    const loan = await prisma.bookLoan.findUnique({ where: { id: loanId } });
    if (!loan || loan.userId !== session.id) return jsonError("Loan not found", 404);
    const updated = await prisma.bookLoan.update({
      where: { id: loanId },
      data: { status: "returned", returnedAt: new Date() },
    });
    return NextResponse.json({ loan: updated });
  } catch (err) {
    return handleRouteError(err, "POST /api/loans/return/[loanId]");
  }
}
