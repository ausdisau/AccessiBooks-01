import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Lightweight local playback-progress persistence, used so downloaded titles
 * can resume where the listener left off while offline. We persist only an
 * integer second offset per book id. There is no server-side listening-progress
 * endpoint in this codebase, so this is intentionally local-only (see the
 * Task #220 drift note) rather than a fake "sync when back online".
 */
const keyFor = (bookId: string) => `accessibooks:progress:${bookId}`;

export async function saveProgress(
  bookId: string,
  positionSec: number,
): Promise<void> {
  try {
    if (!bookId) return;
    if (positionSec > 2) {
      await AsyncStorage.setItem(keyFor(bookId), String(Math.floor(positionSec)));
    }
  } catch {
    /* storage unavailable — resume just won't be offered */
  }
}

export async function loadProgress(bookId: string): Promise<number> {
  try {
    if (!bookId) return 0;
    const v = await AsyncStorage.getItem(keyFor(bookId));
    const n = v ? parseInt(v, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function clearProgress(bookId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(bookId));
  } catch {
    /* ignore */
  }
}
