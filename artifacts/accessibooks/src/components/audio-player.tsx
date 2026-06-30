import { useState, useEffect, useRef, useCallback } from "react";
import { Book } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useMonetization } from "@/hooks/use-monetization";
import { BookmarkList } from "./bookmark-list";
import { PremiumFeatureBadge } from "./premium-feature-badge";
import { SleepTimer } from "./sleep-timer";
import { ChapterList } from "./chapter-list";
import { AddToCollectionButton } from "./library-collections";
import { AddToPlaylistDialog } from "./add-to-playlist-dialog";
import { CaptionsBar } from "./captions-bar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePreferencesKernel } from "@/hooks/use-preferences-kernel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Play, 
  Pause, 
  RotateCcw,
  RotateCw,
  Bookmark as BookmarkIcon,
  Loader2,
  Gauge,
  Gem,
  Car,
  ListMusic,
  ChevronDown,
  Crown,
  SkipForward,
  SkipBack,
  ChevronLeft,
  ChevronRight,
  Subtitles,
  ArrowUpDown,
  Keyboard,
  Music2,
  X,
} from "lucide-react";
import { useAudioContext } from "@/contexts/audio-context";
import { InteractiveTranscript } from "./interactive-transcript";
import { localStorageService } from "@/lib/storage";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";

interface AudioPlayerProps {
  book: Book;
}

const FREE_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5];
const ALL_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

const SPEED_OPTIONS = ALL_SPEEDS.map((value) => ({
  label: `${value}x`,
  value,
}));

