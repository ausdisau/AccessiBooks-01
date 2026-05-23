export interface VASTTracking {
  impression: string[];
  start: string[];
  firstQuartile: string[];
  midpoint: string[];
  thirdQuartile: string[];
  complete: string[];
  skip: string[];
  mute: string[];
  unmute: string[];
  pause: string[];
  resume: string[];
  error: string[];
  clickThrough?: string;
  clickTracking: string[];
}

export interface AdCompanion {
  imageUrl: string;
  clickThrough?: string;
  width: number;
  height: number;
  trackingPixels: string[];
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
  companion?: AdCompanion;
  tracking: VASTTracking;
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

interface AdConfig {
  preRollEnabled: boolean;
  midRollEnabled: boolean;
  preRollCooldownMs: number;
  midRollCooldownMs: number;
  skipAfterMs: number;
}

const DEFAULT_CONFIG: AdConfig = {
  preRollEnabled: true,
  midRollEnabled: true,
  preRollCooldownMs: 30 * 60 * 1000,
  midRollCooldownMs: 15 * 60 * 1000,
  skipAfterMs: 5000,
};

interface AdImpression {
  adId: string;
  timestamp: number;
  type: "pre-roll" | "mid-roll" | "post-roll";
  completed: boolean;
  skipped: boolean;
  provider: string;
}

const STORAGE_KEY = "accessibooks_ad_state";

interface AdState {
  lastPreRollTime: number;
  lastMidRollTime: number;
  totalImpressions: number;
  impressions: AdImpression[];
  sessionPlayCount: number;
}

function loadState(): AdState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {
    lastPreRollTime: 0,
    lastMidRollTime: 0,
    totalImpressions: 0,
    impressions: [],
    sessionPlayCount: 0,
  };
}

