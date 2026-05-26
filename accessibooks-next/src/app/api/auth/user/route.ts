import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ user: null }, { status: 200 });
    return NextResponse.json({ user: session });
  } catch (err) {
    return handleRouteError(err, "GET /api/auth/user");
  }
}
