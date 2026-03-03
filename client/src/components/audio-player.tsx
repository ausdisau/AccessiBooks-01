import { useState, useEffect } from "react";
import { Book } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useMonetization } from "@/hooks/use-monetization";
import { BookmarkList } from "./bookmark-list";
import { PremiumFeatureBadge } from "./premium-feature-badge";
import { SleepTimer } from "./sleep-timer";
import { ChapterList } from "./chapter-list";
import { AddToCollectionButton } from "./library-collections";
import { AddToPlaylistDialog } from "./add-to-playlist-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
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
  Car,
  ListMusic,
  ChevronDown,
  Crown,
  SkipForward,
  SkipBack,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useAudioContext } from "@/contexts/AudioContext";
import { InteractiveTranscript } from "./interactive-transcript";

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
  const { toast } = useToast();
  const { user } = useAuth();

  const hasChapters = chapters.length > 0;
  const canGoPrev = currentChapterIndex > 0;
  const canGoNext = currentChapterIndex < chapters.length - 1;

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
        <audio ref={audioRef} preload="metadata" />
        
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
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6" role="region" aria-label={`Audio player: ${book.title} by ${book.author}`}>
      <audio ref={audioRef} preload="metadata" />

      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {book.coverImage && (
              <img
                src={book.coverImage}
                alt={`${book.title} audiobook cover`}
                className="w-32 h-48 sm:w-40 sm:h-60 md:w-48 md:h-72 object-cover rounded-md mx-auto md:mx-0 shadow-lg"
                data-testid="img-book-cover"
              />
            )}
            
            <div className="flex-1">
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2" data-testid="text-book-title">
                {book.title}
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-4" data-testid="text-book-author">
                by {book.author}
              </p>
              {book.narrator && (
                <p className="text-muted-foreground mb-4" data-testid="text-book-narrator">
                  Narrated by {book.narrator}
                </p>
              )}
              {book.description && (
                <p className="text-sm text-muted-foreground line-clamp-4" data-testid="text-book-description">
                  {book.description}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span aria-label="Current time" data-testid="text-current-time">
                {formatTime(currentTime)}
              </span>
              {isBuffering && (
                <span className="flex items-center gap-1 text-amber-500 text-xs font-medium">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Buffering…
                </span>
              )}
              <span aria-label="Time remaining" className="text-muted-foreground">
                -{formatTime(remainingTime)}
              </span>
            </div>
            
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
                className="h-10 w-10 rounded-full"
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
                className="h-10 w-10 rounded-full"
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
        </CardContent>
      </Card>

      <AddToPlaylistDialog
        book={book}
        open={showPlaylistDialog}
        onOpenChange={setShowPlaylistDialog}
      />

      {!isPremium && (skipStatus || audioQuality) && (
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
              {audioQuality && (
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-amber-600" />
                  <span className="text-amber-700 dark:text-amber-300">
                    {audioQuality.bitrate}kbps audio
                  </span>
                </div>
              )}
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
      )}

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
    </div>
  );
}
