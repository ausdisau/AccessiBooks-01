"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useAudioContext } from "@/contexts/audio-context";
import { localStorageService, type AccessibilitySettings } from "@/lib/storage";
import { AudioAdOverlay } from "@/components/audio-ad-overlay";
import { Accessibility, BookOpen, Focus, Pause, Play, X } from "lucide-react";

/**
 * Global accessibility overlays previously inlined at the bottom of App.tsx.
 * Each component is independently mounted, listens for the shared
 * `accessibooks:settings-changed` event, and renders nothing when its
 * feature is disabled.
 */

export function AudioAdManager() {
  const { adState, onAdComplete, onAdUpgrade } = useAudioContext();
  if (!adState.isAdPlaying || !adState.currentAd || !adState.adType) return null;
  return (
    <AudioAdOverlay
      ad={adState.currentAd}
      adType={adState.adType}
      onComplete={onAdComplete}
      onUpgrade={onAdUpgrade}
    />
  );
}

export function ColourOverlayRenderer() {
  const [overlay, setOverlay] = useState(() => {
    const s = localStorageService.getSettings();
    return { color: s.colourOverlay ?? "", opacity: s.colourOverlayOpacity ?? 0.15 };
  });
  useEffect(() => {
    const sync = () => {
      const s = localStorageService.getSettings();
      setOverlay({ color: s.colourOverlay ?? "", opacity: s.colourOverlayOpacity ?? 0.15 });
    };
    document.addEventListener("accessibooks:settings-changed", sync);
    return () => document.removeEventListener("accessibooks:settings-changed", sync);
  }, []);
  if (!overlay.color) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        background: overlay.color,
        opacity: overlay.opacity,
        pointerEvents: "none",
        zIndex: 9990,
        mixBlendMode: "multiply",
      }}
    />
  );
}

export function FocusModeExitButton() {
  const [focusMode, setFocusModeState] = useState(() => !!localStorageService.getSettings().focusMode);
  const [focusShell, setFocusShellState] = useState(() => !!localStorageService.getSettings().focusShell);

  useEffect(() => {
    const syncState = () => {
      const s = localStorageService.getSettings();
      setFocusModeState(!!s.focusMode);
      setFocusShellState(!!s.focusShell);
    };
    document.addEventListener("accessibooks:settings-changed", syncState);
    return () => document.removeEventListener("accessibooks:settings-changed", syncState);
  }, []);

  if (!focusMode || focusShell) return null;

  const exitFocusMode = () => {
    const s = localStorageService.getSettings();
    const updated = { ...s, focusMode: false };
    localStorageService.saveSettings(updated);
    document.documentElement.classList.remove("focus-mode");
    document.dispatchEvent(new CustomEvent("accessibooks:settings-changed"));
    setFocusModeState(false);
  };

  return (
    <button
      onClick={exitFocusMode}
      aria-label="Exit Focus Mode"
      data-testid="exit-focus-mode-btn"
      style={{
        position: "fixed",
        bottom: "80px",
        right: "16px",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "8px 14px",
        borderRadius: "9999px",
        fontSize: "13px",
        fontWeight: 500,
        cursor: "pointer",
        border: "none",
        opacity: 0.75,
      }}
      className="bg-primary text-primary-foreground shadow-lg hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Focus className="h-4 w-4" aria-hidden="true" />
      Exit Focus Mode
    </button>
  );
}

