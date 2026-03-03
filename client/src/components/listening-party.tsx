import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useAudioContext } from "@/contexts/AudioContext";
import { useSubscription } from "@/hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Users, MessageCircle, Send, Copy, Play, Pause,
  SkipForward, SkipBack, Crown, ArrowLeft, Link2, Volume2,
  Loader2, X, Radio, Lock, Shield, Sparkles, UserPlus, WifiOff,
} from "lucide-react";
import { ConnectionStatus, type ConnectionStatusType } from "@/components/connection-status";
import type { Book, ListeningRoom, RoomMessage } from "@shared/schema";

interface PlaybackState {
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  updatedAt: number;
}

interface Participant {
  userId: string;
  displayName: string;
  role: string;
}

interface ListeningPartyProps {
  book?: Book | null;
  onBack: () => void;
}

interface TierLimits {
  tier: string;
  canCreate: boolean;
  maxListeners: number;
  coHost: boolean;
}

export function ListeningParty({ book, onBack }: ListeningPartyProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { tier: subscriptionTier, isPaid, upgradeToTier, isUpgrading } = useSubscription();
  const [mode, setMode] = useState<"lobby" | "room">("lobby");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [roomName, setRoomName] = useState("");

  const { data: tierLimits } = useQuery<TierLimits>({
    queryKey: ["/api/listening-party/tier-limits"],
  });

  const handleRoomCreated = (room: ListeningRoom) => {
    setRoomId(room.id);
    setMode("room");
  };

  const handleRoomJoined = (room: ListeningRoom) => {
    setRoomId(room.id);
    setMode("room");
  };

  const handleLeaveRoom = () => {
    setRoomId(null);
    setMode("lobby");
  };

  if (mode === "room" && roomId) {
    return (
      <ListeningRoom
        roomId={roomId}
        onLeave={handleLeaveRoom}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Go back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Radio className="h-6 w-6 text-primary" aria-hidden="true" />
            Listening Party
          </h1>
          <p className="text-muted-foreground text-sm">Listen together with friends in real-time</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Play className="h-5 w-5 text-primary" aria-hidden="true" />
              Start a Party
              {tierLimits && !tierLimits.canCreate && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  <Lock className="h-3 w-3 mr-1" />
                  Plus+
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {tierLimits && !tierLimits.canCreate ? (
              <div className="space-y-4">
                <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-sm">Upgrade to Host Parties</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Free users can join listening parties. Upgrade to Plus or Premium to create and host your own rooms.
                  </p>
                  <div className="space-y-2 text-xs text-muted-foreground mb-4">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3 w-3 text-blue-500" />
                      <span><strong>Plus:</strong> Host rooms with up to 10 listeners</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3 w-3 text-yellow-500" />
                      <span><strong>Premium:</strong> Up to 50 listeners + co-host support</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => upgradeToTier("plus", "monthly")}
                      disabled={isUpgrading}
                    >
                      {isUpgrading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      Get Plus
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => upgradeToTier("premium", "monthly")}
                      disabled={isUpgrading}
                    >
                      {isUpgrading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      Get Premium
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  You can still join rooms created by others using a room code.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Create a listening room for a book and invite others to join. As the host, you control playback for everyone.
                </p>
                {tierLimits && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    <span>Up to {tierLimits.maxListeners} listeners</span>
                    {tierLimits.coHost && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0">
                        <UserPlus className="h-3 w-3 mr-1" />
                        Co-host
                      </Badge>
                    )}
                  </div>
                )}
                {tierLimits?.coHost && (
                  <Input
                    placeholder="Custom room name (optional)"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    maxLength={50}
                    aria-label="Room name"
                  />
                )}
                {book ? (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    {book.coverImage ? (
                      <img src={book.coverImage} alt="" className="w-10 h-14 object-cover rounded" />
                    ) : (
                      <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                        <Volume2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{book.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{book.author}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Select a book from your library first, then come back here to start a party.
                  </p>
                )}
                <CreateRoomButton book={book} onCreated={handleRoomCreated} roomName={roomName} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" aria-hidden="true" />
              Join a Party
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the room code shared by a friend to join their listening session.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Enter room code (e.g., ABC123)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="font-mono uppercase tracking-wider"
                aria-label="Room code"
                data-testid="input-room-code"
              />
              <JoinRoomButton code={joinCode} onJoined={handleRoomJoined} />
            </div>
          </CardContent>
        </Card>
      </div>

      <MyRoomsSection onJoin={handleRoomJoined} />
    </div>
  );
}

function CreateRoomButton({ book, onCreated, roomName }: { book?: Book | null; onCreated: (room: ListeningRoom) => void; roomName?: string }) {
  const { toast } = useToast();
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!book) throw new Error("No book selected");
      const res = await apiRequest("POST", "/api/listening-party/rooms", {
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        bookCover: book.coverImage,
        roomName: roomName || undefined,
      });
      return res.json();
    },
    onSuccess: (room: ListeningRoom) => {
      onCreated(room);
    },
    onError: (err: any) => {
      if (err?.requiresUpgrade) {
        toast({
          title: "Upgrade Required",
          description: "Room creation requires a Plus or Premium subscription",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to create room",
          description: err.message || "Something went wrong",
          variant: "destructive",
        });
      }
    },
  });

  return (
    <Button
      className="w-full"
      onClick={() => createMutation.mutate()}
      disabled={!book || createMutation.isPending}
      data-testid="button-create-room"
    >
      {createMutation.isPending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Users className="h-4 w-4 mr-2" />
      )}
      Create Listening Room
    </Button>
  );
}

