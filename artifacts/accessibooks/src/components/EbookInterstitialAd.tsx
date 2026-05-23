/**
 * EbookInterstitialAd — Full-page interstitial ad shown between ebook chapters.
 *
 * - Free tier only; suppressed under Low Sensory / Calm / Focus modes (checked server-side
 *   at the /api/ads/placement endpoint, and also locally via the suppressed prop).
 * - Minimum 3-second display before the dismiss button becomes available.
 * - Includes "Why am I seeing this? Upgrade to remove ads." link.
 * - Fetches the ebook-interstitial placement + a display ad from the mediation layer.
 */
import { useState, useEffect, useRef } from "react";
import { X, Crown, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/use-subscription";
import { usePreferencesKernel } from "@/hooks/use-preferences-kernel";

const MIN_DISPLAY_MS = 3000;
const FREQUENCY_CAP_KEY = "ab:ebook_interstitial_last";
const FREQUENCY_CAP_MS = 15 * 60 * 1000;

interface DisplayAdPayload {
  id: string;
  title: string;
  description?: string;
  clickThrough?: string;
  imageUrl?: string;
  suppressAnimation?: boolean;
}

interface EbookInterstitialAdProps {
  onDismiss: () => void;
  onUpgrade: () => void;
}

export function EbookInterstitialAd({ onDismiss, onUpgrade }: EbookInterstitialAdProps) {
  const { isPaid } = useSubscription();
  const { profile } = usePreferencesKernel();
  const [ad, setAd] = useState<DisplayAdPayload | null>(null);
  const [canDismiss, setCanDismiss] = useState(false);
  const [countdown, setCountdown] = useState(Math.ceil(MIN_DISPLAY_MS / 1000));
  const [visible, setVisible] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSuppressedByA11y = !!(profile.sensoryMode);

  useEffect(() => {
    if (isPaid || isSuppressedByA11y) { onDismiss(); return; }

    let cancelled = false;

    async function load() {
      try {
        const placementRes = await fetch("/api/ads/placement/ebook-interstitial", { credentials: "include" });
        if (!placementRes.ok) { onDismiss(); return; }

        const adRes = await fetch("/api/ads/request?type=display&placement=ebook-interstitial", { credentials: "include" });
        if (adRes.status === 204 || !adRes.ok) { onDismiss(); return; }

        const data: DisplayAdPayload = await adRes.json();
        if (cancelled) return;
        setAd(data);
        setVisible(true);

        localStorage.setItem(FREQUENCY_CAP_KEY, String(Date.now()));

        dismissTimerRef.current = setTimeout(() => {
          if (!cancelled) setCanDismiss(true);
        }, MIN_DISPLAY_MS);

        countdownRef.current = setInterval(() => {
          setCountdown((c) => {
            if (c <= 1) {
              if (countdownRef.current) clearInterval(countdownRef.current);
              return 0;
            }
            return c - 1;
          });
        }, 1000);
      } catch {
        if (!cancelled) onDismiss();
      }
    }

    load();

    return () => {
      cancelled = true;
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [isPaid, isSuppressedByA11y]);

  if (!visible || !ad) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-label="Advertisement"
    >
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Advertisement
          </span>
          {canDismiss ? (
            <button
              onClick={onDismiss}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close advertisement"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite" aria-label={`Close available in ${countdown} seconds`}>
              Close in {countdown}s
            </span>
          )}
        </div>

        {ad.imageUrl && (
          <div className="rounded-lg overflow-hidden mb-4 bg-muted aspect-video flex items-center justify-center">
            <img src={ad.imageUrl} alt={ad.title} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="flex items-start gap-4 mb-6">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Crown className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{ad.title}</h2>
            {ad.description && (
              <p className="text-sm text-muted-foreground mt-1">{ad.description}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {ad.clickThrough && (
            ad.clickThrough.startsWith("/") ? (
              <Button asChild className="w-full" size="lg">
                <a href={ad.clickThrough}>
                  Learn More
                  <ExternalLink className="h-4 w-4 ml-2" aria-hidden="true" />
                </a>
              </Button>
            ) : (
              <Button asChild className="w-full" size="lg">
                <a href={ad.clickThrough} target="_blank" rel="noopener noreferrer">
                  Learn More
                  <ExternalLink className="h-4 w-4 ml-2" aria-hidden="true" />
                </a>
              </Button>
            )
          )}

          <Button variant="outline" onClick={onUpgrade} className="w-full">
            Go Ad-Free from $4.99/mo
          </Button>

          {canDismiss && (
            <Button variant="ghost" onClick={onDismiss} className="w-full">
              Continue Reading
            </Button>
          )}
        </div>

        <p className="text-center mt-4 text-xs text-muted-foreground">
          <button
            onClick={onUpgrade}
            className="underline hover:text-foreground transition-colors"
            aria-label="Why am I seeing ads? Upgrade to remove ads"
          >
            Why am I seeing this? Upgrade to remove ads.
          </button>
        </p>
      </div>
    </div>
  );
}

/** Returns true if the frequency cap allows showing the interstitial right now. */
export function canShowEbookInterstitial(): boolean {
  try {
    const last = Number(localStorage.getItem(FREQUENCY_CAP_KEY) ?? "0");
    return Date.now() - last >= FREQUENCY_CAP_MS;
  } catch {
    return true;
  }
}
