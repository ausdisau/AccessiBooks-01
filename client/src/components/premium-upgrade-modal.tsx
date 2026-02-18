import { useState } from "react";
import { Book } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Headphones, Check } from "lucide-react";

interface PremiumUpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  onUpgrade: (plan?: "monthly" | "annual") => void;
  isUpgrading: boolean;
}

export function PremiumUpgradeModal({
  open,
  onOpenChange,
  book,
  onUpgrade,
  isUpgrading,
}: PremiumUpgradeModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("annual");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-yellow-500 rounded-full p-2">
              <Headphones className="h-5 w-5 text-white" />
            </div>
            <DialogTitle>Go Ad-Free with Premium</DialogTitle>
          </div>
          <DialogDescription>
            {book ? (
              <>
                Enjoying <strong>"{book.title}"</strong>? Upgrade to AccessiBooks Premium for an uninterrupted, ad-free listening experience with high-quality audio.
              </>
            ) : (
              "Upgrade to Premium for ad-free listening, high-quality audio, and offline downloads."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div
              className={`relative rounded-lg border p-3 cursor-pointer transition-all ${
                selectedPlan === "monthly"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/50"
              }`}
              onClick={() => setSelectedPlan("monthly")}
            >
              <div className="text-center">
                <p className="text-xs font-medium text-muted-foreground mb-1">Monthly</p>
                <div className="text-xl font-bold text-foreground">$9.99</div>
                <p className="text-xs text-muted-foreground">/month</p>
              </div>
            </div>
            <div
              className={`relative rounded-lg border p-3 cursor-pointer transition-all ${
                selectedPlan === "annual"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-amber-500/50 hover:border-amber-500"
              }`}
              onClick={() => setSelectedPlan("annual")}
            >
              <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-500 text-white hover:bg-amber-500 text-[10px] px-2">
                Best Value
              </Badge>
              <div className="text-center">
                <p className="text-xs font-medium text-muted-foreground mb-1">Annual</p>
                <div className="text-xl font-bold text-foreground">$8.33</div>
                <p className="text-xs text-muted-foreground">/month</p>
                <p className="text-xs text-muted-foreground line-through">$9.99/mo</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">$99.99 billed annually</p>
              </div>
            </div>
          </div>

          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              Ad-free listening experience
            </li>
            <li className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              High-quality audio streaming
            </li>
            <li className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              Unlimited skips and offline downloads
            </li>
            <li className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              No shuffle restrictions
            </li>
          </ul>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => onUpgrade(selectedPlan)}
            disabled={isUpgrading}
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
          >
            <Crown className="h-4 w-4 mr-2" />
            {isUpgrading ? "Processing..." : `Subscribe ${selectedPlan === "annual" ? "Annually — $99.99/yr" : "Monthly — $9.99/mo"}`}
          </Button>
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
