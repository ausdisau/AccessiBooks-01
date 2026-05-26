import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function GET(req: NextRequest, { params }: { params: Promise<{ loanId: string }> }) {
  try {
    const { loanId } = await params;
    const token = req.nextUrl.searchParams.get("token");
    if (!token) return jsonError("Missing token", 400);
    const loan = await prisma.bookLoan.findUnique({
      where: { id: loanId },
      include: { book: true },
    });
    if (!loan || loan.downloadToken !== token) return jsonError("Invalid token", 403);
    if (loan.status !== "active" || loan.expiresAt < new Date()) {
      return jsonError("Loan expired", 410);
    }
    if (loan.downloadCount >= loan.maxDownloads) {
      return jsonError("Download limit reached", 429);
    }
    await prisma.bookLoan.update({
      where: { id: loanId },
      data: { downloadCount: { increment: 1 } },
    });
    return NextResponse.json({
      url: loan.book.audioUrl ?? loan.book.contentUrl,
      remaining: loan.maxDownloads - loan.downloadCount - 1,
    });
  } catch (err) {
    return handleRouteError(err, "GET /api/loans/download/[loanId]");
  }
}
