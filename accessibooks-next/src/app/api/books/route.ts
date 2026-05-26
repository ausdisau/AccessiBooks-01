import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleRouteError, parseQuery } from "@/lib/zod";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  genre: z.string().optional(),
  contentType: z.string().optional(),
  source: z.string().optional(),
  language: z.string().optional(),
  premium: z.enum(["true", "false"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const q = parseQuery(req, querySchema);
    const where = {
      ...(q.genre ? { genre: q.genre } : {}),
      ...(q.contentType ? { contentType: q.contentType } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(q.language ? { language: q.language } : {}),
      ...(q.premium ? { isPremium: q.premium === "true" } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.book.findMany({
        where,
        take: q.limit,
        skip: q.offset,
        orderBy: { title: "asc" },
      }),
      prisma.book.count({ where }),
    ]);
    return NextResponse.json({ items, total, limit: q.limit, offset: q.offset });
  } catch (err) {
    return handleRouteError(err, "GET /api/books");
  }
}
