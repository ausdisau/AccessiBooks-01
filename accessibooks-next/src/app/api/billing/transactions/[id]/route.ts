import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const tx = await prisma.paymentTransaction.findUnique({ where: { id } });
    if (!tx || tx.userId !== session.id) return jsonError("Not found", 404);
    return NextResponse.json(tx);
  } catch (err) {
    return handleRouteError(err, "GET /api/billing/transactions/[id]");
  }
}
