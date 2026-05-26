import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, parseJson } from "@/lib/zod";

const schema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  enabledTypes: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await parseJson(req, schema);
    const sub = await prisma.pushSubscription.upsert({
      where: { id: `${session.id}:${Buffer.from(body.endpoint).toString("base64url").slice(0, 32)}` },
      update: { ...body, lastUsedAt: new Date() },
      create: {
        id: `${session.id}:${Buffer.from(body.endpoint).toString("base64url").slice(0, 32)}`,
        userId: session.id,
        ...body,
      },
    });
    return NextResponse.json({ subscription: sub }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, "POST /api/push/subscribe");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const { endpoint } = await parseJson(req, z.object({ endpoint: z.string().url() }));
    await prisma.pushSubscription.deleteMany({ where: { userId: session.id, endpoint } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err, "DELETE /api/push/subscribe");
  }
}
