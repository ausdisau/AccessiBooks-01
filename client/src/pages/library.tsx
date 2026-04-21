import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { Book, PlaylistWithCount } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BookCard } from "@/components/book-card";
import { AdBanner } from "@/components/ad-banner";
import { ContinueListening } from "@/components/continue-listening";
import { GenreCards } from "@/components/genre-cards";
import { ForYouSection } from "@/components/for-you-section";
import { ListeningStatsCard } from "@/components/listening-stats";
import { LibraryCollections } from "@/components/library-collections";
import { BookCarousel } from "@/components/book-carousel";
import { DJSection } from "@/components/dj-section";
import { PlaylistSection } from "@/components/playlist-section";
import { PlaylistDetail } from "@/components/playlist-detail";
import { Search, Library as LibraryIcon, Clock, TrendingUp, Sparkles, Loader2, Crown, Headphones, Download, Shield, Zap, Check, X, Target, GraduationCap, BookHeart } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/use-subscription";
import { Progress } from "@/components/ui/progress";
import { SubmitContent } from "@/components/submit-content";
import { CommercialAudiobooks } from "@/components/commercial-audiobooks";
import { PodcastDiscovery } from "@/components/podcast-discovery";
import { MagazineSection } from "@/components/magazine-section";
import { useRewardedAd } from "@/hooks/use-rewarded-ad";
import { usePreferencesKernel } from "@/hooks/use-preferences-kernel";
import { RewardedAdOffer } from "@/components/RewardedAdOffer";
import { RewardedAdInterstitial } from "@/components/audio-ad-interstitial";
import { ActiveRewardBadge } from "@/components/ActiveRewardBadge";
import { useToast } from "@/hooks/use-toast";

interface OrgMemberData {
  userId: string;
  weeklyListeningMinutes: number;
}

interface OrgData {
  account: {
    orgName: string;
    weeklyGoalMinutes: number;
  };
  members: OrgMemberData[];
}

