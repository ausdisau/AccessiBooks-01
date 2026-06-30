import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { db } from "./db";
import { accessibilityPreferences } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "./multiAuth";
import {
  enforceAiAddon,
  incrementAiAddonUsage,
  getAiAddonStatus,
  getRequestUserId,
} from "./aiAddons";
import {
  isElevenLabsConfigured,
  textToSpeech as elevenLabsTTS,
} from "./replit_integrations/audio/elevenlabs";

/**
 * AI Translation add-on (Task #212).
 *
 * Uses the existing OpenAI chat integration to translate book text into a
 * target language AT THE READER'S REQUESTED READING LEVEL, so the translation
 * stays accessible. Optionally feeds the result into the narration pipeline
 * (ElevenLabs TTS) to read the translation aloud. Both surfaces are metered
 * and quota-gated through the shared AI add-on enforcement.
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

const WORDS_PER_PAGE = 300; // matches the ebook reader + easyEnglish page model
const MAX_TEXT_CHARS = 8000; // hard cap on text translated per request
const MAX_NARRATION_CHARS = 2500; // safe single-chunk limit for ElevenLabs TTS

// Default ElevenLabs voice used when narrating a translation (matches the
// narration module's default).
const TRANSLATION_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

// Supported target languages. Kept to a curated, well-supported set so the
// model reliably produces fluent output and the UI can offer a clean picker.
export const TRANSLATION_LANGUAGES = [
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "zh", name: "Chinese (Simplified)", nativeName: "简体中文" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "en", name: "English", nativeName: "English" },
] as const;

type LanguageCode = typeof TRANSLATION_LANGUAGES[number]["code"];

const LANGUAGE_BY_CODE = new Map(TRANSLATION_LANGUAGES.map((l) => [l.code, l]));

// Reading levels the user can target. "auto" defers to the reader's saved
// accessibility profile (simpler language when they need it).
const READING_LEVELS = ["auto", "simple", "standard", "advanced"] as const;
type ReadingLevel = typeof READING_LEVELS[number];

function readingLevelInstruction(level: Exclude<ReadingLevel, "auto">): string {
  switch (level) {
    case "simple":
      return "Write the translation in very simple, plain language a beginner reader can follow: short sentences (max 15 words), common everyday words, active voice, one idea per sentence. Keep all the original meaning.";
    case "advanced":
      return "Write a faithful, natural translation that preserves the author's tone, register, and nuance for a fluent adult reader.";
    case "standard":
    default:
      return "Write a clear, natural translation in everyday language suitable for a general adult reader. Keep all the original meaning.";
  }
}

async function resolveReadingLevel(
  userId: string | null,
  requested: ReadingLevel,
): Promise<Exclude<ReadingLevel, "auto">> {
  if (requested !== "auto") return requested;
  if (!userId) return "standard";
  try {
    const [row] = await db
      .select({
        symbolSupport: accessibilityPreferences.symbolSupport,
        dyslexiaFriendly: accessibilityPreferences.dyslexiaFriendly,
        reduceDistraction: accessibilityPreferences.reduceDistraction,
      })
      .from(accessibilityPreferences)
      .where(eq(accessibilityPreferences.userId, userId))
      .limit(1);
    if (row && (row.symbolSupport || row.dyslexiaFriendly || row.reduceDistraction)) {
      return "simple";
    }
  } catch {
    // fall through to standard
  }
  return "standard";
}

/** Fetch the text the reader is on. If a page is given, slice that page's
 *  words; otherwise return the opening of the book (bounded). */
async function fetchTextToTranslate(bookId: string, page: number | null): Promise<string | null> {
  const baseUrl = `http://localhost:${process.env.PORT || 8080}`;
  try {
    const res = await fetch(`${baseUrl}/api/ebook/${bookId}/content`);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text")) return null;
    const fullText = await res.text();
    const words = fullText.split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    if (page && page > 0) {
      const startIdx = (page - 1) * WORDS_PER_PAGE;
      const slice = words.slice(startIdx, startIdx + WORDS_PER_PAGE);
      if (slice.length === 0) return null;
      return slice.join(" ").slice(0, MAX_TEXT_CHARS);
    }
    return words.slice(0, WORDS_PER_PAGE).join(" ").slice(0, MAX_TEXT_CHARS);
  } catch {
    return null;
  }
}

