/**
 * googleAccountLinking.ts — account resolution for the Replit-managed Google
 * OIDC login flow (Task: link legacy Google logins to the managed sign-in).
 *
 * Legacy accounts created through the old self-managed Google OAuth strategy
 * are keyed by the Google profile id (`google-<profileId>`); the Replit OIDC
 * subject is different, so without linking a returning user would get a brand
 * new empty account. This module resolves the account in a fixed order:
 *
 *   1. exact id match (`google-<oidcSub>`) — accounts created by the new flow;
 *   2. providerId match — accounts already linked on a previous login;
 *   3. verified-email auto-link — requires `email_verified === true` (a
 *      missing claim counts as NOT verified) and refuses accounts that have a
 *      local password (email-collision hijack safeguard); the denial is
 *      deterministic — we never try to create a duplicate row under a unique
 *      email;
 *   4. otherwise a new account is provisioned.
 *
 * Every automatic link (and every refused local-password link) is recorded in
 * `account_link_audits`, visible to admins via GET /api/admin/account-link-audits.
 * Audit writes are best-effort: a failed audit insert never blocks sign-in.
 *
 * The DB access is injected (see `defaultLinkingDeps`) so the decision logic
 * is unit-testable offline.
 */
import { and, eq } from "drizzle-orm";
import { users, accountLinkAudits, type User, type InsertAccountLinkAudit } from "@workspace/db";
import { db } from "./db";
import { storage } from "./storage";
import { logger } from "./lib/logger";

export interface GoogleLinkClaims {
  sub: string;
  email?: string | null;
  emailVerified?: boolean | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
}

export type GoogleLinkResult =
  | { status: "ok"; user: User; linked: boolean }
  | { status: "denied_local_password"; email: string };

export interface LinkingDeps {
  findUserById(id: string): Promise<User | undefined>;
  findUserByProviderSub(sub: string): Promise<User | undefined>;
  findUserByEmail(email: string): Promise<User | undefined>;
  /** Applies `set` to the row and returns the updated row. */
  updateUser(id: string, set: Partial<typeof users.$inferInsert>): Promise<User>;
  createUser(values: typeof users.$inferInsert): Promise<User>;
  insertAudit(values: InsertAccountLinkAudit): Promise<void>;
}

export const defaultLinkingDeps: LinkingDeps = {
  async findUserById(id) {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row;
  },
  async findUserByProviderSub(sub) {
    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.authProvider, "google"), eq(users.providerId, sub)));
    return row;
  },
  async findUserByEmail(email) {
    const [row] = await db.select().from(users).where(eq(users.email, email));
    return row;
  },
  async updateUser(id, set) {
    const [row] = await db.update(users).set(set).where(eq(users.id, id)).returning();
    return row;
  },
  async createUser(values) {
    return storage.upsertUser(values);
  },
  async insertAudit(values) {
    await db.insert(accountLinkAudits).values(values);
  },
};

/** Best-effort audit write — sign-in must never fail because auditing did. */
async function tryAudit(deps: LinkingDeps, values: InsertAccountLinkAudit): Promise<void> {
  try {
    await deps.insertAudit(values);
  } catch (err) {
    logger.error({ err, userId: values.userId }, "Failed to write account-link audit row");
  }
}

export async function resolveGoogleUser(
  claims: GoogleLinkClaims,
  deps: LinkingDeps = defaultLinkingDeps,
): Promise<GoogleLinkResult> {
  const sub = claims.sub;
  const prefixedId = sub.startsWith("google-") ? sub : `google-${sub}`;
  const email = claims.email ?? null;
  const profile = {
    firstName: claims.firstName ?? null,
    lastName: claims.lastName ?? null,
    profileImageUrl: claims.profileImageUrl ?? null,
  };

  // 1) Row already keyed by the OIDC subject, or 2) previously linked row.
  let existing = await deps.findUserById(prefixedId);
  if (!existing) existing = await deps.findUserByProviderSub(sub);
  let linked = false;

  // 3) Verified-email auto-link for legacy accounts.
  if (!existing && email && claims.emailVerified === true) {
    const byEmail = await deps.findUserByEmail(email);
    if (byEmail) {
      if (byEmail.passwordHash) {
        // Email-collision hijack safeguard: never auto-link to a
        // local-password account. `users.email` is unique, so provisioning a
        // second row with this email is impossible — deny deterministically
        // and let the UI direct the user to sign in with their password.
        logger.warn(
          { userId: byEmail.id, provider: "google" },
          "Refusing to auto-link Google OIDC login to local-password account with matching email",
        );
        await tryAudit(deps, {
          userId: byEmail.id,
          provider: "google",
          providerSub: sub,
          email,
          previousAuthProvider: byEmail.authProvider,
          outcome: "skipped_local_password",
        });
        return { status: "denied_local_password", email };
      }
      await tryAudit(deps, {
        userId: byEmail.id,
        provider: "google",
        providerSub: sub,
        email,
        previousAuthProvider: byEmail.authProvider,
        outcome: "linked",
      });
      logger.info(
        { userId: byEmail.id, provider: "google" },
        "Auto-linked legacy account to Replit-managed Google OIDC identity by verified email",
      );
      existing = byEmail;
      linked = true;
    }
  }

  if (existing) {
    // Refresh profile fields on the existing row without touching its id, and
    // stamp the OIDC subject so future logins resolve through the providerId
    // match instead of the email comparison.
    const user = await deps.updateUser(existing.id, {
      email: email ?? existing.email,
      firstName: profile.firstName ?? existing.firstName,
      lastName: profile.lastName ?? existing.lastName,
      profileImageUrl: profile.profileImageUrl ?? existing.profileImageUrl,
      authProvider: "google",
      providerId: sub,
      updatedAt: new Date(),
    });
    return { status: "ok", user, linked };
  }

  // 4) Brand-new account. Keep the legacy `google-` id prefix convention.
  // If the email exists but was NOT verified, do not attach it to the new row —
  // `users.email` is unique, so inserting it would collide with the existing
  // account (and attaching an unverified email would be a spoofing vector).
  let newEmail = email;
  if (newEmail && claims.emailVerified !== true) {
    const collision = await deps.findUserByEmail(newEmail);
    if (collision) {
      logger.warn(
        { provider: "google" },
        "Unverified Google OIDC email matches an existing account; provisioning without email",
      );
      newEmail = null;
    }
  }
  const user = await deps.createUser({
    id: prefixedId,
    email: newEmail,
    ...profile,
    authProvider: "google",
    providerId: sub,
  });
  return { status: "ok", user, linked: false };
}
