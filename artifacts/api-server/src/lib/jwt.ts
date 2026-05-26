/**
 * jwt.ts — HS256 access tokens for the AccessiBooks API.
 *
 * These are the stateless replacement for the express-session cookie. A token
 * is issued whenever the user successfully authenticates (local login,
 * register, magic-link, OAuth callback) and contains just the user id; the
 * full user is reloaded from storage on every request by jwtAuth middleware.
 *
 * Secret resolution mirrors the existing SESSION_SECRET pattern: required in
 * production, with a loud-but-non-fatal dev fallback so local boot doesn't
 * regress.
 */
import jwt, { type SignOptions } from "jsonwebtoken";

export const ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface AccessTokenPayload {
  sub: string; // user id
  email?: string | null;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET (or SESSION_SECRET) must be set in production");
  }
  console.warn(
    "[WARN] JWT_SECRET/SESSION_SECRET not set — using insecure default. Set this before deploying.",
  );
  return "development-jwt-secret-change-in-production";
}

export function signAccessToken(
  user: { id: string; email?: string | null },
  options: { ttlSeconds?: number } = {},
): string {
  const payload: AccessTokenPayload = {
    sub: String(user.id),
    email: user.email ?? null,
  };
  const signOpts: SignOptions = {
    algorithm: "HS256",
    expiresIn: options.ttlSeconds ?? ACCESS_TOKEN_TTL_SECONDS,
  };
  return jwt.sign(payload, getJwtSecret(), signOpts);
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    });
    if (!decoded || typeof decoded !== "object") return null;
    const sub = (decoded as { sub?: unknown }).sub;
    if (typeof sub !== "string" || !sub) return null;
    const email = (decoded as { email?: unknown }).email;
    return {
      sub,
      email: typeof email === "string" ? email : null,
    };
  } catch {
    return null;
  }
}

/**
 * Extract the bearer token from an `Authorization: Bearer <jwt>` header.
 * Returns null if the header is missing or not a Bearer scheme.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1].trim() : null;
}
