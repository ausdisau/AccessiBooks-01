import { Crown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function PremiumFeatureBadge({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-0.5 text-yellow-500 ${className || ""}`}>
          <Crown className="h-3 w-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Premium feature</TooltipContent>
    </Tooltip>
  );
}
