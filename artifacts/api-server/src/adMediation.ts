/**
 * adMediation.ts — Ad Mediation Layer (audio + display in-content)
 *
 * Responsibility: Unified waterfall ad selection for all in-content ad types:
 *   1. Entitlement check (shouldServeAds) — paid/institutional tiers and ad-free
 *      books are short-circuited with 204 before any provider work.
 *   2. Server-side frequency cap — per-placement cap enforced via in-memory Map.
 *   3. AdDecisionService.decide() — server-side eligibility gate (a11y, flags).
 *   4. AdService waterfall: ProgrammaticAdProvider → SelfServeAdProvider → HouseAdProvider.
 *      - Audio types (preroll/midroll/postroll): programmatic VAST → self-serve audio → house.
 *      - Display type: programmatic display (DISPLAY_TAG_URL) → self-serve display
 *        (campaigns with companionImageUrl) → house display creatives.
 *
 * Routes registered:
 *   - GET /api/ads/request         — request an ad (preroll/midroll/postroll/display)
 *   - GET /api/ads/placement/:id   — get placement registry entry
 *   - POST /api/ads/rewarded/complete — record rewarded ad completion
 *   - GET /api/ads/rewarded/status — get active rewarded period status
 *   - POST /api/ads/tracking       — fire VAST tracking pixels server-side
 *   - GET /api/ads/providers       — list configured providers and their status
 *   - GET /api/ads/analytics       — in-memory ad request analytics
 *
 * NOT responsible for ad campaign CRUD — see selfServeAds.ts.
 * NOT responsible for ad platform management UI — see adPlatformRoutes.ts.
 */
import { Router, type Request, type Response } from "express";
import { AdService } from "./adService";
import { AdDecisionService } from "./adDecision";
import { ProgrammaticAdProvider } from "./adProviders/ProgrammaticAdProvider";
import { SelfServeAdProvider } from "./adProviders/SelfServeAdProvider";
import { HouseAdProvider } from "./adProviders/HouseAdProvider";
import { registerPlacementRoutes, getPlacement } from "./adPlacementRegistry";
import { registerRewardedRoutes } from "./adRewards";
import { getAllFlags } from "./adFeatureFlags";
import { resolveEntitlementOverride, getUserEffectiveTier, shouldServeAds } from "./entitlements";
import { storage } from "./storage";
import { analyticsService } from "./analyticsService";
import { applyLowBandwidthSuppression } from "./adSuppression";
export { applyLowBandwidthSuppression } from "./adSuppression";

export interface AdProvider {
  name: string;
  enabled: boolean;
  priority: number;
  tagUrl: string;
  timeout: number;
}

export interface ProgrammaticAd {
  id: string;
  provider: string;
  title: string;
  description?: string;
  advertiser?: string;
  audioUrl: string;
  mimeType: string;
  duration: number;
  skipOffset?: number;
  companion?: {
    imageUrl: string;
    clickThrough?: string;
    width: number;
    height: number;
    trackingPixels: string[];
  };
  tracking: import("./vastParser").VASTTrackingEvents;
  isProgrammatic: true;
}

export interface HouseAd {
  id: string;
  provider: "house";
  title: string;
  description: string;
  duration: number;
  isProgrammatic: false;
}

export type AdResponse = ProgrammaticAd | HouseAd;

const adService = new AdService([
  new ProgrammaticAdProvider(),
  new SelfServeAdProvider(),
  new HouseAdProvider(),
]);

interface AdAnalytics {
  totalRequests: number;
  providerFills: Record<string, number>;
  houseFills: number;
  errors: number;
  lastRequestTime: number;
}

const analytics: AdAnalytics = {
  totalRequests: 0,
  providerFills: {},
  houseFills: 0,
  errors: 0,
  lastRequestTime: 0,
};

// ── Server-side frequency cap ─────────────────────────────────────────────────
// In-memory store: key = "userId:placementId", value = last served timestamp (ms).
// Survives across requests within one server process lifetime.
const serverFrequencyCaps = new Map<string, number>();

