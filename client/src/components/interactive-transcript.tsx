import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, ChevronUp, ChevronDown, X, FileText, Loader2 } from "lucide-react";

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

export function InteractiveTranscript({ bookId, currentTime, onSeek }: { bookId: string; currentTime: number; onSeek: (time: number) => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const matchRefs = useRef<Map<number, HTMLDivElement>>(new Map());

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
      <div className="flex items-center gap-2 p-3 border-b">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transcript..."
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSearch}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
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
            <Button variant="ghost" size="sm" onClick={() => navigateMatch('up')} className="h-8 w-8 p-0">
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigateMatch('down')} className="h-8 w-8 p-0">
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
                onClick={() => onSeek(segment.start)}
                className={`flex gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 rounded transition-colors ${
                  isActive ? 'bg-primary/10 border-l-2 border-primary' : ''
                } ${isMatch ? 'bg-yellow-100 dark:bg-yellow-900/30' : ''} ${
                  isCurrentMatch ? 'ring-2 ring-primary' : ''
                }`}
              >
                <span className="text-xs text-muted-foreground font-mono min-w-[50px] pt-0.5">
                  {formatTime(segment.start)}
                </span>
                <span className="text-sm flex-1">
                  {searchQuery ? highlightText(segment.text, searchQuery) : segment.text}
                </span>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
