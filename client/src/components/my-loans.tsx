import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/use-subscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  LibraryBig, BookOpen, Download, RotateCcw, Clock,
  Loader2, X, CalendarDays, Hash, LogIn,
} from "lucide-react";

interface Loan {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookCover: string | null;
  loanedAt: string;
  expiresAt: string;
  status: string;
  downloadCount: number;
  maxDownloads: number;
}

interface LoanLimits {
  maxLoans: number;
  expiryDays: number;
  maxDownloads: number;
  tier: string;
}

interface ActiveLoansData {
  loans: Loan[];
  limits: LoanLimits;
}

interface WaitlistEntry {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookCover: string | null;
  position: number;
  joinedAt: string;
}

interface MyLoansProps {
  onSelectBook: (book: any) => void;
}

function formatTimeRemaining(expiresAt: string): string {
  const now = new Date();
  const exp = new Date(expiresAt);
  const diff = exp.getTime() - now.getTime();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h remaining`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m remaining`;
}

function getTimeElapsedPercent(loanedAt: string, expiresAt: string): number {
  const start = new Date(loanedAt).getTime();
  const end = new Date(expiresAt).getTime();
  const now = Date.now();
  if (now >= end) return 100;
  if (now <= start) return 0;
  return Math.round(((now - start) / (end - start)) * 100);
}

function statusColor(status: string): string {
  if (status === "active") return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
  if (status === "expired") return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
  return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
}

function BookCover({ src, alt, size = "sm" }: { src: string | null; alt: string; size?: "sm" | "md" }) {
  const cls = size === "md" ? "w-14 h-20" : "w-10 h-14";
  if (src) return <img src={src} alt={alt} className={`${cls} object-cover rounded shadow flex-shrink-0`} />;
  return (
    <div className={`${cls} bg-muted rounded flex items-center justify-center flex-shrink-0`}>
      <BookOpen className={size === "md" ? "h-6 w-6 text-muted-foreground" : "h-4 w-4 text-muted-foreground"} />
    </div>
  );
}

