import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/use-subscription";
import { ResponsiveAd } from "./google-ad";

interface AdBannerProps {
  variant?: "library" | "player" | "inline";
  onClose?: () => void;
  useGoogleAds?: boolean;
}

export function AdBanner({ variant = "library", onClose, useGoogleAds = true }: AdBannerProps) {
  const { isPremium, upgradeToPremium, isUpgrading } = useSubscription();

  if (isPremium) {
    return null;
  }

  const hasGoogleAdsConfig = !!(
    import.meta.env.VITE_ADSENSE_CLIENT || 
    import.meta.env.VITE_DFP_NETWORK_CODE
  );

  if (useGoogleAds && hasGoogleAdsConfig && variant === "library") {
    return (
      <div className="mb-6" data-testid="ad-banner">
        <ResponsiveAd position="library-top" className="mx-auto" />
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 my-4" data-testid="ad-banner">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 dark:bg-amber-900 p-2 rounded-full">
              <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-100">
                Upgrade to Premium
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Ad-free listening, unlimited bookmarks, and more
              </p>
            </div>
          </div>
          <Button
            onClick={() => upgradeToPremium("monthly")}
            disabled={isUpgrading}
            className="bg-amber-600 hover:bg-amber-700 text-white"
            size="sm"
          >
            {isUpgrading ? "Loading..." : "From $4.99/mo"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-lg p-6 mb-6 border border-slate-300 dark:border-slate-600"
      role="complementary"
      aria-label="Advertisement"
      data-testid="ad-banner"
    >
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          aria-label="Close advertisement"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 p-3 rounded-full">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center sm:text-left">
            <h3 className="text-lg font-semibold text-foreground">
              Go Premium, Go Ad-Free
            </h3>
            <p className="text-sm text-muted-foreground">
              Enjoy uninterrupted listening, unlimited bookmarks, and exclusive content
            </p>
          </div>
        </div>
        
        <Button
          onClick={() => upgradeToPremium("monthly")}
          disabled={isUpgrading}
          className="whitespace-nowrap"
          size="lg"
        >
          {isUpgrading ? "Loading..." : "Go Ad-Free from $4.99/mo"}
        </Button>
      </div>
      
      <p className="text-xs text-muted-foreground mt-3 text-center">
        Cancel anytime • 30-day money back guarantee
      </p>
    </div>
  );
}
