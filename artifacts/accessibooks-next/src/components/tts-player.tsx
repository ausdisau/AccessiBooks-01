import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
  Lock,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAudioContext } from "@/contexts/audio-context";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/wouter-compat";

type OpenAIVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
type VoiceProvider = "openai" | "elevenlabs";

interface SelectedVoice {
  id: string;
  provider: VoiceProvider;
}

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

interface OwnedVoicePack {
  id: string;
  voices: string[];
  systemPrompt?: string;
}

interface VoiceOption {
  id: string;
  name: string;
  description: string;
  provider: VoiceProvider;
}

interface VoiceList {
  openai: VoiceOption[];
  elevenlabs: VoiceOption[];
}

const FREE_OPENAI_VOICES: OpenAIVoice[] = ["alloy", "shimmer"];

const DEFAULT_OPENAI_VOICES: VoiceOption[] = [
  { id: "nova", name: "Nova", description: "Warm, engaging female", provider: "openai" },
  { id: "alloy", name: "Alloy", description: "Neutral, balanced", provider: "openai" },
  { id: "echo", name: "Echo", description: "Clear, steady male", provider: "openai" },
  { id: "fable", name: "Fable", description: "Expressive, storytelling", provider: "openai" },
  { id: "onyx", name: "Onyx", description: "Deep, authoritative male", provider: "openai" },
  { id: "shimmer", name: "Shimmer", description: "Bright, optimistic female", provider: "openai" },
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
  const [selectedVoice, setSelectedVoice] = useState<SelectedVoice>({ id: "alloy", provider: "openai" });
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
  const { audioRef: mainAudioRef } = useAudioContext();

  const { data: ownedPacks } = useQuery<OwnedVoicePack[]>({
    queryKey: ["/api/voice-packs/owned"],
  });

  const { data: voiceList } = useQuery<VoiceList>({
    queryKey: ["/api/tts/voices"],
  });

  const allVoices = useMemo((): VoiceOption[] => {
    const openai = voiceList?.openai || DEFAULT_OPENAI_VOICES;
    const elevenlabs = voiceList?.elevenlabs || [];
    return [...openai, ...elevenlabs];
  }, [voiceList]);

  const unlockedVoices = useMemo(() => {
    const voices = new Set<string>(FREE_OPENAI_VOICES);
    // All ElevenLabs voices are accessible (gated by provider config, not voice packs)
    if (voiceList?.elevenlabs) {
      for (const v of voiceList.elevenlabs) voices.add(v.id);
    }
    if (ownedPacks) {
      for (const pack of ownedPacks) {
        if (pack.voices) {
          for (const v of pack.voices) voices.add(v);
        }
      }
    }
    return voices;
  }, [ownedPacks, voiceList]);

  const activeSystemPrompt = useMemo(() => {
    if (!ownedPacks) return undefined;
    for (const pack of ownedPacks) {
      if (pack.voices?.includes(selectedVoice.id) && pack.systemPrompt) {
        return pack.systemPrompt;
      }
    }
    return undefined;
  }, [ownedPacks, selectedVoice]);

  const isVoiceLocked = useCallback((v: VoiceOption) => {
    return !unlockedVoices.has(v.id);
  }, [unlockedVoices]);

  const currentVoiceOption = useMemo(() =>
    allVoices.find(v => v.id === selectedVoice.id && v.provider === selectedVoice.provider)
    || DEFAULT_OPENAI_VOICES[1],
    [allVoices, selectedVoice]
  );

  useEffect(() => {
    return () => { cleanup(); };
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
    if (isVoiceLocked(currentVoiceOption)) return;

    cleanup();
    setIsLoading(true);
    setProgress(0);
    setDuration(0);

    if (mainAudioRef.current && !mainAudioRef.current.paused) {
      mainAudioRef.current.pause();
    }

    try {
      const body: Record<string, string> = {
        text: textToSpeak,
        provider: selectedVoice.provider,
      };

      if (selectedVoice.provider === "elevenlabs") {
        body.voiceId = selectedVoice.id;
      } else {
        body.voice = selectedVoice.id;
        body.format = "mp3";
        if (activeSystemPrompt) body.systemPrompt = activeSystemPrompt;
      }

      const response = await fetch("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
  }, [selectedVoice, currentVoiceOption, playbackRate, volume, isMuted, autoAdvance, currentPage, totalPages, onNextPage, onWordIndex, cleanup, updateProgress, toast, activeSystemPrompt, isVoiceLocked]);

  const handlePlayPause = useCallback(() => {
    if (isLoading) return;
    if (isVoiceLocked(currentVoiceOption)) return;

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
  }, [isLoading, isPlaying, text, currentVoiceOption, synthesizeAndPlay, updateProgress, onWordIndex, isVoiceLocked]);

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
  const currentVoiceLocked = isVoiceLocked(currentVoiceOption);

  const openaiVoices = useMemo(() => voiceList?.openai || DEFAULT_OPENAI_VOICES, [voiceList]);
  const elevenlabsVoices = useMemo(() => voiceList?.elevenlabs || [], [voiceList]);

  return (
    <div className={"border rounded-lg p-3 bg-muted/30 border-border"}>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className={"flex items-center gap-2 text-sm font-medium text-foreground"}
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
            disabled={isLoading || !text || currentVoiceLocked}
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
          {currentVoiceLocked && (
            <div className={"flex items-center justify-between rounded-md px-3 py-2 text-xs border bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-900/50"}>
              <div className="flex items-center gap-1.5">
                <Lock className="h-3 w-3" />
                <span>Unlock with a Voice Pack</span>
              </div>
              <Link href="/voice-packs" className="underline font-medium hover:opacity-80">
                Browse Voice Packs
              </Link>
            </div>
          )}

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
              disabled={isLoading || !text || currentVoiceLocked}
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

            <span className={"text-xs tabular-nums min-w-[70px] text-right text-muted-foreground"}>
              {formatTime(progress)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs max-w-[160px] truncate">
                    {currentVoiceLocked && <Lock className="h-3 w-3 mr-1 flex-shrink-0" />}
                    {currentVoiceOption.name}
                    {currentVoiceOption.provider === "elevenlabs" && (
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">EL</Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto w-56">
                  <DropdownMenuLabel>OpenAI Voices</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {openaiVoices.map(v => {
                    const locked = !unlockedVoices.has(v.id);
                    const active = selectedVoice.id === v.id && selectedVoice.provider === "openai";
                    return (
                      <DropdownMenuItem
                        key={v.id}
                        onClick={() => {
                          setSelectedVoice({ id: v.id, provider: "openai" });
                          if (isPlaying) handleStop();
                        }}
                        className={active ? "bg-primary/10" : ""}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium flex items-center gap-1">
                              {v.name}
                              {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{v.description}</div>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                  {elevenlabsVoices.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="flex items-center gap-1">
                        ElevenLabs Voices
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 ml-1">Premium</Badge>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {elevenlabsVoices.map(v => {
                        const active = selectedVoice.id === v.id && selectedVoice.provider === "elevenlabs";
                        return (
                          <DropdownMenuItem
                            key={v.id}
                            onClick={() => {
                              setSelectedVoice({ id: v.id, provider: "elevenlabs" });
                              if (isPlaying) handleStop();
                            }}
                            className={active ? "bg-primary/10" : ""}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium">{v.name}</div>
                              {v.description && (
                                <div className="text-xs text-muted-foreground truncate">{v.description}</div>
                              )}
                            </div>
                          </DropdownMenuItem>
                        );
                      })}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/voice-packs" className="text-xs text-primary cursor-pointer">
                      Browse Voice Packs
                    </Link>
                  </DropdownMenuItem>
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

              <label className={"flex items-center gap-1.5 text-xs text-muted-foreground"}>
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
