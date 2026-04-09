import { useState, useEffect, useRef, useCallback } from "react";
import { Book } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
} from "lucide-react";
import { useAudioContext } from "@/contexts/AudioContext";
import { InteractiveTranscript } from "./interactive-transcript";
import { localStorageService } from "@/lib/storage";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

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

  const [a11ySettings, setA11ySettings] = useState(() => localStorageService.getSettings());
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showBreakPrompt, setShowBreakPrompt] = useState(false);
  const [breakQuizQuestions, setBreakQuizQuestions] = useState<{ question: string; options: string[]; correct: number }[]>([]);
  const [breakQuizAnswers, setBreakQuizAnswers] = useState<(number | null)[]>([]);
  const [showBreakQuiz, setShowBreakQuiz] = useState(false);

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

  const breakQuizMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/chapter-checkin", {
        chapterText: book.description ?? book.title ?? "audiobook",
        title: book.title,
      });
      if (!res.ok) throw new Error("Quiz failed");
      return res.json() as Promise<{ questions: { question: string; options: string[]; correct: number }[] }>;
    },
    onSuccess: (data) => {
      setBreakQuizQuestions(data.questions ?? []);
      setBreakQuizAnswers((data.questions ?? []).map(() => null));
      setShowBreakQuiz(true);
      setShowBreakPrompt(false);
    },
  });

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
    skip(30);
  };

  const handleSkipBackward = () => {
    skip(-30);
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
        <audio ref={audioRef} preload="metadata" crossOrigin="anonymous" />
        
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
            aria-label="Rewind 30 seconds"
          >
            <div className="flex flex-col items-center">
              <RotateCcw className="h-6 w-6 sm:h-8 sm:w-8" />
              <span className="text-xs mt-1">30</span>
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
            aria-label="Forward 30 seconds"
            disabled={isUsingSkip}
          >
            <div className="flex flex-col items-center">
              <RotateCw className="h-6 w-6 sm:h-8 sm:w-8" />
              <span className="text-xs mt-1">30</span>
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
      <audio ref={audioRef} preload="metadata" crossOrigin="anonymous" />

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

          <div className="flex items-center justify-center gap-4 mb-6">
            {/* Previous chapter button */}
            {hasChapters && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handlePrevChapter}
                disabled={!canGoPrev}
                className="h-11 w-11 rounded-full"
                aria-label="Previous chapter"
                data-testid="button-prev-chapter"
              >
                <SkipBack className="h-5 w-5" aria-hidden="true" />
              </Button>
            )}

            <Button
              size="lg"
              variant="ghost"
              onClick={handleSkipBackward}
              className="h-11 w-11 sm:h-14 sm:w-14 rounded-full relative"
              aria-label="Rewind 30 seconds"
              data-testid="button-skip-backward"
            >
              <RotateCcw className="h-6 w-6" aria-hidden="true" />
              <span className="absolute -bottom-1 text-[10px] font-medium">30</span>
            </Button>
            
            <Button
              size="lg"
              onClick={togglePlayPause}
              disabled={isLoading || isBuffering}
              aria-label={isPlaying ? "Pause audiobook" : "Play audiobook"}
              className="h-14 w-14 sm:h-16 sm:w-16 rounded-full shadow-lg"
              data-testid="button-play-pause"
            >
              {isLoading || isBuffering ? (
                <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
              ) : isPlaying ? (
                <Pause className="h-7 w-7" aria-hidden="true" />
              ) : (
                <Play className="h-7 w-7 ml-1" aria-hidden="true" />
              )}
            </Button>
            
            <Button
              size="lg"
              variant="ghost"
              onClick={handleSkipForward}
              className="h-11 w-11 sm:h-14 sm:w-14 rounded-full relative"
              aria-label="Forward 30 seconds"
              data-testid="button-skip-forward"
              disabled={isUsingSkip}
            >
              <RotateCw className="h-6 w-6" aria-hidden="true" />
              <span className="absolute -bottom-1 text-[10px] font-medium">30</span>
              {!isPremium && skipStatus && !skipStatus.unlimited && skipStatus.remaining < 3 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center">
                  {skipStatus.remaining}
                </span>
              )}
            </Button>

            {/* Next chapter button */}
            {hasChapters && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleNextChapter}
                disabled={!canGoNext}
                className="h-11 w-11 rounded-full"
                aria-label="Next chapter"
                data-testid="button-next-chapter"
              >
                <SkipForward className="h-5 w-5" aria-hidden="true" />
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              {/* Speed Preset Buttons */}
              <div className="hidden sm:flex items-center gap-1 bg-muted/50 rounded-full p-1" role="group" aria-label="Playback speed">
                {[0.75, 1, 1.25, 1.5, 2].map((speed) => {
                  const isLockedSpeed = !isPremium && !FREE_SPEEDS.includes(speed);
                  return (
                    <Button
                      key={speed}
                      variant={playbackRate === speed ? "default" : "ghost"}
                      size="sm"
                      onClick={() => {
                        if (isLockedSpeed) {
                          toast({
                            title: "Premium speed",
                            description: "Upgrade to Premium for speeds above 1.5x",
                            variant: "destructive",
                          });
                          return;
                        }
                        setSpeed(speed);
                      }}
                      className={`h-7 px-2.5 rounded-full text-xs font-medium ${
                        playbackRate === speed ? "shadow-sm" : "hover:bg-muted"
                      } ${isLockedSpeed ? "opacity-60" : ""}`}
                      aria-pressed={playbackRate === speed}
                      data-testid={`button-speed-${speed}x`}
                    >
                      {speed}x
                      {isLockedSpeed && <Crown className="h-3 w-3 ml-0.5 text-yellow-500" />}
                    </Button>
                  );
                })}
              </div>
              
              {/* Speed Dropdown (mobile fallback) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 sm:hidden" data-testid="button-speed-selector">
                    <Gauge className="h-4 w-4" />
                    {playbackRate}x
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {SPEED_OPTIONS.map((option) => {
                    const isLockedSpeed = !isPremium && !FREE_SPEEDS.includes(option.value);
                    return (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => {
                          if (isLockedSpeed) {
                            toast({
                              title: "Premium speed",
                              description: "Upgrade to Premium for speeds above 1.5x",
                              variant: "destructive",
                            });
                            return;
                          }
                          setSpeed(option.value);
                        }}
                        className={`${playbackRate === option.value ? "bg-accent" : ""} ${isLockedSpeed ? "opacity-60" : ""}`}
                      >
                        <span className="flex items-center gap-1">
                          {option.label}
                          {isLockedSpeed && (
                            <>
                              <Crown className="h-3 w-3 text-yellow-500" />
                              <span className="text-xs text-yellow-600">(Premium)</span>
                            </>
                          )}
                        </span>
                        {playbackRate === option.value && " ✓"}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              
              <SleepTimer />
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCarMode(true)}
                className="gap-1"
                aria-label="Enable car mode"
                data-testid="button-car-mode"
              >
                <Car className="h-4 w-4" />
                <span className="hidden sm:inline">Car Mode</span>
              </Button>
              
              {book.id.startsWith("librivox-") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowChapters(!showChapters)}
                  className="gap-1"
                  aria-label="Show chapters"
                  data-testid="button-chapters"
                >
                  <ListMusic className="h-4 w-4" />
                  <span className="hidden sm:inline">Chapters</span>
                </Button>
              )}
              <Button
                variant={showTranscript ? "default" : "outline"}
                size="sm"
                onClick={() => setShowTranscript(!showTranscript)}
                className="gap-1"
                aria-label="Toggle transcript"
                data-testid="button-transcript"
              >
                <ChevronRight className="h-4 w-4" />
                <span className="hidden sm:inline">Transcript</span>
              </Button>

              <Button
                variant={captionsOn ? "default" : "outline"}
                size="sm"
                onClick={handleToggleCaptions}
                className="gap-1"
                aria-label={captionsOn ? "Turn off captions" : "Turn on captions"}
                aria-pressed={captionsOn}
                data-testid="button-captions-toggle"
              >
                <Subtitles className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">CC</span>
              </Button>

              {captionsOn && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleCaptionPosition}
                  className="gap-1"
                  aria-label={`Move captions ${captionPosition === "above" ? "below" : "above"} controls`}
                  title={`Captions position: ${captionPosition} — click to move ${captionPosition === "above" ? "below" : "above"}`}
                  data-testid="button-captions-position"
                >
                  <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}

              <Button
                variant={followAlong ? "default" : "outline"}
                size="sm"
                onClick={handleToggleFollowAlong}
                className={`gap-1 ${followAlong ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : ""}`}
                aria-label={followAlong ? "Follow Along active — click to disable" : "Enable Follow Along (sync ebook text with audio)"}
                aria-pressed={followAlong}
                title={followAlong ? "Follow Along: ON — ebook text highlights as audio plays" : "Follow Along: OFF — enable to sync ebook reader with audio"}
                data-testid="button-follow-along"
              >
                <Music2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Follow Along</span>
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              {showBookmarkInput && (
                <input
                  type="text"
                  value={bookmarkName}
                  onChange={(e) => setBookmarkName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddBookmark();
                    } else if (e.key === "Escape") {
                      setShowBookmarkInput(false);
                      setBookmarkName("");
                    }
                  }}
                  placeholder="Bookmark name"
                  className="px-3 py-1.5 border border-border rounded-md text-sm w-40"
                  autoFocus
                  data-testid="input-bookmark-name"
                />
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddBookmark}
                aria-label="Bookmark current position"
                data-testid="button-add-bookmark"
              >
                <BookmarkIcon className="h-4 w-4 mr-1" aria-hidden="true" />
                Bookmark
                {isAtLimit && <PremiumFeatureBadge className="ml-1" />}
              </Button>
              <AddToCollectionButton bookId={book.id} />
              {user && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPlaylistDialog(true)}
                  aria-label="Add to playlist"
                  data-testid="button-add-to-playlist"
                >
                  <ListMusic className="h-4 w-4 mr-1" aria-hidden="true" />
                  Playlist
                </Button>
              )}
            </div>
          </div>

          {/* Live captions bar — below position */}
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

      {showBreakPrompt && !showBreakQuiz && (
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
                      onClick={() => breakQuizMutation.mutate()}
                      disabled={breakQuizMutation.isPending}
                    >
                      {breakQuizMutation.isPending ? "Generating…" : "Comprehension Quiz"}
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

      {showBreakQuiz && breakQuizQuestions.length > 0 && (
        <Card className="border-2 border-primary/30 mt-2">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Comprehension Check</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowBreakQuiz(false)} aria-label="Close quiz">
                <span aria-hidden="true">✕</span>
              </Button>
            </div>
            <div className="space-y-4">
              {breakQuizQuestions.map((q, qi) => (
                <div key={qi}>
                  <p className="text-sm font-medium mb-2">{qi + 1}. {q.question}</p>
                  <div className="space-y-1">
                    {q.options.map((opt, oi) => {
                      const answered = breakQuizAnswers[qi] !== null;
                      const isSelected = breakQuizAnswers[qi] === oi;
                      const isCorrect = oi === q.correct;
                      return (
                        <Button
                          key={oi}
                          variant="outline"
                          size="sm"
                          className={`w-full text-left h-auto py-1.5 px-3 text-sm ${answered && isCorrect ? "border-green-500 bg-green-50 text-green-800" : answered && isSelected ? "border-red-400 bg-red-50 text-red-800" : answered ? "opacity-50" : ""}`}
                          onClick={() => {
                            if (breakQuizAnswers[qi] !== null) return;
                            const updated = [...breakQuizAnswers];
                            updated[qi] = oi;
                            setBreakQuizAnswers(updated);
                          }}
                          disabled={answered}
                        >
                          {answered && isCorrect && <span className="mr-2">✓</span>}
                          {answered && isSelected && !isCorrect && <span className="mr-2">✗</span>}
                          {opt}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {breakQuizAnswers.every(a => a !== null) && (
              <div className="mt-3 text-sm font-medium">
                Score: {breakQuizAnswers.filter((a, i) => a === breakQuizQuestions[i].correct).length} / {breakQuizQuestions.length}
                <Button size="sm" className="ml-3" onClick={() => setShowBreakQuiz(false)}>Done</Button>
              </div>
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
