import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { db } from "./db";
import { accessibilityPreferences, bookTranscripts } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { storage } from "./storage";
import { EASY_ENGLISH_GUIDELINES } from "./easyEnglish";

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

// --- Bounds / abuse controls -------------------------------------------------
// Keep prompts small and predictable so a single request can never balloon the
// token budget regardless of book length.
const WORDS_PER_PAGE = 300; // matches the ebook reader + easyEnglish page model
const MAX_CONTEXT_CHARS = 14000; // hard cap on book text sent to the model
const MAX_QUESTION_CHARS = 500;
const MAX_HISTORY_TURNS = 6;

// Simple in-memory sliding-window rate limit keyed by user id (or guest IP).
const RATE_LIMIT = 40;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const usageWindow = new Map<string, { count: number; resetAt: number }>();

function rateKey(req: Request, userId: string | null): string {
  if (userId) return `companion:user:${userId}`;
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : (forwarded?.split(",")[0] ?? req.socket.remoteAddress ?? "unknown");
  return `companion:ip:${ip}`;
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  let entry = usageWindow.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
  }
  if (entry.count >= RATE_LIMIT) {
    usageWindow.set(key, entry);
    return false;
  }
  entry.count += 1;
  usageWindow.set(key, entry);
  return true;
}

function getUserId(req: Request): string | null {
  const r = req as Request & {
    isAuthenticated?: () => boolean;
    user?: { id?: string; claims?: { sub?: string } };
  };
  const authed = typeof r.isAuthenticated === "function" && r.isAuthenticated();
  if (!authed) return null;
  return r.user?.id ?? r.user?.claims?.sub ?? null;
}

function sendSSE(res: Response, data: object): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// --- Reading-level / Easy English preference resolution ----------------------
// Reuses the shared Easy English guidelines so companion output matches the
// plain-language conventions the rest of the app already uses. A user is served
// simplified output when they explicitly ask (client override, e.g. the reader's
// Easy English toggle) OR when their saved accessibility profile signals a need
// for simpler language.
async function resolveSimplify(userId: string | null, clientOverride?: boolean): Promise<boolean> {
  if (clientOverride === true) return true;
  if (!userId) return false;
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
    if (!row) return false;
    return !!(row.symbolSupport || row.dyslexiaFriendly || row.reduceDistraction);
  } catch {
    return false;
  }
}

function styleInstruction(simplify: boolean): string {
  if (simplify) {
    return `Write your answer in Easy English. Easy English uses:\n${EASY_ENGLISH_GUIDELINES}\nKeep it warm and encouraging.`;
  }
  return `Write in clear, plain, accessible language. Use short paragraphs and avoid jargon. Be warm and encouraging.`;
}

