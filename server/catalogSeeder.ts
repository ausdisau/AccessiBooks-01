import { db } from "./db";
import { books, type InsertBook } from "@shared/schema";
import { eq } from "drizzle-orm";

const LIBRIVOX_API_BASE = "https://librivox.org/api/feed/audiobooks";
const GUTENBERG_API_BASE = "https://gutendex.com";

const BATCH_SIZE = 50;
const LIBRIVOX_DELAY_MS = 2000;
const GUTENBERG_DELAY_MS = 3000;
const GUTENBERG_PAGE_SIZE = 32;

interface SeederProgress {
  source: string;
  status: "idle" | "running" | "paused" | "completed" | "error";
  totalFetched: number;
  totalInserted: number;
  totalSkipped: number;
  currentOffset: number;
  lastError: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  estimatedTotal: number | null;
}

interface SeederState {
  librivox: SeederProgress;
  gutenberg: SeederProgress;
  abortController: AbortController | null;
}

function createProgress(source: string): SeederProgress {
  return {
    source,
    status: "idle",
    totalFetched: 0,
    totalInserted: 0,
    totalSkipped: 0,
    currentOffset: 0,
    lastError: null,
    startedAt: null,
    updatedAt: null,
    estimatedTotal: null,
  };
}

const state: SeederState = {
  librivox: createProgress("librivox"),
  gutenberg: createProgress("gutenberg"),
  abortController: null,
};