function parsePage(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

interface TranslateBody {
  bookId?: unknown;
  text?: unknown;
  page?: unknown;
  targetLanguage?: unknown;
  readingLevel?: unknown;
  narrate?: unknown;
}

export function registerTranslationRoutes(app: Express): void {
  // Supported languages + reading levels for the picker. Public so the UI can
  // render options before the user commits to a (metered) translation.
  app.get("/api/translation/languages", (_req: Request, res: Response): void => {
    res.json({
      languages: TRANSLATION_LANGUAGES,
      readingLevels: READING_LEVELS,
      narrationAvailable: isElevenLabsConfigured(),
    });
  });

  // Translate book text at the reader's reading level. Quota-gated; usage is
  // only consumed once the translation actually succeeds.
  app.post(
    "/api/translation/translate",
    isAuthenticated,
    enforceAiAddon("ai_translation"),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const userId = getRequestUserId(req);
        if (!userId) {
          res.status(401).json({ error: "auth_required", message: "Sign in to use translation." });
          return;
        }

        if (!openai) {
          res.status(503).json({
            error: "unconfigured",
            message: "Translation isn't available right now because the AI service isn't configured.",
          });
          return;
        }

        const body = (req.body ?? {}) as TranslateBody;

        const targetLanguage = typeof body.targetLanguage === "string" ? body.targetLanguage.trim() : "";
        const lang = LANGUAGE_BY_CODE.get(targetLanguage as LanguageCode);
        if (!lang) {
          res.status(400).json({ error: "invalid_language", message: "Unsupported target language." });
          return;
        }

        const requestedLevel: ReadingLevel = READING_LEVELS.includes(body.readingLevel as ReadingLevel)
          ? (body.readingLevel as ReadingLevel)
          : "auto";

        // Source text: explicit `text`, otherwise pull from the book by page.
        let sourceText = typeof body.text === "string" ? body.text.trim() : "";
        const bookId = typeof body.bookId === "string" ? body.bookId.trim() : "";
        if (!sourceText) {
          if (!bookId) {
            res.status(400).json({ error: "missing_input", message: "Provide text or a bookId to translate." });
            return;
          }
          const page = parsePage(body.page);
          const fetched = await fetchTextToTranslate(bookId, page);
          if (!fetched) {
            res.status(422).json({
              error: "no_text",
              message: "Could not find readable text to translate for this title.",
            });
            return;
          }
          sourceText = fetched;
        }
        sourceText = sourceText.slice(0, MAX_TEXT_CHARS);
        if (sourceText.length < 1) {
          res.status(400).json({ error: "empty_text", message: "There is no text to translate." });
          return;
        }

        const level = await resolveReadingLevel(userId, requestedLevel);
        const levelInstruction = readingLevelInstruction(level);

        const systemPrompt = `You are an expert literary translator for an accessible reading app. Translate the user's text into ${lang.name}. ${levelInstruction} Return ONLY the translated text — no notes, no preamble, no quotation marks.`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4.1",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: sourceText },
          ],
          max_completion_tokens: 2000,
        });

        const translatedText = completion.choices[0]?.message?.content?.trim() || "";
        if (!translatedText) {
          res.status(502).json({ error: "translation_failed", message: "The translation came back empty. Please try again." });
          return;
        }

        // Successful translation → consume one translation credit.
        await incrementAiAddonUsage(userId, "ai_translation");

        // Optional: feed the translation into the narration pipeline (TTS).
        // This is itself a metered add-on, so it is gated independently and
        // never blocks returning the translated text.
        let audioContent: string | null = null;
        let narrationUpsell: Record<string, unknown> | null = null;
        const wantNarration = body.narrate === true;
        if (wantNarration) {
          if (!isElevenLabsConfigured()) {
            narrationUpsell = { error: "unconfigured", message: "Narration of translations isn't available right now." };
          } else {
            const narrationStatus = await getAiAddonStatus(userId, "ai_narration");
            if (!narrationStatus.allowed) {
              narrationUpsell = {
                error: "quota_exhausted",
                message: "You've used your narration allowance for this month. Upgrade to narrate translations.",
                upgradeRequired: true,
                feature: "ai_narration",
                currentTier: narrationStatus.tier,
              };
            } else {
              try {
                const buf = await elevenLabsTTS(translatedText.slice(0, MAX_NARRATION_CHARS), TRANSLATION_VOICE_ID);
                audioContent = `data:audio/mpeg;base64,${buf.toString("base64")}`;
                await incrementAiAddonUsage(userId, "ai_narration");
              } catch (err) {
                req.log?.error({ err }, "Translation narration failed");
                narrationUpsell = { error: "narration_failed", message: "Could not read the translation aloud right now." };
              }
            }
          }
        }

        const status = await getAiAddonStatus(userId, "ai_translation");
        res.json({
          translatedText,
          sourceText,
          targetLanguage: lang.code,
          targetLanguageName: lang.name,
          readingLevel: level,
          audioContent,
          narrationUpsell,
          usage: {
            limit: status.limit,
            used: status.used,
            remaining: status.remaining,
            unlimited: status.unlimited,
            tier: status.tier,
          },
        });
      } catch (err) {
        req.log?.error({ err }, "Translation error");
        res.status(500).json({ error: "translation_error", message: "Translation failed. Please try again." });
      }
    },
  );
}
