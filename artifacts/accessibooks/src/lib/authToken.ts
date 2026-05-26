/**
 * authToken.ts — client-side JWT storage and bootstrap.
 *
 * Holds the access token returned by /api/auth/login, /api/auth/register, and
 * the OAuth/magic-link redirect flows (where the token arrives in the URL
 * fragment as `#token=...`). All requests through queryClient.ts send this
 * token via `Authorization: Bearer <jwt>`.
 *
 * Storage choice: localStorage. The JWT is bearer-equivalent to a session
 * cookie and is intentionally accessible to JS so React can attach it to
 * fetch headers. XSS is the threat model in both cases; the project's CSP
 * and React's escaping are the primary defenses.
 */
const TOKEN_KEY = "accessibooks_auth_token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage disabled (private mode) — degrade to cookie-only */
  }
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Read a `#token=...` fragment that the server sets on OAuth / magic-link
 * redirects, persist it, and strip it from the URL so it doesn't linger in
 * the address bar or get bookmarked. Safe to call on every app boot.
 */
export function consumeTokenFromUrlHash(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return false;
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get("token");
  if (!token) return false;
  setAuthToken(token);
  params.delete("token");
  const remaining = params.toString();
  const newHash = remaining ? `#${remaining}` : "";
  try {
    window.history.replaceState(
      {},
      "",
      window.location.pathname + window.location.search + newHash,
    );
  } catch {
    /* replaceState unavailable — leave URL as is */
  }
  return true;
}
