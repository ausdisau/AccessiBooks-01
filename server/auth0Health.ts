/**
 * auth0Health.ts — Boot-time Auth0 sanity check (Task #140)
 *
 * Auth0 returns `unauthorized_client: Grant type 'authorization_code' not
 * allowed for the client` when the application backing AUTH0_CLIENT_ID is not
 * configured to accept the Authorization Code grant — typically because the
 * env var was pointed at an M2M (machine-to-machine) application instead of a
 * Regular Web Application.
 *
 * This module probes the tenant's `/oauth/token` endpoint at boot with a
 * deliberately invalid `authorization_code` request:
 *   - `invalid_grant` (or `invalid_request`) → the client *is* allowed to use
 *     authorization_code; the grant just failed because the code is bogus.
 *     This is the healthy outcome.
 *   - `unauthorized_client` → the client is NOT allowed to use
 *     authorization_code. We cache this and short-circuit /api/auth/auth0
 *     so users see a friendly error instead of being bounced to a broken
 *     Auth0 page.
 *
 * The probe is logged exactly once at boot. We never print client_id,
 * client_secret, or tenant URLs in full.
 */

let auth0Usable = true;
let lastReason: string | null = null;
let lastCheckedAt: number | null = null;

export function isAuth0Usable(): boolean {
  return auth0Usable;
}

export function getAuth0HealthStatus() {
  return {
    usable: auth0Usable,
    reason: lastReason,
    checkedAt: lastCheckedAt,
  };
}

/**
 * Mark Auth0 unusable from outside (e.g. when the passport-auth0 callback
 * surfaces `unauthorized_client` at runtime — typically right after a tenant
 * config change). Idempotent and never throws.
 */
export function markAuth0Unusable(reason: string) {
  if (!auth0Usable && lastReason === reason) return;
  auth0Usable = false;
  lastReason = reason;
  lastCheckedAt = Date.now();
  console.warn(
    `[Auth0] Sign-in disabled at runtime: ${reason}. ` +
      `Auth0-mediated sign-in routes will redirect to /?auth=unavailable until the tenant config is fixed and the server restarts.`,
  );
}

export async function runAuth0HealthCheck(): Promise<void> {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) {
    // Auth0 isn't configured at all — leave the default `usable=true` alone;
    // the route registration in multiAuth.ts already gates on these env vars.
    return;
  }

  // Heads-up if the value collides with the M2M client (a common copy-paste
  // mistake). We compare without ever logging either id.
  const m2mId = process.env.AUTH0_M2M_CLIENT_ID;
  if (m2mId && m2mId === clientId) {
    console.warn(
      "[Auth0] AUTH0_CLIENT_ID is set to the same value as AUTH0_M2M_CLIENT_ID. " +
        "The web sign-in client must be a Regular Web Application, not an M2M client.",
    );
  }

  const tokenUrl = `https://${domain}/oauth/token`;
  let body: any = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code: "auth0-health-probe-invalid-code",
        redirect_uri: "https://example.invalid/callback",
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    body = await res.json().catch(() => ({}));
  } catch (err: any) {
    // Network failure — don't disable sign-in on a flaky probe; log and move on.
    console.warn(
      `[Auth0] Health probe could not reach ${tokenUrl}: ${err?.message || err}. ` +
        "Sign-in is left enabled; will retry on next restart.",
    );
    return;
  }

  const errCode = typeof body?.error === "string" ? body.error : null;
  lastCheckedAt = Date.now();

  if (errCode === "unauthorized_client") {
    auth0Usable = false;
    lastReason = body?.error_description || "unauthorized_client";
    console.warn(
      "[Auth0] Sign-in is misconfigured: the Auth0 application backing AUTH0_CLIENT_ID " +
        "does not allow the `authorization_code` grant. Open the Auth0 dashboard → " +
        "Applications → (your app) → Settings → Advanced Settings → Grant Types and " +
        "enable `Authorization Code`, OR repoint AUTH0_CLIENT_ID at a Regular Web " +
        "Application instead of an M2M client. Until then, /api/auth/auth0, " +
        "/api/auth/facebook, and /api/auth/microsoft will redirect to /?auth=unavailable " +
        "(the login modal shows a friendly toast).",
    );
    return;
  }

  // `invalid_grant`, `invalid_request`, etc. all mean the client IS allowed
  // to use authorization_code — the grant just failed because the probe
  // code is bogus. That's the healthy outcome.
  auth0Usable = true;
  lastReason = null;
  console.log("[Auth0] Health probe OK — sign-in client accepts authorization_code grant.");
}
