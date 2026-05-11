import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import {
  X,
  Send,
  Loader2,
  BookOpen,
  Headphones,
  BookText,
  HeartHandshake,
  Sparkles,
  Settings2,
  BarChart2,
  ChevronRight,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  bookResults?: BookResult[];
  isStreaming?: boolean;
}

interface BookResult {
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

interface A11yPrefs {
  profile: Record<string, unknown>;
  activePreset?: string | null;
}

const QUICK_ACTIONS = [
  { label: "Find me accessible books", icon: BookOpen },
  { label: "Adjust my settings", icon: Settings2 },
  { label: "Explain my reading stats", icon: BarChart2 },
  { label: "What should I read next?", icon: Sparkles },
];

function formatDuration(seconds?: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function BookCard({ book, onNavigate }: { book: BookResult; onNavigate: () => void }) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => { navigate(`/player?bookId=${book.id}`); onNavigate(); }}
      className="flex items-start gap-2 p-2 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-left w-full group"
    >
      {book.coverImage ? (
        <img src={book.coverImage} alt={book.title} className="w-10 h-14 object-cover rounded flex-shrink-0" />
      ) : (
        <div className="w-10 h-14 bg-muted rounded flex items-center justify-center flex-shrink-0">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-xs line-clamp-2 group-hover:text-primary">{book.title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{book.author}</p>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {book.contentType && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-medium">
              {book.contentType === "audiobook" ? <Headphones className="h-3 w-3" /> : <BookText className="h-3 w-3" />}
              {book.contentType === "audiobook" ? "Audio" : book.contentType === "ebook" ? "Ebook" : "Magazine"}
            </span>
          )}
          {book.genre && <span className="text-[10px] text-muted-foreground">{book.genre}</span>}
          {book.totalTime && <span className="text-[10px] text-muted-foreground">{book.totalTime}</span>}
          {!book.totalTime && book.duration && (
            <span className="text-[10px] text-muted-foreground">{formatDuration(book.duration)}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function CoachAvatar() {
  return (
    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center">
      <HeartHandshake className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
      <span className="text-[10px] font-bold text-primary-foreground">You</span>
    </div>
  );
}

function MessageBubble({ message, onNavigate }: { message: ChatMessage; onNavigate: () => void }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {isUser ? <UserAvatar /> : <CoachAvatar />}
      <div className={`flex flex-col gap-2 max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-emerald-50 dark:bg-emerald-950/30 text-foreground rounded-tl-sm border border-emerald-100 dark:border-emerald-900"
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
        {message.bookResults && message.bookResults.length > 0 && (
          <div className="w-full">
            <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {message.bookResults.length} book{message.bookResults.length !== 1 ? "s" : ""} found
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {message.bookResults.map((book) => (
                <BookCard key={book.id} book={book} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function buildGreeting(prefs: A11yPrefs | undefined, isAuthenticated: boolean): string {
  if (!isAuthenticated) {
    return "Hi! I'm your Accessibility Coach. I can help you find accessible books and suggest reading settings. Sign in for personalized advice!";
  }

  const preset = prefs?.activePreset;
  const profile = prefs?.profile ?? {};

  if (preset === "Dyslexia Optimized" || profile.dyslexiaFont) {
    return "Hello! I see you're using the Dyslexia profile. I can find books with short chapters, simple sentences, or audio narration — all great for dyslexic readers. What can I help you with?";
  }
  if (preset === "Low Vision" || profile.highContrast) {
    return "Hi! I can see you're using high contrast mode — great choice. I specialize in finding audiobooks and books with clean, accessible layouts. What would you like today?";
  }
  if (preset === "Motor Impaired" || preset === "Motor Impairment" || profile.voiceControlEnabled) {
    return "Hello! Your voice control is ready to go. I can suggest hands-free listening experiences and help you navigate AccessiBooks easily. What can I do for you?";
  }
  if (preset === "Screen Reader") {
    return "Hi! Your screen reader settings are active. I'll keep my responses clean and clear for easy listening. How can I help you today?";
  }

  return "Hello! I'm your Accessibility Coach. I can find accessible books, explain your reading settings, or suggest titles based on your needs. What can I help with?";
}

interface AccessibilityCoachPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional message to auto-send once the panel is open + initialized.
   *  Used by voice intents like "explain this" / "find easier books". */
  seedMessage?: string;
  /** Called after a seedMessage has been consumed so the parent can clear it. */
  onSeedConsumed?: () => void;
}

export function AccessibilityCoachPanel({
  isOpen,
  onClose,
  seedMessage,
  onSeedConsumed,
}: AccessibilityCoachPanelProps) {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: prefs } = useQuery<A11yPrefs>({
    queryKey: ["/api/a11y/preferences"],
    enabled: isOpen,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !initialized && prefs !== undefined) {
      const greeting = buildGreeting(prefs, isAuthenticated);
      setMessages([{ role: "assistant", content: greeting }]);
      setInitialized(true);
    }
  }, [isOpen, initialized, prefs, isAuthenticated]);

  useEffect(() => {
    if (!isOpen) {
      setMessages([]);
      setInitialized(false);
      setSessionCount(0);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return;

    if (!isAuthenticated && sessionCount >= 3) {
      toast({
        title: "Sign in to continue",
        description: "Create a free account to keep chatting with your Accessibility Coach.",
      });
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: content.trim() };
    const assistantMessage: ChatMessage = { role: "assistant", content: "", isStreaming: true };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInputValue("");
    setIsStreaming(true);
    setSessionCount((c) => c + 1);

    const controller = new AbortController();
    abortRef.current = controller;

    const historyForApi = [...messages, userMessage]
      .filter((m) => !m.isStreaming)
      .map((m) => ({ role: m.role, content: m.content }));

    let accumulated = "";
    let latestBooks: BookResult[] | null = null;

    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyForApi, sessionCount }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (err.error === "guest_limit") {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: "You've reached the guest limit. Sign in for unlimited coaching!",
              isStreaming: false,
            };
            return updated;
          });
          return;
        }
        throw new Error("Request failed");
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = "";

      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        const dataStr = line.slice(6).trim();
        if (!dataStr) return;
        let parsed: {
          content?: string;
          bookResults?: BookResult[];
          done?: boolean;
          error?: string;
        };
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
              content: "Sorry, I ran into an issue. Please try again.",
              isStreaming: false,
            };
            return updated;
          });
          return;
        }

        if (parsed.bookResults) latestBooks = parsed.bookResults;

        if (parsed.content) {
          accumulated += parsed.content;
          const snap = accumulated;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: snap,
              isStreaming: true,
              bookResults: latestBooks ?? undefined,
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
              bookResults: (parsed.bookResults ?? latestBooks) ?? undefined,
            };
            return updated;
          });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        const parts = lineBuffer.split("\n");
        lineBuffer = parts.pop() ?? "";
        for (const line of parts) processLine(line);
      }
      if (lineBuffer) processLine(lineBuffer);
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Sorry, something went wrong. Please try again.",
            isStreaming: false,
          };
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [isStreaming, messages, sessionCount, isAuthenticated, toast]);

  // Auto-send a seeded prompt from voice intents (Task #68). The parent
  // captures the message synchronously when the open-coach event fires
  // and passes it down — we wait until the panel is open + initialized
  // and not already streaming, then send it. We notify the parent via
  // onSeedConsumed so it can clear seedMessage; that lets the same
  // command fire again later (e.g. "explain this" said twice in a row).
  const seedHandledRef = useRef<boolean>(false);
  useEffect(() => {
    // Reset the guard whenever the seed clears so the next seed can fire.
    if (!seedMessage) {
      seedHandledRef.current = false;
      return;
    }
    if (!isOpen || !initialized || isStreaming || seedHandledRef.current) return;
    seedHandledRef.current = true;
    sendMessage(seedMessage);
    onSeedConsumed?.();
  }, [isOpen, initialized, seedMessage, isStreaming, sendMessage, onSeedConsumed]);
  useEffect(() => {
    if (!isOpen) seedHandledRef.current = false;
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  if (!isOpen) return null;

  const guestRemaining = Math.max(0, 3 - sessionCount);

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
        aria-label="Accessibility Coach"
        data-testid="accessibility-coach-panel"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0 bg-emerald-50/50 dark:bg-emerald-950/10">
          <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <HeartHandshake className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm">Accessibility Coach</h2>
            <p className="text-[11px] text-muted-foreground">
              {isAuthenticated
                ? prefs?.activePreset
                  ? `Profile: ${prefs.activePreset}`
                  : "Personalized reading guidance"
                : `Guest — ${guestRemaining} message${guestRemaining !== 1 ? "s" : ""} remaining`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-1.5"
            aria-label="Close Accessibility Coach"
            data-testid="button-close-coach"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <HeartHandshake className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Accessibility Coach</h3>
                <p className="text-sm text-muted-foreground max-w-[260px]">
                  Loading your profile...
                </p>
              </div>
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <MessageBubble key={idx} message={msg} onNavigate={onClose} />
              ))}

              {messages.length === 1 && !isStreaming && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => sendMessage(action.label)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:bg-muted/50 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors text-left text-xs text-muted-foreground hover:text-foreground group"
                    >
                      <action.icon className="h-3.5 w-3.5 shrink-0 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                      <span>{action.label}</span>
                      <ChevronRight className="h-3 w-3 ml-auto shrink-0 opacity-0 group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              )}

              {!isAuthenticated && guestRemaining === 0 && (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-center">
                  <p className="text-xs text-emerald-800 dark:text-emerald-200 font-medium mb-2">
                    You've used all guest messages
                  </p>
                  <a
                    href="/auth?tab=register"
                    className="inline-block text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-md hover:bg-emerald-700 transition-colors"
                  >
                    Create free account
                  </a>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        <div className="px-4 py-3 border-t border-border shrink-0">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about accessible books or settings..."
              className="flex-1 rounded-full text-sm"
              disabled={isStreaming || (!isAuthenticated && guestRemaining === 0)}
              aria-label="Message the Accessibility Coach"
              data-testid="coach-input"
            />
            <Button
              size="sm"
              onClick={() => sendMessage(inputValue)}
              disabled={!inputValue.trim() || isStreaming || (!isAuthenticated && guestRemaining === 0)}
              className="rounded-full px-3 bg-emerald-600 hover:bg-emerald-700 text-white"
              aria-label="Send message"
              data-testid="coach-send"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          {!isAuthenticated && guestRemaining > 0 && (
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              {guestRemaining} free message{guestRemaining !== 1 ? "s" : ""} remaining ·{" "}
              <a href="/auth?tab=register" className="text-emerald-600 dark:text-emerald-400 hover:underline">
                Sign in for unlimited
              </a>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
