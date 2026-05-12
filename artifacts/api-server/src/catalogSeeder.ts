import { db } from "./db";
import { books, seederProgress, type InsertBook } from "@workspace/db";
import { eq } from "drizzle-orm";

const LIBRIVOX_API_BASE = "https://librivox.org/api/feed/audiobooks";
const GUTENBERG_API_BASE = "https://gutendex.com";
const OPEN_LIBRARY_SEARCH_BASE = "https://openlibrary.org/search.json";
const INTERNET_ARCHIVE_SEARCH_BASE = "https://archive.org/advancedsearch.php";

const BATCH_SIZE = 100;
const LIBRIVOX_DELAY_MS = 1500;
const GUTENBERG_BASE_DELAY_MS = 1500;
const GUTENBERG_PAGE_SIZE = 32;
const OL_DELAY_MS = 1200;
const IA_DELAY_MS = 2000;
const PROGRESS_SAVE_INTERVAL = 10;
const LOG_INTERVAL_MS = 5 * 60 * 1000;

type SeederSource = "librivox" | "gutenberg" | "openlibrary" | "internetarchive";
const ALL_SOURCES: SeederSource[] = ["librivox", "gutenberg", "openlibrary", "internetarchive"];

interface SeederProgress {
  source: string;
  status: "idle" | "running" | "paused" | "completed" | "error";
  totalFetched: number;
  totalInserted: number;
  totalSkipped: number;
  totalDeduped: number;
  currentOffset: number;
  subjectIndex: number;
  nextUrl: string | null;
  lastError: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  estimatedTotal: number | null;
  ratePerMinute: number;
  lastLogTime: number;
  batchesSinceLastSave: number;
}

interface SeederState {
  librivox: SeederProgress;
  gutenberg: SeederProgress;
  openlibrary: SeederProgress;
  internetarchive: SeederProgress;
  abortControllers: Record<SeederSource, AbortController | null>;
  seenIds: Record<SeederSource, Set<string>>;
}

function createProgress(source: string): SeederProgress {
  return {
    source,
    status: "idle",
    totalFetched: 0,
    totalInserted: 0,
    totalSkipped: 0,
    totalDeduped: 0,
    currentOffset: 0,
    subjectIndex: 0,
    nextUrl: null,
    lastError: null,
    startedAt: null,
    updatedAt: null,
    estimatedTotal: null,
    ratePerMinute: 0,
    lastLogTime: 0,
    batchesSinceLastSave: 0,
  };
}

const state: SeederState = {
  librivox: createProgress("librivox"),
  gutenberg: createProgress("gutenberg"),
  openlibrary: createProgress("openlibrary"),
  internetarchive: createProgress("internetarchive"),
  abortControllers: { librivox: null, gutenberg: null, openlibrary: null, internetarchive: null },
  seenIds: { librivox: new Set(), gutenberg: new Set(), openlibrary: new Set(), internetarchive: new Set() },
};

