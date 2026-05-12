import { useState } from "react";
import { usePlaylists, useCreatePlaylist, useAddToPlaylist } from "@/hooks/use-playlists";
import { Book, PlaylistWithCount } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Check, ListMusic, BookOpen } from "lucide-react";

interface AddToPlaylistDialogProps {
  book: Book | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddToPlaylistDialog({ book, open, onOpenChange }: AddToPlaylistDialogProps) {
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showCreateNew, setShowCreateNew] = useState(false);
  const { data: playlists, isLoading, refetch } = usePlaylists();
  const createPlaylist = useCreatePlaylist();
  const addToPlaylist = useAddToPlaylist();
  const { toast } = useToast();

  const userPlaylists = playlists?.filter(p => p.isCurated === 0) || [];

  const handleAddToPlaylist = async (playlist: PlaylistWithCount) => {
    if (!book) return;

    const alreadyInPlaylist = playlist.items?.some(item => item.bookId === book.id);
    if (alreadyInPlaylist) {
      toast({ 
        title: "Already added", 
        description: `"${book.title}" is already in "${playlist.name}"`,
        variant: "default"
      });
      return;
    }

    try {
      await addToPlaylist.mutateAsync({
        playlistId: playlist.id,
        book: {
          bookId: book.id,
          bookTitle: book.title,
          bookAuthor: book.author,
          bookCover: book.coverImage || undefined,
        },
      });
      toast({ 
        title: "Added to playlist", 
        description: `"${book.title}" added to "${playlist.name}"`
      });
      onOpenChange(false);
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to add to playlist", 
        variant: "destructive" 
      });
    }
  };

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!book || !newPlaylistName.trim()) return;

    try {
      const newPlaylist = await createPlaylist.mutateAsync({ 
        name: newPlaylistName,
        isPublic: true 
      });
      
      await addToPlaylist.mutateAsync({
        playlistId: newPlaylist.id,
        book: {
          bookId: book.id,
          bookTitle: book.title,
          bookAuthor: book.author,
          bookCover: book.coverImage || undefined,
        },
      });
      
      toast({ 
        title: "Playlist created", 
        description: `"${book.title}" added to new playlist "${newPlaylistName}"`
      });
      setNewPlaylistName("");
      setShowCreateNew(false);
      refetch();
      onOpenChange(false);
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to create playlist", 
        variant: "destructive" 
      });
    }
  };

  if (!book) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListMusic className="h-5 w-5" />
            Add to Playlist
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg mb-4">
          {book.coverImage ? (
            <img 
              src={book.coverImage} 
              alt={book.title} 
              className="w-12 h-16 object-cover rounded"
            />
          ) : (
            <div className="w-12 h-16 bg-primary/20 rounded flex items-center justify-center">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium line-clamp-2">{book.title}</p>
            <p className="text-sm text-muted-foreground">{book.author}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {userPlaylists.length === 0 && !showCreateNew ? (
              <p className="text-center text-muted-foreground py-4">
                You don't have any playlists yet
              </p>
            ) : (
              userPlaylists.map((playlist) => {
                const isInPlaylist = playlist.items?.some(item => item.bookId === book.id);
                return (
                  <Button
                    key={playlist.id}
                    variant="outline"
                    className="w-full justify-between h-auto py-3"
                    onClick={() => handleAddToPlaylist(playlist)}
                    disabled={addToPlaylist.isPending}
                  >
                    <div className="flex items-center gap-2 text-left">
                      <ListMusic className="h-4 w-4 flex-shrink-0" />
                      <div>
                        <p className="font-medium">{playlist.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {playlist.itemCount} {playlist.itemCount === 1 ? 'book' : 'books'}
                        </p>
                      </div>
                    </div>
                    {isInPlaylist && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                  </Button>
                );
              })
            )}

            {showCreateNew ? (
              <form onSubmit={handleCreateAndAdd} className="flex gap-2 pt-2">
                <Input
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="New playlist name"
                  autoFocus
                  className="flex-1"
                />
                <Button 
                  type="submit" 
                  disabled={!newPlaylistName.trim() || createPlaylist.isPending}
                >
                  Add
                </Button>
              </form>
            ) : (
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-primary"
                onClick={() => setShowCreateNew(true)}
              >
                <Plus className="h-4 w-4" />
                Create new playlist
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
