import { Bookmark } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bookmark as BookmarkIcon, Trash2 } from "lucide-react";

interface BookmarkListProps {
  bookmarks: Bookmark[];
  onJumpTo: (time: number) => void;
  onRemove: (bookmarkId: string) => void;
  formatTime: (seconds: number) => string;
}

export function BookmarkList({ bookmarks, onJumpTo, onRemove, formatTime }: BookmarkListProps) {
  if (bookmarks.length === 0) {
    return (
      <Card data-testid="bookmark-list">
        <CardHeader>
          <CardTitle className="flex items-center">
            <BookmarkIcon className="h-5 w-5 mr-2" aria-hidden="true" />
            Bookmarks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground text-sm" data-testid="text-no-bookmarks">
            No bookmarks yet. Click the "Bookmark" button to save your current position.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="bookmark-list">
      <CardHeader>
        <CardTitle className="flex items-center">
          <BookmarkIcon className="h-5 w-5 mr-2" aria-hidden="true" />
          Bookmarks
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3" role="list" aria-label="Bookmarks">
          {bookmarks.map((bookmark) => (
            <div
              key={bookmark.id}
              className="flex items-center justify-between p-3 bg-muted rounded-md"
              role="listitem"
              data-testid={`bookmark-item-${bookmark.id}`}
            >
              <div>
                <span className="font-medium" data-testid={`text-bookmark-name-${bookmark.id}`}>
                  {bookmark.name}
                </span>
                <span className="text-sm text-muted-foreground ml-3" data-testid={`text-bookmark-time-${bookmark.id}`}>
                  {formatTime(bookmark.time)}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  onClick={() => onJumpTo(bookmark.time)}
                  aria-label={`Jump to bookmark at ${formatTime(bookmark.time)}`}
                  data-testid={`button-jump-${bookmark.id}`}
                >
                  Jump to
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onRemove(bookmark.id)}
                  aria-label={`Delete bookmark ${bookmark.name}`}
                  data-testid={`button-delete-${bookmark.id}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
