import * as tf from "@tensorflow/tfjs";
import { promises as fs } from "fs";
import path from "path";
import type { InteractionDataset } from "./dataPrep";

const MODEL_DIR = path.join(process.cwd(), ".private", "rec-model");
const MODEL_FILE = path.join(MODEL_DIR, "model.json");
const META_FILE = path.join(MODEL_DIR, "meta.json");

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
}

export interface CFArtifacts {
  userEmb: number[][]; // [numUsers, dim]
  bookEmb: number[][]; // [numBooks, dim]
  meta: ModelMeta;
}

const DEFAULT_DIM = 16;
const DEFAULT_EPOCHS = 8;
const NEG_PER_POS = 2;

async function ensureDir() {
  await fs.mkdir(MODEL_DIR, { recursive: true });
}

export async function trainCFModel(dataset: InteractionDataset): Promise<CFArtifacts | null> {
  if (dataset.interactions.length < 10 || dataset.numUsers < 2 || dataset.numBooks < 2) {
    console.log("[recommendation/cfModel] Not enough data to train CF model.");
    return null;
  }

  const dim = DEFAULT_DIM;
  const numUsers = dataset.numUsers;
  const numBooks = dataset.numBooks;

  // Build training tensors with negative sampling.
  const userIds: number[] = [];
  const bookIds: number[] = [];
  const labels: number[] = [];

  const positivesSet = new Set<string>();
  for (const it of dataset.interactions) {
    const u = dataset.userIndex[it.userId];
    const b = dataset.bookIndex[it.bookId];
    userIds.push(u);
    bookIds.push(b);
    labels.push(Math.min(1, Math.max(0.5, it.weight)));
    positivesSet.add(`${u}:${b}`);
  }

  for (const it of dataset.interactions) {
    const u = dataset.userIndex[it.userId];
    for (let n = 0; n < NEG_PER_POS; n++) {
      let neg = Math.floor(Math.random() * numBooks);
      let tries = 0;
      while (positivesSet.has(`${u}:${neg}`) && tries < 5) {
        neg = Math.floor(Math.random() * numBooks);
        tries++;
      }
      userIds.push(u);
      bookIds.push(neg);
      labels.push(0);
    }
  }

  const userInput = tf.input({ shape: [1], dtype: "int32", name: "user" });
  const bookInput = tf.input({ shape: [1], dtype: "int32", name: "book" });

  const userEmbedding = tf.layers.embedding({ inputDim: numUsers, outputDim: dim, embeddingsInitializer: "randomNormal", name: "userEmb" }).apply(userInput) as tf.SymbolicTensor;
  const bookEmbedding = tf.layers.embedding({ inputDim: numBooks, outputDim: dim, embeddingsInitializer: "randomNormal", name: "bookEmb" }).apply(bookInput) as tf.SymbolicTensor;

  const userVec = tf.layers.flatten().apply(userEmbedding) as tf.SymbolicTensor;
  const bookVec = tf.layers.flatten().apply(bookEmbedding) as tf.SymbolicTensor;
  const dot = tf.layers.dot({ axes: -1 }).apply([userVec, bookVec]) as tf.SymbolicTensor;
  const out = tf.layers.activation({ activation: "sigmoid" }).apply(dot) as tf.SymbolicTensor;

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
  };

  await ensureDir();
  await fs.writeFile(MODEL_FILE, JSON.stringify({ userEmb, bookEmb }));
  await fs.writeFile(META_FILE, JSON.stringify(meta));

  return { userEmb, bookEmb, meta };
}

export async function loadCFModel(): Promise<CFArtifacts | null> {
  try {
    const [modelRaw, metaRaw] = await Promise.all([
      fs.readFile(MODEL_FILE, "utf-8"),
      fs.readFile(META_FILE, "utf-8"),
    ]);
    const m = JSON.parse(modelRaw);
    const meta = JSON.parse(metaRaw) as ModelMeta;
    return { userEmb: m.userEmb, bookEmb: m.bookEmb, meta };
  } catch {
    return null;
  }
}

export function scoreUserAgainstAllBooks(art: CFArtifacts, userId: string): { bookId: string; score: number }[] {
  const uIdx = art.meta.userIndex[userId];
  const bookIds = Object.keys(art.meta.bookIndex);
  if (uIdx === undefined) {
    // Cold-start: return popularity ranking
    return bookIds
      .map((bid) => ({ bookId: bid, score: art.meta.bookPopularity[bid] || 0 }))
      .sort((a, b) => b.score - a.score);
  }
  const userVec = art.userEmb[uIdx];
  const scored = bookIds.map((bid) => {
    const bIdx = art.meta.bookIndex[bid];
    const bookVec = art.bookEmb[bIdx];
    let s = 0;
    for (let i = 0; i < userVec.length; i++) s += userVec[i] * bookVec[i];
    // sigmoid
    const sig = 1 / (1 + Math.exp(-s));
    return { bookId: bid, score: sig };
  });
  return scored.sort((a, b) => b.score - a.score);
}

export function popularityRanking(art: CFArtifacts | null, allBookIds: string[]): { bookId: string; score: number }[] {
  if (!art) return allBookIds.map((bid) => ({ bookId: bid, score: 0 }));
  return allBookIds
    .map((bid) => ({ bookId: bid, score: art.meta.bookPopularity[bid] || 0 }))
    .sort((a, b) => b.score - a.score);
}
