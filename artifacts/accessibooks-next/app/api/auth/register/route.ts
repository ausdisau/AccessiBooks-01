/**
 * /api/auth/register — create a local account and sign in.
 *
 * Hashes the password with bcrypt and writes a new `users` row, then calls
 * NextAuth's server-side signIn to set the session cookie. Returns the user
 * (minus passwordHash) and a fresh HS256 JWT for the legacy bearer flow.
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { signIn } from "@/lib/auth";
import { db } from "@/lib/serverDb";
import { users } from "@workspace/db";
import { eq } from "drizzle-orm";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rateLimit";
import { logger, safeError } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET (or SESSION_SECRET) must be set in production");
  }
  return "development-jwt-secret-change-in-production";
}

export async function POST(request: Request) {
  // Per-IP coarse limit (mirrors registerIpRateLimiter in api-server/src/auth.ts):
  // 10 attempts / hour.
  const ip = clientIp(request);
  const ipLimit = checkRateLimit({
    key: `register:ip:${ip}`,
    windowMs: 60 * 60 * 1000,
    limit: 10,
  });
  if (!ipLimit.ok) {
    return rateLimitResponse(
      ipLimit,
      "Too many registration attempts. Please try again later.",
    );
  }

  let body: {
    email?: string;
    password?: string;
    firstName?: string | null;
    lastName?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  }
  const email = (body.email ?? "").toString().trim().toLowerCase();
  const password = (body.password ?? "").toString();
  if (!email || !password) {
    return NextResponse.json(
      { message: "Email and password are required" },
      { status: 400 },
    );
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    return NextResponse.json(
      { message: "Email already registered" },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [created] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      firstName: body.firstName ?? null,
      lastName: body.lastName ?? null,
      authProvider: "local",
    })
    .returning();

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (err) {
    logger.error({ err: safeError(err) }, "[Register] signIn after register failed");
  }

  const token = jwt.sign(
    { sub: created.id, email: created.email ?? null },
    getJwtSecret(),
    { algorithm: "HS256", expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );
  const { passwordHash: _pw, ...rest } = created;
  return NextResponse.json({ ...rest, token });
}
