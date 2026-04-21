import { useState, useId } from "react";
import { Book, TIER_PRICING, TITLE_PRICING } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Star, Headphones, Check, ShoppingCart, Info, Building2, SkipForward, Smartphone, BookOpen } from "lucide-react";
import { usePurchaseCheckout } from "@/hooks/use-purchases";
import { useToast } from "@/hooks/use-toast";

export type UpgradeLimitType = "skip" | "device" | "loan" | null;

interface PremiumUpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  onUpgrade: (plan: "monthly" | "annual" | { tier: "plus" | "premium"; plan: "monthly" | "annual" }) => void;
  isUpgrading: boolean;
  limitType?: UpgradeLimitType;
}

function getLimitCopy(limitType: UpgradeLimitType): { heading: string; description: string; icon: typeof SkipForward } {
  if (limitType === "skip") {
    return {
      heading: "Skip Limit Reached",
      description: "You've used all your skips for this hour. Upgrade to Plus or Premium for unlimited skips.",
      icon: SkipForward,
    };
  }
  if (limitType === "device") {
    return {
      heading: "Device Limit Reached",
      description: "You've reached the maximum number of devices for your plan. Upgrade to add more devices.",
      icon: Smartphone,
    };
  }
  if (limitType === "loan") {
    return {
      heading: "Loan Limit Reached",
      description: "You've borrowed the maximum number of books for your plan. Upgrade to borrow more.",
      icon: BookOpen,
    };
  }
  return {
    heading: "Upgrade Your Experience",
    description: "",
    icon: Headphones,
  };
}

function ComingSoonBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-300"
    >
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
      <span>Upgrade flow coming next — check back soon.</span>
    </div>
  );
}