async function fetchWithTimeout(url: string, timeout = 20000, abortSignal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  if (abortSignal) {
    abortSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function delay(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) { resolve(); return; }
    const timer = setTimeout(resolve, ms);
    abortSignal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

interface LibriVoxBook {
  id: string;
  title: string;
  description: string;
  url_zip_file: string;
  totaltime: string;
  totaltimesecs: number | string;
  copyright_year: string;
  language: string;
  genres?: string[];
  authors: { first_name: string; last_name: string }[];
  sections: { listen_url: string; title: string; duration: string }[];
  url_librivox?: string;
}

interface GutenbergBook {
  id: number;
  title: string;
  authors: { name: string; birth_year: number | null; death_year: number | null }[];
  subjects: string[];
  languages: string[];
  formats: Record<string, string>;
  download_count: number;
}

function transformLibriVoxToInsert(lv: LibriVoxBook): InsertBook {
  const authorNames = lv.authors.map(a => `${a.first_name} ${a.last_name}`.trim()).join(", ");
  const audioUrl = lv.sections.length > 0 ? lv.sections[0].listen_url : lv.url_zip_file;
  const duration = typeof lv.totaltimesecs === "string" ? parseInt(lv.totaltimesecs) || 0 : lv.totaltimesecs || 0;

  return {
    title: lv.title,
    author: authorNames || "Unknown Author",
    narrator: "LibriVox Volunteers",
    description: lv.description || null,
    duration,
    coverImage: `https://archive.org/services/img/${lv.id}`,
    audioUrl: audioUrl || null,
    genre: lv.genres ? lv.genres.join(", ") : "Classic Literature",
    publishedYear: lv.copyright_year ? parseInt(lv.copyright_year) : null,
    source: "librivox",
    sourceId: lv.id,
    totalTime: lv.totaltime,
    language: lv.language || "English",
    contentType: "audiobook",
    isPremium: false,
    contentUrl: null,
    pageCount: null,
  };
}

function transformGutenbergToInsert(gb: GutenbergBook): InsertBook {
  const author = gb.authors.length > 0 ? gb.authors.map(a => a.name).join(", ") : "Unknown Author";
  const coverImage =
    gb.formats["image/jpeg"] ||
    `https://www.gutenberg.org/cache/epub/${gb.id}/pg${gb.id}.cover.medium.jpg`;
  const contentUrl =
    gb.formats["text/html; charset=utf-8"] ||
    gb.formats["text/html"] ||
    gb.formats["text/plain; charset=utf-8"] ||
    gb.formats["text/plain"] ||
    `https://www.gutenberg.org/ebooks/${gb.id}`;
  const genre = gb.subjects.length > 0 ? gb.subjects[0] : "Classic Literature";
  const langMap: Record<string, string> = { en: "English", fr: "French", de: "German", es: "Spanish", it: "Italian" };
  const language = gb.languages.length > 0 ? langMap[gb.languages[0]] || gb.languages[0] : "English";

  return {
    title: gb.title,
    author,
    narrator: null,
    description: `A classic from Project Gutenberg. ${gb.subjects.slice(0, 3).join(", ")}`,
    duration: 0,
    coverImage,
    audioUrl: null,
    contentUrl,
    genre,
    publishedYear: gb.authors[0]?.death_year ? gb.authors[0].death_year - 20 : null,
    source: "gutenberg",
    sourceId: gb.id.toString(),
    totalTime: null,
    language,
    contentType: "ebook",
    isPremium: false,
    pageCount: null,
  };
}

async function insertBatch(booksToInsert: InsertBook[], progress: SeederProgress): Promise<void> {
  for (const book of booksToInsert) {
    try {
      const sourceId = book.source === "librivox" ? `librivox-${book.sourceId}` : `gutenberg-${book.sourceId}`;
      const existing = await db.select({ id: books.id }).from(books).where(eq(books.id, sourceId)).limit(1);
      if (existing.length > 0) {
        progress.totalSkipped++;
        continue;
      }
      await db.insert(books).values({ ...book, id: sourceId }).onConflictDoNothing();
      progress.totalInserted++;
    } catch (err) {
      progress.totalSkipped++;
    }
  }
  progress.updatedAt = new Date().toISOString();
}

async function seedLibriVox(abortSignal: AbortSignal): Promise<void> {
  const progress = state.librivox;
  progress.status = "running";
  progress.startedAt = new Date().toISOString();
  progress.estimatedTotal = 18000;

  try {
    let emptyPages = 0;
    while (!abortSignal.aborted && emptyPages < 3) {
      const url = `${LIBRIVOX_API_BASE}?format=json&extended=1&limit=${BATCH_SIZE}&offset=${progress.currentOffset}`;
      console.log(`[Seeder] LibriVox batch: offset=${progress.currentOffset}`);

      try {
        const response = await fetchWithTimeout(url, 20000, abortSignal);
        if (!response.ok) {
          console.warn(`[Seeder] LibriVox API error: ${response.status}`);
          progress.lastError = `HTTP ${response.status}`;
          emptyPages++;
          await delay(LIBRIVOX_DELAY_MS * 2, abortSignal);
          progress.currentOffset += BATCH_SIZE;
          continue;
        }

        const data = await response.json();
        const lvBooks: LibriVoxBook[] = data.books || [];

        if (lvBooks.length === 0) {
          emptyPages++;
          progress.currentOffset += BATCH_SIZE;
          await delay(LIBRIVOX_DELAY_MS, abortSignal);
          continue;
        }

        emptyPages = 0;
        progress.totalFetched += lvBooks.length;

        const batch = lvBooks
          .filter(b => b.title && b.language === "English")
          .map(transformLibriVoxToInsert);

        await insertBatch(batch, progress);
        progress.currentOffset += BATCH_SIZE;

        console.log(`[Seeder] LibriVox: fetched=${progress.totalFetched}, inserted=${progress.totalInserted}, skipped=${progress.totalSkipped}`);
        await delay(LIBRIVOX_DELAY_MS, abortSignal);
      } catch (err: any) {
        progress.lastError = err.message || "Unknown error";
        console.warn(`[Seeder] LibriVox batch error:`, err.message);
        await delay(LIBRIVOX_DELAY_MS * 3, abortSignal);
        progress.currentOffset += BATCH_SIZE;
        emptyPages++;
      }
    }

    progress.status = abortSignal.aborted ? "paused" : "completed";
  } catch (err: any) {
    progress.status = "error";
    progress.lastError = err.message || "Unknown error";
  }
  progress.updatedAt = new Date().toISOString();
}

async function seedGutenberg(abortSignal: AbortSignal): Promise<void> {
  const progress = state.gutenberg;
  progress.status = "running";
  progress.startedAt = new Date().toISOString();
  progress.estimatedTotal = 70000;

  const startPage = Math.floor(progress.currentOffset / GUTENBERG_PAGE_SIZE) + 1;

  try {
    let emptyPages = 0;
    let currentPage = startPage;
    while (!abortSignal.aborted && emptyPages < 3) {
      const url = `${GUTENBERG_API_BASE}/books?page=${currentPage}&languages=en`;
      console.log(`[Seeder] Gutenberg batch: page=${currentPage}`);

      try {
        const response = await fetchWithTimeout(url, 20000, abortSignal);
        if (!response.ok) {
          if (response.status === 429) {
            console.warn(`[Seeder] Gutenberg rate limited, waiting 30s...`);
            progress.lastError = "Rate limited - waiting";
            await delay(30000, abortSignal);
            continue;
          }
          console.warn(`[Seeder] Gutenberg API error: ${response.status}`);
          progress.lastError = `HTTP ${response.status}`;
          emptyPages++;
          currentPage++;
          await delay(GUTENBERG_DELAY_MS * 2, abortSignal);
          continue;
        }

        const data = await response.json();
        const gbBooks: GutenbergBook[] = data.results || [];

        if (gbBooks.length === 0) {
          emptyPages++;
          currentPage++;
          await delay(GUTENBERG_DELAY_MS, abortSignal);
          continue;
        }

        emptyPages = 0;
        progress.totalFetched += gbBooks.length;

        const batch = gbBooks
          .filter(b => b.title && b.languages.includes("en"))
          .map(transformGutenbergToInsert);

        await insertBatch(batch, progress);
        progress.currentOffset = currentPage * GUTENBERG_PAGE_SIZE;
        currentPage++;

        console.log(`[Seeder] Gutenberg: page=${currentPage - 1}, fetched=${progress.totalFetched}, inserted=${progress.totalInserted}, skipped=${progress.totalSkipped}`);
        await delay(GUTENBERG_DELAY_MS, abortSignal);
      } catch (err: any) {
        progress.lastError = err.message || "Unknown error";
        console.warn(`[Seeder] Gutenberg batch error:`, err.message);
        await delay(GUTENBERG_DELAY_MS * 3, abortSignal);
        currentPage++;
        emptyPages++;
      }
    }

    progress.status = abortSignal.aborted ? "paused" : "completed";
  } catch (err: any) {
    progress.status = "error";
    progress.lastError = err.message || "Unknown error";
  }
  progress.updatedAt = new Date().toISOString();
}

export function getSeederStatus() {
  return {
    librivox: { ...state.librivox },
    gutenberg: { ...state.gutenberg },
    isRunning: state.librivox.status === "running" || state.gutenberg.status === "running",
  };
}

export async function startSeeding(sources: ("librivox" | "gutenberg")[] = ["librivox", "gutenberg"]): Promise<{ message: string }> {
  if (state.abortController && (state.librivox.status === "running" || state.gutenberg.status === "running")) {
    return { message: "Seeding is already running" };
  }

  state.abortController = new AbortController();
  const signal = state.abortController.signal;

  const promises: Promise<void>[] = [];

  if (sources.includes("librivox")) {
    if (state.librivox.status !== "running") {
      promises.push(seedLibriVox(signal));
    }
  }

  if (sources.includes("gutenberg")) {
    if (state.gutenberg.status !== "running") {
      promises.push(seedGutenberg(signal));
    }
  }

  Promise.all(promises).then(() => {
    console.log("[Seeder] All seeding tasks finished");
  });

  return { message: `Started seeding: ${sources.join(", ")}` };
}

export function stopSeeding(): { message: string } {
  if (state.abortController) {
    state.abortController.abort();
    state.abortController = null;
    return { message: "Seeding stopped" };
  }
  return { message: "No seeding in progress" };
}

export function resetSeeder(source?: "librivox" | "gutenberg"): { message: string } {
  if (source) {
    state[source] = createProgress(source);
    return { message: `Reset ${source} seeder progress` };
  }
  state.librivox = createProgress("librivox");
  state.gutenberg = createProgress("gutenberg");
  state.abortController = null;
  return { message: "Reset all seeder progress" };
}

export async function getSeededBookCount(): Promise<{ librivox: number; gutenberg: number; total: number }> {
  const [lvCount] = await db
    .select({ count: eq(books.source, "librivox") })
    .from(books)
    .where(eq(books.source, "librivox"));
  const [gbCount] = await db
    .select({ count: eq(books.source, "gutenberg") })
    .from(books)
    .where(eq(books.source, "gutenberg"));

  const lvResult = await db.execute<{ count: string }>(
    `SELECT COUNT(*) as count FROM books WHERE source = 'librivox'`
  );
  const gbResult = await db.execute<{ count: string }>(
    `SELECT COUNT(*) as count FROM books WHERE source = 'gutenberg'`
  );
  const totalResult = await db.execute<{ count: string }>(
    `SELECT COUNT(*) as count FROM books`
  );

  return {
    librivox: parseInt(lvResult.rows?.[0]?.count || "0"),
    gutenberg: parseInt(gbResult.rows?.[0]?.count || "0"),
    total: parseInt(totalResult.rows?.[0]?.count || "0"),
  };
}
