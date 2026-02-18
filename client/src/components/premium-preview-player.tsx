import { useState, useEffect, useRef, useCallback } from "react";
import { Book } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Crown, Play, Pause, X } from "lucide-react";

const PREVIEW_DURATION = 30;
const FADE_START = 25;

interface PremiumPreviewPlayerProps {
  book: Book;
  onUpgrade: () => void;
  onDismiss: () => void;
}

export function PremiumPreviewPlayer({ book, onUpgrade, onDismiss }: PremiumPreviewPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewEnded, setPreviewEnded] = useState(false);

  const audioSrc = book.audioUrl || `/api/stream/${book.id}`;

  const cleanup = useCallback(() => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }, []);

  const startFadeOut = useCallback(() => {
    if (!audioRef.current || fadeIntervalRef.current) return;
    const steps = 25;
    const intervalMs = 5000 / steps;
    let step = 0;
    fadeIntervalRef.current = setInterval(() => {
      step++;
      if (audioRef.current) {
        audioRef.current.volume = Math.max(0, 1 - step / steps);
      }
      if (step >= steps) {
        if (fadeIntervalRef.current) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
        }
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setIsPlaying(false);
        setPreviewEnded(true);
      }
    }, intervalMs);
  }, []);

  useEffect(() => {
    const audio = new Audio(audioSrc);
    audio.volume = 1;
    audioRef.current = audio;

    audio.addEventListener("canplaythrough", () => {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    });

    audio.addEventListener("error", () => {
      setPreviewEnded(true);
    });

    return cleanup;
  }, [audioSrc, cleanup]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 0.5;
        if (next >= FADE_START && !fadeIntervalRef.current) {
          startFadeOut();
        }
        if (next >= PREVIEW_DURATION) {
          clearInterval(timer);
          return PREVIEW_DURATION;
        }
        return next;
      });
    }, 500);
    return () => clearInterval(timer);
  }, [isPlaying, startFadeOut]);

  const togglePlayPause = () => {
    if (!audioRef.current || previewEnded) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleDismiss = () => {
    cleanup();
    onDismiss();
  };

  const handleUpgrade = () => {
    cleanup();
    onUpgrade();
  };

  const progressPercent = (elapsed / PREVIEW_DURATION) * 100;
  const remainingSeconds = Math.max(0, Math.ceil(PREVIEW_DURATION - elapsed));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/40">
      <Card className="w-full max-w-md shadow-2xl border-primary/20">
        <CardContent className="p-5 relative">
          <div className="absolute top-3 right-3 bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
            Preview
          </div>

          <div className="flex items-center gap-3 mb-4 pr-16">
            <button
              onClick={togglePlayPause}
              disabled={previewEnded}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              aria-label={isPlaying ? "Pause preview" : "Play preview"}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{book.title}</p>
              <p className="text-xs text-muted-foreground truncate">{book.author}</p>
            </div>
          </div>

          <div className="mb-1">
            <Progress value={progressPercent} className="h-2" />
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            {previewEnded ? "Preview ended" : `${remainingSeconds}s remaining`}
          </p>

          <Button
            onClick={handleUpgrade}
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-black mb-2"
          >
            <Crown className="h-4 w-4 mr-2" />
            Upgrade to keep listening
          </Button>

          <Button variant="ghost" onClick={handleDismiss} className="w-full text-muted-foreground">
            Dismiss
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
