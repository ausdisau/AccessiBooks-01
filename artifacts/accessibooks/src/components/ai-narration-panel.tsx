import { useState, useEffect, useRef, useMemo } from "react";
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
import { Headphones, Mic, CheckCircle, Loader2, AlertCircle } from "lucide-react";

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
  timing: unknown | null;
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
