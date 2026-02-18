import { useState, useEffect, useRef } from "react";
import { useShouldShowAd } from "@/hooks/use-monetization";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Crown, Volume2, VolumeX } from "lucide-react";

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
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
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
