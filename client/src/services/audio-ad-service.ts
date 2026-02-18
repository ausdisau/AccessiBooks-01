const HOUSE_ADS = [
  {
    id: "premium-upgrade-1",
    title: "Go Premium",
    message: "Upgrade to Premium for ad-free listening, unlimited skips, and high-quality audio.",
    durationMs: 12000,
    category: "premium-promo",
  },
  {
    id: "premium-upgrade-2",
    title: "Listen Without Limits",
    message: "Premium members enjoy uninterrupted audiobook experiences. Try it free for 7 days!",
    durationMs: 12000,
    category: "premium-promo",
  },
  {
    id: "premium-upgrade-3",
    title: "Offline Listening",
    message: "Download audiobooks for offline listening. Plus 5-device support and 320 kbps audio with Premium.",
    durationMs: 15000,
    category: "premium-promo",
  },
  {
    id: "feature-highlight-1",
    title: "Discover New Books",
    message: "Explore thousands of free audiobooks from LibriVox and Project Gutenberg, right here on AccessiBooks.",
    durationMs: 12000,
    category: "feature",
  },
  {
    id: "feature-highlight-2",
    title: "Reading Challenges",
    message: "Join reading challenges, earn achievements, and track your listening streaks. Stay motivated with gamification!",
    durationMs: 12000,
    category: "feature",
  },
];

export interface AudioAd {
  id: string;
  title: string;
  message: string;
  durationMs: number;
  category: string;
}

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
  midRollCooldownMs: 20 * 60 * 1000,
  skipAfterMs: 5000,
};

interface AdImpression {
  adId: string;
  timestamp: number;
  type: "pre-roll" | "mid-roll";
  completed: boolean;
  skipped: boolean;
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

  getAd(): AudioAd {
    const index = Math.floor(Math.random() * HOUSE_ADS.length);
    return HOUSE_ADS[index];
  }

  get skipAfterMs(): number {
    return this.config.skipAfterMs;
  }

  recordImpression(adId: string, type: "pre-roll" | "mid-roll", completed: boolean, skipped: boolean) {
    const now = Date.now();
    const impression: AdImpression = {
      adId,
      timestamp: now,
      type,
      completed,
      skipped,
    };

    if (type === "pre-roll") {
      this.state.lastPreRollTime = now;
    } else {
      this.state.lastMidRollTime = now;
    }

    this.state.totalImpressions++;
    this.state.impressions.push(impression);
    saveState(this.state);

    fetch("/api/monetization/ad-impression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ adId, adType: type, completed, skipped }),
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

  getStats() {
    return {
      totalImpressions: this.state.totalImpressions,
      sessionPlayCount: this.state.sessionPlayCount,
      recentImpressions: this.state.impressions.slice(-10),
    };
  }
}

export const audioAdService = new AudioAdService();
