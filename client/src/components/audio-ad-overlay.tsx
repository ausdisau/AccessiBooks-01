import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Crown, Volume2, VolumeX, Radio, ExternalLink } from "lucide-react";
import type { AdResponse } from "@/services/audio-ad-service";
import { audioAdService } from "@/services/audio-ad-service";

interface HouseCompanionAd {
  title: string;
  description: string;
  icon: "crown" | "radio";
  gradient: string;
  clickLabel?: string;
}

const HOUSE_COMPANION_ADS: HouseCompanionAd[] = [
  {
    title: "Upgrade to Premium",
    description: "Enjoy unlimited ad-free listening, offline downloads, and high-quality audio.",
    icon: "crown",
    gradient: "from-amber-500/20 via-yellow-500/10 to-orange-500/20",
    clickLabel: "Go Premium",
  },
  {
    title: "Ad-Free Listening",
    description: "No more interruptions. Premium members listen to their favorite audiobooks uninterrupted.",
    icon: "radio",
    gradient: "from-purple-500/20 via-indigo-500/10 to-blue-500/20",
    clickLabel: "Learn More",
  },
  {
    title: "Try Premium Free",
    description: "Start your 7-day free trial today. Cancel anytime, no commitment required.",
    icon: "crown",
    gradient: "from-emerald-500/20 via-teal-500/10 to-cyan-500/20",
    clickLabel: "Start Free Trial",
  },
];

function getRandomHouseCompanion(): HouseCompanionAd {
  return HOUSE_COMPANION_ADS[Math.floor(Math.random() * HOUSE_COMPANION_ADS.length)]!;
}

interface CompanionAdBannerProps {
  companion: HouseCompanionAd;
  onClick?: () => void;
}

