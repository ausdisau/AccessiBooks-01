/**
 * auth0LogoutHandlers.ts — Express handler factories for the logout routes
 * (Task #149).
 *
 * Extracted from server/multiAuth.ts so the URL-building + session-destroying
 * pipeline can be exercised end-to-end by tests/auth0-logout-flow.test.ts
 * without having to boot the full multiAuth wiring.
 *
 * The handlers' contract — pinned by the test:
 *   GET  /api/logout
 *     - always calls req.logout + req.session.destroy
 *     - for Auth0 users with AUTH0_DOMAIN + AUTH0_CLIENT_ID set, 302s to
 *       https://<domain>/v2/logout?client_id=...&returnTo=<APP_URL or origin>
 *     - otherwise 302s to "/"
 *     - if req.logout itself errors, returns 500 JSON
 *
 *   POST /api/auth/logout
 *     - always calls req.logout + req.session.destroy
 *     - returns JSON { message, logoutUrl? } where logoutUrl is set only for
 *       Auth0-provider users with the env vars configured
 *     - if req.logout itself errors, returns 500 JSON
 */

import type { Request, RequestHandler } from "express";

export interface Auth0LogoutOptions {
  /** AUTH0_DOMAIN (e.g. "tenant.us.auth0.com"). When falsy, the Auth0 logout URL is suppressed. */
  auth0Domain?: string | null;
  /** AUTH0_CLIENT_ID. When falsy, the Auth0 logout URL is suppressed. */
  auth0ClientId?: string | null;
  /** APP_URL (already trimmed of trailing slash). When null, the request's protocol+host is used. */
  appUrl?: string | null;
  /** Optional logger (defaults to console.error). */
  errorLog?: (msg: string, err: unknown) => void;
}

/**
 * Build the Auth0 /v2/logout URL for a request, or null if the user is not an
 * Auth0-provider user or the env vars aren't configured.
 *
 * Exported for direct testing — the routes use the same function.
 */
export function buildAuth0LogoutUrl(
  req: Request,
  opts: Auth0LogoutOptions,
): string | null {
  const user = req.user as { authProvider?: string } | undefined;
  const isAuth0User = user?.authProvider === "auth0";
  const { auth0Domain, auth0ClientId, appUrl } = opts;
  if (!isAuth0User || !auth0Domain || !auth0ClientId) return null;
  const returnTo = appUrl || `${req.protocol}://${req.get("host")}`;
  const url = new URL(`https://${auth0Domain}/v2/logout`);
  url.searchParams.set("client_id", auth0ClientId);
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

export function makeAuth0LogoutGetHandler(opts: Auth0LogoutOptions): RequestHandler {
  const errorLog = opts.errorLog ?? ((msg, err) => console.error(msg, err));
  return (req, res) => {
    const auth0LogoutUrl = buildAuth0LogoutUrl(req, opts);
    req.logout((err) => {
      if (err) {
        errorLog("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      req.session.destroy((sessErr) => {
        if (sessErr) errorLog("Session destroy error:", sessErr);
        res.redirect(auth0LogoutUrl ?? "/");
      });
    });
  };
}

export function makeAuth0LogoutPostHandler(opts: Auth0LogoutOptions): RequestHandler {
  return (req, res) => {
    const auth0LogoutUrl = buildAuth0LogoutUrl(req, opts);
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      req.session.destroy(() => {
        res.json({
          message: "Logged out",
          ...(auth0LogoutUrl ? { logoutUrl: auth0LogoutUrl } : {}),
        });
      });
    });
  };
}
