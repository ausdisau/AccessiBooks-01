import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Book } from "./api";

/**
 * Offline downloads for audiobooks.
 *
 * Audio files are saved under documentDirectory/downloads and tracked in
 * AsyncStorage. The player prefers a downloaded file when one exists, so a
 * downloaded title plays with no network. Progress is reported live during a
 * download; metadata is persisted on state transitions (start / done / error)
 * rather than on every progress tick to keep storage writes cheap.
 */

export type DownloadStatus = "downloading" | "done" | "error";

export type DownloadEntry = {
  bookId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  audioUrl: string | null;
  fileUri: string; // canonical local target path (set even while downloading)
  localUri: string | null;
  status: DownloadStatus;
  progress: number; // 0..1
  sizeBytes: number;
  updatedAt: number;
};

type DownloadsMap = Record<string, DownloadEntry>;

export type DownloadsContextValue = {
  entries: DownloadsMap;
  startDownload: (book: Book) => Promise<void>;
  removeDownload: (bookId: string) => Promise<void>;
  getEntry: (bookId: string) => DownloadEntry | null;
  getLocalUri: (bookId: string) => string | null;
  isDownloaded: (bookId: string) => boolean;
  totalBytes: number;
};

const STORAGE_KEY = "accessibooks:downloads:v1";
const DOWNLOAD_DIR = (FileSystem.documentDirectory ?? "") + "downloads/";

const DownloadsContext = createContext<DownloadsContextValue | null>(null);

function extractExt(url: string): string {
  try {
    const clean = url.split("?")[0].split("#")[0];
    const last = clean.substring(clean.lastIndexOf("/") + 1);
    const dot = last.lastIndexOf(".");
    if (dot >= 0) {
      const ext = last.substring(dot + 1).toLowerCase();
      if (/^[a-z0-9]{1,4}$/.test(ext)) return ext;
    }
  } catch {
    /* fall through */
  }
  return "mp3";
}