function OrgGoalCard({ userId }: { userId: string }) {
  const orgQuery = useQuery<OrgData>({
    queryKey: ["/api/institutional/members"],
    queryFn: () =>
      fetch("/api/institutional/members", { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("Not a member");
        return r.json() as Promise<OrgData>;
      }),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const orgData = orgQuery.data;
  if (!orgData?.account || !orgData.account.weeklyGoalMinutes) return null;

  const goalMinutes = orgData.account.weeklyGoalMinutes;
  const myData = orgData.members.find((m) => m.userId === userId);
  const weeklyMinutes = Math.min(myData?.weeklyListeningMinutes ?? 0, goalMinutes);
  const pct = goalMinutes > 0 ? Math.round((weeklyMinutes / goalMinutes) * 100) : 0;

  return (
    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 flex items-center gap-4">
      <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center flex-shrink-0">
        <Target className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground mb-1">
          {orgData.account.orgName} — Weekly Goal
        </p>
        <Progress value={pct} className="h-2 mb-1" />
        <p className="text-xs text-muted-foreground">
          {weeklyMinutes} / {goalMinutes} min this week ({pct}%)
          {pct >= 100 && " — Goal reached!"}
        </p>
      </div>
    </div>
  );
}

function PremiumHeroBanner({ onUpgrade }: { onUpgrade: () => void }) {
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem("accessibooks_premium_hero_dismissed") === "true"
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem("accessibooks_premium_hero_dismissed", "true");
    setDismissed(true);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl premium-hero-gradient p-6 md:p-8 text-white shadow-xl">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
        aria-label="Dismiss premium banner"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="absolute top-0 right-0 w-64 h-64 opacity-10">
        <Crown className="w-full h-full" />
      </div>
      <div className="relative z-10 max-w-2xl">
        <Badge className="bg-white/20 text-white border-0 mb-3 text-xs font-semibold">
          LIMITED TIME OFFER
        </Badge>
        <h2 className="text-2xl md:text-3xl font-bold mb-2">
          Unlock the Full Experience with Premium
        </h2>
        <p className="text-white/85 mb-4 text-sm md:text-base">
          Ad-free listening, HD audio, offline downloads, and unlimited text-to-speech.
          Everything you need for the ultimate audiobook experience.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="flex items-center gap-2 text-sm">
            <div className="p-1.5 rounded-lg bg-white/20">
              <Shield className="h-4 w-4" />
            </div>
            <span>Ad-free</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="p-1.5 rounded-lg bg-white/20">
              <Headphones className="h-4 w-4" />
            </div>
            <span>320kbps HD</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="p-1.5 rounded-lg bg-white/20">
              <Download className="h-4 w-4" />
            </div>
            <span>Offline mode</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="p-1.5 rounded-lg bg-white/20">
              <Zap className="h-4 w-4" />
            </div>
            <span>Unlimited TTS</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={onUpgrade}
            className="bg-white text-amber-700 hover:bg-white/90 font-bold shadow-lg px-6"
          >
            <Crown className="h-4 w-4 mr-2" />
            Try Premium Free for 7 Days
          </Button>
          <span className="text-white/70 text-xs">Cancel anytime. No commitment.</span>
        </div>
      </div>
    </div>
  );
}

function WhyPremiumStrip() {
  const comparisons = [
    { feature: "Audio Quality", free: "128kbps", premium: "320kbps HD" },
    { feature: "Ads", free: "Yes", premium: "None" },
    { feature: "Offline Downloads", free: "No", premium: "Unlimited" },
    { feature: "Text-to-Speech", free: "No", premium: "Unlimited" },
    { feature: "Skips", free: "6/hour", premium: "Unlimited" },
    { feature: "Devices", free: "2", premium: "5" },
  ];

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Crown className="h-5 w-5 text-amber-500" />
        <h3 className="font-bold text-foreground">Why Premium?</h3>
        <span className="text-xs text-muted-foreground">Free vs Premium at a glance</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {comparisons.map((item) => (
          <div key={item.feature} className="text-center space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{item.feature}</p>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground/70 line-through">{item.free}</span>
              <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{item.premium}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PremiumUpsellCard({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-center min-h-[280px]">
      <div className="p-3 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mb-3">
        <Crown className="h-6 w-6 text-white" />
      </div>
      <h4 className="font-bold text-foreground mb-1">Go Premium</h4>
      <p className="text-xs text-muted-foreground mb-3 max-w-[160px]">
        HD audio, offline downloads & no ads
      </p>
      <Button
        size="sm"
        onClick={onUpgrade}
        className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs"
      >
        Learn More
      </Button>
    </div>
  );
}

const READING_LEVEL_BADGE_COLORS: Record<number, string> = {
  1: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  2: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  3: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  4: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const READING_LEVEL_LABELS: Record<number, string> = {
  1: "Very Easy",
  2: "Easy",
  3: "Moderate",
  4: "Advanced",
};

function EasyReadShelf({ onSelectBook }: { onSelectBook: (book: Book) => void }) {
  const { data, isLoading } = useQuery<{ data: Book[]; total: number }>({
    queryKey: ["/api/books/easy-read"],
    queryFn: () => fetch("/api/books/easy-read?limit=24").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const books = data?.data ?? [];
  if (!isLoading && books.length === 0) return null;

  return (
    <div className="rounded-2xl border border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50/60 to-teal-50/60 dark:from-green-950/20 dark:to-teal-950/20 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-green-100 dark:bg-green-900">
          <BookHeart className="h-5 w-5 text-green-600 dark:text-green-400" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Easy Read Catalog</h2>
          <p className="text-xs text-muted-foreground">
            Books at reading levels 1 &amp; 2 — great for all readers{data?.total ? ` · ${data.total.toLocaleString()} titles` : ""}
          </p>
        </div>
        <div className="ml-auto flex gap-1.5">
          {[1, 2].map(lvl => (
            <span
              key={lvl}
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${READING_LEVEL_BADGE_COLORS[lvl]}`}
            >
              {READING_LEVEL_LABELS[lvl]}
            </span>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg bg-muted h-36" />
          ))}
        </div>
      ) : (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
          role="list"
          aria-label="Easy Read books"
        >
          {books.slice(0, 12).map(book => (
            <button
              key={book.id}
              role="listitem"
              onClick={() => onSelectBook(book)}
              className="group text-left rounded-xl overflow-hidden border border-border bg-card hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring transition-all"
              aria-label={`Open ${book.title} by ${book.author}. Reading level: ${book.readingLevel ? READING_LEVEL_LABELS[book.readingLevel] : ""}`}
            >
              <div className="relative aspect-[3/4] bg-muted">
                {book.coverImage ? (
                  <img
                    src={book.coverImage}
                    alt=""
                    aria-hidden="true"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookHeart className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}
                {book.readingLevel && (
                  <span
                    className={`absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${READING_LEVEL_BADGE_COLORS[book.readingLevel]}`}
                  >
                    {READING_LEVEL_LABELS[book.readingLevel]}
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="text-xs font-semibold line-clamp-2 text-foreground leading-tight">{book.title}</p>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{book.author}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface LibraryProps {
  onSelectBook: (book: Book) => void;
}

const PAGE_SIZE = 48;

export function Library({ onSelectBook }: LibraryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("title");
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistWithCount | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [readingLevelFilter, setReadingLevelFilter] = useState<string>("all");
  const { user } = useAuth();
  const { isPremium, isPaid, upgradeToTier, tier } = useSubscription();
  const isFree = tier === "free";
  const { offer, isEligible, activeRewards, completeReward, startSession } = useRewardedAd();
  const { profile } = usePreferencesKernel();
  const rewardedAdPreference = profile.rewardedAdPreference ?? "ask";
  const { toast } = useToast();
  const [showRewardedAd, setShowRewardedAd] = useState(false);
  const [rewardedImpressionId, setRewardedImpressionId] = useState<string | null>(null);
  const [offerDismissed, setOfferDismissed] = useState(false);
  // Guard so an "always" auto-accept fires only once per offer placement
  const autoAcceptedOfferRef = useRef<string | null>(null);

  const handleLibraryAcceptOffer = async () => {
    if (!offer) return;
    try {
      const result = await startSession({ rewardType: offer.rewardType });
      if (!result.ok || !result.impressionId) {
        toast({ title: "Couldn't start ad", description: "Please try again.", variant: "destructive" });
        return;
      }
      setRewardedImpressionId(result.impressionId);
      setShowRewardedAd(true);
    } catch {
      toast({ title: "Couldn't start ad", description: "Please try again.", variant: "destructive" });
    }
  };

  // Honor "always" preference: auto-accept the mid-roll offer once when it
  // appears. For "never" we do nothing here AND the prompt below is suppressed,
  // so the user is never bothered.
  useEffect(() => {
    if (
      isFree &&
      isEligible &&
      offer &&
      !showRewardedAd &&
      !offerDismissed &&
      rewardedAdPreference === "always" &&
      autoAcceptedOfferRef.current !== offer.adPlacementId
    ) {
      autoAcceptedOfferRef.current = offer.adPlacementId;
      handleLibraryAcceptOffer();
    }
  }, [isFree, isEligible, offer, showRewardedAd, offerDismissed, rewardedAdPreference]);

  const handleLibraryRewardedAdComplete = async (impressionId: string) => {
    setShowRewardedAd(false);
    setRewardedImpressionId(null);
    if (!offer) return;
    try {
      const result = await completeReward({ impressionId, rewardType: offer.rewardType });
      if (result.granted) {
        toast({ title: "Perk unlocked!", description: result.reward?.label ?? offer.label });
        setOfferDismissed(true);
      }
    } catch {
      toast({ title: "Something went wrong", description: "Could not grant your perk.", variant: "destructive" });
    }
  };
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    if (sourceFilter !== "all") params.set("source", sourceFilter);
    if (selectedGenre) params.set("genre", selectedGenre);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (readingLevelFilter !== "all") params.set("readingLevel", readingLevelFilter);
    return params.toString();
  };

  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery<{ data: Book[]; nextCursor: string | null; hasMore: boolean; total?: number }>({
    queryKey: ["/api/books", sourceFilter, selectedGenre, debouncedSearch, readingLevelFilter],
    queryFn: async ({ pageParam }) => {
      const qs = buildQueryString();
      const cursorParam = pageParam ? `&cursor=${pageParam}` : "";
      const res = await fetch(`/api/books?${qs}${cursorParam}`);
      if (!res.ok) throw new Error("Failed to fetch books");
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
  });

  const books = useMemo(() => {
    if (!paginatedData?.pages) return [];
    return paginatedData.pages.flatMap(page => page.data);
  }, [paginatedData]);

  const totalBooks = paginatedData?.pages?.[0]?.total ?? 0;

  const filteredAndSortedBooks = useMemo(() => {
    return [...books].sort((a, b) => {
      switch (sortBy) {
        case "author":
          return a.author.localeCompare(b.author);
        case "duration":
          return a.duration - b.duration;
        case "recent":
          return (b.publishedYear || 0) - (a.publishedYear || 0);
        default:
          return a.title.localeCompare(b.title);
      }
    });
  }, [books, sortBy]);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleGenreSelect = (genre: string) => {
    setSelectedGenre(genre || null);
    setSearchQuery("");
  };

  const booksBySource = useMemo(() => {
    const librivox = books.filter(b => b.source === "librivox").slice(0, 12);
    const itunes = books.filter(b => b.source === "itunes").slice(0, 12);
    const googleBooks = books.filter(b => b.source === "google-books").slice(0, 12);
    const openLibrary = books.filter(b => b.source === "open-library").slice(0, 12);
    const standardEbooks = books.filter(b => b.source === "standardebooks").slice(0, 12);
    const feedbooks = books.filter(b => b.source === "feedbooks").slice(0, 12);
    const openstax = books.filter(b => b.source === "openstax").slice(0, 12);
    const wikipedia = books.filter(b => b.source === "wikipedia").slice(0, 12);
    const podcasts = books.filter(b => b.source === "podcast" || b.source === "bbc" || b.source === "spotify-podcast").slice(0, 12);
    const loyalbooks = books.filter(b => b.source === "loyalbooks").slice(0, 12);
    const newest = [...books].sort((a, b) => (b.publishedYear || 0) - (a.publishedYear || 0)).slice(0, 12);
    return { librivox, itunes, googleBooks, openLibrary, standardEbooks, feedbooks, openstax, wikipedia, podcasts, loyalbooks, newest };
  }, [books]);

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive text-lg" data-testid="text-error">
          Failed to load audiobooks. Please try again later.
        </p>
      </div>
    );
  }

  const showPersonalizedSections = user && !searchQuery && !isLoading && !selectedPlaylist;

  if (selectedPlaylist) {
    return (
      <div className="space-y-8">
        <PlaylistDetail
          playlistId={selectedPlaylist.id}
          onBack={() => setSelectedPlaylist(null)}
          onPlayBook={onSelectBook}
          allBooks={books}
          isOwner={selectedPlaylist.userId === user?.id}
        />
      </div>
    );
  }

  const displayedBooks = filteredAndSortedBooks;

  return (
    <div className="space-y-8">
      {showRewardedAd && offer && rewardedImpressionId && (
        <RewardedAdInterstitial
          rewardLabel={offer.label}
          rewardType={offer.rewardType}
          impressionId={rewardedImpressionId}
          onComplete={handleLibraryRewardedAdComplete}
          onCancel={() => {
            setShowRewardedAd(false);
            setRewardedImpressionId(null);
          }}
        />
      )}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Library</h1>
        {isFree && activeRewards.length > 0 && (
          <ActiveRewardBadge rewards={activeRewards} />
        )}
      </div>
      {showPersonalizedSections && (
        <ListeningStatsCard />
      )}

      {showPersonalizedSections && user && (
        <OrgGoalCard userId={user.id} />
      )}

      {showPersonalizedSections && (
        <ContinueListening onSelectBook={onSelectBook} books={books} />
      )}

      {!isPaid && !isLoading && !searchQuery && (
        <PremiumHeroBanner onUpgrade={() => upgradeToTier("premium", "monthly")} />
      )}

      {/*
        Honor rewardedAdPreference:
          - "ask"   → show the offer card (default)
          - "always" → useEffect above auto-accepts; don't render the prompt
          - "never"  → suppress entirely (no offer card, no auto-accept)
      */}
      {isFree &&
        isEligible &&
        offer &&
        !offerDismissed &&
        !showRewardedAd &&
        showPersonalizedSections &&
        rewardedAdPreference === "ask" && (
          <RewardedAdOffer
            offer={offer}
            onAccept={handleLibraryAcceptOffer}
            onDismiss={() => setOfferDismissed(true)}
          />
        )}

      {showPersonalizedSections && (
        <DJSection onPlayBook={onSelectBook} />
      )}

      {!searchQuery && !isLoading && (
        <PlaylistSection 
          onSelectPlaylist={setSelectedPlaylist}
          isAuthenticated={!!user}
        />
      )}

      {showPersonalizedSections && (
        <LibraryCollections books={books} />
      )}

      {showPersonalizedSections && (
        <ForYouSection books={books} onSelectBook={onSelectBook} />
      )}

      {!isPaid && !isLoading && !searchQuery && !selectedGenre && (
        <WhyPremiumStrip />
      )}

      {!isLoading && !searchQuery && !selectedGenre && (
        <CommercialAudiobooks />
      )}

      {!isLoading && !searchQuery && !selectedGenre && (
        <PodcastDiscovery />
      )}

      {!isLoading && !searchQuery && !selectedGenre && (
        <MagazineSection />
      )}

      {!isLoading && !searchQuery && !selectedGenre && readingLevelFilter === "all" && (
        <EasyReadShelf onSelectBook={onSelectBook} />
      )}

      {!isLoading && !searchQuery && !selectedGenre && (
        <div className="space-y-8">
          {booksBySource.newest.length > 0 && (
            <BookCarousel
              title="New & Trending"
              books={booksBySource.newest}
              onBookSelect={onSelectBook}
              icon={TrendingUp}
            />
          )}
          {booksBySource.librivox.length > 0 && (
            <BookCarousel
              title="Free Audiobooks from LibriVox"
              books={booksBySource.librivox}
              onBookSelect={onSelectBook}
              icon={Sparkles}
            />
          )}
          {booksBySource.itunes.length > 0 && (
            <BookCarousel
              title="Popular on iTunes"
              books={booksBySource.itunes}
              onBookSelect={onSelectBook}
              icon={Clock}
            />
          )}
          {booksBySource.googleBooks.length > 0 && (
            <BookCarousel
              title="From Google Books"
              books={booksBySource.googleBooks}
              onBookSelect={onSelectBook}
            />
          )}
          {booksBySource.openLibrary.length > 0 && (
            <BookCarousel
              title="Open Library Collection"
              books={booksBySource.openLibrary}
              onBookSelect={onSelectBook}
            />
          )}
          {booksBySource.standardEbooks.length > 0 && (
            <BookCarousel
              title="Standard Ebooks - Premium Formatting"
              books={booksBySource.standardEbooks}
              onBookSelect={onSelectBook}
              icon={Sparkles}
            />
          )}
          {booksBySource.feedbooks.length > 0 && (
            <BookCarousel
              title="Feedbooks - Public Domain"
              books={booksBySource.feedbooks}
              onBookSelect={onSelectBook}
            />
          )}
          {booksBySource.loyalbooks.length > 0 && (
            <BookCarousel
              title="Loyal Books - Free Audiobooks"
              books={booksBySource.loyalbooks}
              onBookSelect={onSelectBook}
            />
          )}
          {booksBySource.openstax.length > 0 && (
            <BookCarousel
              title="OpenStax - Free Textbooks"
              books={booksBySource.openstax}
              onBookSelect={onSelectBook}
            />
          )}
          {booksBySource.wikipedia.length > 0 && (
            <BookCarousel
              title="Wikipedia - Spoken Articles"
              books={booksBySource.wikipedia}
              onBookSelect={onSelectBook}
            />
          )}
          {booksBySource.podcasts.length > 0 && (
            <BookCarousel
              title="Podcasts & Audio Drama"
              books={booksBySource.podcasts}
              onBookSelect={onSelectBook}
            />
          )}
        </div>
      )}

      {showPersonalizedSections && (
        <SubmitContent />
      )}

      {!isLoading && books.length > 0 && !searchQuery && (
        <GenreCards 
          books={books} 
          onGenreSelect={handleGenreSelect}
          selectedGenre={selectedGenre}
        />
      )}

      <AdBanner variant="library" />

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <LibraryIcon className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">
            {selectedGenre ? `${selectedGenre.charAt(0).toUpperCase() + selectedGenre.slice(1)} Books` : "All Audiobooks"}
          </h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex-1 w-full sm:max-w-md">
            <label htmlFor="search-books" className="sr-only">
              Search audiobooks
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" aria-hidden="true" />
              <Input
                id="search-books"
                type="search"
                placeholder="Search by title, author, or genre..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value) setSelectedGenre(null);
                }}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto flex-wrap">
            <Select value={readingLevelFilter} onValueChange={setReadingLevelFilter}>
              <SelectTrigger className="w-full sm:w-36" data-testid="select-reading-level" aria-label="Filter by reading level">
                <GraduationCap className="h-3.5 w-3.5 mr-1 text-muted-foreground" aria-hidden="true" />
                <SelectValue placeholder="Reading Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="1">Very Easy</SelectItem>
                <SelectItem value="2">Easy</SelectItem>
                <SelectItem value="3">Moderate</SelectItem>
                <SelectItem value="4">Advanced</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-full sm:w-36" data-testid="select-source">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="librivox">LibriVox</SelectItem>
                <SelectItem value="gutenberg">Gutenberg</SelectItem>
                <SelectItem value="standardebooks">Standard Ebooks</SelectItem>
                <SelectItem value="feedbooks">Feedbooks</SelectItem>
                <SelectItem value="loyalbooks">Loyal Books</SelectItem>
                <SelectItem value="openstax">OpenStax</SelectItem>
                <SelectItem value="wikipedia">Wikipedia</SelectItem>
                <SelectItem value="podcasts">Podcasts</SelectItem>
                <SelectItem value="itunes">iTunes</SelectItem>
                <SelectItem value="google-books">Google Books</SelectItem>
                <SelectItem value="open-library">Open Library</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-32" data-testid="select-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="author">Author</SelectItem>
                <SelectItem value="duration">Duration</SelectItem>
                <SelectItem value="recent">Recent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-6 animate-pulse">
              <div className="w-full h-48 bg-muted rounded-md mb-4" />
              <div className="h-4 bg-muted rounded mb-2" />
              <div className="h-3 bg-muted rounded mb-2 w-3/4" />
              <div className="h-3 bg-muted rounded mb-4 w-1/2" />
              <div className="h-10 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : filteredAndSortedBooks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-lg" data-testid="text-no-books">
            {searchQuery ? "No audiobooks found matching your search." : "No audiobooks available."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            Showing {displayedBooks.length} of {filteredAndSortedBooks.length} titles
          </p>
          <div 
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6" 
            role="list" 
            aria-label="Audiobook library"
            data-testid="grid-books"
          >
            {displayedBooks.flatMap((book, index) => {
              const items = [];
              if (!isPaid && index > 0 && index % 8 === 0) {
                items.push(
                  <PremiumUpsellCard key={`upsell-${index}`} onUpgrade={() => upgradeToTier("premium", "monthly")} />
                );
              }
              items.push(
                <BookCard
                  key={book.id}
                  book={book}
                  onPlayBook={onSelectBook}
                />
              );
              return items;
            })}
          </div>
          {(hasNextPage || isFetchingNextPage) && (
            <div ref={loadMoreRef} className="flex justify-center items-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">
                Loading more...{totalBooks > 0 ? ` (${totalBooks.toLocaleString()} total titles)` : ''}
              </span>
            </div>
          )}
          {!hasNextPage && !isFetchingNextPage && displayedBooks.length > 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Showing {displayedBooks.length.toLocaleString()} of {totalBooks.toLocaleString()} titles
            </div>
          )}
        </>
      )}
    </div>
  );
}
