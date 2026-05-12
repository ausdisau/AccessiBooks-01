import { db } from "./db";
import { sql, and, gte, lte, count, sum } from "drizzle-orm";
import { productEvents, users, paymentTransactions, adImpressions, dailyListeningLog, userXp, accessibilityPreferences } from "@shared/schema";
import type { ProductEventType } from "@shared/schema";
import { eq } from "drizzle-orm";

export const analyticsService = {
  track(eventType: ProductEventType | string, tier: string, metadata?: Record<string, unknown>): void {
    db.insert(productEvents).values({
      eventType,
      userTier: tier,
      metadata: metadata ?? null,
      occurredAt: new Date(),
    }).catch((err) => {
      console.error("[Analytics] Failed to track event:", eventType, err?.message);
    });
  },

  async getSubscriptionSummary(from: Date, to: Date) {
    try {
      const tierCounts = await db.execute(
        sql`SELECT subscription_tier, COUNT(*) AS cnt FROM users GROUP BY subscription_tier`
      );
      const rows: any[] = (tierCounts as any).rows ?? [];

      let totalFree = 0, totalPlus = 0, totalPremium = 0;
      for (const r of rows) {
        if (r.subscription_tier === "free" || !r.subscription_tier) totalFree += Number(r.cnt);
        else if (r.subscription_tier === "plus") totalPlus += Number(r.cnt);
        else if (r.subscription_tier === "premium") totalPremium += Number(r.cnt);
      }

      const signupRows = await db.execute(
        sql`SELECT COUNT(*) AS cnt FROM product_events WHERE event_type = 'user_signed_up' AND occurred_at >= ${from} AND occurred_at <= ${to}`
      );
      const newSignupsThisPeriod = Number((signupRows as any).rows?.[0]?.cnt ?? 0);

      const upgradeRows = await db.execute(
        sql`SELECT COUNT(*) AS cnt FROM product_events WHERE event_type = 'subscription_upgraded' AND occurred_at >= ${from} AND occurred_at <= ${to}`
      );
      const upgradesThisPeriod = Number((upgradeRows as any).rows?.[0]?.cnt ?? 0);

      const cancelRows = await db.execute(
        sql`SELECT COUNT(*) AS cnt FROM product_events WHERE event_type = 'subscription_canceled' AND occurred_at >= ${from} AND occurred_at <= ${to}`
      );
      const cancellationsThisPeriod = Number((cancelRows as any).rows?.[0]?.cnt ?? 0);

      const mrrRows = await db.execute(
        sql`SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payment_transactions WHERE status = 'completed' AND type = 'subscription' AND created_at >= ${from} AND created_at <= ${to}`
      );
      const estimatedMRRCents = Number((mrrRows as any).rows?.[0]?.total ?? 0);

      return {
        totalFree,
        totalPlus,
        totalPremium,
        newSignupsThisPeriod,
        upgradesThisPeriod,
        cancellationsThisPeriod,
        estimatedMRRCents,
      };
    } catch (err) {
      console.error("[Analytics] getSubscriptionSummary error:", err);
      return { totalFree: 0, totalPlus: 0, totalPremium: 0, newSignupsThisPeriod: 0, upgradesThisPeriod: 0, cancellationsThisPeriod: 0, estimatedMRRCents: 0 };
    }
  },

  async getAdSummary(from: Date, to: Date) {
    try {
      const impressionRows = await db.execute(
        sql`SELECT COUNT(*) AS total, SUM(CASE WHEN completed THEN 1 ELSE 0 END) AS completions, SUM(CASE WHEN clicked THEN 1 ELSE 0 END) AS clicks, COALESCE(SUM(cost_cents), 0) AS revenue FROM ad_impressions WHERE served_at >= ${from} AND served_at <= ${to}`
      );
      const ir = (impressionRows as any).rows?.[0] ?? {};
      const impressionsServed = Number(ir.total ?? 0);
      const completions = Number(ir.completions ?? 0);
      const clicks = Number(ir.clicks ?? 0);
      const estimatedAdRevenueCents = Number(ir.revenue ?? 0);

      const completionRate = impressionsServed > 0 ? completions / impressionsServed : 0;
      const clickRate = impressionsServed > 0 ? clicks / impressionsServed : 0;

      const rewardedRows = await db.execute(
        sql`SELECT COUNT(*) AS cnt FROM product_events WHERE event_type = 'rewarded_ad_completed' AND occurred_at >= ${from} AND occurred_at <= ${to}`
      );
      const rewardedCompletions = Number((rewardedRows as any).rows?.[0]?.cnt ?? 0);

      const offeredRows = await db.execute(
        sql`SELECT COUNT(*) AS cnt FROM product_events WHERE event_type = 'rewarded_ad_offered' AND occurred_at >= ${from} AND occurred_at <= ${to}`
      );
      const rewardedOffered = Number((offeredRows as any).rows?.[0]?.cnt ?? 0);
      const fillRate = rewardedOffered > 0 ? rewardedCompletions / rewardedOffered : (impressionsServed > 0 ? 1 : 0);

      return {
        impressionsServed,
        completionRate,
        clickRate,
        rewardedCompletions,
        estimatedAdRevenueCents,
        fillRate,
      };
    } catch (err) {
      console.error("[Analytics] getAdSummary error:", err);
      return { impressionsServed: 0, completionRate: 0, clickRate: 0, rewardedCompletions: 0, estimatedAdRevenueCents: 0, fillRate: 0 };
    }
  },

  async getListeningSummary(from: Date, to: Date) {
    try {
      const fromDate = from.toISOString().slice(0, 10);
      const toDate = to.toISOString().slice(0, 10);

      const minutesByTierRows = await db.execute(
        sql`SELECT u.subscription_tier, COALESCE(SUM(dll.minutes_listened), 0) AS total_minutes
            FROM daily_listening_log dll
            JOIN users u ON u.id = dll.user_id
            WHERE dll.date >= ${fromDate} AND dll.date <= ${toDate}
            GROUP BY u.subscription_tier`
      );
      const minutesByTier: Record<string, number> = { free: 0, plus: 0, premium: 0 };
      for (const r of (minutesByTierRows as any).rows ?? []) {
        const t = r.subscription_tier || "free";
        minutesByTier[t] = (minutesByTier[t] || 0) + Number(r.total_minutes);
      }

      const sessionRows = await db.execute(
        sql`SELECT COUNT(*) AS cnt FROM product_events WHERE event_type = 'playback_session_started' AND occurred_at >= ${from} AND occurred_at <= ${to}`
      );
      const totalSessions = Number((sessionRows as any).rows?.[0]?.cnt ?? 0);

      const durationRows = await db.execute(
        sql`SELECT AVG((metadata->>'durationSeconds')::numeric) AS avg_secs FROM product_events WHERE event_type = 'playback_session_ended' AND occurred_at >= ${from} AND occurred_at <= ${to} AND metadata->>'durationSeconds' IS NOT NULL`
      );
      const avgSecs = Number((durationRows as any).rows?.[0]?.avg_secs ?? 0);
      const averageSessionMinutes = Math.round(avgSecs / 60 * 10) / 10;

      const topTitleRows = await db.execute(
        sql`SELECT COALESCE(u.subscription_tier, 'free') AS subscription_tier,
                   pe.metadata->>'titleId' AS title_id,
                   b.title AS title,
                   COUNT(*) AS plays
            FROM product_events pe
            JOIN users u ON pe.metadata->>'userId' = u.id
            LEFT JOIN books b ON b.id = pe.metadata->>'titleId'
            WHERE pe.event_type = 'playback_session_started'
              AND pe.occurred_at >= ${from}
              AND pe.occurred_at <= ${to}
              AND pe.metadata->>'titleId' IS NOT NULL
            GROUP BY COALESCE(u.subscription_tier, 'free'), title_id, b.title
            ORDER BY subscription_tier ASC, plays DESC, title_id ASC`
      );

      const topTitlesByTier: Record<string, Array<{ titleId: string; title: string | null; plays: number }>> = { free: [], plus: [], premium: [] };
      for (const r of (topTitleRows as any).rows ?? []) {
        const t = r.subscription_tier || "free";
        if (!topTitlesByTier[t]) topTitlesByTier[t] = [];
        if (topTitlesByTier[t].length < 5) {
          topTitlesByTier[t].push({ titleId: r.title_id, title: r.title ?? null, plays: Number(r.plays) });
        }
      }

      const totalMinutesByTier = minutesByTier;
      const totalMinutes = Object.values(minutesByTier).reduce((s, v) => s + v, 0);

      return { totalMinutesByTier, totalMinutes, topTitlesByTier, averageSessionMinutes, totalSessions };
    } catch (err) {
      console.error("[Analytics] getListeningSummary error:", err);
      return { totalMinutesByTier: { free: 0, plus: 0, premium: 0 }, totalMinutes: 0, topTitlesByTier: { free: [], plus: [], premium: [] }, averageSessionMinutes: 0, totalSessions: 0 };
    }
  },

  async getConversionFunnel(from: Date, to: Date) {
    try {
      const signedUp = await db.execute(
        sql`SELECT COUNT(*) AS cnt FROM product_events WHERE event_type = 'user_signed_up' AND occurred_at >= ${from} AND occurred_at <= ${to}`
      );
      const upgraded = await db.execute(
        sql`SELECT COUNT(*) AS cnt FROM product_events WHERE event_type = 'subscription_upgraded' AND occurred_at >= ${from} AND occurred_at <= ${to}`
      );
      const canceled = await db.execute(
        sql`SELECT COUNT(*) AS cnt FROM product_events WHERE event_type = 'subscription_canceled' AND occurred_at >= ${from} AND occurred_at <= ${to}`
      );

      const signedUpCount = Number((signedUp as any).rows?.[0]?.cnt ?? 0);
      const upgradedCount = Number((upgraded as any).rows?.[0]?.cnt ?? 0);
      const canceledCount = Number((canceled as any).rows?.[0]?.cnt ?? 0);

      const totalActiveRows = await db.execute(
        sql`SELECT COUNT(*) AS cnt FROM users WHERE subscription_tier = 'free' OR subscription_tier IS NULL`
      );
      const freeActiveCount = Number((totalActiveRows as any).rows?.[0]?.cnt ?? 0);

      const signupToUpgradeRate = signedUpCount > 0 ? upgradedCount / signedUpCount : 0;
      const upgradeToRetainRate = upgradedCount > 0 ? 1 - (canceledCount / upgradedCount) : 1;

      return {
        funnel: [
          { step: "Signed Up", count: signedUpCount, dropoffRate: 0 },
          { step: "Free Active", count: freeActiveCount, dropoffRate: signedUpCount > 0 ? 1 - (freeActiveCount / Math.max(signedUpCount, freeActiveCount)) : 0 },
          { step: "Upgraded", count: upgradedCount, dropoffRate: 1 - signupToUpgradeRate },
          { step: "Retained", count: Math.max(0, upgradedCount - canceledCount), dropoffRate: 1 - upgradeToRetainRate },
        ],
        signupToUpgradeRate,
        upgradeToRetainRate,
        cancellationsCount: canceledCount,
      };
    } catch (err) {
      console.error("[Analytics] getConversionFunnel error:", err);
      return { funnel: [], signupToUpgradeRate: 0, upgradeToRetainRate: 0, cancellationsCount: 0 };
    }
  },

  async getAccessibilityUsage() {
    try {
      const rows = await db.execute(
        sql`SELECT COUNT(*) AS total FROM accessibility_preferences`
      );
      const total = Number((rows as any).rows?.[0]?.total ?? 0);
      if (total === 0) return [];

      const profileRows = await db.execute(
        sql`SELECT profile FROM accessibility_preferences WHERE profile IS NOT NULL`
      );

      const featureCounts: Record<string, number> = {};
      const featureLabels: Record<string, string> = {
        highContrast: "High Contrast",
        dyslexiaFont: "Dyslexia Font",
        focusMode: "Focus Mode",
        reducedMotion: "Reduced Motion",
        captions: "Captions",
        largeText: "Large Text",
        screenReader: "Screen Reader",
        colorBlindMode: "Color Blind Mode",
        audioDescriptions: "Audio Descriptions",
        keyboardNav: "Keyboard Navigation",
      };

      for (const r of (profileRows as any).rows ?? []) {
        let profile: Record<string, unknown> = {};
        try {
          profile = typeof r.profile === "string" ? JSON.parse(r.profile) : r.profile ?? {};
        } catch {
          continue;
        }
        for (const [key] of Object.entries(featureLabels)) {
          if (profile[key]) {
            featureCounts[key] = (featureCounts[key] || 0) + 1;
          }
        }
      }

      const result = Object.entries(featureCounts)
        .map(([key, enabledCount]) => ({
          featureKey: key,
          featureName: featureLabels[key] || key,
          enabledCount,
          percentage: total > 0 ? Math.round((enabledCount / total) * 100) : 0,
        }))
        .sort((a, b) => b.enabledCount - a.enabledCount);

      return result;
    } catch (err) {
      console.error("[Analytics] getAccessibilityUsage error:", err);
      return [];
    }
  },
};
