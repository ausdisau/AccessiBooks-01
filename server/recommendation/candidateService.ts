import type { Book } from "@shared/schema";
import { storage } from "../storage";
import { loadCFModel, popularityRanking, scoreUserAgainstAllBooks, type CFArtifacts } from "./cfModel";

export interface Candidate {
  book: Book;
  score: number;
  reason: "model" | "popularity" | "recent" | "genre";
}

let cachedArt: CFArtifacts | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

export async function getModel(force = false): Promise<CFArtifacts | null> {
  if (!force && cachedArt && Date.now() - cachedAt < CACHE_MS) return cachedArt;
  cachedArt = await loadCFModel();
  cachedAt = Date.now();
  return cachedArt;
}

export function invalidateModelCache() {
  cachedArt = null;
  cachedAt = 0;
}

export async function getCandidates(userId: string | undefined, topN = 30): Promise<Candidate[]> {
  const t0 = Date.now();
  const allBooks = await storage.getBooks();
  const byId = new Map(allBooks.map((b) => [b.id, b]));
  const art = await getModel();

  let ranking: { bookId: string; score: number }[] = [];
  let reason: Candidate["reason"] = "popularity";

  if (art && userId && userId in art.meta.userIndex) {
    ranking = scoreUserAgainstAllBooks(art, userId);
    reason = "model";
  } else if (art) {
    ranking = popularityRanking(art, Object.keys(art.meta.bookIndex));
    reason = "popularity";
  } else {
    // Cold-start: prefer recent books
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

  // Pad with popular fillers when the model is sparse.
  if (candidates.length < topN) {
    const seen = new Set(candidates.map((c) => c.book.id));
    for (const b of allBooks) {
      if (seen.has(b.id)) continue;
      candidates.push({ book: b, score: 0, reason: "popularity" });
      if (candidates.length >= topN) break;
    }
  }

  const elapsed = Date.now() - t0;
  if (elapsed > 200) console.warn(`[recommendation/candidateService] slow: ${elapsed}ms`);
  return candidates;
}
