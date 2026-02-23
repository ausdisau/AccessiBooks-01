import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Search, Podcast, Play, Pause, Clock, ChevronLeft, ChevronRight, Rss, ExternalLink, Loader2, Star, Calendar, Headphones, TrendingUp, Volume2, X, SkipForward } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAudioContext } from "@/contexts/AudioContext";
import { useSubscription } from "@/hooks/use-subscription";
import { audioAdService, type AdResponse } from "@/services/audio-ad-service";

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
  lastEpisodeDate?: string | null;
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

const CATEGORY_FILTERS = [
  "All",
  "True Crime",
  "Comedy",
  "News",
  "Technology",
  "Science",
  "History",
  "Education",
  "Business",
  "Health",
] as const;

const CURATED_FEEDS = [
  { url: "https://feeds.simplecast.com/54nAGcIl", name: "The Daily", category: "News" },
  { url: "https://feeds.megaphone.fm/stuffyoushouldknow", name: "Stuff You Should Know", category: "Education" },
  { url: "https://rss.art19.com/serial", name: "Serial", category: "True Crime" },
  { url: "https://feeds.npr.org/510289/podcast.xml", name: "Planet Money", category: "Business" },
  { url: "https://feeds.npr.org/344098539/podcast.xml", name: "Hidden Brain", category: "Science" },
  { url: "https://feeds.megaphone.fm/sciencevs", name: "Science Vs", category: "Science" },
  { url: "https://rss.art19.com/the-tim-ferriss-show", name: "Tim Ferriss Show", category: "Business" },
  { url: "https://feeds.simplecast.com/wgl4xEgL", name: "Huberman Lab", category: "Health" },
];

