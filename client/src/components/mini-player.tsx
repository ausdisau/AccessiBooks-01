import { useAudioContext } from "@/contexts/AudioContext";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, RotateCcw, RotateCw, ChevronUp, Loader2, ListMusic } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

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
    togglePlayPause,
    skip,
    seekTo,
    formatTime,
  } = useAudioContext();

  const [isDragging, setIsDragging] = useState(false);

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
        
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <div 
              className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer hover:bg-accent/50 rounded-lg p-1 -m-1 transition-colors"
              onClick={onExpand}
            >
              {currentBook.coverImage ? (
                <img
                  src={currentBook.coverImage}
                  alt={`Cover of ${currentBook.title}`}
                  className="h-14 w-14 rounded-md object-cover flex-shrink-0 shadow-md"
                />
              ) : (
                <div className="h-14 w-14 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
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
            
            <div className="hidden md:flex items-center gap-1 flex-1 max-w-md">
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
            </div>
            
            <div className="flex items-center gap-1">
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
                variant="default"
                size="icon"
                className="h-12 w-12 rounded-full shadow-lg"
                onClick={togglePlayPause}
                disabled={isLoading}
                aria-label={isPlaying ? "Pause" : "Play"}
                data-testid="mini-player-play-pause"
              >
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6 ml-0.5" />
                )}
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
