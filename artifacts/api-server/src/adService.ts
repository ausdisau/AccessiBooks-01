/**
 * adService.ts — Ad Service abstraction layer.
 *
 * Defines IAdProvider interface and AdService waterfall class.
 * The waterfall tries each provider in order, returning the first successful response.
 */
import type { VASTTrackingEvents } from "./vastParser";

export interface AdRequestContext {
  // post-roll is a first-class audio placement (book has ended). Providers
  // that don't natively distinguish it from pre-roll/mid-roll may treat it
  // as another audio request, but mediation/analytics/impression logging
  // preserve the distinction so dashboards and frequency caps report
  // post-roll as its own placement.
  adType: "preroll" | "midroll" | "postroll" | "display";
  contentGenre?: string;
  userId?: string;
  placementId?: string;
}

export interface AdProviderResponse {
  id: string;
  provider: string;
  title: string;
  description?: string;
  advertiser?: string;
  audioUrl?: string;
  mimeType?: string;
  duration: number;
  skipOffset?: number;
  imageUrl?: string;
  clickThrough?: string;
  companion?: {
    imageUrl: string;
    clickThrough?: string;
    width: number;
    height: number;
    trackingPixels: string[];
  };
  tracking?: VASTTrackingEvents;
  isProgrammatic: boolean;
  _selfServeImpressionId?: string;
}

export interface IAdProvider {
  readonly name: string;
  requestAd(context: AdRequestContext): Promise<AdProviderResponse | null>;
}

export class AdService {
  private providers: IAdProvider[];

  constructor(providers: IAdProvider[]) {
    this.providers = providers;
  }

  async requestAd(context: AdRequestContext): Promise<AdProviderResponse> {
    for (const provider of this.providers) {
      try {
        const ad = await provider.requestAd(context);
        if (ad) {
          console.log(`[AdService] Filled by provider: ${provider.name} (ad: "${ad.title}")`);
          return ad;
        }
      } catch (err) {
        console.error(`[AdService] Provider ${provider.name} error:`, err);
      }
    }
    throw new Error("[AdService] All providers exhausted — no house ad fallback registered");
  }
}
