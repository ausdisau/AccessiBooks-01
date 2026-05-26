import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, parseJson } from "@/lib/zod";

const updateSchema = z.object({
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  email: z.string().email().optional(),
  profileImageUrl: z.string().url().optional(),
  companyName: z.string().max(200).optional(),
  website: z.string().url().optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        profileImageUrl: true, subscriptionTier: true, subscriptionStatus: true,
        companyName: true, website: true, role: true, referralCode: true,
      },
    });
    return NextResponse.json({ user });
  } catch (err) {
    return handleRouteError(err, "GET /api/settings");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await parseJson(req, updateSchema);
    const user = await prisma.user.update({
      where: { id: session.id },
      data: { ...body, updatedAt: new Date() },
    });
    return NextResponse.json({ user });
  } catch (err) {
    return handleRouteError(err, "PUT /api/settings");
  }
}
