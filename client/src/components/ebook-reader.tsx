import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSubscription } from "@/hooks/use-subscription";
import { useAuth } from "@/hooks/useAuth";
import { Book } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  Bookmark,
  BookOpen,
  Sun,
  Moon,
  Minus,
  Plus,
  Home,
  Search,
  X,
  Maximize,
  Minimize,
  List,
  Highlighter,
  Clock,
  BarChart3,
  MessageSquare,
  Trash2,
  ArrowUp,
  ArrowDown,
  Palette,
  Sparkles,
  Lock,
  Mic,
  Radio,
  Play,
  CheckCircle,
  Music2,
  Shapes,
  Volume2,
} from "lucide-react";
import { useAudioContext } from "@/contexts/AudioContext";
import { useKaraokeAlignment } from "@/hooks/use-karaoke-alignment";
import { usePreferencesKernel } from "@/hooks/use-preferences-kernel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { localStorageService } from "@/lib/storage";
import { PdfViewer } from "./pdf-viewer";
import { EpubViewer } from "./epub-viewer";
import { TTSPlayer } from "./tts-player";
import { VisualReader } from "./visual-reader";
import { useToast } from "@/hooks/use-toast";

interface EbookReaderProps {
  book: Book;
  onBack: () => void;
}

interface ReadingSettings {
  fontSize: number;
  theme: "light" | "sepia" | "dark";
  fontFamily: "serif" | "sans-serif" | "mono" | "dyslexia";
  lineHeight: number;
  margins: "narrow" | "normal" | "wide";
}

interface Annotation {
  id: string;
  page: number;
  startOffset: number;
  endOffset: number;
  text: string;
  note: string;
  color: string;
  createdAt: string;
}

interface SearchResult {
  page: number;
  wordIndex: number;
  context: string;
}

interface TocEntry {
  title: string;
  page: number;
  level: number;
}

const defaultSettings: ReadingSettings = {
  fontSize: 18,
  theme: "light",
  fontFamily: "serif",
  lineHeight: 1.8,
  margins: "normal",
};

