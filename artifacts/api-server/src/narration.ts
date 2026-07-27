import type { Express, Request, Response } from "express";
import express from "express";
import { eq, and, asc, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  narrationJobs,
  narrationAssets,
  books,
  type NarrationAsset,
  type TranscriptSegment,
  type TranscriptWordTiming,
} from "@workspace/db";
import { storage } from "./storage";
import { isAuthenticated } from "./multiAuth";
import { rateLimitMiddleware } from "./drm";
import {
  isElevenLabsConfigured,
  textToSpeech as elevenLabsTTS,
  textToSpeechWithTimestamps as elevenLabsTTSWithTimestamps,
  type CharacterAlignment,
  ELEVENLABS_DEFAULT_VOICES,
} from "./replit_integrations/audio/elevenlabs";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import { getAiAddonStatus, incrementAiAddonUsage, buildUpsellPayload } from "./aiAddons";
import {
  splitIntoChapters,
  splitIntoSubChunks,
  wordsFromAlignment,
  groupWordsIntoSegments,
  type Chapter,
} from "./narrationText";

// ---------------------------------------------------------------------------
// Curated narration voices.
//
// Rather than exposing the full ElevenLabs catalog (which varies by API key and
// includes voices unsuited to long-form reading), narration offers a small,
// stable allow-list of audiobook-friendly voices. The IDs are well-known
// "premade" voices that work with any ElevenLabs key. Restricting the set also
// doubles as an input-validation allow-list for the generate endpoint.
// ---------------------------------------------------------------------------
const NARRATION_VOICE_IDS = new Set([
  "21m00Tcm4TlvDq8ikWAM", // Rachel
  "EXAVITQu4vr4xnSDxMaL", // Bella
  "ErXwobaYiN019PkySvjV", // Antoni
  "TxGEqnHWrfWFTfGW9XjX", // Josh
  "onwK4e9ZLuTAKqWW03F9", // Daniel
  "Xb7hH8MSUJpSbSDYk0k2", // Alice
]);

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

export function getNarrationVoices() {
  return ELEVENLABS_DEFAULT_VOICES.filter((v) => NARRATION_VOICE_IDS.has(v.voice_id)).map((v) => ({
    id: v.voice_id,
    name: v.name,
    description: v.description || v.category || "",
  }));
}

// ---------------------------------------------------------------------------
// Abuse / cost controls.
// ---------------------------------------------------------------------------
const MP3_BYTES_PER_SECOND = 16_000; // mp3_44100_128 ≈ 128 kbps

const MAX_GLOBAL_CONCURRENT_JOBS = 2;
const MAX_PER_USER_CONCURRENT_JOBS = 1;

// In-process registry of running jobs. Keyed by `${bookId}:${voiceId}`.
const activeJobKeys = new Set<string>();
const activeJobsByUser = new Map<string, number>();

function jobKey(bookId: string, voiceId: string): string {
  return `${bookId}:${voiceId}`;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "_");
}

// ---------------------------------------------------------------------------
// Object storage helpers (mirrors the coverGenerator public-bucket pattern).
// Narration audio is derived from public-domain source text, so it is stored
// in the public bucket and served via the unauthenticated /objects/public/*
// route — no per-user ACL is required.
// ---------------------------------------------------------------------------
function getPublicBucketRoot(): { bucketName: string; baseDir: string } | null {
  const publicSearchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!publicSearchPaths.length) return null;
  const first = publicSearchPaths[0]; // /<bucket>/<dir...>
  const parts = first.slice(1).split("/").filter(Boolean);
  if (parts.length < 1) return null;
  return { bucketName: parts[0], baseDir: parts.slice(1).join("/") };
}

function narrationObjectName(baseDir: string, bookId: string, voiceId: string, chapterNumber: number): string {
  const rel = `public/narration/${safeSegment(bookId)}/${safeSegment(voiceId)}/chapter-${chapterNumber}.mp3`;
  return baseDir ? `${baseDir}/${rel}` : rel;
}

function narrationPublicUrl(bookId: string, voiceId: string, chapterNumber: number): string {
  return `/objects/public/narration/${safeSegment(bookId)}/${safeSegment(voiceId)}/chapter-${chapterNumber}.mp3`;
}

