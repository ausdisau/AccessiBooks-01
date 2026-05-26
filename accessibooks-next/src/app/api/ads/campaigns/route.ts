import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, parseJson } from "@/lib/zod";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  budgetCents: z.number().int().min(0),
  dailyBudgetCents: z.number().int().min(0).optional(),
  cpmBidCents: z.number().int().min(0).default(500),
  targetGenres: z.array(z.string()).optional(),
  targetTimeSlots: z.array(z.string()).optional(),
  category: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const items = await prisma.adCampaign.findMany({
      where: { advertiserId: session.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/ads/campaigns");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await parseJson(req, createSchema);
    const campaign = await prisma.adCampaign.create({
      data: {
        advertiserId: session.id,
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      },
    });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, "POST /api/ads/campaigns");
  }
}
