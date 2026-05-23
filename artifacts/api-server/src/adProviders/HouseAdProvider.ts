/**
 * HouseAdProvider — always-available fallback returning "Go Premium" house creative.
 */
import type { IAdProvider, AdRequestContext, AdProviderResponse } from "../adService";

const HOUSE_ADS: Array<{ id: string; title: string; description: string; duration: number }> = [
  {
    id: "house-premium-1",
    title: "Go Premium",
    description: "Upgrade to Premium for ad-free listening, unlimited skips, and high-quality audio.",
    duration: 12,
  },
  {
    id: "house-premium-2",
    title: "Listen Without Limits",
    description: "Premium members enjoy uninterrupted audiobook experiences. Try it free for 7 days!",
    duration: 12,
  },
  {
    id: "house-premium-3",
    title: "Offline Listening",
    description: "Download audiobooks for offline listening. Plus 5-device support and 320 kbps audio with Premium.",
    duration: 15,
  },
  {
    id: "house-feature-1",
    title: "Discover New Books",
    description: "Explore thousands of free audiobooks from LibriVox and Project Gutenberg, right here on AccessiBooks.",
    duration: 12,
  },
  {
    id: "house-feature-2",
    title: "Reading Challenges",
    description: "Join reading challenges, earn achievements, and track your listening streaks. Stay motivated with gamification!",
    duration: 12,
  },
];

const HOUSE_DISPLAY_ADS: Array<{ id: string; title: string; description: string; imageUrl?: string; clickThrough?: string }> = [
  {
    id: "house-display-premium-1",
    title: "Go Ad-Free — Upgrade to Premium",
    description: "Enjoy uninterrupted reading and listening. Unlimited books, no ads.",
    clickThrough: "/subscribe",
  },
  {
    id: "house-display-feature-1",
    title: "Discover 3,000+ Free Audiobooks",
    description: "LibriVox, Project Gutenberg, Internet Archive — all in one place.",
    clickThrough: "/library",
  },
  {
    id: "house-display-feature-2",
    title: "Reading Challenges & Streaks",
    description: "Earn XP, achievements, and badges. Stay motivated with gamification!",
    clickThrough: "/challenges",
  },
  {
    id: "house-display-feature-3",
    title: "Easy English Mode",
    description: "Simplified text for accessible reading. Available for every book.",
    clickThrough: "/accessibility",
  },
  {
    id: "house-display-premium-2",
    title: "Offline Reading — Go Premium",
    description: "Download books for offline access. Perfect for commutes and travel.",
    clickThrough: "/subscribe",
  },
];

export class HouseAdProvider implements IAdProvider {
  readonly name = "house";

  async requestAd(context: AdRequestContext): Promise<AdProviderResponse> {
    const isDisplay = context.adType === "display" || context.placementId?.startsWith("ebook-");
    if (isDisplay) {
      const ad = HOUSE_DISPLAY_ADS[Math.floor(Math.random() * HOUSE_DISPLAY_ADS.length)]!;
      return {
        id: ad.id,
        provider: "house",
        title: ad.title,
        description: ad.description,
        duration: 0,
        isProgrammatic: false,
        imageUrl: ad.imageUrl,
        clickThrough: ad.clickThrough,
      };
    }

    const ad = HOUSE_ADS[Math.floor(Math.random() * HOUSE_ADS.length)]!;
    return {
      id: ad.id,
      provider: "house",
      title: ad.title,
      description: ad.description,
      duration: ad.duration,
      isProgrammatic: false,
    };
  }
}
