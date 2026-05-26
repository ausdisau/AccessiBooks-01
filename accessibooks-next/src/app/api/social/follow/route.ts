import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, jsonError, parseJson } from "@/lib/zod";

const followSchema = z.object({ userId: z.string().min(1) });

export async function GET() {
  try {
    const session = await requireSession();
    const [following, followers] = await Promise.all([
      prisma.userFollow.findMany({ where: { followerId: session.id } }),
      prisma.userFollow.findMany({ where: { followingId: session.id } }),
    ]);
    return NextResponse.json({ following, followers });
  } catch (err) {
    return handleRouteError(err, "GET /api/social/follow");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { userId } = await parseJson(req, followSchema);
    if (userId === session.id) return jsonError("Cannot follow yourself", 400);
    const existing = await prisma.userFollow.findFirst({
      where: { followerId: session.id, followingId: userId },
    });
    if (existing) return NextResponse.json({ follow: existing });
    const follow = await prisma.userFollow.create({
      data: { followerId: session.id, followingId: userId },
    });
    return NextResponse.json({ follow }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, "POST /api/social/follow");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const { userId } = await parseJson(req, followSchema);
    await prisma.userFollow.deleteMany({
      where: { followerId: session.id, followingId: userId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err, "DELETE /api/social/follow");
  }
}
