import { db } from "../db";
import { listeningHistory } from "@shared/schema";
import { desc } from "drizzle-orm";

export interface Interaction {
  userId: string;
  bookId: string;
  weight: number;
}

export interface InteractionDataset {
  interactions: Interaction[];
  userIndex: Record<string, number>;
  bookIndex: Record<string, number>;
  bookPopularity: Record<string, number>;
  numUsers: number;
  numBooks: number;
}

const MAX_HISTORY = 50_000;

const RECENCY_HALF_LIFE_DAYS = Number(process.env.REC_RECENCY_HALF_LIFE_DAYS || 30);
const RECENCY_FLOOR = 0.25;

function recencyMultiplier(lastPlayedAt: Date | null): number {
  if (!lastPlayedAt) return RECENCY_FLOOR;
  const ageMs = Date.now() - lastPlayedAt.getTime();
  if (ageMs <= 0) return 1;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const decay = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
  return RECENCY_FLOOR + (1 - RECENCY_FLOOR) * decay;
}

export async function loadInteractions(): Promise<InteractionDataset> {
  const userIndex: Record<string, number> = {};
  const bookIndex: Record<string, number> = {};
  const bookPopularity: Record<string, number> = {};
  const interactions: Interaction[] = [];

  let rows: Array<{
    userId: string;
    bookId: string;
    currentTime: number | null;
    totalDuration: number | null;
    playCount: number | null;
    completedAt: Date | null;
    lastPlayedAt: Date | null;
  }> = [];
  try {
    rows = await db
      .select({
        userId: listeningHistory.userId,
        bookId: listeningHistory.bookId,
        currentTime: listeningHistory.currentTime,
        totalDuration: listeningHistory.totalDuration,
        playCount: listeningHistory.playCount,
        completedAt: listeningHistory.completedAt,
        lastPlayedAt: listeningHistory.lastPlayedAt,
      })
      .from(listeningHistory)
      .orderBy(desc(listeningHistory.lastPlayedAt))
      .limit(MAX_HISTORY);
  } catch (err) {
    console.warn("[recommendation/dataPrep] DB unavailable, returning empty dataset:", (err as Error).message);
    return { interactions, userIndex, bookIndex, bookPopularity, numUsers: 0, numBooks: 0 };
  }

  for (const r of rows) {
    if (!r.userId || !r.bookId) continue;

    // Engagement signal in [0.5, 1.05].
    let weight = 0.5;
    if (r.completedAt) weight = 1.0;
    else if (r.totalDuration && r.currentTime) {
      const ratio = Math.max(0, Math.min(1, r.currentTime / r.totalDuration));
      weight = 0.3 + ratio * 0.7;
    }
    weight = Math.min(1.05, weight + Math.log1p(r.playCount ?? 1) * 0.05);

    // Apply explicit recency time-decay (half-life REC_RECENCY_HALF_LIFE_DAYS).
    weight *= recencyMultiplier(r.lastPlayedAt);

    if (!(r.userId in userIndex)) userIndex[r.userId] = Object.keys(userIndex).length;
    if (!(r.bookId in bookIndex)) bookIndex[r.bookId] = Object.keys(bookIndex).length;

    interactions.push({ userId: r.userId, bookId: r.bookId, weight });
    bookPopularity[r.bookId] = (bookPopularity[r.bookId] || 0) + weight;
  }

  return {
    interactions,
    userIndex,
    bookIndex,
    bookPopularity,
    numUsers: Object.keys(userIndex).length,
    numBooks: Object.keys(bookIndex).length,
  };
}
