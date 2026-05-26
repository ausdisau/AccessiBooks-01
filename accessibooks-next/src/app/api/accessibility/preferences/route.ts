import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleRouteError, parseJson } from "@/lib/zod";

const updateSchema = z.object({
  activePreset: z.string().optional(),
  reduceDistraction: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  dyslexiaFriendly: z.boolean().optional(),
  captionsPreferred: z.boolean().optional(),
  transcriptOpenByDefault: z.boolean().optional(),
  fontSizeScale: z.number().int().min(50).max(300).optional(),
  readingSpeed: z.number().int().min(25).max(400).optional(),
  colorMode: z.enum(["system", "light", "dark", "sepia"]).optional(),
  focusMode: z.boolean().optional(),
  symbolSupport: z.boolean().optional(),
  signLanguageEnabled: z.boolean().optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const prefs = await prisma.accessibilityPreferences.findUnique({
      where: { userId: session.id },
    });
    return NextResponse.json({ preferences: prefs });
  } catch (err) {
    return handleRouteError(err, "GET /api/accessibility/preferences");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await parseJson(req, updateSchema);
    const { profile, ...rest } = body;
    const profileJson = (profile ?? {}) as Prisma.InputJsonValue;
    const prefs = await prisma.accessibilityPreferences.upsert({
      where: { userId: session.id },
      update: {
        ...rest,
        ...(profile ? { profile: profileJson } : {}),
        syncedAt: new Date(),
      },
      create: {
        userId: session.id,
        ...rest,
        profile: profileJson,
        syncedAt: new Date(),
      },
    });
    return NextResponse.json({ preferences: prefs });
  } catch (err) {
    return handleRouteError(err, "PUT /api/accessibility/preferences");
  }
}
