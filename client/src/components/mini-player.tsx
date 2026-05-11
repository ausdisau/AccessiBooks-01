import { useAudioContext } from "@/contexts/audio-context";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, RotateCcw, RotateCw, ChevronUp, ChevronDown, Loader2, ListMusic } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { usePreferencesKernel } from "@/hooks/use-preferences-kernel";
import { CaptionsBar } from "./captions-bar";

interface MiniPlayerProps {
  onExpand?: () => void;
}

export function MiniPlayer({ onExpand }: MiniPlayerProps) {
  const {
    currentBook,
    isPlaying,
    currentTime,
    duration,
    isLoading,
    isBuffering,
    togglePlayPause,
    skip,
    seekTo,
    formatTime,
  } = useAudioContext();

  const [isDragging, setIsDragging] = useState(false);
  const [mobileTrayOpen, setMobileTrayOpen] = useState(false);
  const { profile } = usePreferencesKernel();
  const captionsOn = profile.captionsOn;

  if (!currentBook) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const remainingTime = duration - currentTime;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        exit={{ y: 100 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border shadow-2xl"
        role="region"
        aria-label="Audio player"
        data-testid="mini-player"
      >
        {captionsOn && (
          <div className="px-3 py-1 bg-black/80" data-testid="mini-player-captions">
            <CaptionsBar
              bookId={currentBook.id}
              currentTime={currentTime}
              compact
            />
          </div>
        )}

        <div
          className="h-1.5 bg-secondary cursor-pointer group"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={duration || 100}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          aria-label="Playback progress"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = ((e.clientX - rect.left) / rect.width) * 100;
            const newTime = (percent / 100) * duration;
            seekTo(newTime);
          }}
        >
          <div
            className="h-full bg-primary transition-all duration-100 relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md" />
          </div>
        </div>

        {/* Mobile condensed tray — shown when expanded on small screens */}
        <AnimatePresence>
          {mobileTrayOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="md:hidden overflow-hidden border-b border-border"
            >
              <div className="px-4 py-3 space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatTime(currentTime)}</span>
                  <div className="flex-1">
                    <Slider
                      value={[currentTime]}
                      max={duration || 100}
                      step={1}
                      onValueChange={([value]) => seekTo(value)}
                      onPointerDown={() => setIsDragging(true)}
                      onPointerUp={() => setIsDragging(false)}
                      aria-label="Playback progress"
                      className={isDragging ? "cursor-grabbing" : "cursor-pointer"}
                    />
                  </div>
                  <span>-{formatTime(remainingTime)}</span>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full"
                    onClick={() => skip(-30)}
                    aria-label="Rewind 30 seconds"
                    data-testid="mini-player-skip-back"
                  >
                    <div className="relative">
                      <RotateCcw className="h-5 w-5" />
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-bold">30</span>
                    </div>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full"
                    onClick={() => skip(30)}
                    aria-label="Forward 30 seconds"
                    data-testid="mini-player-skip-forward"
                  >
                    <div className="relative">
                      <RotateCw className="h-5 w-5" />
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-bold">30</span>
                    </div>
                  </Button>
                  {onExpand && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-full"
                      onClick={onExpand}
                      aria-label="Expand player"
                      data-testid="mini-player-expand"
                    >
                      <ChevronUp className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-7xl mx-auto px-3 py-2 sm:px-4 sm:py-3">
          {/* Mobile compact single-row layout */}
          <div className="flex md:hidden items-center gap-2">
            <div
              className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
              onClick={onExpand}
            >
              {currentBook.coverImage ? (
                <img
                  src={currentBook.coverImage}
                  alt={`Cover of ${currentBook.title}`}
                  className="h-10 w-10 rounded-md object-cover flex-shrink-0 shadow-md"
                />
              ) : (
                <div className="h-10 w-10 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                  <ListMusic className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate leading-tight" data-testid="mini-player-title">
                  {currentBook.title}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {currentBook.author}
                </p>
              </div>
            </div>

            <Button
              variant="default"
              size="icon"
              className="h-10 w-10 rounded-full shadow-lg flex-shrink-0"
              onClick={togglePlayPause}
              disabled={isLoading || isBuffering}
              aria-label={isPlaying ? "Pause" : "Play"}
              data-testid="mini-player-play-pause"
            >
              {isLoading || isBuffering ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full flex-shrink-0"
              onClick={() => setMobileTrayOpen(!mobileTrayOpen)}
              aria-label={mobileTrayOpen ? "Hide controls" : "Show more controls"}
            >
              {mobileTrayOpen ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronUp className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Tablet and desktop full layout — 3-column: info | controls (center) | progress */}
          <div className="hidden md:grid md:grid-cols-3 items-center gap-2 sm:gap-4">
            {/* Left: Book info — spatial anchor: bottom-left */}
            <div
              className="flex items-center gap-3 min-w-0 cursor-pointer hover:bg-accent/50 rounded-lg p-1 -m-1 transition-colors"
              onClick={onExpand}
            >
              {currentBook.coverImage ? (
                <img
                  src={currentBook.coverImage}
                  alt={`Cover of ${currentBook.title}`}
                  className="h-11 w-11 sm:h-14 sm:w-14 rounded-md object-cover flex-shrink-0 shadow-md"
                />
              ) : (
                <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                  <ListMusic className="h-6 w-6 text-muted-foreground" />
                </div>
              )}

              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate" data-testid="mini-player-title">
                  {currentBook.title}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {currentBook.author}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>{formatTime(currentTime)}</span>
                  <span className="opacity-50">•</span>
                  <span>-{formatTime(remainingTime)}</span>
                </div>
              </div>
            </div>

            {/* Center: Transport controls — spatial anchor: bottom-center (mirrors Focus Shell) */}
            <div className="flex items-center justify-center gap-1" aria-label="Playback controls">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-10 sm:w-10 rounded-full"
                onClick={() => skip(-30)}
                aria-label="Rewind 30 seconds"
                data-testid="mini-player-skip-back"
              >
                <div className="relative">
                  <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-bold">30</span>
                </div>
              </Button>

              <Button
                variant="default"
                size="icon"
                className="h-10 w-10 sm:h-12 sm:w-12 rounded-full shadow-lg"
                onClick={togglePlayPause}
                disabled={isLoading || isBuffering}
                aria-label={isPlaying ? "Pause" : "Play"}
                data-testid="mini-player-play-pause"
              >
                {isLoading || isBuffering ? (
                  <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-5 w-5 sm:h-6 sm:w-6" />
                ) : (
                  <Play className="h-5 w-5 sm:h-6 sm:w-6 ml-0.5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-10 sm:w-10 rounded-full"
                onClick={() => skip(30)}
                aria-label="Forward 30 seconds"
                data-testid="mini-player-skip-forward"
              >
                <div className="relative">
                  <RotateCw className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-bold">30</span>
                </div>
              </Button>
            </div>

            {/* Right: Progress + expand */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground w-12 text-right">
                {formatTime(currentTime)}
              </span>
              <div className="flex-1 px-2">
                <Slider
                  value={[currentTime]}
                  max={duration || 100}
                  step={1}
                  onValueChange={([value]) => seekTo(value)}
                  onPointerDown={() => setIsDragging(true)}
                  onPointerUp={() => setIsDragging(false)}
                  aria-label="Playback progress"
                  data-testid="mini-player-progress"
                  className={isDragging ? "cursor-grabbing" : "cursor-pointer"}
                />
              </div>
              <span className="text-xs text-muted-foreground w-12">
                -{formatTime(remainingTime)}
              </span>
              {onExpand && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full ml-1"
                  onClick={onExpand}
                  aria-label="Expand player"
                  data-testid="mini-player-expand"
                >
                  <ChevronUp className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
