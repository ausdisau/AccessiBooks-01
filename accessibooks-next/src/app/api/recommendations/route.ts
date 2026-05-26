import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { recommendForUser } from "@/lib/recommendation";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    const session = await requireSession();
    const recs = await recommendForUser(session.id);
    return NextResponse.json({ items: recs });
  } catch (err) {
    return handleRouteError(err, "GET /api/recommendations");
  }
}
