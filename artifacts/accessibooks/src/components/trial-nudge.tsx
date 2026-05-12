import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Crown, X, Clock, Zap, Headphones, Download, Shield } from "lucide-react";

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

function getCountdownText(): string {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const hoursLeft = Math.ceil((endOfDay.getTime() - now.getTime()) / (1000 * 60 * 60));
  return `${hoursLeft}h left today`;
}

function getCopyForThreshold(threshold: number, displayHours: number): { headline: string; subtext: string } {
  if (threshold >= 10) {
    return {
      headline: `🔥 You've hit ${displayHours} hours — you clearly love listening!`,
      subtext: "Unlock HD audio, offline downloads & unlimited TTS. Your ears deserve it."
    };
  }
  if (threshold >= 5) {
    return {
      headline: `🎧 ${displayHours} hours and counting — upgrade before you hit the limit!`,
      subtext: "Go ad-free with Premium. Plus offline mode & 320kbps HD audio."
    };
  }
  return {
    headline: `Nice — ${displayHours} hours listened! Ready for the full experience?`,
    subtext: "Try Premium free for 7 days. No ads, HD audio, offline downloads."
  };
}

export function TrialNudge({ listeningHours, isPremium, onStartTrial }: TrialNudgeProps) {
  const [dismissed, setDismissed] = useState(false);
  const [countdownText, setCountdownText] = useState(getCountdownText());

  const threshold = getActiveThreshold(listeningHours);

  useEffect(() => {
    setDismissed(false);
  }, [threshold]);

  useEffect(() => {
    const interval = setInterval(() => setCountdownText(getCountdownText()), 60000);
    return () => clearInterval(interval);
  }, []);

  if (isPremium || !threshold || isDismissed(threshold) || dismissed) {
    return null;
  }

  const progressPercent = Math.min((listeningHours / FREE_TIER_LIMIT) * 100, 100);
  const displayHours = Math.round(listeningHours * 10) / 10;
  const copy = getCopyForThreshold(threshold, displayHours);

  const handleDismiss = () => {
    dismiss(threshold);
    setDismissed(true);
  };

  return (
    <div className="mb-6 rounded-xl border-2 border-amber-400 dark:border-amber-600 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-amber-950/40 p-5 shadow-md shadow-amber-200/30 dark:shadow-amber-900/20">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 p-3 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg">
          <Crown className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <h3 className="font-bold text-amber-900 dark:text-amber-100 text-base">
                {copy.headline}
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
                {copy.subtext}
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 p-1.5 rounded-full hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
              aria-label="Dismiss trial banner"
            >
              <X className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </button>
          </div>

          <div className="flex items-center gap-4 mt-3 mb-3 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
              <Shield className="h-3.5 w-3.5" /> Ad-free
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
              <Headphones className="h-3.5 w-3.5" /> HD Audio
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
              <Download className="h-3.5 w-3.5" /> Offline
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
              <Zap className="h-3.5 w-3.5" /> Unlimited TTS
            </span>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 mb-1">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {displayHours} of {FREE_TIER_LIMIT} hours free tier used
              </span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2.5 bg-amber-200 dark:bg-amber-800 [&>div]:bg-gradient-to-r [&>div]:from-amber-500 [&>div]:to-orange-500" />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              size="sm"
              onClick={onStartTrial}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold shadow-md px-5"
            >
              <Crown className="h-4 w-4 mr-1.5" />
              Start Free 7-Day Trial
            </Button>
            <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300 text-xs animate-pulse">
              <Clock className="h-3 w-3 mr-1" />
              {countdownText}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
