import { Router, Request, Response } from "express";
import { resolveVAST, selectBestCreative, selectBestCompanion, type VASTAd, type VASTCreative, type VASTCompanion, type VASTTrackingEvents } from "./vastParser";
import { selectSelfServeAd, recordImpression, recordImpressionEvent } from "./selfServeAds";

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
  tracking: VASTTrackingEvents;
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

const HOUSE_ADS: HouseAd[] = [
  {
    id: "house-premium-1",
    provider: "house",
    title: "Go Premium",
    description: "Upgrade to Premium for ad-free listening, unlimited skips, and high-quality audio.",
    duration: 12,
    isProgrammatic: false,
  },
  {
    id: "house-premium-2",
    provider: "house",
    title: "Listen Without Limits",
    description: "Premium members enjoy uninterrupted audiobook experiences. Try it free for 7 days!",
    duration: 12,
    isProgrammatic: false,
  },
  {
    id: "house-premium-3",
    provider: "house",
    title: "Offline Listening",
    description: "Download audiobooks for offline listening. Plus 5-device support and 320 kbps audio with Premium.",
    duration: 15,
    isProgrammatic: false,
  },
  {
    id: "house-feature-1",
    provider: "house",
    title: "Discover New Books",
    description: "Explore thousands of free audiobooks from LibriVox and Project Gutenberg, right here on AccessiBooks.",
    duration: 12,
    isProgrammatic: false,
  },
  {
    id: "house-feature-2",
    provider: "house",
    title: "Reading Challenges",
    description: "Join reading challenges, earn achievements, and track your listening streaks. Stay motivated with gamification!",
    duration: 12,
    isProgrammatic: false,
  },
];

