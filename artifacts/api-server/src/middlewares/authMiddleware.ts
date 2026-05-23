import * as oidc from "openid-client";
import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  updateSession,
  SESSION_COOKIE,
  type SessionData,
} from "../lib/auth";

// NOTE: We intentionally do NOT augment Express.User or Express.Request here.
// The existing Passport-based auth (multiAuth.ts) populates `req.user` with a
// much richer shape (subscription tier, stripe IDs, role, etc.). Augmenting
// the global type to `AuthUser` here would conflict with that and break the
// rest of the codebase. Replit Auth route handlers cast through `unknown`
// when they need the narrow AuthUser shape.

export type ReplitAuthRequest = Request & { user: AuthUser };

async function refreshIfExpired(
  sid: string,
  session: SessionData,
): Promise<SessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;

  if (!session.refresh_token) return null;

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(
      config,
      session.refresh_token,
    );
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expires_at;
    await updateSession(sid, session);
    return session;
  } catch {
    return null;
  }
}

/**
 * Loads the Replit Auth user from a SID cookie/bearer into `req.user` if a
 * valid session exists. Otherwise it leaves the request untouched so the
 * existing Passport middleware (registered later in setupMultiAuth) can take
 * over for traditional session-cookie auth.
 *
 * Only reads/writes the dedicated `replit_sid` cookie, never `connect.sid`,
 * so the two auth systems stay isolated.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Skip entirely when no replit_sid is present — Passport handles the rest.
  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  // Only treat a cookie-based SID as a Replit session; an Authorization
  // bearer header could belong to other services. We still allow bearer for
  // the mobile flow but only when there's no other auth already set.
  const fromCookie = req.cookies?.[SESSION_COOKIE];
  if (!fromCookie && req.user) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    if (fromCookie) await clearSession(res, sid);
    next();
    return;
  }

  const refreshed = await refreshIfExpired(sid, session);
  if (!refreshed) {
    if (fromCookie) await clearSession(res, sid);
    next();
    return;
  }

  // Cast through unknown: req.user's global type is the rich Passport User.
  (req as unknown as { user: AuthUser }).user = refreshed.user;
  // Flag the request so /replit-auth/user can distinguish a validated
  // Replit session from a Passport session that just happens to have
  // populated req.user.
  (req as Request & { replitAuthValidated?: boolean }).replitAuthValidated =
    true;

  // Patch isAuthenticated to reflect the Replit session. Passport may have
  // already patched it; whichever ran last wins, but both semantics agree
  // (req.user != null ⇒ authenticated).
  const isAuthed = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];
  req.isAuthenticated = isAuthed;

  next();
}
