import { useState, useEffect, useRef } from "react";
import { useShouldShowAd } from "@/hooks/use-monetization";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Crown, Volume2, VolumeX, Gift } from "lucide-react";
import type { RewardType } from "@shared/rewardConfig";

interface AudioAdInterstitialProps {
  booksPlayed: number;
  onAdComplete: () => void;
  onSkip?: () => void;
}

const AD_MESSAGES = [
  {
    title: "Enjoying AccessiBooks?",
    description: "Upgrade to Premium for ad-free listening, unlimited skips, and high-quality audio.",
    duration: 8,
  },
  {
    title: "Listen without interruptions",
    description: "Premium members enjoy uninterrupted audiobook experiences. Start your free trial today!",
    duration: 8,
  },
  {
    title: "Get the full experience",
    description: "Get offline downloads, 5-device support, and 320kbps audio with Premium.",
    duration: 10,
  },
];

export function AudioAdInterstitial({ booksPlayed, onAdComplete, onSkip }: AudioAdInterstitialProps) {
  const { data } = useShouldShowAd(booksPlayed);
  const [isShowing, setIsShowing] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);
  const [currentAd, setCurrentAd] = useState<typeof AD_MESSAGES[0] | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (data?.showAd && !data?.isPremium) {
      const ad = AD_MESSAGES[Math.floor(Math.random() * AD_MESSAGES.length)];
      setCurrentAd(ad);
      setRemainingTime(ad.duration);
      setIsShowing(true);

      timerRef.current = setInterval(() => {
        setRemainingTime((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setIsShowing(false);
            onAdComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [data?.showAd, data?.isPremium, onAdComplete]);

  if (!isShowing || !currentAd) {
    return null;
  }

  const progress = ((currentAd.duration - remainingTime) / currentAd.duration) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-card/95 backdrop-blur-md shadow-2xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              Ad • {remainingTime}s
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMuted(!isMuted)}
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="text-center space-y-2">
            <Crown className="h-12 w-12 mx-auto text-primary" />
            <h3 className="text-xl font-bold">{currentAd.title}</h3>
            <p className="text-muted-foreground">{currentAd.description}</p>
          </div>

          <Progress value={progress} className="h-1" />

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                if (timerRef.current) clearInterval(timerRef.current);
                window.location.href = "/api/subscription/create-checkout";
              }}
            >
              <Crown className="h-4 w-4 mr-2" />
              Go Premium
            </Button>
            {remainingTime <= 3 && onSkip && (
              <Button
                variant="outline"
                onClick={() => {
                  if (timerRef.current) clearInterval(timerRef.current);
                  setIsShowing(false);
                  onSkip();
                }}
              >
                Skip
              </Button>
            )}
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Ads appear every 3 books for free users
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

interface RewardedAdInterstitialProps {
  rewardLabel: string;
  durationSeconds?: number;
  impressionId: string;
  onComplete: (impressionId: string) => void;
  onCancel: () => void;
  rewardType: RewardType;
}

const REWARDED_AD_DURATION = 20;

export function RewardedAdInterstitial({
  rewardLabel,
  durationSeconds = REWARDED_AD_DURATION,
  impressionId,
  onComplete,
  onCancel,
  rewardType,
}: RewardedAdInterstitialProps) {
  const [elapsed, setElapsed] = useState(0);
  const [announced, setAnnounced] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const impressionIdRef = useRef<string>(impressionId);
  const startedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setAnnounced(true), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= durationSeconds) {
          clearInterval(timerRef.current!);
          onComplete(impressionIdRef.current);
        }
        return next;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [durationSeconds, onComplete]);

  const remaining = Math.max(0, durationSeconds - elapsed);
  const progress = Math.min(100, (elapsed / durationSeconds) * 100);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Rewarded advertisement playing"
    >
      {announced && (
        <div aria-live="assertive" aria-atomic="true" className="sr-only">
          This ad cannot be skipped. It will end in approximately {durationSeconds} seconds.
        </div>
      )}

      <Card className="max-w-md w-full bg-card/95 backdrop-blur-md shadow-2xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-primary animate-pulse" aria-hidden="true" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Rewarded Ad
              </span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums" aria-live="off">
              {remaining}s
            </span>
          </div>

          <div className="text-center space-y-2 py-4">
            <Crown className="h-12 w-12 mx-auto text-primary" />
            <h3 className="text-lg font-semibold">Unlocking: {rewardLabel}</h3>
            <p className="text-sm text-muted-foreground">
              Watch this short ad to unlock your perk. It will end automatically.
            </p>
          </div>

          <Progress
            value={progress}
            className="h-2"
            aria-label={`Ad progress: ${Math.round(progress)}%`}
          />

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              disabled
              className="w-full cursor-not-allowed"
              aria-label="Ad must complete to receive your perk"
              aria-disabled="true"
            >
              Skip not available — completing to unlock perk
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="w-full text-muted-foreground text-xs"
              aria-label="Cancel and return to content without the perk"
            >
              Cancel (perk will not be granted)
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Completing this ad unlocks: {rewardLabel}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function useAudioAds() {
  const [booksPlayed, setBooksPlayed] = useState(() => {
    const stored = localStorage.getItem("accessibooks_books_played");
    return stored ? parseInt(stored, 10) : 0;
  });
  const [showAd, setShowAd] = useState(false);

  const incrementBooksPlayed = () => {
    const newCount = booksPlayed + 1;
    setBooksPlayed(newCount);
    localStorage.setItem("accessibooks_books_played", newCount.toString());
    
    if (newCount % 3 === 0) {
      setShowAd(true);
    }
  };

  const onAdComplete = () => {
    setShowAd(false);
  };

  return {
    booksPlayed,
    showAd,
    incrementBooksPlayed,
    onAdComplete,
    setShowAd,
  };
}
