/**
 * auth0M2M.ts — Outbound machine-to-machine token helper.
 *
 * Use case: this backend needs to call another service that is protected by
 * Auth0. We exchange our M2M client_id/secret for an access token via the
 * `client_credentials` grant and cache it until shortly before expiry.
 *
 * Required env: AUTH0_DOMAIN, AUTH0_M2M_CLIENT_ID, AUTH0_M2M_CLIENT_SECRET.
 * The audience defaults to AUTH0_AUDIENCE but can be overridden per call.
 */

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

const cache = new Map<string, CachedToken>();
const SAFETY_WINDOW_MS = 60 * 1000; // refresh 60s before expiry

export interface GetM2MTokenOptions {
  /** Override the audience (defaults to AUTH0_AUDIENCE). */
  audience?: string;
  /** Optional space-separated scopes to request. */
  scope?: string;
  /** If true, ignore cache and force a fresh fetch. */
  forceRefresh?: boolean;
}

export interface M2MTokenResult {
  accessToken: string;
  expiresInSec: number;
  tokenType: string;
}

export async function getM2MToken(
  opts: GetM2MTokenOptions = {}
): Promise<M2MTokenResult> {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_M2M_CLIENT_ID;
  const clientSecret = process.env.AUTH0_M2M_CLIENT_SECRET;
  const audience = opts.audience ?? process.env.AUTH0_AUDIENCE;

  if (!domain || !clientId || !clientSecret || !audience) {
    throw new Error(
      "Auth0 M2M not configured: need AUTH0_DOMAIN, AUTH0_M2M_CLIENT_ID, AUTH0_M2M_CLIENT_SECRET, AUTH0_AUDIENCE"
    );
  }

  const cacheKey = `${audience}|${opts.scope ?? ""}`;
  if (!opts.forceRefresh) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAtMs > Date.now() + SAFETY_WINDOW_MS) {
      return {
        accessToken: hit.accessToken,
        expiresInSec: Math.max(0, Math.floor((hit.expiresAtMs - Date.now()) / 1000)),
        tokenType: "Bearer",
      };
    }
  }

  const body: Record<string, string> = {
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    audience,
  };
  if (opts.scope) body.scope = opts.scope;

  const resp = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Auth0 M2M token request failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
    scope?: string;
  };

  cache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAtMs: Date.now() + data.expires_in * 1000,
  });

  return {
    accessToken: data.access_token,
    expiresInSec: data.expires_in,
    tokenType: data.token_type ?? "Bearer",
  };
}

/** Test/diagnostic helper — returns true if M2M creds are present. */
export function isM2MConfigured(): boolean {
  return !!(
    process.env.AUTH0_DOMAIN &&
    process.env.AUTH0_M2M_CLIENT_ID &&
    process.env.AUTH0_M2M_CLIENT_SECRET &&
    process.env.AUTH0_AUDIENCE
  );
}

/** Test helper — clears the in-memory cache. */
export function clearM2MTokenCache(): void {
  cache.clear();
}
