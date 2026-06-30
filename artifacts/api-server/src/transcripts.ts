import type { Express } from "express";
import { db } from "./db";
import { bookTranscripts, accessibilityMetadata, books } from "@workspace/db";
import { eq, and, count, asc } from "drizzle-orm";
import { isAuthenticated, requireAdmin } from "./multiAuth";
import { z } from "zod";

const wordTimingSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
  index: z.number().optional(),
});

const segmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
  words: z.array(wordTimingSchema).optional(),
});

const createTranscriptSchema = z.object({
  chapterIndex: z.number(),
  segments: z.array(segmentSchema),
  language: z.string().optional(),
  source: z.string().optional(),
});

interface WordAlignment {
  word: string;
  startMs: number;
  endMs: number;
  wordIndex: number;
  segmentIndex: number;
}

interface SegmentTiming {
  text: string;
  startMs: number;
  endMs: number;
  segmentIndex: number;
  firstWordIndex: number;
  wordCount: number;
}

export function registerTranscriptRoutes(app: Express) {
  // GET /api/books/:id/word-alignment - Returns word- AND sentence-level timing
  // for read-along (karaoke). Prefers real per-word marks (precision "exact")
  // when the timing source provided them; otherwise estimates words within each
  // timed segment (precision "estimated"). Returns available:false when no
  // timing exists at all so clients only surface read-along when supported.
  app.get("/api/books/:id/word-alignment", async (req, res) => {
    try {
      const { id } = req.params;
      const transcripts = await db
        .select()
        .from(bookTranscripts)
        .where(eq(bookTranscripts.bookId, id))
        .orderBy(asc(bookTranscripts.chapterIndex));

      if (!transcripts.length) {
        return res.json({ available: false, precision: "none", words: [], segments: [] });
      }

      const words: WordAlignment[] = [];
      const segments: SegmentTiming[] = [];
      let globalWordIndex = 0;
      let segmentIndex = 0;
      let sawExact = false;

      for (const transcript of transcripts) {
        if (!Array.isArray(transcript.segments)) continue;
        for (const segment of transcript.segments) {
          if (!segment || typeof segment.text !== "string" || !segment.text.trim()) continue;

          const segStart = typeof segment.start === "number" ? segment.start : NaN;
          const segEnd = typeof segment.end === "number" ? segment.end : NaN;
          const segStartMs = segStart * 1000;
          const segEndMs = segEnd * 1000;
          const hasSegTiming = Number.isFinite(segStartMs) && Number.isFinite(segEndMs) && segEndMs > segStartMs;
          const firstWordIndex = globalWordIndex;

          if (Array.isArray(segment.words) && segment.words.length > 0) {
            // Exact per-word timing supplied by the source.
            for (const w of segment.words) {
              if (!w || typeof w.text !== "string" || !w.text.trim()) continue;
              if (!Number.isFinite(w.start)) continue;
              const wStartMs = w.start * 1000;
              const wEndMs = Number.isFinite(w.end) && w.end > w.start ? w.end * 1000 : wStartMs;
              words.push({
                word: w.text,
                startMs: Math.round(wStartMs),
                endMs: Math.round(wEndMs),
                wordIndex: globalWordIndex++,
                segmentIndex,
              });
            }
            if (globalWordIndex > firstWordIndex) sawExact = true;
          } else if (hasSegTiming) {
            // Estimate evenly within a timed segment (never fabricate timing
            // for an untimed segment).
            const segWords = segment.text.trim().split(/\s+/).filter(Boolean);
            const msPerWord = (segEndMs - segStartMs) / Math.max(segWords.length, 1);
            for (let wi = 0; wi < segWords.length; wi++) {
              words.push({
                word: segWords[wi],
                startMs: Math.round(segStartMs + wi * msPerWord),
                endMs: Math.round(segStartMs + (wi + 1) * msPerWord),
                wordIndex: globalWordIndex++,
                segmentIndex,
              });
            }
          } else {
            // No usable timing for this segment; skip it.
            continue;
          }

          if (globalWordIndex === firstWordIndex) continue;

          segments.push({
            text: segment.text,
            startMs: hasSegTiming ? Math.round(segStartMs) : words[firstWordIndex].startMs,
            endMs: hasSegTiming ? Math.round(segEndMs) : words[globalWordIndex - 1].endMs,
            segmentIndex,
            firstWordIndex,
            wordCount: globalWordIndex - firstWordIndex,
          });
          segmentIndex++;
        }
      }

      const precision = sawExact ? "exact" : words.length > 0 ? "estimated" : "none";
      res.json({ available: words.length > 0, precision, words, segments });
    } catch (error) {
      console.error("[Transcripts] Error building word alignment:", error);
      res.status(500).json({ message: "Failed to build word alignment" });
    }
  });

  app.get("/api/books/:id/transcript", async (req, res) => {
    try {
      const { id } = req.params;
      const transcripts = await db
        .select()
        .from(bookTranscripts)
        .where(eq(bookTranscripts.bookId, id))
        .orderBy(asc(bookTranscripts.chapterIndex));
      res.json(transcripts);
    } catch (error) {
      console.error("[Transcripts] Error fetching transcripts:", error);
      res.status(500).json({ message: "Failed to fetch transcripts" });
    }
  });

  // Writing a transcript flips public read-along output (and hasTranscript) for
  // a book, so restrict it to admins; trusted server paths (narration, seeder)
  // write directly via the DB, not through this route.
  app.post("/api/books/:id/transcript", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;

      const validated = createTranscriptSchema.parse(req.body);

      const [book] = await db.select().from(books).where(eq(books.id, id));
      if (!book) {
        return res.status(404).json({ message: "Book not found" });
      }

      const [transcript] = await db
        .insert(bookTranscripts)
        .values({
          bookId: id,
          chapterIndex: validated.chapterIndex,
          segments: validated.segments,
          language: validated.language || "en",
          source: validated.source || "manual",
        })
        .returning();

      await db
        .insert(accessibilityMetadata)
        .values({ bookId: id, hasTranscript: true })
        .onConflictDoUpdate({
          target: accessibilityMetadata.bookId,
          set: { hasTranscript: true, updatedAt: new Date() },
        });

      res.json(transcript);
    } catch (error) {
      console.error("[Transcripts] Error creating transcript:", error);
      res.status(500).json({ message: "Failed to create transcript" });
    }
  });

  app.get("/api/books/:id/transcript/search", async (req, res) => {
    try {
      const { id } = req.params;
      const { q } = req.query;

      if (!q || typeof q !== "string") {
        return res.status(400).json({ message: "Search query is required" });
      }

      const transcripts = await db
        .select()
        .from(bookTranscripts)
        .where(eq(bookTranscripts.bookId, id));

      const results = [];
      const queryLower = q.toLowerCase();

      for (const transcript of transcripts) {
        if (Array.isArray(transcript.segments)) {
          for (const segment of transcript.segments) {
            if (segment.text && segment.text.toLowerCase().includes(queryLower)) {
              results.push({
                chapterIndex: transcript.chapterIndex,
                start: segment.start,
                end: segment.end,
                text: segment.text,
              });
            }
          }
        }
      }

      res.json({ results });
    } catch (error) {
      console.error("[Transcripts] Error searching transcripts:", error);
      res.status(500).json({ message: "Failed to search transcripts" });
    }
  });
}

