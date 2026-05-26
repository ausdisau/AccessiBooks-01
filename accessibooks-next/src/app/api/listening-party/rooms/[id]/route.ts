import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const room = await prisma.listeningRoom.findUnique({
      where: { id },
      include: { participants: true, messages: { take: 50, orderBy: { id: "desc" } } },
    });
    if (!room) return jsonError("Room not found", 404);
    return NextResponse.json(room);
  } catch (err) {
    return handleRouteError(err, "GET /api/listening-party/rooms/[id]");
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const room = await prisma.listeningRoom.findUnique({ where: { id } });
    if (!room) return jsonError("Room not found", 404);
    if (room.hostUserId !== session.id) return jsonError("Only the host can close this room", 403);
    const updated = await prisma.listeningRoom.update({
      where: { id },
      data: { status: "closed" },
    });
    return NextResponse.json({ room: updated });
  } catch (err) {
    return handleRouteError(err, "DELETE /api/listening-party/rooms/[id]");
  }
}
