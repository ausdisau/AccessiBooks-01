/**
 * adDecision.ts — Ad Decision Service with accessibility-aware suppression.
 *
 * Evaluates whether an ad should be served before any provider is consulted.
 * Returns an AdDecision with suppression flags and allowed formats.
 */

import { isAdFormatEnabled, type AdFormat } from "./adFeatureFlags";
import { getPlacement } from "./adPlacementRegistry";

export interface A11yProfile {
  pauseAnimations?: boolean;
  reducedMotion?: boolean;
  focusMode?: boolean;
  focusShell?: boolean;
  captionsOn?: boolean;
  highContrast?: boolean;
  [key: string]: boolean | undefined | number | string;
}

export interface AdDecision {
  serve: boolean;
  reason: string;
  suppressAnimation: boolean;
  suppressAudio: boolean;
  allowedFormats: AdFormat[];
}

const PREMIUM_TIERS = ["plus", "premium", "institutional"];

export class AdDecisionService {
  static decide(
    user: { subscriptionTier?: string | null } | null | undefined,
    placementId: string,
    a11yProfile: A11yProfile,
  ): AdDecision {
    const placement = getPlacement(placementId);

    if (!placement) {
      return {
        serve: false,
        reason: "unknown_placement",
        suppressAnimation: false,
        suppressAudio: false,
        allowedFormats: [],
      };
    }

    const tier = user?.subscriptionTier ?? "free";
    if (PREMIUM_TIERS.includes(tier)) {
      return {
        serve: false,
        reason: "premium_bypass",
        suppressAnimation: false,
        suppressAudio: false,
        allowedFormats: [],
      };
    }

    if (!isAdFormatEnabled(placement.format)) {
      return {
        serve: false,
        reason: "flag_disabled",
        suppressAnimation: false,
        suppressAudio: false,
        allowedFormats: [],
      };
    }

    const suppressedByA11y = placement.a11y_suppress_if.some(
      (key) => !!a11yProfile[key],
    );
    if (suppressedByA11y) {
      const suppressReason = placement.a11y_suppress_if.find(
        (key) => !!a11yProfile[key],
      );
      return {
        serve: false,
        reason: `a11y_${suppressReason}`,
        suppressAnimation: false,
        suppressAudio: false,
        allowedFormats: [],
      };
    }

    const suppressAnimation =
      !!(a11yProfile.pauseAnimations || a11yProfile.reducedMotion || a11yProfile.highContrast);

    let suppressAudio = false;
    let allowedFormats: AdFormat[] = ["audio_preroll", "audio_midroll", "display_banner", "rewarded"];

    if (a11yProfile.focusMode) {
      allowedFormats = allowedFormats.filter(
        (f) => f === "audio_preroll" || f === "audio_midroll",
      );
    }

    if (a11yProfile.captionsOn && placement.id === "player-sidebar") {
      return {
        serve: false,
        reason: "a11y_captionsOn",
        suppressAnimation: false,
        suppressAudio: false,
        allowedFormats: [],
      };
    }

    return {
      serve: true,
      reason: "ok",
      suppressAnimation,
      suppressAudio,
      allowedFormats,
    };
  }
}
