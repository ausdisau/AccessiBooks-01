import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  MessageCircle,
  X,
  Plus,
  Send,
  Trash2,
  Bot,
  User,
  Loader2,
  BookOpen,
  Headphones,
  BookText,
  Newspaper,
  ChevronLeft,
  Sparkles,
  Lock,
} from "lucide-react";
import { useLocation } from "@/lib/wouter-compat";

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

interface BookResult {
  id: string;
  title: string;
  author: string;
  genre?: string | null;
  contentType?: string | null;
  language?: string | null;
  duration?: number | null;
  totalTime?: string | null;
  description?: string | null;
  coverImage?: string | null;
  isPremium?: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  bookResults?: BookResult[];
  isStreaming?: boolean;
}

const contentTypeIcon = (type?: string | null) => {
  switch (type) {
    case "audiobook":
      return <Headphones className="h-3 w-3" />;
    case "ebook":
      return <BookText className="h-3 w-3" />;
    case "magazine":
      return <Newspaper className="h-3 w-3" />;
    default:
      return <BookOpen className="h-3 w-3" />;
  }
};

function formatDuration(seconds?: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function BookCard({ book, onNavigate }: { book: BookResult; onNavigate: () => void }) {
  const [, navigate] = useLocation();

  const handleClick = () => {
    navigate(`/player?bookId=${book.id}`);
    onNavigate();
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-start gap-2 p-2 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-left w-full group"
    >
      {book.coverImage ? (
        <img
          src={book.coverImage}
          alt={book.title}
          className="w-10 h-14 object-cover rounded flex-shrink-0"
        />
      ) : (
        <div className="w-10 h-14 bg-muted rounded flex items-center justify-center flex-shrink-0">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-xs line-clamp-2 group-hover:text-primary transition-colors">
          {book.title}
        </p>
        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{book.author}</p>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {book.contentType && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-medium">
              {contentTypeIcon(book.contentType)}
              {book.contentType === "audiobook" ? "Audio" : book.contentType === "ebook" ? "Ebook" : "Magazine"}
            </span>
          )}
          {book.genre && (
            <span className="text-[10px] text-muted-foreground">{book.genre}</span>
          )}
          {book.totalTime && (
            <span className="text-[10px] text-muted-foreground">{book.totalTime}</span>
          )}
          {!book.totalTime && book.duration && book.duration > 0 && (
            <span className="text-[10px] text-muted-foreground">{formatDuration(book.duration)}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function MessageBubble({
  message,
  onNavigate,
}: {
  message: ChatMessage;
  onNavigate: () => void;
}) {
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

interface AiChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AiChatPanel({ isOpen, onClose }: AiChatPanelProps) {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [_, navigate] = useLocation();
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    enabled: isOpen,
  });

  const createConversationMutation = useMutation({
    mutationFn: async (title?: string) => {
      const res = await apiRequest("POST", "/api/conversations", { title: title || "New Chat" });
      return res.json();
    },
    onSuccess: (conv: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setActiveConversationId(conv.id);
      setChatMessages([]);
    },
    onError: () => {
      toast({ title: "Error", description: "Could not create conversation", variant: "destructive" });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/conversations/${id}`);
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (activeConversationId === deletedId) {
        setActiveConversationId(null);
        setChatMessages([]);
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Could not delete conversation", variant: "destructive" });
    },
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, scrollToBottom]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, activeConversationId]);

  const loadConversation = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) throw new Error("Failed to load");
      const data: ConversationWithMessages = await res.json();
      setActiveConversationId(id);
      setChatMessages(
        data.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      );
      setShowHistory(false);
    } catch {
      toast({ title: "Error", description: "Could not load conversation", variant: "destructive" });
    }
  }, [toast]);

  const startNewChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    createConversationMutation.mutate();
    setShowHistory(false);
  }, [createConversationMutation]);

  const sendMessage = useCallback(async () => {
    const content = inputValue.trim();
    if (!content || isStreaming) return;

    let convId = activeConversationId;

    // Auto-create conversation if none exists
    if (!convId) {
      try {
        const res = await apiRequest("POST", "/api/conversations", {
          title: content.slice(0, 50),
        });
        const conv: Conversation = await res.json();
        convId = conv.id;
        setActiveConversationId(conv.id);
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      } catch {
        toast({ title: "Error", description: "Could not start conversation", variant: "destructive" });
        return;
      }
    }

    setInputValue("");
    setIsStreaming(true);

    const userMessage: ChatMessage = { role: "user", content };
    const assistantMessage: ChatMessage = { role: "assistant", content: "", isStreaming: true };

    setChatMessages((prev) => [...prev, userMessage, assistantMessage]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulated = "";
    let latestBookResults: BookResult[] | null = null;

    try {
      const response = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Failed to send message");
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      // Buffer incomplete SSE lines across chunk boundaries
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
          toolCall?: unknown;
        };
        try {
          parsed = JSON.parse(dataStr);
        } catch {
          // Incomplete JSON — shouldn't happen if server sends whole objects per line
          return;
        }

        if (parsed.error) {
          setChatMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: "Sorry, I ran into an error. Please try again.",
              isStreaming: false,
            };
            return updated;
          });
          return;
        }

        if (parsed.bookResults) {
          latestBookResults = parsed.bookResults;
        }

        if (parsed.content) {
          accumulated += parsed.content;
          const snapshot = accumulated;
          setChatMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: snapshot,
              isStreaming: true,
              bookResults: latestBookResults ?? undefined,
            };
            return updated;
          });
        }

        if (parsed.done) {
          setChatMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: accumulated,
              isStreaming: false,
              bookResults: (parsed.bookResults ?? latestBookResults) ?? undefined,
            };
            return updated;
          });
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append newly decoded chunk to leftover buffer
        lineBuffer += decoder.decode(value, { stream: true });
        const parts = lineBuffer.split("\n");
        // The last element may be an incomplete line; hold it back
        lineBuffer = parts.pop() ?? "";
        for (const line of parts) {
          processLine(line);
        }
      }

      // Flush any remaining buffer content after stream closes
      if (lineBuffer) {
        processLine(lineBuffer);
        lineBuffer = "";
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        setChatMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Sorry, I ran into an error. Please try again.",
            isStreaming: false,
          };
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [inputValue, isStreaming, activeConversationId, toast]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-label="AI Chat Assistant"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          {/* Header is always shown — close button visible even for unauthenticated users */}
          {showHistory ? (
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)} className="p-1.5">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm">
              {showHistory ? "Chat History" : "AccessiBooks AI"}
            </h2>
            {!showHistory && (
              <p className="text-[11px] text-muted-foreground">Ask me anything about books</p>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="p-1.5 text-xs"
              title="Chat history"
            >
              <MessageCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={startNewChat}
              disabled={createConversationMutation.isPending}
              className="p-1.5"
              title="New chat"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="p-1.5" data-testid="button-close-chat" aria-label="Close chat">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Unauthenticated: prompt to sign in */}
        {authLoading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!authLoading && !isAuthenticated && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold mb-1.5">Sign in to chat</h3>
              <p className="text-sm text-muted-foreground max-w-[260px]">
                Create a free account or sign in to start asking the AI about books, audiobooks, and more.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Button
                className="w-full"
                onClick={() => { onClose(); navigate("/auth"); }}
              >
                Sign in
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => { onClose(); navigate("/auth?tab=register"); }}
              >
                Create account
              </Button>
            </div>
          </div>
        )}

        {/* Authenticated: history panel or chat */}
        {!authLoading && isAuthenticated && showHistory && (
          <ScrollArea className="flex-1 px-4 py-2">
            {conversationsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No conversations yet
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer group transition-colors ${
                      activeConversationId === conv.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted/60"
                    }`}
                    onClick={() => loadConversation(conv.id)}
                  >
                    <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-sm line-clamp-1">{conv.title}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 opacity-0 group-hover:opacity-100 transition-opacity h-auto"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversationMutation.mutate(conv.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        )}

        {!authLoading && isAuthenticated && !showHistory && (
          <>
            {/* Messages Area */}
            <ScrollArea className="flex-1 px-4 py-4">
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 gap-4 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">AccessiBooks AI</h3>
                    <p className="text-sm text-muted-foreground max-w-[260px]">
                      Ask me to recommend books, find titles by genre, or discover something new!
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
                    {[
                      "Recommend a mystery audiobook under 5 hours",
                      "Find something like Harry Potter",
                      "What sci-fi ebooks do you have?",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          setInputValue(suggestion);
                          setTimeout(() => inputRef.current?.focus(), 50);
                        }}
                        className="text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {chatMessages.map((msg, idx) => (
                    <MessageBubble key={idx} message={msg} onNavigate={onClose} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input Area */}
            <div className="px-4 py-3 border-t border-border shrink-0">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about books..."
                  className="flex-1 rounded-full text-sm"
                  disabled={isStreaming}
                />
                <Button
                  size="sm"
                  onClick={sendMessage}
                  disabled={!inputValue.trim() || isStreaming}
                  className="rounded-full w-9 h-9 p-0 shrink-0"
                >
                  {isStreaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                AI can make mistakes. Verify important information.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
