/**
 * Unified per-book reader session.
 *
 * One typed contract that covers every slice the flipbook reader needs to
 * remember between visits — current page, Focus Mode, typography/theme/preset
 * settings, and text-to-speech preferences. The local adapter delegates each
 * slice to its existing module-level store so behaviour is identical to today;
 * the value of having this composite is that swapping persistence to a backend
 * (per-user, cross-device sync) only requires implementing one interface.
 *
 * Annotations and voice notes have their own dedicated `AnnotationStorage`
 * adapter (`annotation-storage.ts`) — they are intentionally addressable on
 * their own because they can grow large and may want a different sync cadence.
 * `ReaderSessionStorage.loadAnnotationStorage()` exposes the matching adapter
 * so a future backend implementation can return both halves from one place.
 */

import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type FlipbookSettings,
} from "./flipbook-typography";
import {
  DEFAULT_TTS_PREFS,
  loadTtsPreferences,
  saveTtsPreferences,
  type TtsPreferences,
} from "./tts-service";
import { localAnnotationStorage, type AnnotationStorage } from "./annotation-storage";

export interface ReaderSession {
  /** Last visible page (1-based). */
  currentPage: number;
  /** Whether Focus Mode was on. */
  focusMode: boolean;
  /** Typography, theme, and active accessibility preset. */
  settings: FlipbookSettings;
  /** Text-to-speech voice/rate/pitch/volume. */
  ttsPrefs: TtsPreferences;
}

export const DEFAULT_READER_SESSION: ReaderSession = {
  currentPage: 1,
  focusMode: false,
  settings: { ...DEFAULT_SETTINGS },
  ttsPrefs: { ...DEFAULT_TTS_PREFS },
};

export interface ReaderSessionStorage {
  load(bookId: string): Promise<ReaderSession>;
  save(bookId: string, session: ReaderSession): Promise<void>;
  /** The matching annotation/voice-note adapter so a future backend can
   *  return both halves from one place. */
  loadAnnotationStorage(): AnnotationStorage;
}

const STORAGE_PREFIX = "accessibooks:flipbook-session:v1:";

function pageFocusKey(bookId: string): string {
  return STORAGE_PREFIX + bookId;
}

interface PageFocusSlice {
  currentPage: number;
  focusMode: boolean;
}

function readPageFocusSync(bookId: string): PageFocusSlice {
  if (typeof window === "undefined") return { currentPage: 1, focusMode: false };
  try {
    const raw = window.localStorage.getItem(pageFocusKey(bookId));
    if (!raw) return { currentPage: 1, focusMode: false };
    const parsed = JSON.parse(raw) as Partial<PageFocusSlice>;
    const page = Number.isFinite(parsed.currentPage) ? Number(parsed.currentPage) : 1;
    return {
      currentPage: page >= 1 ? Math.floor(page) : 1,
      focusMode: parsed.focusMode === true,
    };
  } catch {
    return { currentPage: 1, focusMode: false };
  }
}

function writePageFocus(bookId: string, slice: PageFocusSlice): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(pageFocusKey(bookId), JSON.stringify(slice));
  } catch {
    /* quota or unavailable storage — silently ignore */
  }
}

export const localReaderSessionStorage: ReaderSessionStorage = {
  async load(bookId) {
    const pf = readPageFocusSync(bookId);
    return {
      currentPage: pf.currentPage,
      focusMode: pf.focusMode,
      settings: loadSettings(bookId),
      ttsPrefs: loadTtsPreferences(),
    };
  },
  async save(bookId, session) {
    writePageFocus(bookId, {
      currentPage: session.currentPage,
      focusMode: session.focusMode,
    });
    saveSettings(bookId, session.settings);
    saveTtsPreferences(session.ttsPrefs);
  },
  loadAnnotationStorage() {
    return localAnnotationStorage;
  },
};

/** Sync helper for first-render hydration so the initial paint already
 *  reflects the persisted state (the UI feels snappier than an async dance). */
export function loadReaderSessionSync(bookId: string): ReaderSession {
  const pf = readPageFocusSync(bookId);
  return {
    currentPage: pf.currentPage,
    focusMode: pf.focusMode,
    settings: loadSettings(bookId),
    ttsPrefs:
      typeof window === "undefined" ? { ...DEFAULT_TTS_PREFS } : loadTtsPreferences(),
  };
}
