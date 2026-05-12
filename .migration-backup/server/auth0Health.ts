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
 * deliberately invalid `authorization_code` request and classifies the
 * response. Only `invalid_grant` and `invalid_request` are treated as
 * healthy (the client is allowed to use authorization_code; the grant
 * just failed because the probe code is bogus). Every other error code
 * (`unauthorized_client`, `invalid_client`, `access_denied`, …) marks
 * Auth0 as unusable so that /api/auth/auth0 (and the social routes that
 * piggy-back on it) short-circuit to /?auth=unavailable instead of
 * bouncing the user to a broken Auth0 page.
 *
 * The probe is logged exactly once at boot. We never print client_id,
 * client_secret, or tenant URLs in full.
 */

// Error codes Auth0 returns from /oauth/token when our probe hits a healthy
// client — they all mean "the client IS allowed to use authorization_code,
// the grant just failed because the probe code/redirect_uri is bogus."
const HEALTHY_PROBE_ERRORS = new Set(["invalid_grant", "invalid_request"]);

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
 * Test-only: reset module state. Not exposed to runtime callers.
 */
export function __resetAuth0HealthForTests() {
  auth0Usable = true;
  lastReason = null;
  lastCheckedAt = null;
  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }
}

// Task #144: When Auth0 is marked unusable, poll the tenant periodically so
// that fixing the dashboard (e.g. enabling the Authorization Code grant)
// auto-recovers sign-in without requiring a server restart.
let recoveryTimer: ReturnType<typeof setInterval> | null = null;
const DEFAULT_RECOVERY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Start a background loop that re-probes Auth0 every `intervalMs` milliseconds
 * whenever `auth0Usable === false`. On a successful probe, sign-in flips back
 * to enabled and a single `[Auth0] Sign-in re-enabled` line is logged.
 *
 * Safe to call multiple times — subsequent calls are no-ops while a timer is
 * already running. The timer is `unref()`-ed so it never blocks process exit.
 */
export function startAuth0HealthRecoveryLoop(
  intervalMs: number = DEFAULT_RECOVERY_INTERVAL_MS,
): void {
  if (recoveryTimer) return;
  recoveryTimer = setInterval(async () => {
    if (auth0Usable) return; // Nothing to recover.
    const wasUsable = auth0Usable;
    try {
      await runAuth0HealthCheck();
    } catch (err: any) {
      console.warn(
        `[Auth0] Recovery probe threw (continuing): ${err?.message || err}`,
      );
      return;
    }
    if (!wasUsable && auth0Usable) {
      console.log(
        "[Auth0] Sign-in re-enabled — tenant config now accepts the authorization_code grant.",
      );
    }
  }, intervalMs);
  // Don't keep the event loop alive solely for this timer.
  if (typeof recoveryTimer.unref === "function") recoveryTimer.unref();
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
      `Auth0-mediated sign-in routes will redirect to /?auth=unavailable until the tenant config is fixed; ` +
      `the background health-recovery loop will re-enable sign-in automatically within ~5 minutes of the fix (no restart required).`,
  );
}

export async function runAuth0HealthCheck(): Promise<void> {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET;

  // If *no* Auth0 env vars are set, Auth0 isn't intended to be configured —
  // multiAuth.ts won't register the routes, so there's nothing to warn about.
  // But if some are set and others missing, that's a misconfiguration: the
  // sign-in buttons may render and then 404 / 500 at runtime. Surface a
  // clear warning and mark Auth0 unusable so guardAuth0 short-circuits to
  // /?auth=unavailable instead of bouncing users to a broken flow.
  const present: string[] = [];
  const missing: string[] = [];
  for (const [name, value] of [
    ["AUTH0_DOMAIN", domain],
    ["AUTH0_CLIENT_ID", clientId],
    ["AUTH0_CLIENT_SECRET", clientSecret],
  ] as const) {
    (value ? present : missing).push(name);
  }
  if (present.length === 0) {
    // Fully unconfigured — silent (multiAuth gates on these too).
    return;
  }
  if (missing.length > 0) {
    auth0Usable = false;
    lastReason = `missing env vars: ${missing.join(", ")}`;
    lastCheckedAt = Date.now();
    console.warn(
      `[Auth0] Sign-in is misconfigured: missing required env var(s) ${missing.join(", ")} ` +
        `(have ${present.join(", ")}). Set every Auth0 env var or unset all of them. ` +
        `Until then, /api/auth/auth0, /api/auth/facebook, and /api/auth/microsoft will ` +
        `redirect to /?auth=unavailable (the login modal shows a friendly toast).`,
    );
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

  // `invalid_grant` / `invalid_request` mean the client IS allowed to use
  // authorization_code — the grant just failed because the probe code is
  // bogus. That's the healthy outcome.
  if (errCode && HEALTHY_PROBE_ERRORS.has(errCode)) {
    auth0Usable = true;
    lastReason = null;
    console.log(
      "[Auth0] Health probe OK — sign-in client accepts authorization_code grant.",
    );
    return;
  }

  // Specific actionable misconfig: grant_type not allowed.
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

  // Specific actionable misconfig: client_id / client_secret rejected.
  if (errCode === "invalid_client") {
    auth0Usable = false;
    lastReason = body?.error_description || "invalid_client";
    console.warn(
      "[Auth0] Sign-in is misconfigured: Auth0 rejected AUTH0_CLIENT_ID / " +
        "AUTH0_CLIENT_SECRET (`invalid_client`). Verify the env vars match the " +
        "Regular Web Application in the Auth0 dashboard for tenant " +
        `"${domain}". Until fixed, /api/auth/auth0, /api/auth/facebook, and ` +
        "/api/auth/microsoft will redirect to /?auth=unavailable.",
    );
    return;
  }

  // Anything else from /oauth/token (access_denied, server_error, an HTTP
  // error code with no `error` field, …) is unexpected — be conservative and
  // mark Auth0 unusable so users get the friendly fallback rather than a
  // broken Auth0 page.
  auth0Usable = false;
  lastReason =
    errCode || (typeof body?.error_description === "string" ? body.error_description : null) ||
    "unexpected token endpoint response";
  console.warn(
    `[Auth0] Sign-in is unhealthy: token endpoint returned an unexpected response ` +
      `(${lastReason}). Auth0-mediated sign-in routes will redirect to /?auth=unavailable ` +
      `until the tenant config is fixed; the background health-recovery loop will ` +
      `re-enable sign-in automatically within ~5 minutes of the fix (no restart required).`,
  );
}
