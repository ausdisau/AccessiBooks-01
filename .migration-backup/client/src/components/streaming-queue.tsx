import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useAudioContext } from "@/contexts/audio-context";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/use-subscription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Users, Play, Pause, SkipForward, ArrowLeft, Volume2,
  Loader2, Radio, ThumbsUp, Plus, ListMusic, Music, X, Megaphone, WifiOff,
} from "lucide-react";
import { ConnectionStatus, type ConnectionStatusType } from "@/components/connection-status";
import type { Book, StreamingQueue as StreamingQueueType, StreamingQueueItem } from "@shared/schema";
import { AudioAdOverlay } from "@/components/audio-ad-overlay";
import { audioAdService } from "@/services/audio-ad-service";
import type { AdResponse } from "@/services/audio-ad-service";

interface Sponsorship {
  id: string;
  sponsorName: string;
  sponsorLogo: string;
  adAudioUrl?: string;
}

interface StreamingQueueProps {
  onBack: () => void;
}

export function StreamingQueue({ onBack }: StreamingQueueProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<"browse" | "listening">("browse");
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const handleJoinQueue = (queueId: string) => {
    setActiveQueueId(queueId);
    setMode("listening");
  };

  const handleLeaveQueue = () => {
    setActiveQueueId(null);
    setMode("browse");
  };

  if (mode === "listening" && activeQueueId) {
    return (
      <QueuePlayer
        queueId={activeQueueId}
        onLeave={handleLeaveQueue}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="streaming-queue">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Go back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <ListMusic className="h-6 w-6 text-primary" aria-hidden="true" />
            Live Queues
          </h1>
          <p className="text-muted-foreground text-sm">Community-curated audiobook radio stations</p>
        </div>
        {user && (
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Create Queue
          </Button>
        )}
      </div>

      {showCreate && (
        <CreateQueueForm
          onCreated={(queue) => {
            setShowCreate(false);
            handleJoinQueue(queue.id);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <ActiveQueuesList onJoin={handleJoinQueue} />
    </div>
  );
}

function CreateQueueForm({ onCreated, onCancel }: { onCreated: (q: StreamingQueueType) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/streaming-queue/create", {
        name: name.trim(),
        description: description.trim() || undefined,
        genre: genre.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/streaming-queue/active"] });
      onCreated(data);
    },
  });

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            Create a Live Queue
          </span>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Queue Name</label>
          <Input
            placeholder="e.g., Friday Night Sci-Fi"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Description (optional)</label>
          <Input
            placeholder="What kind of books will be playing?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Genre Focus (optional)</label>
          <Input
            placeholder="e.g., Science Fiction, Mystery"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            maxLength={50}
          />
        </div>
        <Button
          className="w-full"
          onClick={() => createMutation.mutate()}
          disabled={!name.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
          ) : (
            <><Radio className="h-4 w-4 mr-2" /> Go Live</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function ActiveQueuesList({ onJoin }: { onJoin: (id: string) => void }) {
  const { data: queues, isLoading } = useQuery<StreamingQueueType[]>({
    queryKey: ["/api/streaming-queue/active"],
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!queues || queues.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <ListMusic className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-lg font-medium mb-1">No live queues right now</p>
          <p className="text-sm text-muted-foreground">Create one to start a community listening session!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {queues.map((queue) => (
        <Card
          key={queue.id}
          className="hover:border-primary/30 transition-colors cursor-pointer"
          onClick={() => onJoin(queue.id)}
        >
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start gap-3">
              {queue.currentBookCover ? (
                <img src={queue.currentBookCover} alt="" className="w-12 h-16 object-cover rounded shadow" />
              ) : (
                <div className="w-12 h-16 bg-muted rounded flex items-center justify-center">
                  <Music className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{queue.name}</p>
                {queue.genre && (
                  <span className="inline-block px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full mt-1">
                    {queue.genre}
                  </span>
                )}
                {queue.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{queue.description}</p>
                )}
              </div>
            </div>

            {queue.currentBookTitle && (
              <div className="bg-muted/50 rounded-lg p-2">
                <p className="text-xs text-muted-foreground">Now Playing</p>
                <p className="text-sm font-medium truncate">{queue.currentBookTitle}</p>
                {queue.currentBookAuthor && (
                  <p className="text-xs text-muted-foreground truncate">{queue.currentBookAuthor}</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {queue.listenerCount} {queue.listenerCount === 1 ? "listener" : "listeners"}
              </span>
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                LIVE
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function QueuePlayer({ queueId, onLeave, onBack }: { queueId: string; onLeave: () => void; onBack: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isPremium, upgradeToPremium } = useSubscription();
  const { playBook, currentBook, isPlaying, togglePlayPause, currentTime } = useAudioContext();
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>("reconnecting");
  const [listenerCount, setListenerCount] = useState(0);
  const reconnectAttemptsRef = useRef(0);
  const destroyedRef = useRef(false);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [myVotes, setMyVotes] = useState<string[]>([]);
  const [interstitialAd, setInterstitialAd] = useState<AdResponse | null>(null);
  const [showInterstitial, setShowInterstitial] = useState(false);
  const pendingBookRef = useRef<{ id: string; title: string; author: string; audioUrl: string; coverImage?: string } | null>(null);
  const [preRollPlayed, setPreRollPlayed] = useState(false);
  const [playingPreRoll, setPlayingPreRoll] = useState(false);
  const preRollAudioRef = useRef<HTMLAudioElement | null>(null);
  const impressionTrackedRef = useRef<Set<string>>(new Set());

  const { data: sponsorships } = useQuery<Sponsorship[]>({
    queryKey: ["/api/sponsorships/active"],
  });

  const activeSponsor = sponsorships && sponsorships.length > 0 ? sponsorships[0] : null;

  const impressionMutation = useMutation({
    mutationFn: async (sponsorId: string) => {
      await apiRequest("POST", `/api/sponsorships/${sponsorId}/impression`);
    },
  });

  const clickMutation = useMutation({
    mutationFn: async (sponsorId: string) => {
      await apiRequest("POST", `/api/sponsorships/${sponsorId}/click`);
    },
  });

  useEffect(() => {
    if (activeSponsor && !impressionTrackedRef.current.has(activeSponsor.id)) {
      impressionTrackedRef.current.add(activeSponsor.id);
      impressionMutation.mutate(activeSponsor.id);
    }
  }, [activeSponsor?.id]);

  const handleSponsorClick = useCallback(() => {
    if (activeSponsor) {
      clickMutation.mutate(activeSponsor.id);
    }
  }, [activeSponsor]);

  const { data: queue, isLoading: queueLoading } = useQuery<StreamingQueueType>({
    queryKey: ["/api/streaming-queue", queueId],
  });

  const { data: items, refetch: refetchItems } = useQuery<StreamingQueueItem[]>({
    queryKey: ["/api/streaming-queue", queueId, "items"],
  });

  const { data: votedItems } = useQuery<string[]>({
    queryKey: ["/api/streaming-queue", queueId, "my-votes"],
    enabled: !!user,
  });

  useEffect(() => {
    if (votedItems) setMyVotes(votedItems);
  }, [votedItems]);

  const { data: suggestions } = useQuery<Book[]>({
    queryKey: ["/api/streaming-queue", queueId, "suggestions"],
    enabled: !!user,
  });

  useEffect(() => {
    if (queue?.currentBookAudioUrl && queue.currentBookTitle) {
      const bookData = {
        id: queue.currentBookId || "",
        title: queue.currentBookTitle,
        author: queue.currentBookAuthor || "",
        audioUrl: queue.currentBookAudioUrl,
        coverImage: queue.currentBookCover || undefined,
      };

      if (!preRollPlayed && activeSponsor?.adAudioUrl) {
        setPlayingPreRoll(true);
        setPreRollPlayed(true);
        const audio = new Audio(activeSponsor.adAudioUrl);
        preRollAudioRef.current = audio;
        audio.onended = () => {
          setPlayingPreRoll(false);
          preRollAudioRef.current = null;
          playBook(bookData as any);
        };
        audio.onerror = () => {
          setPlayingPreRoll(false);
          preRollAudioRef.current = null;
          playBook(bookData as any);
        };
        audio.play().catch(() => {
          setPlayingPreRoll(false);
          preRollAudioRef.current = null;
          playBook(bookData as any);
        });
      } else {
        playBook(bookData as any);
      }
    }
  }, [queue?.currentBookId]);

  useEffect(() => {
    return () => {
      if (preRollAudioRef.current) {
        preRollAudioRef.current.pause();
        preRollAudioRef.current = null;
      }
    };
  }, []);

  const { isOffline } = useAudioContext();

  const connectWS = useCallback(() => {
    if (destroyedRef.current || !user || !queueId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/streaming-queue`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      if (destroyedRef.current) { socket.close(); return; }
      reconnectAttemptsRef.current = 0;
      setConnectionStatus("connected");
      socket.send(JSON.stringify({ type: "join_queue", queueId }));
      socket.send(JSON.stringify({ type: "queue_sync_request" }));
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "queue_state":
            setListenerCount(msg.listenerCount || 0);
            break;
          case "listener_joined":
          case "listener_left":
            setListenerCount(msg.listenerCount || 0);
            break;
          case "book_changed":
            if (msg.book?.audioUrl) {
              const nextBook = {
                id: msg.book.id || "",
                title: msg.book.title,
                author: msg.book.author || "",
                audioUrl: msg.book.audioUrl,
                coverImage: msg.book.coverImage || undefined,
              };
              if (!isPremium && audioAdService.shouldShowMidRoll(false)) {
                pendingBookRef.current = nextBook;
                audioAdService.requestAd("mid-roll").then((ad) => {
                  setInterstitialAd(ad);
                  setShowInterstitial(true);
                }).catch(() => {
                  playBook(nextBook as any);
                  pendingBookRef.current = null;
                });
              } else {
                playBook(nextBook as any);
              }
            }
            queryClient.invalidateQueries({ queryKey: ["/api/streaming-queue", queueId] });
            refetchItems();
            break;
          case "queue_updated":
            refetchItems();
            break;
          case "vote_updated":
            refetchItems();
            break;
          case "queue_closed":
            toast({ title: "Queue ended", description: "The host closed this queue." });
            onLeave();
            break;
          case "queue_playback_sync":
            break;
        }
      } catch (err) {
        console.error("WS parse error:", err);
      }
    };

    const scheduleReconnect = () => {
      if (destroyedRef.current) return;
      const attempt = reconnectAttemptsRef.current;
      if (attempt >= 5) {
        setConnectionStatus("disconnected");
        return;
      }
      reconnectAttemptsRef.current += 1;
      setConnectionStatus("reconnecting");
      const delay = Math.min(30000, 1000 * Math.pow(2, attempt));
      reconnectTimerRef.current = setTimeout(() => {
        if (!destroyedRef.current) connectWS();
      }, delay);
    };

    socket.onclose = () => {
      if (!destroyedRef.current) scheduleReconnect();
    };
    socket.onerror = () => {
      socket.close();
    };
  }, [user, queueId]);

  useEffect(() => {
    if (!user || !queueId) return;
    destroyedRef.current = false;
    reconnectAttemptsRef.current = 0;
    connectWS();
    return () => {
      destroyedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      const ws = wsRef.current;
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "leave_queue" }));
        }
        ws.close();
      }
    };
  }, [user, queueId]);

  useEffect(() => {
    if (!isOffline && connectionStatus !== "connected" && !destroyedRef.current) {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectAttemptsRef.current = 0;
      connectWS();
    }
  }, [isOffline]);

  const manualRetry = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectAttemptsRef.current = 0;
    setConnectionStatus("reconnecting");
    connectWS();
  }, [connectWS]);

  const voteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest("POST", `/api/streaming-queue/${queueId}/vote/${itemId}`);
      return res.json();
    },
    onSuccess: (data, itemId) => {
      if (data.voted) {
        setMyVotes(prev => [...prev, itemId]);
      } else {
        setMyVotes(prev => prev.filter(id => id !== itemId));
      }
      refetchItems();
    },
  });

  const addBookMutation = useMutation({
    mutationFn: async (bookId: string) => {
      const res = await apiRequest("POST", `/api/streaming-queue/${queueId}/add-book`, { bookId });
      return res.json();
    },
    onSuccess: () => {
      refetchItems();
      queryClient.invalidateQueries({ queryKey: ["/api/streaming-queue", queueId, "suggestions"] });
      toast({ title: "Book added to queue!" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't add book", description: err.message, variant: "destructive" });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/streaming-queue/${queueId}/skip`);
      return res.json();
    },
    onSuccess: () => {
      refetchItems();
      queryClient.invalidateQueries({ queryKey: ["/api/streaming-queue", queueId] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/streaming-queue/${queueId}/close`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/streaming-queue/active"] });
      onLeave();
    },
  });

  const handleInterstitialComplete = useCallback((skipped: boolean) => {
    if (interstitialAd) {
      audioAdService.recordImpression(interstitialAd.id, "mid-roll", !skipped, skipped, interstitialAd.provider);
    }
    setShowInterstitial(false);
    setInterstitialAd(null);
    if (pendingBookRef.current) {
      playBook(pendingBookRef.current as any);
      pendingBookRef.current = null;
    }
  }, [interstitialAd, playBook]);

  const handleInterstitialUpgrade = useCallback(() => {
    setShowInterstitial(false);
    setInterstitialAd(null);
    if (pendingBookRef.current) {
      playBook(pendingBookRef.current as any);
      pendingBookRef.current = null;
    }
    upgradeToPremium("monthly");
  }, [playBook, upgradeToPremium]);

  const isHost = queue?.hostUserId === user?.id;
  const pendingItems = (items || []).filter(i => i.status === "pending").sort((a, b) => (b.votes - a.votes) || (a.position - b.position));
  const playingItem = (items || []).find(i => i.status === "playing");

  if (queueLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onLeave} aria-label="Leave queue">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold truncate flex items-center gap-2">
            <ListMusic className="h-5 w-5 text-primary" />
            {queue?.name || "Live Queue"}
          </h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <ConnectionStatus
              status={isOffline ? "offline" : connectionStatus}
              attempt={reconnectAttemptsRef.current}
              onRetry={manualRetry}
            />
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {listenerCount} {listenerCount === 1 ? "listener" : "listeners"}
            </span>
            {queue?.genre && (
              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                {queue.genre}
              </span>
            )}
          </div>
        </div>
        {isHost && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => skipMutation.mutate()}
              disabled={skipMutation.isPending}
            >
              <SkipForward className="h-4 w-4 mr-1" />
              Skip
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => closeMutation.mutate()}
              disabled={closeMutation.isPending}
            >
              End Queue
            </Button>
          </div>
        )}
      </div>

      {isOffline && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-medium">
          <WifiOff className="h-4 w-4 flex-shrink-0" />
          You're offline — will reconnect automatically when network returns
        </div>
      )}

      {activeSponsor && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
          onClick={handleSponsorClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") handleSponsorClick(); }}
        >
          <img
            src={activeSponsor.sponsorLogo}
            alt={activeSponsor.sponsorName}
            className="w-6 h-6 rounded object-contain"
          />
          <span className="text-xs font-medium text-amber-800 dark:text-amber-200 flex items-center gap-1">
            <Megaphone className="h-3 w-3" />
            Sponsored by {activeSponsor.sponsorName}
          </span>
          {playingPreRoll && (
            <span className="ml-auto text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Volume2 className="h-3 w-3 animate-pulse" />
              Playing sponsor message...
            </span>
          )}
        </div>
      )}

      {/* Now Playing */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4">
          <p className="text-xs font-medium text-primary uppercase tracking-wider mb-2">Now Playing</p>
          <div className="flex items-center gap-4">
            {queue?.currentBookCover ? (
              <img src={queue.currentBookCover} alt="" className="w-16 h-20 object-cover rounded shadow-lg" />
            ) : (
              <div className="w-16 h-20 bg-muted rounded flex items-center justify-center">
                <Music className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-lg truncate">{queue?.currentBookTitle || "No book playing"}</p>
              {queue?.currentBookAuthor && (
                <p className="text-sm text-muted-foreground truncate">{queue.currentBookAuthor}</p>
              )}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={togglePlayPause}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Up Next */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ListMusic className="h-4 w-4 text-primary" />
              Up Next ({pendingItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Queue is empty. Add books or the system will auto-fill!
              </p>
            ) : (
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {pendingItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-xs text-muted-foreground w-5 text-center font-mono">
                        {idx + 1}
                      </span>
                      {item.bookCover ? (
                        <img src={item.bookCover} alt="" className="w-8 h-10 object-cover rounded" />
                      ) : (
                        <div className="w-8 h-10 bg-muted rounded flex items-center justify-center">
                          <Music className="h-3 w-3" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.bookTitle}</p>
                        {item.bookAuthor && (
                          <p className="text-xs text-muted-foreground truncate">{item.bookAuthor}</p>
                        )}
                      </div>
                      <Button
                        variant={myVotes.includes(item.id) ? "default" : "ghost"}
                        size="sm"
                        className="h-8 min-w-[3rem] gap-1"
                        onClick={() => voteMutation.mutate(item.id)}
                        disabled={voteMutation.isPending}
                      >
                        <ThumbsUp className="h-3 w-3" />
                        <span className="text-xs">{item.votes}</span>
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Suggest Books */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              Add to Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!suggestions || suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No suggestions available right now.
              </p>
            ) : (
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {suggestions.map((book) => (
                    <div
                      key={book.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      {book.coverImage ? (
                        <img src={book.coverImage} alt="" className="w-8 h-10 object-cover rounded" />
                      ) : (
                        <div className="w-8 h-10 bg-muted rounded flex items-center justify-center">
                          <Music className="h-3 w-3" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{book.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{book.author}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => addBookMutation.mutate(book.id)}
                        disabled={addBookMutation.isPending}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {showInterstitial && interstitialAd && (
        <AudioAdOverlay
          ad={interstitialAd}
          adType="mid-roll"
          onComplete={handleInterstitialComplete}
          onUpgrade={handleInterstitialUpgrade}
        />
      )}
    </div>
  );
}
