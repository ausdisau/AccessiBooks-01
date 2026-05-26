import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError } from "@/lib/zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 200);
    const items = await prisma.paymentTransaction.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/billing/transactions");
  }
}