function isServerCapExceeded(userId: string, placementId: string, capMinutes: number): boolean {
  const last = serverFrequencyCaps.get(`${userId}:${placementId}`) ?? 0;
  return (Date.now() - last) < capMinutes * 60 * 1000;
}

function recordServerCap(userId: string, placementId: string): void {
  serverFrequencyCaps.set(`${userId}:${placementId}`, Date.now());
}
// ─────────────────────────────────────────────────────────────────────────────

async function getA11yProfile(req: Request): Promise<Record<string, boolean | undefined>> {
  try {
    const user = (req as any).user;
    if (!user?.id) return {};

    const response = await fetch(
      `http://localhost:${process.env.PORT || 8080}/api/a11y/preferences`,
      {
        headers: {
          Cookie: req.headers.cookie || "",
        },
      },
    );
    if (!response.ok) return {};
    const data = await response.json() as { profile?: Record<string, any> };
    return data.profile ?? {};
  } catch {
    return {};
  }
}

export function registerAdMediationRoutes(router: Router) {
  registerPlacementRoutes(router);
  registerRewardedRoutes(router);

  router.get("/api/ads/request", async (req: Request, res: Response) => {
    try {
      // Ad-safety: require authentication, and never serve ads to paid (Plus or
      // Premium) subscribers. Unauthenticated callers receive 401; paid users
      // receive 204 No Content; free users receive the ad.
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const tier = (req.user as { subscriptionTier?: string }).subscriptionTier;
      if (tier === "plus" || tier === "premium") {
        return res.status(204).end();
      }

      const rawType = req.query.type as string | undefined;
      const adType = rawType === "midroll" ? "midroll"
        : rawType === "postroll" ? "postroll"
        : rawType === "display" ? "display"
        : "preroll";
      const contentGenre = req.query.genre as string | undefined;
      const bookId = req.query.bookId as string | undefined;
      const placementId = (req.query.placement as string) ||
        (adType === "midroll" ? "audio-midroll"
        : adType === "postroll" ? "audio-postroll"
        : adType === "display" ? "ebook-banner"
        : "audio-preroll");
      const user = (req as any).user ?? null;

      // ── Entitlement check: paid / institutional tiers + ad-free books ─────
      const userId: string | undefined = user?.claims?.sub || user?.id;
      const overrideTier = userId ? await resolveEntitlementOverride(userId, bookId) : null;
      const dbUser = userId ? await storage.getUser(userId) : null;
      const effectiveTier = getUserEffectiveTier(dbUser, overrideTier);
      const book = bookId ? await storage.getBook(bookId) : undefined;

      if (!shouldServeAds(user, effectiveTier, book)) {
        return res.status(204).end();
      }
      // ─────────────────────────────────────────────────────────────────────

      // ── Server-side frequency cap ─────────────────────────────────────────
      const placement = getPlacement(placementId);
      const capMinutes = placement?.frequencyCapMinutes;
      if (capMinutes && userId && isServerCapExceeded(userId, placementId, capMinutes)) {
        console.log(`[AdMediation] Frequency cap active for ${userId}:${placementId} (${capMinutes}min)`);
        return res.status(204).end();
      }
      // ─────────────────────────────────────────────────────────────────────

      analytics.totalRequests++;
      analytics.lastRequestTime = Date.now();

      const a11yProfile = await getA11yProfile(req);
      const decision = AdDecisionService.decide(user, placementId, a11yProfile);

      if (!decision.serve) {
        console.log(`[AdMediation] Suppressed: reason=${decision.reason} placement=${placementId}`);
        return res.status(204).end();
      }

      // All ad types (audio and display) flow through the same waterfall:
      //   ProgrammaticAdProvider — returns null for display (no VAST display providers)
      //   SelfServeAdProvider    — returns null for display (no self-serve display campaigns)
      //   HouseAdProvider        — handles display via adType === "display" check
      // post-roll is preserved as a first-class type so providers that care
      // about the placement (analytics, frequency, billing) see the true type
      // instead of a downgraded preroll.
      const context = {
        adType: adType as "preroll" | "midroll" | "postroll" | "display",
        contentGenre,
        userId: user?.id,
        placementId,
      };

      const ad = await adService.requestAd(context);
      // Apply Low-Bandwidth + suppress-animated filtering via the shared
      // helper so the same logic is exercised by unit tests in
      // tests/low-bandwidth-mode.test.ts.
      applyLowBandwidthSuppression(ad, {
        lowBandwidthMode: (a11yProfile as { lowBandwidthMode?: boolean }).lowBandwidthMode === true,
        suppressAnimatedAds: a11yProfile.suppressAnimatedAds === true,
        suppressAnimationDecision: decision.suppressAnimation === true,
      });

      if (ad.isProgrammatic) {
        analytics.providerFills[ad.provider] = (analytics.providerFills[ad.provider] || 0) + 1;
      } else {
        analytics.houseFills++;
      }

      analyticsService.track("ad_impression_served", "free", {
        placement: adType,
        adFormat: adType === "display" ? "display" : "audio",
      });

      // Record server-side frequency cap so subsequent requests within the cap
      // window receive 204 instead of another ad impression.
      if (capMinutes && userId) {
        recordServerCap(userId, placementId);
      }

      const responseBody = {
        ...ad,
        suppressAnimation: decision.suppressAnimation,
        suppressAudio: decision.suppressAudio,
      };

      res.json(responseBody);
    } catch (err) {
      analytics.errors++;
      console.error("[AdMediation] Request error:", err);
      const fallback: HouseAd = {
        id: "house-premium-1",
        provider: "house",
        title: "Go Premium",
        description: "Upgrade to Premium for ad-free listening, unlimited skips, and high-quality audio.",
        duration: 12,
        isProgrammatic: false,
      };
      analytics.houseFills++;
      res.json(fallback);
    }
  });

  router.post("/api/ads/tracking", async (req: Request, res: Response) => {
    try {
      const { urls } = req.body as { urls: string[] };
      if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ error: "Missing urls array" });
      }

      const results = await Promise.allSettled(
        urls.map(url =>
          fetch(url, {
            method: "GET",
            headers: { "User-Agent": "AccessiBooks/1.0" },
          }).catch(() => null)
        )
      );

      const fired = results.filter(r => r.status === "fulfilled").length;
      res.json({ fired, total: urls.length });
    } catch (err) {
      console.error("[AdMediation] Tracking error:", err);
      res.status(500).json({ error: "Tracking failed" });
    }
  });

  router.get("/api/ads/providers", (_req: Request, res: Response) => {
    const programmaticEnvs = [
      process.env.ADSWIZZ_TAG_URL,
      process.env.TRITON_TAG_URL,
      process.env.ADPERSONAM_TAG_URL,
    ].filter(Boolean);

    const status = [
      ...programmaticEnvs.map((url, i) => ({
        name: ["adswizz", "triton", "adpersonam"][i],
        enabled: true,
        priority: i + 1,
        timeout: 3000,
        configured: true,
      })),
      { name: "self-serve", enabled: true, priority: 10, timeout: 5000, configured: true },
      { name: "house", enabled: true, priority: 999, timeout: 0, configured: true },
    ];

    res.json({
      providers: status,
      activeCount: status.filter(p => p.enabled).length,
      hasProgrammatic: programmaticEnvs.length > 0,
      flags: getAllFlags(),
    });
  });

  router.get("/api/ads/analytics", (_req: Request, res: Response) => {
    res.json({
      ...analytics,
      fillRate: analytics.totalRequests > 0
        ? ((analytics.totalRequests - analytics.houseFills) / analytics.totalRequests * 100).toFixed(1) + "%"
        : "N/A",
    });
  });
}