export function FocusShell() {
  const router = useRouter();
  const [active, setActive] = useState(() => !!localStorageService.getSettings().focusShell);
  const { currentBook, isPlaying, togglePlayPause } = useAudioContext();
  const { isAuthenticated } = useAuth();

  const saveMutation = useMutation({
    mutationFn: async (settings: AccessibilitySettings) => {
      await apiRequest("PUT", "/api/a11y/preferences", { profile: settings });
    },
  });

  useEffect(() => {
    const sync = () => setActive(!!localStorageService.getSettings().focusShell);
    document.addEventListener("accessibooks:settings-changed", sync);
    return () => document.removeEventListener("accessibooks:settings-changed", sync);
  }, []);

  useEffect(() => {
    if (!active) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitShell(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const exitShell = (openA11y = false) => {
    const s = localStorageService.getSettings();
    const updated = { ...s, focusShell: false };
    localStorageService.saveSettings(updated);
    document.dispatchEvent(new CustomEvent("accessibooks:settings-changed"));
    setActive(false);
    if (isAuthenticated) saveMutation.mutate(updated);
    if (openA11y) {
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent("accessibooks:open-accessibility"));
      }, 80);
    }
  };

  if (!active) return null;

  return (
    <div
      className="fixed inset-0 bg-background flex flex-col"
      style={{ zIndex: 9998 }}
      role="dialog"
      aria-label="Focus Shell — simplified reading mode"
      aria-modal="true"
    >
      <button
        onClick={() => router.push("/")}
        className="absolute top-4 left-4 flex items-center gap-2 px-4 py-3 rounded-2xl bg-primary text-primary-foreground text-base font-semibold shadow-lg hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Go to Library"
        style={{ minWidth: 140 }}
      >
        <BookOpen className="h-6 w-6 flex-shrink-0" aria-hidden="true" />
        <span>Library</span>
      </button>
      <button
        onClick={() => exitShell(false)}
        className="absolute top-4 right-4 flex items-center gap-2 px-3 py-3 rounded-2xl bg-muted text-muted-foreground text-sm font-medium shadow hover:bg-muted/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Exit Focus Shell"
      >
        <X className="h-5 w-5" aria-hidden="true" />
        <span>Exit</span>
      </button>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-20">
        {currentBook ? (
          <>
            {currentBook.coverImage ? (
              <img
                src={currentBook.coverImage}
                alt={`Cover for ${currentBook.title}`}
                className="w-52 h-52 sm:w-64 sm:h-64 object-cover rounded-2xl shadow-2xl"
              />
            ) : (
              <div className="w-52 h-52 sm:w-64 sm:h-64 rounded-2xl bg-muted flex items-center justify-center shadow-2xl">
                <BookOpen className="h-20 w-20 text-muted-foreground" aria-hidden="true" />
              </div>
            )}
            <div className="text-center max-w-sm">
              <p className="text-2xl sm:text-3xl font-bold text-foreground leading-snug">
                {currentBook.title}
              </p>
              {currentBook.author && (
                <p className="text-base text-muted-foreground mt-1">{currentBook.author}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="w-52 h-52 rounded-2xl bg-muted flex items-center justify-center shadow-xl">
              <BookOpen className="h-20 w-20 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-xl font-semibold text-muted-foreground">No book playing</p>
            <p className="text-sm text-muted-foreground">Go to Library to pick a book</p>
          </>
        )}
      </div>
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <button
          onClick={() => togglePlayPause()}
          className="flex flex-col items-center justify-center w-28 h-28 rounded-full bg-primary text-primary-foreground shadow-2xl hover:bg-primary/90 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-offset-4"
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={!currentBook}
        >
          {isPlaying ? <Pause className="h-12 w-12" aria-hidden="true" /> : <Play className="h-12 w-12 ml-1" aria-hidden="true" />}
        </button>
        <span className="text-sm font-semibold text-muted-foreground mt-1">
          {isPlaying ? "Pause" : "Play"}
        </span>
      </div>
      <button
        onClick={() => exitShell(true)}
        className="absolute bottom-8 right-6 flex flex-col items-center gap-1 px-4 py-3 rounded-2xl bg-muted text-muted-foreground text-sm font-medium shadow hover:bg-muted/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Open Accessibility Help"
        style={{ minWidth: 90 }}
      >
        <Accessibility className="h-7 w-7" aria-hidden="true" />
        <span>Help</span>
      </button>
    </div>
  );
}

export function SwitchAccessScanner() {
  const [enabled, setEnabled] = useState(() => !!localStorageService.getSettings().switchAccessMode);
  const [focusShellActive, setFocusShellActive] = useState(() => !!localStorageService.getSettings().focusShell);
  const [scanIndex, setScanIndex] = useState(-1);
  const scanRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elementsRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const sync = () => {
      const s = localStorageService.getSettings();
      setEnabled(!!s.switchAccessMode);
      setFocusShellActive(!!s.focusShell);
    };
    document.addEventListener("accessibooks:settings-changed", sync);
    return () => document.removeEventListener("accessibooks:settings-changed", sync);
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (scanRef.current) clearInterval(scanRef.current);
      elementsRef.current.forEach((el) => el.classList.remove("switch-access-focus"));
      setScanIndex(-1);
      return;
    }

    const SCAN_INTERVAL = 1200;
    const SELECTOR = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const startScan = () => {
      elementsRef.current = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR)).filter(
        (el) => el.offsetParent !== null && !el.closest('[aria-hidden="true"]'),
      );
      setScanIndex(0);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (scanRef.current) {
          clearInterval(scanRef.current);
          scanRef.current = null;
          setScanIndex(-1);
        }
        startScan();
        scanRef.current = setInterval(() => {
          setScanIndex((prev) => {
            const next = prev + 1;
            if (next >= elementsRef.current.length) {
              clearInterval(scanRef.current!);
              scanRef.current = null;
              return -1;
            }
            return next;
          });
        }, SCAN_INTERVAL);
      } else if (e.code === "Enter" && scanIndex >= 0) {
        e.preventDefault();
        if (scanRef.current) {
          clearInterval(scanRef.current);
          scanRef.current = null;
        }
        const target = elementsRef.current[scanIndex];
        target?.click();
        setScanIndex(-1);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (scanRef.current) clearInterval(scanRef.current);
    };
  }, [enabled, scanIndex]);

  useEffect(() => {
    elementsRef.current.forEach((el, i) => {
      if (i === scanIndex) {
        el.classList.add("switch-access-focus");
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        el.classList.remove("switch-access-focus");
      }
    });
  }, [scanIndex]);

  if (!enabled || focusShellActive) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Switch access scanning active. Press Space to start scanning, Enter to select."
      style={{
        position: "fixed",
        bottom: 128,
        left: 16,
        zIndex: 9995,
        background: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
        padding: "4px 10px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        pointerEvents: "none",
        opacity: 0.9,
      }}
    >
      {scanIndex >= 0 ? `Scanning ${scanIndex + 1}/${elementsRef.current.length}` : "Switch Access: Space to scan"}
    </div>
  );
}
