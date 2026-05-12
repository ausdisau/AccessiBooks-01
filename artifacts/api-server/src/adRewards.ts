import { db } from "./db";
import {
  adRewards,
  expiringRewards,
  users,
  adCampaigns,
  adCreatives,
  adImpressions,
} from "@workspace/db";
import { eq, and, gt, gte, desc } from "drizzle-orm";
import type { Router, Request, Response } from "express";
import { isAuthenticated } from "./multiAuth";
import {
  REWARD_CONFIG,
  REWARD_COOLDOWN_HOURS,
  REWARDED_AD_PLACEMENT_ID,
  type RewardType,
} from "./rewardConfig";
import { analyticsService } from "./analyticsService";

const HOUSE_ADVERTISER_ID = "system-rewarded-ads";
const HOUSE_CAMPAIGN_ID = "house-rewarded-campaign";
const HOUSE_CREATIVE_ID = "house-rewarded-creative";

let houseAdEnsured = false;
async function ensureHouseRewardedAd(): Promise<void> {
  if (houseAdEnsured) return;
  await db
    .insert(users)
    .values({
      id: HOUSE_ADVERTISER_ID,
      email: "rewarded-ads@system.local",
      firstName: "Rewarded",
      lastName: "Ads",
      role: "admin",
    })
    .onConflictDoNothing();
  await db
    .insert(adCampaigns)
    .values({
      id: HOUSE_CAMPAIGN_ID,
      advertiserId: HOUSE_ADVERTISER_ID,
      name: "Rewarded Ads (House)",
      description: "House campaign for rewarded ad sessions.",
      status: "active",
      budgetCents: 0,
      cpmBidCents: 0,
    })
    .onConflictDoNothing();
  await db
    .insert(adCreatives)
    .values({
      id: HOUSE_CREATIVE_ID,
      campaignId: HOUSE_CAMPAIGN_ID,
      name: "Rewarded Ads (House) Creative",
      audioUrl: "",
      duration: 20,
      status: "approved",
    })
    .onConflictDoNothing();
  houseAdEnsured = true;
}

export interface OfferPayload {
  eligible: true;
  rewardType: RewardType;
  label: string;
  durationMinutes: number;
  adPlacementId: string;
}

export interface OfferIneligible {
  eligible: false;
  reason: "premium_user" | "cooldown_active" | "reward_unavailable" | "missing_context";
}

export type OfferResult = OfferPayload | OfferIneligible;

export interface ActiveReward {
  type: RewardType;
  label: string;
  expiresAt: Date;
  remainingMinutes: number;
}

export interface OfferContext {
  bookId?: string;
}

const MIN_AD_DURATION_MS = 10 * 1000;
const sessionStartedAt = new Map<string, number>();

async function getUserTier(userId: string): Promise<string> {
  const rows = await db
    .select({ subscriptionTier: users.subscriptionTier })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.subscriptionTier ?? "free";
}