const HIGHLIGHT_COLORS = [
  { name: "Yellow", value: "#fef08a" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Orange", value: "#fed7aa" },
];

const WORDS_PER_PAGE = 300;

const SYMBOL_MAP: Record<string, string> = {
  dog: "🐕", cat: "🐈", house: "🏠", book: "📚", happy: "😊", sad: "😢",
  man: "👨", woman: "👩", child: "👧", walk: "🚶", run: "🏃", eat: "🍽️",
  sleep: "😴", car: "🚗", tree: "🌳", water: "💧", fire: "🔥", sun: "☀️",
  moon: "🌙", star: "⭐", love: "❤️", family: "👨‍👩‍👧", school: "🏫",
  money: "💰", food: "🍎", music: "🎵", phone: "📱", computer: "💻",
  king: "👑", queen: "👑", prince: "🤴", princess: "👸", knight: "⚔️",
  castle: "🏰", ship: "🚢", sea: "🌊", mountain: "⛰️", forest: "🌲",
  bird: "🐦", horse: "🐴", fish: "🐟", flower: "🌸", rain: "🌧️",
  night: "🌙", day: "☀️", time: "⏰", death: "💀", life: "✨",
  sword: "⚔️", magic: "🪄", dark: "🌑", light: "💡", voice: "🗣️",
  eye: "👁️", heart: "❤️", hand: "✋", face: "😐", door: "🚪",
  road: "🛣️", town: "🏘️", city: "🏙️", farm: "🌾", river: "🏞️",
};

function applyBionicReading(word: string): [string, string] {
  const clean = word.replace(/[^a-zA-Z]/g, "");
  if (clean.length <= 1) return [word, ""];
  const mid = Math.max(1, Math.ceil(clean.length / 2));
  const firstIdx = word.indexOf(clean[0]);
  const bold = word.slice(0, firstIdx + mid);
  const rest = word.slice(firstIdx + mid);
  return [bold, rest];
}

function getSymbol(word: string): string | null {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  return SYMBOL_MAP[clean] ?? null;
}

interface PrecomputedWord {
  word: string;
  bio: [string, string] | null;
  symbol: string | null;
}

type ContentFormat = "text" | "pdf" | "epub" | "unknown";

function detectContentFormat(book: Book): ContentFormat {
  const url = book.contentUrl?.toLowerCase() || "";
  if (url.endsWith(".pdf")) return "pdf";
  if (url.endsWith(".epub")) return "epub";
  if (url.endsWith(".txt") || url.endsWith(".html") || url.endsWith(".htm")) return "text";
  if (url.includes("gutenberg.org") && url.includes(".txt")) return "text";
  if (url.includes("archive.org") && url.includes("_djvu.txt")) return "text";
  return "text";
}

export function EbookReader({ book, onBack }: EbookReaderProps) {
  const { data: detectedFormat, isLoading: isDetecting } = useQuery<ContentFormat>({
    queryKey: ["ebook-format", book.id],
    queryFn: async () => {
      const urlFormat = detectContentFormat(book);
      if (urlFormat !== "text") return urlFormat;
      try {
        const response = await fetch(`/api/ebook/${book.id}/content`, { method: "HEAD" });
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/pdf")) return "pdf" as ContentFormat;
        if (contentType.includes("application/epub") || contentType.includes("application/zip")) return "epub" as ContentFormat;
        return "text" as ContentFormat;
      } catch {
        return "text" as ContentFormat;
      }
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  if (isDetecting) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <BookOpen className="h-12 w-12 animate-pulse text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Preparing reader...</p>
        </div>
      </div>
    );
  }

  if (detectedFormat === "pdf") return <PdfViewer book={book} onBack={onBack} />;
  if (detectedFormat === "epub") return <EpubViewer book={book} onBack={onBack} />;
  return <TextReader book={book} onBack={onBack} />;
}

function TextReader({ book, onBack }: EbookReaderProps) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [settings, setSettings] = useState<ReadingSettings>(() => {
    const saved = localStorage.getItem(`ebook-settings-${book.id}`);
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  });
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [highlightedWordIndex, setHighlightedWordIndex] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchIdx, setCurrentSearchIdx] = useState(-1);
  const [showToc, setShowToc] = useState(false);
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0].value);
  const [annotationNote, setAnnotationNote] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [readingStartTime] = useState(() => Date.now());
  const [pageTransition, setPageTransition] = useState<"none" | "slide-left" | "slide-right">("none");
  const [easyEnglishMode, setEasyEnglishMode] = useState(false);
  const [easyEnglishText, setEasyEnglishText] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const [a11ySettings, setA11ySettings] = useState(() => localStorageService.getSettings());
  useEffect(() => {
    const sync = () => setA11ySettings(localStorageService.getSettings());
    document.addEventListener("accessibooks:settings-changed", sync);
    return () => document.removeEventListener("accessibooks:settings-changed", sync);
  }, []);

  const bionicReading = !!a11ySettings.bionicReading;
  const symbolOverlay = !!a11ySettings.symbolOverlay;

  const [quizQuestions, setQuizQuestions] = useState<{ question: string; options: string[]; correct: number }[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<(number | null)[]>([]);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showBreakPrompt, setShowBreakPrompt] = useState(false);

  const { profile: a11yProfile } = usePreferencesKernel();
  const followAlong = a11yProfile.karaokeFollowAlong ?? false;

  const [clickedWordData, setClickedWordData] = useState<{ word: string; rect: DOMRect } | null>(null);
  const [pageSymbolImageCache, setPageSymbolImageCache] = useState<Record<string, string | null>>({});
  const symbolFetchRef = useRef<string>("");

  useEffect(() => {
    if (!symbolOverlay || !pageContent) {
      setPageSymbolImageCache({});
      symbolFetchRef.current = "";
      return;
    }
    const cacheKey = `${currentPage}:${pageContent.slice(0, 60)}`;
    if (symbolFetchRef.current === cacheKey) return;
    symbolFetchRef.current = cacheKey;

    let cancelled = false;

    (async () => {
      try {
        const kwRes = await fetch("/api/symbols/keywords", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: pageContent }),
        });
        if (cancelled || !kwRes.ok) return;
        const { keywords } = await kwRes.json() as { keywords: string[] };
        if (!keywords?.length) return;

        const results = await Promise.all(
          keywords.map(async (w: string) => {
            try {
              const r = await fetch(`/api/symbols/${encodeURIComponent(w)}`);
              const d = await r.json() as { url: string | null };
              return [w, d.url] as [string, string | null];
            } catch {
              return [w, null] as [string, null];
            }
          })
        );

        if (!cancelled) {
          const cache: Record<string, string | null> = {};
          for (const [w, url] of results) cache[w] = url;
          setPageSymbolImageCache(cache);
        }
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [symbolOverlay, pageContent, currentPage]);

  const handleToggleSymbolOverlay = () => {
    const newSettings = { ...a11ySettings, symbolOverlay: !a11ySettings.symbolOverlay };
    localStorageService.saveSettings(newSettings);
    document.dispatchEvent(new CustomEvent("accessibooks:settings-changed"));
  };

  const handleWordClick = useCallback((word: string, rect: DOMRect) => {
    const clean = word.replace(/[^a-zA-Z'-]/g, "");
    if (!clean || clean.length < 2) return;
    setClickedWordData({ word: clean.toLowerCase(), rect });
  }, []);

  const audioCtx = useAudioContext();
  const isAudioMatchingBook = audioCtx.currentBook?.id === book.id;
  const karaokeTimeMs = followAlong && isAudioMatchingBook ? audioCtx.currentTime * 1000 : 0;
  const { isAvailable: karaokeAvailable, activeWordIndex: karaokeWordIndex } = useKaraokeAlignment(
    followAlong && isAudioMatchingBook ? book.id : null,
    karaokeTimeMs
  );

  const explainMutation = useMutation({
    mutationFn: async (passage: string) => {
      const res = await apiRequest("POST", "/api/ai/explain-passage", {
        passage,
        context: book.description?.slice(0, 200),
      });
      if (!res.ok) throw new Error("Explanation failed");
      return res.json() as Promise<{ explanation: string }>;
    },
  });

  const quizMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/chapter-checkin", {
        chapterText: pageContent,
        title: book.title,
        bookId: String(book.id),
        chapterIndex: currentPage,
      });
      if (!res.ok) throw new Error("Quiz failed");
      return res.json() as Promise<{ questions: { question: string; options: string[]; correct: number }[] }>;
    },
    onSuccess: (data) => {
      setQuizQuestions(data.questions ?? []);
      setQuizAnswers((data.questions ?? []).map(() => null));
      setShowQuiz(true);
      setShowBreakPrompt(false);
    },
  });

  const [showChapterPreview, setShowChapterPreview] = useState(false);
  const [chapterPreviewText, setChapterPreviewText] = useState<string | null>(null);
  const [chapterPreviewTitle, setChapterPreviewTitle] = useState<string | null>(null);
  const prevPageRef = useRef<number>(1);
  const chapterPreviewMutation = useMutation({
    mutationFn: async ({ text, chapterIdx }: { text: string; chapterIdx: number }) => {
      const res = await apiRequest("POST", "/api/ai/chapter-preview", {
        chapterText: text,
        title: book.title,
        bookId: String(book.id),
        chapterIndex: chapterIdx,
      });
      if (!res.ok) throw new Error("Preview failed");
      return res.json() as Promise<{ preview: string }>;
    },
    onSuccess: (data) => {
      setChapterPreviewText(data.preview ?? null);
      setShowChapterPreview(true);
    },
  });

  const chapterBoundaryPageRef = useRef<number | null>(null);

  interface ReaderPictureCheckinData {
    question: string;
    options: string[];
    symbolUrls: (string | null)[];
  }
  const [showPictureCheckin, setShowPictureCheckin] = useState(false);
  const [pictureCheckinData, setPictureCheckinData] = useState<ReaderPictureCheckinData | null>(null);
  const [pictureCheckinSelected, setPictureCheckinSelected] = useState<number | null>(null);

  const logReaderCheckinAction = (action: "answered" | "skipped") => {
    try {
      const key = "accessibooks:checkin-log";
      const logs: unknown[] = JSON.parse(localStorage.getItem(key) ?? "[]");
      logs.push({ bookId: String(book.id), chapterIdx: currentPage, action, ts: Date.now() });
      localStorage.setItem(key, JSON.stringify(logs.slice(-100)));
    } catch {}
  };

  const readerPictureCheckinMutation = useMutation({
    mutationFn: async ({ text, chapterIdx }: { text: string; chapterIdx: number }) => {
      const res = await apiRequest("POST", "/api/ai/chapter-picture-checkin", {
        chapterText: text,
        title: book.title,
        bookId: String(book.id),
        chapterIndex: chapterIdx,
      });
      if (!res.ok) throw new Error("Check-in failed");
      return res.json() as Promise<{ question: string; options: string[] }>;
    },
    onSuccess: async (data) => {
      const urls = await Promise.all(
        (data.options ?? []).map(async (w: string) => {
          try {
            const r = await fetch(`/api/symbols/${encodeURIComponent(w.toLowerCase())}`);
            const d = await r.json() as { url: string | null };
            return d.url ?? null;
          } catch {
            return null;
          }
        })
      );
      setPictureCheckinData({ question: data.question, options: data.options, symbolUrls: urls });
      setPictureCheckinSelected(null);
      setShowPictureCheckin(true);
    },
  });

  useEffect(() => {
    const pacingMinutes = a11ySettings.sessionPacingMinutes ?? 0;
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    if (pacingMinutes > 0) {
      sessionTimerRef.current = setInterval(() => {
        setShowBreakPrompt(true);
      }, pacingMinutes * 60 * 1000);
    }
    return () => { if (sessionTimerRef.current) clearInterval(sessionTimerRef.current); };
  }, [a11ySettings.sessionPacingMinutes]);
  const { isPremium, isPlus } = useSubscription();
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === "admin";
  const canGenerateNarration = isPremium || isPlus || isAdmin;

  const { data: easyEnglishStatus, refetch: refetchEasyEnglishStatus } = useQuery<{
    freeChaptersRemaining: number | null;
    hasAddonSubscription: boolean;
    chaptersConvertedThisMonth: number;
    monthlyAllowance: number;
  }>({
    queryKey: ["/api/easy-english/status"],
    retry: false,
  });

  const convertMutation = useMutation({
    mutationFn: async ({ bookId, chapterNumber }: { bookId: string; chapterNumber: number }) => {
      const res = await apiRequest("POST", "/api/easy-english/convert", { bookId, chapterNumber });
      if (res.status === 402) {
        const data = await res.json();
        throw Object.assign(new Error("paywall"), { paywall: true, data });
      }
      if (!res.ok) throw new Error("Conversion failed");
      return res.json() as Promise<{ convertedText: string; fromCache: boolean }>;
    },
    onSuccess: (data) => {
      setEasyEnglishText(data.convertedText);
      setEasyEnglishMode(true);
      setShowPaywall(false);
      refetchEasyEnglishStatus();
    },
    onError: (err: any) => {
      if (err.paywall) {
        setShowPaywall(true);
        setEasyEnglishMode(false);
      } else {
        toast({ title: "Conversion failed", description: "Could not convert to Easy English. Try again.", variant: "destructive" });
      }
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/easy-english/subscribe");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Subscribe failed");
      }
      return res.json() as Promise<{ checkoutUrl: string }>;
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (err: any) => {
      toast({ title: "Subscription failed", description: err.message, variant: "destructive" });
    },
  });

  const { data: existingNarration, refetch: refetchNarration } = useQuery<{
    narrationUrl: string;
    voiceId: string;
    createdAt: string;
  } | null>({
    queryKey: ["/api/audiobook/narration", book.id],
    queryFn: async () => {
      const res = await fetch(`/api/audiobook/narration/${book.id}`);
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  const generateNarrationMutation = useMutation({
    mutationFn: async (voiceId?: string) => {
      const res = await apiRequest("POST", "/api/audiobook/generate", {
        bookId: book.id,
        ...(voiceId ? { voiceId } : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).message || "Failed to generate narration");
      }
      return res.json() as Promise<{ narrationUrl: string; voiceId: string; chunks: number }>;
    },
    onSuccess: () => {
      refetchNarration();
      toast({
        title: "Narration generated",
        description: "Your audiobook narration is ready to play.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Narration failed",
        description: err.message || "Could not generate narration. Try again.",
        variant: "destructive",
      });
    },
  });

  const handleEasyEnglishToggle = () => {
    if (easyEnglishMode) {
      setEasyEnglishMode(false);
      setEasyEnglishText(null);
      setShowPaywall(false);
      return;
    }
    if (easyEnglishText) {
      setEasyEnglishMode(true);
      return;
    }
    if (!pageContent) {
      toast({ title: "No content to convert", variant: "destructive" });
      return;
    }
    convertMutation.mutate({ bookId: book.id, chapterNumber: currentPage });
  };

  const words = useMemo(() => content.split(/\s+/).filter(Boolean), [content]);

  useEffect(() => {
    setEasyEnglishMode(false);
    setEasyEnglishText(null);
    setShowPaywall(false);
  }, [currentPage]);

  useEffect(() => {
    loadContent();
    loadReadingProgress();
    loadBookmarks();
    loadAnnotations();
  }, [book.id]);

  useEffect(() => {
    localStorage.setItem(`ebook-settings-${book.id}`, JSON.stringify(settings));
  }, [settings, book.id]);

  const loadContent = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/ebook/${book.id}/content`);
      if (!response.ok) throw new Error("Failed to load ebook content");
      const text = await response.text();
      setContent(text);
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const pages = Math.max(1, Math.ceil(wordCount / WORDS_PER_PAGE));
      setTotalPages(pages);
      generateToc(text, pages);
    } catch {
      setError("Unable to load ebook content. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const generateToc = (text: string, numPages: number) => {
    const allWords = text.split(/\s+/).filter(Boolean);
    const entries: TocEntry[] = [];
    const chapterPatterns = [
      /^(CHAPTER|Chapter)\s+[IVXLCDM\d]+/,
      /^(PART|Part)\s+[IVXLCDM\d]+/,
      /^(BOOK|Book)\s+[IVXLCDM\d]+/,
      /^(ACT|Act)\s+[IVXLCDM\d]+/,
      /^(SECTION|Section)\s+\d+/,
      /^(PROLOGUE|EPILOGUE|INTRODUCTION|PREFACE|FOREWORD|CONCLUSION)/i,
    ];

    for (let i = 0; i < allWords.length; i++) {
      const chunk = allWords.slice(i, i + 6).join(" ");
      for (const pattern of chapterPatterns) {
        if (pattern.test(chunk)) {
          const page = Math.floor(i / WORDS_PER_PAGE) + 1;
          const title = allWords.slice(i, Math.min(i + 6, allWords.length)).join(" ").replace(/[.,:;!?]$/, "");
          const level = chunk.match(/^(PART|Part|BOOK|Book)/i) ? 0 : 1;
          if (entries.length === 0 || entries[entries.length - 1].page !== page) {
            entries.push({ title, page, level });
          }
          break;
        }
      }
    }

    if (entries.length === 0) {
      const interval = Math.max(1, Math.floor(numPages / 10));
      for (let p = 1; p <= numPages; p += interval) {
        entries.push({ title: `Section ${Math.ceil(p / interval)}`, page: p, level: 0 });
      }
    }

    setTocEntries(entries);
  };

  const loadReadingProgress = () => {
    const progress = localStorageService.getProgress(book.id);
    if (progress?.currentTime) {
      setCurrentPage(Math.max(1, Math.floor(progress.currentTime)));
    }
  };

  const loadBookmarks = () => {
    const saved = localStorage.getItem(`ebook-bookmarks-${book.id}`);
    if (saved) setBookmarks(JSON.parse(saved));
  };

  const loadAnnotations = async () => {
    const saved = localStorage.getItem(`ebook-annotations-${book.id}`);
    if (saved) setAnnotations(JSON.parse(saved));

    try {
      const res = await fetch(`/api/annotations/${book.id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.synced && data.annotations?.length > 0) {
          setAnnotations(data.annotations);
          localStorage.setItem(`ebook-annotations-${book.id}`, JSON.stringify(data.annotations));
        }
      }
    } catch {}
  };

  const saveAnnotations = useCallback((anns: Annotation[]) => {
    setAnnotations(anns);
    localStorage.setItem(`ebook-annotations-${book.id}`, JSON.stringify(anns));

    apiRequest("POST", "/api/annotations/sync", {
      bookId: book.id,
      annotations: anns,
      bookmarks: JSON.parse(localStorage.getItem(`ebook-bookmarks-${book.id}`) || "[]"),
    }).catch(() => {});
  }, [book.id]);

  const saveProgress = useCallback((page: number) => {
    localStorageService.saveProgress({
      bookId: book.id,
      currentTime: page,
      lastPlayed: new Date().toISOString(),
    });
  }, [book.id]);

  const goToPage = useCallback((page: number, direction?: "left" | "right") => {
    const newPage = Math.max(1, Math.min(totalPages, page));
    if (newPage === currentPage) return;

    const dir = direction || (newPage > currentPage ? "left" : "right");
    setPageTransition(dir === "left" ? "slide-left" : "slide-right");

    setTimeout(() => {
      setCurrentPage(newPage);
      saveProgress(newPage);
      contentRef.current?.scrollTo(0, 0);
      setTimeout(() => setPageTransition("none"), 300);
    }, 150);
  }, [currentPage, totalPages, saveProgress]);

  const toggleBookmark = () => {
    const newBookmarks = bookmarks.includes(currentPage)
      ? bookmarks.filter(p => p !== currentPage)
      : [...bookmarks, currentPage].sort((a, b) => a - b);
    setBookmarks(newBookmarks);
    localStorage.setItem(`ebook-bookmarks-${book.id}`, JSON.stringify(newBookmarks));
    toast({
      title: bookmarks.includes(currentPage) ? "Bookmark removed" : "Bookmark added",
      description: `Page ${currentPage}`,
    });
  };

  const updateSetting = <K extends keyof ReadingSettings>(key: K, value: ReadingSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const nextPageDataRef = useRef<{ page: number; content: string; precomputed: PrecomputedWord[] } | null>(null);

  const getPageContent = useCallback(() => {
    if (!words.length) return "";
    if (nextPageDataRef.current?.page === currentPage) {
      return nextPageDataRef.current.content;
    }
    const startIdx = (currentPage - 1) * WORDS_PER_PAGE;
    const endIdx = startIdx + WORDS_PER_PAGE;
    return words.slice(startIdx, endIdx).join(" ");
  }, [words, currentPage]);

  const pageContent = useMemo(() => getPageContent(), [getPageContent]);

  useEffect(() => {
    const prev = prevPageRef.current;
    prevPageRef.current = currentPage;
    if (currentPage === 1) return;
    if (!pageContent) return;

    const isChapterBoundary = tocEntries.length > 0
      ? tocEntries.some(e => e.page === currentPage && e.page !== prev)
      : currentPage > prev && (currentPage - 1) % 15 === 0;

    if (isChapterBoundary) {
      chapterBoundaryPageRef.current = currentPage;
      const tocEntry = tocEntries.find(e => e.page === currentPage);
      setChapterPreviewTitle(tocEntry?.title ?? null);

      if (a11ySettings.chapterPreviews) {
        chapterPreviewMutation.mutate({ text: pageContent, chapterIdx: currentPage });
      }
      if (a11ySettings.comprehensionCheckIns && !showPictureCheckin) {
        readerPictureCheckinMutation.mutate({ text: pageContent, chapterIdx: currentPage });
      }
    }
  }, [currentPage, pageContent]);

  useEffect(() => {
    if (!followAlong || !isAudioMatchingBook || karaokeWordIndex === null) return;
    const targetPage = Math.floor(karaokeWordIndex / WORDS_PER_PAGE) + 1;
    if (targetPage !== currentPage && targetPage >= 1 && targetPage <= totalPages) {
      setCurrentPage(targetPage);
      saveProgress(targetPage);
      contentRef.current?.scrollTo(0, 0);
    }
  }, [karaokeWordIndex, followAlong, isAudioMatchingBook, totalPages, saveProgress]);

  useEffect(() => {
    if (!words.length || currentPage >= totalPages) return;
    const nextPage = currentPage + 1;
    const timeout = setTimeout(() => {
      const startIdx = (nextPage - 1) * WORDS_PER_PAGE;
      const endIdx = startIdx + WORDS_PER_PAGE;
      const nextWords = words.slice(startIdx, endIdx);
      nextPageDataRef.current = {
        page: nextPage,
        content: nextWords.join(" "),
        precomputed: nextWords.map((w) => ({
          word: w,
          bio: bionicReading ? applyBionicReading(w) : null,
          symbol: symbolOverlay ? getSymbol(w) : null,
        })),
      };
    }, 0);
    return () => clearTimeout(timeout);
  }, [currentPage, totalPages, words, bionicReading, symbolOverlay]);

  const performSearch = useCallback((query: string) => {
    if (!query.trim() || !content) {
      setSearchResults([]);
      setCurrentSearchIdx(-1);
      return;
    }
    const lowerQuery = query.toLowerCase();
    const results: SearchResult[] = [];
    const allWords = content.split(/\s+/).filter(Boolean);

    for (let i = 0; i < allWords.length; i++) {
      const chunk = allWords.slice(i, i + query.split(/\s+/).length).join(" ");
      if (chunk.toLowerCase().includes(lowerQuery)) {
        const page = Math.floor(i / WORDS_PER_PAGE) + 1;
        const contextStart = Math.max(0, i - 5);
        const contextEnd = Math.min(allWords.length, i + 10);
        results.push({
          page,
          wordIndex: i % WORDS_PER_PAGE,
          context: "..." + allWords.slice(contextStart, contextEnd).join(" ") + "...",
        });
        i += query.split(/\s+/).length - 1;
      }
    }
    setSearchResults(results);
    setCurrentSearchIdx(results.length > 0 ? 0 : -1);
    if (results.length > 0) {
      goToPage(results[0].page);
    }
  }, [content, goToPage]);

  const navigateSearch = (direction: "next" | "prev") => {
    if (searchResults.length === 0) return;
    const newIdx = direction === "next"
      ? (currentSearchIdx + 1) % searchResults.length
      : (currentSearchIdx - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIdx(newIdx);
    goToPage(searchResults[newIdx].page);
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      return;
    }
    const text = selection.toString().trim();
    if (text.length > 0) {
      setSelectedText(text);
      const pageWords = pageContent.split(/\s+/);
      const selWords = text.split(/\s+/);

      let startIdx = -1;
      for (let i = 0; i <= pageWords.length - selWords.length; i++) {
        const candidate = pageWords.slice(i, i + selWords.length).join(" ");
        if (candidate.includes(selWords.join(" ")) || selWords[0] === pageWords[i]) {
          const match = selWords.every((sw, si) => pageWords[i + si]?.includes(sw));
          if (match) { startIdx = i; break; }
        }
      }

      if (startIdx === -1) {
        startIdx = pageWords.findIndex(w => w.includes(selWords[0]));
      }
      if (startIdx === -1) startIdx = 0;
      const endIdx = Math.min(startIdx + selWords.length, pageWords.length);
      setSelectionRange({ start: startIdx, end: endIdx });
      setShowAnnotationPanel(true);
    }
  };

  const addAnnotation = () => {
    if (!selectedText || !selectionRange) return;
    const ann: Annotation = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      page: currentPage,
      startOffset: selectionRange.start,
      endOffset: selectionRange.end,
      text: selectedText,
      note: annotationNote,
      color: highlightColor,
      createdAt: new Date().toISOString(),
    };
    saveAnnotations([...annotations, ann]);
    setSelectedText("");
    setSelectionRange(null);
    setAnnotationNote("");
    setShowAnnotationPanel(false);
    toast({ title: "Highlight saved" });
  };

  const removeAnnotation = (id: string) => {
    saveAnnotations(annotations.filter(a => a.id !== id));
    toast({ title: "Highlight removed" });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      readerContainerRef.current?.requestFullscreen?.().catch(() => {
        toast({ title: "Fullscreen not available", description: "Your browser blocked fullscreen mode.", variant: "destructive" });
      });
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && elapsed < 500) {
      if (deltaX < 0 && currentPage < totalPages) {
        goToPage(currentPage + 1, "left");
      } else if (deltaX > 0 && currentPage > 1) {
        goToPage(currentPage - 1, "right");
      }
    }
  };

  const handleReaderKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive = target.closest("button, input, select, textarea, [role='slider'], [role='menuitem'], [role='combobox']");
    if (isInteractive) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      goToPage(currentPage + 1, "left");
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      goToPage(currentPage - 1, "right");
    } else if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setShowSearch(true);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else if (e.key === "Escape") {
      if (showSearch) setShowSearch(false);
      if (showToc) setShowToc(false);
      if (showAnnotationPanel) setShowAnnotationPanel(false);
    }
  };

  const currentPageAnnotations = annotations.filter(a => a.page === currentPage);

  const themeStyles = {
    light: { bg: "bg-amber-50", text: "text-gray-800", headerBg: "bg-white border-gray-200", cardBg: "bg-white", mutedText: "text-gray-600", inputBg: "bg-white border-gray-300 text-gray-800" },
    sepia: { bg: "bg-[#f4ecd8]", text: "text-[#5b4636]", headerBg: "bg-[#e8dcc8] border-[#d4c4a8]", cardBg: "bg-[#f9f1e1]", mutedText: "text-[#8b7355]", inputBg: "bg-[#f9f1e1] border-[#d4c4a8] text-[#5b4636]" },
    dark: { bg: "bg-gray-900", text: "text-gray-200", headerBg: "bg-gray-800 border-gray-700", cardBg: "bg-gray-800 border-gray-700", mutedText: "text-gray-400", inputBg: "bg-gray-800 border-gray-600 text-white" },
  };
  const theme = themeStyles[settings.theme];

  const fontFamilyClass: Record<string, string> = {
    serif: "font-serif",
    "sans-serif": "font-sans",
    mono: "font-mono",
    dyslexia: "font-sans",
  };

  const marginClass = { narrow: "max-w-4xl", normal: "max-w-3xl", wide: "max-w-2xl" };

  const readingTimeMinutes = Math.round((Date.now() - readingStartTime) / 60000);
  const wordsRead = (currentPage - 1) * WORDS_PER_PAGE;
  const totalWords = words.length;
  const wordsRemaining = Math.max(0, totalWords - wordsRead);
  const avgWpm = readingTimeMinutes > 0 ? Math.round(wordsRead / readingTimeMinutes) : 250;
  const estimatedMinutesLeft = Math.round(wordsRemaining / (avgWpm || 250));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <BookOpen className="h-12 w-12 animate-pulse text-primary mx-auto" />
          <p className="text-muted-foreground">Loading ebook...</p>
          <div className="w-48 h-2 bg-muted rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "60%" }} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-destructive mb-4">{error}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={loadContent}>Try Again</Button>
              <Button onClick={onBack}><Home className="h-4 w-4 mr-2" />Back to Library</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      ref={readerContainerRef}
      className={`min-h-screen transition-colors duration-300 ${theme.bg} relative`}
      role="document"
      aria-label={`Reading ${book.title} by ${book.author}`}
      onKeyDown={handleReaderKeyDown}
      tabIndex={-1}
    >
      {showToc && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowToc(false)} />
          <div className={`relative w-80 max-w-[85vw] h-full ${settings.theme === "dark" ? "bg-gray-900" : "bg-white"} shadow-2xl`}>
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className={`font-semibold ${theme.text}`}>Table of Contents</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowToc(false)}><X className="h-4 w-4" /></Button>
            </div>
            <ScrollArea className="h-[calc(100%-60px)]">
              <div className="p-2">
                {tocEntries.map((entry, i) => (
                  <button
                    key={i}
                    onClick={() => { goToPage(entry.page); setShowToc(false); }}
                    className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors hover:bg-primary/10 ${
                      entry.page === currentPage ? "bg-primary/15 font-medium" : ""
                    } ${theme.text}`}
                    style={{ paddingLeft: `${(entry.level + 1) * 12}px` }}
                  >
                    <span className="block truncate">{entry.title}</span>
                    <span className={`text-xs ${theme.mutedText}`}>Page {entry.page}</span>
                  </button>
                ))}

                {bookmarks.length > 0 && (
                  <>
                    <Separator className="my-3" />
                    <p className={`px-3 py-1 text-xs font-semibold uppercase tracking-wider ${theme.mutedText}`}>Bookmarks</p>
                    {bookmarks.map(page => (
                      <button
                        key={`bm-${page}`}
                        onClick={() => { goToPage(page); setShowToc(false); }}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-primary/10 flex items-center gap-2 ${theme.text}`}
                      >
                        <Bookmark className="h-3.5 w-3.5 fill-primary text-primary flex-shrink-0" />
                        Page {page}
                      </button>
                    ))}
                  </>
                )}

                {annotations.length > 0 && (
                  <>
                    <Separator className="my-3" />
                    <p className={`px-3 py-1 text-xs font-semibold uppercase tracking-wider ${theme.mutedText}`}>Highlights</p>
                    {annotations.map(ann => (
                      <button
                        key={ann.id}
                        onClick={() => { goToPage(ann.page); setShowToc(false); }}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-primary/10 ${theme.text}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ann.color }} />
                          <span className="truncate">{ann.text.slice(0, 40)}...</span>
                        </span>
                        <span className={`text-xs ${theme.mutedText}`}>Page {ann.page}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}

      <header className={`sticky top-0 z-30 border-b transition-colors duration-300 ${theme.headerBg}`} role="banner">
        <div className={`${marginClass[settings.margins]} mx-auto px-4 py-2 flex items-center justify-between`}>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back to library">
              <ChevronLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowToc(true)} aria-label="Table of contents">
              <List className="h-4 w-4" />
            </Button>
          </div>

          <div className={`flex items-center gap-2 text-sm ${theme.mutedText}`}>
            <span>Page {currentPage} of {totalPages}</span>
          </div>

          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setShowSearch(!showSearch); if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 100); }} aria-label="Search">
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleBookmark}
              aria-label={bookmarks.includes(currentPage) ? "Remove bookmark" : "Add bookmark"}
            >
              <Bookmark className={`h-4 w-4 ${bookmarks.includes(currentPage) ? "fill-primary text-primary" : ""}`} />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowStats(!showStats)} aria-label="Reading stats">
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button
              variant={symbolOverlay ? "default" : "ghost"}
              size="icon"
              className={`h-8 w-8 ${symbolOverlay ? "bg-amber-500 text-white hover:bg-amber-600" : ""}`}
              onClick={handleToggleSymbolOverlay}
              aria-label={symbolOverlay ? "Hide symbols" : "Show Symbols (picture vocabulary)"}
              aria-pressed={symbolOverlay}
              title={symbolOverlay ? "Symbols: ON — tap any word for picture + definition" : "Show Symbols — display pictures above keywords"}
            >
              <Shapes className="h-4 w-4" />
            </Button>
            <Button
              variant={easyEnglishMode ? "default" : "ghost"}
              size="icon"
              className={`h-8 w-8 ${easyEnglishMode ? "bg-purple-600 text-white hover:bg-purple-700" : ""}`}
              onClick={handleEasyEnglishToggle}
              disabled={convertMutation.isPending}
              aria-label="Easy English mode"
              title="Easy English"
            >
              {convertMutation.isPending ? (
                <span className="h-4 w-4 block rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Reading settings"><Settings className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Reading Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="p-3 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Font Size</span>
                      <span className="text-sm text-muted-foreground">{settings.fontSize}px</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateSetting("fontSize", Math.max(12, settings.fontSize - 2))} aria-label="Decrease font size">
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Slider value={[settings.fontSize]} min={12} max={32} step={2} onValueChange={([v]) => updateSetting("fontSize", v)} className="flex-1" aria-label="Font size" />
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateSetting("fontSize", Math.min(32, settings.fontSize + 2))} aria-label="Increase font size">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <span className="text-sm font-medium block mb-2">Line Spacing</span>
                    <div className="flex items-center gap-2">
                      <Slider value={[settings.lineHeight]} min={1.2} max={2.5} step={0.1} onValueChange={([v]) => updateSetting("lineHeight", v)} className="flex-1" aria-label="Line spacing" />
                      <span className="text-sm text-muted-foreground w-8">{settings.lineHeight.toFixed(1)}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-sm font-medium block mb-2">Theme</span>
                    <div className="flex gap-2">
                      <Button variant={settings.theme === "light" ? "default" : "outline"} size="sm" onClick={() => updateSetting("theme", "light")}>
                        <Sun className="h-4 w-4 mr-1" />Light
                      </Button>
                      <Button variant={settings.theme === "sepia" ? "default" : "outline"} size="sm" onClick={() => updateSetting("theme", "sepia")} className="text-[#8b7355]">
                        <BookOpen className="h-4 w-4 mr-1" />Sepia
                      </Button>
                      <Button variant={settings.theme === "dark" ? "default" : "outline"} size="sm" onClick={() => updateSetting("theme", "dark")}>
                        <Moon className="h-4 w-4 mr-1" />Dark
                      </Button>
                    </div>
                  </div>

                  <div>
                    <span className="text-sm font-medium block mb-2">Font</span>
                    <div className="flex flex-wrap gap-2">
                      {(["serif", "sans-serif", "mono", "dyslexia"] as const).map(f => (
                        <Button
                          key={f}
                          variant={settings.fontFamily === f ? "default" : "outline"}
                          size="sm"
                          onClick={() => updateSetting("fontFamily", f)}
                          className={f === "serif" ? "font-serif" : f === "mono" ? "font-mono" : ""}
                        >
                          {f === "dyslexia" ? "Dyslexia" : f.charAt(0).toUpperCase() + f.slice(1).replace("-", " ")}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-sm font-medium block mb-2">Margins</span>
                    <div className="flex gap-2">
                      {(["narrow", "normal", "wide"] as const).map(m => (
                        <Button key={m} variant={settings.margins === m ? "default" : "outline"} size="sm" onClick={() => updateSetting("margins", m)}>
                          {m.charAt(0).toUpperCase() + m.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {showSearch && (
          <div className={`border-t px-4 py-2 ${theme.headerBg}`}>
            <div className={`${marginClass[settings.margins]} mx-auto flex items-center gap-2`}>
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") performSearch(searchQuery);
                    if (e.key === "Escape") setShowSearch(false);
                  }}
                  placeholder="Search in book..."
                  className="pl-8 h-8"
                />
              </div>
              <Button size="sm" variant="outline" onClick={() => performSearch(searchQuery)}>Find</Button>
              {searchResults.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{currentSearchIdx + 1}/{searchResults.length}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateSearch("prev")}><ArrowUp className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateSearch("next")}><ArrowDown className="h-3 w-3" /></Button>
                </div>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {showStats && (
          <div className={`border-t px-4 py-3 ${theme.headerBg}`}>
            <div className={`${marginClass[settings.margins]} mx-auto flex flex-wrap items-center justify-around gap-4 text-sm`}>
              <div className="flex items-center gap-1.5">
                <Clock className={`h-4 w-4 ${theme.mutedText}`} />
                <span className={theme.text}>{readingTimeMinutes} min reading</span>
              </div>
              <div className="flex items-center gap-1.5">
                <BarChart3 className={`h-4 w-4 ${theme.mutedText}`} />
                <span className={theme.text}>{wordsRead.toLocaleString()} words read</span>
              </div>
              <div className="flex items-center gap-1.5">
                <BookOpen className={`h-4 w-4 ${theme.mutedText}`} />
                <span className={theme.text}>~{estimatedMinutesLeft} min left</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={theme.text}>{Math.round((currentPage / totalPages) * 100)}% complete</span>
              </div>
            </div>
          </div>
        )}
      </header>

      <main
        className={`${marginClass[settings.margins]} mx-auto px-4 py-6`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="text-center mb-6">
          <h1 className={`text-xl sm:text-2xl font-bold mb-1 ${theme.text}`}>{book.title}</h1>
          <p className={theme.mutedText}>by {book.author}</p>
        </div>

        {easyEnglishStatus && !easyEnglishStatus.hasAddonSubscription && (
          <div className={`mb-4 flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm ${settings.theme === "dark" ? "bg-purple-900/30 border border-purple-700/40" : "bg-purple-50 border border-purple-200"}`}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500 flex-shrink-0" />
              <span className={settings.theme === "dark" ? "text-purple-200" : "text-purple-800"}>
                Easy English:{" "}
                <span className="font-semibold">
                  {easyEnglishStatus.freeChaptersRemaining} free chapter{easyEnglishStatus.freeChaptersRemaining !== 1 ? "s" : ""} remaining this month
                </span>
              </span>
            </div>
            {easyEnglishMode && (
              <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-300 text-xs">
                Easy English ON
              </Badge>
            )}
          </div>
        )}

        {easyEnglishStatus?.hasAddonSubscription && easyEnglishMode && (
          <div className={`mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${settings.theme === "dark" ? "bg-purple-900/30 border border-purple-700/40" : "bg-purple-50 border border-purple-200"}`}>
            <Sparkles className="h-4 w-4 text-purple-500" />
            <span className={settings.theme === "dark" ? "text-purple-200" : "text-purple-800"}>
              Easy English mode active
            </span>
            <Badge variant="secondary" className="ml-auto bg-purple-100 text-purple-800 border-purple-300 text-xs">
              Add-on Active
            </Badge>
          </div>
        )}

        <div className="mb-4">
          <TTSPlayer
            text={pageContent}
            bookTitle={book.title}
            currentPage={currentPage}
            totalPages={totalPages}
            onNextPage={() => goToPage(currentPage + 1, "left")}
            onPrevPage={() => goToPage(currentPage - 1, "right")}
            darkMode={settings.theme === "dark"}
            onWordIndex={setHighlightedWordIndex}
          />
        </div>

        {followAlong && (
          <div
            className={`mb-4 flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm ${
              settings.theme === "dark"
                ? "bg-green-900/30 border border-green-700/40"
                : "bg-green-50 border border-green-200"
            }`}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2">
              <Music2 className="h-4 w-4 text-green-600 flex-shrink-0" aria-hidden="true" />
              <span className={settings.theme === "dark" ? "text-green-200" : "text-green-800"}>
                {!isAudioMatchingBook
                  ? "Follow Along: play this book's audio to sync"
                  : !karaokeAvailable
                  ? "Follow Along: no transcript available for this book"
                  : karaokeWordIndex !== null
                  ? "Follow Along active — words highlighted as audio plays"
                  : "Follow Along ready — start audio to begin"}
              </span>
            </div>
            {isAudioMatchingBook && karaokeAvailable && (
              <Badge
                variant="secondary"
                className={
                  settings.theme === "dark"
                    ? "bg-green-800 text-green-100 border-green-600 text-xs"
                    : "bg-green-100 text-green-800 border-green-300 text-xs"
                }
              >
                {audioCtx.isPlaying ? "Syncing" : "Paused"}
              </Badge>
            )}
          </div>
        )}

        <div className={`mb-4 border rounded-lg p-3 ${settings.theme === "dark" ? "bg-gray-800/50 border-gray-700" : "bg-muted/30 border-border"}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              <span className={`text-sm font-medium ${settings.theme === "dark" ? "text-gray-200" : "text-foreground"}`}>
                Full Audiobook Narration
              </span>
              {existingNarration && (
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 border-green-300">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Ready
                </Badge>
              )}
            </div>
            {!existingNarration ? (
              canGenerateNarration ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => generateNarrationMutation.mutate()}
                  disabled={generateNarrationMutation.isPending}
                >
                  {generateNarrationMutation.isPending ? (
                    <>
                      <Mic className="h-3 w-3 mr-1 animate-pulse" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Mic className="h-3 w-3 mr-1" />
                      Generate Narration
                    </>
                  )}
                </Button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Lock className="h-3 w-3 text-muted-foreground" />
                  <span className={`text-xs ${settings.theme === "dark" ? "text-gray-400" : "text-muted-foreground"}`}>
                    Plus or Premium required
                  </span>
                </div>
              )
            ) : (
              <div className="flex items-center gap-2">
                <audio
                  controls
                  src={existingNarration.narrationUrl}
                  className="h-8 max-w-[200px] sm:max-w-xs"
                  style={{ borderRadius: "6px" }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => generateNarrationMutation.mutate()}
                  disabled={generateNarrationMutation.isPending}
                  title="Re-generate narration"
                >
                  {generateNarrationMutation.isPending ? (
                    <Mic className="h-3 w-3 animate-pulse" />
                  ) : (
                    <Mic className="h-3 w-3" />
                  )}
                </Button>
              </div>
            )}
          </div>
          {generateNarrationMutation.isPending && (
            <p className={`mt-2 text-xs ${settings.theme === "dark" ? "text-gray-400" : "text-muted-foreground"}`}>
              Synthesizing narration via ElevenLabs — this may take a minute for longer books…
            </p>
          )}
        </div>

        <div className="mb-4">
          <VisualReader
            bookId={book.id}
            bookTitle={book.title || ""}
            bookGenre={book.genre || undefined}
            currentPage={currentPage}
            totalPages={totalPages}
            bookText={content}
            darkMode={settings.theme === "dark"}
          />
        </div>

        <div className={`relative overflow-hidden rounded-lg ${pageTransition !== "none" ? "transition-transform duration-300" : ""}`}>
          <Card className={`${theme.cardBg} transition-colors duration-300 ${pageTransition === "slide-left" ? "animate-slide-in-left" : pageTransition === "slide-right" ? "animate-slide-in-right" : ""}`}>
            <CardContent className="p-6 sm:p-8 md:p-12">
              {(showChapterPreview || chapterPreviewMutation.isPending) && a11ySettings.chapterPreviews ? (
                <div
                  className="flex flex-col items-center gap-5 text-center py-4"
                  role="note"
                  aria-label="Chapter preview"
                >
                  <span className="text-5xl" aria-hidden="true">📖</span>
                  <div className="max-w-sm">
                    <p className={`font-semibold text-base mb-2 ${theme.text}`}>
                      {chapterPreviewTitle ? `Coming up: ${chapterPreviewTitle}` : "Coming up next"}
                    </p>
                    {chapterPreviewMutation.isPending ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin inline-block" />
                        Preparing a preview…
                      </div>
                    ) : (
                      <p className={`text-sm leading-relaxed ${theme.mutedText}`}>{chapterPreviewText}</p>
                    )}
                  </div>
                  {!chapterPreviewMutation.isPending && (
                    <Button
                      size="lg"
                      onClick={() => setShowChapterPreview(false)}
                      aria-label="Dismiss chapter preview and start reading"
                    >
                      Start Reading
                    </Button>
                  )}
                </div>
              ) : showPaywall ? (
                <div className="text-center py-8 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto">
                    <Lock className="h-8 w-8 text-purple-500" />
                  </div>
                  <div>
                    <h3 className={`text-lg font-semibold mb-1 ${theme.text}`}>Free Easy English allowance used up</h3>
                    <p className={`text-sm ${theme.mutedText}`}>
                      You've used your {easyEnglishStatus?.monthlyAllowance ?? 3} free Easy English chapters this month. Subscribe to the add-on to convert unlimited chapters.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button
                      onClick={() => subscribeMutation.mutate()}
                      disabled={subscribeMutation.isPending}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {subscribeMutation.isPending ? "Subscribing..." : "Subscribe — $0.49/chapter"}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowPaywall(false); setEasyEnglishMode(false); }}>
                      Continue with original text
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  ref={contentRef}
                  className={`
                    ${fontFamilyClass[settings.fontFamily]}
                    ${theme.text}
                    leading-relaxed select-text
                  `}
                  style={{
                    fontSize: `${settings.fontSize}px`,
                    lineHeight: settings.lineHeight,
                    letterSpacing: settings.fontFamily === "dyslexia" ? "0.05em" : undefined,
                    wordSpacing: settings.fontFamily === "dyslexia" ? "0.1em" : undefined,
                  }}
                  onMouseUp={handleTextSelection}
                >
                  {easyEnglishMode && easyEnglishText ? (
                    <div>
                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-purple-200/50">
                        <Sparkles className="h-4 w-4 text-purple-500" />
                        <span className={`text-xs font-medium ${settings.theme === "dark" ? "text-purple-300" : "text-purple-600"}`}>
                          Easy English version
                        </span>
                        <button
                          onClick={() => { setEasyEnglishMode(false); }}
                          className={`ml-auto text-xs underline ${theme.mutedText}`}
                        >
                          Show original
                        </button>
                      </div>
                      <span>{easyEnglishText}</span>
                    </div>
                  ) : (() => {
                    const karaokeActive = followAlong && isAudioMatchingBook && karaokeWordIndex !== null && karaokeAvailable;
                    const karaokePageWordIndex = karaokeActive ? karaokeWordIndex % WORDS_PER_PAGE : null;
                    const activeIdx = karaokeActive ? karaokePageWordIndex : highlightedWordIndex;
                    const precomp = nextPageDataRef.current?.page === currentPage ? nextPageDataRef.current.precomputed : undefined;
                    const sq = searchResults.length > 0 && searchResults[currentSearchIdx]?.page === currentPage ? searchQuery : "";
                    if (activeIdx !== null && activeIdx !== undefined) {
                      return (
                        <HighlightedText
                          text={pageContent}
                          activeWordIndex={activeIdx}
                          darkMode={settings.theme === "dark"}
                          annotations={currentPageAnnotations}
                          searchQuery={sq}
                          bionicReading={bionicReading}
                          symbolOverlay={symbolOverlay}
                          symbolImageCache={pageSymbolImageCache}
                          precomputed={precomp}
                          onWordClick={handleWordClick}
                        />
                      );
                    }
                    return (
                      <AnnotatedText
                        text={pageContent}
                        annotations={currentPageAnnotations}
                        searchQuery={sq}
                        darkMode={settings.theme === "dark"}
                        bionicReading={bionicReading}
                        symbolOverlay={symbolOverlay}
                        symbolImageCache={pageSymbolImageCache}
                        precomputed={precomp}
                        onWordClick={handleWordClick}
                      />
                    );
                  })()}
                  {!pageContent && !easyEnglishMode && (
                    <p className="text-center text-muted-foreground italic">Content not available for preview</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {showAnnotationPanel && selectedText && (
          <Card className={`mt-4 ${theme.cardBg}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Highlighter className={`h-5 w-5 mt-0.5 flex-shrink-0 ${theme.mutedText}`} />
                <div className="flex-1 space-y-3">
                  <p className={`text-sm italic border-l-2 pl-3 ${theme.mutedText}`}>"{selectedText.slice(0, 100)}{selectedText.length > 100 ? "..." : ""}"</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${theme.mutedText}`}>Color:</span>
                    {HIGHLIGHT_COLORS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setHighlightColor(c.value)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${highlightColor === c.value ? "border-primary scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c.value }}
                        aria-label={c.name}
                      />
                    ))}
                  </div>
                  <Input
                    value={annotationNote}
                    onChange={(e) => setAnnotationNote(e.target.value)}
                    placeholder="Add a note (optional)..."
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={addAnnotation}><Highlighter className="h-3.5 w-3.5 mr-1" />Save Highlight</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => explainMutation.mutate(selectedText)}
                      disabled={explainMutation.isPending}
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      {explainMutation.isPending ? "Explaining…" : "AI Explain"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setShowAnnotationPanel(false); setSelectedText(""); explainMutation.reset(); }}><X className="h-3.5 w-3.5 mr-1" />Cancel</Button>
                  </div>
                  {explainMutation.data && (
                    <div className={`rounded-lg p-3 text-sm ${settings.theme === "dark" ? "bg-primary/10 border border-primary/30 text-gray-200" : "bg-primary/5 border border-primary/20 text-gray-800"}`}>
                      <div className="flex items-start gap-2">
                        <Sparkles className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <p>{explainMutation.data.explanation}</p>
                      </div>
                    </div>
                  )}
                  {explainMutation.isError && (
                    <p className="text-xs text-destructive">Could not generate explanation. Please try again.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {currentPageAnnotations.length > 0 && !showAnnotationPanel && (
          <div className="mt-3 space-y-1.5">
            {currentPageAnnotations.map(ann => (
              <div key={ann.id} className={`flex items-start gap-2 px-3 py-2 rounded-md text-sm ${settings.theme === "dark" ? "bg-gray-800/60" : "bg-white/60"}`}>
                <span className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0" style={{ backgroundColor: ann.color }} />
                <div className="flex-1 min-w-0">
                  <span className={`${theme.text} italic`}>"{ann.text.slice(0, 60)}{ann.text.length > 60 ? "..." : ""}"</span>
                  {ann.note && <p className={`text-xs mt-0.5 ${theme.mutedText}`}>{ann.note}</p>}
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => removeAnnotation(ann.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {annotations.length > 0 && (
          <div className="mt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={async () => {
                try {
                  const res = await fetch("/api/annotations/export", { credentials: "include" });
                  if (res.status === 403) {
                    alert("Export Notes requires a Plus or Premium subscription.");
                    return;
                  }
                  if (res.ok) {
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "accessibooks-notes.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }
                } catch {}
              }}
            >
              Export All Notes
            </Button>
          </div>
        )}

        {showPictureCheckin && pictureCheckinData && a11ySettings.comprehensionCheckIns && (
          <div
            className={`mt-4 p-4 rounded-lg border-2 border-primary/30 ${settings.theme === "dark" ? "bg-gray-800" : "bg-white"}`}
            role="dialog"
            aria-label="Chapter check-in"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className={`font-semibold flex items-center gap-2 text-sm ${theme.text}`}>
                <Sparkles className="h-4 w-4 text-primary" /> Chapter Check-in
                <span className={`text-xs font-normal ml-1 ${theme.mutedText}`}>(not a test!)</span>
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { logReaderCheckinAction("skipped"); setShowPictureCheckin(false); }}
                aria-label="Skip check-in"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {readerPictureCheckinMutation.isPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin inline-block" />
                Getting your check-in ready…
              </div>
            ) : (
              <>
                <p className={`text-sm font-medium mb-4 ${theme.text}`}>{pictureCheckinData.question}</p>
                <div className="flex flex-wrap gap-3 justify-center mb-4">
                  {pictureCheckinData.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setPictureCheckinSelected(i);
                        logReaderCheckinAction("answered");
                        setTimeout(() => setShowPictureCheckin(false), 900);
                      }}
                      disabled={pictureCheckinSelected !== null}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-colors min-w-[80px] ${
                        pictureCheckinSelected === i
                          ? "border-primary bg-primary/10"
                          : `border-gray-200 dark:border-gray-700 hover:border-primary/60 ${settings.theme === "dark" ? "bg-gray-900" : "bg-white"}`
                      }`}
                      aria-label={opt}
                      aria-pressed={pictureCheckinSelected === i}
                    >
                      {pictureCheckinData.symbolUrls[i] ? (
                        <img
                          src={pictureCheckinData.symbolUrls[i]!}
                          alt={opt}
                          className="w-16 h-16 object-contain"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          <span className="text-2xl" aria-hidden="true">🖼️</span>
                        </div>
                      )}
                      <span className={`text-xs font-medium capitalize ${theme.text}`}>{opt}</span>
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`text-xs w-full ${theme.mutedText}`}
                  onClick={() => { logReaderCheckinAction("skipped"); setShowPictureCheckin(false); }}
                >
                  Skip for now
                </Button>
              </>
            )}
          </div>
        )}

        {showBreakPrompt && !showQuiz && (
          <div className={`mt-4 p-4 rounded-lg border-2 border-primary/30 ${settings.theme === "dark" ? "bg-gray-800" : "bg-primary/5"}`}>
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">⏰</span>
              <div className="flex-1">
                <p className={`font-semibold mb-1 ${theme.text}`}>Time for a break!</p>
                <p className={`text-sm mb-3 ${theme.mutedText}`}>
                  You've been reading for {a11ySettings.sessionPacingMinutes} minutes. Take a short rest for your eyes and mind.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {a11ySettings.comprehensionCheckIns && (
                    <Button
                      size="sm"
                      onClick={() => quizMutation.mutate()}
                      disabled={quizMutation.isPending}
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      {quizMutation.isPending ? "Generating quiz…" : "Take Comprehension Quiz"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setShowBreakPrompt(false)}>
                    Continue Reading
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}


        <div className="flex items-center justify-between mt-6">
          <Button
            variant="outline"
            onClick={() => goToPage(currentPage - 1, "right")}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button>

          <div className="flex items-center gap-2">
            <input
              type="number"
              value={currentPage}
              onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
              className={`w-14 text-center rounded-md border p-1.5 text-sm ${theme.inputBg}`}
              min={1}
              max={totalPages}
              aria-label={`Go to page`}
            />
            <span className={theme.mutedText}>/ {totalPages}</span>
          </div>

          <Button
            variant="outline"
            onClick={() => goToPage(currentPage + 1, "left")}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
            className="gap-1"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4">
          <div
            className={`h-1.5 rounded-full ${settings.theme === "dark" ? "bg-gray-700" : settings.theme === "sepia" ? "bg-[#d4c4a8]" : "bg-gray-200"}`}
            role="progressbar"
            aria-valuenow={Math.round((currentPage / totalPages) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Reading progress`}
          >
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(currentPage / totalPages) * 100}%` }}
            />
          </div>
          <p className={`text-center text-xs mt-1.5 ${theme.mutedText}`}>
            {Math.round((currentPage / totalPages) * 100)}% complete
          </p>
        </div>
      {clickedWordData && (
        <WordVocabPopup
          word={clickedWordData.word}
          rect={clickedWordData.rect}
          onClose={() => setClickedWordData(null)}
        />
      )}

      </main>

      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(30px); opacity: 0.7; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(-30px); opacity: 0.7; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in-left { animation: slideInLeft 0.3s ease-out; }
        .animate-slide-in-right { animation: slideInRight 0.3s ease-out; }
      `}</style>
    </div>
  );
}

function renderWordContent(
  word: string,
  bionicReading: boolean,
  symbolOverlay: boolean,
  symbolImageCache?: Record<string, string | null>
) {
  let wordEl: React.ReactNode;
  if (bionicReading) {
    const [bold, rest] = applyBionicReading(word);
    wordEl = <><strong>{bold}</strong>{rest}</>;
  } else {
    wordEl = word;
  }

  if (!symbolOverlay) return wordEl;

  const wordLc = word.toLowerCase().replace(/[^a-z'-]/g, "");
  const arasaacUrl = symbolImageCache ? (symbolImageCache[wordLc] ?? null) : null;
  const emoji = getSymbol(word);

  if (arasaacUrl) {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", verticalAlign: "bottom" }}>
        <img
          src={arasaacUrl}
          alt=""
          aria-hidden="true"
          style={{ height: "1.6em", width: "1.6em", objectFit: "contain", marginBottom: "1px" }}
        />
        {wordEl}
      </span>
    );
  }
  if (emoji) {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", verticalAlign: "bottom" }}>
        <span style={{ fontSize: "0.6em", lineHeight: 1, opacity: 0.85 }} aria-hidden="true">{emoji}</span>
        {wordEl}
      </span>
    );
  }
  return wordEl;
}

function renderPrecomputedWordNode(pre: PrecomputedWord): React.ReactNode {
  let wordEl: React.ReactNode;
  if (pre.bio) {
    const [bold, rest] = pre.bio;
    wordEl = <><strong>{bold}</strong>{rest}</>;
  } else {
    wordEl = pre.word;
  }
  if (pre.symbol) {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", verticalAlign: "bottom" }}>
        <span style={{ fontSize: "0.6em", lineHeight: 1, opacity: 0.85 }} aria-hidden="true">{pre.symbol}</span>
        {wordEl}
      </span>
    );
  }
  return wordEl;
}

function AnnotatedText({
  text,
  annotations,
  searchQuery,
  darkMode,
  bionicReading = false,
  symbolOverlay = false,
  symbolImageCache,
  precomputed,
  onWordClick,
}: {
  text: string;
  annotations: Annotation[];
  searchQuery: string;
  darkMode: boolean;
  bionicReading?: boolean;
  symbolOverlay?: boolean;
  symbolImageCache?: Record<string, string | null>;
  precomputed?: PrecomputedWord[];
  onWordClick?: (word: string, rect: DOMRect) => void;
}) {
  const wordsArr = text.split(/\s+/);

  return (
    <span>
      {wordsArr.map((word, i) => {
        const pre = precomputed?.[i];
        const displayWord = pre?.word ?? word;
        const ann = annotations.find(a => i >= a.startOffset && i < a.endOffset);
        const isSearchMatch = searchQuery && displayWord.toLowerCase().includes(searchQuery.toLowerCase());

        let className = "";
        let style: React.CSSProperties = {};

        if (ann) {
          style.backgroundColor = ann.color;
          style.borderRadius = "2px";
          style.padding = "0 1px";
        }
        if (isSearchMatch) {
          className = darkMode ? "bg-yellow-500/40 text-white rounded px-0.5" : "bg-yellow-300 rounded px-0.5";
        }

        const clickable = !!onWordClick;
        if (clickable) {
          className = (className ? className + " " : "") + "cursor-pointer hover:underline hover:decoration-dotted";
        }

        const handleClick = onWordClick
          ? (e: React.MouseEvent<HTMLSpanElement>) => {
              onWordClick(displayWord, (e.currentTarget as HTMLSpanElement).getBoundingClientRect());
            }
          : undefined;
        const handleKeyDown = onWordClick
          ? (e: React.KeyboardEvent<HTMLSpanElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onWordClick(displayWord, (e.currentTarget as HTMLSpanElement).getBoundingClientRect());
              }
            }
          : undefined;

        return (
          <span
            key={i}
            className={className}
            style={style}
            title={ann?.note || undefined}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
          >
            {pre ? renderPrecomputedWordNode(pre) : renderWordContent(word, bionicReading, symbolOverlay, symbolImageCache)}{" "}
          </span>
        );
      })}
    </span>
  );
}

function HighlightedText({
  text,
  activeWordIndex,
  darkMode,
  annotations,
  searchQuery,
  bionicReading = false,
  symbolOverlay = false,
  symbolImageCache,
  precomputed,
  onWordClick,
}: {
  text: string;
  activeWordIndex: number;
  darkMode: boolean;
  annotations: Annotation[];
  searchQuery: string;
  bionicReading?: boolean;
  symbolOverlay?: boolean;
  symbolImageCache?: Record<string, string | null>;
  precomputed?: PrecomputedWord[];
  onWordClick?: (word: string, rect: DOMRect) => void;
}) {
  const wordsArr = text.split(/\s+/);
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeWordIndex]);

  return (
    <span>
      {wordsArr.map((word, i) => {
        const pre = precomputed?.[i];
        const displayWord = pre?.word ?? word;
        const isActive = i === activeWordIndex;
        const ann = annotations.find(a => i >= a.startOffset && i < a.endOffset);
        const isSearchMatch = searchQuery && displayWord.toLowerCase().includes(searchQuery.toLowerCase());

        let className = "";
        let style: React.CSSProperties = {};

        if (isActive) {
          className = `rounded px-0.5 ${darkMode ? "bg-primary/40 text-white font-medium" : "bg-primary/25 font-medium"}`;
        } else if (ann) {
          style.backgroundColor = ann.color;
          style.borderRadius = "2px";
          style.padding = "0 1px";
        } else if (isSearchMatch) {
          className = darkMode ? "bg-yellow-500/40 rounded px-0.5" : "bg-yellow-300 rounded px-0.5";
        }

        const clickable = !!onWordClick;
        if (clickable) {
          className = (className ? className + " " : "") + "cursor-pointer hover:underline hover:decoration-dotted";
        }

        const handleClick = onWordClick
          ? (e: React.MouseEvent<HTMLSpanElement>) => {
              onWordClick(displayWord, (e.currentTarget as HTMLSpanElement).getBoundingClientRect());
            }
          : undefined;
        const handleKeyDown = onWordClick
          ? (e: React.KeyboardEvent<HTMLSpanElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onWordClick(displayWord, (e.currentTarget as HTMLSpanElement).getBoundingClientRect());
              }
            }
          : undefined;

        return (
          <span
            key={i}
            ref={isActive ? activeRef : null}
            className={className}
            style={style}
            title={ann?.note || undefined}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
          >
            {pre ? renderPrecomputedWordNode(pre) : renderWordContent(word, bionicReading, symbolOverlay, symbolImageCache)}{" "}
          </span>
        );
      })}
    </span>
  );
}

function WordVocabPopup({
  word,
  rect,
  onClose,
}: {
  word: string;
  rect: DOMRect;
  onClose: () => void;
}) {
  const symbolQuery = useQuery<{ url: string | null; id: number | null }>({
    queryKey: ["/api/symbols", word],
    queryFn: () => fetch(`/api/symbols/${encodeURIComponent(word)}`).then(r => r.json()),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  const defQuery = useQuery<{ definition: string | null }>({
    queryKey: ["/api/symbols/define", word],
    queryFn: () =>
      fetch("/api/symbols/define", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word }),
      }).then(r => r.json()),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const speak = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(word);
      utt.rate = 0.85;
      window.speechSynthesis.speak(utt);
    }
  };

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const POPUP_W = 240;
  const POPUP_H = 280;

  let top = rect.bottom + 8;
  let left = rect.left + rect.width / 2 - POPUP_W / 2;

  if (top + POPUP_H > viewportH - 16) {
    top = rect.top - POPUP_H - 8;
  }
  if (left < 8) left = 8;
  if (left + POPUP_W > viewportW - 8) left = viewportW - POPUP_W - 8;
  if (top < 8) top = 8;

  const symbolUrl = symbolQuery.data?.url ?? null;
  const definition = defQuery.data?.definition ?? null;

  const popup = (
    <div
      ref={popupRef}
      className="fixed z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-4 flex flex-col gap-3 select-none"
      style={{ top, left, width: POPUP_W }}
      role="dialog"
      aria-label={`Picture vocabulary for: ${word}`}
      aria-modal="false"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-bold text-foreground truncate capitalize">{word}</span>
        <button
          className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground"
          onClick={onClose}
          aria-label="Close vocabulary popup"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        {symbolQuery.isLoading ? (
          <div className="w-24 h-24 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ) : symbolUrl ? (
          <img
            src={symbolUrl}
            alt={`Symbol for ${word}`}
            className="w-24 h-24 object-contain rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800"
            onError={e => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="text-5xl select-none" aria-hidden="true">
            {getSymbol(word)}
          </span>
        )}
      </div>

      <div className="text-xs text-muted-foreground text-center leading-relaxed min-h-[2.5rem]">
        {defQuery.isLoading ? (
          <span className="animate-pulse">Looking up definition…</span>
        ) : definition ? (
          definition.length > 120 ? definition.slice(0, 117) + "…" : definition
        ) : (
          <span className="italic">No definition found</span>
        )}
      </div>

      <button
        className="flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        onClick={speak}
        aria-label={`Hear the word: ${word}`}
      >
        <Volume2 className="h-4 w-4" />
        Hear it
      </button>
    </div>
  );

  return createPortal(popup, document.body);
}