export async function seedSampleTranscript() {
  try {
    const existingCount = await db
      .select({ count: count() })
      .from(bookTranscripts);

    if (existingCount[0]?.count && existingCount[0].count > 0) {
      return;
    }

    const [book] = await db
      .select()
      .from(books)
      .where(and(eq(books.source, "librivox"), eq(books.contentType, "audiobook")))
      .limit(1);

    if (!book) {
      return;
    }

    const segments = [
      { start: 0, end: 5, text: "Welcome to this audiobook recording." },
      { start: 5, end: 10, text: "This is a sample transcript for demonstration." },
      { start: 10, end: 15, text: "Interactive transcripts help readers follow along." },
      { start: 15, end: 20, text: "You can click any line to jump to that moment." },
      { start: 20, end: 25, text: "The current segment is highlighted as you listen." },
      { start: 25, end: 30, text: "Search within the transcript to find specific passages." },
      { start: 30, end: 35, text: "This feature improves accessibility for all users." },
      { start: 35, end: 40, text: "Transcripts support multiple languages." },
      { start: 40, end: 45, text: "They can be auto-generated or manually uploaded." },
      { start: 45, end: 50, text: "Each segment is timestamped for precise navigation." },
      { start: 50, end: 55, text: "The transcript panel can be toggled on and off." },
      { start: 55, end: 60, text: "Search results highlight matching text in context." },
      { start: 60, end: 65, text: "Navigation buttons let you jump between matches." },
      { start: 65, end: 70, text: "This helps users with hearing difficulties." },
      { start: 70, end: 75, text: "It also benefits users in noisy environments." },
      { start: 75, end: 80, text: "Or those who prefer reading along while listening." },
      { start: 80, end: 85, text: "The transcript syncs with the audio playback." },
      { start: 85, end: 90, text: "Pausing the audio pauses the highlight." },
      { start: 90, end: 95, text: "Seeking in the audio updates the transcript position." },
      { start: 95, end: 100, text: "Thank you for using AccessiBooks interactive transcripts." },
    ];

    await db.insert(bookTranscripts).values({
      bookId: book.id,
      chapterIndex: 0,
      segments,
      language: "en",
      source: "sample",
    });

    await db
      .insert(accessibilityMetadata)
      .values({ bookId: book.id, hasTranscript: true })
      .onConflictDoUpdate({
        target: accessibilityMetadata.bookId,
        set: { hasTranscript: true, updatedAt: new Date() },
      });

    console.log(`[Transcripts] Seeded sample transcript for "${book.title}" (ID: ${book.id})`);
  } catch (error) {
    console.error("[Transcripts] Error seeding sample transcript:", error);
  }
}
