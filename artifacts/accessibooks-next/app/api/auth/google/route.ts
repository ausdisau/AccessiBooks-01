/**
 * Legacy /api/auth/google alias.
 *
 * Redirects to NextAuth's canonical signin URL and asks NextAuth to bounce
 * back through /api/auth/token-handoff after the OAuth dance so the React
 * client receives the legacy `#token=<jwt>` URL-fragment bootstrap.
 */
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

function basePath(): string {
  return (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const base = basePath();
  const handoff = `${base}/api/auth/token-handoff?next=/`;
  return NextResponse.redirect(
    `${url.origin}${base}/api/auth/signin/google?callbackUrl=${encodeURIComponent(handoff)}`,
  );
}
