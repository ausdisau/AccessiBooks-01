import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
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

const SYSTEM_PROMPT = `You are AccessiDJ, the friendly host of an inclusive audiobook & ebook radio show. Pick the best titles for the listener from the provided candidates and group them into 1–3 themed sets. Use a warm, conversational, accessibility-first voice (avoid jargon). Each set has a snappy intro (max 25 words). Each pick has a one-sentence rationale that personalises the choice.`;

const HUMAN_PROMPT = `Listener context:
{context}

Candidate library (id — title — author — genre):
{candidates}

Return JSON only matching this schema:
{{
  "sets": [
    {{
      "id": "kebab-case-id",
      "type": "agent",
      "title": "string",
      "intro": "string",
      "items": [
        {{ "bookId": "must match a candidate id", "rationale": "string", "score": 0-1 }}
      ]
    }}
  ],
  "source": "agent"
}}

Constraints:
- Use 1 to 3 sets.
- Each set has 3 to 6 items.
- Every bookId MUST exist in the candidates list above.
- Do not invent titles; use only the supplied books.`;

export interface AgentContext {
  userSummary: string;
  preferredGenres?: string[];
  recentBooks?: { title: string; author: string }[];
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

  const candidateList = candidates
    .slice(0, 30)
    .map((c) => `${c.book.id} — ${c.book.title} — ${c.book.author} — ${c.book.genre ?? "unknown"}`)
    .join("\n");

  const contextStr = [
    ctx.userSummary,
    ctx.preferredGenres?.length ? `Preferred genres: ${ctx.preferredGenres.join(", ")}` : null,
    ctx.recentBooks?.length
      ? `Recently listened: ${ctx.recentBooks.map((b) => `${b.title} (${b.author})`).join("; ")}`
      : null,
    `Local hour: ${ctx.hour}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", SYSTEM_PROMPT],
      ["human", HUMAN_PROMPT],
    ]);
    const llm = getLLM() as unknown as { bind: (opts: Record<string, unknown>) => unknown };
    const llmJson = llm.bind({ response_format: { type: "json_object" } });
    const chain = prompt.pipe(llmJson as ChatOpenAI);
    const resp: any = await chain.invoke({ context: contextStr, candidates: candidateList });
    const text = typeof resp?.content === "string" ? resp.content : JSON.stringify(resp?.content ?? resp);
    const parsed = agentRecommendationResponseSchema.parse(JSON.parse(text));

    // Filter out hallucinated bookIds.
    const validIds = new Set(candidates.map((c) => c.book.id));
    const cleanedSets = parsed.sets
      .map((s) => ({
        ...s,
        items: s.items.filter((i) => validIds.has(i.bookId)),
      }))
      .filter((s) => s.items.length >= 1);

    if (cleanedSets.length === 0) return fallbackResponse(candidates, ctx.hour);
    return { ...parsed, sets: cleanedSets, source: "agent", generatedAt: new Date().toISOString() };
  } catch (err) {
    console.warn("[recommendation/agent] LLM failed, falling back:", (err as Error).message);
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
