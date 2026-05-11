/**
 * auth0CallbackHandler.ts — Express handler factory for the
 * /api/auth/callback/auth0 route (Task #145).
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

function getReqLogIn(req: Request): LogInFn | undefined {
  const candidate = (req as Request & { logIn?: unknown }).logIn;
  return typeof candidate === "function"
    ? (candidate as unknown as LogInFn)
    : undefined;
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
        return res.redirect("/?auth=failed");
      }
      if (!user) return res.redirect("/?auth=failed");

      const logIn = getReqLogIn(req);
      if (!logIn) {
        warn("[Auth0] req.logIn missing; cannot establish session");
        return res.redirect("/?auth=failed");
      }
      logIn(user, (loginErr) => {
        if (loginErr) {
          warn("[Auth0] Session login failed:", getErrorMessage(loginErr));
          return res.redirect("/?auth=failed");
        }
        return res.redirect("/");
      });
    };

    deps.authenticator(cb)(req, res, next);
  };
}
