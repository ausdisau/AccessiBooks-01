import { useState, useEffect, useCallback, useRef } from "react";
import { useSubscription } from "@/hooks/use-subscription";

const DB_NAME = "accessibooks-offline";
const STORE_NAME = "downloads";
const DB_VERSION = 1;

interface DownloadRecord {
  bookId: string;
  title: string;
  author: string;
  coverImage: string;
  audioBlob: Blob;
  downloadedAt: string;
  sizeBytes: number;
  loanId?: string;
  loanExpiresAt?: string;
}

interface DownloadMetadata {
  title: string;
  author: string;
  coverImage: string;
  duration?: string;
  loanId?: string;
  loanExpiresAt?: string;
}

interface DownloadProgress {
  bookId: string;
  progress: number;
  status: "queued" | "downloading" | "complete" | "error";
  error?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "bookId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbGet(bookId: string): Promise<DownloadRecord | undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(bookId);
        req.onsuccess = () => resolve(req.result as DownloadRecord | undefined);
        req.onerror = () => reject(req.error);
      })
  );
}

function dbGetAll(): Promise<DownloadRecord[]> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result as DownloadRecord[]);
        req.onerror = () => reject(req.error);
      })
  );
}

function dbPut(record: DownloadRecord): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })
  );
}

function dbDelete(bookId: string): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(bookId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })
  );
}

export function useOfflineDownloads() {
  const { isPremium } = useSubscription();
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, DownloadProgress>>({});
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageEstimate, setStorageEstimate] = useState(0);
  const queueRef = useRef<{ bookId: string; audioUrl: string; metadata: DownloadMetadata }[]>([]);
  const processingRef = useRef(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const refreshDownloads = useCallback(async () => {
    try {
      const records = await dbGetAll();
      setDownloads(records);
      const used = records.reduce((sum, r) => sum + r.sizeBytes, 0);
      setStorageUsed(used);
    } catch {
      // IndexedDB not available
    }
  }, []);

  const cleanupExpiredLoans = useCallback(async () => {
    try {
      const records = await dbGetAll();
      const now = Date.now();
      for (const rec of records) {
        if (rec.loanExpiresAt && new Date(rec.loanExpiresAt).getTime() <= now) {
          await dbDelete(rec.bookId);
        }
      }
      await refreshDownloads();
    } catch {
      // IndexedDB not available
    }
  }, [refreshDownloads]);

  useEffect(() => {
    refreshDownloads();
    cleanupExpiredLoans();
    const interval = setInterval(cleanupExpiredLoans, 60_000);
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        setStorageEstimate(est.quota || 0);
      });
    }
    return () => clearInterval(interval);
  }, [refreshDownloads, cleanupExpiredLoans]);

  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;
    processingRef.current = true;

    const item = queueRef.current[0];

    setProgressMap((prev) => ({
      ...prev,
      [item.bookId]: { bookId: item.bookId, progress: 0, status: "downloading" },
    }));

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open("GET", item.audioUrl, true);
        xhr.responseType = "blob";
        xhr.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setProgressMap((prev) => ({
              ...prev,
              [item.bookId]: { bookId: item.bookId, progress: pct, status: "downloading" },
            }));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response as Blob);
          } else {
            reject(new Error(`Download failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send();
      });

      const record: DownloadRecord = {
        bookId: item.bookId,
        title: item.metadata.title,
        author: item.metadata.author,
        coverImage: item.metadata.coverImage,
        audioBlob: blob,
        downloadedAt: new Date().toISOString(),
        sizeBytes: blob.size,
        loanId: item.metadata.loanId,
        loanExpiresAt: item.metadata.loanExpiresAt,
      };

      await dbPut(record);

      setProgressMap((prev) => ({
        ...prev,
        [item.bookId]: { bookId: item.bookId, progress: 100, status: "complete" },
      }));

      await refreshDownloads();
    } catch (err: any) {
      setProgressMap((prev) => ({
        ...prev,
        [item.bookId]: {
          bookId: item.bookId,
          progress: 0,
          status: "error",
          error: err?.message || "Download failed",
        },
      }));
    } finally {
      xhrRef.current = null;
      queueRef.current = queueRef.current.slice(1);
      processingRef.current = false;
      if (queueRef.current.length > 0) {
        processQueue();
      }
    }
  }, [refreshDownloads]);

  const downloadBook = useCallback(
    (bookId: string, audioUrl: string, metadata: DownloadMetadata) => {
      if (!isPremium && !metadata.loanId) return;
      if (queueRef.current.some((q) => q.bookId === bookId)) return;

      setProgressMap((prev) => ({
        ...prev,
        [bookId]: { bookId, progress: 0, status: "queued" },
      }));

      queueRef.current = [...queueRef.current, { bookId, audioUrl, metadata }];
      processQueue();
    },
    [isPremium, processQueue]
  );

  const removeDownload = useCallback(
    async (bookId: string) => {
      try {
        await dbDelete(bookId);
        setProgressMap((prev) => {
          const next = { ...prev };
          delete next[bookId];
          return next;
        });
        await refreshDownloads();
      } catch {
        // ignore
      }
    },
    [refreshDownloads]
  );

  const getDownloadedBooks = useCallback(() => downloads, [downloads]);

  const isBookDownloaded = useCallback(
    (bookId: string) => downloads.some((d) => d.bookId === bookId),
    [downloads]
  );

  const getDownloadProgress = useCallback(
    (bookId: string): DownloadProgress | null => progressMap[bookId] ?? null,
    [progressMap]
  );

  const getLoanDownloads = useCallback(
    () => downloads.filter((d) => d.loanId),
    [downloads]
  );

  return {
    isPremium,
    downloads,
    downloadBook,
    removeDownload,
    getDownloadedBooks,
    isBookDownloaded,
    getDownloadProgress,
    progressMap,
    storageUsed,
    storageEstimate,
    getLoanDownloads,
    cleanupExpiredLoans,
  };
}
