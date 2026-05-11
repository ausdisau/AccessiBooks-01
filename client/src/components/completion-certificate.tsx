import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Book, Star, Download, Share2, BookOpen, Trophy, X, ChevronRight, Clock } from "lucide-react";

export interface CompletionData {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookCover: string | null;
  contentType: "ebook" | "audiobook";
}

interface CompletionRecord {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  bookCover: string | null;
  completedAt: string;
}

interface NextReadBook {
  id: string;
  title: string;
  author: string;
  coverImage: string | null;
  genre: string | null;
  contentType: string;
}

const CONFETTI_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6", "#f97316"];

function Confetti() {
  const particles = Array.from({ length: 30 }, (_, i) => i);
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {particles.map((i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const duration = 2 + Math.random() * 2;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const size = 6 + Math.random() * 8;
        const rotate = Math.random() * 360;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: "-10px",
              width: `${size}px`,
              height: `${size}px`,
              backgroundColor: color,
              borderRadius: i % 3 === 0 ? "50%" : i % 3 === 1 ? "0" : "2px",
              animation: `confettiFall ${duration}s ease-in ${delay}s forwards`,
              transform: `rotate(${rotate}deg)`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

interface CertificateProps {
  userName: string;
  bookTitle: string;
  bookAuthor: string;
  completedAt: string;
  bookCover: string | null;
  contentType: "ebook" | "audiobook";
}

function CertificateCard({ userName, bookTitle, bookAuthor, completedAt, bookCover, contentType }: CertificateProps) {
  const dateStr = new Date(completedAt).toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div
      id="completion-certificate"
      className="relative bg-card rounded-2xl overflow-hidden border-4 border-primary/20"
    >
      <div className="relative p-8 text-center space-y-4">
        <div className="flex justify-center gap-1 mb-2">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="h-5 w-5 fill-primary text-primary" />
          ))}
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">
            Certificate of Completion
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">AccessiBooks</p>
        </div>

        <div className="flex items-center justify-center gap-3">
          {bookCover ? (
            <img
              src={bookCover}
              alt=""
              className="w-24 h-32 object-cover rounded-lg shadow-xl"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-24 h-32 bg-primary/10 rounded-lg shadow-md flex items-center justify-center">
              {contentType === "audiobook" ? (
                <Book className="h-10 w-10 text-primary" />
              ) : (
                <BookOpen className="h-10 w-10 text-primary" />
              )}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm text-muted-foreground">This is to certify that</p>
          <p className="text-2xl font-bold text-foreground mt-1 leading-tight">{userName}</p>
          <p className="text-sm text-muted-foreground mt-1">has successfully completed</p>
          <h3 className="text-2xl font-serif font-bold text-primary mt-2 leading-tight">{bookTitle}</h3>
          <p className="text-sm text-muted-foreground italic mt-0.5">by {bookAuthor}</p>
        </div>

        <div className="flex items-center justify-center gap-2 pt-2">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <Trophy className="h-5 w-5 text-primary" />
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        </div>

        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Completed {dateStr}</span>
        </div>

        <Badge
          variant="secondary"
          className="text-xs bg-primary/20 text-primary border border-primary/30 font-bold"
        >
          🏅 Book Finisher
        </Badge>
      </div>
    </div>
  );
}

function downloadCertificateAsPng(
  userName: string,
  bookTitle: string,
  bookAuthor: string,
  completedAt: string,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 420;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 600, 420);
  grad.addColorStop(0, "#fefce8");
  grad.addColorStop(1, "#fef9c3");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 420);

  const borderGrad = ctx.createLinearGradient(0, 0, 600, 420);
  borderGrad.addColorStop(0, "#f59e0b");
  borderGrad.addColorStop(0.33, "#10b981");
  borderGrad.addColorStop(0.66, "#3b82f6");
  borderGrad.addColorStop(1, "#ec4899");
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 590, 410);

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#f59e0b";
  ctx.strokeRect(18, 18, 564, 384);

  ctx.textAlign = "center";

  ctx.font = "bold 13px serif";
  ctx.fillStyle = "#92400e";
  ctx.letterSpacing = "4px";
  ctx.fillText("CERTIFICATE OF COMPLETION", 300, 70);
  ctx.letterSpacing = "0px";

  ctx.font = "11px sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.fillText("AccessiBooks", 300, 90);

  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.fillText("This is to certify that", 300, 150);

  ctx.font = "bold 28px serif";
  ctx.fillStyle = "#111827";
  ctx.fillText(userName, 300, 190);

  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.fillText("has successfully completed", 300, 225);

  ctx.font = "bold 20px serif";
  ctx.fillStyle = "#2563eb";
  const maxWidth = 500;
  const words = bookTitle.split(" ");
  let line = "";
  let y = 262;
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line.trim(), 300, y);
      line = word + " ";
      y += 28;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), 300, y);
  y += 22;

  ctx.font = "italic 13px sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.fillText("by " + bookAuthor, 300, y + 6);

  const dateStr = new Date(completedAt).toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric",
  });
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#9ca3af";
  ctx.fillText("Completed " + dateStr, 300, 390);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `certificate-${bookTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

interface CompletionModalProps {
  data: CompletionData | null;
  onClose: () => void;
  onSelectBook?: (bookId: string) => void;
}

export function CompletionModal({ data, onClose, onSelectBook }: CompletionModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showConfetti, setShowConfetti] = useState(false);
  const completedAt = useRef(new Date().toISOString());

  const userName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Reader"
    : "Reader";

  const recordMutation = useMutation({
    mutationFn: async () => {
      if (!user || !data) return;
      const res = await apiRequest("POST", "/api/completions", {
        bookId: data.bookId,
        bookTitle: data.bookTitle,
        bookAuthor: data.bookAuthor,
        bookCover: data.bookCover,
      });
      if (!res.ok) throw new Error("Failed to record");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/completions"] });
    },
  });

  const { data: nextRead } = useQuery<NextReadBook | null>({
    queryKey: ["/api/completions/next-read", data?.bookId],
    queryFn: async () => {
      if (!data?.bookId) return null;
      const res = await fetch(`/api/completions/next-read/${data.bookId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!data,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data) {
      completedAt.current = new Date().toISOString();
      setShowConfetti(true);
      recordMutation.mutate();
      const timer = setTimeout(() => setShowConfetti(false), 4500);
      return () => clearTimeout(timer);
    }
  }, [data?.bookId]);

  const handleShare = useCallback(async () => {
    if (!data) return;
    const text = `I just finished reading "${data.bookTitle}" by ${data.bookAuthor} on AccessiBooks! 📚🏅`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Book Completed!", text });
      } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard!" });
    }
  }, [data, toast]);

  const handleDownload = useCallback(() => {
    if (!data) return;
    downloadCertificateAsPng(userName, data.bookTitle, data.bookAuthor, completedAt.current);
  }, [data, userName]);

  if (!data) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Book completion celebration"
    >
      {showConfetti && <Confetti />}

      <div className="relative bg-card rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 space-y-5">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">🎉 You did it!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Congratulations on finishing this {data.contentType === "audiobook" ? "audiobook" : "book"}!
            </p>
          </div>

          <CertificateCard
            userName={userName}
            bookTitle={data.bookTitle}
            bookAuthor={data.bookAuthor}
            completedAt={completedAt.current}
            bookCover={data.bookCover}
            contentType={data.contentType}
          />

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={handleDownload}
              aria-label="Download certificate as PNG"
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={handleShare}
              aria-label="Share completion"
            >
              <Share2 className="h-4 w-4" />
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => {
                onClose();
                navigate("/");
              }}
              aria-label="Return to library"
            >
              Keep Reading
            </Button>
          </div>

          {nextRead && (
            <div className="border border-border rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Read This Next
              </p>
              <button
                className="flex items-center gap-3 w-full text-left group hover:opacity-80 transition-opacity"
                onClick={() => {
                  if (onSelectBook) onSelectBook(nextRead.id);
                  onClose();
                }}
                aria-label={`Open ${nextRead.title} by ${nextRead.author}`}
              >
                {nextRead.coverImage ? (
                  <img
                    src={nextRead.coverImage}
                    alt=""
                    className="w-12 h-16 object-cover rounded-md shadow-sm shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-12 h-16 bg-gradient-to-br from-purple-400 to-blue-500 rounded-md flex items-center justify-center shrink-0">
                    <Book className="h-5 w-5 text-white" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-sm leading-snug text-foreground line-clamp-2">
                    {nextRead.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{nextRead.author}</p>
                  {nextRead.genre && (
                    <Badge variant="secondary" className="text-[10px] mt-1 px-1.5 py-0">
                      {nextRead.genre}
                    </Badge>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 ml-auto group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function AchievementsPage() {
  const { user } = useAuth();

  const { data: completions, isLoading } = useQuery<CompletionRecord[]>({
    queryKey: ["/api/completions"],
    queryFn: async () => {
      const res = await fetch("/api/completions", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="text-center py-20">
        <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-semibold">Sign in to see your achievements</p>
        <p className="text-sm text-muted-foreground mt-1">Your certificates are saved when you're logged in</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!completions || completions.length === 0) {
    return (
      <div className="text-center py-20">
        <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-semibold">No achievements yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Finish your first book to earn a certificate!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">My Achievements</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {completions.length} book{completions.length !== 1 ? "s" : ""} completed
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4" data-testid="achievements-grid">
        {completions.map((c) => (
          <div
            key={c.id}
            className="group relative bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-shadow"
            data-testid="achievement-tile"
          >
            <div className="aspect-[3/4] bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 relative">
              {c.bookCover ? (
                <img
                  src={c.bookCover}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpen className="h-8 w-8 text-amber-400" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-2 left-2 right-2">
                <div className="flex gap-0.5 mb-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-white text-[10px] font-medium line-clamp-2 leading-tight">
                  {c.bookTitle}
                </p>
              </div>
              <div className="absolute top-2 right-2">
                <Trophy className="h-5 w-5 text-amber-400 drop-shadow" />
              </div>
            </div>
            <div className="p-2">
              <p className="text-[10px] text-muted-foreground">
                {new Date(c.completedAt).toLocaleDateString("en-AU", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
