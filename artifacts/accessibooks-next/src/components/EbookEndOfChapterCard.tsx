/**
 * EbookEndOfChapterCard — Sponsored card displayed at chapter completion.
 *
 * - Free tier only; suppressed under Low Sensory / Calm / Focus modes.
 * - Shown inline at the end of a chapter page, before the "Continue to next chapter" prompt.
 * - Fetches the ebook-end-of-chapter placement from the mediation layer.
 * - Includes "Why am I seeing this?" disclosure.
 */
import { useEffect, useState } from "react";
import { Crown, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/use-subscription";
import { usePreferencesKernel } from "@/hooks/use-preferences-kernel";

interface DisplayAdPayload {
  id: string;
  title: string;
  description?: string;
  clickThrough?: string;
  imageUrl?: string;
  suppressAnimation?: boolean;
}

interface EbookEndOfChapterCardProps {
  onContinue: () => void;
  onUpgrade: () => void;
}

export function EbookEndOfChapterCard({ onContinue, onUpgrade }: EbookEndOfChapterCardProps) {
  const { isPaid } = useSubscription();
  const { profile } = usePreferencesKernel();
  const [ad, setAd] = useState<DisplayAdPayload | null>(null);
  const [suppressed, setSuppressed] = useState(false);

  const isSuppressedByA11y = !!(profile.sensoryMode);

  useEffect(() => {
    if (isPaid || isSuppressedByA11y) { setSuppressed(true); return; }

    let cancelled = false;
    async function load() {
      try {
        const placementRes = await fetch("/api/ads/placement/ebook-end-of-chapter", { credentials: "include" });
        if (!placementRes.ok) { setSuppressed(true); return; }

        const adRes = await fetch("/api/ads/request?type=display&placement=ebook-end-of-chapter", { credentials: "include" });
        if (cancelled) return;
        if (adRes.status === 204 || !adRes.ok) {
          setSuppressed(true);
          return;
        }
        const data: DisplayAdPayload = await adRes.json();
        if (!cancelled) setAd(data);
      } catch {
        if (!cancelled) setSuppressed(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [isPaid, isSuppressedByA11y]);

  if (suppressed) {
    return (
      <div className="flex justify-center mt-8">
        <Button onClick={onContinue} size="lg" className="gap-2">
          Continue to next chapter
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  if (!ad) return null;

  return (
    <div
      className="mt-8 rounded-xl border border-border bg-muted/50 p-5"
      role="complementary"
      aria-label="Sponsored content"
      data-testid="ebook-end-of-chapter-card"
    >
      <div className="flex items-center gap-1 mb-3">
        <Sparkles className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Sponsored</span>
      </div>

      <div className="flex items-start gap-4">
        {ad.imageUrl ? (
          <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted">
            <img src={ad.imageUrl} alt={ad.title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Crown className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">{ad.title}</p>
          {ad.description && (
            <p className="text-sm text-muted-foreground mt-1">{ad.description}</p>
          )}
          {ad.clickThrough && (
            ad.clickThrough.startsWith("/") ? (
              <Button size="sm" variant="outline" className="mt-3" asChild>
                <a href={ad.clickThrough}>Learn More</a>
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="mt-3" asChild>
                <a href={ad.clickThrough} target="_blank" rel="noopener noreferrer">
                  Learn More
                </a>
              </Button>
            )
          )}
        </div>
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        <button
          onClick={onUpgrade}
          className="underline hover:text-foreground transition-colors"
          aria-label="Why am I seeing this ad? Upgrade to remove ads"
        >
          Why am I seeing this? Upgrade to remove ads.
        </button>
      </p>

      <div className="flex justify-end mt-4">
        <Button onClick={onContinue} size="sm" className="gap-2">
          Continue reading
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
