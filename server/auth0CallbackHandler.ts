/**
 * auth0CallbackHandler.ts — Express handler factory for the
 * /api/auth/callback/auth0 route (Task #145).
 *
 * The handler's contract — pinned by tests/auth0-callback-route.test.ts:
 *   - upstream `unauthorized_client` error → 302 /?auth=unavailable
 *     (and the auth0Health flag is flipped via markUnusable)
 *   - any other auth error with a known code → 302 /?auth=failed&reason=<code>
 *   - any other auth error with no code      → 302 /?auth=failed
 *   - !user (no error, no profile)    → 302 /?auth=failed&reason=no_profile
 *   - login session write failure     → 302 /?auth=failed&reason=session_error
 *   - success                         → 302 /
 */

import type { Request, RequestHandler, Response, NextFunction } from "express";
import { classifyAuth0CallbackError } from "./auth0CallbackClassifier";

export type PassportLikeUser = Record<string, unknown>;

export type Auth0AuthCallback = (
  err: unknown,
  user: PassportLikeUser | false | null,
) => void;

type LogInFn = (user: PassportLikeUser, done: (err?: unknown) => void) => void;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  return String(err);
}

/**
 * Whitelist of OAuth/Auth0 error codes we expose to the client UI.
 * Anything not on this list is dropped (rendered as a generic failure)
 * so we don't leak unexpected upstream strings into the URL bar.
 */
const KNOWN_REASON_CODES = new Set<string>([
  "access_denied",
  "invalid_grant",
  "invalid_request",
  "login_required",
  "consent_required",
  "interaction_required",
  "server_error",
  "temporarily_unavailable",
  "no_profile",
  "session_error",
]);

function failedRedirect(reason: string | null | undefined): string {
  if (reason && KNOWN_REASON_CODES.has(reason)) {
    return `/?auth=failed&reason=${encodeURIComponent(reason)}`;
  }
  return "/?auth=failed";
}

function getReqLogIn(req: Request): LogInFn | undefined {
  const candidate = (req as Request & { logIn?: unknown }).logIn;
  if (typeof candidate !== "function") return undefined;
  // IMPORTANT: passport's req.logIn relies on `this._sessionManager` to write
  // the user into the session. Calling it as a detached function (e.g.
  // `const fn = req.logIn; fn(user, done)`) loses `this`, which silently
  // skips the session write and still invokes `done()` with no error — the
  // callback then redirects the user "successfully" without a cookie. Bind
  // it to `req` so the session manager is reachable. Regression coverage:
  // tests/auth0-callback-success-flow.test.ts.
  return (candidate as (...args: unknown[]) => unknown).bind(req) as LogInFn;
}

export function makeAuth0CallbackHandler(deps: {
  authenticator: (cb: Auth0AuthCallback) => RequestHandler;
  markUnusable: (reason: string) => void;
  warn?: (...args: unknown[]) => void;
}): RequestHandler {
  const warn = deps.warn ?? ((...args: unknown[]) => console.warn(...args));

  return (req: Request, res: Response, next: NextFunction) => {
    const cb: Auth0AuthCallback = (err, user) => {
      if (err) {
        const classified = classifyAuth0CallbackError(err);
        if (classified.kind === "unauthorized_client") {
          deps.markUnusable(classified.reason);
          return res.redirect("/?auth=unavailable");
        }
        warn("[Auth0] Callback error:", classified.code ?? getErrorMessage(err));
        return res.redirect(failedRedirect(classified.code));
      }
      if (!user) return res.redirect(failedRedirect("no_profile"));

      const logIn = getReqLogIn(req);
      if (!logIn) {
        warn("[Auth0] req.logIn missing; cannot establish session");
        return res.redirect(failedRedirect("session_error"));
      }
      logIn(user, (loginErr) => {
        if (loginErr) {
          warn("[Auth0] Session login failed:", getErrorMessage(loginErr));
          return res.redirect(failedRedirect("session_error"));
        }
        return res.redirect("/");
      });
    };

    deps.authenticator(cb)(req, res, next);
  };
}
