import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Home as HomeIcon } from "lucide-react";
import { ReaderToolbar } from "./ReaderToolbar";
import { ReaderSettingsPanel } from "./ReaderSettingsPanel";
import { PageNavigator } from "./PageNavigator";
import { ReadingPage } from "./ReadingPage";
import { AnnotationPanel } from "./AnnotationPanel";
import { KeyboardShortcutHelp } from "./KeyboardShortcutHelp";
import { LiveStatusRegion } from "./LiveStatusRegion";
import { SearchResultsPanel } from "./SearchResultsPanel";
import { searchPages, type SearchSummary } from "./book-search";
import { useTts } from "./use-tts";
import type { TtsEvent } from "./tts-service";
import type { FlipbookPage, FlipbookReaderProps } from "./flipbook-types";
import {
  applyPreset,
  DEFAULT_SETTINGS,
  type FlipbookFontFamily,
  type FlipbookPreset,
  type FlipbookSettings,
  type FlipbookTheme,
  type FlipbookTypography,
} from "./flipbook-typography";
import { type TtsPreferences } from "./tts-service";
import {
  loadReaderSessionSync,
  localReaderSessionStorage,
  type ReaderSession,
  type ReaderSessionStorage,
} from "./session-storage";
import { useFlipbookShortcuts } from "./use-flipbook-shortcuts";
import {
  demoContentProvider,
  type FlipbookContentProvider,
} from "./content-provider";
import type { FlipbookBookContent } from "./flipbook-content-types";
import { useReadAlong } from "./use-readalong";
import { BookOpen, AlertTriangle } from "lucide-react";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener?.("change", handler);
    return () => mql.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}

interface FlipbookReaderInternalProps extends FlipbookReaderProps {
  sessionStorage?: ReaderSessionStorage;
}

type ContentLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; content: FlipbookBookContent };