function JoinRoomButton({ code, onJoined }: { code: string; onJoined: (room: ListeningRoom) => void }) {
  const { toast } = useToast();
  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!code || code.length < 4) throw new Error("Enter a valid room code");
      const res = await apiRequest("GET", `/api/listening-party/rooms/join/${code}`);
      return res.json();
    },
    onSuccess: (room: ListeningRoom) => {
      onJoined(room);
    },
    onError: (err: Error) => {
      toast({
        title: "Could not join room",
        description: err.message || "Room not found or no longer active",
        variant: "destructive",
      });
    },
  });

  return (
    <Button
      onClick={() => joinMutation.mutate()}
      disabled={!code || code.length < 4 || joinMutation.isPending}
      data-testid="button-join-room"
    >
      {joinMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join"}
    </Button>
  );
}

function MyRoomsSection({ onJoin }: { onJoin: (room: ListeningRoom) => void }) {
  const { data: rooms = [], isLoading } = useQuery<ListeningRoom[]>({
    queryKey: ["/api/listening-party/my-rooms"],
  });

  const activeRooms = rooms.filter(r => r.status === "active");
  if (isLoading || activeRooms.length === 0) return null;

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold mb-3">Your Active Rooms</h2>
      <div className="space-y-2">
        {activeRooms.map(room => (
          <Card key={room.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onJoin(room)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {room.bookCover ? (
                  <img src={room.bookCover} alt="" className="w-8 h-12 object-cover rounded" />
                ) : (
                  <div className="w-8 h-12 bg-muted rounded flex items-center justify-center">
                    <Volume2 className="h-3 w-3 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{room.bookTitle}</p>
                  <p className="text-xs text-muted-foreground">Code: <span className="font-mono">{room.roomCode}</span></p>
                </div>
              </div>
              <Button size="sm" variant="outline">Rejoin</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ListeningRoom({ roomId, onLeave, onBack }: { roomId: string; onLeave: () => void; onBack: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { audioRef, currentBook, playBook, isPlaying, currentTime, playbackRate, seekTo, togglePlayPause, changeSpeed, skip, formatTime, setCurrentBook } = useAudioContext();
  const [isCoHost, setIsCoHost] = useState(false);

  const wsRef2 = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>("reconnecting");
  const reconnectAttemptsRef = useRef(0);
  const destroyedRef = useRef(false);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<{ id: string; userId: string; displayName: string; content: string; createdAt: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [syncedPlayback, setSyncedPlayback] = useState<PlaybackState | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(0);

  const { data: room } = useQuery<ListeningRoom>({
    queryKey: ["/api/listening-party/rooms", roomId],
  });

  const { data: initialMessages = [] } = useQuery<RoomMessage[]>({
    queryKey: ["/api/listening-party/rooms", roomId, "messages"],
    enabled: !!roomId,
  });

  useEffect(() => {
    if (initialMessages.length > 0 && chatMessages.length === 0) {
      setChatMessages(initialMessages.map(m => ({
        id: m.id,
        userId: m.userId,
        displayName: m.displayName,
        content: m.content,
        createdAt: m.createdAt?.toString() || new Date().toISOString(),
      })));
    }
  }, [initialMessages]);

  useEffect(() => {
    if (room && room.bookId && (!currentBook || currentBook.id !== room.bookId)) {
      fetch(`/api/books/${room.bookId}`)
        .then(r => r.ok ? r.json() : null)
        .then(book => {
          if (book) {
            playBook(book);
          }
        })
        .catch(() => {});
    }
  }, [room]);

  const { isOffline } = useAudioContext();

  const connectWS = useCallback(() => {
    if (destroyedRef.current || !user || !roomId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/listening-party`;
    const socket = new WebSocket(wsUrl);
    wsRef2.current = socket;

    socket.onopen = () => {
      if (destroyedRef.current) { socket.close(); return; }
      reconnectAttemptsRef.current = 0;
      setConnectionStatus("connected");
      socket.send(JSON.stringify({ type: "join_room", roomId }));
      socket.send(JSON.stringify({ type: "sync_request" }));
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "playback_sync":
            if (msg.playback) setSyncedPlayback(msg.playback);
            if (msg.participants) {
              setParticipants(msg.participants);
              const me = msg.participants.find((p: Participant) => p.userId === user.id);
              if (me) {
                setIsHost(me.role === "host");
                setIsCoHost(me.role === "co-host");
              }
            }
            break;
          case "participant_joined":
          case "participant_left":
            if (msg.participants) setParticipants(msg.participants);
            break;
          case "chat_broadcast":
            setChatMessages(prev => [...prev, {
              id: msg.messageId || `msg_${Date.now()}`,
              userId: msg.userId,
              displayName: msg.displayName,
              content: msg.content,
              createdAt: msg.createdAt || new Date().toISOString(),
            }]);
            break;
          case "room_closed":
            toast({ title: "Room closed", description: "The host has ended the listening party." });
            onLeave();
            break;
          case "error":
            console.error("[ListeningParty]", msg.error);
            break;
        }
      } catch (e) {}
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
  }, [user, roomId]);

  useEffect(() => {
    if (!user || !roomId) return;
    destroyedRef.current = false;
    reconnectAttemptsRef.current = 0;
    connectWS();
    return () => {
      destroyedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      const ws = wsRef2.current;
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "leave_room" }));
        ws.close();
      }
    };
  }, [user, roomId]);

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

  useEffect(() => {
    if (!isHost || !wsRef2.current || wsRef2.current.readyState !== WebSocket.OPEN) return;

    syncIntervalRef.current = setInterval(() => {
      const now = Date.now();
      if (now - lastSyncRef.current < 2000) return;
      lastSyncRef.current = now;
      const ws = wsRef2.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: "playback_update",
        playback: {
          currentTime: audioRef.current?.currentTime || 0,
          isPlaying: !audioRef.current?.paused,
          playbackRate: audioRef.current?.playbackRate || 1,
          updatedAt: Date.now(),
        },
      }));
    }, 3000);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [isHost, connectionStatus]);

  const canControlPlayback = isHost || isCoHost;

  const sendPlaybackUpdate = useCallback(() => {
    const ws = wsRef2.current;
    if (!canControlPlayback || !ws || ws.readyState !== WebSocket.OPEN) return;
    lastSyncRef.current = Date.now();
    ws.send(JSON.stringify({
      type: "playback_update",
      playback: {
        currentTime: audioRef.current?.currentTime || 0,
        isPlaying: !audioRef.current?.paused,
        playbackRate: audioRef.current?.playbackRate || 1,
        updatedAt: Date.now(),
      },
    }));
  }, [canControlPlayback, connectionStatus]);

  useEffect(() => {
    if (canControlPlayback || !syncedPlayback || !audioRef.current) return;

    const audio = audioRef.current;
    const elapsed = (Date.now() - syncedPlayback.updatedAt) / 1000;
    const expectedTime = syncedPlayback.isPlaying
      ? syncedPlayback.currentTime + (elapsed * syncedPlayback.playbackRate)
      : syncedPlayback.currentTime;

    const drift = Math.abs(audio.currentTime - expectedTime);
    if (drift > 2) {
      audio.currentTime = expectedTime;
    }

    if (syncedPlayback.isPlaying && audio.paused) {
      audio.play().catch(() => {});
    } else if (!syncedPlayback.isPlaying && !audio.paused) {
      audio.pause();
    }

    if (audio.playbackRate !== syncedPlayback.playbackRate) {
      audio.playbackRate = syncedPlayback.playbackRate;
    }
  }, [syncedPlayback, canControlPlayback]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSendMessage = () => {
    const ws = wsRef2.current;
    if (!chatInput.trim() || !ws || ws.readyState !== WebSocket.OPEN || !user) return;
    ws.send(JSON.stringify({
      type: "chat_message",
      content: chatInput.trim(),
    }));
    setChatInput("");
  };

  const handleHostTogglePlay = async () => {
    if (!canControlPlayback) return;
    await togglePlayPause();
    setTimeout(sendPlaybackUpdate, 100);
  };

  const handleHostSkip = (seconds: number) => {
    if (!canControlPlayback) return;
    skip(seconds);
    setTimeout(sendPlaybackUpdate, 100);
  };

  const handleHostSpeed = (delta: number) => {
    if (!canControlPlayback) return;
    changeSpeed(delta);
    setTimeout(sendPlaybackUpdate, 100);
  };

  const assignCoHost = useMutation({
    mutationFn: async (targetUserId: string) => {
      await apiRequest("POST", `/api/listening-party/rooms/${roomId}/co-host`, { userId: targetUserId });
    },
    onSuccess: () => {
      toast({ title: "Co-host assigned" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to assign co-host", description: err.message, variant: "destructive" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/listening-party/rooms/${roomId}/close`);
    },
    onSuccess: () => {
      toast({ title: "Room closed" });
      onLeave();
    },
  });

  const copyRoomCode = () => {
    if (room?.roomCode) {
      navigator.clipboard.writeText(room.roomCode);
      toast({ title: "Room code copied!", description: `Share code: ${room.roomCode}` });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { onLeave(); }} aria-label="Leave room">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" aria-hidden="true" />
              Listening Party
              <ConnectionStatus
                status={isOffline ? "offline" : connectionStatus}
                attempt={reconnectAttemptsRef.current}
                onRetry={manualRetry}
              />
            </h1>
            {room && (
              <p className="text-sm text-muted-foreground">{room.bookTitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyRoomCode} data-testid="button-copy-code">
            <Copy className="h-4 w-4 mr-1" />
            {room?.roomCode || "..."}
          </Button>
          {isHost && (
            <Button variant="destructive" size="sm" onClick={() => closeMutation.mutate()} data-testid="button-close-room">
              <X className="h-4 w-4 mr-1" /> End Party
            </Button>
          )}
        </div>
      </div>

      {isOffline && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-medium">
          <WifiOff className="h-4 w-4 flex-shrink-0" />
          You're offline — will reconnect automatically when network returns
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                {room?.bookCover ? (
                  <img src={room.bookCover} alt="" className="w-16 h-24 object-cover rounded-lg" />
                ) : (
                  <div className="w-16 h-24 bg-muted rounded-lg flex items-center justify-center">
                    <Volume2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold truncate">{room?.bookTitle || "Loading..."}</h2>
                  <p className="text-sm text-muted-foreground truncate">{room?.bookAuthor}</p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {isHost ? (
                      <span className="inline-flex items-center gap-1 text-primary font-medium">
                        <Crown className="h-3 w-3" /> You are the host
                      </span>
                    ) : isCoHost ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                        <Shield className="h-3 w-3" /> You are a co-host
                      </span>
                    ) : (
                      <span>Synced with host</span>
                    )}
                  </div>
                  {room?.maxListeners && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3 inline mr-1" />
                      {participants.length}/{room.maxListeners} listeners
                    </div>
                  )}
                </div>
              </div>

              <Separator className="my-4" />

              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => canControlPlayback ? handleHostSkip(-15) : null}
                  disabled={!canControlPlayback}
                  aria-label="Skip back 15 seconds"
                >
                  <SkipBack className="h-5 w-5" />
                </Button>
                <Button
                  size="lg"
                  className="rounded-full w-12 h-12"
                  onClick={canControlPlayback ? handleHostTogglePlay : undefined}
                  disabled={!canControlPlayback}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  data-testid="button-play-pause"
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => canControlPlayback ? handleHostSkip(15) : null}
                  disabled={!canControlPlayback}
                  aria-label="Skip forward 15 seconds"
                >
                  <SkipForward className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex items-center justify-center gap-4 mt-2 text-sm text-muted-foreground">
                <span>{formatTime(currentTime)}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => canControlPlayback ? handleHostSpeed(-0.25) : null}
                    disabled={!canControlPlayback}
                  >
                    -
                  </Button>
                  <span className="font-mono text-xs">{playbackRate.toFixed(2)}x</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => canControlPlayback ? handleHostSpeed(0.25) : null}
                    disabled={!canControlPlayback}
                  >
                    +
                  </Button>
                </div>
              </div>

              {!canControlPlayback && (
                <p className="text-center text-xs text-muted-foreground mt-3">
                  Playback is controlled by the host
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" aria-hidden="true" />
                Listeners ({participants.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex flex-wrap gap-2">
                {participants.map(p => (
                  <div
                    key={p.userId}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full text-sm"
                  >
                    {p.role === "host" && <Crown className="h-3 w-3 text-yellow-500" />}
                    {p.role === "co-host" && <Shield className="h-3 w-3 text-blue-500" />}
                    <span>{p.displayName}</span>
                    {p.userId === user?.id && (
                      <span className="text-xs text-muted-foreground">(you)</span>
                    )}
                    {isHost && room?.hostTier === "premium" && p.role === "guest" && p.userId !== user?.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); assignCoHost.mutate(p.userId); }}
                        className="ml-1 text-xs text-primary hover:text-primary/80"
                        title="Make co-host"
                      >
                        <UserPlus className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="flex flex-col h-[500px] md:h-auto md:max-h-[600px]">
          <CardHeader className="py-3 px-4 border-b flex-shrink-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Chat
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1 px-4 py-2">
            <div className="space-y-3">
              {chatMessages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No messages yet. Say hello!
                </p>
              )}
              {chatMessages.map((msg) => {
                const isMe = msg.userId === user?.id;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    <span className="text-xs text-muted-foreground mb-0.5">{msg.displayName}</span>
                    <div className={`px-3 py-2 rounded-lg max-w-[85%] text-sm ${
                      isMe
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>
          <div className="p-3 border-t flex-shrink-0">
            <form
              onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
              className="flex gap-2"
            >
              <Input
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={500}
                aria-label="Chat message"
                data-testid="input-chat-message"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!chatInput.trim() || connectionStatus !== "connected"}
                aria-label="Send message"
                data-testid="button-send-message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
