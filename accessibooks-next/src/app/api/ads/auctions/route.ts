import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleRouteError, jsonError, parseJson } from "@/lib/zod";

const runSchema = z.object({
  slotId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const { slotId } = await parseJson(req, runSchema);
    const slot = await prisma.adSlot.findUnique({ where: { id: slotId } });
    if (!slot || !slot.isActive) return jsonError("Slot not available", 404);

    const candidates = await prisma.displayAd.findMany({
      where: { status: "approved", maxCpmCents: { gte: slot.minCpmCents } },
      take: 20,
      orderBy: { maxCpmCents: "desc" },
    });

    if (candidates.length === 0) {
      const auction = await prisma.adAuction.create({
        data: { slotId, noFill: true, bidsConsidered: 0 },
      });
      return NextResponse.json({ auction, ad: null });
    }

    const winner = candidates[0];
    const second = candidates[1]?.maxCpmCents ?? slot.minCpmCents;
    const auction = await prisma.adAuction.create({
      data: {
        slotId,
        winningAdId: winner.id,
        winningCpmCents: winner.maxCpmCents,
        secondPriceCpmCents: second,
        bidsConsidered: candidates.length,
      },
    });
    return NextResponse.json({ auction, ad: winner });
  } catch (err) {
    return handleRouteError(err, "POST /api/ads/auctions");
  }
}
