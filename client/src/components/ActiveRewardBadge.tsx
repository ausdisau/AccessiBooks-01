import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import type { ActiveReward } from "@/hooks/use-rewarded-ad";

interface ActiveRewardBadgeProps {
  rewards: ActiveReward[];
}

export function ActiveRewardBadge({ rewards }: ActiveRewardBadgeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const activeRewards = rewards.filter(
    (r) => new Date(r.expiresAt).getTime() > now,
  );

  if (activeRewards.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex flex-wrap gap-1.5"
    >
      {activeRewards.map((reward) => {
        const remaining = Math.max(
          0,
          Math.ceil((new Date(reward.expiresAt).getTime() - now) / 60000),
        );
        return (
          <Badge
            key={reward.type}
            variant="secondary"
            className="flex items-center gap-1 text-xs bg-primary/20 text-primary border-primary/30 font-bold"
            aria-label={`Active reward: ${reward.label}, ${remaining} minutes remaining`}
          >
            <Clock className="h-3 w-3" aria-hidden="true" />
            {reward.label}: {remaining} min left
          </Badge>
        );
      })}
    </div>
  );
}
