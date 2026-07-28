/**
 * /api/auth/magic-link/verify — consume a magic-link token and start a session.
 *
 * The link in the email points here. We validate the HMAC token, then call
 * NextAuth's server-side signIn() with the "magic-link" credentials provider
 * to upsert the user and write the auth cookie. On success we redirect with
 * the same `#token=<jwt>` URL fragment the legacy server used so stateless
 * clients (the React app's bearer-token bootstrap) keep working unchanged.
 */
import { NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import { verifyMagicToken } from "@/lib/magicLink";
import { logger, safeError } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function basePath(): string {
  return (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const base = basePath();
  if (!token) {
    return NextResponse.redirect(`${url.origin}${base}/?magic=invalid`);
  }
  const result = verifyMagicToken(token);
  if (!result) {
    // Same UX as the legacy server: treat invalid + expired the same since
    // "expired" is the more common cause and the friendlier label.
    return NextResponse.redirect(`${url.origin}${base}/?magic=expired`);
  }

  try {
    // signIn with redirect:false writes the auth cookie onto the response
    // that NextAuth returns. We then bounce through /api/auth/token-handoff
    // so the legacy `#token=<jwt>` URL-fragment bootstrap fires for the
    // React client (see src/lib/authToken.ts → consumeTokenFromUrlHash).
    await signIn("magic-link", { token, redirect: false });
  } catch (err) {
    logger.error({ err: safeError(err) }, "[MagicLink] signIn failed");
    return NextResponse.redirect(`${url.origin}${base}/?magic=error`);
  }
  return NextResponse.redirect(
    `${url.origin}${base}/api/auth/token-handoff?next=/&statusKey=magic&status=success`,
  );
}