// ---------------------------------------------------------------------------
// Text fetching + chapter splitting.
// ---------------------------------------------------------------------------
interface FetchedText {
  text: string;
  isSample: boolean;
}

async function fetchBookText(bookId: string): Promise<FetchedText | null> {
  const baseUrl = `http://localhost:${process.env.PORT || 8080}`;
  try {
    const res = await fetch(`${baseUrl}/api/ebook/${bookId}/content`);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    const isSample = res.headers.get("X-Content-Source") === "sample";
    if (!contentType.includes("text/plain") && !contentType.includes("text/html")) {
      return null; // PDF/EPUB cannot be narrated automatically
    }
    const text = await res.text();
    return { text, isSample };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Job lifecycle.
// ---------------------------------------------------------------------------
async function setJobStatus(
  bookId: string,
  voiceId: string,
  patch: Partial<{ status: string; totalChapters: number; completedChapters: number; error: string | null }>,
): Promise<void> {
  await db
    .update(narrationJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(narrationJobs.bookId, bookId), eq(narrationJobs.voiceId, voiceId)));
}

async function generateChapter(
  baseDir: string,
  bucketName: string,
  bookId: string,
  voiceId: string,
  chapter: Chapter,
): Promise<void> {
  const subChunks = splitIntoSubChunks(chapter.text);
  const audioBuffers: Buffer[] = [];
  const allWords: TranscriptWordTiming[] = [];
  let offsetSeconds = 0;
  // Only persist timing if EVERY sub-chunk produced alignment — partial timing
  // would make read-along stop mid-chapter, so we drop it entirely on any gap.
  let timingComplete = true;

  for (const sub of subChunks) {
    if (!sub) continue;
    let audio: Buffer;
    let alignment: CharacterAlignment | null = null;
    try {
      const r = await elevenLabsTTSWithTimestamps(sub, voiceId);
      audio = r.audio;
      alignment = r.alignment;
    } catch (err) {
      // Timestamped endpoint unavailable/failed: fall back to plain TTS so audio
      // still generates, but this chapter will have no read-along timing.
      console.warn(
        `[Narration] Timestamped TTS unavailable for ${bookId} (${voiceId}); generating without timing.`,
      );
      audio = await elevenLabsTTS(sub, voiceId);
    }
    audioBuffers.push(audio);
    if (alignment) {
      for (const w of wordsFromAlignment(alignment, offsetSeconds)) allWords.push(w);
    } else {
      timingComplete = false;
    }
    offsetSeconds += audio.length / MP3_BYTES_PER_SECOND;
  }
  const combined = Buffer.concat(audioBuffers);

  const objectName = narrationObjectName(baseDir, bookId, voiceId, chapter.number);
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  await file.save(combined, { contentType: "audio/mpeg", resumable: false });

  const audioUrl = narrationPublicUrl(bookId, voiceId, chapter.number);
  const durationSeconds = Math.max(1, Math.round(combined.length / MP3_BYTES_PER_SECOND));

  // Per-chapter read-along timing, relative to THIS chapter's narration audio
  // (each chapter is a separate audio file). Null when timing wasn't captured.
  const timingJson: TranscriptSegment[] | null =
    timingComplete && allWords.length > 0 ? groupWordsIntoSegments(allWords) : null;

  await db
    .insert(narrationAssets)
    .values({
      bookId,
      voiceId,
      chapterNumber: chapter.number,
      title: chapter.title,
      audioUrl,
      durationSeconds,
      charCount: chapter.text.length,
      timingJson,
    })
    .onConflictDoUpdate({
      target: [narrationAssets.bookId, narrationAssets.voiceId, narrationAssets.chapterNumber],
      set: { audioUrl, durationSeconds, charCount: chapter.text.length, title: chapter.title, timingJson },
    });
}

async function runNarrationJob(bookId: string, voiceId: string, userId: string, chapters: Chapter[]): Promise<void> {
  const key = jobKey(bookId, voiceId);
  activeJobKeys.add(key);
  activeJobsByUser.set(userId, (activeJobsByUser.get(userId) || 0) + 1);

  const root = getPublicBucketRoot();
  if (!root) {
    await setJobStatus(bookId, voiceId, { status: "failed", error: "Object storage not configured" });
    activeJobKeys.delete(key);
    activeJobsByUser.set(userId, Math.max(0, (activeJobsByUser.get(userId) || 1) - 1));
    return;
  }

  try {
    await setJobStatus(bookId, voiceId, { status: "processing", totalChapters: chapters.length, completedChapters: 0, error: null });

    let completed = 0;
    for (const chapter of chapters) {
      await generateChapter(root.baseDir, root.bucketName, bookId, voiceId, chapter);
      completed += 1;
      await setJobStatus(bookId, voiceId, { completedChapters: completed });
    }

    await setJobStatus(bookId, voiceId, { status: "completed", completedChapters: completed });

    // The book now carries AI-generated narration tracks - record the catalogue
    // provenance hint unless already labelled (never overwrite "human").
    try {
      await db
        .update(books)
        .set({ narrationType: "ai" })
        .where(and(eq(books.id, bookId), isNull(books.narrationType)));
    } catch (err) {
      console.warn("[Narration] narration_type tag failed for " + bookId, err instanceof Error ? err.message : err);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Narration] Job failed for ${bookId} (${voiceId}):`, message);
    await setJobStatus(bookId, voiceId, { status: "failed", error: message.slice(0, 500) });
  } finally {
    activeJobKeys.delete(key);
    activeJobsByUser.set(userId, Math.max(0, (activeJobsByUser.get(userId) || 1) - 1));
  }
}

async function getAssets(bookId: string, voiceId: string): Promise<NarrationAsset[]> {
  return db
    .select()
    .from(narrationAssets)
    .where(and(eq(narrationAssets.bookId, bookId), eq(narrationAssets.voiceId, voiceId)))
    .orderBy(asc(narrationAssets.chapterNumber));
}

// ---------------------------------------------------------------------------
// Routes.
// ---------------------------------------------------------------------------
export function registerNarrationRoutes(app: Express): void {
  // GET /api/narration/voices - curated narration voices
  app.get("/api/narration/voices", (_req: Request, res: Response) => {
    res.json({ voices: getNarrationVoices(), configured: isElevenLabsConfigured() });
  });

  // GET /api/narration/:bookId/status?voiceId= - job status + progress
  app.get("/api/narration/:bookId/status", async (req: Request, res: Response) => {
    try {
      const bookId = String(req.params.bookId);
      const voiceId = (req.query.voiceId as string) || DEFAULT_VOICE_ID;

      const jobRows = await db
        .select()
        .from(narrationJobs)
        .where(and(eq(narrationJobs.bookId, bookId), eq(narrationJobs.voiceId, voiceId)))
        .limit(1);
      const job = jobRows[0];
      const assetCount = (await getAssets(bookId, voiceId)).length;

      if (!job && assetCount === 0) {
        return res.json({ status: "none", totalChapters: 0, completedChapters: 0, voiceId });
      }

      return res.json({
        status: job?.status || (assetCount > 0 ? "completed" : "none"),
        totalChapters: job?.totalChapters ?? assetCount,
        completedChapters: job?.completedChapters ?? assetCount,
        error: job?.error || null,
        voiceId,
      });
    } catch (error) {
      req.log?.error({ err: error }, "Error fetching narration status");
      return res.status(500).json({ message: "Failed to fetch narration status" });
    }
  });

  // GET /api/narration/:bookId/manifest?voiceId= - chapter list with audio URLs
  app.get("/api/narration/:bookId/manifest", async (req: Request, res: Response) => {
    try {
      const bookId = String(req.params.bookId);
      const voiceId = (req.query.voiceId as string) || DEFAULT_VOICE_ID;
      const assets = await getAssets(bookId, voiceId);
      return res.json({
        bookId,
        voiceId,
        chapters: assets.map((a) => ({
          chapterNumber: a.chapterNumber,
          title: a.title,
          audioUrl: a.audioUrl,
          durationSeconds: a.durationSeconds,
          timing: a.timingJson ?? null,
        })),
      });
    } catch (error) {
      req.log?.error({ err: error }, "Error fetching narration manifest");
      return res.status(500).json({ message: "Failed to fetch narration manifest" });
    }
  });

  // POST /api/narration/:bookId/generate - start on-demand narration generation
  app.post(
    "/api/narration/:bookId/generate",
    isAuthenticated,
    rateLimitMiddleware,
    express.json({ limit: "16kb" }),
    async (req: Request, res: Response) => {
      try {
        const userId = (req.user as { id?: string; claims?: { sub?: string } } | undefined)?.id
          || (req.user as { claims?: { sub?: string } } | undefined)?.claims?.sub;
        if (!userId) {
          return res.status(401).json({ message: "Authentication required" });
        }

        if (!isElevenLabsConfigured()) {
          return res.status(503).json({ message: "Narration is not available — the audio service is not configured." });
        }

        const bookId = String(req.params.bookId);
        const requestedVoiceId = (req.body?.voiceId as string) || DEFAULT_VOICE_ID;
        if (!NARRATION_VOICE_IDS.has(requestedVoiceId)) {
          return res.status(400).json({ message: "Unsupported voiceId" });
        }
        const voiceId = requestedVoiceId;

        const book = await storage.getBook(bookId);
        if (!book) {
          return res.status(404).json({ message: "Book not found" });
        }
        // Only text-only titles (ebooks / magazines) are narratable here.
        if (book.contentType !== "ebook" && book.contentType !== "magazine") {
          return res.status(400).json({ message: "Narration is only available for text titles." });
        }

        // Already generated for this title + voice → return completed immediately.
        const existing = await getAssets(bookId, voiceId);
        if (existing.length > 0) {
          return res.json({ status: "completed", totalChapters: existing.length, completedChapters: existing.length, voiceId, cached: true });
        }

        // Already running?
        if (activeJobKeys.has(jobKey(bookId, voiceId))) {
          return res.status(202).json({ status: "processing", voiceId });
        }

        // Premium AI add-on quota — only a NEW generation consumes a credit
        // (cached / already-running titles above are served for free so users
        // never lose access to audio that already exists). Enforced here, not
        // just in the UI, so a modified client can't exceed its allowance.
        const addonStatus = await getAiAddonStatus(userId, "ai_narration");
        if (!addonStatus.allowed) {
          return res.status(402).json(buildUpsellPayload(addonStatus));
        }

        // Concurrency caps.
        if (activeJobKeys.size >= MAX_GLOBAL_CONCURRENT_JOBS) {
          return res.status(429).json({ message: "The narration service is busy. Please try again shortly." });
        }
        if ((activeJobsByUser.get(userId) || 0) >= MAX_PER_USER_CONCURRENT_JOBS) {
          return res.status(429).json({ message: "You already have a narration in progress. Please wait for it to finish." });
        }

        // Object storage must be available before we begin.
        if (!getPublicBucketRoot()) {
          return res.status(503).json({ message: "Object storage not configured" });
        }

        // Fetch and validate text.
        const fetched = await fetchBookText(bookId);
        if (!fetched || fetched.text.trim().length < 50) {
          return res.status(422).json({
            message: "Could not retrieve readable text for this title. Books in PDF or EPUB format cannot be narrated automatically.",
          });
        }
        if (fetched.isSample) {
          return res.status(422).json({
            message: "This title has no accessible plain-text source, so it cannot be narrated.",
          });
        }

        const chapters = splitIntoChapters(fetched.text);
        if (chapters.length === 0) {
          return res.status(422).json({ message: "Could not split this title into narratable chapters." });
        }

        // Create / reset the job row (unique on bookId+voiceId).
        await db
          .insert(narrationJobs)
          .values({
            bookId,
            voiceId,
            status: "queued",
            totalChapters: chapters.length,
            completedChapters: 0,
            requestedBy: userId,
            error: null,
          })
          .onConflictDoUpdate({
            target: [narrationJobs.bookId, narrationJobs.voiceId],
            set: { status: "queued", totalChapters: chapters.length, completedChapters: 0, requestedBy: userId, error: null, updatedAt: new Date() },
          });

        // Kick off background processing (don't await).
        void runNarrationJob(bookId, voiceId, userId, chapters);

        // Consume one narration credit now that a new job is actually queued.
        await incrementAiAddonUsage(userId, "ai_narration");

        return res.status(202).json({ status: "queued", totalChapters: chapters.length, completedChapters: 0, voiceId });
      } catch (error) {
        req.log?.error({ err: error }, "Error starting narration job");
        return res.status(500).json({ message: "Failed to start narration" });
      }
    },
  );
}
