import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { handleRouteError, jsonError } from "@/lib/zod";

/**
 * Vercel Cron entry point. Replaces the Express `setInterval` loop in
 * loanSystem.ts that swept expired loans. Configure in `vercel.json`:
 *   { "crons": [{ "path": "/api/cron/loan-expiration", "schedule": "0 *\u200d/1 * * *" }] }
 * (run hourly).
 *
 * Authorization: Vercel sets the `Authorization: Bearer <CRON_SECRET>` header
 * on scheduled invocations. We compare against `process.env.CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  try {
    const expected = process.env.CRON_SECRET;
    if (expected) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${expected}`) return jsonError("Unauthorized", 401);
    }
    const now = new Date();
    const result = await prisma.bookLoan.updateMany({
      where: { status: "active", expiresAt: { lt: now } },
      data: { status: "expired", returnedAt: now },
    });

    const waitlistPromoted = await promoteWaitlistForReturnedBooks();

    logger.info({ expired: result.count, waitlistPromoted }, "loan-expiration cron complete");
    return NextResponse.json({ expired: result.count, waitlistPromoted });
  } catch (err) {
    return handleRouteError(err, "GET /api/cron/loan-expiration");
  }
}

async function promoteWaitlistForReturnedBooks(): Promise<number> {
  const recentlyReturned = await prisma.bookLoan.findMany({
    where: { status: { in: ["expired", "returned"] }, returnedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    select: { bookId: true },
    distinct: ["bookId"],
  });
  let promoted = 0;
  for (const { bookId } of recentlyReturned) {
    const next = await prisma.loanWaitlist.findFirst({
      where: { bookId, status: "waiting" },
      orderBy: { joinedAt: "asc" },
    });
    if (next) {
      await prisma.loanWaitlist.update({
        where: { id: next.id },
        data: { status: "notified", notifiedAt: new Date() },
      });
      promoted++;
    }
  }
  return promoted;
}
