/**
 * jwtAuth.ts — Bearer-token authentication middleware.
 *
 * Runs after passport.session(). If the request carries a valid
 * `Authorization: Bearer <jwt>` header AND the cookie session did not already
 * authenticate the user, we load the user from storage and attach it via
 * passport's req.login(..., { session: false }) so the rest of the codebase
 * (req.isAuthenticated(), req.user, requireAdmin, requireTier, etc.) keeps
 * working unchanged across all 125+ existing call sites.
 *
 * This is the stateless path that lets the API run on Vercel serverless
 * without a session store. Cookies still work as a fallback during the
 * migration window.
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { storage } from "./storage";
import { extractBearerToken, verifyAccessToken } from "./lib/jwt";

export function jwtAuthMiddleware(): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    // If cookie session already authenticated the user, leave it alone.
    if (typeof req.isAuthenticated === "function" && req.isAuthenticated()) {
      return next();
    }

    const token = extractBearerToken(req.headers.authorization);
    if (!token) return next();

    const payload = verifyAccessToken(token);
    if (!payload) return next();

    try {
      const user = await storage.getUser(payload.sub);
      if (!user) return next();

      // passport's req.login attaches user to the request and (with
      // session:false) skips the session write. Required so req.isAuthenticated()
      // returns true downstream without our middleware re-implementing
      // passport's internals.
      const logIn = (req as Request & {
        login?: (
          user: unknown,
          options: { session: boolean },
          done: (err?: unknown) => void,
        ) => void;
      }).login;
      if (typeof logIn === "function") {
        logIn.call(req, user, { session: false }, (err?: unknown) => {
          if (err) {
            // Non-fatal — proceed unauthenticated rather than 500.
            req.log?.warn?.({ err }, "[jwtAuth] req.login failed");
          }
          next();
        });
      } else {
        // Passport not initialised yet — set req.user directly as a fallback.
        (req as Request & { user?: unknown }).user = user;
        next();
      }
    } catch (err) {
      req.log?.warn?.({ err }, "[jwtAuth] storage.getUser failed");
      return next();
    }
  };
}