function CompanionAdBanner({ companion, onClick }: CompanionAdBannerProps) {
  const IconComponent = companion.icon === "crown" ? Crown : Radio;

  return (
    <div
      className={`relative min-h-[120px] rounded-lg bg-gradient-to-r ${companion.gradient} border border-primary/10 p-4 flex items-center gap-4 ${onClick ? "cursor-pointer hover:border-primary/30 transition-colors" : ""}`}
      onClick={onClick}
      role={onClick ? "link" : undefined}
      aria-label={onClick ? companion.clickLabel || companion.title : undefined}
    >
      <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-full bg-primary/15">
        <IconComponent className="h-7 w-7 text-primary" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-foreground">{companion.title}</h4>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{companion.description}</p>
        {companion.clickLabel && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary mt-2">
            {companion.clickLabel}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );
}

interface AudioAdOverlayProps {
  ad: AdResponse;
  adType: "pre-roll" | "mid-roll";
  onComplete: (skipped: boolean) => void;
  onUpgrade: () => void;
}

export function AudioAdOverlay({ ad, adType, onComplete, onUpgrade }: AudioAdOverlayProps) {
  const [elapsed, setElapsed] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [houseCompanion] = useState<HouseCompanionAd>(() => getRandomHouseCompanion());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef(Date.now());
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const impressionFiredRef = useRef(false);
  const startFiredRef = useRef(false);
  const companionViewTrackedRef = useRef(false);

  const isProgrammatic = ad.isProgrammatic;
  const totalDuration = ad.duration;
  const skipOffsetMs = audioAdService.getSkipOffsetMs(ad);
  const canSkip = elapsed >= skipOffsetMs / 1000;
  const skipCountdown = Math.max(0, Math.ceil(skipOffsetMs / 1000 - elapsed));

  const speakHouseAd = useCallback(() => {
    if (isProgrammatic || isMuted || typeof window === "undefined" || !window.speechSynthesis) return;
    if (!ad.isProgrammatic) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(ad.description);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 0.7;
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }
  }, [ad, isProgrammatic, isMuted]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    startTimeRef.current = Date.now();
    audioAdService.resetQuartileTracking();

    if (isProgrammatic && ad.isProgrammatic) {
      const audio = new Audio(ad.audioUrl);
      audio.volume = 1.0;
      audioRef.current = audio;

      audio.addEventListener("canplaythrough", () => {
        setAudioLoaded(true);
        audio.play().catch(() => setAudioError(true));
      });

      audio.addEventListener("error", () => {
        console.warn("[AudioAdOverlay] Audio load error, falling back to timer");
        setAudioError(true);
        setAudioLoaded(true);
      });

      audio.addEventListener("ended", () => {
        audioAdService.fireAdEvent(ad, "complete");
        onComplete(false);
      });

      audio.load();
    } else {
      setAudioLoaded(true);
      const timer = setTimeout(() => speakHouseAd(), 600);
      return () => clearTimeout(timer);
    }

    setTimeout(() => dialogRef.current?.focus(), 50);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      window.speechSynthesis?.cancel();
      previousFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    if (!audioLoaded) return;

    if (isProgrammatic && ad.isProgrammatic && !impressionFiredRef.current) {
      impressionFiredRef.current = true;
      audioAdService.fireAdEvent(ad, "impression");
    }

    if (!companionViewTrackedRef.current) {
      companionViewTrackedRef.current = true;
      if (isProgrammatic && ad.isProgrammatic && ad.companion?.trackingPixels?.length) {
        audioAdService.fireTrackingPixels(ad.companion.trackingPixels);
      }
      audioAdService.recordImpression(
        ad.id,
        adType,
        false,
        false,
        isProgrammatic ? (ad.isProgrammatic ? ad.provider : "house") : "house"
      );
    }

    intervalRef.current = setInterval(() => {
      if (isProgrammatic && audioRef.current && !audioError) {
        const currentTime = audioRef.current.currentTime;
        const duration = audioRef.current.duration || totalDuration;
        setElapsed(currentTime);

        if (!startFiredRef.current && currentTime > 0 && ad.isProgrammatic) {
          startFiredRef.current = true;
          audioAdService.fireAdEvent(ad, "start");
        }

        if (ad.isProgrammatic) {
          audioAdService.checkQuartileProgress(ad, currentTime, duration);
        }
      } else {
        const now = Date.now();
        const elapsedSec = (now - startTimeRef.current) / 1000;
        setElapsed(elapsedSec);

        if (elapsedSec >= totalDuration) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          window.speechSynthesis?.cancel();
          onComplete(false);
        }
      }
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [audioLoaded, audioError, totalDuration, isProgrammatic]);

  useEffect(() => {
    if (isProgrammatic && audioRef.current) {
      audioRef.current.muted = isMuted;
      if (ad.isProgrammatic) {
        audioAdService.fireAdEvent(ad, isMuted ? "mute" : "unmute");
      }
    } else {
      if (isMuted) {
        window.speechSynthesis?.cancel();
      } else if (elapsed > 0 && elapsed < totalDuration) {
        speakHouseAd();
      }
    }
  }, [isMuted]);

  const handleSkip = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    window.speechSynthesis?.cancel();
    if (isProgrammatic && ad.isProgrammatic) {
      audioAdService.fireAdEvent(ad, "skip");
    }
    onComplete(true);
  };

  const handleUpgrade = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    window.speechSynthesis?.cancel();
    onUpgrade();
  };

  const handleCompanionClick = () => {
    if (isProgrammatic && ad.isProgrammatic && ad.companion?.clickThrough) {
      if (ad.companion.trackingPixels.length > 0) {
        audioAdService.fireTrackingPixels(ad.companion.trackingPixels);
      }
      if (ad.tracking.clickTracking.length > 0) {
        audioAdService.fireTrackingPixels(ad.tracking.clickTracking);
      }
      window.open(ad.companion.clickThrough, "_blank", "noopener,noreferrer");
    }
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

  const adTitle = ad.title;
  const adDescription = ad.isProgrammatic
    ? (ad.description || ad.advertiser || "Sponsored content")
    : ad.description;
  const providerLabel = ad.isProgrammatic
    ? `Sponsored by ${ad.advertiser || ad.provider}`
    : `${adType === "pre-roll" ? "Pre-roll" : "Mid-roll"} Ad`;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Audio advertisement: ${adTitle}`}
      aria-live="polite"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      data-testid="ad-overlay"
    >
      <Card className="max-w-md w-full bg-card/95 backdrop-blur-md border-primary/20 shadow-2xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary animate-pulse" aria-hidden="true" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                {providerLabel}
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

          {isProgrammatic && ad.isProgrammatic && ad.companion?.imageUrl ? (
            <div
              className={`flex justify-center ${ad.companion.clickThrough ? "cursor-pointer" : ""}`}
              onClick={ad.companion.clickThrough ? handleCompanionClick : undefined}
              role={ad.companion.clickThrough ? "link" : undefined}
              aria-label={ad.companion.clickThrough ? "Visit advertiser" : undefined}
            >
              <img
                src={ad.companion.imageUrl}
                alt={`Ad from ${ad.advertiser || ad.provider}`}
                className="rounded-lg max-h-48 object-contain"
                width={ad.companion.width}
                height={ad.companion.height}
              />
              {ad.companion.clickThrough && (
                <ExternalLink className="absolute top-2 right-2 h-4 w-4 text-white/70" aria-hidden="true" />
              )}
            </div>
          ) : isProgrammatic && ad.isProgrammatic && !ad.companion?.imageUrl ? (
            <div className="space-y-2">
              <div className="text-center space-y-1 py-1">
                <h3 className="text-lg font-semibold">{adTitle}</h3>
                {adDescription && (
                  <p className="text-muted-foreground text-sm">{adDescription}</p>
                )}
              </div>
              <CompanionAdBanner companion={houseCompanion} onClick={handleUpgrade} />
            </div>
          ) : !isProgrammatic ? (
            <CompanionAdBanner
              companion={{
                title: "Upgrade to Premium",
                description: adDescription || "Enjoy unlimited ad-free listening, offline downloads, and high-quality audio.",
                icon: "crown",
                gradient: "from-amber-500/20 via-yellow-500/10 to-orange-500/20",
                clickLabel: "Go Premium",
              }}
              onClick={handleUpgrade}
            />
          ) : null}

          {!audioLoaded && isProgrammatic && (
            <div className="text-center text-sm text-muted-foreground py-2">
              Loading ad...
            </div>
          )}

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

          <Button
            variant="outline"
            className="w-full border-yellow-500/50 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 hover:text-yellow-400"
            onClick={handleUpgrade}
            aria-label="Remove ads by upgrading to Premium"
          >
            <Crown className="h-4 w-4 mr-2" aria-hidden="true" />
            Remove Ads - Go Premium
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Premium members enjoy ad-free listening
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
