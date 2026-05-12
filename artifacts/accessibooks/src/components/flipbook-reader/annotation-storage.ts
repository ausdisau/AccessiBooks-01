import type { Annotation } from "./annotation-types";

/**
 * Thin storage adapter for annotations. The UI consumes this interface only,
 * so a future API-backed implementation can replace `localAnnotationStorage`
 * without touching the components.
 */
export interface AnnotationStorage {
  list(bookId: string): Promise<Annotation[]>;
  save(annotation: Annotation): Promise<void>;
  remove(bookId: string, id: string): Promise<void>;
}

const STORAGE_PREFIX = "accessibooks:flipbook-annotations:v1:";

function storageKey(bookId: string): string {
  return STORAGE_PREFIX + bookId;
}

function isValidAnnotation(value: unknown): value is Annotation {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  if (typeof a.id !== "string" || a.id.length === 0) return false;
  if (typeof a.bookId !== "string") return false;
  if (typeof a.pageIndex !== "number" || !Number.isFinite(a.pageIndex)) return false;
  if (typeof a.createdAt !== "number" || typeof a.updatedAt !== "number") return false;
  if (a.kind === "text") {
    return typeof a.body === "string";
  }
  if (a.kind === "voice") {
    return (
      typeof a.audioBase64 === "string" &&
      typeof a.mimeType === "string" &&
      typeof a.durationMs === "number"
    );
  }
  return false;
}

function readAll(bookId: string): Annotation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(bookId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidAnnotation);
  } catch {
    return [];
  }
}

function writeAll(bookId: string, items: Annotation[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(bookId), JSON.stringify(items));
  } catch {
    /* quota or unavailable storage — silently ignore */
  }
}

export const localAnnotationStorage: AnnotationStorage = {
  async list(bookId) {
    return readAll(bookId);
  },
  async save(annotation) {
    const items = readAll(annotation.bookId);
    const idx = items.findIndex((a) => a.id === annotation.id);
    if (idx >= 0) items[idx] = annotation;
    else items.push(annotation);
    writeAll(annotation.bookId, items);
  },
  async remove(bookId, id) {
    writeAll(bookId, readAll(bookId).filter((a) => a.id !== id));
  },
};
