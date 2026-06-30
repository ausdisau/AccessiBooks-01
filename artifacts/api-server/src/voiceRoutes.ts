import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import OpenAI, { toFile } from "openai";

import { isAuthenticated } from "./multiAuth";

/**
 * Voice command transcription for the mobile hands-free mode.
 *
 * The Expo app records a short audio clip and POSTs the raw bytes here; we run
 * speech-to-text via the Replit OpenAI proxy and return the transcript, which
 * the client parses into a command locally. This is an authenticated, paid AI
 * endpoint, so it carries a dedicated (stricter) per-user rate limit on top of
 * auth, a bounded body, and content-type validation. Audio bytes and the
 * resulting transcript are never logged.
 */

const hasOpenAI = !!(
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY &&
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY.length > 0
);

const openai = hasOpenAI
  ? new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    })
  : null;

// Dedicated, conservative limiter for the voice endpoint — much tighter than
// the generic 30/min limiter because every call hits a paid STT model.
const VOICE_RATE_WINDOW_MS = 60_000;
const VOICE_RATE_MAX = 12;
const voiceBuckets = new Map<string, { count: number; reset: number }>();

function voiceRateLimit(req: Request, res: Response, next: NextFunction) {
  const userId =
    (req as any).user?.claims?.sub || (req as any).user?.id || req.ip;
  const key = `voice:${userId}`;
  const now = Date.now();
  let entry = voiceBuckets.get(key);
  if (!entry || now > entry.reset) {
    entry = { count: 1, reset: now + VOICE_RATE_WINDOW_MS };
    voiceBuckets.set(key, entry);
  } else {
    entry.count++;
  }
  if (entry.count > VOICE_RATE_MAX) {
    const retryAfter = Math.ceil((entry.reset - now) / 1000);
    res.setHeader("Retry-After", retryAfter.toString());
    return res.status(429).json({
      message: "Too many voice requests. Please slow down.",
      retryAfter,
    });
  }
  next();
}

const MAX_AUDIO_BYTES = 3_000_000; // ~3MB — generous for a few-second clip

// Map the inbound content type to a filename extension OpenAI can recognise.
const MIME_EXT: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/x-caf": "caf",
};

export function registerVoiceRoutes(app: Express) {
  app.post(
    "/api/voice/transcribe",
    isAuthenticated,
    voiceRateLimit,
    // Route-local raw parser. The global express.json() only consumes
    // application/json bodies, so it passes audio payloads straight through.
    express.raw({ type: () => true, limit: "3mb" }),
    async (req: Request, res: Response) => {
      const userId =
        (req.user as { id?: string; claims?: { sub?: string } } | undefined)
          ?.id ||
        (req.user as { claims?: { sub?: string } } | undefined)?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      if (!openai) {
        return res.status(503).json({
          message:
            "Voice commands are unavailable — the speech service is not configured.",
        });
      }

      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length < 500) {
        return res.status(400).json({ message: "No audio received." });
      }
      if (buf.length > MAX_AUDIO_BYTES) {
        return res.status(413).json({ message: "Audio clip too large." });
      }

      const contentType = String(req.headers["content-type"] || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      const ext = MIME_EXT[contentType];
      // Reject unsupported/missing audio types before spending a paid STT call.
      if (!ext) {
        return res
          .status(415)
          .json({ message: "Unsupported audio format." });
      }

      try {
        const file = await toFile(buf, `voice.${ext}`, {
          type: contentType || "audio/mp4",
        });
        const result = await openai.audio.transcriptions.create({
          model: "gpt-4o-mini-transcribe",
          file,
          response_format: "json",
        });
        const transcript = (result.text || "").trim();
        return res.json({ transcript });
      } catch (err) {
        // Deliberately do not log audio bytes or transcript content.
        req.log?.error({ err }, "voice transcription failed");
        return res.status(502).json({ message: "Transcription failed." });
      }
    },
  );
}
