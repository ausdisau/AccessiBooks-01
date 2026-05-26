import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    const session = await requireSession();
    const [active, lifetime, lastTx] = await Promise.all([
      prisma.subscription.findFirst({
        where: { userId: session.id, status: "active" },
        include: { plan: true },
      }),
      prisma.paymentTransaction.aggregate({
        where: { userId: session.id, status: "succeeded" },
        _sum: { amountCents: true },
        _count: true,
      }),
      prisma.paymentTransaction.findFirst({
        where: { userId: session.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return NextResponse.json({
      tier: session.subscriptionTier,
      status: session.subscriptionStatus,
      endsAt: session.subscriptionEndDate,
      activeSubscription: active,
      lifetimeSpentCents: lifetime._sum.amountCents ?? 0,
      transactionCount: lifetime._count,
      lastTransaction: lastTx,
    });
  } catch (err) {
    return handleRouteError(err, "GET /api/billing/summary");
  }
}
