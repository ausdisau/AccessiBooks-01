import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localStorageService, Collection } from "@/lib/storage";
import { Book } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Folder,
  Plus,
  Heart,
  Moon,
  Plane,
  Dumbbell,
  Coffee,
  Star,
  MoreVertical,
  Trash2,
  BookOpen,
} from "lucide-react";

const COLLECTION_ICONS = [
  { id: "heart", icon: Heart, label: "Favorites" },
  { id: "moon", icon: Moon, label: "Bedtime" },
  { id: "plane", icon: Plane, label: "Travel" },
  { id: "dumbbell", icon: Dumbbell, label: "Workout" },
  { id: "coffee", icon: Coffee, label: "Relaxing" },
  { id: "star", icon: Star, label: "Top Picks" },
  { id: "folder", icon: Folder, label: "General" },
];

function getIconComponent(iconId: string) {
  const found = COLLECTION_ICONS.find(i => i.id === iconId);
  return found?.icon || Folder;
}

interface LibraryCollectionsProps {
  books: Book[];
  onSelectCollection?: (collection: Collection) => void;
}

export function LibraryCollections({ books, onSelectCollection }: LibraryCollectionsProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("folder");

  useEffect(() => {
    setCollections(localStorageService.getCollections());
  }, []);

  const handleCreate = () => {
    if (newName.trim()) {
      const collection = localStorageService.createCollection(newName.trim(), selectedIcon);
      setCollections([...collections, collection]);
      setNewName("");
      setSelectedIcon("folder");
      setIsCreateOpen(false);
    }
  };

  const handleDelete = (id: string) => {
    localStorageService.deleteCollection(id);
    setCollections(collections.filter(c => c.id !== id));
  };

  const getCollectionBooks = (collection: Collection) => {
    return books.filter(book => collection.bookIds.includes(book.id));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Folder className="h-5 w-5" />
            My Collections
          </CardTitle>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <Plus className="h-4 w-4" />
                New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Collection</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Collection Name</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Favorites, Bedtime, Travel"
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Choose Icon</label>
                  <div className="grid grid-cols-4 gap-2">
                    {COLLECTION_ICONS.map((item) => (
                      <Button
                        key={item.id}
                        variant={selectedIcon === item.id ? "default" : "outline"}
                        size="sm"
                        className="flex flex-col h-auto py-2 gap-1"
                        onClick={() => setSelectedIcon(item.id)}
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="text-xs">{item.label}</span>
                      </Button>
                    ))}
                  </div>
                </div>
                <Button onClick={handleCreate} className="w-full" disabled={!newName.trim()}>
                  Create Collection
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {collections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Folder className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No collections yet</p>
            <p className="text-xs mt-1">Create collections to organize your audiobooks</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {collections.map((collection) => {
              const IconComponent = getIconComponent(collection.icon);
              const collectionBooks = getCollectionBooks(collection);
              return (
                <div
                  key={collection.id}
                  className="group bg-secondary/50 hover:bg-secondary rounded-lg p-4 cursor-pointer transition-colors relative"
                  onClick={() => onSelectCollection?.(collection)}
                >
                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 rounded-lg p-2">
                      <IconComponent className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{collection.name}</h4>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <BookOpen className="h-3 w-3" />
                        {collectionBooks.length} {collectionBooks.length === 1 ? "book" : "books"}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(collection.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {collectionBooks.length > 0 && (
                    <div className="flex -space-x-2 mt-3">
                      {collectionBooks.slice(0, 4).map((book) => (
                        book.coverImage ? (
                          <img
                            key={book.id}
                            src={book.coverImage}
                            alt={book.title}
                            className="h-10 w-7 object-cover rounded border-2 border-background"
                          />
                        ) : (
                          <div
                            key={book.id}
                            className="h-10 w-7 bg-muted rounded border-2 border-background flex items-center justify-center"
                          >
                            <BookOpen className="h-3 w-3" />
                          </div>
                        )
                      ))}
                      {collectionBooks.length > 4 && (
                        <div className="h-10 w-7 bg-muted rounded border-2 border-background flex items-center justify-center text-xs font-medium">
                          +{collectionBooks.length - 4}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AddToCollectionButtonProps {
  bookId: string;
}

export function AddToCollectionButton({ bookId }: AddToCollectionButtonProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCollections(localStorageService.getCollections());
    }
  }, [isOpen]);

  const handleToggle = (collectionId: string) => {
    const collection = collections.find(c => c.id === collectionId);
    if (!collection) return;

    if (collection.bookIds.includes(bookId)) {
      localStorageService.removeBookFromCollection(collectionId, bookId);
    } else {
      localStorageService.addBookToCollection(collectionId, bookId);
    }
    setCollections(localStorageService.getCollections());
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Plus className="h-4 w-4" />
          Add to Collection
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {collections.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            No collections yet
          </div>
        ) : (
          collections.map((collection) => {
            const IconComponent = getIconComponent(collection.icon);
            const isInCollection = collection.bookIds.includes(bookId);
            return (
              <DropdownMenuItem
                key={collection.id}
                onClick={() => handleToggle(collection.id)}
              >
                <IconComponent className="h-4 w-4 mr-2" />
                {collection.name}
                {isInCollection && <span className="ml-auto text-primary">✓</span>}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
