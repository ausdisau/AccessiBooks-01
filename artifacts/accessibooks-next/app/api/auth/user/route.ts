/**
 * /api/auth/user — return the current user row, or 401 if no session.
 *
 * Reads the session via NextAuth's `auth()`, then loads the full DB row so
 * the React client gets fields like subscriptionTier and role that aren't in
 * the JWT.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/serverDb";
import { users } from "@workspace/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { passwordHash: _pw, ...rest } = user;
  return NextResponse.json(rest);
}
