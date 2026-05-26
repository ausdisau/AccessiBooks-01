/**
 * /api/auth/login — credentials sign-in shim.
 *
 * The legacy React modal POSTs `{ email, password }` here and expects the
 * user object (and a `token` field) on success. We delegate to NextAuth's
 * server-side signIn("credentials", …) so the auth cookie gets set and the
 * client receives the same HS256 JWT in the `token` field for its bearer
 * bootstrap.
 */
import { NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import { db } from "@/lib/serverDb";
import { users } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rateLimit";

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
  // Per-IP coarse limit (mirrors loginIpRateLimiter in api-server/src/auth.ts):
  // 20 attempts / 15 minutes.
  const ip = clientIp(request);
  const ipLimit = checkRateLimit({
    key: `login:ip:${ip}`,
    windowMs: 15 * 60 * 1000,
    limit: 20,
  });
  if (!ipLimit.ok) {
    return rateLimitResponse(
      ipLimit,
      "Too many login attempts. Please try again later.",
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
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

  // Per-identifier targeted limit (mirrors loginIdentifierRateLimiter):
  // 5 attempts / 15 minutes against a single account.
  const idLimit = checkRateLimit({
    key: `login:id:${email}`,
    windowMs: 15 * 60 * 1000,
    limit: 5,
  });
  if (!idLimit.ok) {
    return rateLimitResponse(
      idLimit,
      "Too many login attempts for this account. Please try again later.",
    );
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !user.passwordHash) {
    return NextResponse.json(
      { message: "Invalid email or password" },
      { status: 401 },
    );
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { message: "Invalid email or password" },
      { status: 401 },
    );
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (err) {
    console.error("[Login] signIn failed:", err);
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email ?? null },
    getJwtSecret(),
    { algorithm: "HS256", expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );
  const { passwordHash: _pw, ...rest } = user;
  return NextResponse.json({ ...rest, token });
}
