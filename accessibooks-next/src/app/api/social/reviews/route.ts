import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, parseJson } from "@/lib/zod";

const createReviewSchema = z.object({
  bookId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200).optional(),
  content: z.string().max(5000).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const bookId = req.nextUrl.searchParams.get("bookId");
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 200);
    const items = await prisma.review.findMany({
      where: bookId ? { bookId } : {},
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } } },
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/social/reviews");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await parseJson(req, createReviewSchema);
    const review = await prisma.review.create({
      data: { userId: session.id, ...body },
    });
    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, "POST /api/social/reviews");
  }
}
