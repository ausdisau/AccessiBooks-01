import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, parseJson } from "@/lib/zod";

const schema = z.object({
  endpoint: z.string().url(),
  enabledTypes: z.array(z.string()),
});

export async function GET() {
  try {
    const session = await requireSession();
    const items = await prisma.pushSubscription.findMany({ where: { userId: session.id } });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/push/preferences");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession();
    const { endpoint, enabledTypes } = await parseJson(req, schema);
    const result = await prisma.pushSubscription.updateMany({
      where: { userId: session.id, endpoint },
      data: { enabledTypes },
    });
    return NextResponse.json({ updated: result.count });
  } catch (err) {
    return handleRouteError(err, "PUT /api/push/preferences");
  }
}
