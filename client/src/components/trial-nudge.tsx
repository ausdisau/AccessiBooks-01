import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Crown, X, Clock } from "lucide-react";

interface TrialNudgeProps {
  listeningHours: number;
  isPremium: boolean;
  onStartTrial: () => void;
}

const THRESHOLDS = [2, 5, 10];
const FREE_TIER_LIMIT = 10;

function getActiveThreshold(hours: number): number | null {
  for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
    if (hours >= THRESHOLDS[i]) {
      return THRESHOLDS[i];
    }
  }
  return null;
}

function isDismissed(threshold: number): boolean {
  return localStorage.getItem(`accessibooks_trial_nudge_dismissed_${threshold}`) === "true";
}

function dismiss(threshold: number): void {
  localStorage.setItem(`accessibooks_trial_nudge_dismissed_${threshold}`, "true");
}

export function TrialNudge({ listeningHours, isPremium, onStartTrial }: TrialNudgeProps) {
  const [dismissed, setDismissed] = useState(false);

  const threshold = getActiveThreshold(listeningHours);

  useEffect(() => {
    setDismissed(false);
  }, [threshold]);

  if (isPremium || !threshold || isDismissed(threshold) || dismissed) {
    return null;
  }

  const progressPercent = Math.min((listeningHours / FREE_TIER_LIMIT) * 100, 100);
  const displayHours = Math.round(listeningHours * 10) / 10;

  const handleDismiss = () => {
    dismiss(threshold);
    setDismissed(true);
  };

  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 p-2 rounded-full bg-amber-100 dark:bg-amber-900/50">
          <Crown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="font-semibold text-amber-900 dark:text-amber-100 text-sm">
              You've listened for {displayHours} hours! Try Premium free for 7 days
            </h3>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 p-1 rounded hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
              aria-label="Dismiss trial banner"
            >
              <X className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </button>
          </div>
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 mb-1">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {displayHours} of {FREE_TIER_LIMIT} hours free tier used
              </span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2 bg-amber-200 dark:bg-amber-800 [&>div]:bg-amber-500" />
          </div>
          <Button
            size="sm"
            onClick={onStartTrial}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Crown className="h-4 w-4 mr-1" />
            Start Free Trial
          </Button>
        </div>
      </div>
    </div>
  );
}
