import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Book, PlaylistWithCount } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Search, Library as LibraryIcon, Clock, TrendingUp, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SubmitContent } from "@/components/submit-content";
import { CommercialAudiobooks } from "@/components/commercial-audiobooks";

interface LibraryProps {
  onSelectBook: (book: Book) => void;
}

export function Library({ onSelectBook }: LibraryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("title");
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistWithCount | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(48);
  const { user } = useAuth();

  const { data: books = [], isLoading, error } = useQuery<Book[]>({
    queryKey: ["/api/books"],
  });

  const filteredAndSortedBooks = books
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

  const handleGenreSelect = (genre: string) => {
    setSelectedGenre(genre || null);
    setSearchQuery("");
    setVisibleCount(48);
  };

  // Group books by source for carousels
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

  // If a playlist is selected, show the detail view
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

  return (
    <div className="space-y-8">
      {/* Listening Stats for logged in users */}
      {showPersonalizedSections && (
        <ListeningStatsCard />
      )}

      {/* Continue Listening - only show when logged in and not searching */}
      {showPersonalizedSections && (
        <ContinueListening onSelectBook={onSelectBook} books={books} />
      )}

      {/* DJ Section - Personalized recommendations */}
      {showPersonalizedSections && (
        <DJSection onPlayBook={onSelectBook} />
      )}

      {/* Playlists Section */}
      {!searchQuery && !isLoading && (
        <PlaylistSection 
          onSelectPlaylist={setSelectedPlaylist}
          isAuthenticated={!!user}
        />
      )}

      {/* My Collections - only show when logged in */}
      {showPersonalizedSections && (
        <LibraryCollections books={books} />
      )}

      {/* For You recommendations - only show when logged in and not searching */}
      {showPersonalizedSections && (
        <ForYouSection books={books} onSelectBook={onSelectBook} />
      )}

      {/* Commercial Audiobooks - Spotify & Amazon/Audible */}
      {!isLoading && !searchQuery && !selectedGenre && (
        <CommercialAudiobooks />
      )}

      {/* Horizontal carousels by source */}
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

      {/* Submit Content - for logged in users */}
      {showPersonalizedSections && (
        <SubmitContent />
      )}

      {/* Genre browsing */}
      {!isLoading && books.length > 0 && !searchQuery && (
        <GenreCards 
          books={books} 
          onGenreSelect={handleGenreSelect}
          selectedGenre={selectedGenre}
        />
      )}

      {/* Ad banner for free users */}
      <AdBanner variant="library" />

      {/* Search and filters */}
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
                  setVisibleCount(48);
                  if (e.target.value) setSelectedGenre(null);
                }}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setVisibleCount(48); }}>
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

      {/* Books grid */}
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
            Showing {Math.min(visibleCount, filteredAndSortedBooks.length)} of {filteredAndSortedBooks.length} titles
          </p>
          <div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" 
            role="list" 
            aria-label="Audiobook library"
            data-testid="grid-books"
          >
            {filteredAndSortedBooks.slice(0, visibleCount).map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onPlayBook={onSelectBook}
              />
            ))}
          </div>
          {visibleCount < filteredAndSortedBooks.length && (
            <div className="flex justify-center mt-8">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setVisibleCount(prev => prev + 48)}
              >
                Load More ({filteredAndSortedBooks.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