const POPULAR_PODCASTS = [
  { name: "The Daily", author: "The New York Times", category: "News", description: "The biggest stories of our time, told by the best journalists in the world." },
  { name: "Serial", author: "Serial Productions", category: "True Crime", description: "Serial unfolds one nonfiction story — told week by week — over the course of a season." },
  { name: "Stuff You Should Know", author: "iHeartPodcasts", category: "Education", description: "If you've ever wanted to know about champagne, satanism, the Stonewall Uprising, or why weeli'teli have jet packs, listen up." },
  { name: "Planet Money", author: "NPR", category: "Business", description: "The economy explained. Imagine you could call up a friend and say, 'What's going on with the economy?'" },
  { name: "Science Vs", author: "Spotify Studios", category: "Science", description: "Science Vs takes on fads and trends to find out what's fact, what's not, and what's somewhere in between." },
  { name: "Huberman Lab", author: "Scicomm Media", category: "Health", description: "Discuss neuroscience — how our brain and its connections with the organs of our body control our perceptions." },
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

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-orange-100 dark:bg-orange-900/30 flex-shrink-0 shadow-sm">
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
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {feed.episodeCount !== undefined && feed.episodeCount > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  <Headphones className="h-2.5 w-2.5 mr-0.5" />
                  {feed.episodeCount} episodes
                </Badge>
              )}
              {feed.lastEpisodeDate && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-orange-100/50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300">
                  <Calendar className="h-2.5 w-2.5 mr-0.5" />
                  {formatRelativeDate(feed.lastEpisodeDate)}
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

function PopularPodcastCard({ podcast }: { podcast: typeof POPULAR_PODCASTS[0] }) {
  return (
    <div className="flex-shrink-0 w-44">
      <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-orange-400 to-red-500 dark:from-orange-600 dark:to-red-700 flex items-center justify-center mb-2 shadow-md">
        <Podcast className="h-12 w-12 text-white/90" />
      </div>
      <h4 className="text-sm font-semibold line-clamp-1">{podcast.name}</h4>
      <p className="text-xs text-muted-foreground line-clamp-1">{podcast.author}</p>
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-1 border-orange-300/50">
        {podcast.category}
      </Badge>
    </div>
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

function PodcastAdOverlay({ ad, adType, skipAfterMs, onComplete, onSkip, onUpgrade }: {
  ad: AdResponse;
  adType: "pre-roll" | "mid-roll";
  skipAfterMs: number;
  onComplete: () => void;
  onSkip: () => void;
  onUpgrade: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const canSkip = elapsed * 1000 >= skipAfterMs;
  const adDuration = ad.duration || 15;

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        if (next >= adDuration) {
          clearInterval(interval);
          onComplete();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [adDuration, onComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-orange-400/50 shadow-2xl">
        <CardContent className="p-6 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-orange-500">
            <Volume2 className="h-5 w-5 animate-pulse" />
            <span className="text-sm font-medium uppercase tracking-wider">
              {adType === "pre-roll" ? "Ad before episode" : "Mid-roll ad"}
            </span>
          </div>

          <h3 className="text-lg font-bold">{ad.title}</h3>
          {ad.isProgrammatic === false && ad.description && (
            <p className="text-sm text-muted-foreground">{ad.description}</p>
          )}

          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-orange-500 h-2 rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(100, (elapsed / adDuration) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{Math.max(0, adDuration - elapsed)}s remaining</p>

          <div className="flex gap-2 justify-center">
            {canSkip ? (
              <Button variant="outline" size="sm" onClick={onSkip}>
                <SkipForward className="h-4 w-4 mr-1" /> Skip Ad
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Skip available in {Math.ceil((skipAfterMs / 1000) - elapsed)}s
              </p>
            )}
            <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={onUpgrade}>
              Go Ad-Free
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function PodcastDiscovery() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFeed, setSelectedFeed] = useState<PodcastFeed | null>(null);
  const [feedUrlInput, setFeedUrlInput] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const { toast } = useToast();
  const { audioRef: mainAudioRef } = useAudioContext();
  const podcastAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingEpisodeId, setPlayingEpisodeId] = useState<string | null>(null);
  const { isPaid, isLoading: subLoading } = useSubscription();

  const [podcastAd, setPodcastAd] = useState<{
    ad: AdResponse;
    adType: "pre-roll" | "mid-roll";
    genre?: string;
  } | null>(null);
  const pendingEpisodeRef = useRef<PodcastEpisode | null>(null);
  const pendingGenreRef = useRef<string | undefined>(undefined);
  const playbackStartRef = useRef<number>(0);
  const lastMidRollRef = useRef<number>(0);
  const midRollCheckRef = useRef<NodeJS.Timeout | null>(null);

  const currentFeedGenre = useMemo(() => {
    if (!selectedFeed?.categories || !Array.isArray(selectedFeed.categories)) return undefined;
    return selectedFeed.categories[0] || undefined;
  }, [selectedFeed]);

  const startMidRollTracking = useCallback(() => {
    if (midRollCheckRef.current) clearInterval(midRollCheckRef.current);
    if (isPaid) return;

    playbackStartRef.current = Date.now();
    lastMidRollRef.current = Date.now();

    midRollCheckRef.current = setInterval(async () => {
      const now = Date.now();
      const elapsed = now - playbackStartRef.current;

      if (audioAdService.shouldShowPodcastMidRoll(isPaid, elapsed, lastMidRollRef.current - playbackStartRef.current)) {
        lastMidRollRef.current = now;

        if (podcastAudioRef.current && !podcastAudioRef.current.paused) {
          podcastAudioRef.current.pause();
        }

        audioAdService.playAdChime();
        const ad = await audioAdService.requestPodcastAd("mid-roll", pendingGenreRef.current);
        setPodcastAd({ ad, adType: "mid-roll", genre: pendingGenreRef.current });
      }
    }, 30000);
  }, [isPaid]);

  const stopMidRollTracking = useCallback(() => {
    if (midRollCheckRef.current) {
      clearInterval(midRollCheckRef.current);
      midRollCheckRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopMidRollTracking();
  }, [stopMidRollTracking]);

  const handlePodcastAdComplete = useCallback((skipped: boolean) => {
    if (podcastAd) {
      audioAdService.recordPodcastImpression(
        podcastAd.ad.id,
        podcastAd.adType,
        !skipped,
        skipped,
        podcastAd.ad.isProgrammatic ? podcastAd.ad.provider : "house",
        podcastAd.genre
      );
    }

    const adType = podcastAd?.adType;
    setPodcastAd(null);

    if (adType === "pre-roll" && pendingEpisodeRef.current) {
      const ep = pendingEpisodeRef.current;
      pendingEpisodeRef.current = null;
      startEpisodePlayback(ep);
    } else if (adType === "mid-roll") {
      if (podcastAudioRef.current) {
        podcastAudioRef.current.play().catch(() => {});
      }
    }
  }, [podcastAd]);

  const handlePodcastAdUpgrade = useCallback(() => {
    if (podcastAd) {
      audioAdService.recordPodcastImpression(
        podcastAd.ad.id,
        podcastAd.adType,
        false,
        true,
        podcastAd.ad.isProgrammatic ? podcastAd.ad.provider : "house",
        podcastAd.genre
      );
    }
    setPodcastAd(null);
    pendingEpisodeRef.current = null;
    stopMidRollTracking();
    window.location.href = "/api/subscription/create-checkout";
  }, [podcastAd, stopMidRollTracking]);

  const startEpisodePlayback = useCallback((ep: PodcastEpisode) => {
    if (podcastAudioRef.current) {
      podcastAudioRef.current.pause();
      podcastAudioRef.current.src = "";
      podcastAudioRef.current = null;
    }

    if (mainAudioRef.current && !mainAudioRef.current.paused) {
      mainAudioRef.current.pause();
    }

    const audio = new Audio(ep.audioUrl);
    podcastAudioRef.current = audio;
    setPlayingEpisodeId(ep.id);
    audio.addEventListener("ended", () => {
      setPlayingEpisodeId(null);
      podcastAudioRef.current = null;
      stopMidRollTracking();
    });
    audio.play().catch(() => {
      setPlayingEpisodeId(null);
      podcastAudioRef.current = null;
      toast({ title: "Playback error", description: "Could not play this episode. It may require direct access.", variant: "destructive" });
    });
    toast({ title: "Now playing", description: ep.title });

    startMidRollTracking();
  }, [mainAudioRef, toast, startMidRollTracking, stopMidRollTracking]);

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

  const handlePlayEpisode = useCallback(async (ep: PodcastEpisode) => {
    if (!ep.audioUrl) return;

    if (playingEpisodeId === ep.id && podcastAudioRef.current) {
      podcastAudioRef.current.pause();
      podcastAudioRef.current.src = "";
      podcastAudioRef.current = null;
      setPlayingEpisodeId(null);
      stopMidRollTracking();
      return;
    }

    const genre = currentFeedGenre;
    pendingGenreRef.current = genre;

    if (audioAdService.shouldShowPodcastPreRoll(isPaid)) {
      pendingEpisodeRef.current = ep;
      audioAdService.playAdChime();
      const ad = await audioAdService.requestPodcastAd("pre-roll", genre);
      setPodcastAd({ ad, adType: "pre-roll", genre });
      return;
    }

    startEpisodePlayback(ep);
  }, [playingEpisodeId, isPaid, currentFeedGenre, startEpisodePlayback, stopMidRollTracking]);

  const feeds = feedsData?.feeds || [];

  const filteredFeeds = useMemo(() => {
    if (activeCategory === "All") return feeds;
    return feeds.filter((feed) => {
      if (!feed.categories || !Array.isArray(feed.categories)) return false;
      return feed.categories.some((cat) =>
        typeof cat === "string" && cat.toLowerCase().includes(activeCategory.toLowerCase())
      );
    });
  }, [feeds, activeCategory]);

  if (selectedFeed) {
    return (
      <section className="w-full" aria-label="Podcast detail">
        {podcastAd && (
          <PodcastAdOverlay
            ad={podcastAd.ad}
            adType={podcastAd.adType}
            skipAfterMs={audioAdService.getSkipOffsetMs(podcastAd.ad)}
            onComplete={() => handlePodcastAdComplete(false)}
            onSkip={() => handlePodcastAdComplete(true)}
            onUpgrade={handlePodcastAdUpgrade}
          />
        )}
        <FeedDetail
          feed={selectedFeed}
          onBack={() => { setSelectedFeed(null); stopMidRollTracking(); }}
          onPlayEpisode={handlePlayEpisode}
        />
      </section>
    );
  }

  return (
    <section className="w-full" aria-labelledby="podcast-discovery-heading">
      {podcastAd && (
        <PodcastAdOverlay
          ad={podcastAd.ad}
          adType={podcastAd.adType}
          skipAfterMs={audioAdService.getSkipOffsetMs(podcastAd.ad)}
          onComplete={() => handlePodcastAdComplete(false)}
          onSkip={() => handlePodcastAdComplete(true)}
          onUpgrade={handlePodcastAdUpgrade}
        />
      )}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
          <Podcast className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h2 id="podcast-discovery-heading" className="text-2xl font-bold">Podcasts</h2>
          <p className="text-sm text-muted-foreground">Discover and listen to your favorite podcasts</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search podcasts by name, topic, or host..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label="Search podcasts"
          />
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-thin" role="tablist" aria-label="Filter by category">
        {CATEGORY_FILTERS.map((category) => (
          <Button
            key={category}
            variant={activeCategory === category ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveCategory(category)}
            className={`flex-shrink-0 text-xs ${
              activeCategory === category
                ? "bg-orange-600 hover:bg-orange-700 text-white"
                : "border-orange-200/50 hover:border-orange-400/50 hover:bg-orange-50 dark:hover:bg-orange-950/20"
            }`}
            role="tab"
            aria-selected={activeCategory === category}
          >
            {category}
          </Button>
        ))}
      </div>

      {feeds.length === 0 && !isLoading && !searchQuery && (
        <>
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-orange-500" />
              <h3 className="text-lg font-semibold">Popular Podcasts</h3>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-thin">
              {POPULAR_PODCASTS.map((podcast, i) => (
                <PopularPodcastCard key={i} podcast={podcast} />
              ))}
            </div>
          </div>

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
        </>
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
      ) : filteredFeeds.length > 0 ? (
        <>
          {activeCategory !== "All" && (
            <p className="text-sm text-muted-foreground mb-3">
              Showing {filteredFeeds.length} podcast{filteredFeeds.length !== 1 ? "s" : ""} in {activeCategory}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFeeds.map((feed) => (
              <PodcastCard key={feed.id} feed={feed} onSelect={setSelectedFeed} />
            ))}
          </div>
        </>
      ) : searchQuery ? (
        <p className="text-center text-muted-foreground py-8">No podcasts found for "{searchQuery}"</p>
      ) : activeCategory !== "All" && feeds.length > 0 ? (
        <div className="text-center py-8">
          <Podcast className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">No podcasts found in {activeCategory}</p>
          <Button
            variant="link"
            className="text-orange-600 mt-1"
            onClick={() => setActiveCategory("All")}
          >
            View all podcasts
          </Button>
        </div>
      ) : null}
    </section>
  );
}
