import { useState, useEffect, useRef, useMemo, type RefObject } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Headphones, Mic, CheckCircle, Loader2, AlertCircle, AlignLeft, Eye, EyeOff } from "lucide-react";
import type { TranscriptSegment } from "@shared/schema";

interface NarrationVoice {
  id: string;
  name: string;
  description: string;
}

interface NarrationStatus {
  status: "none" | "queued" | "processing" | "completed" | "failed";
  totalChapters: number;
  completedChapters: number;
  error?: string | null;
  voiceId: string;
}

interface NarrationChapter {
  chapterNumber: number;
  title: string | null;
  audioUrl: string;
  durationSeconds: number | null;
  timing: TranscriptSegment[] | null;
}

interface NarrationManifest {
  bookId: string;
  voiceId: string;
  chapters: NarrationChapter[];
}

interface AINarrationPanelProps {
  bookId: string;
  darkMode?: boolean;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AINarrationPanel({ bookId, darkMode }: AINarrationPanelProps) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [activeChapter, setActiveChapter] = useState<number | null>(null);
  const [followAlong, setFollowAlong] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: voicesData } = useQuery<{ voices: NarrationVoice[]; configured: boolean }>({
    queryKey: ["/api/narration/voices"],
    queryFn: async () => {
      const res = await fetch("/api/narration/voices");
      if (!res.ok) throw new Error("Failed to load voices");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const voices = voicesData?.voices ?? [];
  const configured = voicesData?.configured ?? true;

  useEffect(() => {
    if (!selectedVoiceId && voices.length > 0) {
      setSelectedVoiceId(voices[0].id);
    }
  }, [voices, selectedVoiceId]);

  const statusQuery = useQuery<NarrationStatus>({
    queryKey: ["/api/narration/status", bookId, selectedVoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/narration/${bookId}/status?voiceId=${encodeURIComponent(selectedVoiceId)}`);
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    enabled: !!bookId && !!selectedVoiceId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "queued" || s === "processing" ? 3000 : false;
    },
  });

  const status = statusQuery.data;
  const isGenerating = status?.status === "queued" || status?.status === "processing";
  const isReady = status?.status === "completed";

  const manifestQuery = useQuery<NarrationManifest>({
    queryKey: ["/api/narration/manifest", bookId, selectedVoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/narration/${bookId}/manifest?voiceId=${encodeURIComponent(selectedVoiceId)}`);
      if (!res.ok) throw new Error("Failed to fetch manifest");
      return res.json();
    },
    enabled: !!bookId && !!selectedVoiceId && isReady,
  });

  const chapters = useMemo(() => manifestQuery.data?.chapters ?? [], [manifestQuery.data]);

  const activeChapterData = useMemo(
    () => chapters.find((c) => c.chapterNumber === activeChapter) ?? null,
    [chapters, activeChapter],
  );

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/narration/${bookId}/generate`, { voiceId: selectedVoiceId });
      return res.json();
    },
    onSuccess: () => {
      statusQuery.refetch();
      toast({ title: "Narration started", description: "We're generating your audiobook. This can take a few minutes for long books." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't start narration", description: err.message, variant: "destructive" });
    },
  });

  const progressPct = status && status.totalChapters > 0
    ? Math.round((status.completedChapters / status.totalChapters) * 100)
    : 0;

  const mutedText = darkMode ? "text-gray-400" : "text-muted-foreground";
  const headingText = darkMode ? "text-gray-100" : "text-foreground";
  const containerCls = darkMode
    ? "border-gray-700 bg-gray-800/60"
    : "border-border bg-muted/40";

  const playChapter = (chapterNumber: number, url: string) => {
    setActiveChapter(chapterNumber);
    requestAnimationFrame(() => {
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => {});
      }
    });
  };

  return (
    <div className={`rounded-lg border p-4 ${containerCls}`} data-testid="ai-narration-panel">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Headphones className="h-4 w-4 text-primary" />
          <span className={`text-sm font-semibold ${headingText}`}>AI Audiobook Narration</span>
          {isReady && (
            <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 border-green-300">
              <CheckCircle className="h-3 w-3 mr-1" />
              Ready
            </Badge>
          )}
        </div>

        {voices.length > 0 && (
          <Select value={selectedVoiceId} onValueChange={setSelectedVoiceId} disabled={isGenerating}>
            <SelectTrigger className="h-8 w-[150px] text-xs" data-testid="select-narration-voice">
              <SelectValue placeholder="Choose a voice" />
            </SelectTrigger>
            <SelectContent>
              {voices.map((v) => (
                <SelectItem key={v.id} value={v.id} className="text-xs">
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <p className={`mt-1 text-xs ${mutedText}`}>
        Turn this text title into a listenable, neural-voice audiobook you can stream by chapter.
      </p>

      {!configured ? (
        <div className={`mt-3 flex items-center gap-2 text-xs ${mutedText}`}>
          <AlertCircle className="h-3.5 w-3.5" />
          Narration is temporarily unavailable.
        </div>
      ) : !isAuthenticated ? (
        <div className={`mt-3 text-xs ${mutedText}`}>Sign in to generate narration.</div>
      ) : (
        <>
          {!isReady && !isGenerating && (
            <Button
              size="sm"
              className="mt-3 h-8 text-xs"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || !selectedVoiceId}
              data-testid="button-generate-narration"
            >
              {generateMutation.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Starting…</>
              ) : (
                <><Mic className="h-3.5 w-3.5 mr-1.5" /> Generate audiobook</>
              )}
            </Button>
          )}

          {status?.status === "failed" && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-red-500">
                <AlertCircle className="h-3.5 w-3.5" />
                {status.error || "Narration failed. Please try again."}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                data-testid="button-retry-narration"
              >
                <Mic className="h-3.5 w-3.5 mr-1.5" /> Try again
              </Button>
            </div>
          )}

          {isGenerating && (
            <div className="mt-3 space-y-2" data-testid="narration-progress">
              <div className={`flex items-center gap-2 text-xs ${mutedText}`}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating narration — chapter {status.completedChapters} of {status.totalChapters}
              </div>
              <Progress value={progressPct} className="h-2" />
            </div>
          )}

          {isReady && chapters.length > 0 && (
            <div className="mt-3 space-y-2">
              <audio ref={audioRef} controls className="w-full h-9" data-testid="narration-audio-player" />
              {activeChapterData &&
                (activeChapterData.timing && activeChapterData.timing.length > 0 ? (
                  <NarrationReadAlong
                    key={activeChapterData.chapterNumber}
                    segments={activeChapterData.timing}
                    audioRef={audioRef}
                    enabled={followAlong}
                    onToggle={() => setFollowAlong((v) => !v)}
                  />
                ) : (
                  <p className={`text-xs ${mutedText}`} data-testid="narration-read-along-unavailable">
                    Read-along isn't available for this chapter — audio will play normally.
                  </p>
                ))}
              <ul className="max-h-48 overflow-y-auto divide-y divide-border rounded-md border border-border">
                {chapters.map((ch) => (
                  <li key={ch.chapterNumber}>
                    <button
                      type="button"
                      onClick={() => playChapter(ch.chapterNumber, ch.audioUrl)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-accent/50 ${
                        activeChapter === ch.chapterNumber ? "bg-accent/70 font-medium" : ""
                      }`}
                      data-testid={`button-play-chapter-${ch.chapterNumber}`}
                    >
                      <span className="truncate">{ch.title || `Chapter ${ch.chapterNumber}`}</span>
                      {ch.durationSeconds ? (
                        <span className={`shrink-0 tabular-nums ${mutedText}`}>{formatDuration(ch.durationSeconds)}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-along (karaoke) view for narration.
//
// Narration timing comes from ElevenLabs `/with-timestamps` (real per-word
// marks), exposed per chapter via the manifest as `timing` segments whose times
// are SECONDS relative to THAT chapter's audio. We render the spoken words and
// highlight the one currently playing, synced to the shared <audio> element via
// requestAnimationFrame. Tap a word to seek there. When a chapter has no timing
// the parent renders plain playback instead of this view.
// ---------------------------------------------------------------------------
interface FlatWord {
  text: string;
  start: number;
  end: number;
  segIndex: number;
}

function flattenWords(segments: TranscriptSegment[]): FlatWord[] {
  const out: FlatWord[] = [];
  segments.forEach((seg, si) => {
    for (const w of seg.words ?? []) {
      out.push({ text: w.text, start: w.start, end: w.end, segIndex: si });
    }
  });
  return out;
}

// Rightmost word whose start <= t (mirrors use-karaoke-alignment): keeps the
// last-started word highlighted across small gaps, and clears once playback is
// past the final word.
function findActiveWord(words: FlatWord[], t: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const w = words[mid];
    if (w.start <= t && w.end > t) {
      result = mid;
      break;
    } else if (w.start > t) {
      hi = mid - 1;
    } else {
      lo = mid + 1;
      result = mid;
    }
  }
  if (result < 0) return -1;
  const cand = words[result];
  if (t >= cand.end && result === words.length - 1) return -1;
  return result;
}

function NarrationReadAlong({
  segments,
  audioRef,
  enabled,
  onToggle,
}: {
  segments: TranscriptSegment[];
  audioRef: RefObject<HTMLAudioElement | null>;
  enabled: boolean;
  onToggle: () => void;
}) {
  const flat = useMemo(() => flattenWords(segments), [segments]);
  const flatRef = useRef<FlatWord[]>(flat);
  useEffect(() => {
    flatRef.current = flat;
  }, [flat]);

  // Words grouped per segment with a global index matching `flat` order, so the
  // active global index computed in the tick maps straight onto the rendered span.
  const rendered = useMemo(() => {
    let g = 0;
    return segments.map((seg, si) => ({
      si,
      text: seg.text,
      words: (seg.words ?? []).map((w) => ({ text: w.text, start: w.start, gi: g++ })),
    }));
  }, [segments]);

  const [activeWord, setActiveWord] = useState(-1);
  const rafRef = useRef<number | null>(null);
  const segRefs = useRef<Map<number, HTMLParagraphElement>>(new Map());

  // Drive the highlight from the shared <audio> element. setState only fires when
  // the active word actually changes, so re-renders happen a few times/second
  // (word cadence) rather than every animation frame.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !enabled) return;
    const compute = () => {
      const idx = findActiveWord(flatRef.current, audio.currentTime);
      setActiveWord((prev) => (prev === idx ? prev : idx));
    };
    const tick = () => {
      compute();
      rafRef.current = requestAnimationFrame(tick);
    };
    const start = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    audio.addEventListener("play", start);
    audio.addEventListener("playing", start);
    audio.addEventListener("pause", stop);
    audio.addEventListener("ended", stop);
    audio.addEventListener("timeupdate", compute);
    audio.addEventListener("seeked", compute);
    if (!audio.paused) start();
    compute();
    return () => {
      audio.removeEventListener("play", start);
      audio.removeEventListener("playing", start);
      audio.removeEventListener("pause", stop);
      audio.removeEventListener("ended", stop);
      audio.removeEventListener("timeupdate", compute);
      audio.removeEventListener("seeked", compute);
      stop();
    };
  }, [audioRef, enabled]);

  const activeSeg = enabled && activeWord >= 0 ? flat[activeWord]?.segIndex ?? -1 : -1;

  useEffect(() => {
    if (!enabled || activeSeg < 0) return;
    segRefs.current.get(activeSeg)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeSeg, enabled]);

  const seekTo = (start: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, start);
    audio.play().catch(() => {});
  };

  const showActive = enabled ? activeWord : -1;

  return (
    <div className="rounded-md border border-border bg-background/60" data-testid="narration-read-along">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <AlignLeft className="h-3.5 w-3.5 text-primary" />
          Read along
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="h-6 gap-1 px-2 text-[11px]"
          aria-pressed={enabled}
          aria-label={enabled ? "Turn read-along highlighting off" : "Turn read-along highlighting on"}
          data-testid="button-toggle-read-along"
        >
          {enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {enabled ? "On" : "Off"}
        </Button>
      </div>
      <div className="max-h-56 overflow-y-auto px-3 py-2 text-sm leading-relaxed">
        {rendered.map(({ si, text, words }) => {
          const isActiveSeg = si === activeSeg;
          return (
            <p
              key={si}
              ref={(el) => {
                if (el) segRefs.current.set(si, el);
                else segRefs.current.delete(si);
              }}
              className={`my-1 rounded ${isActiveSeg ? "bg-primary/5" : ""}`}
            >
              {words.length === 0
                ? text
                : words.map((w) => {
                    const active = w.gi === showActive;
                    return (
                      <span
                        key={w.gi}
                        onClick={() => seekTo(w.start)}
                        className={`cursor-pointer rounded px-0.5 transition-colors hover:bg-accent ${
                          active ? "bg-primary text-primary-foreground" : ""
                        }`}
                        data-active={active || undefined}
                      >
                        {w.text}{" "}
                      </span>
                    );
                  })}
            </p>
          );
        })}
      </div>
    </div>
  );
}
