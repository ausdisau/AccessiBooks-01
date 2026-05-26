import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, jsonError, parseJson } from "@/lib/zod";

const createRoomSchema = z.object({
  bookId: z.string().min(1),
  roomName: z.string().min(1).max(120).optional(),
  maxListeners: z.number().int().min(2).max(50).default(10),
});

function generateRoomCode() {
  return randomBytes(4).toString("hex").toUpperCase().slice(0, 8);
}

export async function GET(_req: NextRequest) {
  try {
    const rooms = await prisma.listeningRoom.findMany({
      where: { status: "active" },
      take: 50,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ items: rooms });
  } catch (err) {
    return handleRouteError(err, "GET /api/listening-party/rooms");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await parseJson(req, createRoomSchema);
    const book = await prisma.book.findUnique({ where: { id: body.bookId } });
    if (!book) return jsonError("Book not found", 404);
    const room = await prisma.listeningRoom.create({
      data: {
        hostUserId: session.id,
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        bookCover: book.coverImage,
        roomCode: generateRoomCode(),
        roomName: body.roomName,
        maxListeners: body.maxListeners,
        hostTier: session.subscriptionTier ?? "free",
        status: "active",
      },
    });
    return NextResponse.json({ room }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, "POST /api/listening-party/rooms");
  }
}
