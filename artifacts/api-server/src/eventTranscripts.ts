import { db } from "./db";
import { eventTranscripts } from "@workspace/db";
import type { EventTranscript, EventTranscriptSourceType, TranscriptSegment } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { z } from "zod";

// Saved live-caption transcripts for live events and reading-club sessions.
// No video-conferencing stack: a host/admin posts caption cues that accumulate
// into one transcript per source, which is saved and viewable afterwards.

// Bounds (DoS / storage control). Captions are stored and MUST be rendered as
// plain text by clients (never HTML).
const MAX_TEXT = 500; // chars per cue
const MAX_PER_REQUEST = 50; // cues per POST
const MAX_TOTAL_SEGMENTS = 5000; // cues retained per transcript (keep most recent)

export class CaptionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Generous but bounded — a live host emits many cues, but we still cap abuse.
export const captionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: (req: any) => req.user?.id || req.ip || "anonymous",
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many caption updates — please slow down." },
});

export const captionInputSchema = z.object({
  segments: z
    .array(
      z.object({
        start: z.number().nonnegative().optional(),
        end: z.number().nonnegative().optional(),
        text: z.string().min(1).max(MAX_TEXT),
      }),
    )
    .min(1)
    .max(MAX_PER_REQUEST),
});

function sanitizeSegments(input: unknown): TranscriptSegment[] {
  if (!Array.isArray(input)) return [];
  const out: TranscriptSegment[] = [];
  for (const raw of input.slice(0, MAX_PER_REQUEST)) {
    const s = raw as { start?: unknown; end?: unknown; text?: unknown };
    const text = String(s?.text ?? "").trim().slice(0, MAX_TEXT);
    if (!text) continue;
    const start = Number.isFinite(Number(s?.start)) ? Math.max(0, Number(s?.start)) : 0;
    const end = Number.isFinite(Number(s?.end)) ? Math.max(start, Number(s?.end)) : start;
    out.push({ start, end, text });
  }
  return out;
}

export async function getEventTranscript(
  sourceType: EventTranscriptSourceType,
  sourceId: string,
): Promise<EventTranscript | null> {
  const [row] = await db
    .select()
    .from(eventTranscripts)
    .where(and(eq(eventTranscripts.sourceType, sourceType), eq(eventTranscripts.sourceId, sourceId)))
    .limit(1);
  return row ?? null;
}

export async function appendCaptionSegments(params: {
  sourceType: EventTranscriptSourceType;
  sourceId: string;
  segments: unknown;
  createdByUserId?: string | null;
}): Promise<EventTranscript> {
  const clean = sanitizeSegments(params.segments);
  if (clean.length === 0) throw new CaptionError("No valid caption cues provided");

  return await db.transaction(async (tx) => {
    // Ensure the single-per-source row exists, then lock it for a race-safe append.
    await tx
      .insert(eventTranscripts)
      .values({
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        segments: [],
        source: "live_caption",
        status: "live",
        createdByUserId: params.createdByUserId ?? null,
      })
      .onConflictDoNothing();

    const [row] = await tx
      .select()
      .from(eventTranscripts)
      .where(and(eq(eventTranscripts.sourceType, params.sourceType), eq(eventTranscripts.sourceId, params.sourceId)))
      .limit(1)
      .for("update");

    if (!row) throw new CaptionError("Failed to create transcript", 500);
    if (row.status === "final") throw new CaptionError("Transcript is finalized and can no longer be edited", 409);

    const merged = [...(row.segments ?? []), ...clean].slice(-MAX_TOTAL_SEGMENTS);
    const [updated] = await tx
      .update(eventTranscripts)
      .set({
        segments: merged,
        createdByUserId: row.createdByUserId ?? params.createdByUserId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(eventTranscripts.id, row.id))
      .returning();
    return updated;
  });
}

export async function finalizeEventTranscript(
  sourceType: EventTranscriptSourceType,
  sourceId: string,
): Promise<EventTranscript | null> {
  const [updated] = await db
    .update(eventTranscripts)
    .set({ status: "final", updatedAt: new Date() })
    .where(and(eq(eventTranscripts.sourceType, sourceType), eq(eventTranscripts.sourceId, sourceId)))
    .returning();
  return updated ?? null;
}
