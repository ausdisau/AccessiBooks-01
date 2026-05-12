import { useState } from "react";
import { usePlaylists, useCuratedPlaylists, useCreatePlaylist, useDeletePlaylist } from "@/hooks/use-playlists";
import { PlaylistWithCount, Book } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, ListMusic, Trash2, Lock, Globe, BookOpen, Music2 } from "lucide-react";

interface PlaylistSectionProps {
  onSelectPlaylist: (playlist: PlaylistWithCount) => void;
  isAuthenticated: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  classics: "📚",
  mystery: "🔍",
  sleep: "🌙",
  motivation: "💪",
  adventure: "🗺️",
  romance: "💕",
  scifi: "🚀",
  history: "📜",
};

function PlaylistCard({ 
  playlist, 
  onSelect, 
  onDelete,
  showDelete = false 
}: { 
  playlist: PlaylistWithCount; 
  onSelect: () => void;
  onDelete?: () => void;
  showDelete?: boolean;
}) {
  const categoryEmoji = playlist.category ? CATEGORY_ICONS[playlist.category] || "📖" : "📖";
  
  return (
    <Card 
      className="hover:shadow-lg transition-shadow cursor-pointer group relative"
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      role="button"
      aria-label={`Open playlist ${playlist.name}`}
    >
      <CardContent className="p-4">
        <div className="relative mb-3">
          {playlist.coverImage ? (
            <img
              src={playlist.coverImage}
              alt={`${playlist.name} cover`}
              className="w-full h-28 object-cover rounded-md"
            />
          ) : (
            <div className="w-full h-28 bg-gradient-to-br from-primary/20 via-primary/30 to-primary/50 rounded-md flex items-center justify-center">
              <span className="text-4xl" role="img" aria-hidden="true">{categoryEmoji}</span>
            </div>
          )}
          {playlist.isCurated === 1 && (
            <div className="absolute top-2 left-2 bg-primary/90 text-primary-foreground text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
              <Music2 className="h-3 w-3" />
              Curated
            </div>
          )}
        </div>
        
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm line-clamp-1">{playlist.name}</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <BookOpen className="h-3 w-3" />
              {playlist.itemCount} {playlist.itemCount === 1 ? 'book' : 'books'}
            </p>
          </div>
          
          {showDelete && onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label={`Delete playlist ${playlist.name}`}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
        
        {playlist.isPublic === 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <Lock className="h-3 w-3" />
            Private
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreatePlaylistDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const { toast } = useToast();
  const createPlaylist = useCreatePlaylist();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await createPlaylist.mutateAsync({ name, description, isPublic });
      toast({ title: "Playlist created!", description: `"${name}" is ready to use.` });
      setOpen(false);
      setName("");
      setDescription("");
      onCreated();
    } catch (error) {
      toast({ title: "Error", description: "Failed to create playlist", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Card className="hover:shadow-lg transition-shadow cursor-pointer border-dashed border-2 flex items-center justify-center min-h-[160px]">
          <CardContent className="p-4 text-center">
            <Plus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Create New Playlist</p>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Playlist</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="playlist-name">Name</Label>
            <Input
              id="playlist-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Reading List"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="playlist-description">Description (optional)</Label>
            <Textarea
              id="playlist-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A collection of my favorite audiobooks..."
              rows={3}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={isPublic ? "default" : "outline"}
              size="sm"
              onClick={() => setIsPublic(true)}
            >
              <Globe className="h-4 w-4 mr-1" />
              Public
            </Button>
            <Button
              type="button"
              variant={!isPublic ? "default" : "outline"}
              size="sm"
              onClick={() => setIsPublic(false)}
            >
              <Lock className="h-4 w-4 mr-1" />
              Private
            </Button>
          </div>
          <Button type="submit" className="w-full" disabled={createPlaylist.isPending}>
            {createPlaylist.isPending ? "Creating..." : "Create Playlist"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlaylistSection({ onSelectPlaylist, isAuthenticated }: PlaylistSectionProps) {
  const { data: userPlaylists, isLoading: loadingUser, refetch: refetchUser } = usePlaylists();
  const { data: curatedPlaylists, isLoading: loadingCurated } = useCuratedPlaylists();
  const deletePlaylist = useDeletePlaylist();
  const { toast } = useToast();

  const handleDelete = async (playlist: PlaylistWithCount) => {
    if (!confirm(`Delete "${playlist.name}"? This cannot be undone.`)) return;
    
    try {
      await deletePlaylist.mutateAsync(playlist.id);
      toast({ title: "Playlist deleted", description: `"${playlist.name}" has been removed.` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete playlist", variant: "destructive" });
    }
  };

  const isLoading = loadingUser || loadingCurated;
  const myPlaylists = userPlaylists?.filter(p => p.isCurated === 0) || [];

  if (isLoading) {
    return (
      <section className="space-y-6" aria-label="Playlists loading">
        <div className="flex items-center gap-2">
          <ListMusic className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">Your Library</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      {curatedPlaylists && curatedPlaylists.length > 0 && (
        <section className="space-y-4" aria-label="Curated playlists">
          <div className="flex items-center gap-2">
            <Music2 className="h-6 w-6 text-primary" aria-hidden="true" />
            <h2 className="text-2xl font-bold">Curated Collections</h2>
          </div>
          <p className="text-muted-foreground">Hand-picked audiobook collections by our team</p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {curatedPlaylists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                onSelect={() => onSelectPlaylist(playlist)}
              />
            ))}
          </div>
        </section>
      )}

      {isAuthenticated && (
        <section className="space-y-4" aria-label="Your playlists">
          <div className="flex items-center gap-2">
            <ListMusic className="h-6 w-6 text-primary" aria-hidden="true" />
            <h2 className="text-2xl font-bold">Your Playlists</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <CreatePlaylistDialog onCreated={() => refetchUser()} />
            {myPlaylists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                onSelect={() => onSelectPlaylist(playlist)}
                onDelete={() => handleDelete(playlist)}
                showDelete
              />
            ))}
          </div>
          {myPlaylists.length === 0 && (
            <p className="text-muted-foreground text-center py-4">
              Create your first playlist to start organizing your audiobooks!
            </p>
          )}
        </section>
      )}
    </div>
  );
}
