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
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-none" aria-labelledby={headingId}>
        <div className="bg-primary p-6 text-white text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-white/20 mx-auto mb-2 flex items-center justify-center">
            <LimitIcon className="h-6 w-6 text-white" aria-hidden="true" />
          </div>
          <DialogTitle id={headingId} className="text-2xl font-serif font-bold">{limitCopy.heading}</DialogTitle>
          <DialogDescription className="text-white/80 text-sm">
            {dialogDescription}
          </DialogDescription>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div
              className={`rounded-xl border-2 p-4 cursor-pointer transition-all ${
                selectedTier === "plus"
                  ? "border-primary bg-primary/5 shadow-inner"
                  : "border-border hover:border-primary/30"
              }`}
              onClick={() => setSelectedTier("plus")}
              role="radio"
              aria-checked={selectedTier === "plus"}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") setSelectedTier("plus"); }}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${selectedTier === "plus" ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                  <Star className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-serif font-bold text-lg">Plus</p>
                    <Badge className="bg-muted text-muted-foreground border-none text-[10px] uppercase font-bold">Standard</Badge>
                  </div>
                  <p className="text-sm font-medium text-primary mb-3">{TIER_PRICING.plus.monthlyDisplay}/mo</p>
                  <ul className="space-y-1.5" aria-label="Plus plan features">
                    <li className="text-xs text-muted-foreground flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> Ad-free listening
                    </li>
                    <li className="text-xs text-muted-foreground flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> 192 kbps audio, unlimited skips
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div
              className={`relative rounded-xl border-2 p-4 cursor-pointer transition-all ${
                selectedTier === "premium"
                  ? "border-primary bg-primary/5 shadow-inner"
                  : "border-border hover:border-primary/30"
              }`}
              onClick={() => setSelectedTier("premium")}
              role="radio"
              aria-checked={selectedTier === "premium"}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") setSelectedTier("premium"); }}
            >
              <div className="absolute -top-3 right-4 z-10">
                <Badge className="bg-primary text-white border-none px-3 py-1 text-[10px] font-bold uppercase tracking-wider">
                  Recommended
                </Badge>
              </div>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${selectedTier === "premium" ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                  <Crown className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-serif font-bold text-lg">Premium</p>
                    <Badge className="bg-primary/20 text-primary border-none text-[10px] uppercase font-bold">Best Value</Badge>
                  </div>
                  <p className="text-sm font-medium text-primary mb-3">{TIER_PRICING.premium.monthlyDisplay}/mo</p>
                  <ul className="space-y-1.5" aria-label="Premium plan features">
                    <li className="text-xs text-muted-foreground flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> Full catalog, ad-free, offline
                    </li>
                    <li className="text-xs text-muted-foreground flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> UHQ 320 kbps HD audio
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 pt-0 flex-col gap-3 sm:flex-col">
          <div className="space-y-3 w-full">
            <Button
              onClick={() => handleUpgrade(selectedTier === "premium" ? "Premium" : "Plus")}
              disabled={isUpgrading}
              size="lg"
              aria-label={`Upgrade to ${selectedTier === "premium" ? "Premium" : "Plus"}`}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold"
            >
              {isUpgrading ? "Processing..." : `Subscribe to ${selectedTier === "premium" ? "Premium" : "Plus"}`}
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
              className="w-full text-muted-foreground hover:text-foreground font-medium"
              aria-label="No thanks, stay free and close this dialog"
            >
              No thanks, stay free
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
