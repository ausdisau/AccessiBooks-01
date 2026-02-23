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
import { Search, Library as LibraryIcon, Clock, TrendingUp, Sparkles, Loader2, Crown, Headphones, Download, Shield, Zap, Check, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/use-subscription";
import { SubmitContent } from "@/components/submit-content";
import { CommercialAudiobooks } from "@/components/commercial-audiobooks";
import { PodcastDiscovery } from "@/components/podcast-discovery";
import { MagazineSection } from "@/components/magazine-section";

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
  const { user } = useAuth();
  const { isPremium, isPaid, upgradeToTier } = useSubscription();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data: books = [], isLoading, error } = useQuery<Book[]>({
    queryKey: ["/api/books"],
  });

  const filteredAndSortedBooks = useMemo(() => {
    return books
      .filter(book => {
        const matchesSearch = 
          book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          book.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (book.genre && book.genre.toLowerCase().includes(searchQuery.toLowerCase()));
        
        const matchesGenre = !selectedGenre || 
          (book.genre && book.genre.toLowerCase().includes(selectedGenre.toLowerCase()));
        
        const matchesSource = sourceFilter === "all" || book.source === sourceFilter ||
          (sourceFilter === "podcasts" && (book.source === "podcast" || book.source === "bbc" || book.source === "spotify-podcast"));
        
        return matchesSearch && matchesGenre && matchesSource;
      })
      .sort((a, b) => {
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
  }, [books, searchQuery, selectedGenre, sourceFilter, sortBy]);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, selectedGenre, sourceFilter, sortBy]);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < filteredAndSortedBooks.length) {
          setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filteredAndSortedBooks.length));
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [visibleCount, filteredAndSortedBooks.length]);

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

  const displayedBooks = filteredAndSortedBooks.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAndSortedBooks.length;

  return (
    <div className="space-y-8">
      {showPersonalizedSections && (
        <ListeningStatsCard />
      )}

      {showPersonalizedSections && (
        <ContinueListening onSelectBook={onSelectBook} books={books} />
      )}

      {!isPaid && !isLoading && !searchQuery && (
        <PremiumHeroBanner onUpgrade={() => upgradeToTier("premium", "monthly")} />
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
          <div className="flex-1 max-w-md">
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
          
          <div className="flex items-center space-x-4">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-36" data-testid="select-source">
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
              <SelectTrigger className="w-32" data-testid="select-sort">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" 
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
          {hasMore && (
            <div ref={loadMoreRef} className="flex justify-center items-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">
                Loading more... ({filteredAndSortedBooks.length - visibleCount} remaining)
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
