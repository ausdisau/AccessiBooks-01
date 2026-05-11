/**
 * Per-book reader session — the slices not covered by the existing
 * `flipbook-typography` (theme/typography/preset), `tts-service` (voice prefs),
 * or `annotation-storage` (notes) modules. Keeps the same swap-friendly
 * adapter pattern so a future authenticated backend can replace the local
 * implementation without UI changes.
 */
export interface ReaderSession {
  /** Last visible page (1-based). */
  currentPage: number;
  /** Whether Focus Mode was on. */
  focusMode: boolean;
}

export const DEFAULT_READER_SESSION: ReaderSession = {
  currentPage: 1,
  focusMode: false,
};

export interface ReaderSessionStorage {
  load(bookId: string): Promise<ReaderSession>;
  save(bookId: string, session: ReaderSession): Promise<void>;
}

const STORAGE_PREFIX = "accessibooks:flipbook-session:v1:";

function storageKey(bookId: string): string {
  return STORAGE_PREFIX + bookId;
}

function readSync(bookId: string): ReaderSession {
  if (typeof window === "undefined") return { ...DEFAULT_READER_SESSION };
  try {
    const raw = window.localStorage.getItem(storageKey(bookId));
    if (!raw) return { ...DEFAULT_READER_SESSION };
    const parsed = JSON.parse(raw) as Partial<ReaderSession>;
    const page = Number.isFinite(parsed.currentPage) ? Number(parsed.currentPage) : 1;
    return {
      currentPage: page >= 1 ? Math.floor(page) : 1,
      focusMode: parsed.focusMode === true,
    };
  } catch {
    return { ...DEFAULT_READER_SESSION };
  }
}

export const localReaderSessionStorage: ReaderSessionStorage = {
  async load(bookId) {
    return readSync(bookId);
  },
  async save(bookId, session) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey(bookId), JSON.stringify(session));
    } catch {
      /* quota or unavailable storage — silently ignore */
    }
  },
};

/** Sync helper for first-render hydration so the initial paint already
 *  reflects the persisted state (the UI feels snappier than an async dance). */
export function loadReaderSessionSync(bookId: string): ReaderSession {
  return readSync(bookId);
}
