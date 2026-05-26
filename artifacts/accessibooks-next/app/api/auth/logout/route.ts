/**
 * /api/auth/logout — clear the NextAuth session cookie.
 *
 * Mirrors the legacy server's POST /api/auth/logout shape: returns JSON so
 * the SPA can react before navigating. If the session was Auth0-backed, we
 * also surface the Auth0 logout URL so the client can chase it and clear
 * the Auth0 SSO cookie (otherwise the next visit silently re-authenticates).
 *
 * GET /api/logout is preserved by the existing AppHeader; it navigates the
 * browser here via window.location.href, so we accept GET too and redirect.
 */
import { NextResponse } from "next/server";
import { auth, signOut } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function basePath(): string {
  return (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
}

function auth0LogoutUrl(returnTo: string): string | null {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  if (!domain || !clientId) return null;
  const issuer = domain.startsWith("http") ? domain : `https://${domain}`;
  const params = new URLSearchParams({ client_id: clientId, returnTo });
  return `${issuer}/v2/logout?${params.toString()}`;
}

export async function POST(request: Request) {
  const session = await auth();
  await signOut({ redirect: false });
  const returnTo =
    process.env.APP_URL?.replace(/\/$/, "") ??
    new URL(request.url).origin.replace(/\/$/, "");
  const isAuth0 = ((session?.user as { id?: string } | undefined)?.id ?? "")
    .startsWith("auth0-");
  const redirectTo = isAuth0
    ? auth0LogoutUrl(`${returnTo}${basePath()}/`) ?? `${basePath()}/`
    : `${basePath()}/`;
  return NextResponse.json({ message: "Logged out", redirectTo });
}

export async function GET(request: Request) {
  const session = await auth();
  await signOut({ redirect: false });
  const url = new URL(request.url);
  const returnTo = `${url.origin}${basePath()}/`;
  const isAuth0 = ((session?.user as { id?: string } | undefined)?.id ?? "")
    .startsWith("auth0-");
  const target = isAuth0 ? auth0LogoutUrl(returnTo) ?? returnTo : returnTo;
  return NextResponse.redirect(target);
}
