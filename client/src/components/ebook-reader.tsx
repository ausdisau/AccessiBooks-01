import { useState, useEffect, useCallback, useRef } from "react";
import { Book } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
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
  Home
} from "lucide-react";
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

interface EbookReaderProps {
  book: Book;
  onBack: () => void;
}

interface ReadingSettings {
  fontSize: number;
  darkMode: boolean;
  fontFamily: "serif" | "sans-serif" | "mono";
  lineHeight: number;
}

const defaultSettings: ReadingSettings = {
  fontSize: 18,
  darkMode: false,
  fontFamily: "serif",
  lineHeight: 1.8,
};

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
  const [detectedFormat, setDetectedFormat] = useState<ContentFormat>("unknown");
  const [isDetecting, setIsDetecting] = useState(true);

  useEffect(() => {
    detectFormat();
  }, [book.id]);

  const detectFormat = async () => {
    setIsDetecting(true);
    
    const urlFormat = detectContentFormat(book);
    if (urlFormat !== "text") {
      setDetectedFormat(urlFormat);
      setIsDetecting(false);
      return;
    }

    try {
      const response = await fetch(`/api/ebook/${book.id}/content`, {
        method: "HEAD",
      });
      
      const contentType = response.headers.get("content-type") || "";
      
      if (contentType.includes("application/pdf")) {
        setDetectedFormat("pdf");
      } else if (contentType.includes("application/epub") || contentType.includes("application/zip")) {
        setDetectedFormat("epub");
      } else {
        setDetectedFormat("text");
      }
    } catch (err) {
      console.error("Error detecting content type:", err);
      setDetectedFormat("text");
    } finally {
      setIsDetecting(false);
    }
  };

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
  
  if (detectedFormat === "pdf") {
    return <PdfViewer book={book} onBack={onBack} />;
  }
  
  if (detectedFormat === "epub") {
    return <EpubViewer book={book} onBack={onBack} />;
  }
  
  return <TextReader book={book} onBack={onBack} />;
}

