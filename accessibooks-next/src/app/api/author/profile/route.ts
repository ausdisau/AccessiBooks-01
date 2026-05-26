import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, parseJson } from "@/lib/zod";

const upsertSchema = z.object({
  displayName: z.string().min(1).max(120),
  bio: z.string().max(2000).optional(),
  website: z.string().url().optional(),
  profileImage: z.string().url().optional(),
  socialLinks: z.record(z.string(), z.string()).optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const profile = await prisma.authorProfile.findUnique({ where: { userId: session.id } });
    return NextResponse.json({ profile });
  } catch (err) {
    return handleRouteError(err, "GET /api/author/profile");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await parseJson(req, upsertSchema);
    const profile = await prisma.authorProfile.upsert({
      where: { userId: session.id },
      update: { ...body },
      create: { userId: session.id, ...body },
    });
    return NextResponse.json({ profile });
  } catch (err) {
    return handleRouteError(err, "PUT /api/author/profile");
  }
}
