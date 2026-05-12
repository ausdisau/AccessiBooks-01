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
 *     - if req.session.destroy errors (e.g. session-store outage), STILL
 *       responds with the redirect AND clears the session cookie on the
 *       response so the browser doesn't keep presenting a cookie that
 *       points at a still-valid server-side session row (Task #150).
 *
 *   POST /api/auth/logout
 *     - always calls req.logout + req.session.destroy
 *     - returns JSON { message, logoutUrl? } where logoutUrl is set only for
 *       Auth0-provider users with the env vars configured
 *     - if req.logout itself errors, returns 500 JSON
 *     - if req.session.destroy errors, STILL responds 200 AND clears the
 *       session cookie (Task #150).
 */

import type { CookieOptions, Request, RequestHandler, Response } from "express";

export interface Auth0LogoutOptions {
  /** AUTH0_DOMAIN (e.g. "tenant.us.auth0.com"). When falsy, the Auth0 logout URL is suppressed. */
  auth0Domain?: string | null;
  /** AUTH0_CLIENT_ID. When falsy, the Auth0 logout URL is suppressed. */
  auth0ClientId?: string | null;
  /** APP_URL (already trimmed of trailing slash). When null, the request's protocol+host is used. */
  appUrl?: string | null;
  /** Optional logger (defaults to console.error). */
  errorLog?: (msg: string, err: unknown) => void;
  /**
   * Name of the session cookie to clear when session.destroy fails.
   * Defaults to "connect.sid" (the express-session default).
   */
  sessionCookieName?: string;
  /**
   * Cookie options to pass to res.clearCookie, mirroring the options used
   * by the session middleware (path/domain/secure/sameSite/httpOnly).
   * Browsers will only clear a cookie if the attributes line up, so this
   * MUST match the session middleware's `cookie` config.
   */
  sessionCookieOptions?: CookieOptions;
}

const DEFAULT_SESSION_COOKIE_NAME = "connect.sid";

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

/**
 * Clear the session cookie on the response so that, even if the server-side
 * session row failed to delete, the browser will stop presenting the cookie
 * on subsequent requests. This is the second line of defense behind
 * req.session.destroy and is what makes a partially-failed logout still
 * actually log the user out (Task #150).
 */
function clearSessionCookie(res: Response, opts: Auth0LogoutOptions): void {
  const name = opts.sessionCookieName ?? DEFAULT_SESSION_COOKIE_NAME;
  // Browsers only honor clearCookie when the cookie attributes line up
  // with the originally-set cookie. We deliberately omit `maxAge` — the
  // clearing semantics already set Expires in the past — but pass through
  // path/domain/secure/sameSite/httpOnly from the session middleware.
  if (opts.sessionCookieOptions) {
    const { maxAge: _omitMaxAge, expires: _omitExpires, ...rest } =
      opts.sessionCookieOptions;
    res.clearCookie(name, rest);
  } else {
    res.clearCookie(name);
  }
}

export function makeAuth0LogoutGetHandler(
  opts: Auth0LogoutOptions,
): RequestHandler {
  const errorLog = opts.errorLog ?? ((msg, err) => console.error(msg, err));
  return (req, res) => {
    const auth0LogoutUrl = buildAuth0LogoutUrl(req, opts);
    req.logout((err) => {
      if (err) {
        errorLog("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      req.session.destroy((sessErr) => {
        if (sessErr) {
          errorLog("Session destroy error:", sessErr);
          // Belt-and-braces: tell the browser to drop the cookie even
          // though the server-side row may still exist. Without this the
          // user walks away with a still-valid session cookie.
          clearSessionCookie(res, opts);
        }
        res.redirect(auth0LogoutUrl ?? "/");
      });
    });
  };
}

export function makeAuth0LogoutPostHandler(
  opts: Auth0LogoutOptions,
): RequestHandler {
  const errorLog = opts.errorLog ?? ((msg, err) => console.error(msg, err));
  return (req, res) => {
    const auth0LogoutUrl = buildAuth0LogoutUrl(req, opts);
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      req.session.destroy((sessErr) => {
        if (sessErr) {
          errorLog("Session destroy error:", sessErr);
          clearSessionCookie(res, opts);
        }
        res.json({
          message: "Logged out",
          ...(auth0LogoutUrl ? { logoutUrl: auth0LogoutUrl } : {}),
        });
      });
    });
  };
}
