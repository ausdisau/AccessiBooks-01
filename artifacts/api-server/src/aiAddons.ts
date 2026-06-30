import type { Express, Request, Response, NextFunction } from "express";
import { db } from "./db";
import {
  aiAddonUsage,
  users,
  AI_ADDON_FEATURES,
  AI_ADDON_QUOTAS,
  type AiAddonFeatureKey,
  type SubscriptionTier,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { resolveEntitlementOverride, getUserEffectiveTier } from "./entitlements";

/**
 * Premium AI add-ons (Task #212).
 *
 * Centralises the metering + enforcement for the paywalled AI features:
 * on-demand narration, the comprehension companion, and AI translation.
 * Usage is tracked per user × feature × calendar month in `ai_addon_usage`
 * and enforced server-side, so a modified client cannot exceed its quota.
 */

const FEATURE_META: Record<AiAddonFeatureKey, { label: string; description: string }> =
  Object.fromEntries(
    AI_ADDON_FEATURES.map((f) => [f.key, { label: f.label, description: f.description }]),
  ) as Record<AiAddonFeatureKey, { label: string; description: string }>;

function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** null = unlimited, 0 = not available (upsell), N = monthly allowance. */
export function getQuotaForTier(feature: AiAddonFeatureKey, tier: SubscriptionTier): number | null {
  const row = AI_ADDON_QUOTAS[feature];
  return row[tier] ?? row.free;
}

/** Resolve the effective tier for a user, honouring active entitlement overrides. */
export async function resolveAddonTier(
  userId: string,
  baseUser?: { subscriptionTier?: string | null } | null,
): Promise<SubscriptionTier> {
  let user = baseUser ?? null;
  if (!user) {
    const rows = await db
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    user = rows[0] ?? null;
  }
  let override: string | null = null;
  try {
    override = await resolveEntitlementOverride(userId);
  } catch {
    override = null;
  }
  return getUserEffectiveTier(user, override);
}

export async function getAiAddonUsageCount(userId: string, feature: AiAddonFeatureKey): Promise<number> {
  const yearMonth = getCurrentYearMonth();
  const rows = await db
    .select({ count: aiAddonUsage.count })
    .from(aiAddonUsage)
    .where(
      and(
        eq(aiAddonUsage.userId, userId),
        eq(aiAddonUsage.feature, feature),
        eq(aiAddonUsage.yearMonth, yearMonth),
      ),
    )
    .limit(1);
  return rows[0]?.count ?? 0;
}

export async function incrementAiAddonUsage(userId: string, feature: AiAddonFeatureKey): Promise<void> {
  const yearMonth = getCurrentYearMonth();
  await db
    .insert(aiAddonUsage)
    .values({ userId, feature, yearMonth, count: 1 })
    .onConflictDoUpdate({
      target: [aiAddonUsage.userId, aiAddonUsage.feature, aiAddonUsage.yearMonth],
      set: { count: sql`${aiAddonUsage.count} + 1`, updatedAt: sql`now()` },
    });
}

export interface AiAddonStatus {
  feature: AiAddonFeatureKey;
  label: string;
  description: string;
  tier: SubscriptionTier;
  unlimited: boolean;
  limit: number | null; // monthly allowance; null when unlimited
  used: number;
  remaining: number | null; // null when unlimited
  allowed: boolean;
  upgradeRequired: boolean;
}

export async function getAiAddonStatus(
  userId: string,
  feature: AiAddonFeatureKey,
  tier?: SubscriptionTier,
): Promise<AiAddonStatus> {
  const effectiveTier = tier ?? (await resolveAddonTier(userId));
  const limit = getQuotaForTier(feature, effectiveTier);
  const used = await getAiAddonUsageCount(userId, feature);
  const unlimited = limit === null;
  const remaining = unlimited ? null : Math.max(0, (limit as number) - used);
  const allowed = unlimited || (remaining ?? 0) > 0;
  const meta = FEATURE_META[feature];
  return {
    feature,
    label: meta.label,
    description: meta.description,
    tier: effectiveTier,
    unlimited,
    limit,
    used,
    remaining,
    allowed,
    upgradeRequired: !allowed,
  };
}

export async function getAllAiAddonStatuses(userId: string): Promise<AiAddonStatus[]> {
  const tier = await resolveAddonTier(userId);
  return Promise.all(AI_ADDON_FEATURES.map((f) => getAiAddonStatus(userId, f.key, tier)));
}

/** Extract the authenticated user id from a request (Passport local or claims). */
export function getRequestUserId(req: Request): string | null {
  const r = req as Request & {
    isAuthenticated?: () => boolean;
    user?: { id?: string; claims?: { sub?: string } };
  };
  const authed = typeof r.isAuthenticated === "function" && r.isAuthenticated();
  if (!authed) return null;
  return r.user?.id ?? r.user?.claims?.sub ?? null;
}

/** Build the 402 upsell payload returned when a quota is exhausted. */
export function buildUpsellPayload(status: AiAddonStatus): Record<string, unknown> {
  return {
    error: "quota_exhausted",
    message:
      status.tier === "free"
        ? `You've used your free ${status.label} allowance for this month. Upgrade to keep going.`
        : `You've reached your monthly ${status.label} limit. Upgrade for more.`,
    upgradeRequired: true,
    feature: status.feature,
    currentTier: status.tier,
    limit: status.limit,
    used: status.used,
    remaining: status.remaining,
  };
}

/**
 * Express middleware factory: gate a route behind an AI add-on quota.
 * Requires authentication, resolves the effective tier (with entitlement
 * overrides), and returns 402 with an upsell payload when the quota is spent.
 * Attaches the resolved status to `req.aiAddonStatus` for the handler.
 *
 * NOTE: this does NOT consume the quota — call `incrementAiAddonUsage` from the
 * handler once the work actually succeeds, so failed/cached requests are free.
 */
export function enforceAiAddon(feature: AiAddonFeatureKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = getRequestUserId(req);
      if (!userId) {
        res.status(401).json({ error: "auth_required", message: "Sign in to use this feature.", requiresAuth: true });
        return;
      }
      const tier = await resolveAddonTier(userId, req.user as { subscriptionTier?: string | null } | undefined);
      const status = await getAiAddonStatus(userId, feature, tier);
      (req as Request & { aiAddonStatus?: AiAddonStatus }).aiAddonStatus = status;
      if (!status.allowed) {
        res.status(402).json(buildUpsellPayload(status));
        return;
      }
      next();
    } catch (err) {
      req.log?.error({ err, feature }, "AI add-on enforcement failed");
      res.status(500).json({ error: "addon_check_failed", message: "Could not verify your access. Please try again." });
    }
  };
}

export function registerAiAddonRoutes(app: Express): void {
  // Status of every AI add-on for the signed-in user: tier, monthly limit,
  // usage so far, and remaining allowance. Powers the in-app usage dashboard
  // and upsell surfaces.
  app.get("/api/ai-addons/status", async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getRequestUserId(req);
      if (!userId) {
        res.status(401).json({ error: "auth_required", message: "Sign in to view your AI add-on usage." });
        return;
      }
      const addons = await getAllAiAddonStatuses(userId);
      res.json({ tier: addons[0]?.tier ?? "free", addons });
    } catch (err) {
      req.log?.error({ err }, "Failed to load AI add-on status");
      res.status(500).json({ error: "status_failed", message: "Could not load your AI add-on usage." });
    }
  });
}
