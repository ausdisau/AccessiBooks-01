/**
 * auth.ts — Auth.js v5 (NextAuth) configuration for the Next.js site.
 *
 * Replaces the bespoke Passport + custom JWT layer that lives in the legacy
 * Express api-server. The Express server stays in place for the mobile app
 * and during the cutover window; this file is the canonical auth surface
 * for everything served from the Next.js site.
 *
 * Six providers are wired here:
 *   1. credentials  — email/password (bcrypt against `users.passwordHash`)
 *   2. auth0        — Auth0 Universal Login (DB connection)
 *   3. google       — direct Google OAuth via Auth.js's Google provider
 *   4. facebook     — Auth0 social connection (matches the live setup)
 *   5. microsoft    — Auth0 social connection (matches the live setup)
 *   6. magic-link   — HMAC-signed token credentials provider; the token is
 *                     issued and emailed by /api/auth/magic-link/request and
 *                     consumed by /api/auth/magic-link/verify
 *
 * Sessions are issued as JWTs (no DB sessions table). The JWT encode/decode
 * pair below intentionally uses HS256 via `jsonwebtoken` (NOT Auth.js's
 * default JWE) so the cookie value is bit-for-bit compatible with the legacy
 * `Authorization: Bearer <jwt>` tokens minted by `signAccessToken()` in the
 * Express server. Devices and cached tokens from the old system keep
 * validating during the cutover window.
 */
import NextAuth, { type NextAuthConfig, type User as AuthUser } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Auth0 from "next-auth/providers/auth0";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./serverDb";
import { users } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyMagicToken } from "./magicLink";

const ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days, mirrors lib/jwt.ts

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET (or SESSION_SECRET) must be set in production");
  }
  console.warn(
    "[WARN] JWT_SECRET/SESSION_SECRET not set — using insecure default. Set this before deploying.",
  );
  return "development-jwt-secret-change-in-production";
}

async function findUserByEmail(email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email));
  return row ?? null;
}

