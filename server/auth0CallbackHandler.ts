/**
 * auth0CallbackHandler.ts — Express handler factory for the
 * /api/auth/callback/auth0 route (Task #145).
 *
 * Extracted from server/multiAuth.ts so it can be exercised by
 * route-level tests with a stubbed passport authenticator. The real
 * production wiring lives in server/multiAuth.ts and passes
 * `passport.authenticate("auth0", cb)` as the `authenticator`.
 *
 * The handler's contract — pinned by tests/auth0-callback-route.test.ts:
 *   - upstream `unauthorized_client` error → 302 /?auth=unavailable
 *     (and the auth0Health flag is flipped via markUnusable)
 *   - any other auth error             → 302 /?auth=failed
 *   - !user (no error, no profile)    → 302 /?auth=failed
 *   - login session write failure     → 302 /?auth=failed
 *   - success                         → 302 /
 */

import type { Request, RequestHandler, Response, NextFunction } from "express";
import { classifyAuth0CallbackError } from "./auth0CallbackClassifier";

export type PassportLikeUser = { id?: string | number } & Record<string, unknown>;

export type Auth0AuthCallback = (
  err: unknown,
  user: PassportLikeUser | false | null,
) => void;

/**
 * Builds an Express handler that drives a passport "auth0" custom
 * callback and maps every outcome to one of the documented redirects.
 */
export function makeAuth0CallbackHandler(deps: {
  /**
   * Returns an Express middleware that invokes the supplied callback
   * with `(err, user)` exactly the way `passport.authenticate("auth0", cb)`
   * does. Injectable so tests can drive the branches without spinning
   * up a real Auth0 strategy.
   */
  authenticator: (cb: Auth0AuthCallback) => RequestHandler;
  /**
   * Side effect to mark Auth0 unusable when we detect the
   * `unauthorized_client` grant misconfig. Injectable so tests can
   * observe it without touching real module state.
   */
  markUnusable: (reason: string) => void;
  /**
   * Optional logger for non-friendly errors (the production code uses
   * console.warn). Tests pass a no-op to keep output clean.
   */
  warn?: (...args: unknown[]) => void;
}): RequestHandler {
  const warn = deps.warn ?? ((...args) => console.warn(...args));

  return (req: Request, res: Response, next: NextFunction) => {
    const cb: Auth0AuthCallback = (err, user) => {
      if (err) {
        const classified = classifyAuth0CallbackError(err);
        if (classified.kind === "unauthorized_client") {
          deps.markUnusable(classified.reason);
          return res.redirect("/?auth=unavailable");
        }
        warn(
          "[Auth0] Callback error:",
          classified.code || (err as any)?.message || err,
        );
        return res.redirect("/?auth=failed");
      }
      if (!user) return res.redirect("/?auth=failed");
      // req.logIn is provided by passport's request extension; in real
      // usage it always exists. In tests that exercise the success path
      // we install a minimal stub on the request.
      const logIn = (req as any).logIn as
        | ((u: PassportLikeUser, done: (err?: unknown) => void) => void)
        | undefined;
      if (!logIn) {
        warn("[Auth0] req.logIn missing; cannot establish session");
        return res.redirect("/?auth=failed");
      }
      logIn(user as PassportLikeUser, (loginErr) => {
        if (loginErr) {
          warn("[Auth0] Session login failed:", (loginErr as any)?.message || loginErr);
          return res.redirect("/?auth=failed");
        }
        return res.redirect("/");
      });
    };

    deps.authenticator(cb)(req, res, next);
  };
}
