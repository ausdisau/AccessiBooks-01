import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Gift } from "lucide-react";
import type { RewardOffer } from "@/hooks/use-rewarded-ad";

const DISMISSED_KEY = "rewarded_ad_offer_dismissed";

interface RewardedAdOfferProps {
  offer: RewardOffer;
  onAccept: () => void;
  onDismiss: () => void;
}

export function RewardedAdOffer({ offer, onAccept, onDismiss }: RewardedAdOfferProps) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const announcedRef = useRef(false);
  const [announced, setAnnounced] = useState(false);

  useEffect(() => {
    if (!dismissed && !announcedRef.current) {
      announcedRef.current = true;
      const t = setTimeout(() => setAnnounced(true), 500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [dismissed]);

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
    setDismissed(true);
    onDismiss();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") handleDismiss();
  };

  if (dismissed) return null;

  return (
    <>
      {announced && (
        <div
          aria-live="assertive"
          aria-atomic="true"
          className="sr-only"
        >
          An offer is available: {offer.label}. Watch a short ad to unlock this perk.
        </div>
      )}
      <article
        role="region"
        aria-labelledby="reward-offer-heading"
        className="rounded-xl border border-primary/30 bg-card p-4 flex flex-col gap-3 shadow-sm"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center">
            <Gift className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="reward-offer-heading" className="text-sm font-semibold text-foreground">
              Unlock {offer.label}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Watch one short 15–30 second ad. Your listening resumes automatically afterwards.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              This perk lasts {offer.durationMinutes} minutes from when you accept.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={onAccept}
            aria-label={`Watch ad and unlock: ${offer.label}`}
          >
            Watch ad and unlock perk
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            aria-label="No thanks, dismiss this offer"
          >
            No thanks
          </Button>
        </div>
      </article>
    </>
  );
}

export function useRewardOfferDismissed() {
  return {
    isDismissed: (() => {
      try { return sessionStorage.getItem(DISMISSED_KEY) === "1"; } catch { return false; }
    })(),
    reset: () => {
      try { sessionStorage.removeItem(DISMISSED_KEY); } catch {}
    },
  };
}
