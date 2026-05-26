import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const club = await prisma.readingClub.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!club) return jsonError("Club not found", 404);
    return NextResponse.json(club);
  } catch (err) {
    return handleRouteError(err, "GET /api/clubs/[id]");
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const existing = await prisma.readingClubMember.findFirst({
      where: { clubId: id, userId: session.id },
    });
    if (existing) return NextResponse.json({ member: existing });
    const member = await prisma.readingClubMember.create({
      data: { clubId: id, userId: session.id },
    });
    await prisma.readingClub.update({
      where: { id },
      data: { memberCount: { increment: 1 } },
    });
    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, "POST /api/clubs/[id]");
  }
}
