import { Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSubscription } from "@/hooks/use-subscription";

interface PremiumBadgeProps {
  showUpgrade?: boolean;
  size?: "sm" | "md";
}

export function PremiumBadge({ showUpgrade = false, size = "sm" }: PremiumBadgeProps) {
  const { isPremium, upgradeToPremium, isUpgrading } = useSubscription();

  if (isPremium) {
    return (
      <Badge 
        variant="secondary" 
        className={`bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 ${
          size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1"
        }`}
      >
        <Crown className={`${size === "sm" ? "h-3 w-3" : "h-4 w-4"} mr-1`} />
        Premium
      </Badge>
    );
  }

  if (!showUpgrade) {
    return null;
  }

  return (
    <Badge 
      variant="outline" 
      className={`cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors ${
        size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        upgradeToPremium("monthly");
      }}
    >
      {isUpgrading ? (
        "Loading..."
      ) : (
        <>
          <Crown className={`${size === "sm" ? "h-3 w-3" : "h-4 w-4"} mr-1`} />
          Upgrade
        </>
      )}
    </Badge>
  );
}
