import { Badge } from "@/components/ui/badge";
import type { SubscriptionTier } from "@shared/schema";

interface PlanBadgeProps {
  tier: SubscriptionTier;
  className?: string;
}

export function PlanBadge({ tier, className }: PlanBadgeProps) {
  if (tier === "premium") {
    return (
      <Badge
        role="status"
        aria-label="Current plan: Premium"
        className={`bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 ${className ?? ""}`}
      >
        Premium <span aria-hidden="true">✦</span>
      </Badge>
    );
  }

  if (tier === "plus") {
    return (
      <Badge
        role="status"
        aria-label="Current plan: Plus"
        className={`bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-700 ${className ?? ""}`}
      >
        Plus
      </Badge>
    );
  }

  return (
    <Badge
      role="status"
      aria-label="Current plan: Free"
      variant="secondary"
      className={className}
    >
      Free
    </Badge>
  );
}
