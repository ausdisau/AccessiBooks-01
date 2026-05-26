import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    await requireAdmin();
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [users, books, activeLoans, dau] = await Promise.all([
      prisma.user.count(),
      prisma.book.count(),
      prisma.bookLoan.count({ where: { status: "active", expiresAt: { gt: new Date() } } }),
      prisma.listeningHistory.findMany({
        where: { lastPlayedAt: { gte: since30 } },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ]);
    return NextResponse.json({
      totalUsers: users,
      totalBooks: books,
      activeLoans,
      monthlyActiveUsers: dau.length,
    });
  } catch (err) {
    return handleRouteError(err, "GET /api/admin/analytics");
  }
}
