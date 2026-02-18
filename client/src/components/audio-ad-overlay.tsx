import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Crown, Volume2, VolumeX, Radio } from "lucide-react";
import type { AudioAd } from "@/services/audio-ad-service";

interface AudioAdOverlayProps {
  ad: AudioAd;
  adType: "pre-roll" | "mid-roll";
  skipAfterMs: number;
  onComplete: (skipped: boolean) => void;
  onUpgrade: () => void;
}

export function AudioAdOverlay({ ad, adType, skipAfterMs, onComplete, onUpgrade }: AudioAdOverlayProps) {
  const [elapsed, setElapsed] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef(Date.now());
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const totalDuration = ad.durationMs / 1000;
  const canSkip = elapsed >= skipAfterMs / 1000;
  const skipCountdown = Math.max(0, Math.ceil(skipAfterMs / 1000 - elapsed));

  const speakAd = useCallback(() => {
    if (isMuted || typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(ad.message);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 0.7;
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [ad.message, isMuted]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    startTimeRef.current = Date.now();

    const timer = setTimeout(() => {
      speakAd();
    }, 600);

    setTimeout(() => {
      dialogRef.current?.focus();
    }, 50);

    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsedSec = (now - startTimeRef.current) / 1000;
      setElapsed(elapsedSec);

      if (elapsedSec >= totalDuration) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        window.speechSynthesis?.cancel();
        onComplete(false);
      }
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearTimeout(timer);
      window.speechSynthesis?.cancel();
      previousFocusRef.current?.focus();
    };
  }, [totalDuration, speakAd, onComplete]);

  useEffect(() => {
    if (isMuted) {
      window.speechSynthesis?.cancel();
    } else if (elapsed > 0 && elapsed < totalDuration) {
      speakAd();
    }
  }, [isMuted]);

  const handleSkip = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    window.speechSynthesis?.cancel();
    onComplete(true);
  };

  const handleUpgrade = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    window.speechSynthesis?.cancel();
    onUpgrade();
  };

  const progress = Math.min(100, (elapsed / totalDuration) * 100);
  const remainingTime = Math.max(0, Math.ceil(totalDuration - elapsed));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    if (e.key === "Escape" && canSkip) {
      handleSkip();
    }
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Audio advertisement: ${ad.title}`}
      aria-live="polite"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <Card className="max-w-md w-full bg-gradient-to-b from-card to-card/95 border-primary/20">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary animate-pulse" aria-hidden="true" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                {adType === "pre-roll" ? "Pre-roll" : "Mid-roll"} Ad
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums" aria-live="off">
                {remainingTime}s
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMuted(!isMuted)}
                aria-label={isMuted ? "Unmute ad" : "Mute ad"}
                className="h-8 w-8 p-0"
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="text-center space-y-3 py-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
              <Crown className="h-8 w-8 text-primary" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-bold">{ad.title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{ad.message}</p>
          </div>

          <Progress value={progress} className="h-1.5" aria-label={`Ad progress: ${Math.round(progress)}%`} />

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={handleUpgrade}
              aria-label="Upgrade to Premium to remove ads"
            >
              <Crown className="h-4 w-4 mr-2" aria-hidden="true" />
              Go Premium - No Ads
            </Button>
            {canSkip ? (
              <Button
                variant="outline"
                onClick={handleSkip}
                aria-label="Skip this advertisement"
              >
                Skip Ad
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled
                aria-label={`Skip available in ${skipCountdown} seconds`}
                className="min-w-[90px]"
              >
                Skip in {skipCountdown}s
              </Button>
            )}
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Premium members enjoy ad-free listening
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
