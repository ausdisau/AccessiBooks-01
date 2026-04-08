import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { db } from "./db";
import { accessibilityPreferences, listeningHistory } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { storage } from "./storage";
import type { Book } from "@shared/schema";

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

interface BookSummary {
  id: string;
  title: string;
  author: string;
  genre?: string | null;
  contentType?: string | null;
  coverImage?: string | null;
  duration?: number | null;
  totalTime?: string | null;
  description?: string | null;
  isPremium?: boolean;
}

interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

const SEARCH_BOOKS_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_books",
    description:
      "Search the AccessiBooks catalog for books matching the given criteria. Use this when the user asks for book recommendations, specific titles, authors, or genres — especially accessible books.",
    parameters: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query — title, author, genre, topic, or descriptive phrase",
        },
        genre: {
          type: "string",
          description: "Optional genre filter (e.g. Fiction, Mystery, Sci-Fi, Romance, History, Biography, Self-Help)",
        },
        format: {
          type: "string",
          enum: ["audiobook", "ebook", "magazine"],
          description: "Optional content type filter",
        },
      },
      required: ["query"],
    },
  },
};

interface SearchArgs {
  query: string;
  genre?: string;
  format?: string;
}

async function searchBooks(args: SearchArgs): Promise<BookSummary[]> {
  try {
    let books: Book[] = await storage.searchBooks(args.query);
    if (args.genre) {
      const g = args.genre.toLowerCase();
      books = books.filter((b) => b.genre?.toLowerCase().includes(g));
    }
    if (args.format) {
      const f = args.format.toLowerCase();
      books = books.filter((b) => b.contentType?.toLowerCase() === f);
    }
    return books.slice(0, 5).map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      genre: b.genre,
      contentType: b.contentType,
      coverImage: b.coverImage,
      duration: b.duration,
      totalTime: b.totalTime,
      description: b.description ? b.description.slice(0, 150) : null,
      isPremium: b.isPremium,
    }));
  } catch {
    return [];
  }
}

function sendSSE(res: Response, data: object): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function buildSystemPrompt(
  activePreset: string | null,
  profile: Record<string, unknown>,
  recentBooks: { bookTitle: string; bookAuthor: string | null }[]
): string {
  const presetLabel = activePreset ?? "None";
  const profileLines: string[] = [];
  if (profile.highContrast) profileLines.push("High Contrast mode enabled");
  if (profile.dyslexiaFont) profileLines.push("OpenDyslexic font enabled");
  if (profile.darkMode) profileLines.push("Dark mode enabled");
  if (profile.voiceControlEnabled) profileLines.push("Voice control enabled");
  if (profile.reducedMotion) profileLines.push("Reduced motion enabled");
  if (profile.screenReaderHints) profileLines.push("Screen reader hints enabled");
  if (typeof profile.fontSize === "number" && profile.fontSize !== 100)
    profileLines.push(`Font size: ${profile.fontSize}%`);
  if (typeof profile.lineSpacing === "number" && profile.lineSpacing !== 1.5)
    profileLines.push(`Line spacing: ${profile.lineSpacing}`);

  const recentBooksText =
    recentBooks.length > 0
      ? recentBooks.map((b) => `- "${b.bookTitle}" by ${b.bookAuthor ?? "Unknown"}`).join("\n")
      : "None yet";

  return `You are the AccessiBooks Accessibility Coach — a warm, knowledgeable reading companion for people with disabilities and accessibility needs.

YOUR PERSONALITY:
- Use short, clear sentences. Avoid jargon.
- Be warm, encouraging, and direct.
- Always acknowledge the user's specific accessibility needs.
- Proactively suggest accessibility settings or book formats that suit their profile.

THIS USER'S ACCESSIBILITY PROFILE:
- Active preset: ${presetLabel}
- Settings: ${profileLines.length > 0 ? profileLines.join(", ") : "Default settings"}

THEIR RECENT READING/LISTENING:
${recentBooksText}

YOUR CAPABILITIES:
- Recommend books from the AccessiBooks catalog (use the search_books tool)
- Advise on which accessibility settings to enable for specific needs (dyslexia, low vision, motor impairment, hearing impairment, cognitive differences)
- Explain what each accessibility preset does
- Help interpret reading stats and streaks
- Suggest books in accessible formats (audiobooks for visual impairments, short chapters for cognitive fatigue, etc.)
- Guide users to features like voice control, speed adjustment, captions, and bookmarks

ACCESSIBILITY PRESETS YOU KNOW ABOUT:
- Low Vision: large text, high contrast, simple layout
- Motor Impaired: voice control enabled, larger touch targets
- Dyslexia Optimized: OpenDyslexic font, wider spacing, reduced visual clutter
- Screen Reader: full ARIA hints, keyboard navigation optimized

Always respond in 1-3 short paragraphs unless listing books or settings. If the user seems overwhelmed, simplify.`;
}