export function MyLoans({ onSelectBook }: MyLoansProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { tier } = useSubscription();
  const [activeTab, setActiveTab] = useState("active");

  const { data: activeData, isLoading: activeLoading } = useQuery<ActiveLoansData>({
    queryKey: ["/api/loans/active"],
    enabled: !!user,
  });
  const { data: history, isLoading: historyLoading } = useQuery<Loan[]>({
    queryKey: ["/api/loans/history"],
    enabled: !!user && activeTab === "history",
  });
  const { data: waitlist, isLoading: waitlistLoading } = useQuery<WaitlistEntry[]>({
    queryKey: ["/api/loans/waitlist"],
    enabled: !!user && activeTab === "waitlist",
  });

  const returnMutation = useMutation({
    mutationFn: async (loanId: string) => {
      const res = await apiRequest("POST", `/api/loans/return/${loanId}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Book returned!", description: `+${data.xpAwarded || 25} XP earned` });
      queryClient.invalidateQueries({ queryKey: ["/api/loans/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loans/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loans/waitlist"] });
    },
    onError: () => {
      toast({ title: "Return failed", description: "Could not return the book.", variant: "destructive" });
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async (loanId: string) => {
      const res = await apiRequest("GET", `/api/loans/download/${loanId}`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.downloadUrl) window.open(data.downloadUrl, "_blank");
      toast({ title: "Download started", description: `${data.downloadsRemaining} downloads remaining` });
      queryClient.invalidateQueries({ queryKey: ["/api/loans/active"] });
    },
    onError: () => {
      toast({ title: "Download failed", description: "Could not start download.", variant: "destructive" });
    },
  });

  const cancelWaitlistMutation = useMutation({
    mutationFn: async (bookId: string) => {
      const res = await apiRequest("DELETE", `/api/loans/waitlist/${bookId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Removed from waitlist" });
      queryClient.invalidateQueries({ queryKey: ["/api/loans/waitlist"] });
    },
    onError: () => {
      toast({ title: "Failed to remove", variant: "destructive" });
    },
  });

  if (!user) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <LogIn className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Sign in Required</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Please log in to use the library loan system. Borrow books, download them, and earn XP!
          </p>
        </CardContent>
      </Card>
    );
  }

  if (activeLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const loans = activeData?.loans ?? [];
  const limits = activeData?.limits ?? { maxLoans: 0, expiryDays: 14, maxDownloads: 3, tier: "free" };
  const activeLoans = loans.filter((l) => l.status === "active");
  const totalDownloads = loans.reduce((sum, l) => sum + l.downloadCount, 0);
  const totalMaxDownloads = loans.reduce((sum, l) => sum + l.maxDownloads, 0);
  const nextExpiry = activeLoans.map((l) => l.expiresAt).sort().find((e) => new Date(e).getTime() > Date.now());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <LibraryBig className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">My Loans</h1>
          <p className="text-sm text-muted-foreground">Borrow books, download, and return early for XP</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <BookOpen className="h-4 w-4" /> Active Loans
            </div>
            <p className="text-2xl font-bold">
              {activeLoans.length}<span className="text-sm font-normal text-muted-foreground">/{limits.maxLoans}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-4 w-4" /> Next Expiry
            </div>
            <p className="text-lg font-semibold">{nextExpiry ? formatTimeRemaining(nextExpiry) : "No active loans"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Download className="h-4 w-4" /> Downloads Used
            </div>
            <p className="text-2xl font-bold">
              {totalDownloads}<span className="text-sm font-normal text-muted-foreground">/{totalMaxDownloads || 0}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="active">Active Loans</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="waitlist">Waitlist</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {loans.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">No Active Loans</h3>
                <p className="text-sm text-muted-foreground">Browse the library to borrow your first book!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {loans.map((loan) => (
                <Card key={loan.id} className="overflow-hidden">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex gap-3">
                      <BookCover src={loan.bookCover} alt={loan.bookTitle} size="md" />
                      <div className="min-w-0 flex-1">
                        <button
                          className="text-sm font-semibold truncate block text-left hover:text-primary transition-colors w-full"
                          onClick={() => onSelectBook({ id: loan.bookId, title: loan.bookTitle, author: loan.bookAuthor, coverImage: loan.bookCover })}
                          aria-label={`View ${loan.bookTitle}`}
                        >
                          {loan.bookTitle}
                        </button>
                        <p className="text-xs text-muted-foreground truncate">{loan.bookAuthor}</p>
                        <Badge className={`mt-1 text-xs border ${statusColor(loan.status)}`} variant="outline">
                          {loan.status}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimeRemaining(loan.expiresAt)}
                        </span>
                      </div>
                      <Progress value={getTimeElapsedPercent(loan.loanedAt, loan.expiresAt)} className="h-1.5" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline" size="sm" className="flex-1"
                        onClick={() => downloadMutation.mutate(loan.id)}
                        disabled={downloadMutation.isPending || loan.downloadCount >= loan.maxDownloads || loan.status !== "active"}
                        aria-label={`Download ${loan.bookTitle}`}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        {loan.downloadCount}/{loan.maxDownloads}
                      </Button>
                      <Button
                        variant="secondary" size="sm" className="flex-1"
                        onClick={() => returnMutation.mutate(loan.id)}
                        disabled={returnMutation.isPending || loan.status !== "active"}
                        aria-label={`Return ${loan.bookTitle}`}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Return
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {historyLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !history || history.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">No Loan History</h3>
                <p className="text-sm text-muted-foreground">Your past loans will appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {history.map((loan) => (
                <Card key={loan.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center gap-4">
                      <BookCover src={loan.bookCover} alt={loan.bookTitle} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{loan.bookTitle}</p>
                        <p className="text-xs text-muted-foreground truncate">{loan.bookAuthor}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(loan.loanedAt).toLocaleDateString()} — {new Date(loan.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge className={`text-xs border ${statusColor(loan.status)}`} variant="outline">
                        {loan.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="waitlist" className="mt-4">
          {waitlistLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !waitlist || waitlist.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Hash className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">No Waitlist Entries</h3>
                <p className="text-sm text-muted-foreground">When all copies are loaned out, you can join the waitlist.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {waitlist.map((entry) => (
                <Card key={entry.bookId}>
                  <CardContent className="py-3">
                    <div className="flex items-center gap-4">
                      <BookCover src={entry.bookCover} alt={entry.bookTitle} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{entry.bookTitle}</p>
                        <p className="text-xs text-muted-foreground truncate">{entry.bookAuthor}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Hash className="h-3 w-3" /> Position {entry.position}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Joined {new Date(entry.joinedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                        onClick={() => cancelWaitlistMutation.mutate(entry.bookId)}
                        disabled={cancelWaitlistMutation.isPending}
                        aria-label={`Remove ${entry.bookTitle} from waitlist`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