function TextReader({ book, onBack }: EbookReaderProps) {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [settings, setSettings] = useState<ReadingSettings>(defaultSettings);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [highlightedWordIndex, setHighlightedWordIndex] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const readerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadContent();
    loadReadingProgress();
    loadBookmarks();
  }, [book.id]);

  const loadContent = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/ebook/${book.id}/content`);
      if (!response.ok) {
        throw new Error("Failed to load ebook content");
      }
      
      const text = await response.text();
      setContent(text);
      
      const wordsPerPage = 300;
      const wordCount = text.split(/\s+/).length;
      setTotalPages(Math.max(1, Math.ceil(wordCount / wordsPerPage)));
    } catch (err) {
      setError("Unable to load ebook content. Please try again later.");
      console.error("Error loading ebook:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadReadingProgress = () => {
    const progress = localStorageService.getProgress(book.id);
    if (progress && progress.currentTime) {
      setCurrentPage(Math.max(1, Math.floor(progress.currentTime)));
    }
  };

  const loadBookmarks = () => {
    const saved = localStorage.getItem(`ebook-bookmarks-${book.id}`);
    if (saved) {
      setBookmarks(JSON.parse(saved));
    }
  };

  const saveProgress = useCallback((page: number) => {
    localStorageService.saveProgress({
      bookId: book.id,
      currentTime: page,
      lastPlayed: new Date().toISOString(),
    });
  }, [book.id]);

  const goToPage = (page: number) => {
    const newPage = Math.max(1, Math.min(totalPages, page));
    setCurrentPage(newPage);
    saveProgress(newPage);
    contentRef.current?.scrollTo(0, 0);
  };

  const toggleBookmark = () => {
    const newBookmarks = bookmarks.includes(currentPage)
      ? bookmarks.filter(p => p !== currentPage)
      : [...bookmarks, currentPage].sort((a, b) => a - b);
    
    setBookmarks(newBookmarks);
    localStorage.setItem(`ebook-bookmarks-${book.id}`, JSON.stringify(newBookmarks));
  };

  const updateSetting = <K extends keyof ReadingSettings>(key: K, value: ReadingSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const getPageContent = () => {
    if (!content) return "";
    
    const words = content.split(/\s+/);
    const wordsPerPage = 300;
    const startIdx = (currentPage - 1) * wordsPerPage;
    const endIdx = startIdx + wordsPerPage;
    return words.slice(startIdx, endIdx).join(" ");
  };

  const fontFamilyClass = {
    serif: "font-serif",
    "sans-serif": "font-sans",
    mono: "font-mono",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <BookOpen className="h-12 w-12 animate-pulse text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading ebook...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={onBack}>
              <Home className="h-4 w-4 mr-2" />
              Back to Library
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleReaderKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive = target.closest("button, input, select, textarea, [role='slider'], [role='menuitem'], [role='combobox']");
    if (isInteractive) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      goToPage(currentPage + 1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      goToPage(currentPage - 1);
    }
  };

  return (
    <div
      ref={readerContainerRef}
      className={`min-h-screen transition-colors ${settings.darkMode ? "bg-gray-900" : "bg-amber-50"}`}
      role="document"
      aria-label={`Reading ${book.title} by ${book.author}`}
      onKeyDown={handleReaderKeyDown}
      tabIndex={-1}
    >
      <header className={`sticky top-0 z-10 border-b ${settings.darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`} role="banner">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" onClick={onBack} aria-label="Back to library">
            <ChevronLeft className="h-5 w-5 mr-1" />
            Back
          </Button>
          
          <div className="flex items-center gap-2 text-sm">
            <span className={settings.darkMode ? "text-gray-300" : "text-gray-600"}>
              Page {currentPage} of {totalPages}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={toggleBookmark}
              aria-label={bookmarks.includes(currentPage) ? "Remove bookmark" : "Add bookmark"}
            >
              <Bookmark 
                className={`h-5 w-5 ${bookmarks.includes(currentPage) ? "fill-primary text-primary" : ""}`} 
              />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Reading settings">
                  <Settings className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Reading Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                <div className="p-3 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Font Size</span>
                      <span className="text-sm text-muted-foreground">{settings.fontSize}px</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => updateSetting("fontSize", Math.max(12, settings.fontSize - 2))}
                        aria-label="Decrease font size"
                      >
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Slider
                        value={[settings.fontSize]}
                        min={12}
                        max={32}
                        step={2}
                        onValueChange={([v]) => updateSetting("fontSize", v)}
                        className="flex-1"
                        aria-label="Font size"
                      />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => updateSetting("fontSize", Math.min(32, settings.fontSize + 2))}
                        aria-label="Increase font size"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <span className="text-sm font-medium block mb-2">Theme</span>
                    <div className="flex gap-2">
                      <Button 
                        variant={!settings.darkMode ? "default" : "outline"} 
                        size="sm"
                        onClick={() => updateSetting("darkMode", false)}
                      >
                        <Sun className="h-4 w-4 mr-1" />
                        Light
                      </Button>
                      <Button 
                        variant={settings.darkMode ? "default" : "outline"} 
                        size="sm"
                        onClick={() => updateSetting("darkMode", true)}
                      >
                        <Moon className="h-4 w-4 mr-1" />
                        Dark
                      </Button>
                    </div>
                  </div>

                  <div>
                    <span className="text-sm font-medium block mb-2">Font</span>
                    <div className="flex gap-2">
                      <Button 
                        variant={settings.fontFamily === "serif" ? "default" : "outline"} 
                        size="sm"
                        onClick={() => updateSetting("fontFamily", "serif")}
                        className="font-serif"
                      >
                        Serif
                      </Button>
                      <Button 
                        variant={settings.fontFamily === "sans-serif" ? "default" : "outline"} 
                        size="sm"
                        onClick={() => updateSetting("fontFamily", "sans-serif")}
                      >
                        Sans
                      </Button>
                      <Button 
                        variant={settings.fontFamily === "mono" ? "default" : "outline"} 
                        size="sm"
                        onClick={() => updateSetting("fontFamily", "mono")}
                        className="font-mono"
                      >
                        Mono
                      </Button>
                    </div>
                  </div>
                </div>
                
                {bookmarks.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Bookmarks</DropdownMenuLabel>
                    {bookmarks.map(page => (
                      <DropdownMenuItem 
                        key={page} 
                        onClick={() => goToPage(page)}
                      >
                        <Bookmark className="h-4 w-4 mr-2" />
                        Page {page}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className={`text-2xl font-bold mb-2 ${settings.darkMode ? "text-white" : "text-gray-900"}`}>
            {book.title}
          </h1>
          <p className={settings.darkMode ? "text-gray-400" : "text-gray-600"}>
            by {book.author}
          </p>
        </div>

        <div className="mb-4">
          <TTSPlayer
            text={getPageContent()}
            bookTitle={book.title}
            currentPage={currentPage}
            totalPages={totalPages}
            onNextPage={() => goToPage(currentPage + 1)}
            onPrevPage={() => goToPage(currentPage - 1)}
            darkMode={settings.darkMode}
            onWordIndex={setHighlightedWordIndex}
          />
        </div>

        <Card className={settings.darkMode ? "bg-gray-800 border-gray-700" : "bg-white"}>
          <CardContent className="p-8 md:p-12">
            <div 
              ref={contentRef}
              className={`
                ${fontFamilyClass[settings.fontFamily]}
                ${settings.darkMode ? "text-gray-200" : "text-gray-800"}
                leading-relaxed
              `}
              style={{ 
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
              }}
            >
              {highlightedWordIndex !== null ? (
                <HighlightedText
                  text={getPageContent()}
                  activeWordIndex={highlightedWordIndex}
                  darkMode={settings.darkMode}
                />
              ) : (
                getPageContent() || (
                  <p className="text-center text-muted-foreground italic">
                    Content not available for preview
                  </p>
                )
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between mt-8">
          <Button
            variant="outline"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            <input
              type="number"
              value={currentPage}
              onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
              className={`w-16 text-center rounded-md border p-2 text-sm ${
                settings.darkMode 
                  ? "bg-gray-800 border-gray-600 text-white" 
                  : "bg-white border-gray-300"
              }`}
              min={1}
              max={totalPages}
              aria-label={`Go to page, current page ${currentPage} of ${totalPages}`}
            />
            <span className={settings.darkMode ? "text-gray-400" : "text-gray-600"}>
              / {totalPages}
            </span>
          </div>

          <Button
            variant="outline"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
          </Button>
        </div>

        <div className="mt-4">
          <div
            className={`h-2 rounded-full ${settings.darkMode ? "bg-gray-700" : "bg-gray-200"}`}
            role="progressbar"
            aria-valuenow={Math.round((currentPage / totalPages) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Reading progress: ${Math.round((currentPage / totalPages) * 100)}%`}
          >
            <div 
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${(currentPage / totalPages) * 100}%` }}
            />
          </div>
          <p className={`text-center text-sm mt-2 ${settings.darkMode ? "text-gray-400" : "text-gray-500"}`}>
            {Math.round((currentPage / totalPages) * 100)}% complete
          </p>
        </div>
      </main>
    </div>
  );
}

function HighlightedText({ text, activeWordIndex, darkMode }: { text: string; activeWordIndex: number; darkMode: boolean }) {
  const words = text.split(/\s+/);
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeWordIndex]);

  return (
    <span>
      {words.map((word, i) => (
        <span
          key={i}
          ref={i === activeWordIndex ? activeRef : null}
          className={
            i === activeWordIndex
              ? `rounded px-0.5 ${darkMode ? "bg-primary/30 text-white" : "bg-primary/20 text-primary-foreground"}`
              : ""
          }
        >
          {word}{" "}
        </span>
      ))}
    </span>
  );
}

