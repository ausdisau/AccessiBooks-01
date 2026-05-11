import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Settings,
  MessageSquare,
  Keyboard,
  Volume2,
  Pause,
  Play,
  Square,
} from "lucide-react";
import type { ReaderToolbarProps } from "./flipbook-types";

export function ReaderToolbar({
  currentPage,
  totalPages,
  onPrev,
  onNext,
  searchQuery,
  onSearchChange,
  onToggleSettings,
  onToggleAnnotations,
  onToggleShortcuts,
  settingsOpen,
  annotationsOpen,
  shortcutsOpen,
  settingsButtonRef,
  annotationsButtonRef,
  ttsSupported,
  ttsState,
  onReadAloud,
  onPauseTts,
  onResumeTts,
  onStopTts,
}: ReaderToolbarProps) {
  const isSpeaking = ttsState === "speaking";
  const isPaused = ttsState === "paused";
  const isActive = isSpeaking || isPaused;

  return (
    <div
      role="toolbar"
      aria-label="Flipbook reader controls"
      className="flex flex-wrap items-center gap-2 p-3 border-b"
      style={{ background: "var(--fb-surface)", borderColor: "var(--fb-border)" }}
      data-testid="flipbook-toolbar"
    >
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          onClick={onPrev}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          data-testid="flipbook-btn-prev"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onNext}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          data-testid="flipbook-btn-next"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div
        className="text-sm font-medium tabular-nums px-2"
        aria-label={`Page ${currentPage} of ${totalPages}`}
        data-testid="flipbook-page-count"
      >
        {currentPage} / {totalPages}
      </div>

      <div className="flex-1 min-w-[180px] max-w-md flex items-center gap-2">
        <label htmlFor="flipbook-search" className="sr-only">
          Search in book
        </label>
        <div className="relative w-full">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: "var(--fb-muted)" }}
            aria-hidden="true"
          />
          <Input
            id="flipbook-search"
            type="search"
            placeholder="Search in book…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8"
            aria-controls="flipbook-search-panel"
            data-testid="flipbook-search-input"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {ttsSupported && (
          <div className="flex items-center gap-1" role="group" aria-label="Read aloud controls">
            {!isActive && (
              <Button
                variant="outline"
                size="icon"
                onClick={onReadAloud}
                aria-label="Read aloud"
                data-testid="flipbook-btn-tts-read"
              >
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            {isSpeaking && (
              <Button
                variant="outline"
                size="icon"
                onClick={onPauseTts}
                aria-label="Pause reading"
                data-testid="flipbook-btn-tts-pause"
              >
                <Pause className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            {isPaused && (
              <Button
                variant="outline"
                size="icon"
                onClick={onResumeTts}
                aria-label="Resume reading"
                data-testid="flipbook-btn-tts-resume"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            {isActive && (
              <Button
                variant="outline"
                size="icon"
                onClick={onStopTts}
                aria-label="Stop reading"
                data-testid="flipbook-btn-tts-stop"
              >
                <Square className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
        <Button
          ref={settingsButtonRef}
          variant={settingsOpen ? "default" : "outline"}
          size="icon"
          onClick={onToggleSettings}
          aria-label="Reader settings"
          aria-expanded={settingsOpen}
          aria-controls="flipbook-settings-panel"
          data-testid="flipbook-btn-settings"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          ref={annotationsButtonRef}
          variant={annotationsOpen ? "default" : "outline"}
          size="icon"
          onClick={onToggleAnnotations}
          aria-label="Annotations"
          aria-expanded={annotationsOpen}
          aria-controls="flipbook-annotations-panel"
          data-testid="flipbook-btn-annotations"
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant={shortcutsOpen ? "default" : "outline"}
          size="icon"
          onClick={onToggleShortcuts}
          aria-label="Keyboard shortcuts"
          aria-expanded={shortcutsOpen}
          aria-haspopup="dialog"
          data-testid="flipbook-btn-shortcuts"
        >
          <Keyboard className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
