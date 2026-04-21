import type { Book } from "@shared/schema";
import { storage } from "../storage";
import { db } from "../db";
import { listeningHistory } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
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
  key: string;
  expiresAt: number;
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

async function getUserHistoryVersion(userId: string | undefined): Promise<string> {
  if (!userId) return "anon";
  try {
    const rows = await db
      .select({ count: sql<number>`count(*)::int`, last: sql<string>`coalesce(max(${listeningHistory.lastPlayedAt}),'0')` })
      .from(listeningHistory)
      .where(eq(listeningHistory.userId, userId));
    const r = rows[0];
    return `${r?.count ?? 0}:${r?.last ?? "0"}`;
  } catch {
    return "db-down";
  }
}

function pruneUserCache() {
  if (userCache.size <= USER_CACHE_MAX_ENTRIES) return;
  // Drop oldest by expiresAt.
  const entries = Array.from(userCache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const drop = entries.slice(0, entries.length - USER_CACHE_MAX_ENTRIES);
  for (const [k] of drop) userCache.delete(k);
}

async function computeCandidates(userId: string | undefined, topN: number, art: CFArtifacts | null): Promise<Candidate[]> {
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

export async function getCandidates(userId: string | undefined, topN = 30): Promise<Candidate[]> {
  const t0 = Date.now();
  const art = await getModel();
  const historyVersion = await getUserHistoryVersion(userId);
  const modelVersion = art?.meta.trainedAt ?? "no-model";
  const cacheKey = `${userId ?? "anon"}|${modelVersion}|${historyVersion}|${topN}`;

  const hit = userCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now() && hit.key === cacheKey) {
    return hit.candidates;
  }

  const candidates = await computeCandidates(userId, topN, art);
  userCache.set(cacheKey, {
    candidates,
    key: cacheKey,
    expiresAt: Date.now() + USER_CACHE_MS,
  });
  pruneUserCache();

  const elapsed = Date.now() - t0;
  if (elapsed > 200) console.warn(`[recommendation/candidateService] slow compute: ${elapsed}ms`);
  return candidates;
}