async function fetchWithTimeout(url: string, timeout = 20000, abortSignal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  if (abortSignal) {
    abortSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function delay(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (abortSignal?.aborted) { resolve(); return; }
    const timer = setTimeout(resolve, ms);
    abortSignal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

function isValidTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const trimmed = title.trim();
  if (trimmed.length < 3) return false;
  if (/^[^a-zA-Z0-9]+$/.test(trimmed)) return false;
  if (trimmed.toLowerCase() === "untitled") return false;
  return true;
}

function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function shouldLog(progress: SeederProgress): boolean {
  const now = Date.now();
  if (now - progress.lastLogTime >= LOG_INTERVAL_MS) {
    progress.lastLogTime = now;
    return true;
  }
  return false;
}

function updateRate(progress: SeederProgress): void {
  if (!progress.startedAt) return;
  const elapsed = (Date.now() - new Date(progress.startedAt).getTime()) / 60000;
  if (elapsed > 0) {
    progress.ratePerMinute = Math.round(progress.totalInserted / elapsed);
  }
}

async function saveProgressToDB(source: SeederSource, progress: SeederProgress): Promise<void> {
  try {
    await db.insert(seederProgress).values({
      source,
      currentOffset: progress.currentOffset,
      subjectIndex: progress.subjectIndex,
      nextUrl: progress.nextUrl,
      status: progress.status,
      totalInserted: progress.totalInserted,
      lastError: progress.lastError,
    }).onConflictDoUpdate({
      target: seederProgress.source,
      set: {
        currentOffset: progress.currentOffset,
        subjectIndex: progress.subjectIndex,
        nextUrl: progress.nextUrl,
        status: progress.status,
        totalInserted: progress.totalInserted,
        lastError: progress.lastError,
        updatedAt: new Date(),
      },
    });
  } catch (err: any) {
    console.warn(`[Seeder] Failed to save progress for ${source}:`, err.message);
  }
}

async function loadProgressFromDB(source: SeederSource): Promise<{
  currentOffset: number;
  subjectIndex: number;
  nextUrl: string | null;
  totalInserted: number;
} | null> {
  try {
    const rows = await db.select().from(seederProgress).where(eq(seederProgress.source, source)).limit(1);
    if (rows.length > 0) {
      return {
        currentOffset: rows[0].currentOffset,
        subjectIndex: rows[0].subjectIndex,
        nextUrl: rows[0].nextUrl,
        totalInserted: rows[0].totalInserted,
      };
    }
  } catch (err: any) {
    console.warn(`[Seeder] Failed to load progress for ${source}:`, err.message);
  }
  return null;
}

async function maybeSaveProgress(source: SeederSource, progress: SeederProgress): Promise<void> {
  progress.batchesSinceLastSave++;
  if (progress.batchesSinceLastSave >= PROGRESS_SAVE_INTERVAL) {
    await saveProgressToDB(source, progress);
    progress.batchesSinceLastSave = 0;
  }
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

async function insertBatch(booksToInsert: InsertBook[], progress: SeederProgress, seenIds: Set<string>): Promise<void> {
  const deduped = booksToInsert.filter(book => {
    const key = `${book.source}-${book.sourceId}`;
    if (seenIds.has(key)) {
      progress.totalDeduped++;
      return false;
    }
    seenIds.add(key);
    return true;
  });

  if (deduped.length === 0) return;

  const filtered = deduped.filter(book => {
    if (!isValidTitle(book.title)) return false;
    if (!book.audioUrl && !book.contentUrl) return false;
    if (book.audioUrl && !isValidUrl(book.audioUrl)) return false;
    if (book.contentUrl && !isValidUrl(book.contentUrl)) return false;
    return true;
  });

  if (filtered.length === 0) return;

  const CHUNK = 50;
  for (let i = 0; i < filtered.length; i += CHUNK) {
    const chunk = filtered.slice(i, i + CHUNK);
    const values = chunk.map(book => ({
      ...book,
      id: `${book.source}-${book.sourceId}`,
    }));
    try {
      const result = await db.insert(books).values(values).onConflictDoNothing();
      const inserted = (result as any).rowCount ?? chunk.length;
      progress.totalInserted += inserted;
      progress.totalSkipped += chunk.length - inserted;
    } catch {
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
  updateRate(progress);
}

async function seedLibriVox(abortSignal: AbortSignal): Promise<void> {
  const progress = state.librivox;
  const seenIds = state.seenIds.librivox;
  progress.status = "running";
  progress.startedAt = new Date().toISOString();
  progress.lastLogTime = Date.now();
  progress.estimatedTotal = 30000;

  try {
    const saved = await loadProgressFromDB("librivox");
    if (saved && saved.currentOffset > 0) {
      progress.currentOffset = saved.currentOffset;
      progress.totalInserted = saved.totalInserted;
      console.log(`[Seeder] LibriVox: resuming from DB progress, offset=${saved.currentOffset}`);
    } else if (progress.currentOffset === 0) {
      const countResult = await db.execute<{ count: string }>(
        `SELECT COUNT(*) as count FROM books WHERE source = 'librivox'`
      );
      const existingCount = parseInt(countResult.rows?.[0]?.count || "0");
      if (existingCount > 0) {
        progress.currentOffset = existingCount;
        console.log(`[Seeder] LibriVox: resuming from DB count ${existingCount}`);
      }
    }

    let emptyPages = 0;
    while (!abortSignal.aborted && emptyPages < 5) {
      const url = `${LIBRIVOX_API_BASE}?format=json&extended=1&limit=${BATCH_SIZE}&offset=${progress.currentOffset}`;

      try {
        const response = await fetchWithTimeout(url, 20000, abortSignal);
        if (!response.ok) {
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

        await insertBatch(batch, progress, seenIds);
        progress.currentOffset += BATCH_SIZE;
        await maybeSaveProgress("librivox", progress);

        if (shouldLog(progress)) {
          console.log(`[Seeder] LibriVox: offset=${progress.currentOffset}, inserted=${progress.totalInserted}, deduped=${progress.totalDeduped}, rate=${progress.ratePerMinute}/min`);
        }
        await delay(LIBRIVOX_DELAY_MS, abortSignal);
      } catch (err: any) {
        progress.lastError = err.message || "Unknown error";
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
  await saveProgressToDB("librivox", progress);
  console.log(`[Seeder] LibriVox finished: status=${progress.status}, inserted=${progress.totalInserted}, deduped=${progress.totalDeduped}`);
}

async function seedGutenberg(abortSignal: AbortSignal): Promise<void> {
  const progress = state.gutenberg;
  const seenIds = state.seenIds.gutenberg;
  progress.status = "running";
  progress.startedAt = new Date().toISOString();
  progress.lastLogTime = Date.now();
  progress.estimatedTotal = 100000;

  const saved = await loadProgressFromDB("gutenberg");
  if (saved) {
    if (saved.nextUrl) {
      progress.nextUrl = saved.nextUrl;
      progress.currentOffset = saved.currentOffset;
      progress.totalInserted = saved.totalInserted;
      console.log(`[Seeder] Gutenberg: resuming from DB progress, nextUrl present`);
    } else if (saved.currentOffset > 0) {
      progress.currentOffset = saved.currentOffset;
      progress.totalInserted = saved.totalInserted;
      console.log(`[Seeder] Gutenberg: resuming from DB progress, offset=${saved.currentOffset}`);
    }
  }

  if (progress.currentOffset === 0 && !progress.nextUrl) {
    const countResult = await db.execute<{ count: string }>(
      `SELECT COUNT(*) as count FROM books WHERE source = 'gutenberg'`
    );
    const existingCount = parseInt(countResult.rows?.[0]?.count || "0");
    if (existingCount > 0) {
      progress.currentOffset = existingCount;
      console.log(`[Seeder] Gutenberg: resuming from DB count ${existingCount}`);
    }
  }

  let currentUrl = progress.nextUrl ||
    `${GUTENBERG_API_BASE}/books?page=${Math.floor(progress.currentOffset / GUTENBERG_PAGE_SIZE) + 1}&languages=en`;

  try {
    let emptyPages = 0;
    let rateLimitRetries = 0;
    let adaptiveDelay = GUTENBERG_BASE_DELAY_MS;

    while (!abortSignal.aborted && emptyPages < 5) {
      try {
        const fetchStart = Date.now();
        const response = await fetchWithTimeout(currentUrl, 25000, abortSignal);
        const fetchDuration = Date.now() - fetchStart;

        if (fetchDuration < 500) {
          adaptiveDelay = Math.max(1000, adaptiveDelay - 200);
        } else if (fetchDuration > 2000) {
          adaptiveDelay = Math.min(4000, adaptiveDelay + 500);
        }

        if (!response.ok) {
          if (response.status === 429) {
            rateLimitRetries++;
            const jitter = Math.random() * 5000;
            const backoffMs = Math.min(30000 * Math.pow(2, rateLimitRetries - 1), 180000) + jitter;
            console.warn(`[Seeder] Gutenberg rate limited (attempt ${rateLimitRetries}), waiting ${Math.round(backoffMs / 1000)}s...`);
            progress.lastError = `Rate limited - retry ${rateLimitRetries}`;
            await delay(backoffMs, abortSignal);
            continue;
          }
          progress.lastError = `HTTP ${response.status}`;
          emptyPages++;
          await delay(adaptiveDelay * 2, abortSignal);
          continue;
        }

        rateLimitRetries = 0;
        const data = await response.json();
        const gbBooks: GutenbergBook[] = data.results || [];
        const nextPageUrl: string | null = data.next || null;

        if (gbBooks.length === 0) {
          emptyPages++;
          if (nextPageUrl) {
            currentUrl = nextPageUrl;
          } else {
            break;
          }
          await delay(adaptiveDelay, abortSignal);
          continue;
        }

        emptyPages = 0;
        progress.totalFetched += gbBooks.length;

        const batch = gbBooks
          .filter(b => b.title && b.languages.includes("en"))
          .map(transformGutenbergToInsert);

        await insertBatch(batch, progress, seenIds);
        progress.currentOffset += gbBooks.length;
        progress.nextUrl = nextPageUrl;

        if (nextPageUrl) {
          currentUrl = nextPageUrl;
        } else {
          break;
        }

        await maybeSaveProgress("gutenberg", progress);

        if (shouldLog(progress)) {
          console.log(`[Seeder] Gutenberg: offset=${progress.currentOffset}, inserted=${progress.totalInserted}, deduped=${progress.totalDeduped}, rate=${progress.ratePerMinute}/min, delay=${adaptiveDelay}ms`);
        }
        await delay(adaptiveDelay, abortSignal);
      } catch (err: any) {
        progress.lastError = err.message || "Unknown error";
        await delay(adaptiveDelay * 3, abortSignal);
        emptyPages++;
      }
    }

    progress.status = abortSignal.aborted ? "paused" : "completed";
  } catch (err: any) {
    progress.status = "error";
    progress.lastError = err.message || "Unknown error";
  }
  progress.updatedAt = new Date().toISOString();
  await saveProgressToDB("gutenberg", progress);
  console.log(`[Seeder] Gutenberg finished: status=${progress.status}, inserted=${progress.totalInserted}, deduped=${progress.totalDeduped}`);
}

const OL_SUBJECTS = [
  // Original 68
  "fiction", "science_fiction", "mystery", "romance", "history", "biography",
  "philosophy", "poetry", "drama", "science", "fantasy", "horror", "adventure",
  "thriller", "children", "young_adult", "classic_literature", "psychology",
  "economics", "politics", "art", "music", "religion", "mathematics",
  "technology", "medicine", "law", "education", "travel", "cooking",
  "nature", "sports", "architecture", "business", "sociology", "anthropology",
  "linguistics", "astronomy", "physics", "chemistry", "biology", "geology",
  "engineering", "computer_science", "graphic_novels", "humor", "essays",
  "memoir", "true_crime", "self_help", "spirituality", "mythology",
  "folk_tales", "war", "journalism", "environment", "agriculture",
  "crafts", "gardening", "pets", "parenting", "health", "fitness",
  "dance", "theater", "film", "photography", "design", "fashion",
  // Expanded literature & fiction
  "american_literature", "british_literature", "french_literature",
  "russian_literature", "german_literature", "african_literature",
  "asian_literature", "world_literature", "short_stories", "novellas",
  "literary_criticism", "folklore", "fairy_tales", "legends", "fables",
  "epics", "satire", "gothic", "noir", "western", "spy_fiction",
  "dystopian", "utopian", "alternate_history", "steampunk", "cyberpunk",
  "space_opera", "military_fiction", "historical_fiction", "magical_realism",
  "detective_fiction", "crime_fiction", "legal_thriller", "supernatural",
  "paranormal", "occult", "ghosts",
  // History expansions
  "civil_war", "world_war_1", "world_war_2", "american_revolution",
  "french_revolution", "industrial_revolution", "renaissance",
  "medieval_history", "ancient_history", "roman_history", "greek_history",
  "egyptian_history", "chinese_history", "japanese_history", "indian_history",
  "african_history", "islamic_history", "jewish_history",
  "military_history", "naval_history", "economic_history", "social_history",
  "cultural_history", "art_history", "music_history", "local_history",
  "genealogy", "archaeology", "colonial_history",
  // Science expansions
  "paleontology", "genetics", "evolution", "neuroscience", "cognitive_science",
  "nanotechnology", "quantum_physics", "particle_physics", "cosmology",
  "astrophysics", "meteorology", "climate", "ecology", "marine_biology",
  "botany", "zoology", "microbiology", "virology", "anatomy", "physiology",
  "pharmacology", "epidemiology", "forensic_science", "criminology",
  // Social sciences & humanities
  "labor_history", "immigration", "feminism", "disability_studies",
  "urban_studies", "rural_studies", "international_relations", "diplomacy",
  "human_rights", "civil_rights", "abolitionism", "colonialism",
  "nationalism", "ethics", "logic", "epistemology", "metaphysics",
  "aesthetics", "existentialism", "pragmatism",
  // Religion & spirituality
  "hinduism", "buddhism", "christianity", "islam", "judaism",
  "mysticism", "meditation", "yoga",
  // Health & lifestyle
  "nursing", "public_health", "nutrition", "psychiatry", "dentistry",
  "veterinary", "mental_health",
  // Arts & performance
  "music_theory", "opera", "jazz", "classical_music", "folk_music",
  "ballet", "film_making", "television", "radio",
  // Hobbies & crafts
  "woodworking", "quilting", "sewing", "knitting", "drawing",
  "sculpture", "printmaking", "chess", "mountaineering", "sailing",
  "fishing", "automobiles", "aviation", "railroads",
  // Additional broad subjects
  "publishing", "libraries", "museums", "cultural_heritage",
  "energy", "transportation", "food_security", "sustainable_development",
  "poverty", "housing", "terrorism", "espionage",
  "capitalism", "anarchism", "marxism",
];

async function seedOpenLibrary(abortSignal: AbortSignal): Promise<void> {
  const progress = state.openlibrary;
  const seenIds = state.seenIds.openlibrary;
  progress.status = "running";
  progress.startedAt = new Date().toISOString();
  progress.lastLogTime = Date.now();
  progress.estimatedTotal = 700000;

  const saved = await loadProgressFromDB("openlibrary");
  if (saved) {
    progress.subjectIndex = saved.subjectIndex;
    progress.currentOffset = saved.currentOffset;
    progress.totalInserted = saved.totalInserted;
    if (saved.subjectIndex > 0) {
      console.log(`[Seeder] OpenLibrary: resuming from subject index ${saved.subjectIndex} (${OL_SUBJECTS[saved.subjectIndex] || 'end'})`);
    }
  }

  if (progress.subjectIndex === 0 && progress.currentOffset === 0) {
    const countResult = await db.execute<{ count: string }>(
      `SELECT COUNT(*) as count FROM books WHERE source = 'openlibrary'`
    );
    const existingCount = parseInt(countResult.rows?.[0]?.count || "0");
    if (existingCount > 0) {
      progress.currentOffset = existingCount;
      console.log(`[Seeder] OpenLibrary: ${existingCount} existing books`);
    }
  }

  // Allow up to 5000 books per subject (vs old ~588) to reach 1M total
  const targetPerSubject = 5000;

  try {
    for (let si = progress.subjectIndex; si < OL_SUBJECTS.length; si++) {
      if (abortSignal.aborted) break;
      const subject = OL_SUBJECTS[si];
      progress.subjectIndex = si;

      let offset = 0;
      let subjectCount = 0;
      let emptyPages = 0;

      while (!abortSignal.aborted && subjectCount < targetPerSubject && emptyPages < 3) {
        const url = `${OPEN_LIBRARY_SEARCH_BASE}?subject=${subject}&limit=100&offset=${offset}&fields=key,title,author_name,first_publish_year,subject,cover_i,number_of_pages_median`;

        try {
          const response = await fetchWithTimeout(url, 30000, abortSignal);
          if (!response.ok) {
            if (response.status === 429) {
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

          await insertBatch(batch, progress, seenIds);
          subjectCount += batch.length;
          offset += 100;
          await maybeSaveProgress("openlibrary", progress);

          if (shouldLog(progress)) {
            console.log(`[Seeder] OpenLibrary: subject=${subject} (${si + 1}/${OL_SUBJECTS.length}), inserted=${progress.totalInserted}, deduped=${progress.totalDeduped}, rate=${progress.ratePerMinute}/min`);
          }
          await delay(OL_DELAY_MS, abortSignal);
        } catch (err: any) {
          progress.lastError = err.message || "Unknown error";
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
  await saveProgressToDB("openlibrary", progress);
  console.log(`[Seeder] OpenLibrary finished: status=${progress.status}, inserted=${progress.totalInserted}, deduped=${progress.totalDeduped}`);
}

const IA_QUERIES = [
  // Original 25 subject queries
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
  "mediatype:texts AND language:English AND subject:adventure",
  "mediatype:texts AND language:English AND subject:fantasy",
  "mediatype:texts AND language:English AND subject:romance",
  "mediatype:texts AND language:English AND subject:mystery",
  "mediatype:texts AND language:English AND subject:horror",
  "mediatype:texts AND language:English AND subject:children",
  "mediatype:texts AND language:English AND subject:education",
  "mediatype:texts AND language:English AND subject:religion",
  "mediatype:texts AND language:English AND subject:art",
  "mediatype:texts AND language:English AND subject:music",
  "mediatype:texts AND language:English AND subject:psychology",
  "mediatype:texts AND language:English AND subject:economics",
  "mediatype:texts AND language:English AND subject:law",
  "mediatype:texts AND language:English AND subject:medicine",
  "mediatype:audio AND subject:poetry AND language:English",
  // Decade-based sweeps — non-overlapping, high-yield
  "mediatype:texts AND language:English AND date:[1800-01-01 TO 1850-12-31]",
  "mediatype:texts AND language:English AND date:[1850-01-01 TO 1900-12-31]",
  "mediatype:texts AND language:English AND date:[1900-01-01 TO 1930-12-31]",
  "mediatype:texts AND language:English AND date:[1930-01-01 TO 1960-12-31]",
  "mediatype:texts AND language:English AND date:[1960-01-01 TO 1990-12-31]",
  "mediatype:texts AND language:English AND date:[1990-01-01 TO 2010-12-31]",
  // More subject queries — broad topics not in original list
  "mediatype:texts AND language:English AND subject:literature",
  "mediatype:texts AND language:English AND subject:natural_history",
  "mediatype:texts AND language:English AND subject:engineering",
  "mediatype:texts AND language:English AND subject:politics",
  "mediatype:texts AND language:English AND subject:travel",
  "mediatype:texts AND language:English AND subject:sociology",
  "mediatype:texts AND language:English AND subject:anthropology",
  "mediatype:texts AND language:English AND subject:geology",
  "mediatype:texts AND language:English AND subject:astronomy",
  "mediatype:texts AND language:English AND subject:botany",
  "mediatype:texts AND language:English AND subject:zoology",
  "mediatype:texts AND language:English AND subject:chemistry",
  "mediatype:texts AND language:English AND subject:physics",
  "mediatype:texts AND language:English AND subject:architecture",
  "mediatype:texts AND language:English AND subject:business",
  "mediatype:texts AND language:English AND subject:cooking",
  "mediatype:texts AND language:English AND subject:agriculture",
  "mediatype:texts AND language:English AND subject:war",
  "mediatype:texts AND language:English AND subject:military",
  "mediatype:texts AND language:English AND subject:naval",
  "mediatype:texts AND language:English AND subject:politics AND date:[1800-01-01 TO 1950-12-31]",
  "mediatype:texts AND language:English AND subject:newspaper",
  "mediatype:texts AND language:English AND subject:journal",
  "mediatype:texts AND language:English AND subject:memoir",
  "mediatype:texts AND language:English AND subject:essays",
  "mediatype:texts AND language:English AND subject:folklore",
  "mediatype:texts AND language:English AND subject:mythology",
  "mediatype:texts AND language:English AND subject:humor",
  "mediatype:texts AND language:English AND subject:social",
  // American literature & history splits
  "mediatype:texts AND language:English AND subject:american_history",
  "mediatype:texts AND language:English AND subject:american_literature",
  "mediatype:texts AND language:English AND subject:civil_war",
  "mediatype:texts AND language:English AND subject:british_history",
  "mediatype:texts AND language:English AND subject:world_war",
  // Science sub-disciplines
  "mediatype:texts AND language:English AND subject:evolution",
  "mediatype:texts AND language:English AND subject:genetics",
  "mediatype:texts AND language:English AND subject:ecology",
  "mediatype:texts AND language:English AND subject:health",
  "mediatype:texts AND language:English AND subject:nutrition",
  "mediatype:texts AND language:English AND subject:surgery",
  "mediatype:texts AND language:English AND subject:pharmacy",
  // More audio
  "mediatype:audio AND language:English AND subject:fiction",
  "mediatype:audio AND language:English AND subject:drama",
  "mediatype:audio AND language:English AND subject:music",
  "mediatype:audio AND language:English AND subject:history",
  "mediatype:audio AND language:English AND subject:comedy",
  "mediatype:audio AND language:English AND subject:speech",
  // Classic/Public domain sweeps
  "mediatype:texts AND language:English AND subject:public_domain AND date:[1800-01-01 TO 1930-12-31]",
  "mediatype:texts AND language:English AND creator:shakespeare",
  "mediatype:texts AND language:English AND creator:dickens",
  "mediatype:texts AND language:English AND creator:twain",
  "mediatype:texts AND language:English AND creator:darwin",
  // Non-English (expanded multilingual)
  "mediatype:texts AND language:French",
  "mediatype:texts AND language:German",
  "mediatype:texts AND language:Spanish",
  "mediatype:texts AND language:Italian",
  "mediatype:texts AND language:Portuguese",
];

const IA_SKIP_SUBJECTS = new Set([
  "software", "manual", "government", "census", "tax", "regulation",
  "proceedings", "bulletin", "catalog", "directory", "index",
]);

async function seedInternetArchive(abortSignal: AbortSignal): Promise<void> {
  const progress = state.internetarchive;
  const seenIds = state.seenIds.internetarchive;
  progress.status = "running";
  progress.startedAt = new Date().toISOString();
  progress.lastLogTime = Date.now();
  progress.estimatedTotal = 650000;

  const saved = await loadProgressFromDB("internetarchive");
  if (saved) {
    progress.subjectIndex = saved.subjectIndex;
    progress.currentOffset = saved.currentOffset;
    progress.totalInserted = saved.totalInserted;
    if (saved.subjectIndex > 0) {
      console.log(`[Seeder] InternetArchive: resuming from query index ${saved.subjectIndex}`);
    }
  }

  if (progress.subjectIndex === 0 && progress.currentOffset === 0) {
    const countResult = await db.execute<{ count: string }>(
      `SELECT COUNT(*) as count FROM books WHERE source = 'internet_archive'`
    );
    const existingCount = parseInt(countResult.rows?.[0]?.count || "0");
    if (existingCount > 0) {
      progress.currentOffset = existingCount;
      console.log(`[Seeder] InternetArchive: ${existingCount} existing books`);
    }
  }

  // Allow up to 8000 per query (vs old ~1200) to reach 1M total
  const targetPerQuery = 8000;

  try {
    for (let qi = progress.subjectIndex; qi < IA_QUERIES.length; qi++) {
      if (abortSignal.aborted) break;
      const query = IA_QUERIES[qi];
      progress.subjectIndex = qi;
      const isAudio = query.includes("mediatype:audio");

      let page = 1;
      let queryCount = 0;
      let emptyPages = 0;

      while (!abortSignal.aborted && queryCount < targetPerQuery && emptyPages < 3) {
        const encodedQuery = encodeURIComponent(query);
        const url = `${INTERNET_ARCHIVE_SEARCH_BASE}?q=${encodedQuery}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=description&fl[]=subject&fl[]=date&fl[]=mediatype&rows=100&page=${page}&output=json`;

        try {
          const response = await fetchWithTimeout(url, 30000, abortSignal);
          if (!response.ok) {
            if (response.status === 429) {
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
            .filter((d: any) => {
              if (!d.title || !d.identifier) return false;
              const subjects = Array.isArray(d.subject) ? d.subject : d.subject ? [d.subject] : [];
              const lowerSubjects = subjects.map((s: string) => s.toLowerCase());
              if (lowerSubjects.some((s: string) => IA_SKIP_SUBJECTS.has(s))) return false;
              return true;
            })
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

          await insertBatch(batch, progress, seenIds);
          queryCount += batch.length;
          page++;
          await maybeSaveProgress("internetarchive", progress);

          if (shouldLog(progress)) {
            console.log(`[Seeder] InternetArchive: query ${qi + 1}/${IA_QUERIES.length}, inserted=${progress.totalInserted}, deduped=${progress.totalDeduped}, rate=${progress.ratePerMinute}/min`);
          }
          await delay(IA_DELAY_MS, abortSignal);
        } catch (err: any) {
          progress.lastError = err.message || "Unknown error";
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
  await saveProgressToDB("internetarchive", progress);
  console.log(`[Seeder] InternetArchive finished: status=${progress.status}, inserted=${progress.totalInserted}, deduped=${progress.totalDeduped}`);
}

export function getSeederStatus() {
  const sources: Record<string, any> = {};
  for (const s of ALL_SOURCES) {
    const p = state[s];
    const efficiency = p.totalFetched > 0 ? Math.round((p.totalInserted / p.totalFetched) * 100) : 0;
    const eta = p.ratePerMinute > 0 && p.estimatedTotal
      ? Math.round((p.estimatedTotal - p.totalInserted) / p.ratePerMinute)
      : null;
    sources[s] = {
      ...p,
      efficiency,
      etaMinutes: eta,
    };
  }
  return {
    ...sources,
    isRunning: ALL_SOURCES.some(s => state[s].status === "running"),
  };
}

export function getSeederMetrics() {
  const metrics: Record<string, any> = {};
  for (const s of ALL_SOURCES) {
    const p = state[s];
    const elapsed = p.startedAt ? (Date.now() - new Date(p.startedAt).getTime()) / 60000 : 0;
    const efficiency = p.totalFetched > 0 ? Math.round((p.totalInserted / p.totalFetched) * 100) : 0;
    const dedupeRate = p.totalFetched > 0 ? Math.round((p.totalDeduped / p.totalFetched) * 100) : 0;
    const eta = p.ratePerMinute > 0 && p.estimatedTotal
      ? Math.round((p.estimatedTotal - p.totalInserted) / p.ratePerMinute)
      : null;
    metrics[s] = {
      status: p.status,
      ratePerMinute: p.ratePerMinute,
      efficiency: `${efficiency}%`,
      dedupeRate: `${dedupeRate}%`,
      etaMinutes: eta,
      totalFetched: p.totalFetched,
      totalInserted: p.totalInserted,
      totalDeduped: p.totalDeduped,
      totalSkipped: p.totalSkipped,
      elapsedMinutes: Math.round(elapsed),
      currentOffset: p.currentOffset,
    };
  }
  return metrics;
}

export async function startSeeding(sources: SeederSource[] = ALL_SOURCES): Promise<{ message: string }> {
  const toStart: SeederSource[] = [];

  for (const source of sources) {
    if (state[source].status === "running") continue;
    toStart.push(source);
  }

  if (toStart.length === 0) {
    return { message: "All requested seeders are already running" };
  }

  const seedFns: Record<SeederSource, (s: AbortSignal) => Promise<void>> = {
    librivox: seedLibriVox,
    gutenberg: seedGutenberg,
    openlibrary: seedOpenLibrary,
    internetarchive: seedInternetArchive,
  };

  for (const source of toStart) {
    const controller = new AbortController();
    state.abortControllers[source] = controller;
    state.seenIds[source] = new Set();
    seedFns[source](controller.signal).then(() => {
      console.log(`[Seeder] ${source} task finished`);
    }).catch(err => {
      console.error(`[Seeder] ${source} task crashed:`, err);
    });
  }

  return { message: `Started seeding: ${toStart.join(", ")}` };
}

export function stopSeeding(source?: SeederSource): { message: string } {
  if (source) {
    const ctrl = state.abortControllers[source];
    if (ctrl) {
      ctrl.abort();
      state.abortControllers[source] = null;
      return { message: `Stopped ${source} seeder` };
    }
    return { message: `${source} seeder is not running` };
  }

  let stopped = 0;
  for (const s of ALL_SOURCES) {
    const ctrl = state.abortControllers[s];
    if (ctrl) {
      ctrl.abort();
      state.abortControllers[s] = null;
      stopped++;
    }
  }
  return { message: stopped > 0 ? `Stopped ${stopped} seeder(s)` : "No seeders running" };
}

export function resetSeeder(source?: SeederSource): { message: string } {
  if (source) {
    state[source] = createProgress(source);
    state.seenIds[source] = new Set();
    return { message: `Reset ${source} seeder progress` };
  }
  for (const s of ALL_SOURCES) {
    state[s] = createProgress(s);
    state.seenIds[s] = new Set();
  }
  return { message: "Reset all seeder progress" };
}

/**
 * Reset openlibrary and internetarchive DB progress rows so they
 * re-run with the expanded subject/query lists targeting 1M books.
 * LibriVox and Gutenberg are intentionally left alone (they are
 * genuinely exhausted public-domain sources).
 */
export async function resetAndRestartExpandedSources(): Promise<{ message: string }> {
  const expandable: SeederSource[] = ["openlibrary", "internetarchive"];

  // Step 1: Abort running instances and reset in-memory state
  for (const source of expandable) {
    const ctrl = state.abortControllers[source];
    if (ctrl) {
      ctrl.abort();
      state.abortControllers[source] = null;
    }
    state[source] = createProgress(source);
    state.seenIds[source] = new Set();
  }

  // Step 2: Wait for aborting seeders to finish cleanup and write their final
  // progress rows to DB (they do this in the finally/catch block after abort).
  await delay(3000);

  // Step 3: Now that old cleanup is done, overwrite DB rows so new run starts
  // directly at the FIRST NEW subject/query, skipping already-populated ones.
  const OL_ORIGINAL_COUNT = 68;   // subjects 0–67 already populated in phase 1
  const IA_ORIGINAL_COUNT = 25;   // queries 0–24 already populated in phase 1

  try {
    await db.insert(seederProgress).values({
      source: "openlibrary",
      currentOffset: 0,
      subjectIndex: OL_ORIGINAL_COUNT,
      nextUrl: null,
      status: "idle" as const,
      totalInserted: 0,
      lastError: null,
    }).onConflictDoUpdate({
      target: seederProgress.source,
      set: {
        currentOffset: 0,
        subjectIndex: OL_ORIGINAL_COUNT,
        nextUrl: null,
        status: "idle" as const,
        totalInserted: 0,
        lastError: null,
        updatedAt: new Date(),
      },
    });
  } catch { /* ignore */ }

  try {
    await db.insert(seederProgress).values({
      source: "internetarchive",
      currentOffset: 0,
      subjectIndex: IA_ORIGINAL_COUNT,
      nextUrl: null,
      status: "idle" as const,
      totalInserted: 0,
      lastError: null,
    }).onConflictDoUpdate({
      target: seederProgress.source,
      set: {
        currentOffset: 0,
        subjectIndex: IA_ORIGINAL_COUNT,
        nextUrl: null,
        status: "idle" as const,
        totalInserted: 0,
        lastError: null,
        updatedAt: new Date(),
      },
    });
  } catch { /* ignore */ }

  console.log(`[Seeder] Expanded run: OL starts at subject ${OL_ORIGINAL_COUNT} (${OL_SUBJECTS[OL_ORIGINAL_COUNT]}), IA starts at query ${IA_ORIGINAL_COUNT}`);
  return startSeeding(expandable);
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
