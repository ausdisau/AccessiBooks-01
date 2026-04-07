import { useEffect } from "react";

interface KeyboardShortcutHandlers {
  onPlayPause?: () => void;
  onSkipBackward?: () => void;
  onSkipForward?: () => void;
  onSpeedUp?: () => void;
  onSpeedDown?: () => void;
  onBookmark?: () => void;
  onHighContrast?: () => void;
  onToggleCaptions?: () => void;
  onOpenAccessibility?: () => void;
  onToggleTranscript?: () => void;
  onMute?: () => void;
  onNextChapter?: () => void;
  onPrevChapter?: () => void;
  onOpenShortcuts?: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (event.key) {
        case " ":
          event.preventDefault();
          handlers.onPlayPause?.();
          break;
        case "ArrowLeft":
          event.preventDefault();
          handlers.onSkipBackward?.();
          break;
        case "ArrowRight":
          event.preventDefault();
          handlers.onSkipForward?.();
          break;
        case "[":
          event.preventDefault();
          handlers.onSpeedDown?.();
          break;
        case "]":
          event.preventDefault();
          handlers.onSpeedUp?.();
          break;
        case "b":
        case "B":
          event.preventDefault();
          handlers.onBookmark?.();
          break;
        case "g":
        case "G":
          event.preventDefault();
          handlers.onHighContrast?.();
          break;
        case "c":
        case "C":
          event.preventDefault();
          handlers.onToggleCaptions?.();
          break;
        case "a":
        case "A":
          event.preventDefault();
          handlers.onOpenAccessibility?.();
          break;
        case "t":
        case "T":
          event.preventDefault();
          handlers.onToggleTranscript?.();
          break;
        case "m":
        case "M":
          event.preventDefault();
          handlers.onMute?.();
          break;
        case "n":
        case "N":
          event.preventDefault();
          handlers.onNextChapter?.();
          break;
        case "p":
        case "P":
          event.preventDefault();
          handlers.onPrevChapter?.();
          break;
        case "?":
          event.preventDefault();
          handlers.onOpenShortcuts?.();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