function buildTagUrl(baseUrl: string, params: Record<string, string>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function getProviders(): AdProvider[] {
  const providers: AdProvider[] = [];

  const adswizzTag = process.env.ADSWIZZ_TAG_URL;
  if (adswizzTag) {
    providers.push({
      name: "adswizz",
      enabled: true,
      priority: 1,
      tagUrl: adswizzTag,
      timeout: parseInt(process.env.ADSWIZZ_TIMEOUT || "3000"),
    });
  }

  const tritonTag = process.env.TRITON_TAG_URL;
  if (tritonTag) {
    providers.push({
      name: "triton",
      enabled: true,
      priority: 2,
      tagUrl: tritonTag,
      timeout: parseInt(process.env.TRITON_TIMEOUT || "3000"),
    });
  }

  const adpersonamTag = process.env.ADPERSONAM_TAG_URL;
  if (adpersonamTag) {
    providers.push({
      name: "adpersonam",
      enabled: true,
      priority: 3,
      tagUrl: adpersonamTag,
      timeout: parseInt(process.env.ADPERSONAM_TIMEOUT || "3000"),
    });
  }

  return providers.sort((a, b) => a.priority - b.priority);
}

async function fetchVASTFromProvider(
  provider: AdProvider,
  adType: "preroll" | "midroll",
  contentGenre?: string,
): Promise<ProgrammaticAd | null> {
  try {
    const params: Record<string, string> = {
      ad_type: adType,
      format: "audio",
      t: Date.now().toString(),
    };
    if (contentGenre) params.genre = contentGenre;

    const tagUrl = buildTagUrl(provider.tagUrl, params);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), provider.timeout);

    const response = await fetch(tagUrl, {
      signal: controller.signal,
      headers: {
        "Accept": "application/xml, text/xml",
        "User-Agent": "AccessiBooks/1.0",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`[AdMediation] ${provider.name}: HTTP ${response.status}`);
      return null;
    }

    const xml = await response.text();
    const vastResponse = await resolveVAST(xml, provider.timeout);

    if (vastResponse.error || vastResponse.ads.length === 0) {
      console.log(`[AdMediation] ${provider.name}: No fill - ${vastResponse.error || "empty response"}`);
      return null;
    }

    const ad = vastResponse.ads[0]!;
    const creative = selectBestCreative(ad.creatives);
    if (!creative) {
      console.log(`[AdMediation] ${provider.name}: No suitable audio creative`);
      return null;
    }

    const companion = selectBestCompanion(ad.companions);

    const programmaticAd: ProgrammaticAd = {
      id: ad.id,
      provider: provider.name,
      title: ad.title,
      description: ad.description,
      advertiser: ad.advertiser,
      audioUrl: creative.mediaUrl,
      mimeType: creative.mimeType,
      duration: ad.duration || creative.duration,
      skipOffset: ad.skipOffset,
      companion: companion && companion.imageUrl ? {
        imageUrl: companion.imageUrl,
        clickThrough: companion.clickThrough,
        width: companion.width,
        height: companion.height,
        trackingPixels: companion.trackingPixels,
      } : undefined,
      tracking: ad.tracking,
      isProgrammatic: true,
    };

    console.log(`[AdMediation] ${provider.name}: Filled ad "${ad.title}" (${ad.duration}s)`);
    return programmaticAd;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.log(`[AdMediation] ${provider.name}: Timeout after ${provider.timeout}ms`);
    } else {
      console.log(`[AdMediation] ${provider.name}: Error - ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  }
}

async function requestAd(adType: "preroll" | "midroll", contentGenre?: string, userId?: string): Promise<AdResponse & { _selfServeImpressionId?: string }> {
  const providers = getProviders();

  for (const provider of providers) {
    if (!provider.enabled) continue;
    const ad = await fetchVASTFromProvider(provider, adType, contentGenre);
    if (ad) return ad;
  }

  try {
    const selfServeAd = await selectSelfServeAd(adType, contentGenre);
    if (selfServeAd) {
      const impressionId = await recordImpression(
        selfServeAd.campaignId,
        selfServeAd.creativeId,
        userId,
        adType,
      );

      console.log(`[AdMediation] Self-serve ad filled: "${selfServeAd.title}" (CPM: $${(selfServeAd.cpmBidCents / 100).toFixed(2)})`);

      return {
        id: `selfserve-${selfServeAd.creativeId}`,
        provider: "self-serve",
        title: selfServeAd.title,
        advertiser: selfServeAd.advertiser,
        audioUrl: selfServeAd.audioUrl,
        mimeType: selfServeAd.mimeType,
        duration: selfServeAd.duration,
        companion: selfServeAd.companionImageUrl ? {
          imageUrl: selfServeAd.companionImageUrl,
          clickThrough: selfServeAd.clickThroughUrl,
          width: 300,
          height: 250,
          trackingPixels: [],
        } : undefined,
        tracking: {
          impression: [], start: [], firstQuartile: [], midpoint: [],
          thirdQuartile: [], complete: [], skip: [], mute: [], unmute: [],
          pause: [], resume: [], error: [], clickTracking: [],
        },
        isProgrammatic: true,
        _selfServeImpressionId: impressionId,
      };
    }
  } catch (err) {
    console.error("[AdMediation] Self-serve ad error:", err);
  }

  console.log("[AdMediation] All providers exhausted, serving house ad");
  const houseAd = HOUSE_ADS[Math.floor(Math.random() * HOUSE_ADS.length)]!;
  return houseAd;
}

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

export function registerAdMediationRoutes(router: Router) {
  router.get("/api/ads/request", async (req: Request, res: Response) => {
    try {
      const adType = (req.query.type as string) === "midroll" ? "midroll" : "preroll";
      const contentGenre = req.query.genre as string | undefined;

      analytics.totalRequests++;
      analytics.lastRequestTime = Date.now();

      const ad = await requestAd(adType, contentGenre);

      if (ad.isProgrammatic) {
        analytics.providerFills[ad.provider] = (analytics.providerFills[ad.provider] || 0) + 1;
      } else {
        analytics.houseFills++;
      }

      res.json(ad);
    } catch (err) {
      analytics.errors++;
      console.error("[AdMediation] Request error:", err);
      const fallback = HOUSE_ADS[Math.floor(Math.random() * HOUSE_ADS.length)]!;
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
    const providers = getProviders();
    const status = providers.map(p => ({
      name: p.name,
      enabled: p.enabled,
      priority: p.priority,
      timeout: p.timeout,
      configured: true,
    }));

    const hasAny = providers.length > 0;
    status.push({
      name: "house",
      enabled: true,
      priority: 999,
      timeout: 0,
      configured: true,
    });

    res.json({
      providers: status,
      activeCount: providers.filter(p => p.enabled).length,
      hasProgrammatic: hasAny,
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
