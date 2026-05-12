/**
 * AdSlot — Generic slot component for rendering ads by placement ID.
 *
 * Fetches the placement definition from /api/ads/placement/:id,
 * calls /api/ads/request?placement=:id, and renders either
 * AudioAdOverlay, AdBanner, or null based on the placement type.
 */
import { useEffect, useState } from "react";
import { AdBanner } from "./ad-banner";
import { AudioAdOverlay } from "./audio-ad-overlay";
import type { AdResponse } from "@/services/audio-ad-service";

interface PlacementDefinition {
  id: string;
  type: "display" | "audio" | "rewarded";
  dimensions?: { width: number; height: number };
  tier_eligible: string[];
  a11y_suppress_if: string[];
  format: string;
}

export type AdSlotResponse = AdResponse & {
  suppressAnimation?: boolean;
  suppressAudio?: boolean;
};

interface AdSlotProps {
  placementId: string;
  onAdReady?: (ad: AdSlotResponse) => void;
  onAdComplete?: (skipped: boolean) => void;
  onUpgrade?: () => void;
  className?: string;
}

export function AdSlot({
  placementId,
  onAdReady,
  onAdComplete,
  onUpgrade,
  className,
}: AdSlotProps) {
  const [placement, setPlacement] = useState<PlacementDefinition | null>(null);
  const [ad, setAd] = useState<AdSlotResponse | null>(null);
  const [suppressed, setSuppressed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setSuppressed(false);
      setAd(null);

      try {
        const placementRes = await fetch(`/api/ads/placement/${placementId}`, {
          credentials: "include",
        });

        if (!placementRes.ok) {
          setSuppressed(true);
          setLoading(false);
          return;
        }

        const placementData: PlacementDefinition = await placementRes.json();
        if (cancelled) return;
        setPlacement(placementData);

        const adRes = await fetch(
          `/api/ads/request?placement=${encodeURIComponent(placementId)}`,
          { credentials: "include" },
        );

        if (cancelled) return;

        if (adRes.status === 204 || !adRes.ok) {
          setSuppressed(true);
          setLoading(false);
          return;
        }

        const adData: AdSlotResponse = await adRes.json();
        if (cancelled) return;
        setAd(adData);
        onAdReady?.(adData);
      } catch {
        setSuppressed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [placementId]);

  if (loading || suppressed || !ad || !placement) return null;

  if (placement.type === "display") {
    return (
      <div className={className}>
        <AdBanner suppressAnimation={ad.suppressAnimation === true} />
      </div>
    );
  }

  if (placement.type === "audio" || placement.type === "rewarded") {
    const adType: "pre-roll" | "mid-roll" =
      placementId.includes("midroll") ? "mid-roll" : "pre-roll";
    return (
      <div className={className}>
        <AudioAdOverlay
          ad={ad}
          adType={adType}
          onComplete={(skipped) => onAdComplete?.(skipped)}
          onUpgrade={() => onUpgrade?.()}
        />
      </div>
    );
  }

  return null;
}
