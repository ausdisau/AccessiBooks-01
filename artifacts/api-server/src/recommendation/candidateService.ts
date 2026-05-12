import type { Book } from "@workspace/db";
import { storage } from "../storage";
import { loadCFModel, popularityRanking, scoreUserAgainstAllBooks, type CFArtifacts } from "./cfModel";

export interface Candidate {
  book: Book;
  score: number;
  reason: "model" | "popularity" | "recent" | "genre";
}

let cachedArt: CFArtifacts | null = null;
let cachedAt = 0;
const MODEL_CACHE_MS = 5 * 60 * 1000;

interface UserCacheEntry {
  candidates: Candidate[];
  expiresAt: number;
  lastAccessAt: number;
}
const userCache = new Map<string, UserCacheEntry>();
const USER_CACHE_MS = 60 * 1000;
const USER_CACHE_MAX_ENTRIES = 500;

export async function getModel(force = false): Promise<CFArtifacts | null> {
  if (!force && cachedArt && Date.now() - cachedAt < MODEL_CACHE_MS) return cachedArt;
  cachedArt = await loadCFModel();
  cachedAt = Date.now();
  return cachedArt;
}

export function invalidateModelCache() {
  cachedArt = null;
  cachedAt = 0;
  userCache.clear();
}

/**
 * Explicit invalidation hook for write paths (e.g. after a user finishes a
 * book). Keeps the warm path free of any DB-version checks.
 */
export function invalidateUserCandidates(userId: string) {
  for (const k of Array.from(userCache.keys())) {
    if (k.startsWith(`${userId}|`)) userCache.delete(k);
  }
}

function pruneUserCache() {
  if (userCache.size <= USER_CACHE_MAX_ENTRIES) return;
  // LRU-style: drop the oldest by lastAccessAt.
  const entries = Array.from(userCache.entries()).sort((a, b) => a[1].lastAccessAt - b[1].lastAccessAt);
  const drop = entries.slice(0, entries.length - USER_CACHE_MAX_ENTRIES);
  for (const [k] of drop) userCache.delete(k);
}

async function computeCandidates(
  userId: string | undefined,
  topN: number,
  art: CFArtifacts | null,
): Promise<Candidate[]> {
  const allBooks = await storage.getBooks();
  const byId = new Map(allBooks.map((b) => [b.id, b]));

  let ranking: { bookId: string; score: number }[] = [];
  let reason: Candidate["reason"] = "popularity";

  if (art && userId && userId in art.meta.userIndex) {
    ranking = scoreUserAgainstAllBooks(art, userId);
    reason = "model";
  } else if (art) {
    ranking = popularityRanking(art, Object.keys(art.meta.bookIndex));
    reason = "popularity";
  } else {
    ranking = allBooks
      .slice()
      .sort((a, b) => (b.publishedYear ?? 0) - (a.publishedYear ?? 0))
      .map((b) => ({ bookId: b.id, score: (b.publishedYear ?? 0) / 3000 }));
    reason = "recent";
  }

  const candidates: Candidate[] = [];
  for (const r of ranking) {
    const book = byId.get(r.bookId);
    if (!book) continue;
    candidates.push({ book, score: r.score, reason });
    if (candidates.length >= topN) break;
  }

  if (candidates.length < topN) {
    const seen = new Set(candidates.map((c) => c.book.id));
    for (const b of allBooks) {
      if (seen.has(b.id)) continue;
      candidates.push({ book: b, score: 0, reason: "popularity" });
      if (candidates.length >= topN) break;
    }
  }

  return candidates;
}

/**
 * Warm-path is purely in-memory: model cache (5min TTL + invalidation hook)
 * + per-user cache (60s TTL keyed on userId|modelVersion|topN). No DB work
 * happens before a cache hit; this preserves the <100ms warm SLA. Writes
 * that should bust a user's recommendations call invalidateUserCandidates().
 */
export async function getCandidates(userId: string | undefined, topN = 30): Promise<Candidate[]> {
  const t0 = Date.now();
  const art = await getModel();
  const modelVersion = art?.meta.trainedAt ?? "no-model";
  const cacheKey = `${userId ?? "anon"}|${modelVersion}|${topN}`;

  const hit = userCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    hit.lastAccessAt = Date.now();
    return hit.candidates;
  }

  const candidates = await computeCandidates(userId, topN, art);
  userCache.set(cacheKey, {
    candidates,
    expiresAt: Date.now() + USER_CACHE_MS,
    lastAccessAt: Date.now(),
  });
  pruneUserCache();

  const elapsed = Date.now() - t0;
  if (elapsed > 200) console.warn(`[recommendation/candidateService] slow compute: ${elapsed}ms`);
  return candidates;
}
