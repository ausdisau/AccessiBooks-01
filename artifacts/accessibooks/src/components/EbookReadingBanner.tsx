/**
 * EbookReadingBanner — Persistent bottom banner shown while reading an ebook.
 *
 * - Free tier ONLY (Plus and Premium both suppressed via isPaid check).
 * - Suppressed under Low Sensory / Calm / sensoryMode before any network fetch.
 * - Dismissible per-session.
 * - Strict: if the server returns 204 (paid tier, a11y suppression, or no fill),
 *   the banner is NOT shown — no local fallback creative.
 * - Includes "Why am I seeing this?" disclosure link.
 */
import { useState, useEffect } from "react";
import { X, Crown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/use-subscription";
import { usePreferencesKernel } from "@/hooks/use-preferences-kernel";

interface DisplayAdPayload {
  id: string;
  title: string;
  description?: string;
  clickThrough?: string;
}

interface EbookReadingBannerProps {
  onUpgrade: () => void;
}

export function EbookReadingBanner({ onUpgrade }: EbookReadingBannerProps) {
  const { isPaid } = useSubscription();
  const { profile } = usePreferencesKernel();
  const [ad, setAd] = useState<DisplayAdPayload | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const isSuppressedByA11y = !!(profile.sensoryMode);

  useEffect(() => {
    if (isPaid || isSuppressedByA11y) return;

    let cancelled = false;

    async function load() {
      try {
        const placementRes = await fetch("/api/ads/placement/ebook-banner", { credentials: "include" });
        if (!placementRes.ok) return;

        const adRes = await fetch("/api/ads/request?type=display&placement=ebook-banner", { credentials: "include" });
        if (cancelled) return;
        if (adRes.status === 204 || !adRes.ok) return;

        const data: DisplayAdPayload = await adRes.json();
        if (!cancelled) setAd(data);
      } catch {
        // Network error or server suppressed — show nothing
      }
    }

    load();
    return () => { cancelled = true; };
  }, [isPaid, isSuppressedByA11y]);

  if (isPaid || isSuppressedByA11y || dismissed || !ad) return null;

  return (
    <aside
      className="sticky bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 backdrop-blur-sm"
      role="complementary"
      aria-label="Advertisement"
      data-testid="ebook-reading-banner"
    >
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Crown className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{ad.title}</p>
          {ad.description && (
            <p className="text-xs text-muted-foreground truncate">{ad.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {ad.clickThrough && (
            ad.clickThrough.startsWith("/") ? (
              <Button size="sm" variant="outline" className="hidden sm:flex items-center gap-1 whitespace-nowrap" asChild>
                <a href={ad.clickThrough}>Learn More</a>
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="hidden sm:flex items-center gap-1 whitespace-nowrap" asChild>
                <a href={ad.clickThrough} target="_blank" rel="noopener noreferrer">Learn More</a>
              </Button>
            )
          )}
          <Button
            size="sm"
            onClick={onUpgrade}
            className="hidden sm:flex items-center gap-1 whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Go Premium
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            aria-label="Dismiss advertisement"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="text-center pb-1">
        <button
          onClick={onUpgrade}
          className="text-[10px] text-muted-foreground underline hover:text-foreground transition-colors"
          aria-label="Why am I seeing ads? Upgrade to remove"
        >
          Why am I seeing this? Upgrade to remove ads.
        </button>
      </div>
    </aside>
  );
}
