import { useState, useEffect, useRef, useCallback } from "react";
import ePub from "epubjs";
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
  Home,
  List
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// Structural interfaces for epubjs 0.4.x (no bundled TypeScript types in 0.4.x)
interface NavItem { id?: string; href: string; label: string; subitems?: NavItem[]; parent?: string; }
interface EpubNavigation { toc: NavItem[]; }
interface EpubRenditionThemes { fontSize(size: string): void; font(family: string): void; override(property: string, value: string): void; }
interface EpubRelocationStart { cfi?: string; percentage?: number; }
interface EpubRelocation { start: EpubRelocationStart; }
interface EpubRendition {
  display(target?: string): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  on(event: "relocated", cb: (location: EpubRelocation) => void): void;
  themes: EpubRenditionThemes;
}
interface EpubBook {
  renderTo(element: HTMLElement, options: { width: string; height: string; spread: string; flow: string }): EpubRendition;
  navigation: EpubNavigation;
  destroy(): void;
}

interface EpubViewerProps {
  book: Book;
  onBack: () => void;
}

interface ReadingSettings {
  fontSize: number;
  darkMode: boolean;
  fontFamily: string;
}

const defaultSettings: ReadingSettings = {
  fontSize: 100,
  darkMode: false,
  fontFamily: "serif",
};

export function EpubViewer({ book, onBack }: EpubViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReadingSettings>(defaultSettings);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [currentLocation, setCurrentLocation] = useState<string>("");
  const [progress, setProgress] = useState(0);
  
  const viewerRef = useRef<HTMLDivElement>(null);
  const epubRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<EpubRendition | null>(null);

  const epubUrl = `/api/ebook/${book.id}/content`;

  useEffect(() => {
    loadEpub();
    
    return () => {
      if (epubRef.current) {
        epubRef.current.destroy();
      }
    };
  }, [book.id]);

  const loadEpub = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!viewerRef.current) return;

      // epubjs 0.4.x: ePub() is async — returns a Promise<Book> resolving when book is fully open
      const epub: EpubBook = await ePub(epubUrl);
      epubRef.current = epub;

      const rendition: EpubRendition = epub.renderTo(viewerRef.current, {
        width: "100%",
        height: "100%",
        spread: "none",
        flow: "paginated"
      });
      renditionRef.current = rendition;

      // In 0.4.x epub.navigation is a direct property (no epub.loaded.navigation Promise)
      const navigation = epub.navigation;
      if (navigation?.toc) setToc(navigation.toc);

      const savedLocation = localStorage.getItem(`epub-location-${book.id}`);
      if (savedLocation) {
        await rendition.display(savedLocation);
      } else {
        await rendition.display();
      }

      rendition.on("relocated", (location) => {
        if (location.start?.cfi) {
          setCurrentLocation(location.start.cfi);
          localStorage.setItem(`epub-location-${book.id}`, location.start.cfi);
        }
        if (location.start?.percentage !== undefined) {
          setProgress(Math.round(location.start.percentage * 100));
        }
      });

      applySettings(settings);
      setIsLoading(false);
    } catch (err) {
      console.error("Error loading EPUB:", err);
      setError("Unable to load EPUB file. Please try again later.");
      setIsLoading(false);
    }
  };

  const applySettings = useCallback((newSettings: ReadingSettings) => {
    if (!renditionRef.current) return;

    renditionRef.current.themes.fontSize(`${newSettings.fontSize}%`);
    renditionRef.current.themes.font(newSettings.fontFamily);

    if (newSettings.darkMode) {
      renditionRef.current.themes.override("color", "#e0e0e0");
      renditionRef.current.themes.override("background", "#1a1a1a");
    } else {
      renditionRef.current.themes.override("color", "#1a1a1a");
      renditionRef.current.themes.override("background", "#fffef5");
    }
  }, []);

  const updateSetting = <K extends keyof ReadingSettings>(key: K, value: ReadingSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    applySettings(newSettings);
  };

  const goNext = () => {
    renditionRef.current?.next();
  };

  const goPrev = () => {
    renditionRef.current?.prev();
  };

  const goToChapter = (href: string) => {
    renditionRef.current?.display(href);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  return (
    <div className={`min-h-screen transition-colors ${settings.darkMode ? "bg-gray-900" : "bg-amber-50"}`}>
      <header className={`sticky top-0 z-10 border-b ${settings.darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" onClick={onBack} aria-label="Back to library">
            <ChevronLeft className="h-5 w-5 mr-1" />
            Back
          </Button>
          
          <div className="flex items-center gap-2 text-sm">
            <span className={settings.darkMode ? "text-gray-300" : "text-gray-600"}>
              {progress}% complete
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Table of contents">
                  <List className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left">
                <SheetHeader>
                  <SheetTitle>Table of Contents</SheetTitle>
                </SheetHeader>
                <nav className="mt-4 space-y-2 overflow-y-auto max-h-[calc(100vh-120px)]">
                  {toc.map((item, index) => (
                    <button
                      key={index}
                      onClick={() => goToChapter(item.href)}
                      className="block w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>

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
                      <span className="text-sm text-muted-foreground">{settings.fontSize}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => updateSetting("fontSize", Math.max(50, settings.fontSize - 10))}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Slider
                        value={[settings.fontSize]}
                        min={50}
                        max={200}
                        step={10}
                        onValueChange={([v]) => updateSetting("fontSize", v)}
                        className="flex-1"
                      />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => updateSetting("fontSize", Math.min(200, settings.fontSize + 10))}
                      >
                        <Plus className="h-4 w-4" />
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
                        className="flex-1"
                      >
                        <Sun className="h-4 w-4 mr-1" />
                        Light
                      </Button>
                      <Button 
                        variant={settings.darkMode ? "default" : "outline"} 
                        size="sm"
                        onClick={() => updateSetting("darkMode", true)}
                        className="flex-1"
                      >
                        <Moon className="h-4 w-4 mr-1" />
                        Dark
                      </Button>
                    </div>
                  </div>

                  <div>
                    <span className="text-sm font-medium block mb-2">Font</span>
                    <div className="grid grid-cols-3 gap-2">
                      {["serif", "sans-serif", "monospace"].map((font) => (
                        <Button
                          key={font}
                          variant={settings.fontFamily === font ? "default" : "outline"}
                          size="sm"
                          onClick={() => updateSetting("fontFamily", font)}
                          style={{ fontFamily: font }}
                        >
                          Aa
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto relative" style={{ height: "calc(100vh - 120px)" }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-opacity-75 z-20">
            <div className="text-center">
              <BookOpen className="h-12 w-12 animate-pulse text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading EPUB...</p>
            </div>
          </div>
        )}

        <div 
          ref={viewerRef} 
          className="h-full w-full"
          style={{ 
            background: settings.darkMode ? "#1a1a1a" : "#fffef5",
          }}
        />

        <Button 
          variant="ghost" 
          size="icon"
          onClick={goPrev}
          className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-8 w-8" />
        </Button>

        <Button 
          variant="ghost" 
          size="icon"
          onClick={goNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
          aria-label="Next page"
        >
          <ChevronRight className="h-8 w-8" />
        </Button>
      </main>

      <footer className={`fixed bottom-0 left-0 right-0 px-4 py-2 ${settings.darkMode ? "bg-gray-800" : "bg-white"}`}>
        <div className="max-w-4xl mx-auto">
          <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
