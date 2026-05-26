import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { wordBankService, WordBankEntry } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Volume2, BookOpen, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link } from "@/lib/wouter-compat";

interface ApiWordEntry {
  id: string;
  word: string;
  definition: string | null;
  imageUrl: string | null;
  savedAt: string;
}

function normalizeEntry(raw: ApiWordEntry | WordBankEntry): ApiWordEntry {
  return {
    id: raw.id,
    word: raw.word,
    definition: raw.definition ?? null,
    imageUrl: raw.imageUrl ?? null,
    savedAt: raw.savedAt,
  };
}

function WordCard({
  entry,
  onDelete,
}: {
  entry: ApiWordEntry;
  onDelete: (id: string) => void;
}) {
  const { toast } = useToast();

  const handleSpeak = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(entry.word);
      utt.rate = 0.85;
      window.speechSynthesis.speak(utt);
    }
  };

  const handleDelete = () => {
    onDelete(entry.id);
    toast({ title: `"${entry.word}" removed from Word Bank` });
  };

  const formattedDate = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(entry.savedAt));

  return (
    <Card className="group hover:border-primary/40 transition-colors" data-testid="word-bank-card">
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-lg font-bold capitalize text-foreground leading-tight">{entry.word}</span>
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
            onClick={handleDelete}
            aria-label={`Remove "${entry.word}" from Word Bank`}
            data-testid="btn-delete-word"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {entry.imageUrl ? (
          <div className="flex justify-center">
            <img
              src={entry.imageUrl}
              alt={`Symbol for ${entry.word}`}
              className="w-20 h-20 object-contain rounded-lg border border-border bg-muted/30"
              onError={e => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-lg border border-border bg-muted/30 flex items-center justify-center">
              <BookOpen className="h-8 w-8 text-muted-foreground/40" />
            </div>
          </div>
        )}

        {entry.definition ? (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {entry.definition}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">No definition saved</p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[10px] text-muted-foreground/60">{formattedDate}</span>
          <button
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            onClick={handleSpeak}
            aria-label={`Hear the word: ${entry.word}`}
            data-testid="btn-hear-word"
          >
            <Volume2 className="h-3.5 w-3.5" />
            Hear it
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export function WordBankPage() {
  const { user } = useAuth();
  const isLoggedIn = !!user;
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  const apiQuery = useQuery<ApiWordEntry[]>({
    queryKey: ["/api/word-bank"],
    enabled: isLoggedIn,
    retry: false,
  });

  const localEntries: ApiWordEntry[] = !isLoggedIn
    ? wordBankService.getAll().map(normalizeEntry)
    : [];

  const entries: ApiWordEntry[] = isLoggedIn
    ? (apiQuery.data ?? []).map(normalizeEntry)
    : localEntries;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isLoggedIn) {
        await apiRequest("DELETE", `/api/word-bank/${id}`);
      } else {
        wordBankService.remove(id);
      }
    },
    onSuccess: () => {
      if (isLoggedIn) {
        queryClient.invalidateQueries({ queryKey: ["/api/word-bank"] });
      }
    },
    onError: () => {
      toast({ title: "Failed to remove word", variant: "destructive" });
    },
  });

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const filtered = searchQuery.trim()
    ? entries.filter(e => e.word.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : entries;

  const isLoading = isLoggedIn && apiQuery.isLoading;

  return (
    <div className="space-y-6" data-testid="word-bank-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            My Word Bank
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Words you've saved while reading — tap any word in a book to add it here.
          </p>
        </div>
        {entries.length > 0 && (
          <Badge variant="secondary" className="text-sm px-3 py-1 shrink-0">
            {entries.length} {entries.length === 1 ? "word" : "words"}
          </Badge>
        )}
      </div>

      {entries.length > 4 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search your words…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
            aria-label="Search word bank"
            data-testid="word-bank-search"
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <BookOpen className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <div>
            <p className="font-semibold text-foreground">No words saved yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              While reading a book, tap any word to open the vocabulary popup, then tap "Save to Word Bank."
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm">
              Browse Books
            </Button>
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
          <p className="text-muted-foreground">No words match "{searchQuery}"</p>
          <button
            className="text-sm text-primary hover:underline"
            onClick={() => setSearchQuery("")}
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map(entry => (
            <WordCard key={entry.id} entry={entry} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

export default WordBankPage;
