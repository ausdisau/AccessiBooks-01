import { useEffect, type RefObject } from "react";

export interface FlipbookShortcutHandlers {
  goNext: () => void;
  goPrev: () => void;
  goFirst: () => void;
  goLast: () => void;
  readAloud: () => void;
  stopTts: () => void;
  openSettings: () => void;
  openAnnotations: () => void;
  focusSearch: () => void;
  toggleHelp: () => void;
  toggleFocusMode: () => void;
  closeTopmost: () => boolean; // returns true if a panel/dialog was closed
  isHelpOpen: () => boolean;
}

/**
 * Centralised keyboard handling for the flipbook reader. Suppresses
 * shortcuts while the user is typing in form fields, while a slider has
 * focus, or while the cursor is inside a flipbook panel (where its own
 * controls own the keyboard). Esc always reaches the close logic.
 */
export function useFlipbookShortcuts(
  handlers: FlipbookShortcutHandlers,
  rootRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;

      // Esc must always reach the close-topmost logic, even from inside fields.
      const isEsc = e.key === "Escape";

      const inEditableField = (() => {
        if (!target) return false;
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
        if (target.isContentEditable) return true;
        if (target.closest('[role="slider"]')) return true;
        return false;
      })();

      const inPanel = !!target?.closest("[data-flipbook-panel]");

      if (isEsc) {
        if (handlers.closeTopmost()) {
          e.preventDefault();
        }
        return;
      }

      // While the help dialog is up, swallow everything else (Esc handled above).
      if (handlers.isHelpOpen()) return;

      if (inEditableField || inPanel) return;

      // Only fire when the focus is inside our reader root.
      const root = rootRef.current;
      if (root && target && !root.contains(target)) {
        // Allow shortcuts even if focus is on body/document (no specific element).
        if (target !== document.body && target !== document.documentElement) return;
      }

      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
          e.preventDefault();
          handlers.goNext();
          return;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          handlers.goPrev();
          return;
        case "Home":
          e.preventDefault();
          handlers.goFirst();
          return;
        case "End":
          e.preventDefault();
          handlers.goLast();
          return;
        default:
          break;
      }

      // Single-letter shortcuts must not fire with modifiers (Ctrl/Cmd/Alt)
      // so we never collide with browser shortcuts.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // "?" is Shift+/ on most layouts; allow Shift here.
      if (e.key === "?") {
        e.preventDefault();
        handlers.toggleHelp();
        return;
      }

      // Other letter shortcuts: ignore when Shift is held so users can still
      // type capitals in any odd context. The reader root rarely receives
      // raw text input outside fields, but this is a safe extra guard.
      if (e.shiftKey) return;

      switch (e.key.toLowerCase()) {
        case "r":
          e.preventDefault();
          handlers.readAloud();
          break;
        case "s":
          e.preventDefault();
          handlers.stopTts();
          break;
        case "g":
          e.preventDefault();
          handlers.openSettings();
          break;
        case "a":
          e.preventDefault();
          handlers.openAnnotations();
          break;
        case "/":
          e.preventDefault();
          handlers.focusSearch();
          break;
        case "f":
          e.preventDefault();
          handlers.toggleFocusMode();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlers, rootRef]);
}
