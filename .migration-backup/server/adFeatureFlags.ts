/**
 * adFeatureFlags.ts — In-memory feature flag store for ad formats.
 *
 * Flags can be overridden via environment variables:
 *   AD_FLAG_AUDIO_PREROLL_ENABLED  (default: true)
 *   AD_FLAG_AUDIO_MIDROLL_ENABLED  (default: true)
 *   AD_FLAG_DISPLAY_BANNER_ENABLED (default: true)
 *   AD_FLAG_REWARDED_ENABLED       (default: true)
 */

export type AdFormat = "audio_preroll" | "audio_midroll" | "display_banner" | "rewarded";

function parseBool(envVar: string | undefined, defaultValue: boolean): boolean {
  if (envVar === undefined) return defaultValue;
  return envVar.toLowerCase() !== "false" && envVar !== "0";
}

const flags: Record<AdFormat, boolean> = {
  audio_preroll: parseBool(process.env.AD_FLAG_AUDIO_PREROLL_ENABLED, true),
  audio_midroll: parseBool(process.env.AD_FLAG_AUDIO_MIDROLL_ENABLED, true),
  display_banner: parseBool(process.env.AD_FLAG_DISPLAY_BANNER_ENABLED, true),
  rewarded: parseBool(process.env.AD_FLAG_REWARDED_ENABLED, true),
};

export function isAdFormatEnabled(format: AdFormat): boolean {
  return flags[format] ?? false;
}

export function setAdFormatFlag(format: AdFormat, enabled: boolean): void {
  flags[format] = enabled;
}

export function getAllFlags(): Record<AdFormat, boolean> {
  return { ...flags };
}