function saveState(state: AdState) {
  try {
    const trimmed = {
      ...state,
      impressions: state.impressions.slice(-50),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
}

export class AudioAdService {
  private config: AdConfig;
  private state: AdState;
  private audioContext: AudioContext | null = null;
  private currentOscillator: OscillatorNode | null = null;
  private currentGain: GainNode | null = null;
  private firedQuartiles: Set<string> = new Set();

  constructor(config: Partial<AdConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = loadState();
  }

  shouldShowPreRoll(isPremium: boolean): boolean {
    if (isPremium) return false;
    if (!this.config.preRollEnabled) return false;
    const now = Date.now();
    const timeSinceLastAd = now - this.state.lastPreRollTime;
    if (this.state.sessionPlayCount === 0) return true;
    return timeSinceLastAd >= this.config.preRollCooldownMs;
  }

  shouldShowMidRoll(isPremium: boolean): boolean {
    if (isPremium) return false;
    if (!this.config.midRollEnabled) return false;
    const now = Date.now();
    const timeSinceLastAd = now - this.state.lastMidRollTime;
    return timeSinceLastAd >= this.config.midRollCooldownMs;
  }

  async checkRewardedBypass(): Promise<boolean> {
    try {
      const res = await fetch("/api/ads/rewarded/status", { credentials: "include" });
      if (!res.ok) return false;
      const data: { active: boolean } = await res.json();
      return data.active;
    } catch {
      return false;
    }
  }

  async shouldShowPreRollAsync(isPremium: boolean): Promise<boolean> {
    if (!this.shouldShowPreRoll(isPremium)) return false;
    const rewarded = await this.checkRewardedBypass();
    return !rewarded;
  }

  async shouldShowMidRollAsync(isPremium: boolean): Promise<boolean> {
    if (!this.shouldShowMidRoll(isPremium)) return false;
    const rewarded = await this.checkRewardedBypass();
    return !rewarded;
  }

  /** Exposes the runtime feature-flag state so consumers can pass it to hooks. */
  get featureFlags(): { preRoll: boolean; midRoll: boolean } {
    return {
      preRoll: this.config.preRollEnabled,
      midRoll: this.config.midRollEnabled,
    };
  }

  async requestAd(adType: "pre-roll" | "mid-roll", contentGenre?: string): Promise<AdResponse> {
    try {
      const type = adType === "pre-roll" ? "preroll" : "midroll";
      const params = new URLSearchParams({ type });
      if (contentGenre) params.set("genre", contentGenre);

      const response = await fetch(`/api/ads/request?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      console.warn("[AudioAdService] Failed to fetch ad, using house ad:", err);
      return this.getHouseAd();
    }
  }

  private getHouseAd(): HouseAd {
    const houseAds: HouseAd[] = [
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
    ];
    return houseAds[Math.floor(Math.random() * houseAds.length)]!;
  }

  get skipAfterMs(): number {
    return this.config.skipAfterMs;
  }

  getSkipOffsetMs(ad: AdResponse): number {
    if (ad.isProgrammatic && ad.skipOffset !== undefined) {
      return ad.skipOffset * 1000;
    }
    return this.config.skipAfterMs;
  }

  async fireTrackingPixels(urls: string[]): Promise<void> {
    if (urls.length === 0) return;
    try {
      await fetch("/api/ads/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
    } catch (err) {
      console.warn("[AudioAdService] Tracking pixel fire failed:", err);
    }
  }

  async fireAdEvent(ad: AdResponse, event: keyof VASTTracking): Promise<void> {
    if (!ad.isProgrammatic) return;
    const urls = ad.tracking[event];
    if (Array.isArray(urls) && urls.length > 0) {
      await this.fireTrackingPixels(urls);
    }
  }

  checkQuartileProgress(ad: AdResponse, currentTime: number, duration: number): void {
    if (!ad.isProgrammatic || duration <= 0) return;

    const progress = currentTime / duration;
    const adId = ad.id;

    if (progress >= 0.25 && !this.firedQuartiles.has(`${adId}_firstQuartile`)) {
      this.firedQuartiles.add(`${adId}_firstQuartile`);
      this.fireAdEvent(ad, "firstQuartile");
    }
    if (progress >= 0.5 && !this.firedQuartiles.has(`${adId}_midpoint`)) {
      this.firedQuartiles.add(`${adId}_midpoint`);
      this.fireAdEvent(ad, "midpoint");
    }
    if (progress >= 0.75 && !this.firedQuartiles.has(`${adId}_thirdQuartile`)) {
      this.firedQuartiles.add(`${adId}_thirdQuartile`);
      this.fireAdEvent(ad, "thirdQuartile");
    }
  }

  resetQuartileTracking(): void {
    this.firedQuartiles.clear();
  }

  recordImpression(adId: string, type: "pre-roll" | "mid-roll" | "post-roll", completed: boolean, skipped: boolean, provider: string = "house") {
    const now = Date.now();
    const impression: AdImpression = {
      adId,
      timestamp: now,
      type,
      completed,
      skipped,
      provider,
    };

    if (type === "pre-roll") {
      this.state.lastPreRollTime = now;
    } else if (type === "mid-roll") {
      this.state.lastMidRollTime = now;
    }
    // post-roll: book has ended — no cooldown state to update

    this.state.totalImpressions++;
    this.state.impressions.push(impression);
    saveState(this.state);

    fetch("/api/monetization/ad-impression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ adId, adType: type, completed, skipped, provider }),
    }).catch(() => {});
  }

  incrementPlayCount() {
    this.state.sessionPlayCount++;
    saveState(this.state);
  }

  playAdChime(): Promise<void> {
    return new Promise((resolve) => {
      try {
        if (!this.audioContext) {
          this.audioContext = new window.AudioContext();
        }
        const ctx = this.audioContext;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        const now = ctx.currentTime;
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.15);
        osc.frequency.setValueAtTime(783.99, now + 0.3);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gain.gain.setValueAtTime(0.3, now + 0.35);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        this.currentOscillator = osc;
        this.currentGain = gain;
        osc.start(now);
        osc.stop(now + 0.5);
        osc.onended = () => {
          this.currentOscillator = null;
          this.currentGain = null;
          resolve();
        };
      } catch {
        resolve();
      }
    });
  }

  stopChime() {
    try {
      if (this.currentOscillator) {
        this.currentOscillator.stop();
        this.currentOscillator = null;
      }
    } catch {}
  }

  shouldShowPodcastPreRoll(isPaid: boolean): boolean {
    if (isPaid) return false;
    if (!this.config.preRollEnabled) return false;
    return true;
  }

  shouldShowPodcastMidRoll(isPaid: boolean, elapsedMs: number, lastMidRollMs: number): boolean {
    if (isPaid) return false;
    if (!this.config.midRollEnabled) return false;
    const PODCAST_MIDROLL_INTERVAL = 15 * 60 * 1000;
    return (elapsedMs - lastMidRollMs) >= PODCAST_MIDROLL_INTERVAL;
  }

  async requestPodcastAd(adType: "pre-roll" | "mid-roll", podcastGenre?: string): Promise<AdResponse> {
    return this.requestAd(adType, podcastGenre || "podcast");
  }

  recordPodcastImpression(adId: string, type: "pre-roll" | "mid-roll", completed: boolean, skipped: boolean, provider: string = "house", podcastGenre?: string) {
    this.recordImpression(adId, type, completed, skipped, provider);

    fetch("/api/monetization/ad-impression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ adId, adType: type, completed, skipped, provider, contentType: "podcast", genre: podcastGenre }),
    }).catch(() => {});
  }

  getStats() {
    return {
      totalImpressions: this.state.totalImpressions,
      sessionPlayCount: this.state.sessionPlayCount,
      recentImpressions: this.state.impressions.slice(-10),
    };
  }
}

export const audioAdService = new AudioAdService();
