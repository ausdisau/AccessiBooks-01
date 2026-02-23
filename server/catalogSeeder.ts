import { db } from "./db";
import { books, type InsertBook } from "@shared/schema";
import { eq } from "drizzle-orm";

const LIBRIVOX_API_BASE = "https://librivox.org/api/feed/audiobooks";
const GUTENBERG_API_BASE = "https://gutendex.com";
const OPEN_LIBRARY_SEARCH_BASE = "https://openlibrary.org/search.json";
const INTERNET_ARCHIVE_SEARCH_BASE = "https://archive.org/advancedsearch.php";

const BATCH_SIZE = 100;
const LIBRIVOX_DELAY_MS = 1500;
const GUTENBERG_DELAY_MS = 2000;
const GUTENBERG_PAGE_SIZE = 32;
const OL_DELAY_MS = 1200;
const IA_DELAY_MS = 2000;

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
  openlibrary: SeederProgress;
  internetarchive: SeederProgress;
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
  openlibrary: createProgress("openlibrary"),
  internetarchive: createProgress("internetarchive"),
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
  const CHUNK = 50;
  for (let i = 0; i < booksToInsert.length; i += CHUNK) {
    const chunk = booksToInsert.slice(i, i + CHUNK);
    const values = chunk.map(book => ({
      ...book,
      id: `${book.source}-${book.sourceId}`,
    }));
    try {
      const result = await db.insert(books).values(values).onConflictDoNothing();
      const inserted = (result as any).rowCount ?? chunk.length;
      progress.totalInserted += inserted;
      progress.totalSkipped += chunk.length - inserted;
    } catch (err) {
      for (const book of chunk) {
        try {
          await db.insert(books).values({ ...book, id: `${book.source}-${book.sourceId}` }).onConflictDoNothing();
          progress.totalInserted++;
        } catch {
          progress.totalSkipped++;
        }
      }
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
    // Auto-resume: skip to approximate offset based on existing DB count
    if (progress.currentOffset === 0) {
      const countResult = await db.execute<{ count: string }>(
        `SELECT COUNT(*) as count FROM books WHERE source = 'librivox'`
      );
      const existingCount = parseInt(countResult.rows?.[0]?.count || "0");
      if (existingCount > 0) {
        progress.currentOffset = existingCount;
        console.log(`[Seeder] LibriVox: resuming from offset ${existingCount} (${existingCount} existing books)`);
      }
    }

    let emptyPages = 0;
    while (!abortSignal.aborted && emptyPages < 5) {
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

  // Auto-resume: skip to approximate page based on existing DB count
  if (progress.currentOffset === 0) {
    const countResult = await db.execute<{ count: string }>(
      `SELECT COUNT(*) as count FROM books WHERE source = 'gutenberg'`
    );
    const existingCount = parseInt(countResult.rows?.[0]?.count || "0");
    if (existingCount > 0) {
      progress.currentOffset = existingCount;
      console.log(`[Seeder] Gutenberg: resuming from page ~${Math.floor(existingCount / GUTENBERG_PAGE_SIZE) + 1} (${existingCount} existing books)`);
    }
  }

  const startPage = Math.floor(progress.currentOffset / GUTENBERG_PAGE_SIZE) + 1;

  try {
    let emptyPages = 0;
    let currentPage = startPage;
    while (!abortSignal.aborted && emptyPages < 5) {
      const url = `${GUTENBERG_API_BASE}/books?page=${currentPage}&languages=en`;
      console.log(`[Seeder] Gutenberg batch: page=${currentPage}`);

      try {
        const response = await fetchWithTimeout(url, 20000, abortSignal);
        if (!response.ok) {
          if (response.status === 429) {
            const backoffMs = Math.min(30000 * Math.pow(2, emptyPages), 120000);
            console.warn(`[Seeder] Gutenberg rate limited, waiting ${backoffMs / 1000}s...`);
            progress.lastError = "Rate limited - waiting";
            await delay(backoffMs, abortSignal);
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

const OL_SUBJECTS = [
  "fiction", "science_fiction", "mystery", "romance", "history", "biography",
  "philosophy", "poetry", "drama", "science", "fantasy", "horror", "adventure",
  "thriller", "children", "young_adult", "classic_literature", "psychology",
  "economics", "politics", "art", "music", "religion", "mathematics",
  "technology", "medicine", "law", "education", "travel", "cooking",
];

async function seedOpenLibrary(abortSignal: AbortSignal): Promise<void> {
  const progress = state.openlibrary;
  progress.status = "running";
  progress.startedAt = new Date().toISOString();
  progress.estimatedTotal = 15000;

  if (progress.currentOffset === 0) {
    const countResult = await db.execute<{ count: string }>(
      `SELECT COUNT(*) as count FROM books WHERE source = 'openlibrary'`
    );
    const existingCount = parseInt(countResult.rows?.[0]?.count || "0");
    if (existingCount > 0) {
      progress.currentOffset = existingCount;
      console.log(`[Seeder] OpenLibrary: resuming with ${existingCount} existing books`);
    }
  }

  const targetPerSubject = Math.ceil(15000 / OL_SUBJECTS.length);

  try {
    for (const subject of OL_SUBJECTS) {
      if (abortSignal.aborted) break;

      let offset = 0;
      let subjectCount = 0;
      let emptyPages = 0;

      while (!abortSignal.aborted && subjectCount < targetPerSubject && emptyPages < 3) {
        const url = `${OPEN_LIBRARY_SEARCH_BASE}?subject=${subject}&limit=100&offset=${offset}&fields=key,title,author_name,first_publish_year,subject,cover_i,number_of_pages_median,language`;
        console.log(`[Seeder] OpenLibrary: subject=${subject}, offset=${offset}`);

        try {
          const response = await fetchWithTimeout(url, 30000, abortSignal);
          if (!response.ok) {
            if (response.status === 429) {
              console.warn(`[Seeder] OpenLibrary rate limited, waiting 10s...`);
              await delay(10000, abortSignal);
              continue;
            }
            emptyPages++;
            offset += 100;
            await delay(OL_DELAY_MS, abortSignal);
            continue;
          }

          const data = await response.json();
          const docs = data.docs || [];

          if (docs.length === 0) {
            emptyPages++;
            offset += 100;
            continue;
          }

          emptyPages = 0;
          progress.totalFetched += docs.length;

          const batch: InsertBook[] = docs
            .filter((d: any) => d.title && d.key)
            .map((d: any) => {
              const olid = d.key?.replace("/works/", "") || "";
              const coverId = d.cover_i;
              const coverImage = coverId
                ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
                : null;
              const subjects = d.subject || [];
              const genre = subjects.length > 0
                ? subjects.slice(0, 2).join(", ")
                : subject.replace(/_/g, " ");

              return {
                title: d.title,
                author: d.author_name?.join(", ") || "Unknown Author",
                narrator: null,
                description: `Available on Open Library. ${genre}`,
                duration: 0,
                coverImage,
                audioUrl: null,
                contentUrl: `https://openlibrary.org${d.key}`,
                genre,
                publishedYear: d.first_publish_year || null,
                source: "openlibrary",
                sourceId: olid,
                totalTime: null,
                language: "English",
                contentType: "ebook" as const,
                isPremium: false,
                pageCount: d.number_of_pages_median || null,
              };
            });

          await insertBatch(batch, progress);
          subjectCount += batch.length;
          offset += 100;

          console.log(`[Seeder] OpenLibrary: subject=${subject}, fetched=${progress.totalFetched}, inserted=${progress.totalInserted}`);
          await delay(OL_DELAY_MS, abortSignal);
        } catch (err: any) {
          progress.lastError = err.message || "Unknown error";
          console.warn(`[Seeder] OpenLibrary error:`, err.message);
          await delay(OL_DELAY_MS * 3, abortSignal);
          offset += 100;
          emptyPages++;
        }
      }
    }

    progress.status = abortSignal.aborted ? "paused" : "completed";
  } catch (err: any) {
    progress.status = "error";
    progress.lastError = err.message || "Unknown error";
  }
  progress.updatedAt = new Date().toISOString();
}

const IA_QUERIES = [
  "mediatype:texts AND language:English AND subject:fiction",
  "mediatype:texts AND language:English AND subject:science",
  "mediatype:texts AND language:English AND subject:history",
  "mediatype:texts AND language:English AND subject:biography",
  "mediatype:texts AND language:English AND subject:philosophy",
  "mediatype:texts AND language:English AND subject:poetry",
  "mediatype:texts AND language:English AND subject:drama",
  "mediatype:texts AND language:English AND subject:mathematics",
  "mediatype:texts AND language:English AND subject:technology",
  "mediatype:audio AND subject:audiobook AND language:English",
];

async function seedInternetArchive(abortSignal: AbortSignal): Promise<void> {
  const progress = state.internetarchive;
  progress.status = "running";
  progress.startedAt = new Date().toISOString();
  progress.estimatedTotal = 8000;

  if (progress.currentOffset === 0) {
    const countResult = await db.execute<{ count: string }>(
      `SELECT COUNT(*) as count FROM books WHERE source = 'internet_archive'`
    );
    const existingCount = parseInt(countResult.rows?.[0]?.count || "0");
    if (existingCount > 0) {
      progress.currentOffset = existingCount;
      console.log(`[Seeder] InternetArchive: resuming with ${existingCount} existing books`);
    }
  }

  const targetPerQuery = Math.ceil(8000 / IA_QUERIES.length);

  try {
    for (const query of IA_QUERIES) {
      if (abortSignal.aborted) break;

      let page = 1;
      let queryCount = 0;
      let emptyPages = 0;
      const isAudio = query.includes("mediatype:audio");

      while (!abortSignal.aborted && queryCount < targetPerQuery && emptyPages < 3) {
        const encodedQuery = encodeURIComponent(query);
        const url = `${INTERNET_ARCHIVE_SEARCH_BASE}?q=${encodedQuery}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=description&fl[]=subject&fl[]=date&fl[]=mediatype&rows=100&page=${page}&output=json`;
        console.log(`[Seeder] InternetArchive: query=${query.substring(0, 40)}..., page=${page}`);

        try {
          const response = await fetchWithTimeout(url, 30000, abortSignal);
          if (!response.ok) {
            if (response.status === 429) {
              console.warn(`[Seeder] InternetArchive rate limited, waiting 15s...`);
              await delay(15000, abortSignal);
              continue;
            }
            emptyPages++;
            page++;
            await delay(IA_DELAY_MS, abortSignal);
            continue;
          }

          const data = await response.json();
          const docs = data.response?.docs || [];

          if (docs.length === 0) {
            emptyPages++;
            page++;
            continue;
          }

          emptyPages = 0;
          progress.totalFetched += docs.length;

          const batch: InsertBook[] = docs
            .filter((d: any) => d.title && d.identifier)
            .map((d: any) => {
              const subjects = Array.isArray(d.subject) ? d.subject : d.subject ? [d.subject] : [];
              const genre = subjects.length > 0
                ? subjects.slice(0, 2).join(", ")
                : "General";
              const year = d.date ? parseInt(d.date.substring(0, 4)) || null : null;
              const desc = typeof d.description === "string"
                ? d.description.substring(0, 500)
                : Array.isArray(d.description) ? d.description[0]?.substring(0, 500) : null;

              return {
                title: typeof d.title === "string" ? d.title : Array.isArray(d.title) ? d.title[0] : "Untitled",
                author: d.creator || "Unknown Author",
                narrator: isAudio ? "Internet Archive" : null,
                description: desc || `Available on Internet Archive. ${genre}`,
                duration: 0,
                coverImage: `https://archive.org/services/img/${d.identifier}`,
                audioUrl: isAudio ? `https://archive.org/download/${d.identifier}` : null,
                contentUrl: `https://archive.org/details/${d.identifier}`,
                genre,
                publishedYear: year,
                source: "internet_archive",
                sourceId: d.identifier,
                totalTime: null,
                language: "English",
                contentType: isAudio ? "audiobook" as const : "ebook" as const,
                isPremium: false,
                pageCount: null,
              };
            });

          await insertBatch(batch, progress);
          queryCount += batch.length;
          page++;

          console.log(`[Seeder] InternetArchive: fetched=${progress.totalFetched}, inserted=${progress.totalInserted}`);
          await delay(IA_DELAY_MS, abortSignal);
        } catch (err: any) {
          progress.lastError = err.message || "Unknown error";
          console.warn(`[Seeder] InternetArchive error:`, err.message);
          await delay(IA_DELAY_MS * 3, abortSignal);
          page++;
          emptyPages++;
        }
      }
    }

    progress.status = abortSignal.aborted ? "paused" : "completed";
  } catch (err: any) {
    progress.status = "error";
    progress.lastError = err.message || "Unknown error";
  }
  progress.updatedAt = new Date().toISOString();
}

type SeederSource = "librivox" | "gutenberg" | "openlibrary" | "internetarchive";
const ALL_SOURCES: SeederSource[] = ["librivox", "gutenberg", "openlibrary", "internetarchive"];

export function getSeederStatus() {
  return {
    librivox: { ...state.librivox },
    gutenberg: { ...state.gutenberg },
    openlibrary: { ...state.openlibrary },
    internetarchive: { ...state.internetarchive },
    isRunning: ALL_SOURCES.some(s => state[s].status === "running"),
  };
}

export async function startSeeding(sources: SeederSource[] = ALL_SOURCES): Promise<{ message: string }> {
  if (state.abortController && ALL_SOURCES.some(s => state[s].status === "running")) {
    return { message: "Seeding is already running" };
  }

  state.abortController = new AbortController();
  const signal = state.abortController.signal;

  const seedFns: Record<SeederSource, (s: AbortSignal) => Promise<void>> = {
    librivox: seedLibriVox,
    gutenberg: seedGutenberg,
    openlibrary: seedOpenLibrary,
    internetarchive: seedInternetArchive,
  };

  const promises: Promise<void>[] = [];
  for (const source of sources) {
    if (state[source].status !== "running") {
      promises.push(seedFns[source](signal));
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

export function resetSeeder(source?: SeederSource): { message: string } {
  if (source) {
    state[source] = createProgress(source);
    return { message: `Reset ${source} seeder progress` };
  }
  for (const s of ALL_SOURCES) {
    state[s] = createProgress(s);
  }
  state.abortController = null;
  return { message: "Reset all seeder progress" };
}

export async function getSeededBookCount(): Promise<Record<string, number>> {
  const result = await db.execute<{ source: string; count: string }>(
    `SELECT source, COUNT(*) as count FROM books GROUP BY source`
  );
  const counts: Record<string, number> = { total: 0 };
  for (const row of result.rows || []) {
    counts[row.source] = parseInt(row.count);
    counts.total += parseInt(row.count);
  }
  return counts;
}
