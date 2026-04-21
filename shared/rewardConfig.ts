export type RewardType =
  | "ad_light_listening"
  | "premium_sample_chapter"
  | "offline_preview"
  | "premium_feature_demo";

export interface RewardDefinition {
  type: RewardType;
  label: string;
  description: string;
  durationMinutes: number;
}

function envMinutes(envVar: string, fallback: number): number {
  const val = typeof process !== "undefined" ? (process.env?.[envVar] ?? "") : "";
  const parsed = parseInt(val, 10);
  return isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

export const REWARD_CONFIG: Record<RewardType, RewardDefinition> = {
  ad_light_listening: {
    type: "ad_light_listening",
    label: "30 minutes ad-free",
    description: "Enjoy uninterrupted listening for 30 minutes.",
    get durationMinutes() { return envMinutes("REWARD_AD_LIGHT_MINUTES", 30); },
  },
  premium_sample_chapter: {
    type: "premium_sample_chapter",
    label: "One free chapter preview",
    description: "Unlock one chapter from a premium title for 24 hours.",
    get durationMinutes() { return envMinutes("REWARD_SAMPLE_CHAPTER_MINUTES", 24 * 60); },
  },
  offline_preview: {
    type: "offline_preview",
    label: "2-hour offline preview",
    description: "Read offline for 2 hours on supported titles.",
    get durationMinutes() { return envMinutes("REWARD_OFFLINE_PREVIEW_MINUTES", 120); },
  },
  premium_feature_demo: {
    type: "premium_feature_demo",
    label: "60 minutes of HD audio",
    description: "Listen at ultra-high-quality audio for 60 minutes.",
    get durationMinutes() { return envMinutes("REWARD_HD_AUDIO_MINUTES", 60); },
  },
};

export const REWARD_TYPES = Object.keys(REWARD_CONFIG) as RewardType[];

export const REWARDED_AD_PLACEMENT_ID = "rewarded-unlock";

export const REWARD_COOLDOWN_HOURS = 6;
