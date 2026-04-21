/**
 * adRewards.ts — Rewarded ad completion tracking.
 *
 * recordRewardedCompletion: writes an ad_rewards row
 * getRewardedStatus: checks if user has an active ad-light period
 */

import { db } from "./db";
import { adRewards } from "@shared/schema";
import { and, eq, gte, desc } from "drizzle-orm";
import type { Router, Request, Response } from "express";
import { isAuthenticated } from "./multiAuth";

const REWARD_DURATION_MINUTES = parseInt(
  process.env.AD_REWARDED_DURATION_MINUTES || "60",
);

export async function recordRewardedCompletion(
  userId: string,
  impressionId?: string,
): Promise<{ expiresAt: Date }> {
  const rewardedAt = new Date();
  const expiresAt = new Date(
    rewardedAt.getTime() + REWARD_DURATION_MINUTES * 60 * 1000,
  );

  await db.insert(adRewards).values({
    userId,
    impressionId: impressionId ?? null,
    expiresAt,
  });

  console.log(
    `[AdRewards] Recorded rewarded completion for user=${userId}, expires=${expiresAt.toISOString()}`,
  );

  return { expiresAt };
}

export async function getRewardedStatus(
  userId: string,
): Promise<{ active: boolean; expiresAt: string | null }> {
  const now = new Date();

  const [activeReward] = await db
    .select()
    .from(adRewards)
    .where(and(eq(adRewards.userId, userId), gte(adRewards.expiresAt, now)))
    .orderBy(desc(adRewards.expiresAt))
    .limit(1);

  if (!activeReward) {
    return { active: false, expiresAt: null };
  }

  return {
    active: true,
    expiresAt: activeReward.expiresAt.toISOString(),
  };
}

export function registerRewardedRoutes(router: Router): void {
  router.post("/api/ads/rewarded/complete", isAuthenticated, async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const { impressionId } = req.body;
      const result = await recordRewardedCompletion(user.id, impressionId);
      res.json({
        success: true,
        expiresAt: result.expiresAt.toISOString(),
        durationMinutes: REWARD_DURATION_MINUTES,
      });
    } catch (err) {
      console.error("[AdRewards] Error recording rewarded completion:", err);
      res.status(500).json({ error: "Failed to record rewarded completion" });
    }
  });

  router.get("/api/ads/rewarded/status", isAuthenticated, async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const status = await getRewardedStatus(user.id);
      res.json(status);
    } catch (err) {
      console.error("[AdRewards] Error getting rewarded status:", err);
      res.status(500).json({ error: "Failed to get rewarded status" });
    }
  });
}
