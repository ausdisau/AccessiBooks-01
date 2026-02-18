import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Play,
  Pause,
  Square,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Loader2,
  Headphones,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type Voice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

interface TTSPlayerProps {
  text: string;
  bookTitle: string;
  currentPage: number;
  totalPages: number;
  onNextPage: () => void;
  onPrevPage: () => void;
  darkMode?: boolean;
  onWordIndex?: (index: number | null) => void;
}

const VOICE_OPTIONS: { value: Voice; label: string; description: string }[] = [
  { value: "nova", label: "Nova", description: "Warm, engaging female" },
  { value: "alloy", label: "Alloy", description: "Neutral, balanced" },
  { value: "echo", label: "Echo", description: "Clear, steady male" },
  { value: "fable", label: "Fable", description: "Expressive, storytelling" },
  { value: "onyx", label: "Onyx", description: "Deep, authoritative male" },
  { value: "shimmer", label: "Shimmer", description: "Bright, optimistic female" },
];

export function TTSPlayer({
  text,
  bookTitle,
  currentPage,
  totalPages,
  onNextPage,
  onPrevPage,
  darkMode = false,
  onWordIndex,
}: TTSPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [voice, setVoice] = useState<Voice>("nova");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const currentTextRef = useRef<string>("");
  const animationFrameRef = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    onWordIndex?.(null);
  }, [onWordIndex]);

  const updateProgress = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      const current = audioRef.current.currentTime;
      const total = audioRef.current.duration;
      setProgress(current);
      setDuration(total);

      if (total > 0 && onWordIndex && currentTextRef.current) {
        const words = currentTextRef.current.split(/\s+/);
        const fraction = current / total;
        const wordIdx = Math.min(Math.floor(fraction * words.length), words.length - 1);
        onWordIndex(wordIdx);
      }

      animationFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, [onWordIndex]);

  const synthesizeAndPlay = useCallback(async (textToSpeak: string) => {
    cleanup();
    setIsLoading(true);
    setProgress(0);
    setDuration(0);

    try {
      const response = await fetch("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSpeak, voice, format: "mp3" }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(err.message || "Failed to synthesize speech");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      currentTextRef.current = textToSpeak;

      const audio = new Audio(url);
      audio.playbackRate = playbackRate;
      audio.volume = isMuted ? 0 : volume;
      audioRef.current = audio;

      audio.addEventListener("loadedmetadata", () => {
        setDuration(audio.duration);
      });

      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setProgress(audio.duration);
        onWordIndex?.(null);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (autoAdvance && currentPage < totalPages) {
          onNextPage();
          setTimeout(() => {
            // Will be triggered by text change
          }, 500);
        }
      });

      audio.addEventListener("error", () => {
        setIsPlaying(false);
        setIsLoading(false);
        toast({ title: "Playback Error", description: "Failed to play audio", variant: "destructive" });
      });

      await audio.play();
      setIsPlaying(true);
      setIsLoading(false);
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    } catch (error: any) {
      setIsLoading(false);
      toast({
        title: "Synthesis Error",
        description: error.message || "Could not convert text to speech",
        variant: "destructive",
      });
    }
  }, [voice, playbackRate, volume, isMuted, autoAdvance, currentPage, totalPages, onNextPage, onWordIndex, cleanup, updateProgress, toast]);

  const handlePlayPause = useCallback(() => {
    if (isLoading) return;

    if (audioRef.current && currentTextRef.current === text) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        onWordIndex?.(null);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      }
    } else {
      synthesizeAndPlay(text);
    }
  }, [isLoading, isPlaying, text, synthesizeAndPlay, updateProgress, onWordIndex]);

  const handleStop = useCallback(() => {
    cleanup();
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
    currentTextRef.current = "";
  }, [cleanup]);

  const handleSeek = useCallback((value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setProgress(value[0]);
    }
  }, []);

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  return (
    <div className={`border rounded-lg p-3 ${darkMode ? "bg-gray-800/50 border-gray-700" : "bg-muted/30 border-border"}`}>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex items-center gap-2 text-sm font-medium ${darkMode ? "text-gray-200" : "text-foreground"}`}
        >
          <Headphones className="h-4 w-4 text-primary" />
          Listen to this page
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        {!expanded && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handlePlayPause}
            disabled={isLoading || !text}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="h-8 w-8 p-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {expanded && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onPrevPage}
              disabled={currentPage <= 1}
              aria-label="Previous page"
              className="h-8 w-8 p-0"
            >
              <SkipBack className="h-4 w-4" />
            </Button>

            <Button
              size="sm"
              variant={isPlaying ? "secondary" : "default"}
              onClick={handlePlayPause}
              disabled={isLoading || !text}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="h-9 w-9 p-0 rounded-full"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleStop}
              disabled={!isPlaying && progress === 0}
              aria-label="Stop"
              className="h-8 w-8 p-0"
            >
              <Square className="h-3 w-3" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={onNextPage}
              disabled={currentPage >= totalPages}
              aria-label="Next page"
              className="h-8 w-8 p-0"
            >
              <SkipForward className="h-4 w-4" />
            </Button>

            <div className="flex-1 mx-2">
              <Slider
                value={[progress]}
                min={0}
                max={duration || 1}
                step={0.1}
                onValueChange={handleSeek}
                className="w-full"
                aria-label="Playback progress"
              />
            </div>

            <span className={`text-xs tabular-nums min-w-[70px] text-right ${darkMode ? "text-gray-400" : "text-muted-foreground"}`}>
              {formatTime(progress)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    {VOICE_OPTIONS.find(v => v.value === voice)?.label || "Voice"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>AI Voice</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {VOICE_OPTIONS.map(v => (
                    <DropdownMenuItem
                      key={v.value}
                      onClick={() => {
                        setVoice(v.value);
                        if (isPlaying) handleStop();
                      }}
                      className={voice === v.value ? "bg-primary/10" : ""}
                    >
                      <div>
                        <div className="font-medium">{v.label}</div>
                        <div className="text-xs text-muted-foreground">{v.description}</div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    {playbackRate}x
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Speed</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {speedOptions.map(s => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => setPlaybackRate(s)}
                      className={playbackRate === s ? "bg-primary/10" : ""}
                    >
                      {s}x
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsMuted(!isMuted)}
                aria-label={isMuted ? "Unmute" : "Mute"}
                className="h-7 w-7 p-0"
              >
                {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={([v]) => { setVolume(v); if (v > 0) setIsMuted(false); }}
                className="w-20"
                aria-label="Volume"
              />

              <label className={`flex items-center gap-1.5 text-xs ${darkMode ? "text-gray-400" : "text-muted-foreground"}`}>
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => setAutoAdvance(e.target.checked)}
                  className="rounded border-border"
                />
                Auto-next
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