// --- Book text retrieval -----------------------------------------------------
// Fetches the book's text through the existing canonical content endpoint (the
// same source easyEnglish + narration use) so we never re-implement source
// fetching. Falls back to stored transcripts for audiobooks, then to the book
// description so the companion still does something useful.
async function fetchBookWords(bookId: string): Promise<string[] | null> {
  const baseUrl = `http://localhost:${process.env.PORT || 8080}`;
  try {
    const res = await fetch(`${baseUrl}/api/ebook/${bookId}/content`);
    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("text")) {
        const text = await res.text();
        const words = text.split(/\s+/).filter(Boolean);
        if (words.length > 0) return words;
      }
    }
  } catch {
    // ignore and try transcript fallback
  }

  // Audiobook fallback: stitch stored transcript segments together.
  try {
    const rows = await db
      .select({ segments: bookTranscripts.segments })
      .from(bookTranscripts)
      .where(eq(bookTranscripts.bookId, bookId))
      .orderBy(asc(bookTranscripts.chapterIndex));
    if (rows.length > 0) {
      const parts: string[] = [];
      for (const row of rows) {
        const segments = row.segments as unknown;
        if (Array.isArray(segments)) {
          for (const seg of segments) {
            const text = (seg as { text?: unknown })?.text;
            if (typeof text === "string" && text.trim()) parts.push(text.trim());
          }
        }
      }
      const words = parts.join(" ").split(/\s+/).filter(Boolean);
      if (words.length > 0) return words;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Build a bounded context window from `words`, keeping only up to `uptoWords`
 * (the reading position). If the slice is longer than the char budget, sample
 * the opening (setup) and the most recent text (where the user is now) so the
 * model has both the premise and the latest events without exceeding bounds.
 */
function boundContext(words: string[], uptoWords: number | null): { text: string; truncated: boolean } {
  const limit = uptoWords && uptoWords > 0 ? Math.min(uptoWords, words.length) : words.length;
  const slice = words.slice(0, limit);
  const full = slice.join(" ");
  if (full.length <= MAX_CONTEXT_CHARS) {
    return { text: full, truncated: false };
  }
  const headChars = Math.floor(MAX_CONTEXT_CHARS * 0.4);
  const tailChars = MAX_CONTEXT_CHARS - headChars;
  const head = full.slice(0, headChars);
  const tail = full.slice(full.length - tailChars);
  return {
    text: `${head}\n\n[...]\n\n${tail}`,
    truncated: true,
  };
}

interface BookMeta {
  title: string;
  author: string;
  genre: string | null;
  description: string | null;
}

async function getBookMeta(bookId: string): Promise<BookMeta | null> {
  try {
    const book = await storage.getBook(bookId);
    if (!book) return null;
    return {
      title: book.title,
      author: book.author,
      genre: book.genre ?? null,
      description: book.description ?? null,
    };
  } catch {
    return null;
  }
}

type Mode = "recap" | "summary" | "ask";

interface BuiltPrompt {
  system: string;
  user: string;
}

function buildPrompt(
  mode: Mode,
  meta: BookMeta,
  context: { text: string; truncated: boolean } | null,
  simplify: boolean,
  question: string,
): BuiltPrompt {
  const style = styleInstruction(simplify);
  const bookLine = `Book: "${meta.title}" by ${meta.author}${meta.genre ? ` (${meta.genre})` : ""}.`;
  const grounding = context
    ? `Use ONLY the book text provided below to ground your answer. Do not invent plot points that are not supported by the text. If the text does not contain the answer, say so plainly.`
    : `No full book text is available, so base your answer on the book description and general knowledge of the work. Be clear that details may be limited.`;

  const sourceBlock = context
    ? `BOOK TEXT (the part the reader has reached so far${context.truncated ? "; trimmed for length" : ""}):\n${context.text}`
    : `BOOK DESCRIPTION:\n${meta.description || "(no description available)"}`;

  if (mode === "recap") {
    return {
      system: `You are the AccessiBooks Comprehension Companion. You help readers — including people with cognitive or literacy needs — catch up on the story so far. ${grounding} ${style}`,
      user: `${bookLine}\n\nGive me a short "catch me up" recap of what has happened in the story up to this point. Cover the main characters, what they want, and the key events so far. Do not reveal anything beyond the point I've reached. Keep it to a few short paragraphs.\n\n${sourceBlock}`,
    };
  }

  if (mode === "summary") {
    return {
      system: `You are the AccessiBooks Comprehension Companion. You write plain-language summaries that help readers understand a book. ${grounding} ${style}`,
      user: `${bookLine}\n\nGive me a plain-language summary of this book: what it is about, the main characters, and the main idea or theme. Keep it accessible and easy to follow.\n\n${sourceBlock}`,
    };
  }

  // ask
  return {
    system: `You are the AccessiBooks Comprehension Companion. You answer a reader's questions about the book in accessible language. ${grounding} ${style}`,
    user: `${bookLine}\n\nReader's question: ${question}\n\nAnswer the question based on the book. If the answer would spoil events beyond the point the reader has reached, avoid spoilers and say so.\n\n${sourceBlock}`,
  };
}

async function streamCompletion(
  res: Response,
  prompt: BuiltPrompt,
  history: ChatCompletionMessageParam[],
  maxTokens: number,
): Promise<void> {
  if (!openai) {
    sendSSE(res, {
      content:
        "The comprehension companion isn't available right now because the AI service isn't configured. Please try again later.",
    });
    sendSSE(res, { done: true });
    res.end();
    return;
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: prompt.system },
    ...history,
    { role: "user", content: prompt.user },
  ];

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages,
      stream: true,
      max_completion_tokens: maxTokens,
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? "";
      if (text) sendSSE(res, { content: text });
    }
    sendSSE(res, { done: true });
    res.end();
  } catch (err) {
    console.error("[Companion] OpenAI error:", err);
    if (res.headersSent) {
      sendSSE(res, { error: "Companion error" });
      res.end();
    } else {
      res.status(500).json({ error: "Companion error" });
    }
  }
}

