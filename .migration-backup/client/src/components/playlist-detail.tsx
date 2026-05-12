import { usePlaylist, useRemoveFromPlaylist } from "@/hooks/use-playlists";
import { Book, PlaylistWithCount } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Play, Trash2, ListMusic, BookOpen, Clock, Music2 } from "lucide-react";

interface PlaylistDetailProps {
  playlistId: string;
  onBack: () => void;
  onPlayBook: (book: Book) => void;
  allBooks: Book[];
  isOwner: boolean;
}

export function PlaylistDetail({ playlistId, onBack, onPlayBook, allBooks, isOwner }: PlaylistDetailProps) {
  const { data: playlist, isLoading } = usePlaylist(playlistId);
  const removeFromPlaylist = useRemoveFromPlaylist();
  const { toast } = useToast();

  const handleRemove = async (bookId: string, bookTitle: string) => {
    try {
      await removeFromPlaylist.mutateAsync({ playlistId, bookId });
      toast({ title: "Removed", description: `"${bookTitle}" removed from playlist` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to remove book", variant: "destructive" });
    }
  };

  const handlePlayBook = (bookId: string) => {
    const book = allBooks.find(b => b.id === bookId);
    if (book) {
      onPlayBook(book);
    } else {
      toast({ 
        title: "Book unavailable", 
        description: "This book is no longer available",
        variant: "destructive" 
      });
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-32" />
        <div className="flex gap-6">
          <Skeleton className="w-48 h-48 rounded-lg" />
          <div className="flex-1 space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Playlist not found</p>
        <Button variant="ghost" onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  const items = playlist.items || [];
  const totalDuration = items.reduce((total, item) => {
    const book = allBooks.find(b => b.id === item.bookId);
    return total + (book?.duration || 0);
  }, 0);

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to Library
      </Button>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-shrink-0">
          {playlist.coverImage ? (
            <img
              src={playlist.coverImage}
              alt={playlist.name}
              className="w-48 h-48 object-cover rounded-lg shadow-lg"
            />
          ) : (
            <div className="w-48 h-48 bg-gradient-to-br from-primary/30 via-primary/50 to-primary/70 rounded-lg shadow-lg flex items-center justify-center">
              <ListMusic className="h-16 w-16 text-primary-foreground/70" />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4">
          <div>
            {playlist.isCurated === 1 && (
              <div className="flex items-center gap-1 text-sm text-primary mb-2">
                <Music2 className="h-4 w-4" />
                Curated Collection
              </div>
            )}
            <h1 className="text-3xl font-bold">{playlist.name}</h1>
            {playlist.description && (
              <p className="text-muted-foreground mt-2">{playlist.description}</p>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <BookOpen className="h-4 w-4" />
              {items.length} {items.length === 1 ? 'book' : 'books'}
            </span>
            {totalDuration > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatDuration(totalDuration)}
              </span>
            )}
          </div>

          {items.length > 0 && (
            <Button 
              size="lg" 
              className="gap-2"
              onClick={() => items[0] && handlePlayBook(items[0].bookId)}
            >
              <Play className="h-5 w-5 fill-current" />
              Play All
            </Button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">This playlist is empty</h3>
            <p className="text-muted-foreground">
              Add audiobooks to this playlist to start listening
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold sr-only">Playlist items</h2>
          {items.map((item, index) => {
            const book = allBooks.find(b => b.id === item.bookId);
            return (
              <Card 
                key={item.id}
                className="hover:bg-muted/50 transition-colors group"
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <span className="text-muted-foreground w-6 text-right text-sm">
                    {index + 1}
                  </span>
                  
                  <div 
                    className="flex-1 flex items-center gap-4 cursor-pointer"
                    onClick={() => handlePlayBook(item.bookId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handlePlayBook(item.bookId)}
                    aria-label={`Play ${item.bookTitle}`}
                  >
                    {item.bookCover ? (
                      <img
                        src={item.bookCover}
                        alt={item.bookTitle}
                        className="w-12 h-16 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-16 bg-muted rounded flex items-center justify-center">
                        <BookOpen className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium line-clamp-1">{item.bookTitle}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {item.bookAuthor || 'Unknown author'}
                      </p>
                    </div>
                    
                    {book && (
                      <span className="text-sm text-muted-foreground hidden sm:block">
                        {formatDuration(book.duration)}
                      </span>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    onClick={() => handlePlayBook(item.bookId)}
                    aria-label={`Play ${item.bookTitle}`}
                  >
                    <Play className="h-4 w-4" />
                  </Button>

                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      onClick={() => handleRemove(item.bookId, item.bookTitle)}
                      disabled={removeFromPlaylist.isPending}
                      aria-label={`Remove ${item.bookTitle} from playlist`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