async function upsertOAuthUser(opts: {
  provider: "google" | "auth0" | "facebook" | "microsoft";
  providerId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}) {
  // Mirror the legacy id-prefixing in api-server/multiAuth.ts so existing
  // accounts continue to resolve to the same row. In the legacy setup,
  // Facebook and Microsoft sign-ins flow through Auth0 connections and are
  // stored as `auth0-${profile.id}` with authProvider = "auth0" — so do the
  // same here to avoid forking existing accounts.
  const isAuth0Backed =
    opts.provider === "auth0" ||
    opts.provider === "facebook" ||
    opts.provider === "microsoft";
  const storedProvider: "google" | "auth0" = isAuth0Backed ? "auth0" : "google";
  const prefix = storedProvider === "google" ? "google-" : "auth0-";
  const id = opts.providerId.startsWith(prefix)
    ? opts.providerId
    : `${prefix}${opts.providerId}`;

  const existing = await db.select().from(users).where(eq(users.id, id));
  if (existing.length > 0) {
    const [updated] = await db
      .update(users)
      .set({
        email: opts.email ?? existing[0].email,
        firstName: opts.firstName ?? existing[0].firstName,
        lastName: opts.lastName ?? existing[0].lastName,
        profileImageUrl: opts.profileImageUrl ?? existing[0].profileImageUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  // Fall back to matching by email so the same human signing in via a
  // different provider doesn't get a duplicate row.
  if (opts.email) {
    const [byEmail] = await db
      .select()
      .from(users)
      .where(eq(users.email, opts.email));
    if (byEmail) {
      const [updated] = await db
        .update(users)
        .set({
          firstName: opts.firstName ?? byEmail.firstName,
          lastName: opts.lastName ?? byEmail.lastName,
          profileImageUrl: opts.profileImageUrl ?? byEmail.profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, byEmail.id))
        .returning();
      return updated;
    }
  }

  const [inserted] = await db
    .insert(users)
    .values({
      id,
      email: opts.email,
      firstName: opts.firstName,
      lastName: opts.lastName,
      profileImageUrl: opts.profileImageUrl,
      authProvider: storedProvider,
      providerId: opts.providerId,
    })
    .returning();
  return inserted;
}

const googleEnabled = !!(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);
const auth0Enabled = !!(
  process.env.AUTH0_DOMAIN &&
  process.env.AUTH0_CLIENT_ID &&
  process.env.AUTH0_CLIENT_SECRET
);

const providers: NextAuthConfig["providers"] = [
  Credentials({
    id: "credentials",
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(creds) {
      const email = String(creds?.email ?? "").toLowerCase().trim();
      const password = String(creds?.password ?? "");
      if (!email || !password) return null;
      const user = await findUserByEmail(email);
      if (!user || !user.passwordHash) return null;
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;
      return {
        id: user.id,
        email: user.email ?? null,
        name:
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.email ||
          null,
        image: user.profileImageUrl ?? null,
      } satisfies AuthUser;
    },
  }),
  Credentials({
    // Magic-link is a credentials provider that consumes an HMAC token
    // produced by /api/auth/magic-link/request. The verify route calls
    // signIn("magic-link", { token }) after validating the URL.
    id: "magic-link",
    name: "Magic link",
    credentials: { token: { label: "Token", type: "text" } },
    async authorize(creds) {
      const token = String(creds?.token ?? "");
      if (!token) return null;
      const result = verifyMagicToken(token);
      if (!result) return null;
      const email = result.email;
      let user = await findUserByEmail(email);
      if (!user) {
        const [created] = await db
          .insert(users)
          .values({
            email,
            authProvider: "magic_link",
            firstName: null,
            lastName: null,
          })
          .returning();
        user = created;
      }
      return {
        id: user.id,
        email: user.email ?? null,
        name:
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.email ||
          null,
        image: user.profileImageUrl ?? null,
      } satisfies AuthUser;
    },
  }),
];

if (googleEnabled) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (auth0Enabled) {
  // Direct "Continue with Auth0" — Universal Login lets the user pick any
  // connection enabled on the tenant.
  providers.push(
    Auth0({
      id: "auth0",
      clientId: process.env.AUTH0_CLIENT_ID!,
      clientSecret: process.env.AUTH0_CLIENT_SECRET!,
      issuer: process.env.AUTH0_DOMAIN!.startsWith("http")
        ? process.env.AUTH0_DOMAIN!
        : `https://${process.env.AUTH0_DOMAIN!}`,
      allowDangerousEmailAccountLinking: true,
    }),
  );

  // Facebook and Microsoft are routed through Auth0 connections in the
  // existing setup (see api-server/src/multiAuth.ts comments on the
  // /api/auth/providers endpoint). We expose them here as distinct provider
  // ids so the legacy /api/auth/providers shape and the existing sign-in
  // modal buttons keep working without conditional code.
  providers.push(
    Auth0({
      id: "facebook",
      name: "Facebook",
      clientId: process.env.AUTH0_CLIENT_ID!,
      clientSecret: process.env.AUTH0_CLIENT_SECRET!,
      issuer: process.env.AUTH0_DOMAIN!.startsWith("http")
        ? process.env.AUTH0_DOMAIN!
        : `https://${process.env.AUTH0_DOMAIN!}`,
      authorization: { params: { connection: "facebook" } },
      allowDangerousEmailAccountLinking: true,
    }),
  );
  providers.push(
    Auth0({
      id: "microsoft",
      name: "Microsoft",
      clientId: process.env.AUTH0_CLIENT_ID!,
      clientSecret: process.env.AUTH0_CLIENT_SECRET!,
      issuer: process.env.AUTH0_DOMAIN!.startsWith("http")
        ? process.env.AUTH0_DOMAIN!
        : `https://${process.env.AUTH0_DOMAIN!}`,
      authorization: { params: { connection: "windowslive" } },
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const authConfig: NextAuthConfig = {
  // Never store sessions server-side — required for Vercel serverless.
  session: { strategy: "jwt", maxAge: ACCESS_TOKEN_TTL_SECONDS },
  secret: getJwtSecret(),
  trustHost: true,
  providers,
  pages: { signIn: "/" },
  callbacks: {
    async signIn({ user, account, profile }) {
      // For OAuth flows, upsert the user into our DB and rewrite the user.id
      // to our prefixed id so the JWT and downstream code see the same row.
      if (!account || account.type !== "oidc" && account.type !== "oauth") {
        return true;
      }
      const providerId = (account.providerAccountId ?? user.id ?? "").toString();
      if (!providerId) return false;

      const profileObj = (profile ?? {}) as Record<string, unknown>;
      const email =
        (user.email as string | undefined) ??
        (profileObj.email as string | undefined) ??
        null;
      const firstName =
        (profileObj.given_name as string | undefined) ??
        (profileObj.first_name as string | undefined) ??
        null;
      const lastName =
        (profileObj.family_name as string | undefined) ??
        (profileObj.last_name as string | undefined) ??
        null;
      const profileImageUrl =
        (user.image as string | undefined) ??
        (profileObj.picture as string | undefined) ??
        null;

      const provider = (account.provider ?? "auth0") as
        | "google"
        | "auth0"
        | "facebook"
        | "microsoft";
      const row = await upsertOAuthUser({
        provider,
        providerId,
        email,
        firstName,
        lastName,
        profileImageUrl,
      });
      // Mutate user.id so the jwt callback below picks up our DB row id.
      user.id = row.id;
      user.email = row.email ?? user.email;
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = String(user.id);
        if (user.email) token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.sub && session.user) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
  // HS256 encode/decode keeps the cookie value bit-compatible with the legacy
  // `signAccessToken()` JWTs the Express server still mints. This is what
  // makes the `Authorization: Bearer <jwt>` flow keep working transparently
  // for the React client (queryClient.ts) and the existing mobile app.
  jwt: {
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
    async encode({ token }) {
      const sub = token?.sub ? String(token.sub) : "";
      const email = token?.email ? String(token.email) : null;
      return jwt.sign({ sub, email }, getJwtSecret(), {
        algorithm: "HS256",
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      });
    },
    async decode({ token }) {
      if (!token) return null;
      try {
        const decoded = jwt.verify(token, getJwtSecret(), {
          algorithms: ["HS256"],
        });
        if (!decoded || typeof decoded !== "object") return null;
        const sub = (decoded as { sub?: unknown }).sub;
        if (typeof sub !== "string" || !sub) return null;
        const email = (decoded as { email?: unknown }).email;
        return {
          sub,
          email: typeof email === "string" ? email : null,
        };
      } catch {
        return null;
      }
    },
  },
};

// Export the canonical Auth.js handles. Route handlers use `auth()` to read
// the session; the [...nextauth] route handler uses `handlers`; the
// signIn/signOut helpers are used by /api/auth/magic-link/verify and any
// server action that wants to flip the session.
export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);

// Backwards-compatible alias for the placeholder created by the API-port
// task. Existing call sites can continue to import { getServerSession } from
// "@/lib/auth" and get the real session.
export const getServerSession = auth;

export const providerStatus = {
  local: true,
  google: googleEnabled,
  facebook: auth0Enabled, // routed through Auth0
  microsoft: auth0Enabled, // routed through Auth0
  auth0: auth0Enabled,
  magicLink: true,
};
