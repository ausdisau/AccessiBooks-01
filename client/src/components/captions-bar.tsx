import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Subtitles } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface Segment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptRecord {
  segments: Segment[];
  chapterIndex: number;
}

interface CaptionsBarProps {
  bookId: string;
  currentTime: number;
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
  compact?: boolean;
}

export function CaptionsBar({
  bookId,
  currentTime,
  fontSize = 16,
  onFontSizeChange,
  compact = false,
}: CaptionsBarProps) {
  const { data, isLoading } = useQuery<TranscriptRecord[]>({
    queryKey: ["/api/books", bookId, "transcript"],
  });

  const segments = useMemo(() => {
    if (!data) return [];
    return data.flatMap((record) => record.segments);
  }, [data]);

  const currentSegment = useMemo(() => {
    if (!segments.length) return null;
    return (
      segments.find((seg) => currentTime >= seg.start && currentTime < seg.end) ??
      null
    );
  }, [segments, currentTime]);

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center gap-2 px-4 py-2 bg-black/80 text-white rounded-lg text-sm"
        aria-live="polite"
        role="status"
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        <span>Loading captions…</span>
      </div>
    );
  }

  if (!segments.length) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-2 bg-black/70 text-white/70 rounded-lg text-sm italic"
        role="status"
        aria-label="No captions available for this title"
      >
        <Subtitles className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>No captions available for this title</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className="px-3 py-1.5 bg-black/80 text-white rounded text-xs leading-snug truncate"
        aria-live="polite"
        aria-label="Current caption"
        role="status"
      >
        {currentSegment ? currentSegment.text : <span className="opacity-50">—</span>}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl bg-black/85 backdrop-blur-sm text-white px-4 py-3 space-y-2"
      aria-live="polite"
      role="status"
      aria-label="Live captions"
    >
      <div
        className="min-h-[2.5em] flex items-center justify-center text-center leading-relaxed transition-all duration-200"
        style={{ fontSize: `${fontSize}px` }}
        aria-atomic="true"
      >
        {currentSegment ? (
          <span>{currentSegment.text}</span>
        ) : (
          <span className="opacity-40 text-sm">
            {currentTime === 0 ? "Captions will appear as audio plays" : "—"}
          </span>
        )}
      </div>

      {onFontSizeChange && (
        <div className="flex items-center gap-3 pt-1 border-t border-white/10">
          <span className="text-xs text-white/60 shrink-0">A</span>
          <Slider
            value={[fontSize]}
            min={12}
            max={28}
            step={1}
            onValueChange={([v]) => onFontSizeChange(v)}
            className="flex-1 [&_[data-slot=slider-track]]:bg-white/20 [&_[data-slot=slider-range]]:bg-white [&_[data-slot=slider-thumb]]:bg-white"
            aria-label="Caption font size"
          />
          <span className="text-sm font-semibold text-white/80 shrink-0">A</span>
        </div>
      )}
    </div>
  );
}