async function checkCooldown(userId: string, rewardType: RewardType): Promise<boolean> {
  const cutoff = new Date(Date.now() - REWARD_COOLDOWN_HOURS * 60 * 60 * 1000);
  const rows = await db
    .select({ grantedAt: adRewards.grantedAt })
    .from(adRewards)
    .where(
      and(
        eq(adRewards.userId, userId),
        eq(adRewards.rewardType, rewardType),
        gt(adRewards.grantedAt, cutoff),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

function checkContextEligibility(rewardType: RewardType, context: OfferContext): boolean {
  if (rewardType === "offline_preview" || rewardType === "premium_sample_chapter") {
    return Boolean(context.bookId);
  }
  return true;
}

export async function offerReward(
  userId: string,
  rewardType?: RewardType,
  context: OfferContext = {},
): Promise<OfferResult> {
  const tier = await getUserTier(userId);
  if (tier !== "free") {
    return { eligible: false, reason: "premium_user" };
  }

  const type: RewardType = rewardType ?? "ad_light_listening";
  const config = REWARD_CONFIG[type];
  if (!config) {
    return { eligible: false, reason: "reward_unavailable" };
  }

  if (!checkContextEligibility(type, context)) {
    return { eligible: false, reason: "missing_context" };
  }

  const onCooldown = await checkCooldown(userId, type);
  if (onCooldown) {
    return { eligible: false, reason: "cooldown_active" };
  }

  return {
    eligible: true,
    rewardType: type,
    label: config.label,
    durationMinutes: config.durationMinutes,
    adPlacementId: REWARDED_AD_PLACEMENT_ID,
  };
}

export async function startRewardedSession(
  userId: string,
  rewardType: RewardType,
  context: OfferContext = {},
): Promise<{ ok: true; impressionId: string } | { ok: false; reason: string }> {
  const offer = await offerReward(userId, rewardType, context);
  if (!offer.eligible) {
    return { ok: false, reason: offer.reason };
  }

  await ensureHouseRewardedAd();
  const [impression] = await db
    .insert(adImpressions)
    .values({
      campaignId: HOUSE_CAMPAIGN_ID,
      creativeId: HOUSE_CREATIVE_ID,
      userId,
      adType: "rewarded",
      costCents: 0,
      completed: false,
    })
    .returning();
  sessionStartedAt.set(impression.id, Date.now());
  return { ok: true, impressionId: impression.id };
}

export async function markRewardedSessionCompleted(
  userId: string,
  impressionId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const rows = await db
    .select()
    .from(adImpressions)
    .where(eq(adImpressions.id, impressionId))
    .limit(1);
  if (rows.length === 0) return { ok: false, reason: "impression_not_found" };
  const impression = rows[0];
  if (!impression.userId || impression.userId !== userId) {
    return { ok: false, reason: "impression_user_mismatch" };
  }
  const startedAt = sessionStartedAt.get(impressionId)
    ?? impression.servedAt?.getTime()
    ?? 0;
  if (Date.now() - startedAt < MIN_AD_DURATION_MS) {
    return { ok: false, reason: "ad_not_completed" };
  }
  await db
    .update(adImpressions)
    .set({ completed: true })
    .where(eq(adImpressions.id, impressionId));
  return { ok: true };
}

export async function completeReward(
  userId: string,
  impressionId: string,
  rewardType: RewardType,
): Promise<{ granted: boolean; newlyGranted?: boolean; reward?: { label: string; expiresAt: Date }; error?: string }> {
  const config = REWARD_CONFIG[rewardType];
  if (!config) {
    return { granted: false, error: "invalid_reward_type" };
  }

  const existingGrant = await db
    .select()
    .from(adRewards)
    .where(and(eq(adRewards.userId, userId), eq(adRewards.adImpressionId, impressionId)))
    .limit(1);
  if (existingGrant.length > 0) {
    const expiringRow = await db
      .select()
      .from(expiringRewards)
      .where(
        and(
          eq(expiringRewards.userId, userId),
          eq(expiringRewards.rewardType, rewardType),
          gt(expiringRewards.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(expiringRewards.expiresAt))
      .limit(1);
    const expiresAt =
      expiringRow[0]?.expiresAt
      ?? new Date(existingGrant[0].grantedAt!.getTime() + config.durationMinutes * 60 * 1000);
    return { granted: true, newlyGranted: false, reward: { label: config.label, expiresAt } };
  }

  const impressionRows = await db
    .select()
    .from(adImpressions)
    .where(eq(adImpressions.id, impressionId))
    .limit(1);
  if (impressionRows.length === 0) {
    return { granted: false, error: "impression_not_found" };
  }
  const impression = impressionRows[0];
  if (!impression.userId || impression.userId !== userId) {
    return { granted: false, error: "impression_user_mismatch" };
  }
  if (!impression.completed) {
    const ack = await markRewardedSessionCompleted(userId, impressionId);
    if (!ack.ok) {
      return { granted: false, error: ack.reason ?? "impression_not_completed" };
    }
  }

  const onCooldown = await checkCooldown(userId, rewardType);
  if (onCooldown) {
    return { granted: false, error: "cooldown_active" };
  }

  try {
    await db.insert(adRewards).values({
      userId,
      adImpressionId: impressionId,
      rewardType,
    });
  } catch (err: any) {
    if (err?.code === "23505" || /duplicate key|unique/i.test(String(err?.message))) {
      const existing = await db
        .select()
        .from(expiringRewards)
        .where(
          and(
            eq(expiringRewards.userId, userId),
            eq(expiringRewards.rewardType, rewardType),
            gt(expiringRewards.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(expiringRewards.expiresAt))
        .limit(1);
      const expiresAt =
        existing[0]?.expiresAt ?? new Date(Date.now() + config.durationMinutes * 60 * 1000);
      return { granted: true, newlyGranted: false, reward: { label: config.label, expiresAt } };
    }
    throw err;
  }

  const newExpiry = new Date(Date.now() + config.durationMinutes * 60 * 1000);
  const active = await db
    .select()
    .from(expiringRewards)
    .where(
      and(
        eq(expiringRewards.userId, userId),
        eq(expiringRewards.rewardType, rewardType),
        gt(expiringRewards.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(expiringRewards.expiresAt))
    .limit(1);

  let finalExpiry: Date;
  if (active.length > 0) {
    finalExpiry = new Date(active[0].expiresAt.getTime() + config.durationMinutes * 60 * 1000);
    await db
      .update(expiringRewards)
      .set({ expiresAt: finalExpiry, description: config.label })
      .where(eq(expiringRewards.id, active[0].id));
  } else {
    finalExpiry = newExpiry;
    await db.insert(expiringRewards).values({
      userId,
      rewardType,
      rewardValue: config.durationMinutes,
      description: config.label,
      expiresAt: newExpiry,
      claimed: false,
    });
  }

  sessionStartedAt.delete(impressionId);
  return { granted: true, newlyGranted: true, reward: { label: config.label, expiresAt: finalExpiry } };
}

export async function getActiveRewards(userId: string): Promise<ActiveReward[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(expiringRewards)
    .where(
      and(
        eq(expiringRewards.userId, userId),
        gt(expiringRewards.expiresAt, now),
      ),
    );

  return rows.map((row) => {
    const type = row.rewardType as RewardType;
    const config = REWARD_CONFIG[type];
    const remainingMs = row.expiresAt.getTime() - now.getTime();
    const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
    return {
      type,
      label: config?.label ?? row.description,
      expiresAt: row.expiresAt,
      remainingMinutes,
    };
  });
}

export async function hasActiveAdFreeReward(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: expiringRewards.id })
    .from(expiringRewards)
    .where(
      and(
        eq(expiringRewards.userId, userId),
        eq(expiringRewards.rewardType, "ad_light_listening"),
        gt(expiringRewards.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Legacy compatibility for prior /api/ads/rewarded/{complete,status} surface.
// Backed by expiringRewards so that the existing audio-ad-service client and
// adMediation route registration continue to work after the refactor.
// ---------------------------------------------------------------------------

const LEGACY_REWARD_DURATION_MINUTES = parseInt(
  process.env.AD_REWARDED_DURATION_MINUTES || "60",
);

export async function recordRewardedCompletion(
  userId: string,
  _impressionId?: string,
): Promise<{ expiresAt: Date }> {
  const rewardedAt = new Date();
  const expiresAt = new Date(
    rewardedAt.getTime() + LEGACY_REWARD_DURATION_MINUTES * 60 * 1000,
  );

  // Extend an existing active ad-free window, or insert a fresh one.
  const active = await db
    .select()
    .from(expiringRewards)
    .where(
      and(
        eq(expiringRewards.userId, userId),
        eq(expiringRewards.rewardType, "ad_light_listening"),
        gte(expiringRewards.expiresAt, rewardedAt),
      ),
    )
    .orderBy(desc(expiringRewards.expiresAt))
    .limit(1);

  let finalExpiry: Date;
  if (active.length > 0) {
    finalExpiry = new Date(active[0].expiresAt.getTime() + LEGACY_REWARD_DURATION_MINUTES * 60 * 1000);
    await db
      .update(expiringRewards)
      .set({ expiresAt: finalExpiry })
      .where(eq(expiringRewards.id, active[0].id));
  } else {
    finalExpiry = expiresAt;
    await db.insert(expiringRewards).values({
      userId,
      rewardType: "ad_light_listening",
      rewardValue: LEGACY_REWARD_DURATION_MINUTES,
      description: REWARD_CONFIG.ad_light_listening.label,
      expiresAt,
      claimed: false,
    });
  }

  return { expiresAt: finalExpiry };
}

export async function getRewardedStatus(
  userId: string,
): Promise<{ active: boolean; expiresAt: string | null }> {
  const now = new Date();
  const [activeReward] = await db
    .select()
    .from(expiringRewards)
    .where(
      and(
        eq(expiringRewards.userId, userId),
        eq(expiringRewards.rewardType, "ad_light_listening"),
        gte(expiringRewards.expiresAt, now),
      ),
    )
    .orderBy(desc(expiringRewards.expiresAt))
    .limit(1);

  if (!activeReward) return { active: false, expiresAt: null };
  return { active: true, expiresAt: activeReward.expiresAt.toISOString() };
}

export function registerRewardedRoutes(router: Router): void {
  router.post("/api/ads/rewarded/complete", isAuthenticated, async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: "Authentication required" });
    try {
      const { impressionId } = req.body ?? {};
      const result = await recordRewardedCompletion(user.id, impressionId);
      analyticsService.track("rewarded_ad_completed", user.subscriptionTier || "free", {
        userId: user.id,
        impressionId,
        legacy: true,
        durationMinutes: LEGACY_REWARD_DURATION_MINUTES,
      });
      res.json({
        success: true,
        expiresAt: result.expiresAt.toISOString(),
        durationMinutes: LEGACY_REWARD_DURATION_MINUTES,
      });
    } catch (err) {
      console.error("[AdRewards] Error recording rewarded completion:", err);
      res.status(500).json({ error: "Failed to record rewarded completion" });
    }
  });

  router.get("/api/ads/rewarded/status", isAuthenticated, async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ error: "Authentication required" });
    try {
      const status = await getRewardedStatus(user.id);
      res.json(status);
    } catch (err) {
      console.error("[AdRewards] Error getting rewarded status:", err);
      res.status(500).json({ error: "Failed to get rewarded status" });
    }
  });
}
