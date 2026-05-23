import * as oidc from "openid-client";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCurrentAuthUserResponse,
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  LogoutMobileSessionResponse,
} from "@workspace/api-zod";
import type { AuthUser } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
} from "../lib/auth";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

// Path under which this router is mounted in src/index.ts:
//   app.use("/api/replit-auth", authRouter)
// All redirects and callback URLs below use this prefix.
const MOUNT_PATH = "/api/replit-auth";

const router: IRouter = Router();

// Allowlist of trusted app origins for OIDC redirect_uri / post_logout
// redirects. Sourced from REPLIT_DOMAINS (comma-separated published
// production domains) and REPLIT_DEV_DOMAIN (the current dev domain), with
// a localhost fallback for local boot. Anything not on this list is
// rejected to prevent host/forwarded-header spoofing.
function getAllowedOrigins(): string[] {
  const origins = new Set<string>();
  const replitDomains = process.env["REPLIT_DOMAINS"];
  if (replitDomains) {
    for (const d of replitDomains.split(",")) {
      const trimmed = d.trim();
      if (trimmed) origins.add(`https://${trimmed}`);
    }
  }
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) origins.add(`https://${devDomain}`);
  if (origins.size === 0) origins.add("http://localhost");
  return Array.from(origins);
}

function getOrigin(req: Request): string {
  const allowed = getAllowedOrigins();
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  if (typeof host === "string") {
    const candidate = `${proto}://${host}`;
    if (allowed.includes(candidate)) return candidate;
  }
  // Header didn't match the allowlist — fall back to the first trusted
  // origin (typically the published production domain).
  return allowed[0]!;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/";
  }
  return value;
}

async function upsertUser(claims: Record<string, unknown>): Promise<AuthUser> {
  const id = claims.sub as string;
  const email = (claims.email as string) || null;
  const firstName = (claims.first_name as string) || null;
  const lastName = (claims.last_name as string) || null;
  const profileImageUrl =
    ((claims.profile_image_url as string) ||
      (claims.picture as string) ||
      null) as string | null;

  // The existing `users` table has many extra columns (subscription_tier,
  // stripe ids, etc.) that are NOT part of the Replit Auth claims. We only
  // upsert the OIDC-derived fields and let the DB defaults populate the
  // rest on insert.
  const [row] = await db
    .insert(usersTable)
    .values({
      id,
      email,
      firstName,
      lastName,
      profileImageUrl,
      authProvider: "replit",
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        email,
        firstName,
        lastName,
        profileImageUrl,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      profileImageUrl: usersTable.profileImageUrl,
    });

  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    profileImageUrl: row.profileImageUrl,
  };
}

router.get("/user", (req: Request, res: Response) => {
  // Only return a user when authMiddleware validated a Replit Auth session
  // for this request (replitAuthValidated flag). Header/cookie *presence*
  // is not sufficient — a stale Passport req.user must not leak here.
  const validated = (req as Request & { replitAuthValidated?: boolean })
    .replitAuthValidated;
  const user = validated && req.user
    ? (req.user as unknown as AuthUser)
    : null;
  res.json(GetCurrentAuthUserResponse.parse({ user }));
});

router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}${MOUNT_PATH}/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}${MOUNT_PATH}/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect(`${MOUNT_PATH}/login`);
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch (err) {
    req.log.error({ err }, "[ReplitAuth] callback exchange failed");
    res.redirect(`${MOUNT_PATH}/login`);
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect(`${MOUNT_PATH}/login`);
    return;
  }

  const dbUser = await upsertUser(
    claims as unknown as Record<string, unknown>,
  );

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: dbUser,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

router.get("/logout", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const origin = getOrigin(req);

  const sid = getSessionId(req);
  await clearSession(res, sid);

  // Also tear down any active Passport session so users who used both
  // systems are fully logged out from a single click.
  if (typeof req.logout === "function") {
    await new Promise<void>((resolve) => {
      try {
        req.logout(() => resolve());
      } catch {
        resolve();
      }
    });
  }

  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: origin,
  });

  res.redirect(endSessionUrl.href);
});

// Mobile redirect_uri must be an Expo / native app URI (custom scheme or
// expo proxy). Disallow http(s):// to prevent the mobile token-exchange
// route from being abused as an open redirect-style code exchange for
// arbitrary web origins.
function isAllowedMobileRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    // expo Go / dev client (custom URL scheme) — e.g. "accessibooks://..."
    // or expo dev-client URI such as "exp://..."
    if (u.protocol === "exp:" || u.protocol === "accessibooks:") return true;
    // expo auth proxy
    if (
      (u.protocol === "https:" || u.protocol === "http:") &&
      (u.hostname === "auth.expo.io" || u.hostname.endsWith(".expo.io"))
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Missing or invalid required parameters" });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    if (!isAllowedMobileRedirectUri(redirect_uri)) {
      res.status(400).json({ error: "redirect_uri not allowed" });
      return;
    }

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("iss", ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: "No claims in ID token" });
        return;
      }

      const dbUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: dbUser,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      req.log.error({ err }, "Mobile token exchange error");
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;
