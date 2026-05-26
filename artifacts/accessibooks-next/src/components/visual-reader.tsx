import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Video, VideoOff, Sparkles, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BookVisual {
  id: string;
  bookId: string;
  sceneIndex: number;
  pageStart: number;
  pageEnd: number;
  sceneDescription: string;
  videoPrompt: string;
  videoUrl: string | null;
  status: string;
}

interface VisualReaderProps {
  bookId: string;
  bookTitle: string;
  bookGenre?: string;
  currentPage: number;
  totalPages: number;
  bookText: string;
  darkMode?: boolean;
}

const DEMO_VIDEOS = [
  "/videos/scene-library.mp4",
  "/videos/scene-forest.mp4",
  "/videos/scene-ocean-storm.mp4",
  "/videos/scene-meadow.mp4",
];

export function VisualReader({
  bookId,
  bookTitle,
  bookGenre,
  currentPage,
  totalPages,
  bookText,
  darkMode = false,
}: VisualReaderProps) {
  const [enabled, setEnabled] = useState(false);
  const [opacity, setOpacity] = useState(0.3);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevSceneRef = useRef<number>(-1);
  const { toast } = useToast();

  const { data: visuals, isLoading: visualsLoading } = useQuery<BookVisual[]>({
    queryKey: ["/api/books", bookId, "visuals"],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/visuals`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: enabled,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/books/${bookId}/generate-visuals`, {
        text: bookText,
        title: bookTitle,
        genre: bookGenre,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/books", bookId, "visuals"] });
      toast({
        title: "Visual scenes generated",
        description: `${data.scenes?.length || 0} scenes created for this book`,
      });
    },
    onError: () => {
      toast({
        title: "Generation failed",
        description: "Could not generate visual scenes. Try again later.",
        variant: "destructive",
      });
    },
  });

  const currentScene = useMemo(() => {
    if (!visuals || visuals.length === 0) return null;
    return visuals.find(v => currentPage >= v.pageStart && currentPage <= v.pageEnd) || null;
  }, [visuals, currentPage]);

  const currentVideoUrl = useMemo(() => {
    if (currentScene?.videoUrl) return currentScene.videoUrl;
    if (!visuals || visuals.length === 0) return null;
    const idx = currentScene ? currentScene.sceneIndex : Math.floor((currentPage / Math.max(totalPages, 1)) * DEMO_VIDEOS.length);
    return DEMO_VIDEOS[idx % DEMO_VIDEOS.length];
  }, [currentScene, currentPage, totalPages, visuals]);

  useEffect(() => {
    if (!enabled || !videoRef.current || !currentVideoUrl) return;
    const sceneIdx = currentScene?.sceneIndex ?? -1;
    if (sceneIdx !== prevSceneRef.current) {
      prevSceneRef.current = sceneIdx;
      videoRef.current.src = currentVideoUrl;
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [enabled, currentVideoUrl, currentScene]);

  const handleToggle = useCallback(() => {
    if (!enabled) {
      setEnabled(true);
      if (!visuals || visuals.length === 0) {
        if (bookText.length > 100) {
          generateMutation.mutate();
        }
      }
    } else {
      setEnabled(false);
    }
  }, [enabled, visuals, bookText, generateMutation]);

  if (!enabled) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleToggle}
        className="gap-1.5"
        title="Enable Visual Reading - AI-generated scene videos that play as you read"
      >
        <Video className="h-4 w-4" />
        <span className="hidden sm:inline">Visual Reading</span>
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="default"
          size="sm"
          onClick={handleToggle}
          className="gap-1.5"
        >
          <VideoOff className="h-4 w-4" />
          <span className="hidden sm:inline">Stop Visual</span>
        </Button>

        <div className="flex items-center gap-1.5">
          <EyeOff className="h-3 w-3 text-muted-foreground" />
          <input
            type="range"
            min={0.1}
            max={0.8}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            className="w-16 h-1 accent-primary"
            title="Video opacity"
          />
          <Eye className="h-3 w-3 text-muted-foreground" />
        </div>

        {generateMutation.isPending && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            Analyzing scenes...
          </Badge>
        )}

        {currentScene && (
          <Badge variant="outline" className="gap-1 text-xs max-w-48 truncate">
            <Sparkles className="h-3 w-3 flex-shrink-0" />
            {currentScene.sceneDescription}
          </Badge>
        )}
      </div>

      <div className="relative rounded-lg overflow-hidden" style={{ minHeight: "180px" }}>
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover rounded-lg"
          style={{ opacity }}
          autoPlay
          loop
          muted
          playsInline
          src={currentVideoUrl || undefined}
        />
        <div
          className={`absolute inset-0 rounded-lg ${
            darkMode
              ? "bg-gradient-to-t from-gray-900/90 via-gray-900/50 to-gray-900/30"
              : "bg-gradient-to-t from-white/90 via-white/50 to-white/30"
          }`}
        />
      </div>
    </div>
  );
}
