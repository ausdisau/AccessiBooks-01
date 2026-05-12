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

export class HouseAdProvider implements IAdProvider {
  readonly name = "house";

  async requestAd(_context: AdRequestContext): Promise<AdProviderResponse> {
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
