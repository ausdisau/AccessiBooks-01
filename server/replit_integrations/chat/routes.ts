import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { chatStorage } from "./storage";
import { storage } from "../../storage";
import type { Book } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SYSTEM_PROMPT = `You are an AI assistant for AccessiBooks, a platform featuring audiobooks, ebooks, and magazines for everyone — including those with accessibility needs like visual impairments, dyslexia, and learning disabilities.

Your role is to help users:
- Discover audiobooks, ebooks, and magazines based on their interests, mood, or preferences
- Get personalized recommendations for genres like Fiction, Mystery, Sci-Fi, Romance, History, Biography, Self-Help, Fantasy, Thriller, Science, Technology, and Business
- Find books by format (audiobook, ebook, or magazine) and language (English, Spanish, French, German, etc.)
- Understand what's available in the AccessiBooks catalog
- Learn about book details (author, duration, genre)

You have access to a search_books tool that can query the real catalog. When a user asks about specific books, genres, or titles, USE the search_books tool to find actual results from the catalog rather than making things up.

When recommending books, be conversational and helpful. If the user's request is vague, ask clarifying questions. Always be friendly, warm, and enthusiastic about reading and listening.

When you display books to the user, mention key details like the title, author, format (audiobook/ebook/magazine), and genre if available.`;

const SEARCH_BOOKS_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_books",
    description:
      "Search the AccessiBooks catalog for books matching the given criteria. Use this whenever a user asks for book recommendations or searches for specific titles, authors, or genres.",
    parameters: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "The search query — can be a title, author name, genre, topic, or descriptive phrase",
        },
        genre: {
          type: "string",
          description:
            "Optional genre filter (e.g. Fiction, Mystery, Sci-Fi, Romance, History, Biography, Self-Help, Fantasy, Thriller, Science, Technology, Business)",
        },
        format: {
          type: "string",
          enum: ["audiobook", "ebook", "magazine"],
          description: "Optional content type filter",
        },
        language: {
          type: "string",
          description: "Optional language filter (e.g. English, Spanish, French, German)",
        },
      },
      required: ["query"],
    },
  },
};

interface SearchBooksArgs {
  query: string;
  genre?: string;
  format?: string;
  language?: string;
}

interface BookSummary {
  id: string;
  title: string;
  author: string;
  genre: string | null | undefined;
  contentType: string | null | undefined;
  language: string | null | undefined;
  duration: number | null | undefined;
  totalTime: string | null | undefined;
  description: string | null;
  coverImage: string | null | undefined;
  isPremium: boolean;
}

async function executeSearchBooks(args: SearchBooksArgs): Promise<BookSummary[]> {
  try {
    let books: Book[] = await storage.searchBooks(args.query);

    if (args.genre) {
      const genreLower = args.genre.toLowerCase();
      books = books.filter((b) => b.genre?.toLowerCase().includes(genreLower));
    }
    if (args.format) {
      const formatLower = args.format.toLowerCase();
      books = books.filter((b) => b.contentType?.toLowerCase() === formatLower);
    }
    if (args.language) {
      const langLower = args.language.toLowerCase();
      books = books.filter((b) => b.language?.toLowerCase().includes(langLower));
    }

    return books.slice(0, 6).map(
      (b): BookSummary => ({
        id: b.id,
        title: b.title,
        author: b.author,
        genre: b.genre,
        contentType: b.contentType,
        language: b.language,
        duration: b.duration,
        totalTime: b.totalTime,
        description: b.description ? b.description.slice(0, 200) : null,
        coverImage: b.coverImage,
        isPremium: b.isPremium,
      })
    );
  } catch (err) {
    console.error("[Chat] search_books error:", err);
    return [];
  }
}

function requireAuth(req: Request, res: Response): string | null {
  const r = req as Request & {
    isAuthenticated?: () => boolean;
    user?: { id?: string; claims?: { sub?: string } };
  };
  const authed = typeof r.isAuthenticated === "function" && r.isAuthenticated();
  if (!authed) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return r.user?.claims?.sub ?? r.user?.id ?? null;
}

export function registerChatRoutes(app: Express): void {
  // Get all conversations for the authenticated user
  app.get("/api/conversations", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const convs = await chatStorage.getAllConversations(userId);
      res.json(convs);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single conversation with messages — only if owned by authenticated user
  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id, userId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const msgs = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages: msgs });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create new conversation (requires auth)
  app.post("/api/conversations", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const { title } = req.body as { title?: string };
      const conversation = await chatStorage.createConversation(title || "New Chat", userId);
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Delete conversation — only owner (authenticated) may delete
  app.delete("/api/conversations/:id", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
      // Verify ownership before deleting
      const conversation = await chatStorage.getConversation(id, userId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      await chatStorage.deleteConversation(id, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send message and get AI response (streaming, requires auth)
  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body as { content: string };

      // Verify conversation ownership before posting
      const conversation = await chatStorage.getConversation(conversationId, userId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Save user message
      await chatStorage.createMessage(conversationId, "user", content);

      // Get conversation history for context
      const existingMessages = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...existingMessages.map(
          (m): ChatCompletionMessageParam => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })
        ),
      ];

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullResponse = "";
      let toolResultBooks: BookSummary[] | null = null;

      // First call with tool definitions
      const firstStream = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: chatMessages,
        tools: [SEARCH_BOOKS_TOOL],
        tool_choice: "auto",
        stream: true,
        max_completion_tokens: 4096,
      });

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
          fullResponse += delta.content;
          res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
        }
      }

      // If there was a tool call, execute it and stream a second response
      if (hasToolCall && toolCallName === "search_books") {
        let parsedArgs: SearchBooksArgs = { query: "" };
        try {
          parsedArgs = JSON.parse(toolCallArgs) as SearchBooksArgs;
        } catch {
          parsedArgs = { query: content };
        }

        const bookResults = await executeSearchBooks(parsedArgs);
        toolResultBooks = bookResults;

        // Send book results to frontend immediately so it can render book cards
        res.write(
          `data: ${JSON.stringify({ bookResults, toolCall: { name: toolCallName, args: parsedArgs } })}\n\n`
        );

        // Build second request with tool result
        const assistantToolCallMessage: ChatCompletionMessageParam = {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: { name: toolCallName, arguments: toolCallArgs },
            },
          ],
        };

        const toolResultMessage: ChatCompletionMessageParam = {
          role: "tool",
          tool_call_id: toolCallId,
          content: JSON.stringify(bookResults),
        };

        const toolResultMessages: ChatCompletionMessageParam[] = [
          ...chatMessages,
          assistantToolCallMessage,
          toolResultMessage,
        ];

        const secondStream = await openai.chat.completions.create({
          model: "gpt-4.1",
          messages: toolResultMessages,
          stream: true,
          max_completion_tokens: 4096,
        });

        for await (const chunk of secondStream) {
          const textContent = chunk.choices[0]?.delta?.content ?? "";
          if (textContent) {
            fullResponse += textContent;
            res.write(`data: ${JSON.stringify({ content: textContent })}\n\n`);
          }
        }
      }

      // Save the complete assistant message (text only)
      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      res.write(
        `data: ${JSON.stringify({ done: true, bookResults: toolResultBooks })}\n\n`
      );
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}