export function FlipbookReader({
  book,
  onBack,
  sessionStorage = localReaderSessionStorage,
  contentProvider = demoContentProvider,
}: FlipbookReaderInternalProps) {
  const reducedMotion = usePrefersReducedMotion();
  const bookKey = String(book.id);

  // ── Content ingestion (Stage 6) ───────────────────────────────────────────
  // The renderer never reaches into demo-specific shapes. It always asks the
  // provider for a typed envelope and surfaces loading / error / empty UI.
  const [contentState, setContentState] = useState<ContentLoadState>({
    status: "loading",
  });

  // Use stable identity fields rather than the full `book` object so a
  // parent that recreates the object reference (e.g. on every render) does
  // not trigger redundant reloads / flicker.
  const bookId = bookKey;
  const bookTitle = book.title;
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setContentState({ status: "loading" });
    contentProvider
      .load(book, controller.signal)
      .then((content) => {
        if (cancelled) return;
        setContentState({ status: "ready", content });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Unable to load this book.";
        setContentState({ status: "error", message });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // `book` is intentionally omitted — we depend only on its stable identity
    // fields. The provider is captured at call time and reads any other
    // metadata it needs from the snapshot it received.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, bookTitle, contentProvider]);

  const pages: FlipbookPage[] =
    contentState.status === "ready" ? contentState.content.pages : [];
  const totalPages = Math.max(1, pages.length);

  // Hydrate the full session synchronously so the initial paint already shows
  // every persisted slice (page, Focus Mode, settings, TTS prefs).
  const initialSession = useMemo<ReaderSession>(() => {
    const s = loadReaderSessionSync(bookKey);
    return {
      ...s,
      currentPage: Math.min(Math.max(s.currentPage, 1), totalPages),
    };
  }, [bookKey, totalPages]);

  const [currentPage, setCurrentPage] = useState(initialSession.currentPage);
  const [focusMode, setFocusMode] = useState(initialSession.focusMode);
  const [settings, setSettings] = useState<FlipbookSettings>(initialSession.settings);
  const [ttsPrefsState, setTtsPrefsState] = useState<TtsPreferences>(initialSession.ttsPrefs);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [flipDirection, setFlipDirection] = useState<"none" | "next" | "prev">("none");
  const [liveMessage, setLiveMessage] = useState(`Page ${initialSession.currentPage} of ${totalPages}`);

  // Dedupe consecutive identical announcements so screen readers stay calm.
  const lastMessageRef = useRef(liveMessage);
  const announce = useCallback((message: string) => {
    if (lastMessageRef.current === message) return;
    lastMessageRef.current = message;
    setLiveMessage(message);
  }, []);

  // Track which book's session has finished hydrating. Persistence is gated
  // on this so that a `bookKey` change cannot save the previous book's state
  // into the new book's slot before the async load resolves.
  const hydratedKeyRef = useRef<string>(bookKey);

  // When the parent switches books on a reused component instance, sync-load
  // the new book's session immediately so the first paint shows the right
  // page and Focus Mode — and persistence stays gated until async load lands.
  const prevBookKeyRef = useRef<string>(bookKey);
  useEffect(() => {
    if (prevBookKeyRef.current === bookKey) return;
    prevBookKeyRef.current = bookKey;
    hydratedKeyRef.current = ""; // gate persistence until async load below
    const s = loadReaderSessionSync(bookKey);
    const safePage = Math.min(Math.max(s.currentPage, 1), totalPages);
    setCurrentPage(safePage);
    setFocusMode(s.focusMode);
    setSettings(s.settings);
    setTtsPrefsState(s.ttsPrefs);
    lastMessageRef.current = "";
    setLiveMessage(`Page ${safePage} of ${totalPages}`);
  }, [bookKey, totalPages]);

  // ── Async load (for swappable backend storage) ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void sessionStorage.load(bookKey).then((s) => {
      if (cancelled) return;
      const safePage = Math.min(Math.max(s.currentPage, 1), totalPages);
      setCurrentPage((prev) => (prev === safePage ? prev : safePage));
      setFocusMode(s.focusMode);
      setSettings(s.settings);
      setTtsPrefsState(s.ttsPrefs);
      hydratedKeyRef.current = bookKey;
    });
    return () => {
      cancelled = true;
    };
  }, [bookKey, sessionStorage, totalPages]);

  // Persist the entire session through the unified adapter whenever any slice
  // changes — but only after hydration for the current book has completed, so
  // a stale state snapshot cannot clobber the freshly loaded session of a
  // different book.
  useEffect(() => {
    if (hydratedKeyRef.current !== bookKey) return;
    void sessionStorage.save(bookKey, {
      currentPage,
      focusMode,
      settings,
      ttsPrefs: ttsPrefsState,
    });
  }, [bookKey, currentPage, focusMode, settings, ttsPrefsState, sessionStorage]);

  // Debounce the search query so we don't run a full-book scan on every keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => window.clearTimeout(id);
  }, [searchQuery]);

  // Open the results panel as soon as the user starts typing.
  useEffect(() => {
    if (searchQuery.trim().length >= 2) setSearchOpen(true);
  }, [searchQuery]);

  // Settings/TTS prefs change handlers — state is the single source of truth;
  // the persistence effect above routes the full composite through the
  // unified adapter, so we never call module-level save helpers here.
  const handleTypographyChange = useCallback(
    (patch: Partial<FlipbookTypography>) => {
      setSettings((prev) => ({
        ...prev,
        typography: { ...prev.typography, ...patch },
        activePreset: "none",
      }));
    },
    [],
  );

  const handleFontFamilyChange = useCallback((font: FlipbookFontFamily) => {
    setSettings((prev) => ({
      ...prev,
      typography: { ...prev.typography, fontFamily: font },
      activePreset: "none",
    }));
  }, []);

  const handleThemeChange = useCallback((theme: FlipbookTheme) => {
    setSettings((prev) => ({ ...prev, theme, activePreset: "none" }));
  }, []);

  const handlePresetChange = useCallback((preset: FlipbookPreset) => {
    setSettings(() => applyPreset(preset));
  }, []);

  const handleResetDefaults = useCallback(() => {
    setSettings(() => ({ ...DEFAULT_SETTINGS }));
  }, []);

  const rootRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const pageContentRef = useRef<HTMLDivElement | null>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const annotationsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  // Element to restore focus to after a page flip if it was inside the page area.
  const focusBeforeFlipRef = useRef<HTMLElement | null>(null);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    window.setTimeout(() => settingsTriggerRef.current?.focus(), 0);
  }, []);
  const closeAnnotations = useCallback(() => {
    setAnnotationsOpen(false);
    window.setTimeout(() => annotationsTriggerRef.current?.focus(), 0);
  }, []);

  const goToPage = useCallback(
    (target: number, direction: "next" | "prev" | "none" = "none") => {
      const clamped = Math.max(1, Math.min(totalPages, target));
      setCurrentPage((prev) => {
        if (clamped === prev) return prev;
        // Capture focus before the flip so we can restore sensibly.
        if (typeof document !== "undefined") {
          focusBeforeFlipRef.current = document.activeElement as HTMLElement | null;
        }
        const dir =
          direction !== "none" ? direction : clamped > prev ? "next" : "prev";
        setFlipDirection(dir);
        announce(`Page ${clamped} of ${totalPages}`);
        return clamped;
      });
    },
    [totalPages, announce],
  );

  const goNext = useCallback(() => goToPage(currentPage + 1, "next"), [currentPage, goToPage]);
  const goPrev = useCallback(() => goToPage(currentPage - 1, "prev"), [currentPage, goToPage]);
  const goFirst = useCallback(() => goToPage(1, "prev"), [goToPage]);
  const goLast = useCallback(() => goToPage(totalPages, "next"), [goToPage, totalPages]);

  // Search summary recomputed only when query or pages change.
  const searchSummary = useMemo<SearchSummary>(
    () => searchPages(pages, debouncedQuery),
    [pages, debouncedQuery],
  );
  const isSearching = searchQuery !== debouncedQuery && searchQuery.trim().length >= 2;

  // Announce search outcome (only when results land for a stable query).
  useEffect(() => {
    if (isSearching) return;
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < 2) return;
    if (searchSummary.totalMatches === 0) {
      announce(`No matches found for ${trimmed}.`);
    } else {
      announce(
        `${searchSummary.totalMatches} match${searchSummary.totalMatches === 1 ? "" : "es"} on ${searchSummary.pages.length} page${searchSummary.pages.length === 1 ? "" : "s"}.`,
      );
    }
  }, [debouncedQuery, isSearching, searchSummary, announce]);

  const currentMatches = useMemo(
    () =>
      searchSummary.pages.find((p) => p.pageNumber === currentPage)?.matches ?? [],
    [searchSummary, currentPage],
  );

  const handleJumpToSearchResult = useCallback(
    (page: number) => {
      goToPage(page);
      const result = searchSummary.pages.find((p) => p.pageNumber === page);
      const count = result?.matchCount ?? 0;
      announce(
        `Jumped to page ${page}, ${count} match${count === 1 ? "" : "es"} on this page.`,
      );
    },
    [goToPage, searchSummary, announce],
  );

  // ── TTS ────────────────────────────────────────────────────────────────────
  // Inject initial prefs from the unified session adapter and route every
  // pref change back through state so persistence flows through the same
  // adapter (no direct module-level localStorage writes from here).
  const tts = useTts({
    initialPrefs: ttsPrefsState,
    onPrefsChange: setTtsPrefsState,
  });

  // Translate provider events into live-region announcements (deduped).
  useEffect(() => {
    const ev: TtsEvent | null = tts.lastEvent;
    if (!ev) return;
    switch (ev.type) {
      case "start":
        announce("Read aloud started.");
        break;
      case "pause":
        announce("Read aloud paused.");
        break;
      case "resume":
        announce("Read aloud resumed.");
        break;
      case "end":
        announce("Read aloud finished.");
        break;
      case "stop":
        announce("Read aloud stopped.");
        break;
      case "error":
        announce(`Read aloud error: ${ev.message}`);
        break;
    }
  }, [tts.lastEvent, announce]);

  const getSelectedTextFromPage = useCallback((): string => {
    if (typeof window === "undefined") return "";
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return "";
    const container = pageContentRef.current;
    if (!container) return "";
    for (let i = 0; i < sel.rangeCount; i++) {
      const range = sel.getRangeAt(i);
      if (
        container.contains(range.startContainer) &&
        container.contains(range.endContainer)
      ) {
        return sel.toString();
      }
    }
    return "";
  }, []);

  const handleReadAloud = useCallback(() => {
    if (!tts.supported) {
      announce("Text-to-speech is not supported in this browser.");
      return;
    }
    const selection = getSelectedTextFromPage().trim();
    const pageText = pages[currentPage - 1]?.content ?? "";
    const target = selection.length > 0 ? selection : pageText;
    if (!target.trim()) {
      announce("There is no text to read on this page.");
      return;
    }
    tts.speak(target);
  }, [tts, getSelectedTextFromPage, pages, currentPage, announce]);

  // Cancel speech whenever the page changes — reading aloud always
  // refers to the page that was visible when the user pressed the button.
  useEffect(() => {
    if (tts.state === "speaking" || tts.state === "paused") {
      tts.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // ── Focus Mode ────────────────────────────────────────────────────────────
  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      const next = !prev;
      announce(next ? "Focus Mode on." : "Focus Mode off.");
      return next;
    });
  }, [announce]);

  // ── Keyboard shortcuts (centralised) ──────────────────────────────────────
  const focusSearch = useCallback(() => {
    const el = searchInputRef.current;
    if (!el) return;
    el.focus();
    el.select?.();
  }, []);

  const openSettingsToggle = useCallback(() => {
    setSettingsOpen((v) => {
      const next = !v;
      // After the new state lands, move focus appropriately.
      window.setTimeout(() => {
        if (next) {
          // Focus the panel's first heading/close button via its role; falling
          // back to the trigger keeps Esc-recovery sensible.
          const panel = document.getElementById("flipbook-settings-panel");
          const focusable = panel?.querySelector<HTMLElement>(
            "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
          );
          focusable?.focus();
        } else {
          settingsTriggerRef.current?.focus();
        }
      }, 0);
      return next;
    });
  }, []);

  const openAnnotationsToggle = useCallback(() => {
    setAnnotationsOpen((v) => {
      const next = !v;
      window.setTimeout(() => {
        if (next) {
          const panel = document.getElementById("flipbook-annotations-panel");
          const focusable = panel?.querySelector<HTMLElement>(
            "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
          );
          focusable?.focus();
        } else {
          annotationsTriggerRef.current?.focus();
        }
      }, 0);
      return next;
    });
  }, []);

  const closeTopmost = useCallback((): boolean => {
    if (shortcutsOpen) {
      setShortcutsOpen(false);
      return true;
    }
    if (settingsOpen) {
      closeSettings();
      return true;
    }
    if (annotationsOpen) {
      closeAnnotations();
      return true;
    }
    if (searchOpen) {
      setSearchOpen(false);
      return true;
    }
    return false;
  }, [shortcutsOpen, settingsOpen, annotationsOpen, searchOpen, closeSettings, closeAnnotations]);

  const isHelpOpen = useCallback(() => shortcutsOpen, [shortcutsOpen]);

  useFlipbookShortcuts(
    {
      goNext,
      goPrev,
      goFirst,
      goLast,
      readAloud: handleReadAloud,
      stopTts: tts.stop,
      openSettings: openSettingsToggle,
      openAnnotations: openAnnotationsToggle,
      focusSearch,
      toggleHelp: () => setShortcutsOpen((v) => !v),
      toggleFocusMode,
      closeTopmost,
      isHelpOpen,
    },
    rootRef,
  );

  // Focus the reading page after a flip so screen reader users land on new content.
  useEffect(() => {
    if (flipDirection === "none") return;
    const focusDelay = reducedMotion ? 60 : 200;
    const resetDelay = reducedMotion ? 220 : 420;
    const previous = focusBeforeFlipRef.current;
    const focusId = window.setTimeout(() => {
      // Only steal focus if the previous focus was inside the page area
      // (or there was no specific focus target). Don't yank focus away from
      // the toolbar/search/panels where the user is actively interacting.
      const pageEl = pageRef.current;
      const previousInPage = previous && pageEl ? pageEl.contains(previous) : true;
      if (!previous || previousInPage || previous === document.body) {
        pageRef.current?.focus();
      }
    }, focusDelay);
    const resetId = window.setTimeout(() => {
      setFlipDirection("none");
      focusBeforeFlipRef.current = null;
    }, resetDelay);
    return () => {
      window.clearTimeout(focusId);
      window.clearTimeout(resetId);
    };
  }, [currentPage, flipDirection, reducedMotion]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  const currentPageData = pages[currentPage - 1];
  const themeClass = `flipbook-theme-${settings.theme}`;
  const focusModeClass = focusMode ? "flipbook-focus-mode" : "";

  // Read-along state for the visible page (Stage 6 placeholder; gated off
  // until a provider attaches real audiobook timing).
  const readAlong = useReadAlong(
    contentState.status === "ready" ? contentState.content : null,
    currentPage,
  );

  // ── Loading / error / empty UI ───────────────────────────────────────────
  // Returned after every hook above has run so React's hook order stays
  // stable across renders.
  if (contentState.status === "loading") {
    return (
      <div
        className={`${themeClass} flex flex-col h-[calc(100vh-4rem)] min-h-[600px] items-center justify-center`}
        style={{ background: "var(--fb-bg)", color: "var(--fb-fg)" }}
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-testid="flipbook-reader-loading"
      >
        <BookOpen className="h-10 w-10 animate-pulse mb-3" aria-hidden="true" />
        <p className="text-sm" style={{ color: "var(--fb-muted)" }}>
          Loading {book.title}…
        </p>
      </div>
    );
  }

  if (contentState.status === "error") {
    return (
      <div
        className={`${themeClass} flex flex-col h-[calc(100vh-4rem)] min-h-[600px] items-center justify-center px-6 text-center`}
        style={{ background: "var(--fb-bg)", color: "var(--fb-fg)" }}
        role="alert"
        data-testid="flipbook-reader-error"
      >
        <AlertTriangle className="h-10 w-10 mb-3 text-destructive" aria-hidden="true" />
        <p className="text-sm mb-4">
          We couldn't load this book: {contentState.message}
        </p>
        <Button variant="outline" size="sm" onClick={onBack}>
          <HomeIcon className="h-4 w-4 mr-1" aria-hidden="true" />
          Back to library
        </Button>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div
        className={`${themeClass} flex flex-col h-[calc(100vh-4rem)] min-h-[600px] items-center justify-center px-6 text-center`}
        style={{ background: "var(--fb-bg)", color: "var(--fb-fg)" }}
        role="status"
        data-testid="flipbook-reader-empty"
      >
        <BookOpen className="h-10 w-10 mb-3" aria-hidden="true" />
        <p className="text-sm mb-4" style={{ color: "var(--fb-muted)" }}>
          This book doesn't have any pages yet.
        </p>
        <Button variant="outline" size="sm" onClick={onBack}>
          <HomeIcon className="h-4 w-4 mr-1" aria-hidden="true" />
          Back to library
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`${themeClass} ${focusModeClass} flex flex-col h-[calc(100vh-4rem)] min-h-[600px]`}
      style={{ background: "var(--fb-bg)", color: "var(--fb-fg)" }}
      data-testid="flipbook-reader"
      data-theme={settings.theme}
      data-focus-mode={focusMode ? "on" : "off"}
    >
      <header
        role="banner"
        aria-label="Flipbook header"
        className="flipbook-chrome flex items-center justify-between px-3 py-2 border-b"
        style={{ background: "var(--fb-surface)", borderColor: "var(--fb-border)" }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          aria-label="Back to library"
          data-testid="flipbook-btn-back"
        >
          <HomeIcon className="h-4 w-4 mr-1" aria-hidden="true" />
          Back
        </Button>
        <h1 className="text-sm font-semibold truncate max-w-[60%]" data-testid="flipbook-title">
          {book.title}
        </h1>
        <span className="text-xs hidden sm:inline" style={{ color: "var(--fb-muted)" }}>
          Flipbook view
        </span>
      </header>

      <ReaderToolbar
        currentPage={currentPage}
        totalPages={totalPages}
        onPrev={goPrev}
        onNext={goNext}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onToggleSettings={openSettingsToggle}
        onToggleAnnotations={openAnnotationsToggle}
        onToggleShortcuts={() => setShortcutsOpen(true)}
        onToggleFocusMode={toggleFocusMode}
        focusMode={focusMode}
        settingsOpen={settingsOpen}
        annotationsOpen={annotationsOpen}
        shortcutsOpen={shortcutsOpen}
        settingsButtonRef={settingsTriggerRef}
        annotationsButtonRef={annotationsTriggerRef}
        searchInputRef={searchInputRef}
        ttsSupported={tts.supported}
        ttsState={tts.state}
        onReadAloud={handleReadAloud}
        onPauseTts={tts.pause}
        onResumeTts={tts.resume}
        onStopTts={tts.stop}
      />

      {searchOpen && (
        <SearchResultsPanel
          summary={searchSummary}
          query={searchQuery}
          currentPage={currentPage}
          isSearching={isSearching}
          onJumpToPage={handleJumpToSearchResult}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <div className="flipbook-chrome">
        <PageNavigator
          currentPage={currentPage}
          totalPages={totalPages}
          onJumpTo={(p) => goToPage(p)}
          onPrev={goPrev}
          onNext={goNext}
        />
      </div>

      <div className="flex-1 flex min-h-0">
        <main
          role="main"
          aria-label="Reading area"
          className="flipbook-reading-area flex-1 relative flex items-stretch justify-center p-4 sm:p-6"
          style={{ background: "var(--fb-bg)" }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={goPrev}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-11 w-11 opacity-70 hover:opacity-100"
            data-testid="flipbook-edge-prev"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </Button>

          <div
            ref={pageRef}
            tabIndex={-1}
            role="document"
            aria-label={`Page ${currentPage} of ${totalPages}`}
            className="flipbook-reading-column w-full max-w-3xl outline-none"
            data-testid="flipbook-page-container"
          >
            {currentPageData && (
              <ReadingPage
                page={currentPageData}
                flipDirection={flipDirection}
                reducedMotion={reducedMotion}
                typography={settings.typography}
                highlightMatches={currentMatches}
                contentRef={pageContentRef}
                readAlong={readAlong}
              />
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={goNext}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-11 w-11 opacity-70 hover:opacity-100"
            data-testid="flipbook-edge-next"
          >
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </Button>
        </main>

        <ReaderSettingsPanel
          open={settingsOpen}
          onClose={closeSettings}
          settings={settings}
          onTypographyChange={handleTypographyChange}
          onFontFamilyChange={handleFontFamilyChange}
          onThemeChange={handleThemeChange}
          onPresetChange={handlePresetChange}
          onResetDefaults={handleResetDefaults}
          ttsSupported={tts.supported}
          ttsVoices={tts.voices}
          ttsPrefs={tts.prefs}
          onTtsPrefsChange={tts.setPrefs}
        />
        <AnnotationPanel
          open={annotationsOpen}
          onClose={closeAnnotations}
          bookId={bookKey}
          currentPage={currentPage}
          getSelectedText={getSelectedTextFromPage}
          onAnnounce={announce}
          storage={sessionStorage.loadAnnotationStorage()}
        />
      </div>

      <KeyboardShortcutHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <LiveStatusRegion message={liveMessage} />
    </div>
  );
}
