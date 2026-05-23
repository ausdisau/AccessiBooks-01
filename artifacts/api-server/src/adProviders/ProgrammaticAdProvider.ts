/**
 * ProgrammaticAdProvider — wraps existing AdsWizz/Triton VAST logic.
 * Returns null if no env vars are configured or no fill is available.
 */
import type { IAdProvider, AdRequestContext, AdProviderResponse } from "../adService";
import { resolveVAST, selectBestCreative, selectBestCompanion } from "../vastParser";
import type { VASTTrackingEvents } from "../vastParser";

interface VastProvider {
  name: string;
  tagUrl: string;
  timeout: number;
  priority: number;
}

function getVastProviders(): VastProvider[] {
  const providers: VastProvider[] = [];

  const adswizzTag = process.env.ADSWIZZ_TAG_URL;
  if (adswizzTag) {
    providers.push({
      name: "adswizz",
      tagUrl: adswizzTag,
      timeout: parseInt(process.env.ADSWIZZ_TIMEOUT || "3000"),
      priority: 1,
    });
  }

  const tritonTag = process.env.TRITON_TAG_URL;
  if (tritonTag) {
    providers.push({
      name: "triton",
      tagUrl: tritonTag,
      timeout: parseInt(process.env.TRITON_TIMEOUT || "3000"),
      priority: 2,
    });
  }

  const adpersonamTag = process.env.ADPERSONAM_TAG_URL;
  if (adpersonamTag) {
    providers.push({
      name: "adpersonam",
      tagUrl: adpersonamTag,
      timeout: parseInt(process.env.ADPERSONAM_TIMEOUT || "3000"),
      priority: 3,
    });
  }

  return providers.sort((a, b) => a.priority - b.priority);
}

async function fetchFromVastProvider(
  provider: VastProvider,
  adType: string,
  contentGenre?: string,
): Promise<AdProviderResponse | null> {
  try {
    const url = new URL(provider.tagUrl);
    url.searchParams.set("ad_type", adType);
    url.searchParams.set("format", "audio");
    url.searchParams.set("t", Date.now().toString());
    if (contentGenre) url.searchParams.set("genre", contentGenre);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), provider.timeout);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "Accept": "application/xml, text/xml",
        "User-Agent": "AccessiBooks/1.0",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const xml = await response.text();
    const vastResponse = await resolveVAST(xml, provider.timeout);

    if (vastResponse.error || vastResponse.ads.length === 0) return null;

    const ad = vastResponse.ads[0]!;
    const creative = selectBestCreative(ad.creatives);
    if (!creative) return null;

    const companion = selectBestCompanion(ad.companions);

    return {
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
  } catch {
    return null;
  }
}

/**
 * Attempt to fetch a display creative from DISPLAY_TAG_URL (env-driven).
 * Expects the endpoint to return JSON: { id, title, description?, imageUrl?, clickThrough? }
 */
async function fetchDisplayAd(): Promise<AdProviderResponse | null> {
  const displayTagUrl = process.env.DISPLAY_TAG_URL;
  if (!displayTagUrl) {
    console.warn("[ProgrammaticAdProvider] DISPLAY_TAG_URL is not configured — display waterfall will skip programmatic leg");
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(displayTagUrl, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": "AccessiBooks/1.0",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json() as {
      id?: string;
      title?: string;
      description?: string;
      imageUrl?: string;
      clickThrough?: string;
    };

    if (!data.id || !data.title) return null;

    return {
      id: data.id,
      provider: "programmatic-display",
      title: data.title,
      description: data.description,
      imageUrl: data.imageUrl,
      clickThrough: data.clickThrough,
      duration: 0,
      tracking: {
        impression: [], start: [], firstQuartile: [], midpoint: [],
        thirdQuartile: [], complete: [], skip: [], mute: [], unmute: [],
        pause: [], resume: [], error: [], clickTracking: [],
      },
      isProgrammatic: true,
    };
  } catch {
    return null;
  }
}

export class ProgrammaticAdProvider implements IAdProvider {
  readonly name = "programmatic";

  async requestAd(context: AdRequestContext): Promise<AdProviderResponse | null> {
    if (context.adType === "display") return fetchDisplayAd();
    const providers = getVastProviders();
    if (providers.length === 0) return null;

    for (const provider of providers) {
      const ad = await fetchFromVastProvider(provider, context.adType, context.contentGenre);
      if (ad) return ad;
    }

    return null;
  }
}
