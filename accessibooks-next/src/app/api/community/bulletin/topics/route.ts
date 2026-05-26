import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    const items = await prisma.bulletinTopic.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err, "GET /api/community/bulletin/topics");
  }
}
