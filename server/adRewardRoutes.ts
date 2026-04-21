import type { Express } from "express";
import { z } from "zod";
import {
  offerReward,
  completeReward,
  getActiveRewards,
  startRewardedSession,
  markRewardedSessionCompleted,
} from "./adRewards";
import { REWARD_TYPES, type RewardType } from "@shared/rewardConfig";

function getUserId(req: any): string | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) return null;
  return req.user?.id ?? null;
}

const startRewardSchema = z.object({
  rewardType: z.enum(REWARD_TYPES as [RewardType, ...RewardType[]]),
  bookId: z.string().optional(),
});

const completeRewardSchema = z.object({
  impressionId: z.string().min(1),
  rewardType: z.enum(REWARD_TYPES as [RewardType, ...RewardType[]]),
});

const sessionAckSchema = z.object({
  impressionId: z.string().min(1),
});

export function registerAdRewardRoutes(app: Express) {
  app.get("/api/ads/reward/offer", async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ eligible: false, reason: "unauthenticated" });
    }

    const rewardType = req.query.rewardType as RewardType | undefined;
    if (rewardType && !REWARD_TYPES.includes(rewardType)) {
      return res.status(400).json({ eligible: false, reason: "reward_unavailable" });
    }
    const bookId = typeof req.query.bookId === "string" ? req.query.bookId : undefined;

    try {
      const result = await offerReward(userId, rewardType, { bookId });
      return res.json(result);
    } catch (err) {
      console.error("[AdRewards] offer error:", err);
      return res.status(500).json({ eligible: false, reason: "reward_unavailable" });
    }
  });

  app.post("/api/ads/reward/start", async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, reason: "unauthenticated" });

    const parse = startRewardSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ ok: false, reason: "invalid_request", details: parse.error.issues });
    }

    try {
      const result = await startRewardedSession(userId, parse.data.rewardType, { bookId: parse.data.bookId });
      if (!result.ok) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (err) {
      console.error("[AdRewards] start error:", err);
      return res.status(500).json({ ok: false, reason: "server_error" });
    }
  });

  app.post("/api/ads/reward/ack", async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ ok: false, reason: "unauthenticated" });
    const parse = sessionAckSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ ok: false, reason: "invalid_request" });
    }
    const result = markRewardedSessionCompleted(userId, parse.data.impressionId);
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  });

  app.post("/api/ads/reward/complete", async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ granted: false, error: "unauthenticated" });
    }

    const parse = completeRewardSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ granted: false, error: "invalid_request", details: parse.error.issues });
    }

    const { impressionId, rewardType } = parse.data;

    try {
      const result = await completeReward(userId, impressionId, rewardType);
      if (!result.granted) {
        return res.status(400).json(result);
      }
      return res.json({ granted: true, reward: { label: result.reward!.label, expiresAt: result.reward!.expiresAt } });
    } catch (err) {
      console.error("[AdRewards] complete error:", err);
      return res.status(500).json({ granted: false, error: "server_error" });
    }
  });

  app.get("/api/ads/reward/status", async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.json({ rewards: [] });
    }

    try {
      const rewards = await getActiveRewards(userId);
      return res.json({ rewards });
    } catch (err) {
      console.error("[AdRewards] status error:", err);
      return res.json({ rewards: [] });
    }
  });
}
