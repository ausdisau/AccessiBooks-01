import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function POST(_req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const session = await requireSession();
    const { bookId } = await params;
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return jsonError("Book not found", 404);
    const existing = await prisma.loanWaitlist.findFirst({
      where: { userId: session.id, bookId, status: "waiting" },
    });
    if (existing) return NextResponse.json({ waitlist: existing });
    const position = await prisma.loanWaitlist.count({ where: { bookId, status: "waiting" } });
    const entry = await prisma.loanWaitlist.create({
      data: { userId: session.id, bookId, position: position + 1 },
    });
    return NextResponse.json({ waitlist: entry }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, "POST /api/loans/waitlist/[bookId]");
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const session = await requireSession();
    const { bookId } = await params;
    await prisma.loanWaitlist.deleteMany({
      where: { userId: session.id, bookId, status: "waiting" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err, "DELETE /api/loans/waitlist/[bookId]");
  }
}
