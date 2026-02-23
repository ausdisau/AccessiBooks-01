import { useState } from "react";
import { Book, TIER_PRICING, TITLE_PRICING } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Star, Headphones, Check, ShoppingCart } from "lucide-react";
import { usePurchaseCheckout } from "@/hooks/use-purchases";

interface PremiumUpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  onUpgrade: (plan: "monthly" | "annual" | { tier: "plus" | "premium"; plan: "monthly" | "annual" }) => void;
  isUpgrading: boolean;
}

export function PremiumUpgradeModal({
  open,
  onOpenChange,
  book,
  onUpgrade,
  isUpgrading,
}: PremiumUpgradeModalProps) {
  const [selectedTier, setSelectedTier] = useState<"plus" | "premium">("plus");
  const { purchaseTitle, isPurchasing } = usePurchaseCheckout();

  const contentType = book?.contentType || "default";
  const titlePrice = TITLE_PRICING[contentType as keyof typeof TITLE_PRICING] || TITLE_PRICING.default;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-yellow-500 rounded-full p-2">
              <Headphones className="h-5 w-5 text-white" />
            </div>
            <DialogTitle>Upgrade Your Experience</DialogTitle>
          </div>
          <DialogDescription>
            {book ? (
              <>
                Enjoying <strong>"{book.title}"</strong>? Go ad-free with a subscription, or buy just this title.
              </>
            ) : (
              "Choose a plan for ad-free listening, or buy individual titles."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div
              className={`rounded-lg border p-3 cursor-pointer transition-all ${
                selectedTier === "plus"
                  ? "border-blue-500 bg-blue-500/5 ring-1 ring-blue-500"
                  : "border-border hover:border-blue-300"
              }`}
              onClick={() => setSelectedTier("plus")}
            >
              <div className="text-center">
                <Star className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                <p className="text-sm font-semibold">Plus</p>
                <div className="text-xl font-bold text-foreground">{TIER_PRICING.plus.monthlyDisplay}</div>
                <p className="text-xs text-muted-foreground">/month</p>
                <div className="mt-2 space-y-1 text-left">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> Ad-free</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> 192kbps audio</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> Unlimited skips</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> 10% off purchases</p>
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
            >
              <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-500 text-white hover:bg-amber-500 text-[10px] px-2">
                Best Value
              </Badge>
              <div className="text-center">
                <Crown className="h-5 w-5 mx-auto mb-1 text-amber-500" />
                <p className="text-sm font-semibold">Premium</p>
                <div className="text-xl font-bold text-foreground">{TIER_PRICING.premium.monthlyDisplay}</div>
                <p className="text-xs text-muted-foreground">/month</p>
                <div className="mt-2 space-y-1 text-left">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> Everything in Plus</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> 320kbps HD audio</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> Offline downloads</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> 20% off purchases</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => onUpgrade({ tier: selectedTier, plan: "monthly" })}
            disabled={isUpgrading}
            className={`w-full ${selectedTier === "premium" ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-blue-500 hover:bg-blue-600 text-white"}`}
          >
            {selectedTier === "premium" ? <Crown className="h-4 w-4 mr-2" /> : <Star className="h-4 w-4 mr-2" />}
            {isUpgrading
              ? "Processing..."
              : `Subscribe to ${selectedTier === "premium" ? "Premium" : "Plus"} — ${selectedTier === "premium" ? TIER_PRICING.premium.monthlyDisplay : TIER_PRICING.plus.monthlyDisplay}/mo`
            }
          </Button>
          {book && (
            <Button
              variant="outline"
              onClick={() => {
                purchaseTitle({ bookId: book.id, bookTitle: book.title, contentType });
                onOpenChange(false);
              }}
              disabled={isPurchasing}
              className="w-full"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              {isPurchasing ? "Processing..." : `Buy just this title — ${titlePrice.label}`}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
