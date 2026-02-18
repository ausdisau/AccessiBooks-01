import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, Check, Trophy, Flame, BookOpen } from "lucide-react";

interface EngagementUpsellProps {
  type: "book_complete" | "streak_milestone" | "listening_milestone";
  detail: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpgrade: (plan?: "monthly" | "annual") => void;
}

function getTriggerId(type: string, detail: string) {
  return `${type}_${detail.replace(/\s+/g, "_").toLowerCase()}`;
}

function hasShownUpsell(triggerId: string): boolean {
  return localStorage.getItem(`accessibooks_upsell_shown_${triggerId}`) === "true";
}

function markUpsellShown(triggerId: string) {
  localStorage.setItem(`accessibooks_upsell_shown_${triggerId}`, "true");
}

function getConfig(type: EngagementUpsellProps["type"], detail: string) {
  switch (type) {
    case "book_complete":
      return {
        emoji: "🎉",
        icon: BookOpen,
        gradient: "from-green-500 to-emerald-600",
        title: `You finished ${detail}!`,
        description: "Congratulations on completing another book! Keep your momentum going with Premium.",
        cta: "Unlock unlimited books, ad-free listening, and more",
      };
    case "streak_milestone":
      return {
        emoji: "🔥",
        icon: Flame,
        gradient: "from-orange-500 to-red-500",
        title: `${detail}-day listening streak!`,
        description: `You've been listening for ${detail} days straight — incredible dedication!`,
        cta: "Supercharge your streak with Premium features",
      };
    case "listening_milestone":
      return {
        emoji: "🏆",
        icon: Trophy,
        gradient: "from-yellow-500 to-amber-600",
        title: `${detail} books listened!`,
        description: `You've reached an amazing milestone — ${detail} books completed!`,
        cta: "Celebrate with a Premium upgrade",
      };
  }
}

export function EngagementUpsell({ type, detail, open, onOpenChange, onUpgrade }: EngagementUpsellProps) {
  const triggerId = getTriggerId(type, detail);
  const config = getConfig(type, detail);
  const Icon = config.icon;

  useEffect(() => {
    if (open) {
      markUpsellShown(triggerId);
    }
  }, [open, triggerId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <div className={`bg-gradient-to-r ${config.gradient} p-6 text-white text-center`}>
          <span className="text-5xl block mb-2">{config.emoji}</span>
          <Icon className="h-8 w-8 mx-auto mb-2 text-white/90" />
          <DialogHeader>
            <DialogTitle className="text-white text-2xl font-bold">{config.title}</DialogTitle>
            <DialogDescription className="text-white/90 mt-1">
              {config.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground text-center font-medium">
            {config.cta}
          </p>

          <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border">
            <Crown className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="font-semibold">AccessiBooks Premium</p>
              <p className="text-sm text-muted-foreground">$9.99/month</p>
            </div>
          </div>

          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              Access to all commercial audiobooks & ebooks
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
              Ad-free experience
            </li>
          </ul>

          <DialogFooter className="flex-col gap-2 sm:flex-col pt-2">
            <Button
              onClick={onUpgrade}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
            >
              <Crown className="h-4 w-4 mr-2" />
              Upgrade to Premium
            </Button>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="w-full"
            >
              Maybe later
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { hasShownUpsell };