function safeName(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function formatBytes(n: number): string {
  if (!n || n <= 0) return "0 MB";
  const mb = n / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}

export function DownloadsProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<DownloadsMap>({});
  const tasks = useRef<Record<string, FileSystem.DownloadResumable>>({});

  const persist = useCallback((next: DownloadsMap) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // Load persisted entries and verify the underlying files still exist. Any
  // download interrupted by an app restart is surfaced as "error" so the user
  // can retry rather than seeing a stuck spinner.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed: DownloadsMap = raw ? JSON.parse(raw) : {};
        const verified: DownloadsMap = {};
        for (const [id, e] of Object.entries(parsed)) {
          if (e.status === "done" && e.localUri) {
            try {
              const info = await FileSystem.getInfoAsync(e.localUri);
              if (info.exists) {
                verified[id] = e;
                continue;
              }
            } catch {
              /* drop entries whose file is gone */
            }
          } else if (e.status === "downloading") {
            // Interrupted by an app restart — surface as a retryable error and
            // remove any partial bytes left behind.
            if (e.fileUri) {
              FileSystem.deleteAsync(e.fileUri, { idempotent: true }).catch(
                () => {},
              );
            }
            verified[id] = { ...e, status: "error", progress: 0 };
          } else if (e.status === "error") {
            verified[id] = e;
          }
        }
        setEntries(verified);
        persist(verified);
      } catch {
        /* ignore corrupt store */
      }
    })();
  }, [persist]);

  const update = useCallback(
    (id: string, patch: Partial<DownloadEntry>) => {
      setEntries((prev) => {
        const cur = prev[id];
        if (!cur) return prev;
        return { ...prev, [id]: { ...cur, ...patch, updatedAt: Date.now() } };
      });
    },
    [],
  );

  const startDownload = useCallback(
    async (book: Book) => {
      const id = book.id;
      if (!book.audioUrl || !id) return;
      const existing = entries[id];
      if (existing?.status === "done") return;
      if (tasks.current[id]) return; // already in flight

      const fileUri = `${DOWNLOAD_DIR}${safeName(id)}.${extractExt(book.audioUrl)}`;
      try {
        await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, {
          intermediates: true,
        });
      } catch {
        /* directory already exists */
      }

      const base: DownloadEntry = {
        bookId: id,
        title: book.title,
        author: book.author ?? null,
        coverUrl: book.coverUrl ?? null,
        audioUrl: book.audioUrl,
        fileUri,
        localUri: null,
        status: "downloading",
        progress: 0,
        sizeBytes: 0,
        updatedAt: Date.now(),
      };
      setEntries((prev) => {
        const next = { ...prev, [id]: base };
        persist(next);
        return next;
      });

      const task = FileSystem.createDownloadResumable(
        book.audioUrl,
        fileUri,
        {},
        (p) => {
          const ratio =
            p.totalBytesExpectedToWrite > 0
              ? p.totalBytesWritten / p.totalBytesExpectedToWrite
              : 0;
          update(id, {
            progress: Math.max(0, Math.min(1, ratio)),
            sizeBytes: p.totalBytesWritten,
          });
        },
      );
      tasks.current[id] = task;

      try {
        const result = await task.downloadAsync();
        delete tasks.current[id];
        if (!result?.uri) throw new Error("download produced no file");
        let size = 0;
        try {
          const info = await FileSystem.getInfoAsync(result.uri);
          if (info.exists && typeof info.size === "number") size = info.size;
        } catch {
          /* size best-effort */
        }
        setEntries((prev) => {
          const cur = prev[id];
          if (!cur) return prev;
          const next = {
            ...prev,
            [id]: {
              ...cur,
              status: "done" as const,
              localUri: result.uri,
              progress: 1,
              sizeBytes: size || cur.sizeBytes,
              updatedAt: Date.now(),
            },
          };
          persist(next);
          return next;
        });
      } catch {
        delete tasks.current[id];
        // Remove any partial bytes left by the failed/cancelled download.
        FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
        setEntries((prev) => {
          const cur = prev[id];
          if (!cur) return prev;
          const next = {
            ...prev,
            [id]: { ...cur, status: "error" as const, updatedAt: Date.now() },
          };
          persist(next);
          return next;
        });
      }
    },
    [entries, persist, update],
  );

  const removeDownload = useCallback(
    async (id: string) => {
      const task = tasks.current[id];
      if (task) {
        try {
          await task.pauseAsync();
        } catch {
          /* ignore */
        }
        delete tasks.current[id];
      }
      setEntries((prev) => {
        const cur = prev[id];
        // Delete the file at its canonical target path; this covers completed
        // downloads as well as partial bytes from interrupted/failed ones
        // (where localUri is still null).
        const toDelete = cur?.fileUri || cur?.localUri;
        if (toDelete) {
          FileSystem.deleteAsync(toDelete, { idempotent: true }).catch(() => {});
        }
        const { [id]: _removed, ...rest } = prev;
        persist(rest);
        return rest;
      });
    },
    [persist],
  );

  const value = useMemo<DownloadsContextValue>(() => {
    const totalBytes = Object.values(entries).reduce(
      (sum, e) => sum + (e.status === "done" ? e.sizeBytes : 0),
      0,
    );
    return {
      entries,
      startDownload,
      removeDownload,
      getEntry: (id: string) => entries[id] ?? null,
      getLocalUri: (id: string) =>
        entries[id]?.status === "done" ? entries[id].localUri : null,
      isDownloaded: (id: string) => entries[id]?.status === "done",
      totalBytes,
    };
  }, [entries, startDownload, removeDownload]);

  return (
    <DownloadsContext.Provider value={value}>
      {children}
    </DownloadsContext.Provider>
  );
}

export function useDownloads(): DownloadsContextValue {
  const ctx = useContext(DownloadsContext);
  if (!ctx) {
    throw new Error("useDownloads must be used within a DownloadsProvider");
  }
  return ctx;
}
