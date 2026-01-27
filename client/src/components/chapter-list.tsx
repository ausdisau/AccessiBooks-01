import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, ListMusic } from "lucide-react";
import { useAudioContext } from "@/contexts/AudioContext";

interface ChapterListProps {
  bookId: string;
  onChapterSelect: (chapter: { id: string; title: string; audioUrl?: string }, index: number) => void;
}

export function ChapterList({ bookId, onChapterSelect }: ChapterListProps) {
  const { chapters, currentChapterIndex, formatTime } = useAudioContext();

  if (chapters.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListMusic className="h-5 w-5" />
          Chapters ({chapters.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          <div className="space-y-1 pr-4">
            {chapters.map((chapter, index) => {
              const isCurrentChapter = index === currentChapterIndex;
              const durationStr = chapter.duration 
                ? formatTime(chapter.duration) 
                : (chapter.startTime !== null && chapter.endTime !== null)
                  ? formatTime((chapter.endTime ?? 0) - (chapter.startTime ?? 0))
                  : "";
              
              return (
                <Button
                  key={chapter.id}
                  variant={isCurrentChapter ? "secondary" : "ghost"}
                  className="w-full justify-start h-auto py-3 px-3"
                  onClick={() => onChapterSelect({ id: chapter.id, title: chapter.title }, index)}
                  data-testid={`chapter-${index}`}
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      {isCurrentChapter ? (
                        <Play className="h-4 w-4 text-primary fill-primary" />
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground">
                          {chapter.chapterNumber}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className={`text-sm truncate ${isCurrentChapter ? "font-medium" : ""}`}>
                        {chapter.title}
                      </p>
                      {durationStr && (
                        <p className="text-xs text-muted-foreground">
                          {durationStr}
                        </p>
                      )}
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