export function AudioPlayer({ book }: AudioPlayerProps) {
  const {
    audioRef,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    isLoading,
    isBuffering,
    togglePlayPause,
    skip,
    seekTo,
    setSpeed,
    formatTime,
    chapters, 
    currentChapter, 
    currentChapterIndex,
    nextChapter,
    prevChapter,
    seekToChapter,
    playBook,
    streamQuality,
    bufferedAhead,
    adState,
    adLoading,
  } = useAudioContext();

  const { 
    skipStatus, 
    audioQuality, 
    useSkip: consumeSkip, 
    isUsingSkip,
    startSession,
    endSession,
    isPremium,
  } = useMonetization();
  const { bookmarks, addBookmark, removeBookmark, isAtLimit, maxBookmarks } = useBookmarks(book.id, isPremium);
  
  const [bookmarkName, setBookmarkName] = useState("");
  const [showBookmarkInput, setShowBookmarkInput] = useState(false);
  const [carMode, setCarMode] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const [captionFontSize, setCaptionFontSize] = useState(16);
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile, updateProfile } = usePreferencesKernel();
  const captionsOn = profile.captionsOn;
  const captionPosition = profile.captionPosition ?? "below";
  const skipForwardSec: number = ((profile as unknown as Record<string, unknown>).preferredSkipForward as number) ?? 30;
  const skipBackSec: number = ((profile as unknown as Record<string, unknown>).preferredSkipBack as number) ?? 30;
  const transcriptDefault = !!((profile as unknown as Record<string, unknown>).transcriptOpenByDefault);

  useEffect(() => {
    if (transcriptDefault) setShowTranscript(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptDefault]);

  const [a11ySettings, setA11ySettings] = useState(() => localStorageService.getSettings());
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showBreakPrompt, setShowBreakPrompt] = useState(false);

  const [showPicturePause, setShowPicturePause] = useState(false);
  const [picturePauseChapter, setPicturePauseChapter] = useState<string | null>(null);
  const [picturePauseSymbolUrl, setPicturePauseSymbolUrl] = useState<string | null>(null);
  const lastPicturePauseTimeRef = useRef<number>(0);
  const picturePauseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevChapterIndexRef = useRef<number>(-1);
  const picturePauseWasPlayingRef = useRef<boolean>(false);

  interface PictureCheckinData {
    question: string;
    options: string[];
    symbolUrls: (string | null)[];
  }
  const [showPictureCheckin, setShowPictureCheckin] = useState(false);
  const [pictureCheckinData, setPictureCheckinData] = useState<PictureCheckinData | null>(null);
  const [pictureCheckinSelected, setPictureCheckinSelected] = useState<number | null>(null);
  const [checkinConfirmed, setCheckinConfirmed] = useState(false);

  const logCheckinAction = (action: "answered" | "skipped") => {
    try {
      const key = "accessibooks:checkin-log";
      const logs: unknown[] = JSON.parse(localStorage.getItem(key) ?? "[]");
      logs.push({ bookId: String(book.id), chapterIdx: currentChapterIndex, action, ts: Date.now() });
      localStorage.setItem(key, JSON.stringify(logs.slice(-100)));
    } catch {}
  };

  const pictureCheckinMutation = useMutation({
    mutationFn: async ({ completedChapterTitle }: { completedChapterTitle: string }) => {
      const chapterContext = completedChapterTitle
        ? `${book.title} — ${completedChapterTitle}`
        : book.description ?? book.title ?? "audiobook chapter";
      const res = await apiRequest("POST", "/api/ai/chapter-picture-checkin", {
        chapterText: chapterContext,
        title: book.title,
        bookId: String(book.id),
        chapterIndex: currentChapterIndex,
      });
      if (!res.ok) throw new Error("Check-in failed");
      return res.json() as Promise<{ question: string; options: string[] }>;
    },
    onSuccess: async (data) => {
      const urls = await Promise.all(
        (data.options ?? []).map(async (w: string) => {
          try {
            const r = await fetch(`/api/symbols/${encodeURIComponent(w.toLowerCase())}`);
            const d = await r.json() as { url: string | null };
            return d.url ?? null;
          } catch {
            return null;
          }
        })
      );
      setPictureCheckinData({ question: data.question, options: data.options, symbolUrls: urls });
      setPictureCheckinSelected(null);
      setShowPictureCheckin(true);
    },
  });

  const triggerPicturePause = useCallback((chapterTitle: string | null) => {
    picturePauseWasPlayingRef.current = isPlaying;
    if (isPlaying) togglePlayPause();
    setPicturePauseChapter(chapterTitle);
    const keyword = (chapterTitle ?? book.title ?? "story").split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");
    fetch(`/api/symbols/${encodeURIComponent(keyword)}`)
      .then(r => r.json())
      .then((d: { url: string | null }) => setPicturePauseSymbolUrl(d.url ?? null))
      .catch(() => setPicturePauseSymbolUrl(null));
    setShowPicturePause(true);
  }, [isPlaying, togglePlayPause, book.title]);

  const handlePicturePauseKeepGoing = useCallback(() => {
    setShowPicturePause(false);
    setPicturePauseSymbolUrl(null);
    if (picturePauseWasPlayingRef.current && !isPlaying) togglePlayPause();
    picturePauseWasPlayingRef.current = false;
  }, [isPlaying, togglePlayPause]);

  useEffect(() => {
    const sync = () => setA11ySettings(localStorageService.getSettings());
    document.addEventListener("accessibooks:settings-changed", sync);
    return () => document.removeEventListener("accessibooks:settings-changed", sync);
  }, []);

  useEffect(() => {
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    const pacing = a11ySettings.sessionPacingMinutes ?? 0;
    if (pacing > 0) {
      sessionTimerRef.current = setInterval(() => {
        setShowBreakPrompt(true);
      }, pacing * 60 * 1000);
    }
    return () => { if (sessionTimerRef.current) clearInterval(sessionTimerRef.current); };
  }, [a11ySettings.sessionPacingMinutes]);

  useEffect(() => {
    if (picturePauseIntervalRef.current) clearInterval(picturePauseIntervalRef.current);
    if (!a11ySettings.picturePauses) return;
    picturePauseIntervalRef.current = setInterval(() => {
      if (!isPlaying) return;
      const now = Date.now();
      if (now - lastPicturePauseTimeRef.current >= 5 * 60 * 1000) {
        lastPicturePauseTimeRef.current = now;
        triggerPicturePause(currentChapter?.title ?? null);
      }
    }, 30 * 1000);
    return () => { if (picturePauseIntervalRef.current) clearInterval(picturePauseIntervalRef.current); };
  }, [a11ySettings.picturePauses, isPlaying, currentChapter, triggerPicturePause]);

  useEffect(() => {
    const prev = prevChapterIndexRef.current;
    if (prev === -1) {
      prevChapterIndexRef.current = currentChapterIndex;
      return;
    }
    if (currentChapterIndex === prev) return;
    prevChapterIndexRef.current = currentChapterIndex;

    if (a11ySettings.picturePauses) {
      lastPicturePauseTimeRef.current = Date.now();
      triggerPicturePause(currentChapter?.title ?? null);
    }
    if (a11ySettings.comprehensionCheckIns && !showPictureCheckin) {
      const completedChapterTitle = chapters[prev]?.title ?? "";
      pictureCheckinMutation.mutate({ completedChapterTitle });
    }
  }, [currentChapterIndex]);


  const handleDownloadDaisy = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${book.id}/daisy`, { credentials: "include" });
      if (!res.ok) throw new Error("DAISY export failed");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${book.title ?? "book"}-daisy.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "DAISY package downloaded" });
    } catch {
      toast({ title: "DAISY export failed", variant: "destructive" });
    }
  }, [book.id, book.title, toast]);

  const handleToggleCaptions = () => {
    updateProfile({ captionsOn: !captionsOn });
  };

  const handleToggleCaptionPosition = () => {
    updateProfile({ captionPosition: captionPosition === "above" ? "below" : "above" });
  };

  const followAlong = profile.karaokeFollowAlong ?? false;
  const handleToggleFollowAlong = () => {
    updateProfile({ karaokeFollowAlong: !followAlong });
  };

  const { data: alignmentData } = useQuery<{
    available: boolean;
    precision?: "exact" | "estimated" | "none";
  }>({
    queryKey: ["/api/books", book.id, "word-alignment"],
    queryFn: async () => {
      const res = await fetch(`/api/books/${book.id}/word-alignment`);
      if (!res.ok) return { available: false };
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  // Follow Along is word-level karaoke; only offer it for exact per-word timing
  // so we never highlight words from interpolated ("estimated") timing.
  const alignmentAvailable = alignmentData?.precision === "exact";

  const hasChapters = chapters.length > 0;
  const canGoPrev = currentChapterIndex > 0;
  const canGoNext = currentChapterIndex < chapters.length - 1;

  const captionsOnRef = useRef(captionsOn);
  captionsOnRef.current = captionsOn;

  useEffect(() => {
    const onToggleCaptions = () => updateProfile({ captionsOn: !captionsOnRef.current });
    const onToggleTranscript = () => setShowTranscript(prev => !prev);
    const onAddBookmark = () => setShowBookmarkInput(true);
    document.addEventListener("accessibooks:toggle-captions", onToggleCaptions);
    document.addEventListener("accessibooks:toggle-transcript", onToggleTranscript);
    document.addEventListener("accessibooks:add-bookmark", onAddBookmark);
    return () => {
      document.removeEventListener("accessibooks:toggle-captions", onToggleCaptions);
      document.removeEventListener("accessibooks:toggle-transcript", onToggleTranscript);
      document.removeEventListener("accessibooks:add-bookmark", onAddBookmark);
    };
  }, [updateProfile]);

  useEffect(() => {
    startSession(book.id);
    return () => {
      endSession();
    };
  }, [book.id]);

  const handleSkipForward = async () => {
    if (!isPremium && skipStatus && !skipStatus.unlimited) {
      if (skipStatus.remaining <= 0) {
        toast({
          title: "Skip limit reached",
          description: `Upgrade to Premium for unlimited skips. Resets in ${Math.ceil(skipStatus.resetIn / 60)} minutes.`,
          variant: "destructive",
        });
        return;
      }
      try {
        const response = await fetch("/api/monetization/use-skip", {
          method: "POST",
          credentials: "include",
        });
        if (!response.ok) {
          const error = await response.json();
          toast({
            title: "Skip limit reached",
            description: error.message || "Upgrade to Premium for unlimited skips.",
            variant: "destructive",
          });
          return;
        }
      } catch (error) {
        return;
      }
    }
    skip(skipForwardSec);
  };

  const handleSkipBackward = () => {
    skip(-skipBackSec);
  };

  const handleChapterSelect = (chapter: { id: string; title: string; audioUrl?: string }, index?: number) => {
    if (index !== undefined) {
      seekToChapter(index);
    }
    toast({
      title: "Now playing",
      description: chapter.title,
    });
    setShowChapters(false);
  };

  const handlePrevChapter = () => {
    if (canGoPrev) {
      prevChapter();
      toast({
        title: "Previous chapter",
        description: chapters[currentChapterIndex - 1]?.title || "Previous chapter",
      });
    }
  };

  const handleNextChapter = () => {
    if (canGoNext) {
      nextChapter();
      toast({
        title: "Next chapter",
        description: chapters[currentChapterIndex + 1]?.title || "Next chapter",
      });
    }
  };

  const handleAddBookmark = () => {
    if (showBookmarkInput && bookmarkName.trim()) {
      const name = bookmarkName.trim() || `Bookmark at ${formatTime(currentTime)}`;
      addBookmark(name, currentTime);
      setBookmarkName("");
      setShowBookmarkInput(false);
      toast({
        title: "Bookmark added",
        description: name,
      });
    } else {
      setShowBookmarkInput(true);
      setBookmarkName(`Chapter at ${formatTime(currentTime)}`);
    }
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const remainingTime = duration - currentTime;

  if (carMode) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-4 sm:p-8">
        <audio ref={audioRef} preload={streamQuality.tier !== "sd" ? "auto" : "metadata"} crossOrigin="anonymous" />
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCarMode(false)}
          className="absolute top-4 right-4"
          aria-label="Exit car mode"
        >
          Exit Car Mode
        </Button>
        
        <div className="text-center mb-8">
          {book.coverImage && (
            <img
              src={book.coverImage}
              alt={`${book.title} cover`}
              className="w-24 h-36 sm:w-32 sm:h-48 object-cover rounded-lg mx-auto mb-4"
            />
          )}
          <h2 className="text-lg sm:text-2xl font-bold truncate max-w-md">{book.title}</h2>
          <p className="text-lg text-muted-foreground">{book.author}</p>
        </div>
        
        <div className="w-full max-w-md mb-8">
          <Slider
            value={[progressPercentage]}
            onValueChange={([value]) => {
              const newTime = (value / 100) * duration;
              seekTo(newTime);
            }}
            max={100}
            step={0.1}
            className="w-full h-3"
          />
          <div className="flex justify-between text-lg mt-2">
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(remainingTime)}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4 sm:gap-8">
          <Button
            size="lg"
            variant="secondary"
            onClick={handleSkipBackward}
            className="h-14 w-14 sm:h-20 sm:w-20 rounded-full text-xl"
            aria-label={`Rewind ${skipBackSec} seconds`}
            aria-disabled={adState.isAdPlaying || adLoading}
          >
            <div className="flex flex-col items-center">
              <RotateCcw className="h-6 w-6 sm:h-8 sm:w-8" />
              <span className="text-xs mt-1">{skipBackSec}</span>
            </div>
          </Button>
          
          <Button
            size="lg"
            onClick={togglePlayPause}
            disabled={isLoading}
            className="h-20 w-20 sm:h-28 sm:w-28 rounded-full"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isLoading ? (
              <Loader2 className="h-8 w-8 sm:h-12 sm:w-12 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-8 w-8 sm:h-12 sm:w-12" />
            ) : (
              <Play className="h-8 w-8 sm:h-12 sm:w-12 ml-1" />
            )}
          </Button>
          
          <Button
            size="lg"
            variant="secondary"
            onClick={handleSkipForward}
            className="h-14 w-14 sm:h-20 sm:w-20 rounded-full text-xl"
            aria-label={`Forward ${skipForwardSec} seconds`}
            aria-disabled={adState.isAdPlaying || adLoading}
            disabled={isUsingSkip}
          >
            <div className="flex flex-col items-center">
              <RotateCw className="h-6 w-6 sm:h-8 sm:w-8" />
              <span className="text-xs mt-1">{skipForwardSec}</span>
            </div>
          </Button>
        </div>
        
        <div className="mt-8 text-lg sm:text-2xl font-medium">
          {playbackRate}x Speed
        </div>
        
        {!isPremium && skipStatus && !skipStatus.unlimited && (
          <div className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
            <SkipForward className="h-4 w-4" />
            <span>{skipStatus.remaining}/{skipStatus.total} skips remaining</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto" role="region" aria-label={`Audio player: ${book.title} by ${book.author}`}>
      <audio ref={audioRef} preload={streamQuality.tier !== "sd" ? "auto" : "metadata"} crossOrigin="anonymous" />

      {/* Two-column layout on md+, single column stacked on mobile */}
      <div className="flex flex-col md:flex-row gap-4 sm:gap-6">
        {/* Left column: cover art (full-width on mobile, fixed width on md+) */}
        <div className="md:w-56 lg:w-64 shrink-0">
          {book.coverImage ? (
            <img
              src={book.coverImage}
              alt={`${book.title} audiobook cover`}
              className="w-full max-w-[200px] sm:max-w-[240px] md:w-full md:max-w-none aspect-[2/3] object-cover rounded-lg mx-auto md:mx-0 shadow-lg"
              data-testid="img-book-cover"
            />
          ) : (
            <div className="w-full max-w-[200px] sm:max-w-[240px] md:w-full md:max-w-none aspect-[2/3] rounded-lg bg-secondary flex items-center justify-center mx-auto md:mx-0 shadow-md">
              <ListMusic className="h-16 w-16 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Right column: book info + controls + chapter list */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Book info */}
          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-1 text-center md:text-left" data-testid="text-book-title">
              {book.title}
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground mb-2 text-center md:text-left" data-testid="text-book-author">
              by {book.author}
            </p>
            {book.narrator && (
              <p className="text-sm text-muted-foreground mb-2 text-center md:text-left" data-testid="text-book-narrator">
                Narrated by {book.narrator}
              </p>
            )}
            {book.description && (
              <p className="text-sm text-muted-foreground line-clamp-3 hidden md:block" data-testid="text-book-description">
                {book.description}
              </p>
            )}
          </div>

      <Card className="overflow-hidden">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span aria-label="Current time" data-testid="text-current-time">
                {formatTime(currentTime)}
              </span>
              <div className="flex items-center gap-2">
                {isBuffering && (
                  <span className="flex items-center gap-1 text-amber-500 text-xs font-medium">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Buffering…
                  </span>
                )}
                {streamQuality.tier === "uhq" ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <Gem className="h-3 w-3" />
                    UHQ
                  </span>
                ) : streamQuality.tier === "hd" ? (
                  <span className="text-xs font-medium text-blue-500 dark:text-blue-400">HD</span>
                ) : null}
              </div>
              <span aria-label="Time remaining" className="text-muted-foreground">
                -{formatTime(remainingTime)}
              </span>
            </div>

            {/* Buffer health bar — shows how much audio is cached ahead */}
            {duration > 0 && (
              <div className="relative h-1 rounded-full bg-muted overflow-hidden mb-1" aria-hidden="true">
                <div
                  className="absolute inset-y-0 left-0 bg-primary/20 rounded-full transition-all duration-1000 ease-linear"
                  style={{ width: `${Math.min(100, ((currentTime + bufferedAhead) / duration) * 100)}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-primary/50 rounded-full"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            )}
            
            <Slider
              value={[progressPercentage]}
              onValueChange={([value]) => {
                const newTime = (value / 100) * duration;
                seekTo(newTime);
              }}
              max={100}
              step={0.1}
              className="w-full"
              aria-label="Audio progress"
              data-testid="slider-progress"
            />
          </div>

          {/* Captions bar — above position */}
          {captionsOn && captionPosition === "above" && (
            <div className="mb-4" data-testid="captions-bar">
              <CaptionsBar
                bookId={book.id}
                currentTime={currentTime}
                fontSize={captionFontSize}
                onFontSizeChange={setCaptionFontSize}
              />
            </div>
          )}

          {/* Chapter indicator */}
          {hasChapters && currentChapter && (
            <div className="text-center mb-3">
              <span className="text-sm text-muted-foreground">
                Chapter {currentChapterIndex + 1} of {chapters.length}
              </span>
              <p className="text-sm font-medium truncate max-w-[200px] sm:max-w-xs mx-auto">
                {currentChapter.title}
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 mb-8">
            {hasChapters && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={handlePrevChapter}
                disabled={!canGoPrev}
                aria-label="Previous chapter"
                data-testid="button-prev-chapter"
              >
                <SkipBack className="h-5 w-5" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={handleSkipBackward}
              aria-label={`Rewind ${skipBackSec} seconds`}
              data-testid="button-rewind"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>

            <Button
              size="icon"
              className="h-16 w-16 rounded-full shadow-xl bg-primary hover:scale-105 transition-transform"
              onClick={togglePlayPause}
              disabled={isLoading || isBuffering}
              aria-label={isPlaying ? "Pause" : "Play"}
              data-testid="button-play-pause"
            >
              {isLoading || isBuffering ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-8 w-8 fill-current" />
              ) : (
                <Play className="h-8 w-8 fill-current ml-1" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={handleSkipForward}
              aria-label={`Forward ${skipForwardSec} seconds`}
              data-testid="button-forward"
            >
              <RotateCw className="h-5 w-5" />
            </Button>

            {hasChapters && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={handleNextChapter}
                disabled={!canGoNext}
                aria-label="Next chapter"
                data-testid="button-next-chapter"
              >
                <SkipForward className="h-5 w-5" />
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 px-3 rounded-full bg-secondary/50 hover:bg-secondary">
                    <Gauge className="h-4 w-4 mr-2" />
                    {playbackRate}x
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-40">
                  {ALL_SPEEDS.map((speed) => {
                    const isLocked = !isPremium && !FREE_SPEEDS.includes(speed);
                    return (
                      <DropdownMenuItem
                        key={speed}
                        onClick={() => {
                          if (!isLocked) setSpeed(speed);
                        }}
                        className={`flex items-center justify-between ${playbackRate === speed ? "bg-accent" : ""} ${isLocked ? "opacity-50 cursor-not-allowed" : ""}`}
                        aria-label={isLocked ? `${speed}x — Plus/Premium only` : `Set speed to ${speed}x`}
                      >
                        <span>{speed}x</span>
                        {isLocked && <Crown className="h-3 w-3 text-primary" aria-hidden="true" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              <SleepTimer />
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={() => setShowChapters(true)}
                aria-label="Chapters"
              >
                <ListMusic className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`h-9 w-9 rounded-full ${showTranscript ? 'text-primary' : ''}`}
                onClick={() => {
                  const willOpen = !showTranscript;
                  setShowTranscript(willOpen);
                  if (willOpen) {
                    fetch("/api/activity/log", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ eventType: "transcript_opened", bookId: book.id }),
                    }).catch(() => {});
                  }
                }}
                aria-label={showTranscript ? "Close transcript" : "Open transcript"}
                aria-pressed={showTranscript}
                data-testid="button-transcript-toggle"
              >
                <Subtitles className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCarMode(true)}
                className="gap-1 rounded-full"
                aria-label="Enable car mode"
                data-testid="button-car-mode"
              >
                <Car className="h-4 w-4" />
                <span className="hidden sm:inline">Car Mode</span>
              </Button>
              
              <Button
                variant={captionsOn ? "default" : "outline"}
                size="sm"
                onClick={handleToggleCaptions}
                className="gap-1 rounded-full"
                aria-label={captionsOn ? "Turn off captions" : "Turn on captions"}
                aria-pressed={captionsOn}
                data-testid="button-captions-toggle"
              >
                <Subtitles className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">CC</span>
              </Button>

              {captionsOn && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleCaptionPosition}
                  className="h-9 px-2 rounded-full text-xs gap-1"
                  aria-label={`Move captions ${captionPosition === "above" ? "below" : "above"} the player`}
                  data-testid="button-caption-position"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{captionPosition === "above" ? "↓" : "↑"}</span>
                </Button>
              )}


              {alignmentAvailable && (
                <Button
                  variant={followAlong ? "default" : "outline"}
                  size="sm"
                  onClick={handleToggleFollowAlong}
                  className={`gap-1 rounded-full ${followAlong ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : ""}`}
                  aria-label={followAlong ? "Follow Along active — click to disable" : "Enable Follow Along (sync ebook text with audio)"}
                  aria-pressed={followAlong}
                  title={followAlong ? "Follow Along: ON — ebook text highlights as audio plays" : "Follow Along: OFF — enable to sync ebook reader with audio"}
                  data-testid="button-follow-along"
                >
                  <Music2 className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Follow Along</span>
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddBookmark}
                      aria-label={isAtLimit ? `Bookmark limit reached (${maxBookmarks} max for free tier)` : "Bookmark current position"}
                      className="rounded-full"
                      disabled={isAtLimit && !showBookmarkInput}
                      data-testid="button-add-bookmark"
                    >
                      <BookmarkIcon className="h-4 w-4 mr-1" aria-hidden="true" />
                      Bookmark
                    </Button>
                  </span>
                </TooltipTrigger>
                {isAtLimit && (
                  <TooltipContent side="top" className="text-xs max-w-[200px]">
                    Bookmark limit reached. Upgrade to Plus or Premium for unlimited bookmarks.
                  </TooltipContent>
                )}
              </Tooltip>

              {showBookmarkInput && (
                <div className="flex items-center gap-1" role="group" aria-label="Name your bookmark">
                  <Input
                    value={bookmarkName}
                    onChange={(e) => setBookmarkName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddBookmark();
                      if (e.key === "Escape") { setShowBookmarkInput(false); setBookmarkName(""); }
                    }}
                    placeholder="Name bookmark…"
                    className="h-8 w-36 text-sm"
                    autoFocus
                    aria-label="Bookmark name"
                    data-testid="input-bookmark-name"
                  />
                  <Button
                    size="sm"
                    className="h-8 px-2"
                    onClick={handleAddBookmark}
                    aria-label="Save bookmark"
                    data-testid="button-bookmark-save"
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => { setShowBookmarkInput(false); setBookmarkName(""); }}
                    aria-label="Cancel bookmark"
                    data-testid="button-bookmark-cancel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}


              <AddToCollectionButton bookId={book.id} />
              {user && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPlaylistDialog(true)}
                  aria-label="Add to playlist"
                  className="rounded-full"
                  data-testid="button-add-to-playlist"
                >
                  <ListMusic className="h-4 w-4 mr-1" aria-hidden="true" />
                  Playlist
                </Button>
              )}
            </div>
          </div>

          {captionsOn && captionPosition === "below" && (
            <div className="mt-4 pt-3 border-t border-border" data-testid="captions-bar">
              <CaptionsBar
                bookId={book.id}
                currentTime={currentTime}
                fontSize={captionFontSize}
                onFontSizeChange={setCaptionFontSize}
              />
            </div>
          )}

          {/* Keyboard shortcut hint */}
          <div className="flex justify-end mt-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  onClick={() => document.dispatchEvent(new CustomEvent("accessibooks:open-shortcuts"))}
                  aria-label="Keyboard shortcuts"
                  data-testid="button-keyboard-shortcuts-hint"
                >
                  <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Press</span>
                  <kbd className="text-[10px] font-mono border border-current rounded px-0.5">?</kbd>
                  <span>for shortcuts</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Keyboard shortcuts
              </TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>

      <AddToPlaylistDialog
        book={book}
        open={showPlaylistDialog}
        onOpenChange={setShowPlaylistDialog}
      />

      {isPremium ? (
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20">
          <CardContent className="p-3 flex items-center gap-3">
            <Gem className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                {streamQuality.label}
              </span>
              <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70 ml-2">
                Premium · byte-range proxy · eager buffering
              </span>
            </div>
          </CardContent>
        </Card>
      ) : (skipStatus || audioQuality) ? (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4 text-sm">
              {skipStatus && !skipStatus.unlimited && (
                <div className="flex items-center gap-2">
                  <SkipForward className="h-4 w-4 text-amber-600" />
                  <span className="text-amber-700 dark:text-amber-300">
                    {skipStatus.remaining}/{skipStatus.total} skips
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-amber-600" />
                <span className="text-amber-700 dark:text-amber-300">
                  {streamQuality.label}
                </span>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-amber-700 hover:text-amber-800 dark:text-amber-300"
              onClick={() => window.location.href = "/api/subscription/create-checkout"}
            >
              <Crown className="h-4 w-4 mr-1" />
              Upgrade
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        data-testid="status-player"
      >
        {isPlaying ? "Playing" : "Paused"} at {formatTime(currentTime)} of {formatTime(duration)}, 
        speed {playbackRate.toFixed(1)}x
      </div>

      {showChapters && hasChapters && (
        <ChapterList
          bookId={book.id}
          onChapterSelect={handleChapterSelect}
        />
      )}

      <BookmarkList
        bookmarks={bookmarks}
        onJumpTo={seekTo}
        onRemove={removeBookmark}
        formatTime={formatTime}
      />

      {showTranscript && (
        <Card>
          <CardContent className="p-4">
            <div className="h-[300px]">
              <InteractiveTranscript
                bookId={book.id}
                currentTime={currentTime}
                onSeek={seekTo}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {showBreakPrompt && !showPictureCheckin && (
        <Card className="border-2 border-primary/30 bg-primary/5 mt-2">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">⏰</span>
              <div className="flex-1">
                <p className="font-semibold mb-1">Time for a break!</p>
                <p className="text-sm text-muted-foreground mb-3">
                  You've been listening for {a11ySettings.sessionPacingMinutes} minutes. Rest your ears and mind.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {a11ySettings.comprehensionCheckIns && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setShowBreakPrompt(false);
                        const completedChapterTitle = currentChapter?.title ?? "";
                        pictureCheckinMutation.mutate({ completedChapterTitle });
                      }}
                      disabled={pictureCheckinMutation.isPending}
                    >
                      <span aria-hidden="true" className="mr-1">✨</span>
                      {pictureCheckinMutation.isPending ? "Getting check-in…" : "Quick Chapter Check-in"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setShowBreakPrompt(false)}>
                    Continue Listening
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showPicturePause && a11ySettings.picturePauses && (
        <Card className="border-2 border-purple-400/40 bg-purple-50 dark:bg-purple-950/40 mt-2" role="dialog" aria-label="Picture pause">
          <CardContent className="p-5">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-32 h-32 flex items-center justify-center">
                {picturePauseSymbolUrl ? (
                  <img
                    src={picturePauseSymbolUrl}
                    alt={`Symbol for ${picturePauseChapter ?? book.title}`}
                    className="w-32 h-32 object-contain rounded-xl border border-purple-200 dark:border-purple-700 bg-white dark:bg-gray-900 p-2"
                    onError={e => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : book.coverImage ? (
                  <img
                    src={book.coverImage}
                    alt={`Cover of ${book.title}`}
                    className="w-28 h-28 object-cover rounded-xl shadow-lg opacity-80"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-xl bg-purple-200 dark:bg-purple-900 flex items-center justify-center">
                    <span className="text-6xl" aria-hidden="true">🎧</span>
                  </div>
                )}
              </div>
              <div>
                <p className="font-semibold text-base mb-1">
                  {picturePauseChapter ? `Picture pause — ${picturePauseChapter}` : "Picture pause"}
                </p>
                <p className="text-sm text-muted-foreground mb-3">
                  Take a moment to think about what you just heard. What is happening in the story?
                </p>
              </div>
              <Button onClick={handlePicturePauseKeepGoing} aria-label="Resume listening">
                Keep Going
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showPictureCheckin && pictureCheckinData && a11ySettings.comprehensionCheckIns && (
        <Card className="border-2 border-primary/30 mt-2" role="dialog" aria-label="Chapter check-in">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <span aria-hidden="true">✨</span> Chapter Check-in
                <span className="text-xs text-muted-foreground font-normal ml-1">(not a test!)</span>
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { logCheckinAction("skipped"); setShowPictureCheckin(false); }}
                aria-label="Skip check-in"
              >
                <span aria-hidden="true">✕</span>
              </Button>
            </div>
            {pictureCheckinMutation.isPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin inline-block" />
                Getting your check-in ready…
              </div>
            ) : checkinConfirmed ? (
              <div className="flex flex-col items-center gap-3 py-6 animate-in fade-in zoom-in duration-300">
                <span className="text-5xl" aria-hidden="true">🎉</span>
                <p className="font-semibold text-base text-foreground">Great job!</p>
                <p className="text-sm text-muted-foreground">Keep on listening!</p>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium mb-4">{pictureCheckinData.question}</p>
                <div className="flex flex-wrap gap-3 justify-center mb-4">
                  {pictureCheckinData.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setPictureCheckinSelected(i);
                        logCheckinAction("answered");
                        setCheckinConfirmed(true);
                        setTimeout(() => {
                          setShowPictureCheckin(false);
                          setCheckinConfirmed(false);
                          setPictureCheckinSelected(null);
                        }, 1500);
                      }}
                      disabled={pictureCheckinSelected !== null}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-colors min-w-[80px] ${
                        pictureCheckinSelected === i
                          ? "border-primary bg-primary/10"
                          : "border-gray-200 dark:border-gray-700 hover:border-primary/60 bg-white dark:bg-gray-900"
                      }`}
                      aria-label={opt}
                      aria-pressed={pictureCheckinSelected === i}
                    >
                      {pictureCheckinData.symbolUrls[i] ? (
                        <img
                          src={pictureCheckinData.symbolUrls[i]!}
                          alt={opt}
                          className="w-16 h-16 object-contain"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          <span className="text-2xl" aria-hidden="true">🖼️</span>
                        </div>
                      )}
                      <span className="text-xs font-medium capitalize text-foreground">{opt}</span>
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground w-full"
                  onClick={() => { logCheckinAction("skipped"); setShowPictureCheckin(false); }}
                >
                  Skip for now
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-2 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={handleDownloadDaisy}
          title="Download DAISY accessibility package"
        >
          <span className="mr-1" aria-hidden="true">♿</span>
          DAISY Export
        </Button>
      </div>
        </div>{/* end right column */}
      </div>{/* end two-column flex */}
    </div>
  );
}
