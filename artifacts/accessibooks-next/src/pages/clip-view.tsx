import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, ArrowRight } from "lucide-react";

interface ClipPayload {
  id: string;
  bookId: string;
  bookTitle: string;
  startSec: number;
  endSec: number;
  quote: string | null;
  hideAttribution: boolean;
  viewCount: number;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ClipViewPage() {
  const [, params] = useRoute("/clip/:token");
  const token = params?.token;
  const [clip, setClip] = useState<ClipPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/share/clip/${token}`, { credentials: "include" });
        if (!r.ok) {
          setError(r.status === 404 ? "This clip is no longer available." : "Could not load this clip.");
          return;
        }
        const data = await r.json();
        if (!cancelled) setClip(data.clip);
      } catch {
        if (!cancelled) setError("Could not load this clip.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main className="container max-w-2xl mx-auto p-4" data-testid="page-clip-view">
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && error && (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">{error}</p>
          <Link href="/">
            <Button className="mt-4" data-testid="clip-go-home">Browse AccessiBooks</Button>
          </Link>
        </Card>
      )}
      {!loading && clip && (
        <Card data-testid={`clip-card-${clip.id}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
              Shared moment from <span className="text-primary">{clip.bookTitle}</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              From {fmt(clip.startSec)} to {fmt(clip.endSec)} ({Math.round(clip.endSec - clip.startSec)} seconds)
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {clip.quote && (
              <blockquote className="border-l-4 border-primary pl-4 italic text-base" data-testid="clip-quote">
                "{clip.quote}"
              </blockquote>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/?book=${encodeURIComponent(clip.bookId)}`}>
                <Button data-testid="clip-listen-full">
                  Listen to the full book <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="outline" data-testid="clip-explore-plans">Explore plans</Button>
              </Link>
            </div>
            {!clip.hideAttribution && (
              <p className="text-xs text-muted-foreground">Shared from AccessiBooks · {clip.viewCount.toLocaleString()} views</p>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