async function fetchUserContext(userId: string): Promise<{
  activePreset: string | null;
  profile: Record<string, unknown>;
  recentBooks: { bookTitle: string; bookAuthor: string | null }[];
}> {
  try {
    const [prefsRow] = await db
      .select()
      .from(accessibilityPreferences)
      .where(eq(accessibilityPreferences.userId, userId))
      .limit(1);

    const recentRows = await db
      .select({ bookTitle: listeningHistory.bookTitle, bookAuthor: listeningHistory.bookAuthor })
      .from(listeningHistory)
      .where(eq(listeningHistory.userId, userId))
      .orderBy(desc(listeningHistory.lastPlayedAt))
      .limit(5);

    return {
      activePreset: prefsRow?.activePreset ?? null,
      profile: (prefsRow?.profile as Record<string, unknown>) ?? {},
      recentBooks: recentRows,
    };
  } catch {
    return { activePreset: null, profile: {}, recentBooks: [] };
  }
}

export function registerCoachRoutes(app: Express): void {
  app.post("/api/coach", async (req: Request, res: Response) => {
    try {
      const r = req as Request & {
        isAuthenticated?: () => boolean;
        user?: { id?: string };
      };

      const authed = typeof r.isAuthenticated === "function" && r.isAuthenticated();
      const userId = authed ? r.user?.id : null;

      const { messages, sessionCount = 0 } = req.body as {
        messages: CoachMessage[];
        sessionCount?: number;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array required" });
      }

      if (!authed && sessionCount >= 3) {
        return res.status(403).json({
          error: "guest_limit",
          message: "Sign in to continue chatting with your Accessibility Coach.",
        });
      }

      let userContext = { activePreset: null as string | null, profile: {} as Record<string, unknown>, recentBooks: [] as { bookTitle: string; bookAuthor: string | null }[] };
      if (userId) {
        userContext = await fetchUserContext(userId);
      }

      const systemPrompt = buildSystemPrompt(
        userContext.activePreset,
        userContext.profile,
        userContext.recentBooks
      );

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      if (!hasOpenAI || !openai) {
        const fallback = "Hi! I'm your Accessibility Coach. I can help you find accessible books and adjust your reading settings. Unfortunately, my AI engine isn't configured right now — please check back soon!";
        sendSSE(res, { content: fallback });
        sendSSE(res, { done: true });
        res.end();
        return;
      }

      const chatMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...messages.map((m): ChatCompletionMessageParam => ({
          role: m.role,
          content: m.content,
        })),
      ];

      const firstStream = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: chatMessages,
        tools: [SEARCH_BOOKS_TOOL],
        tool_choice: "auto",
        stream: true,
        max_completion_tokens: 2048,
      });

      let accumulated = "";
      let toolCallId = "";
      let toolCallName = "";
      let toolCallArgs = "";
      let hasToolCall = false;

      for await (const chunk of firstStream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.tool_calls && delta.tool_calls.length > 0) {
          hasToolCall = true;
          const tc = delta.tool_calls[0];
          if (tc.id) toolCallId = tc.id;
          if (tc.function?.name) toolCallName = tc.function.name;
          if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
        } else if (delta.content) {
          accumulated += delta.content;
          sendSSE(res, { content: delta.content });
        }
      }

      let bookResults: BookSummary[] | null = null;

      if (hasToolCall && toolCallName === "search_books") {
        let parsedArgs: SearchArgs = { query: "" };
        try {
          parsedArgs = JSON.parse(toolCallArgs) as SearchArgs;
        } catch {
          parsedArgs = { query: messages[messages.length - 1]?.content ?? "" };
        }

        bookResults = await searchBooks(parsedArgs);
        sendSSE(res, { bookResults });

        const secondStream = await openai.chat.completions.create({
          model: "gpt-4.1",
          messages: [
            ...chatMessages,
            {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: toolCallId,
                  type: "function",
                  function: { name: toolCallName, arguments: toolCallArgs },
                },
              ],
            },
            {
              role: "tool",
              tool_call_id: toolCallId,
              content: JSON.stringify(bookResults),
            },
          ],
          stream: true,
          max_completion_tokens: 2048,
        });

        for await (const chunk of secondStream) {
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) {
            accumulated += text;
            sendSSE(res, { content: text });
          }
        }
      }

      sendSSE(res, { done: true, bookResults });
      res.end();
    } catch (err) {
      console.error("[Coach] Error:", err);
      if (res.headersSent) {
        sendSSE(res, { error: "Coach error" });
        res.end();
      } else {
        res.status(500).json({ error: "Coach error" });
      }
    }
  });
}
