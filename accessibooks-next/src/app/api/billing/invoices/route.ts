import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    const session = await requireSession();
    const items = await prisma.paymentTransaction.findMany({
      where: { userId: session.id, type: { in: ["subscription", "renewal", "invoice"] } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({
      items: items.map((tx) => ({
        id: tx.id,
        amountCents: tx.amountCents,
        currency: tx.currency,
        status: tx.status,
        description: tx.description,
        receiptUrl: tx.receiptUrl,
        createdAt: tx.createdAt,
      })),
    });
  } catch (err) {
    return handleRouteError(err, "GET /api/billing/invoices");
  }
}
