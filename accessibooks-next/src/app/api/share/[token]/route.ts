import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, jsonError } from "@/lib/zod";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const clip = await prisma.shareClip.findUnique({ where: { id: token } });
    if (!clip) return jsonError("Share link not found", 404);
    return NextResponse.json({ clip });
  } catch (err) {
    return handleRouteError(err, "GET /api/share/[token]");
  }
}
