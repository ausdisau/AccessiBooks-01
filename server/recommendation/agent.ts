import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { createAgent, toolStrategy } from "langchain";
import { z } from "zod";
import {
  agentRecommendationResponseSchema,
  type AgentRecommendationResponse,
  type Book,
} from "@shared/schema";
import type { Candidate } from "./candidateService";

const MODEL_NAME = process.env.REC_AGENT_MODEL || "gpt-4o-mini";

let llm: ChatOpenAI | null = null;
function getLLM(): ChatOpenAI {
  if (llm) return llm;
  llm = new ChatOpenAI({
    model: MODEL_NAME,
    temperature: 0.7,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    },
  });
  return llm;
}

const SYSTEM_PROMPT = `You are AccessiDJ, the friendly host of an inclusive audiobook & ebook radio show.

You have three tools available:
- get-candidates: returns the candidate book pool with id, title, author, genre, score
- get-recent-history: returns the listener's recent listening history
- get-book-metadata: looks up extra metadata for a specific bookId

Workflow:
1. Call get-candidates first.
2. Call get-recent-history if you want to personalise based on past listens.
3. Optionally call get-book-metadata for any title you want richer details on.
4. Then return your final response in the structured format. Use 1-3 themed sets, each with 3-6 items.
   Each set has a snappy intro (max 25 words). Each pick has a one-sentence rationale that personalises the choice.
   Every bookId you return MUST be one of the candidate ids.

Use a warm, conversational, accessibility-first voice (avoid jargon).`;

export interface AgentContext {
  userSummary: string;
  preferredGenres?: string[];
  recentBooks?: { title: string; author: string; bookId?: string; lastPlayedAt?: string }[];
  hour: number;
}

function fallbackResponse(candidates: Candidate[], hour: number): AgentRecommendationResponse {
  const top = candidates.slice(0, 6);
  const intro =
    hour >= 22 || hour < 6
      ? "A quiet wind-down set for tonight."
      : hour < 12
        ? "A bright start for your morning listen."
        : "Easygoing picks for the rest of your day.";
  return {
    sets: [
      {
        id: "popular-now",
        type: "agent",
        title: "Popular right now",
        intro,
        items: top.map((c) => ({
          bookId: c.book.id,
          rationale: `${c.book.title} by ${c.book.author} is trending in our community.`,
          score: c.score,
        })),
      },
    ],
    source: "popularity",
    generatedAt: new Date().toISOString(),
  };
}

function buildTools(ctx: AgentContext, candidates: Candidate[], bookMap: Map<string, Book>) {
  const candidateSummary = candidates.slice(0, 30).map((c) => ({
    bookId: c.book.id,
    title: c.book.title,
    author: c.book.author,
    genre: c.book.genre ?? "unknown",
    score: Number(c.score.toFixed(4)),
    reason: c.reason,
  }));

  const getCandidatesTool = tool(
    async ({ limit }: { limit?: number }) => {
      const n = Math.max(1, Math.min(30, limit ?? 30));
      return JSON.stringify(candidateSummary.slice(0, n));
    },
    {
      name: "get-candidates",
      description: "Return the candidate book pool (id, title, author, genre, score, reason).",
      schema: z.object({ limit: z.number().int().min(1).max(30).optional() }),
    },
  );

  const getRecentHistoryTool = tool(
    async () => {
      return JSON.stringify({
        userSummary: ctx.userSummary,
        preferredGenres: ctx.preferredGenres ?? [],
        recentBooks: ctx.recentBooks ?? [],
        hour: ctx.hour,
      });
    },
    {
      name: "get-recent-history",
      description: "Return the listener's recent listening history and stated preferences.",
      schema: z.object({}),
    },
  );

  const getBookMetadataTool = tool(
    async ({ bookId }: { bookId: string }) => {
      const book = bookMap.get(bookId);
      if (!book) return JSON.stringify({ error: "not-found", bookId });
      return JSON.stringify({
        bookId: book.id,
        title: book.title,
        author: book.author,
        genre: book.genre ?? null,
        publishedYear: book.publishedYear ?? null,
        description: book.description ?? null,
      });
    },
    {
      name: "get-book-metadata",
      description: "Look up extra metadata (description, year, genre) for a specific bookId.",
      schema: z.object({ bookId: z.string().min(1) }),
    },
  );

  return [getCandidatesTool, getRecentHistoryTool, getBookMetadataTool];
}

const AGENT_TIMEOUT_MS = Number(process.env.REC_AGENT_TIMEOUT_MS || 15_000);

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function runDjAgent(
  ctx: AgentContext,
  candidates: Candidate[],
): Promise<AgentRecommendationResponse> {
  if (candidates.length === 0) {
    return {
      sets: [
        {
          id: "empty",
          type: "agent",
          title: "Nothing to play yet",
          intro: "Your library is still warming up — check back soon!",
          items: [{ bookId: "none", rationale: "No catalog data available yet." }],
        },
      ],
      source: "popularity",
      generatedAt: new Date().toISOString(),
    };
  }

  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    return fallbackResponse(candidates, ctx.hour);
  }

  const bookMap = new Map<string, Book>(candidates.map((c) => [c.book.id, c.book]));
  const tools = buildTools(ctx, candidates, bookMap);
  const validIds = new Set(candidates.map((c) => c.book.id));

  try {
    // createAgent's generics get tangled when tools + responseFormat are
    // combined; the runtime values are correctly typed and we re-validate the
    // structured output below via Zod.
    const agentParams = {
      model: getLLM(),
      tools,
      prompt: SYSTEM_PROMPT,
      responseFormat: toolStrategy(agentRecommendationResponseSchema),
    };
    const agent = createAgent(agentParams as unknown as Parameters<typeof createAgent>[0]);

    const userMessage =
      `Curate recommendations for this listener. Local hour: ${ctx.hour}. ` +
      `Use the tools to inspect candidates and history before deciding. ` +
      `Return 1-3 themed sets with rationales — every bookId MUST come from get-candidates.`;

    const result = await withTimeout(
      agent.invoke({ messages: [{ role: "user", content: userMessage }] }),
      AGENT_TIMEOUT_MS,
      "DJ agent",
    );

    // createAgent surfaces the parsed structured output as `structuredResponse`.
    const raw = (result as { structuredResponse?: unknown }).structuredResponse;
    if (!raw) throw new Error("agent did not return a structuredResponse");

    const parsed = agentRecommendationResponseSchema.parse(raw);

    // Filter out hallucinated bookIds.
    const cleanedSets = parsed.sets
      .map((s) => ({
        ...s,
        items: s.items.filter((i) => validIds.has(i.bookId)),
      }))
      .filter((s) => s.items.length >= 1);

    if (cleanedSets.length === 0) return fallbackResponse(candidates, ctx.hour);
    return { ...parsed, sets: cleanedSets, source: "agent", generatedAt: new Date().toISOString() };
  } catch (err) {
    console.warn("[recommendation/agent] Agent failed, falling back:", (err as Error).message);
    return fallbackResponse(candidates, ctx.hour);
  }
}

export function inflateBooks(
  resp: AgentRecommendationResponse,
  bookMap: Map<string, Book>,
) {
  return resp.sets.map((s) => ({
    id: s.id,
    type: s.type,
    title: s.title,
    description: s.intro,
    intro: s.intro,
    items: s.items.map((i) => ({ bookId: i.bookId, rationale: i.rationale, score: i.score })),
    books: s.items.map((i) => bookMap.get(i.bookId)).filter(Boolean) as Book[],
    source: resp.source,
  }));
}
