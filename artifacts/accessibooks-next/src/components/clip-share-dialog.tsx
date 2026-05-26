import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Scissors, Copy } from "lucide-react";

interface ClipShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  bookTitle: string;
  /** Current playback time (seconds) — used as the default clip end. */
  currentTime: number;
}

const MIN_LEN = 15;
const MAX_LEN = 60;

function clampClipBounds(start: number, end: number): { start: number; end: number } {
  let s = Math.max(0, Math.floor(start));
  let e = Math.max(s + MIN_LEN, Math.floor(end));
  if (e - s > MAX_LEN) e = s + MAX_LEN;
  if (e - s < MIN_LEN) s = Math.max(0, e - MIN_LEN);
  return { start: s, end: e };
}

export function ClipShareDialog({ open, onOpenChange, bookId, bookTitle, currentTime }: ClipShareDialogProps) {
  const { toast } = useToast();
  const initEnd = Math.max(MIN_LEN, Math.floor(currentTime));
  const initStart = Math.max(0, initEnd - 30);
  const [startSec, setStartSec] = useState(initStart);
  const [endSec, setEndSec] = useState(initEnd);
  const [quote, setQuote] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const e = Math.max(MIN_LEN, Math.floor(currentTime));
      setStartSec(Math.max(0, e - 30));
      setEndSec(e);
      setQuote("");
      setShareUrl(null);
    }
  }, [open, currentTime]);

  const create = useMutation({
    mutationFn: async () => {
      const { start, end } = clampClipBounds(startSec, endSec);
      const r = await apiRequest("POST", "/api/share/clip", {
        bookId,
        bookTitle,
        startSec: start,
        endSec: end,
        quote: quote.trim() || null,
      });
      return r.json() as Promise<{ shareUrl: string }>;
    },
    onSuccess: (data) => {
      setShareUrl(data.shareUrl);
      toast({ title: "Clip ready to share" });
    },
    onError: (err: Error) => toast({ title: "Could not create clip", description: err.message, variant: "destructive" }),
  });

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied", duration: 2000 });
    } catch {
      toast({ title: "Copy failed — select the link to copy.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-clip-share">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-primary" aria-hidden="true" /> Share a clip ({MIN_LEN}–{MAX_LEN}s)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="clip-start">Start (sec)</Label>
              <Input
                id="clip-start"
                type="number"
                min={0}
                value={startSec}
                onChange={(e) => setStartSec(Number(e.target.value))}
                data-testid="input-clip-start"
              />
            </div>
            <div>
              <Label htmlFor="clip-end">End (sec)</Label>
              <Input
                id="clip-end"
                type="number"
                min={MIN_LEN}
                value={endSec}
                onChange={(e) => setEndSec(Number(e.target.value))}
                data-testid="input-clip-end"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Length: {Math.max(0, endSec - startSec)}s (auto-clamped to {MIN_LEN}–{MAX_LEN}s on save).
          </p>
          <div>
            <Label htmlFor="clip-quote">Quote (optional)</Label>
            <Textarea
              id="clip-quote"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              maxLength={280}
              placeholder="Pull a memorable line from this moment…"
              data-testid="input-clip-quote"
            />
          </div>
          {shareUrl && (
            <div className="rounded-md bg-muted p-2 flex items-center gap-2" data-testid="clip-result">
              <code className="flex-1 text-xs break-all">{shareUrl}</code>
              <Button size="sm" variant="ghost" onClick={copy} aria-label="Copy share URL" data-testid="btn-copy-clip">
                <Copy className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="btn-clip-close">
            Close
          </Button>
          {!shareUrl && (
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || endSec - startSec < MIN_LEN}
              data-testid="btn-clip-create"
            >
              {create.isPending ? "Creating…" : "Create share link"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
