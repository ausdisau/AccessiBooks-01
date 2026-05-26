import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, parseJson } from "@/lib/zod";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  currentBookId: z.string().optional(),
  currentBookTitle: z.string().optional(),
  isPublic: z.boolean().default(true),
});

export async function GET() {
  try {
    const items = await prisma.readingClub.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/clubs");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await parseJson(req, createSchema);
    const club = await prisma.readingClub.create({
      data: { creatorId: session.id, ...body, members: { create: { userId: session.id } } },
    });
    return NextResponse.json({ club }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, "POST /api/clubs");
  }
}
