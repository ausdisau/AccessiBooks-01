import { Crown, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface PremiumFeatureBadgeProps {
  className?: string;
  label?: string;
  showLock?: boolean;
}

export function PremiumFeatureBadge({ className, label, showLock = false }: PremiumFeatureBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 text-amber-500 bg-amber-100/80 dark:bg-amber-900/40 rounded-full px-2 py-0.5 text-xs font-medium ${className || ""}`}>
          {showLock ? <Lock className="h-3 w-3" /> : <Crown className="h-3 w-3" />}
          {label && <span>{label}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent>Premium feature — upgrade to unlock</TooltipContent>
    </Tooltip>
  );
}
