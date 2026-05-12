import { loadInteractions } from "./dataPrep";
import { trainCFModel } from "./cfModel";
import { invalidateModelCache } from "./candidateService";

export interface TrainStatus {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  trained: boolean;
  numUsers: number;
  numBooks: number;
  loss: number | null;
  inProgress: boolean;
}

const status: TrainStatus = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  trained: false,
  numUsers: 0,
  numBooks: 0,
  loss: null,
  inProgress: false,
};

let intervalHandle: NodeJS.Timeout | null = null;

export function getTrainStatus(): TrainStatus {
  return { ...status };
}

export async function runTraining(): Promise<TrainStatus> {
  if (status.inProgress) return getTrainStatus();
  status.inProgress = true;
  status.lastRunAt = new Date().toISOString();
  try {
    const dataset = await loadInteractions();
    if (dataset.interactions.length === 0) {
      status.lastError = "No listening history available";
      status.trained = false;
    } else {
      const art = await trainCFModel(dataset);
      if (!art) {
        status.lastError = "Insufficient data";
        status.trained = false;
      } else {
        status.trained = true;
        status.lastSuccessAt = new Date().toISOString();
        status.lastError = null;
        status.numUsers = art.meta.numUsers;
        status.numBooks = art.meta.numBooks;
        status.loss = art.meta.loss;
        invalidateModelCache();
        console.log(`[recommendation/scheduler] Training complete: users=${art.meta.numUsers} books=${art.meta.numBooks} loss=${art.meta.loss}`);
      }
    }
  } catch (err) {
    status.lastError = (err as Error).message;
    status.trained = false;
    console.warn("[recommendation/scheduler] Training failed:", status.lastError);
  } finally {
    status.inProgress = false;
  }
  return getTrainStatus();
}

const DEFAULT_INTERVAL_MS = Number(process.env.REC_TRAIN_INTERVAL_MS) || 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = Number(process.env.REC_TRAIN_STARTUP_MS) || 30 * 1000;

export function startScheduler() {
  if (intervalHandle) return;
  setTimeout(() => {
    runTraining().catch((e) => console.warn("[recommendation/scheduler] startup train error:", e));
  }, STARTUP_DELAY_MS);
  intervalHandle = setInterval(() => {
    runTraining().catch((e) => console.warn("[recommendation/scheduler] interval train error:", e));
  }, DEFAULT_INTERVAL_MS);
  console.log(`[recommendation/scheduler] Started; interval=${DEFAULT_INTERVAL_MS}ms`);
}

export function stopScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