interface CompanionBody {
  bookId?: unknown;
  page?: unknown;
  easyEnglish?: unknown;
  question?: unknown;
  history?: unknown;
}

function parsePage(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function parseHistory(value: unknown): ChatCompletionMessageParam[] {
  if (!Array.isArray(value)) return [];
  const turns: ChatCompletionMessageParam[] = [];
  for (const item of value.slice(-MAX_HISTORY_TURNS)) {
    if (
      item &&
      typeof item === "object" &&
      (item as { role?: unknown }).role &&
      typeof (item as { content?: unknown }).content === "string"
    ) {
      const role = (item as { role: string }).role;
      if (role === "user" || role === "assistant") {
        turns.push({ role, content: ((item as { content: string }).content).slice(0, 2000) });
      }
    }
  }
  return turns;
}

export function registerComprehensionCompanionRoutes(app: Express): void {
  const handler = (mode: Mode) => async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      if (!checkRateLimit(rateKey(req, userId))) {
        res.status(429).json({ error: "rate_limited", message: "Too many requests. Please slow down and try again soon." });
        return;
      }

      const body = (req.body ?? {}) as CompanionBody;
      const bookId = typeof body.bookId === "string" ? body.bookId.trim() : "";
      if (!bookId) {
        res.status(400).json({ error: "bookId is required" });
        return;
      }

      const page = parsePage(body.page);
      const clientOverride = body.easyEnglish === true;

      let question = "";
      if (mode === "ask") {
        question = typeof body.question === "string" ? body.question.trim() : "";
        if (!question) {
          res.status(400).json({ error: "question is required" });
          return;
        }
        if (question.length > MAX_QUESTION_CHARS) {
          res.status(400).json({ error: "question too long" });
          return;
        }
      }

      const meta = await getBookMeta(bookId);
      if (!meta) {
        res.status(404).json({ error: "Book not found" });
        return;
      }

      const simplify = await resolveSimplify(userId, clientOverride);

      const words = await fetchBookWords(bookId);
      let context: { text: string; truncated: boolean } | null = null;
      if (words) {
        // For recap/ask we cut off at the reader's position to avoid spoilers.
        // For a whole-book summary we use everything available.
        const uptoWords = mode === "summary" || page === null ? null : page * WORDS_PER_PAGE;
        context = boundContext(words, uptoWords);
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const prompt = buildPrompt(mode, meta, context, simplify, question);
      const history = mode === "ask" ? parseHistory(body.history) : [];
      const maxTokens = mode === "summary" ? 700 : 600;

      await streamCompletion(res, prompt, history, maxTokens);
    } catch (err) {
      console.error("[Companion] handler error:", err);
      if (res.headersSent) {
        sendSSE(res, { error: "Companion error" });
        res.end();
      } else {
        res.status(500).json({ error: "Companion error" });
      }
    }
  };

  app.post("/api/companion/recap", handler("recap"));
  app.post("/api/companion/summary", handler("summary"));
  app.post("/api/companion/ask", handler("ask"));
}
