import { useState, useRef, useEffect, useCallback } from "react";
import { Book } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X,
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  RefreshCw,
  BookOpen,
  MessageCircleQuestion,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

interface ComprehensionCompanionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  page: number;
  totalPages: number;
  easyEnglish?: boolean;
}

const BASE_URL = import.meta.env.BASE_URL || "/";

function api(path: string): string {
  return `${BASE_URL.replace(/\/$/, "")}${path}`;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={`flex flex-col gap-2 max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted text-foreground rounded-tl-sm"
          }`}
        >
          {message.isStreaming && !message.content ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Thinking...
            </span>
          ) : (
            <span className="whitespace-pre-wrap">{message.content}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ComprehensionCompanionPanel({
  isOpen,
  onClose,
  book,
  page,
  totalPages,
  easyEnglish,
}: ComprehensionCompanionPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const runStream = useCallback(
    async (
      endpoint: "recap" | "summary" | "ask",
      body: Record<string, unknown>,
      precedingUserMessage?: string,
    ) => {
      if (isStreaming) return;
      setIsStreaming(true);

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setMessages((prev) => {
        const next = [...prev];
        if (precedingUserMessage) {
          next.push({ role: "user", content: precedingUserMessage });
        }
        next.push({ role: "assistant", content: "", isStreaming: true });
        return next;
      });

      let accumulated = "";

      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        const dataStr = line.slice(6).trim();
        if (!dataStr) return;
        let parsed: { content?: string; done?: boolean; error?: string };
        try {
          parsed = JSON.parse(dataStr);
        } catch {
          return;
        }
        if (parsed.error) {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: accumulated || "Sorry, I ran into a problem. Please try again.",
              isStreaming: false,
            };
            return updated;
          });
          return;
        }
        if (parsed.content) {
          accumulated += parsed.content;
          const snapshot = accumulated;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: snapshot,
              isStreaming: true,
            };
            return updated;
          });
        }
        if (parsed.done) {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: accumulated,
              isStreaming: false,
            };
            return updated;
          });
        }
      };

      try {
        const response = await fetch(api(`/api/companion/${endpoint}`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (response.status === 429) {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: "You've made a lot of requests. Please wait a moment and try again.",
              isStreaming: false,
            };
            return updated;
          });
          return;
        }
        if (!response.ok || !response.body) throw new Error("Request failed");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let lineBuffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          lineBuffer += decoder.decode(value, { stream: true });
          const parts = lineBuffer.split("\n");
          lineBuffer = parts.pop() ?? "";
          for (const line of parts) processLine(line);
        }
        if (lineBuffer) processLine(lineBuffer);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: accumulated || "Sorry, I ran into a problem. Please try again.",
              isStreaming: false,
            };
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [isStreaming],
  );

  const handleRecap = useCallback(() => {
    runStream(
      "recap",
      { bookId: book.id, page, easyEnglish },
      "Catch me up on the story so far.",
    );
  }, [runStream, book.id, page, easyEnglish]);

  const handleSummary = useCallback(() => {
    runStream(
      "summary",
      { bookId: book.id, easyEnglish },
      "Give me a plain-language summary of this book.",
    );
  }, [runStream, book.id, easyEnglish]);

  const handleAsk = useCallback(() => {
    const question = inputValue.trim();
    if (!question || isStreaming) return;
    setInputValue("");
    const history = messages
      .filter((m) => !m.isStreaming)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));
    runStream(
      "ask",
      { bookId: book.id, page, easyEnglish, question, history },
      question,
    );
  }, [inputValue, isStreaming, messages, runStream, book.id, page, easyEnglish]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-label="Comprehension Companion"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm">Comprehension Companion</h2>
            <p className="text-[11px] text-muted-foreground line-clamp-1">{book.title}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-1.5"
            aria-label="Close companion"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Quick actions */}
        <div className="px-4 py-3 border-b border-border shrink-0 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecap}
            disabled={isStreaming}
            className="justify-start gap-2 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Catch me up
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSummary}
            disabled={isStreaming}
            className="justify-start gap-2 text-xs"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Summarize
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageCircleQuestion className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Your reading helper</h3>
                <p className="text-sm text-muted-foreground max-w-[280px]">
                  Get a recap of the story so far, a plain-language summary, or ask
                  any question about the book.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <MessageBubble key={idx} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border shrink-0">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this book..."
              className="flex-1 rounded-full text-sm"
              disabled={isStreaming}
              maxLength={500}
            />
            <Button
              size="sm"
              onClick={handleAsk}
              disabled={isStreaming || !inputValue.trim()}
              className="rounded-full px-3"
              aria-label="Send question"
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Answers are based on the book up to where you are reading.
          </p>
        </div>
      </div>
    </>
  );
}
