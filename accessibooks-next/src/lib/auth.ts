import { cookies, headers } from "next/headers";
import { prisma } from "./db";
import { logger } from "./logger";

export interface SessionUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
  subscriptionEndDate: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  role: string | null;
}

/**
 * Placeholder session resolver. The real Auth.js wiring is a separate task
 * (see Task #182 "Out of scope" — Auth.js wiring).
 *
 * Resolution order (development-friendly):
 *   1. `x-test-user-id` header — used by smoke tests and curl.
 *   2. `test_user_id` cookie — used by the dev UI when impersonating.
 *   3. null — caller should treat as unauthenticated.
 *
 * Production should swap this for `auth()` from `@/lib/auth` once Auth.js
 * is wired up; the signature stays the same so route handlers do not need
 * to change.
 */
export async function getServerSession(): Promise<SessionUser | null> {
  const allowTestHeader =
    process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_USER_HEADER === "1";
  if (!allowTestHeader) return null;
  const h = await headers();
  const c = await cookies();
  const userId =
    h.get("x-test-user-id") || c.get("test_user_id")?.value || null;
  if (!userId) return null;

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionEndDate: user.subscriptionEndDate,
      stripeCustomerId: user.stripeCustomerId,
      stripeSubscriptionId: user.stripeSubscriptionId,
      role: user.role,
    };
  } catch (err) {
    logger.warn({ err }, "getServerSession lookup failed");
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getServerSession();
  if (!session) {
    throw new AuthError("Unauthorized", 401);
  }
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireSession();
  if (session.role !== "admin") {
    throw new AuthError("Admin access required", 403);
  }
  return session;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403,
  ) {
    super(message);
  }
}
