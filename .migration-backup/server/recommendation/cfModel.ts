import * as tf from "@tensorflow/tfjs-node";
import { promises as fs } from "fs";
import path from "path";
import type { InteractionDataset } from "./dataPrep";

const MODEL_DIR = path.join(process.cwd(), ".private", "rec-model");
const ARTIFACT_FILE = path.join(MODEL_DIR, "artifacts.json");

export interface ModelMeta {
  trainedAt: string;
  numUsers: number;
  numBooks: number;
  embeddingDim: number;
  userIndex: Record<string, number>;
  bookIndex: Record<string, number>;
  bookPopularity: Record<string, number>;
  loss: number | null;
  epochs: number;
  hitRateAt10: number | null;
  evalSize: number;
}

export interface CFArtifacts {
  userEmb: number[][]; // [numUsers, dim]
  bookEmb: number[][]; // [numBooks, dim]
  meta: ModelMeta;
}

const DEFAULT_DIM = 16;
const DEFAULT_EPOCHS = 8;
const NEG_PER_POS = 2;
const EVAL_K = 10;

async function ensureDir() {
  await fs.mkdir(MODEL_DIR, { recursive: true });
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function evaluateHitRateAtK(
  userEmb: number[][],
  bookEmb: number[][],
  heldOut: { userIdx: number; bookIdx: number }[],
  trainPairs: Set<string>,
  k: number,
): number {
  if (heldOut.length === 0) return 0;
  let hits = 0;
  for (const { userIdx, bookIdx } of heldOut) {
    const uVec = userEmb[userIdx];
    const scores: { bIdx: number; score: number }[] = [];
    for (let bIdx = 0; bIdx < bookEmb.length; bIdx++) {
      if (trainPairs.has(`${userIdx}:${bIdx}`)) continue;
      scores.push({ bIdx, score: dot(uVec, bookEmb[bIdx]) });
    }
    scores.sort((x, y) => y.score - x.score);
    const topK = scores.slice(0, k);
    if (topK.some((t) => t.bIdx === bookIdx)) hits++;
  }
  return hits / heldOut.length;
}

export async function trainCFModel(dataset: InteractionDataset): Promise<CFArtifacts | null> {
  if (dataset.interactions.length < 10 || dataset.numUsers < 2 || dataset.numBooks < 2) {
    console.log("[recommendation/cfModel] Not enough data to train CF model.");
    return null;
  }

  const dim = DEFAULT_DIM;
  const numUsers = dataset.numUsers;
  const numBooks = dataset.numBooks;

  // Per-user leave-one-out split for evaluation when user has 2+ interactions.
  const byUser = new Map<number, { bIdx: number; weight: number }[]>();
  for (const it of dataset.interactions) {
    const u = dataset.userIndex[it.userId];
    const b = dataset.bookIndex[it.bookId];
    const arr = byUser.get(u) || [];
    arr.push({ bIdx: b, weight: it.weight });
    byUser.set(u, arr);
  }

  const trainPairs: { userIdx: number; bIdx: number; weight: number }[] = [];
  const heldOut: { userIdx: number; bookIdx: number }[] = [];
  for (const [u, items] of Array.from(byUser.entries())) {
    if (items.length >= 2) {
      const last = items[items.length - 1];
      heldOut.push({ userIdx: u, bookIdx: last.bIdx });
      for (let i = 0; i < items.length - 1; i++) {
        trainPairs.push({ userIdx: u, bIdx: items[i].bIdx, weight: items[i].weight });
      }
    } else {
      for (const it of items) trainPairs.push({ userIdx: u, bIdx: it.bIdx, weight: it.weight });
    }
  }

  // Build training tensors with negative sampling.
  const userIds: number[] = [];
  const bookIds: number[] = [];
  const labels: number[] = [];
  const positivesSet = new Set<string>();

  for (const p of trainPairs) {
    userIds.push(p.userIdx);
    bookIds.push(p.bIdx);
    labels.push(Math.min(1, Math.max(0.5, p.weight)));
    positivesSet.add(`${p.userIdx}:${p.bIdx}`);
  }

  for (const p of trainPairs) {
    for (let n = 0; n < NEG_PER_POS; n++) {
      let neg = Math.floor(Math.random() * numBooks);
      let tries = 0;
      while (positivesSet.has(`${p.userIdx}:${neg}`) && tries < 5) {
        neg = Math.floor(Math.random() * numBooks);
        tries++;
      }
      userIds.push(p.userIdx);
      bookIds.push(neg);
      labels.push(0);
    }
  }

  const userInput = tf.input({ shape: [1], dtype: "int32", name: "user" });
  const bookInput = tf.input({ shape: [1], dtype: "int32", name: "book" });

  const userEmbedding = tf.layers
    .embedding({ inputDim: numUsers, outputDim: dim, embeddingsInitializer: "randomNormal", name: "userEmb" })
    .apply(userInput) as tf.SymbolicTensor;
  const bookEmbedding = tf.layers
    .embedding({ inputDim: numBooks, outputDim: dim, embeddingsInitializer: "randomNormal", name: "bookEmb" })
    .apply(bookInput) as tf.SymbolicTensor;

  const userVec = tf.layers.flatten().apply(userEmbedding) as tf.SymbolicTensor;
  const bookVec = tf.layers.flatten().apply(bookEmbedding) as tf.SymbolicTensor;
  const dotLayer = tf.layers.dot({ axes: -1 }).apply([userVec, bookVec]) as tf.SymbolicTensor;
  const out = tf.layers.activation({ activation: "sigmoid" }).apply(dotLayer) as tf.SymbolicTensor;

  const model = tf.model({ inputs: [userInput, bookInput], outputs: out });
  model.compile({ optimizer: tf.train.adam(0.01), loss: "binaryCrossentropy" });

  const xUser = tf.tensor2d(userIds, [userIds.length, 1], "int32");
  const xBook = tf.tensor2d(bookIds, [bookIds.length, 1], "int32");
  const yLabel = tf.tensor2d(labels, [labels.length, 1], "float32");

  let lastLoss: number | null = null;
  const history = await model.fit([xUser, xBook], yLabel, {
    epochs: DEFAULT_EPOCHS,
    batchSize: 64,
    shuffle: true,
    verbose: 0,
  });
  if (history.history.loss && history.history.loss.length > 0) {
    const v = history.history.loss[history.history.loss.length - 1];
    lastLoss = typeof v === "number" ? v : (v as tf.Scalar).dataSync()[0];
  }

  const userEmbWeights = model.getLayer("userEmb").getWeights()[0];
  const bookEmbWeights = model.getLayer("bookEmb").getWeights()[0];
  const userEmb = (await userEmbWeights.array()) as number[][];
  const bookEmb = (await bookEmbWeights.array()) as number[][];

  xUser.dispose();
  xBook.dispose();
  yLabel.dispose();
  model.dispose();

  // Hit-rate@K on held-out interactions.
  let hitRateAt10: number | null = null;
  if (heldOut.length > 0) {
    hitRateAt10 = evaluateHitRateAtK(userEmb, bookEmb, heldOut, positivesSet, EVAL_K);
    console.log(
      `[recommendation/cfModel] eval hitRate@${EVAL_K}=${hitRateAt10.toFixed(4)} (${heldOut.length} held-out)`,
    );
  }

  const meta: ModelMeta = {
    trainedAt: new Date().toISOString(),
    numUsers,
    numBooks,
    embeddingDim: dim,
    userIndex: dataset.userIndex,
    bookIndex: dataset.bookIndex,
    bookPopularity: dataset.bookPopularity,
    loss: lastLoss,
    epochs: DEFAULT_EPOCHS,
    hitRateAt10,
    evalSize: heldOut.length,
  };

  await ensureDir();
  // Atomic swap: write a single combined artifacts file via tmp + rename.
  const tmpFile = `${ARTIFACT_FILE}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpFile, JSON.stringify({ userEmb, bookEmb, meta }));
  await fs.rename(tmpFile, ARTIFACT_FILE);

  return { userEmb, bookEmb, meta };
}

export async function loadCFModel(): Promise<CFArtifacts | null> {
  try {
    const raw = await fs.readFile(ARTIFACT_FILE, "utf-8");
    const parsed = JSON.parse(raw) as CFArtifacts;
    if (!parsed.userEmb || !parsed.bookEmb || !parsed.meta) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function scoreUserAgainstAllBooks(
  art: CFArtifacts,
  userId: string,
): { bookId: string; score: number }[] {
  const uIdx = art.meta.userIndex[userId];
  const bookIds = Object.keys(art.meta.bookIndex);
  if (uIdx === undefined) {
    return bookIds
      .map((bid) => ({ bookId: bid, score: art.meta.bookPopularity[bid] || 0 }))
      .sort((a, b) => b.score - a.score);
  }
  const userVec = art.userEmb[uIdx];
  const scored = bookIds.map((bid) => {
    const bIdx = art.meta.bookIndex[bid];
    const bookVec = art.bookEmb[bIdx];
    const s = dot(userVec, bookVec);
    return { bookId: bid, score: 1 / (1 + Math.exp(-s)) };
  });
  return scored.sort((a, b) => b.score - a.score);
}

export function popularityRanking(
  art: CFArtifacts | null,
  allBookIds: string[],
): { bookId: string; score: number }[] {
  if (!art) return allBookIds.map((bid) => ({ bookId: bid, score: 0 }));
  return allBookIds
    .map((bid) => ({ bookId: bid, score: art.meta.bookPopularity[bid] || 0 }))
    .sort((a, b) => b.score - a.score);
}
