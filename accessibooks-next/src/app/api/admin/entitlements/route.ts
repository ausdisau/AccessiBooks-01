import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, parseJson } from "@/lib/zod";

const grantSchema = z.object({
  userId: z.string().min(1),
  tier: z.string().optional(),
  bookId: z.string().optional(),
  feature: z.string().optional(),
  grantedTier: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const userId = req.nextUrl.searchParams.get("userId");
    const items = await prisma.entitlement.findMany({
      where: userId ? { userId } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/admin/entitlements");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await parseJson(req, grantSchema);
    const entitlement = await prisma.entitlement.create({
      data: { ...body, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined },
    });
    return NextResponse.json({ entitlement }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, "POST /api/admin/entitlements");
  }
}
