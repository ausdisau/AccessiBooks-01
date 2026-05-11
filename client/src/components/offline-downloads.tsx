import { useOfflineDownloads } from "@/hooks/use-offline-downloads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, Trash2, CloudOff, HardDrive, Play, Crown } from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function OfflineDownloads() {
  const {
    isPremium,
    downloads,
    removeDownload,
    progressMap,
    storageUsed,
    storageEstimate,
    markPlayed,
  } = useOfflineDownloads();

  const storagePercent = storageEstimate > 0 ? Math.round((storageUsed / storageEstimate) * 100) : 0;
  const isStorageLow = storagePercent > 80;

  if (!isPremium) {
    return (
      <Card className="border-2 border-dashed border-muted-foreground/30 dark:border-muted-foreground/20">
        <CardContent className="py-12 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Crown className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Premium Feature</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Offline downloads are available exclusively for Premium subscribers.
            Upgrade to download audiobooks for offline listening.
          </p>
        </CardContent>
      </Card>
    );
  }

  const activeDownloads = Object.values(progressMap).filter(
    (p) => p.status === "queued" || p.status === "downloading"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Downloads</h2>
          <p className="text-sm text-muted-foreground">
            Manage your offline audiobooks
          </p>
        </div>
      </div>

      <Card className="bg-muted/50 dark:bg-muted/30">
        <CardContent className="py-4">
          <div className="flex items-center gap-3 mb-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Storage Usage</span>
            <span className="text-sm text-muted-foreground ml-auto">
              {formatBytes(storageUsed)}
              {storageEstimate > 0 && ` / ${formatBytes(storageEstimate)}`}
            </span>
          </div>
          <Progress value={storagePercent} className="h-2" />
          {isStorageLow && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
              <CloudOff className="h-3 w-3" />
              Storage is getting low. Consider removing some downloads.
            </p>
          )}
        </CardContent>
      </Card>

      {activeDownloads.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            In Progress
          </h3>
          {activeDownloads.map((dl) => (
            <Card key={dl.bookId} className="bg-card dark:bg-card">
              <CardContent className="py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    Book #{dl.bookId}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dl.status === "queued" ? "Queued" : `${dl.progress}%`}
                  </span>
                </div>
                <Progress value={dl.progress} className="h-1.5" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {Object.values(progressMap).some((p) => p.status === "error") && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">
            Failed
          </h3>
          {Object.values(progressMap)
            .filter((p) => p.status === "error")
            .map((dl) => (
              <Card key={dl.bookId} className="border-red-200 dark:border-red-800">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Book #{dl.bookId}</span>
                    <span className="text-xs text-red-600 dark:text-red-400">
                      {dl.error || "Download failed"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {downloads.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Downloaded ({downloads.length})
          </h3>
          {downloads.map((book) => (
            <Card key={book.bookId} className="bg-card dark:bg-card">
              <CardContent className="py-3">
                <div className="flex items-center gap-4">
                  {book.coverImage ? (
                    <img
                      src={book.coverImage}
                      alt={book.title}
                      className="w-12 h-12 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <Download className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{book.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {book.author}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(book.sizeBytes)} • Saved {new Date(book.downloadedAt).toLocaleDateString()}
                      {book.lastPlayedAt
                        ? ` • Last played ${new Date(book.lastPlayedAt).toLocaleDateString()}`
                        : " • Not yet played"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      aria-label={`Play ${book.title}`}
                      data-testid={`offline-play-${book.bookId}`}
                      onClick={() => {
                        // Stamp lastPlayedAt + start playback. Playback is
                        // delegated to the global audio player by dispatching
                        // a custom event the AudioContext consumer can wire
                        // into; recording the play timestamp is required by
                        // the Storage panel "last played" column.
                        void markPlayed(book.bookId);
                        try {
                          const url = URL.createObjectURL(book.audioBlob);
                          window.dispatchEvent(
                            new CustomEvent("offline:play", {
                              detail: { bookId: book.bookId, url, title: book.title },
                            }),
                          );
                        } catch {
                          // ignore — dispatch is best-effort
                        }
                      }}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => removeDownload(book.bookId)}
                      aria-label={`Remove ${book.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Card className="border-dashed">
            <CardContent className="py-3">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <CloudOff className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <p data-testid="undownloadable-note">
                  <span className="font-medium block">Not available offline</span>
                  Ad-supported free streams, podcasts, and DRM-protected partner
                  catalog titles cannot be saved for offline listening. Borrow a
                  copy via the library loan system to unlock offline playback for
                  those titles.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        activeDownloads.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <CloudOff className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <h3 className="font-medium mb-1">No Downloads Yet</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Download audiobooks from the library to listen offline without an internet connection.
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
