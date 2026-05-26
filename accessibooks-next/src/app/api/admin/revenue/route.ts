import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    await requireAdmin();
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [lifetime, last30, byProvider] = await Promise.all([
      prisma.paymentTransaction.aggregate({
        where: { status: "succeeded" },
        _sum: { amountCents: true },
        _count: true,
      }),
      prisma.paymentTransaction.aggregate({
        where: { status: "succeeded", createdAt: { gte: since30 } },
        _sum: { amountCents: true },
        _count: true,
      }),
      prisma.paymentTransaction.groupBy({
        by: ["provider"],
        where: { status: "succeeded" },
        _sum: { amountCents: true },
        _count: true,
      }),
    ]);
    return NextResponse.json({
      lifetimeCents: lifetime._sum.amountCents ?? 0,
      lifetimeCount: lifetime._count,
      last30DaysCents: last30._sum.amountCents ?? 0,
      last30DaysCount: last30._count,
      byProvider,
    });
  } catch (err) {
    return handleRouteError(err, "GET /api/admin/revenue");
  }
}
