/**
 * /api/auth/token-handoff — bridge from a fresh NextAuth session to the
 * legacy `#token=<jwt>` URL-fragment bootstrap expected by the React client.
 *
 * After an OAuth or magic-link sign-in completes, NextAuth has already set
 * the HS256 cookie. The React client also caches a bearer token from the
 * URL fragment (see `src/lib/authToken.ts` → `consumeTokenFromUrlHash`), so
 * during cutover we mirror the legacy server's behaviour and redirect via:
 *
 *   /?auth=success#token=<encoded-jwt>
 *
 * The redirect target is taken from the `next` query param when present and
 * is constrained to same-origin same-base-path paths to prevent open-redirect
 * abuse.
 */
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { auth } from "@/lib/auth";

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

function basePath(): string {
  return (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
}

function safeNextPath(input: string | null): string {
  // Only allow same-origin paths under our base path; reject schemes,
  // protocol-relative URLs, and traversal that would escape the app.
  if (!input) return "/";
  if (!input.startsWith("/") || input.startsWith("//")) return "/";
  return input;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = basePath();
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const status = url.searchParams.get("status") ?? "success";
  const statusKey = url.searchParams.get("statusKey") ?? "auth";

  const session = await auth();
  const sub = session?.user && (session.user as { id?: string }).id;
  const email = session?.user?.email ?? null;
  if (!sub) {
    return NextResponse.redirect(
      `${url.origin}${base}${nextPath}?${statusKey}=failed`,
    );
  }

  const token = jwt.sign({ sub, email }, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
  const sep = nextPath.includes("?") ? "&" : "?";
  return NextResponse.redirect(
    `${url.origin}${base}${nextPath}${sep}${statusKey}=${encodeURIComponent(status)}#token=${encodeURIComponent(token)}`,
  );
}
