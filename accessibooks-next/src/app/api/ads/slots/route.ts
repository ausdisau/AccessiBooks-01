import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, parseJson } from "@/lib/zod";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  websiteUrl: z.string().url(),
  width: z.number().int().min(1).default(728),
  height: z.number().int().min(1).default(90),
  category: z.string().default("other"),
  minCpmCents: z.number().int().min(0).default(0),
});

export async function GET() {
  try {
    const session = await requireSession();
    const items = await prisma.adSlot.findMany({
      where: { publisherId: session.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/ads/slots");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await parseJson(req, createSchema);
    const slot = await prisma.adSlot.create({
      data: { publisherId: session.id, ...body },
    });
    return NextResponse.json({ slot }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, "POST /api/ads/slots");
  }
}
