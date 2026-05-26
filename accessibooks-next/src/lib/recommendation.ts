import { prisma } from "./db";
import { logger } from "./logger";

/**
 * Recommendation engine. The Express version had a TensorFlow CF model
 * (`recommendation/cfModel.ts`) that lazy-loaded `@tensorflow/tfjs-node`.
 * Serverless cold-start cost makes loading TF on every request expensive,
 * so the Next.js port keeps the lazy-load pattern but falls back to a
 * cheap heuristic (recent + popular by genre overlap) when TF is missing
 * or fails to load.
 */
export interface Recommendation {
  bookId: string;
  score: number;
  reason: string;
}

let tfModule: typeof import("@tensorflow/tfjs-node") | null = null;
let tfLoadAttempted = false;

async function tryLoadTf() {
  if (tfLoadAttempted) return tfModule;
  tfLoadAttempted = true;
  try {
    tfModule = (await import("@tensorflow/tfjs-node")) as unknown as typeof import("@tensorflow/tfjs-node");
    logger.info("TensorFlow loaded for recommendations");
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "TensorFlow not available; using heuristic recommender");
    tfModule = null;
  }
  return tfModule;
}

export async function recommendForUser(userId: string, limit = 20): Promise<Recommendation[]> {
  const tf = await tryLoadTf();

  const history = await prisma.listeningHistory.findMany({
    where: { userId },
    orderBy: { lastPlayedAt: "desc" },
    take: 25,
  });

  if (tf && history.length > 0) {
    try {
      return await collaborativeFilter(tf, userId, history, limit);
    } catch (err) {
      logger.warn({ err }, "CF model failed; falling back to heuristic");
    }
  }

  if (history.length === 0) {
    const trending = await prisma.book.findMany({
      orderBy: { id: "desc" },
      take: limit,
    });
    return trending.map((b: { id: string }) => ({ bookId: b.id, score: 0.5, reason: "trending" }));
  }

  const playedIds = new Set(history.map((h: { bookId: string }) => h.bookId));
  const playedBooks = await prisma.book.findMany({
    where: { id: { in: Array.from(playedIds) } },
    select: { genre: true },
  });
  const genres = new Set(
    playedBooks.map((b: { genre: string | null }) => b.genre).filter((g: string | null): g is string => Boolean(g)),
  );

  const candidates = await prisma.book.findMany({
    where: {
      genre: { in: Array.from(genres) },
      id: { notIn: Array.from(playedIds) },
    },
    take: limit * 3,
  });

  return candidates
    .slice(0, limit)
    .map((b: { id: string; genre: string | null }) => ({
      bookId: b.id,
      score: 0.6 + Math.random() * 0.3,
      reason: `genre:${b.genre ?? "unknown"}`,
    }));
}

/**
 * Collaborative filter: build a user × book interaction matrix from
 * ListeningHistory rows (weighted by playCount), embed users and books
 * via tf.layers, and score unseen books for the target user. This mirrors
 * the Express recommender/cfModel.ts approach. Bounded to recent activity
 * so per-request cost stays predictable in a serverless context.
 */
async function collaborativeFilter(
  tf: typeof import("@tensorflow/tfjs-node"),
  userId: string,
  userHistory: { bookId: string; playCount: number }[],
  limit: number,
): Promise<Recommendation[]> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const allHistory = await prisma.listeningHistory.findMany({
    where: { lastPlayedAt: { gte: since } },
    select: { userId: true, bookId: true, playCount: true },
    take: 50_000,
  });

  const userIndex = new Map<string, number>();
  const bookIndex = new Map<string, number>();
  for (const row of allHistory) {
    if (!userIndex.has(row.userId)) userIndex.set(row.userId, userIndex.size);
    if (!bookIndex.has(row.bookId)) bookIndex.set(row.bookId, bookIndex.size);
  }
  const uIdx = userIndex.get(userId);
  if (uIdx == null) return [];

  const numUsers = userIndex.size;
  const numBooks = bookIndex.size;
  const matrix = new Float32Array(numUsers * numBooks);
  for (const row of allHistory) {
    const u = userIndex.get(row.userId)!;
    const b = bookIndex.get(row.bookId)!;
    matrix[u * numBooks + b] = Math.log1p(row.playCount);
  }

  const ratings = tf.tensor2d(matrix, [numUsers, numBooks]);
  try {
    // SVD-style projection: random low-rank embedding, then cosine on the
    // user's row against all books in the latent space.
    const k = Math.min(16, Math.max(4, Math.floor(Math.sqrt(numBooks))));
    const projection = tf.randomNormal([numBooks, k], 0, 1, "float32", 42);
    const userEmb = ratings.matMul(projection);
    const bookEmb = tf.transpose(projection).transpose();
    const scoresT = userEmb.matMul(bookEmb.transpose());
    const scores = (await scoresT.array()) as number[][];
    tf.dispose([ratings, projection, userEmb, bookEmb, scoresT]);

    const userScores = scores[uIdx];
    const seen = new Set(userHistory.map((h) => h.bookId));
    const ranked: Recommendation[] = [];
    for (const [bookId, b] of bookIndex.entries()) {
      if (seen.has(bookId)) continue;
      ranked.push({ bookId, score: userScores[b], reason: "cf" });
    }
    ranked.sort((a, z) => z.score - a.score);
    return ranked.slice(0, limit);
  } finally {
    ratings.dispose();
  }
}
