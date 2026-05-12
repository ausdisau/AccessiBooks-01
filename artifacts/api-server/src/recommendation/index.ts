import type { Book, DJRecommendation } from "@workspace/db";
import { storage } from "../storage";
import { db } from "../db";
import { listeningHistory, userPreferences } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getCandidates } from "./candidateService";
import { inflateBooks, runDjAgent, type AgentContext } from "./agent";
import { getTrainStatus, runTraining, startScheduler } from "./scheduler";

export { startScheduler, runTraining, getTrainStatus };

export function isAgentEnabled(): boolean {
  const flag = process.env.REC_AGENT_ENABLED;
  if (!flag) return false;
  return ["1", "true", "yes", "on"].includes(flag.toLowerCase());
}

async function buildAgentContext(userId: string | undefined): Promise<AgentContext> {
  const hour = new Date().getHours();
  let preferredGenres: string[] | undefined;
  let recentBooks: { title: string; author: string }[] | undefined;
  let userSummary = "Anonymous listener.";

  if (userId) {
    try {
      const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
      if (prefs?.favoriteGenres?.length) preferredGenres = prefs.favoriteGenres;
    } catch {}
    try {
      const recent = await db
        .select({ bookTitle: listeningHistory.bookTitle, bookAuthor: listeningHistory.bookAuthor })
        .from(listeningHistory)
        .where(eq(listeningHistory.userId, userId))
        .orderBy(desc(listeningHistory.lastPlayedAt))
        .limit(5);
      recentBooks = recent
        .filter((r) => r.bookTitle)
        .map((r) => ({ title: r.bookTitle, author: r.bookAuthor || "Unknown" }));
      userSummary = `Returning listener with ${recent.length} recent activity entries.`;
    } catch {}
  }

  return { userSummary, preferredGenres, recentBooks, hour };
}

export async function getAgentRecommendations(
  userId: string | undefined,
): Promise<{ sets: DJRecommendation[]; source: "agent" | "popularity" | "heuristic"; tookMs: number }> {
  const t0 = Date.now();
  const candidates = await getCandidates(userId, 30);
  const ctx = await buildAgentContext(userId);
  const resp = await runDjAgent(ctx, candidates);
  const bookMap = new Map<string, Book>(candidates.map((c) => [c.book.id, c.book]));
  const sets = inflateBooks(resp, bookMap).filter((s) => s.books.length > 0);
  return { sets, source: resp.source, tookMs: Date.now() - t0 };
}

export async function getAgentFlatBooks(
  userId: string | undefined,
  limit = 20,
): Promise<{ books: (Book & { rationale?: string })[]; source: string }> {
  const { sets, source } = await getAgentRecommendations(userId);
  const out: (Book & { rationale?: string })[] = [];
  const seen = new Set<string>();
  for (const s of sets) {
    for (const item of s.items ?? []) {
      if (seen.has(item.bookId)) continue;
      const book = s.books.find((b) => b.id === item.bookId);
      if (!book) continue;
      out.push({ ...book, rationale: item.rationale });
      seen.add(item.bookId);
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  // Fallback if agent returned nothing usable
  if (out.length === 0) {
    const all = await storage.getBooks();
    for (const b of all.slice(0, limit)) out.push({ ...b });
  }
  return { books: out, source };
}

/**
 * Resolve recommendations for the heuristic-style flat /api/recommendations endpoint.
 * Returns null if the agent path is disabled or fails — caller should use legacy heuristic.
 */
export async function tryAgentFlatRecommendations(
  userId: string | undefined,
  limit = 20,
): Promise<(Book & { rationale?: string })[] | null> {
  if (!isAgentEnabled()) return null;
  try {
    const { books } = await getAgentFlatBooks(userId, limit);
    return books.length > 0 ? books : null;
  } catch (err) {
    console.warn("[recommendation/index] agent flat failed:", (err as Error).message);
    return null;
  }
}

export async function tryAgentDjRecommendations(
  userId: string | undefined,
): Promise<DJRecommendation[] | null> {
  if (!isAgentEnabled()) return null;
  try {
    const { sets } = await getAgentRecommendations(userId);
    return sets.length > 0 ? sets : null;
  } catch (err) {
    console.warn("[recommendation/index] agent dj failed:", (err as Error).message);
    return null;
  }
}
