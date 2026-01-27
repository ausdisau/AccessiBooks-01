import { useState, useEffect } from "react";
import { Book } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useMonetization } from "@/hooks/use-monetization";
import { BookmarkList } from "./bookmark-list";
import { SleepTimer } from "./sleep-timer";
import { ChapterList } from "./chapter-list";
import { AddToCollectionButton } from "./library-collections";
import { useToast } from "@/hooks/use-toast";
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
  SkipForward
} from "lucide-react";

interface AudioPlayerProps {
  book: Book;
}

const SPEED_OPTIONS = [
  { label: "0.5x", value: 0.5 },
  { label: "0.75x", value: 0.75 },
  { label: "1x", value: 1.0 },
  { label: "1.25x", value: 1.25 },
  { label: "1.5x", value: 1.5 },
  { label: "1.75x", value: 1.75 },
  { label: "2x", value: 2.0 },
  { label: "2.5x", value: 2.5 },
  { label: "3x", value: 3.0 },
];

export function AudioPlayer({ book }: AudioPlayerProps) {
  const {
    audioRef,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    isLoading,
    togglePlayPause,
    skip,
    seekTo,
    setSpeed,
    formatTime,
  } = useAudioPlayer({
    bookId: book.id,
    audioUrl: `/api/stream/${book.id}`,
  });

  const { bookmarks, addBookmark, removeBookmark } = useBookmarks(book.id);
  const { 
    skipStatus, 
    audioQuality, 
    useSkip: consumeSkip, 
    isUsingSkip,
    startSession,
    endSession,
    isPremium,
  } = useMonetization();
  
  const [bookmarkName, setBookmarkName] = useState("");
  const [showBookmarkInput, setShowBookmarkInput] = useState(false);
  const [currentChapterId, setCurrentChapterId] = useState<string | undefined>();
  const [carMode, setCarMode] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const { toast } = useToast();

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

  const handleChapterSelect = (chapter: { id: string; title: string; audioUrl: string }) => {
    setCurrentChapterId(chapter.id);
    if (audioRef.current) {
      audioRef.current.src = chapter.audioUrl;
      audioRef.current.load();
      audioRef.current.play().catch(console.error);
    }
    toast({
      title: "Now playing",
      description: chapter.title,
    });
    setShowChapters(false);
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
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-8">
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
              className="w-32 h-48 object-cover rounded-lg mx-auto mb-4"
            />
          )}
          <h2 className="text-2xl font-bold truncate max-w-md">{book.title}</h2>
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
        
        <div className="flex items-center gap-8">
          <Button
            size="lg"
            variant="secondary"
            onClick={handleSkipBackward}
            className="h-20 w-20 rounded-full text-xl"
            aria-label="Rewind 30 seconds"
          >
            <div className="flex flex-col items-center">
              <RotateCcw className="h-8 w-8" />
              <span className="text-xs mt-1">30</span>
            </div>
          </Button>
          
          <Button
            size="lg"
            onClick={togglePlayPause}
            disabled={isLoading}
            className="h-28 w-28 rounded-full"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isLoading ? (
              <Loader2 className="h-12 w-12 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-12 w-12" />
            ) : (
              <Play className="h-12 w-12 ml-1" />
            )}
          </Button>
          
          <Button
            size="lg"
            variant="secondary"
            onClick={handleSkipForward}
            className="h-20 w-20 rounded-full text-xl"
            aria-label="Forward 30 seconds"
            disabled={isUsingSkip}
          >
            <div className="flex flex-col items-center">
              <RotateCw className="h-8 w-8" />
              <span className="text-xs mt-1">30</span>
            </div>
          </Button>
        </div>
        
        <div className="mt-8 text-2xl font-medium">
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
    <div className="max-w-4xl mx-auto space-y-6">
      <audio ref={audioRef} preload="metadata" />

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {book.coverImage && (
              <img
                src={book.coverImage}
                alt={`${book.title} audiobook cover`}
                className="w-48 h-72 object-cover rounded-md mx-auto md:mx-0 shadow-lg"
                data-testid="img-book-cover"
              />
            )}
            
            <div className="flex-1">
              <h2 className="text-3xl font-bold mb-2" data-testid="text-book-title">
                {book.title}
              </h2>
              <p className="text-xl text-muted-foreground mb-4" data-testid="text-book-author">
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
        <CardContent className="p-6">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span aria-label="Current time" data-testid="text-current-time">
                {formatTime(currentTime)}
              </span>
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

          <div className="flex items-center justify-center gap-4 mb-6">
            <Button
              size="lg"
              variant="ghost"
              onClick={handleSkipBackward}
              className="h-14 w-14 rounded-full relative"
              aria-label="Rewind 30 seconds"
              data-testid="button-skip-backward"
            >
              <RotateCcw className="h-6 w-6" aria-hidden="true" />
              <span className="absolute -bottom-1 text-[10px] font-medium">30</span>
            </Button>
            
            <Button
              size="lg"
              onClick={togglePlayPause}
              disabled={isLoading}
              aria-label={isPlaying ? "Pause audiobook" : "Play audiobook"}
              className="h-16 w-16 rounded-full shadow-lg"
              data-testid="button-play-pause"
            >
              {isLoading ? (
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
              className="h-14 w-14 rounded-full relative"
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
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              {/* Speed Preset Buttons */}
              <div className="hidden sm:flex items-center gap-1 bg-muted/50 rounded-full p-1" role="group" aria-label="Playback speed">
                {[0.75, 1, 1.25, 1.5, 2].map((speed) => (
                  <Button
                    key={speed}
                    variant={playbackRate === speed ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setSpeed(speed)}
                    className={`h-7 px-2.5 rounded-full text-xs font-medium ${
                      playbackRate === speed ? "shadow-sm" : "hover:bg-muted"
                    }`}
                    aria-pressed={playbackRate === speed}
                    data-testid={`button-speed-${speed}x`}
                  >
                    {speed}x
                  </Button>
                ))}
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
                  {SPEED_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => setSpeed(option.value)}
                      className={playbackRate === option.value ? "bg-accent" : ""}
                    >
                      {option.label}
                      {playbackRate === option.value && " ✓"}
                    </DropdownMenuItem>
                  ))}
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
              </Button>
              <AddToCollectionButton bookId={book.id} />
            </div>
          </div>
        </CardContent>
      </Card>

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

      {showChapters && book.id.startsWith("librivox-") && (
        <ChapterList
          bookId={book.id}
          onChapterSelect={handleChapterSelect}
          currentChapterId={currentChapterId}
        />
      )}

      <BookmarkList
        bookmarks={bookmarks}
        onJumpTo={seekTo}
        onRemove={removeBookmark}
        formatTime={formatTime}
      />
    </div>
  );
}
