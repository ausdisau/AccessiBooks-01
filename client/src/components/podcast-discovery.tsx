import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Search, Podcast, Play, Clock, ChevronLeft, ChevronRight, Rss, ExternalLink, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PodcastFeed {
  id: string;
  feedUrl: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  author: string | null;
  language: string | null;
  websiteUrl: string | null;
  categories: string[] | null;
  episodeCount?: number;
}

interface PodcastEpisode {
  id: string;
  feedId: string;
  title: string;
  descriptionText: string | null;
  pubDate: string | null;
  durationSeconds: number | null;
  audioUrl: string;
  explicit: boolean | null;
  feed?: {
    id: string;
    title: string;
    imageUrl: string | null;
    author: string | null;
  };
}

const CURATED_FEEDS = [
  { url: "https://feeds.simplecast.com/54nAGcIl", name: "The Daily" },
  { url: "https://feeds.megaphone.fm/stuffyoushouldknow", name: "Stuff You Should Know" },
  { url: "https://rss.art19.com/serial", name: "Serial" },
  { url: "https://feeds.npr.org/510289/podcast.xml", name: "Planet Money" },
  { url: "https://feeds.npr.org/344098539/podcast.xml", name: "Hidden Brain" },
  { url: "https://feeds.megaphone.fm/sciencevs", name: "Science Vs" },
  { url: "https://rss.art19.com/the-tim-ferriss-show", name: "Tim Ferriss Show" },
  { url: "https://feeds.simplecast.com/wgl4xEgL", name: "Huberman Lab" },
];

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function PodcastCard({ feed, onSelect }: { feed: PodcastFeed; onSelect: (feed: PodcastFeed) => void }) {
  return (
    <Card
      className="group cursor-pointer hover:shadow-lg transition-all duration-200 border-orange-200/30 hover:border-orange-400/50 bg-gradient-to-br from-card to-orange-50/5 dark:to-orange-950/10"
      onClick={() => onSelect(feed)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(feed)}
      aria-label={`${feed.title} by ${feed.author || "Unknown"}`}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-orange-100 dark:bg-orange-900/30 flex-shrink-0">
            {feed.imageUrl ? (
              <img
                src={feed.imageUrl}
                alt={feed.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Podcast className="h-8 w-8 text-orange-500" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
              {feed.title}
            </h3>
            {feed.author && (
              <p className="text-xs text-muted-foreground mt-0.5">{feed.author}</p>
            )}
            {feed.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{feed.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              {feed.episodeCount !== undefined && feed.episodeCount > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {feed.episodeCount} episodes
                </Badge>
              )}
              {feed.categories && Array.isArray(feed.categories) && feed.categories.slice(0, 2).map((cat, i) => (
                <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 border-orange-300/50">
                  {typeof cat === "string" ? cat : ""}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EpisodeRow({ episode, onPlay }: { episode: PodcastEpisode; onPlay: (ep: PodcastEpisode) => void }) {
  return (
    <div className="flex items-start gap-3 py-3 px-2 rounded-lg hover:bg-orange-50/50 dark:hover:bg-orange-950/20 transition-colors group">
      <Button
        size="sm"
        variant="ghost"
        className="h-9 w-9 rounded-full flex-shrink-0 group-hover:bg-orange-100 dark:group-hover:bg-orange-900/30"
        onClick={() => onPlay(episode)}
        aria-label={`Play ${episode.title}`}
      >
        <Play className="h-4 w-4 text-orange-600" />
      </Button>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium line-clamp-1">{episode.title}</h4>
        {episode.descriptionText && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{episode.descriptionText}</p>
        )}
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {episode.pubDate && <span>{formatDate(episode.pubDate)}</span>}
          {episode.durationSeconds && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(episode.durationSeconds)}
            </span>
          )}
          {episode.explicit && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">E</Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedDetail({ feed, onBack, onPlayEpisode }: {
  feed: PodcastFeed;
  onBack: () => void;
  onPlayEpisode: (ep: PodcastEpisode) => void;
}) {
  const { data: feedDetail } = useQuery<PodcastFeed>({
    queryKey: ["/api/podcasts/feeds", feed.id],
  });

  const { data: episodesData, isLoading } = useQuery<{ episodes: PodcastEpisode[] }>({
    queryKey: ["/api/podcasts/feeds", feed.id, "episodes"],
  });

  const detail = feedDetail || feed;
  const episodes = episodesData?.episodes || [];

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back to Podcasts
      </Button>

      <div className="flex flex-col sm:flex-row gap-6 mb-6">
        <div className="w-32 h-32 rounded-xl overflow-hidden bg-orange-100 dark:bg-orange-900/30 flex-shrink-0">
          {detail.imageUrl ? (
            <img src={detail.imageUrl} alt={detail.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Podcast className="h-12 w-12 text-orange-500" />
            </div>
          )}
        </div>
        <div>
          <h2 className="text-2xl font-bold">{detail.title}</h2>
          {detail.author && <p className="text-muted-foreground">{detail.author}</p>}
          {detail.description && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{detail.description}</p>
          )}
          <div className="flex items-center gap-2 mt-3">
            {detail.websiteUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={detail.websiteUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" /> Website
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      <h3 className="font-semibold mb-3">Episodes ({episodes.length})</h3>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 items-start">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : episodes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No episodes found. Try refreshing the feed.</p>
      ) : (
        <div className="divide-y divide-border">
          {episodes.map((ep) => (
            <EpisodeRow key={ep.id} episode={ep} onPlay={onPlayEpisode} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PodcastDiscovery() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFeed, setSelectedFeed] = useState<PodcastFeed | null>(null);
  const [feedUrlInput, setFeedUrlInput] = useState("");
  const { toast } = useToast();

  const { data: feedsData, isLoading } = useQuery<{ feeds: PodcastFeed[] }>({
    queryKey: ["/api/podcasts/feeds", searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      params.set("limit", "30");
      const res = await fetch(`/api/podcasts/feeds?${params}`);
      if (!res.ok) throw new Error("Failed to fetch feeds");
      return res.json();
    },
  });

  const ingestMutation = useMutation({
    mutationFn: async (feedUrl: string) => {
      const res = await apiRequest("POST", "/api/ingest", { feedUrl });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Podcast added!", description: `"${data.title}" with ${data.episodesUpserted} episodes` });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/feeds"] });
      setFeedUrlInput("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add podcast", description: err.message, variant: "destructive" });
    },
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const results = [];
      for (const feed of CURATED_FEEDS) {
        try {
          const res = await apiRequest("POST", "/api/ingest", { feedUrl: feed.url });
          const data = await res.json();
          results.push(data);
        } catch {
          // skip failures
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const added = results.filter(r => r.title).length;
      toast({ title: "Podcasts loaded!", description: `Added ${added} popular podcasts` });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/feeds"] });
    },
  });

  const handlePlayEpisode = (ep: PodcastEpisode) => {
    if (ep.audioUrl) {
      const audio = new Audio(ep.audioUrl);
      audio.play().catch(() => {
        toast({ title: "Playback error", description: "Could not play this episode. It may require direct access.", variant: "destructive" });
      });
      toast({ title: "Now playing", description: ep.title });
    }
  };

  const feeds = feedsData?.feeds || [];

  if (selectedFeed) {
    return (
      <section className="w-full" aria-label="Podcast detail">
        <FeedDetail
          feed={selectedFeed}
          onBack={() => setSelectedFeed(null)}
          onPlayEpisode={handlePlayEpisode}
        />
      </section>
    );
  }

  return (
    <section className="w-full" aria-labelledby="podcast-discovery-heading">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
          <Podcast className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h2 id="podcast-discovery-heading" className="text-2xl font-bold">Podcasts</h2>
          <p className="text-sm text-muted-foreground">Discover and listen to your favorite podcasts</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search podcasts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label="Search podcasts"
          />
        </div>
      </div>

      {feeds.length === 0 && !isLoading && !searchQuery && (
        <Card className="border-dashed border-orange-300/50 mb-6">
          <CardContent className="p-6 text-center">
            <Podcast className="h-12 w-12 text-orange-400 mx-auto mb-3" />
            <h3 className="font-semibold text-lg mb-2">Get Started with Podcasts</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Load popular podcasts to start listening, or add your own RSS feed.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {seedMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading Podcasts...
                  </>
                ) : (
                  <>
                    <Rss className="h-4 w-4 mr-2" />
                    Load Popular Podcasts
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 mb-4">
        <Input
          type="url"
          placeholder="Add podcast by RSS feed URL..."
          value={feedUrlInput}
          onChange={(e) => setFeedUrlInput(e.target.value)}
          className="max-w-md"
          aria-label="RSS feed URL"
        />
        <Button
          variant="outline"
          onClick={() => feedUrlInput && ingestMutation.mutate(feedUrlInput)}
          disabled={!feedUrlInput || ingestMutation.isPending}
        >
          {ingestMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rss className="h-4 w-4" />}
          <span className="ml-1 hidden sm:inline">Add Feed</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <Skeleton className="w-20 h-20 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : feeds.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {feeds.map((feed) => (
            <PodcastCard key={feed.id} feed={feed} onSelect={setSelectedFeed} />
          ))}
        </div>
      ) : searchQuery ? (
        <p className="text-center text-muted-foreground py-8">No podcasts found for "{searchQuery}"</p>
      ) : null}
    </section>
  );
}
