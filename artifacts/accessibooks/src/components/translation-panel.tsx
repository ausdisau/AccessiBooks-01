import { useState, useEffect, useCallback } from "react";
import { Book } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X,
  Languages,
  Loader2,
  Volume2,
  Crown,
  Sparkles,
} from "lucide-react";

interface Language {
  code: string;
  name: string;
  nativeName: string;
}

interface ReadingLevel {
  value: string;
  label: string;
}

interface TranslationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  pageText: string;
  currentPage: number;
  onUpgrade?: () => void;
}

const BASE_URL = import.meta.env.BASE_URL || "/";

function api(path: string): string {
  return `${BASE_URL.replace(/\/$/, "")}${path}`;
}

const FALLBACK_LEVELS: ReadingLevel[] = [
  { value: "easy", label: "Easy English" },
  { value: "standard", label: "Standard" },
  { value: "advanced", label: "Advanced" },
];

export function TranslationPanel({
  isOpen,
  onClose,
  book,
  pageText,
  currentPage,
  onUpgrade,
}: TranslationPanelProps) {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [readingLevels, setReadingLevels] = useState<ReadingLevel[]>(FALLBACK_LEVELS);
  const [targetLanguage, setTargetLanguage] = useState("es");
  const [readingLevel, setReadingLevel] = useState("standard");
  const [narrate, setNarrate] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedText, setTranslatedText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upsell, setUpsell] = useState<string | null>(null);
  const [narrationUpsell, setNarrationUpsell] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(api("/api/translation/languages"))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (Array.isArray(data.languages)) setLanguages(data.languages);
        if (Array.isArray(data.readingLevels) && data.readingLevels.length > 0) {
          setReadingLevels(data.readingLevels);
        }
      })
      .catch(() => {
        /* languages stay empty; selector shows nothing actionable */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTranslate = useCallback(async () => {
    if (isTranslating) return;
    const text = (pageText || "").trim();
    if (!text) {
      setError("There's no text on this page to translate.");
      return;
    }
    setIsTranslating(true);
    setError(null);
    setUpsell(null);
    setNarrationUpsell(null);
    setTranslatedText("");
    setAudioUrl(null);

    try {
      const response = await fetch(api("/api/translation/translate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          targetLanguage,
          readingLevel,
          narrate,
          bookId: book.id,
        }),
      });

      if (response.status === 401) {
        setError("Please sign in to use AI translation.");
        return;
      }
      if (response.status === 402) {
        let msg =
          "You've used your AI Translation allowance for this month. Upgrade to keep translating.";
        try {
          const payload = await response.json();
          if (payload?.message) msg = payload.message;
        } catch {
          /* keep default upsell copy */
        }
        setUpsell(msg);
        return;
      }
      if (response.status === 429) {
        setError("You've made a lot of requests. Please wait a moment and try again.");
        return;
      }
      if (!response.ok) throw new Error("Translation failed");

      const data = await response.json();
      setTranslatedText(data.translatedText ?? "");
      if (data.audioContent) setAudioUrl(data.audioContent);
      if (data.narrationUpsell?.message) {
        setNarrationUpsell(data.narrationUpsell.message);
      }
    } catch {
      setError("Sorry, translation failed. Please try again.");
    } finally {
      setIsTranslating(false);
    }
  }, [isTranslating, pageText, targetLanguage, readingLevel, narrate, book.id]);

  if (!isOpen) return null;

  const selectedLangName =
    languages.find((l) => l.code === targetLanguage)?.name ?? targetLanguage;

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
        aria-label="AI Translation"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-full bg-teal-500/10 flex items-center justify-center">
            <Languages className="h-4 w-4 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm">AI Translation</h2>
            <p className="text-[11px] text-muted-foreground line-clamp-1">
              Page {currentPage + 1} · {book.title}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-1.5"
            aria-label="Close translation"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Controls */}
        <div className="px-4 py-3 border-b border-border shrink-0 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="tl-lang">
              Translate to
            </label>
            <select
              id="tl-lang"
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              disabled={isTranslating}
            >
              {languages.length === 0 ? (
                <option value="es">Spanish</option>
              ) : (
                languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} ({l.nativeName})
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="tl-level">
              Reading level
            </label>
            <select
              id="tl-level"
              value={readingLevel}
              onChange={(e) => setReadingLevel(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              disabled={isTranslating}
            >
              {readingLevels.map((lvl) => (
                <option key={lvl.value} value={lvl.value}>
                  {lvl.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={narrate}
              onChange={(e) => setNarrate(e.target.checked)}
              disabled={isTranslating}
              className="h-4 w-4 rounded border-border"
            />
            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
            Read the translation aloud
          </label>
          <Button
            onClick={handleTranslate}
            disabled={isTranslating}
            className="w-full gap-2"
          >
            {isTranslating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Translating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Translate this page
              </>
            )}
          </Button>
        </div>

        {/* Result */}
        <ScrollArea className="flex-1 px-4 py-4">
          {upsell ? (
            <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center">
                <Crown className="h-7 w-7 text-amber-500" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Translation limit reached</h3>
                <p className="text-sm text-muted-foreground max-w-[300px]">{upsell}</p>
              </div>
              {onUpgrade && (
                <Button
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={onUpgrade}
                >
                  <Crown className="h-4 w-4 mr-2" />
                  Upgrade now
                </Button>
              )}
            </div>
          ) : error ? (
            <p className="text-sm text-red-500 text-center py-8">{error}</p>
          ) : translatedText ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Languages className="h-3.5 w-3.5" />
                {selectedLangName}
              </div>
              {audioUrl && (
                <audio controls src={audioUrl} className="w-full">
                  Your browser does not support audio playback.
                </audio>
              )}
              {narrationUpsell && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
                  <Crown className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{narrationUpsell}</span>
                </div>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{translatedText}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-12 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-teal-500/10 flex items-center justify-center">
                <Languages className="h-8 w-8 text-teal-600" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Read in your language</h3>
                <p className="text-sm text-muted-foreground max-w-[280px]">
                  Translate the current page into your language at a reading level
                  that suits you — and optionally have it read aloud.
                </p>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
    </>
  );
}