export function PremiumUpgradeModal({
  open,
  onOpenChange,
  book,
  onUpgrade: _onUpgrade,
  isUpgrading: _isUpgrading,
  limitType = null,
}: PremiumUpgradeModalProps) {
  const [selectedTier, setSelectedTier] = useState<"plus" | "premium">("plus");
  const { purchaseTitle, isPurchasing } = usePurchaseCheckout();
  const { toast } = useToast();
  const headingId = useId();
  const isUpgrading = false;
  // TODO: re-enable onUpgrade(...) path here once Stripe checkout is wired.
  const handleUpgrade = (tierName: string) => {
    toast({
      title: "Coming soon",
      description: `${tierName} checkout will be available shortly.`,
    });
  };

  const contentType = book?.contentType || "default";
  const titlePrice = TITLE_PRICING[contentType as keyof typeof TITLE_PRICING] || TITLE_PRICING.default;

  const limitCopy = getLimitCopy(limitType);
  const LimitIcon = limitCopy.icon;

  const dialogDescription = limitCopy.description || (
    book
      ? `Enjoying "${book.title}"? Go ad-free with a subscription, or buy just this title.`
      : "Choose a plan for ad-free listening, or buy individual titles."
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-labelledby={headingId}>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-yellow-500 rounded-full p-2">
              <LimitIcon className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <DialogTitle id={headingId}>{limitCopy.heading}</DialogTitle>
          </div>
          <DialogDescription>
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-3">
            <div
              className={`rounded-lg border p-3 cursor-pointer transition-all ${
                selectedTier === "plus"
                  ? "border-blue-500 bg-blue-500/5 ring-1 ring-blue-500"
                  : "border-border hover:border-blue-300"
              }`}
              onClick={() => setSelectedTier("plus")}
              role="radio"
              aria-checked={selectedTier === "plus"}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") setSelectedTier("plus"); }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Star className="h-5 w-5 text-blue-500 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold">Plus — {TIER_PRICING.plus.monthlyDisplay}/mo</p>
                    <ul className="mt-1 space-y-0.5" aria-label="Plus plan features">
                      <li className="text-xs text-muted-foreground flex items-center gap-1">
                        <Check className="h-3 w-3 text-green-500" aria-hidden="true" /> Ad-free listening
                      </li>
                      <li className="text-xs text-muted-foreground flex items-center gap-1">
                        <Check className="h-3 w-3 text-green-500" aria-hidden="true" /> Selected free catalog, ad-free
                      </li>
                      <li className="text-xs text-muted-foreground flex items-center gap-1">
                        <Check className="h-3 w-3 text-green-500" aria-hidden="true" /> 192 kbps audio, unlimited skips
                      </li>
                      <li className="text-xs text-muted-foreground flex items-center gap-1">
                        <Check className="h-3 w-3 text-green-500" aria-hidden="true" /> 10 TTS pages/day, 10% off purchases
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`relative rounded-lg border p-3 cursor-pointer transition-all ${
                selectedTier === "premium"
                  ? "border-amber-500 bg-amber-500/5 ring-1 ring-amber-500"
                  : "border-border hover:border-amber-300"
              }`}
              onClick={() => setSelectedTier("premium")}
              role="radio"
              aria-checked={selectedTier === "premium"}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") setSelectedTier("premium"); }}
            >
              <Badge className="absolute -top-2.5 right-3 bg-amber-500 text-white hover:bg-amber-500 text-[10px] px-2">
                Best Value
              </Badge>
              <div className="flex items-center gap-3">
                <Crown className="h-5 w-5 text-amber-500 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">Premium — {TIER_PRICING.premium.monthlyDisplay}/mo</p>
                  <ul className="mt-1 space-y-0.5" aria-label="Premium plan features">
                    <li className="text-xs text-muted-foreground flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-500" aria-hidden="true" /> Full catalog access, ad-free
                    </li>
                    <li className="text-xs text-muted-foreground flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-500" aria-hidden="true" /> Offline downloads
                    </li>
                    <li className="text-xs text-muted-foreground flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-500" aria-hidden="true" /> UHQ 320 kbps audio, unlimited TTS
                    </li>
                    <li className="text-xs text-muted-foreground flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-500" aria-hidden="true" /> 20% off purchases, 5 devices
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-border p-3 bg-muted/20">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">Institutional</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Available via partner organisations or libraries.{" "}
                    <a href="/institutional" className="underline hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded">
                      Learn more
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => handleUpgrade(selectedTier === "premium" ? "Premium" : "Plus")}
            disabled={isUpgrading}
            aria-label={`Upgrade to ${selectedTier === "premium" ? "Premium" : "Plus"}`}
            className={`w-full focus-visible:ring-2 focus-visible:ring-offset-2 ${selectedTier === "premium" ? "bg-amber-500 hover:bg-amber-600 text-white focus-visible:ring-amber-400" : "bg-blue-500 hover:bg-blue-600 text-white focus-visible:ring-blue-400"}`}
          >
            {selectedTier === "premium" ? <Crown className="h-4 w-4 mr-2" aria-hidden="true" /> : <Star className="h-4 w-4 mr-2" aria-hidden="true" />}
            {isUpgrading
              ? "Processing..."
              : `Subscribe to ${selectedTier === "premium" ? "Premium" : "Plus"} — ${selectedTier === "premium" ? TIER_PRICING.premium.monthlyDisplay : TIER_PRICING.plus.monthlyDisplay}/mo`
            }
          </Button>
          <ComingSoonBanner />
          {book && !limitType && (
            <Button
              variant="outline"
              onClick={() => {
                purchaseTitle({ bookId: book.id, bookTitle: book.title, contentType });
                onOpenChange(false);
              }}
              disabled={isPurchasing}
              className="w-full"
            >
              <ShoppingCart className="h-4 w-4 mr-2" aria-hidden="true" />
              {isPurchasing ? "Processing..." : `Buy just this title — ${titlePrice.label}`}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="No thanks, stay free and close this dialog"
          >
            No thanks, stay free
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
