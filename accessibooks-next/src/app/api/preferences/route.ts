import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, parseJson } from "@/lib/zod";

const updateSchema = z.object({
  favoriteGenres: z.array(z.string()).optional(),
  preferredContentTypes: z.array(z.string()).optional(),
  listeningHabit: z.string().optional(),
  onboardingCompleted: z.boolean().optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const prefs = await prisma.userPreferences.findUnique({ where: { userId: session.id } });
    return NextResponse.json({ preferences: prefs });
  } catch (err) {
    return handleRouteError(err, "GET /api/preferences");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await parseJson(req, updateSchema);
    const prefs = await prisma.userPreferences.upsert({
      where: { userId: session.id },
      update: body,
      create: { userId: session.id, ...body },
    });
    return NextResponse.json({ preferences: prefs });
  } catch (err) {
    return handleRouteError(err, "PUT /api/preferences");
  }
}
