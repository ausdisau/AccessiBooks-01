import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  ChevronUp,
  ChevronDown,
  X,
  FileText,
  Loader2,
  HelpCircle,
  Wand2,
  Sparkles,
} from "lucide-react";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Segment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptRecord {
  segments: Segment[];
  chapterIndex: number;
}

type CoachMode = "explain" | "simplify";

interface CoachState {
  mode: CoachMode;
  loading: boolean;
  content: string;
  error: string | null;
}

export function InteractiveTranscript({ bookId, currentTime, onSeek }: { bookId: string; currentTime: number; onSeek: (time: number) => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [coachState, setCoachState] = useState<Record<number, CoachState>>({});
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const matchRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Live region for screen-reader announcements (search count, jumps, AI ready)
  const [announcement, setAnnouncement] = useState("");

  const { data, isLoading } = useQuery<TranscriptRecord[]>({
    queryKey: ['/api/books', bookId, 'transcript'],
  });

  const segments = useMemo(() => {
    if (!data) return [];
    return data.flatMap((record) => record.segments);
  }, [data]);

  const activeSegmentIndex = useMemo(() => {
    return segments.findIndex((seg) => currentTime >= seg.start && currentTime < seg.end);
  }, [segments, currentTime]);

  const matchingIndices = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return segments.reduce<number[]>((acc, seg, idx) => {
      if (seg.text.toLowerCase().includes(query)) {
        acc.push(idx);
      }
      return acc;
    }, []);
  }, [segments, searchQuery]);

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery]);

  // Announce match counts to screen readers when search changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setAnnouncement("");
      return;
    }
    setAnnouncement(
      matchingIndices.length === 0
        ? `No matches for ${searchQuery}`
        : `${matchingIndices.length} match${matchingIndices.length === 1 ? "" : "es"} found`,
    );
  }, [matchingIndices.length, searchQuery]);

  useEffect(() => {
    if (!searchQuery && activeSegmentRef.current) {
      activeSegmentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeSegmentIndex, searchQuery]);

  useEffect(() => {
    if (matchingIndices.length > 0 && searchQuery) {
      const segIndex = matchingIndices[currentMatchIndex];
      const el = matchRefs.current.get(segIndex);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentMatchIndex, matchingIndices, searchQuery]);

  const navigateMatch = useCallback((direction: 'up' | 'down') => {
    if (matchingIndices.length === 0) return;
    setCurrentMatchIndex((prev) => {
      if (direction === 'down') {
        return (prev + 1) % matchingIndices.length;
      }
      return (prev - 1 + matchingIndices.length) % matchingIndices.length;
    });
  }, [matchingIndices.length]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setCurrentMatchIndex(0);
  }, []);

  // Enter on the search input jumps the player to the current match's start
  // timestamp and advances the match cursor. Shift+Enter cycles backward.
  // Escape clears the search field.
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        clearSearch();
        return;
      }
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (matchingIndices.length === 0) return;
      const segIdx = matchingIndices[currentMatchIndex];
      const seg = segments[segIdx];
      if (seg) {
        onSeek(seg.start);
        setAnnouncement(`Jumped to ${formatTime(seg.start)}`);
      }
      // After jumping, advance the cursor (Shift = backward)
      if (matchingIndices.length > 1) {
        setCurrentMatchIndex((prev) =>
          e.shiftKey
            ? (prev - 1 + matchingIndices.length) % matchingIndices.length
            : (prev + 1) % matchingIndices.length,
        );
      }
    },
    [matchingIndices, currentMatchIndex, segments, onSeek, clearSearch],
  );

  const askCoach = useCallback(
    async (segIndex: number, mode: CoachMode) => {
      const seg = segments[segIndex];
      if (!seg) return;
      setCoachState((prev) => ({
        ...prev,
        [segIndex]: { mode, loading: true, content: "", error: null },
      }));
      try {
        // Include the previous + next segment as light context so explanations
        // make sense even for short single-line segments. Cheap on tokens.
        const ctxParts: string[] = [];
        if (segments[segIndex - 1]) ctxParts.push(segments[segIndex - 1].text);
        if (segments[segIndex + 1]) ctxParts.push(segments[segIndex + 1].text);
        const res = await fetch("/api/coach/segment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            text: seg.text,
            mode,
            context: ctxParts.join(" "),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.message || "Request failed");
        }
        const data = (await res.json()) as { content?: string };
        setCoachState((prev) => ({
          ...prev,
          [segIndex]: {
            mode,
            loading: false,
            content: data.content ?? "",
            error: null,
          },
        }));
        setAnnouncement(
          mode === "simplify" ? "Simplified text ready" : "Explanation ready",
        );
      } catch (err) {
        setCoachState((prev) => ({
          ...prev,
          [segIndex]: {
            mode,
            loading: false,
            content: "",
            error:
              err instanceof Error ? err.message : "Could not load — please try again.",
          },
        }));
      }
    },
    [segments],
  );

  const dismissCoach = useCallback((segIndex: number) => {
    setCoachState((prev) => {
      const next = { ...prev };
      delete next[segIndex];
      return next;
    });
  }, []);

  const highlightText = useCallback((text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 rounded px-0.5">{part}</mark> : part
    );
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!segments.length) {
    return (
      <div className="flex flex-col h-full items-center justify-center py-12 text-muted-foreground">
        <FileText className="h-12 w-12 mb-3" />
        <p>No transcript available for this title</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Polite SR live region for search counts and AI-ready announcements */}
      <div role="status" aria-live="polite" className="sr-only" data-testid="transcript-live">
        {announcement}
      </div>

      <div className="flex items-center gap-2 p-3 border-b">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search transcript… Enter to jump"
            aria-label="Search transcript. Press Enter to jump to the next match's timestamp."
            className="pl-9 pr-8 focus-visible:ring-2 focus-visible:ring-primary"
            data-testid="transcript-search-input"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              data-testid="transcript-search-clear"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {searchQuery && matchingIndices.length > 0 && (
          <>
            <Badge variant="secondary">{matchingIndices.length} matches</Badge>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {currentMatchIndex + 1} of {matchingIndices.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateMatch('up')}
              aria-label="Previous match"
              className="h-8 w-8 p-0 focus-visible:ring-2 focus-visible:ring-primary"
              data-testid="transcript-search-prev"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateMatch('down')}
              aria-label="Next match"
              className="h-8 w-8 p-0 focus-visible:ring-2 focus-visible:ring-primary"
              data-testid="transcript-search-next"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </>
        )}
        {searchQuery && matchingIndices.length === 0 && (
          <Badge variant="secondary">0 matches</Badge>
        )}
      </div>

      <ScrollArea className="flex-1" style={{ maxHeight: '400px' }}>
        <div className="p-2 space-y-1">
          {segments.map((segment, index) => {
            const isActive = index === activeSegmentIndex;
            const isMatch = searchQuery && matchingIndices.includes(index);
            const isCurrentMatch = isMatch && matchingIndices[currentMatchIndex] === index;
            const coach = coachState[index];

            return (
              <div
                key={index}
                ref={(el) => {
                  if (isActive && !searchQuery) {
                    (activeSegmentRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                  }
                  if (isMatch && el) {
                    matchRefs.current.set(index, el);
                  } else {
                    matchRefs.current.delete(index);
                  }
                }}
                className={`group rounded transition-colors ${
                  isActive ? 'bg-primary/10 border-l-2 border-primary' : ''
                } ${isMatch ? 'bg-yellow-100 dark:bg-yellow-900/30' : ''} ${
                  isCurrentMatch ? 'ring-2 ring-primary' : ''
                }`}
              >
                <div
                  onClick={() => onSeek(segment.start)}
                  className="flex gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 rounded"
                >
                  <span className="text-xs text-muted-foreground font-mono min-w-[50px] pt-0.5">
                    {formatTime(segment.start)}
                  </span>
                  <span className="text-sm flex-1">
                    {searchQuery ? highlightText(segment.text, searchQuery) : segment.text}
                  </span>
                </div>

                {/* Per-segment Explain / Simplify (Task #68) */}
                <div className="flex items-center gap-1 pl-[62px] pr-3 pb-2 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); askCoach(index, "explain"); }}
                    disabled={coach?.loading}
                    aria-label={`Explain segment at ${formatTime(segment.start)}`}
                    className="h-6 px-2 text-[11px] gap-1 focus-visible:ring-2 focus-visible:ring-primary"
                    data-testid={`segment-explain-${index}`}
                  >
                    {coach?.loading && coach.mode === "explain" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <HelpCircle className="h-3 w-3" />
                    )}
                    Explain
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); askCoach(index, "simplify"); }}
                    disabled={coach?.loading}
                    aria-label={`Simplify segment at ${formatTime(segment.start)}`}
                    className="h-6 px-2 text-[11px] gap-1 focus-visible:ring-2 focus-visible:ring-primary"
                    data-testid={`segment-simplify-${index}`}
                  >
                    {coach?.loading && coach.mode === "simplify" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3" />
                    )}
                    Simplify
                  </Button>
                </div>

                {coach && (coach.content || coach.error) && (
                  <div
                    className="mx-3 mb-2 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-2"
                    role="region"
                    aria-label={
                      coach.mode === "simplify"
                        ? "Simplified passage from AI assistant"
                        : "Explanation from AI assistant"
                    }
                    data-testid={`segment-coach-${index}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        {coach.mode === "simplify" ? "Simpler version" : "Explanation"}
                        <span className="text-emerald-600/70 dark:text-emerald-400/70 font-normal">
                          · AI-generated
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => dismissCoach(index)}
                        aria-label="Dismiss AI response"
                        className="h-5 w-5 p-0"
                        data-testid={`segment-coach-dismiss-${index}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    {coach.error ? (
                      <p className="text-xs text-destructive">{coach.error}</p>
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                        {coach.content}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
