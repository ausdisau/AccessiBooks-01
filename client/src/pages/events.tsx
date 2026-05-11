import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Calendar, Users, Lock, PlayCircle, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";

interface LiveEvent {
  id: string;
  eventType: string;
  title: string;
  description: string;
  hostDisplayName: string;
  bookTitle: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: "scheduled" | "live" | "ended" | "canceled";
  replayUrl: string | null;
  rsvpCount: number;
  attendedCount: number;
  freeReplayPreviewSeconds: number;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const EVENTS_PAGE_SIZE = 5;

export default function EventsPage() {
  const { user } = useAuth() as any;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [pastPage, setPastPage] = useState(1);

  const { data, isLoading } = useQuery<{ upcoming: LiveEvent[]; past: LiveEvent[] }>({
    queryKey: ["/api/events"],
  });

  const upcomingAll = data?.upcoming ?? [];
  const pastAll = data?.past ?? [];
  const upcomingShown = upcomingAll.slice(0, upcomingPage * EVENTS_PAGE_SIZE);
  const pastShown = pastAll.slice(0, pastPage * EVENTS_PAGE_SIZE);

  return (
    <div className="container max-w-5xl mx-auto p-4 space-y-6" data-testid="page-events">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Calendar className="h-6 w-6 text-primary" aria-hidden="true" />
          Live Events
        </h1>
        <p className="text-muted-foreground mt-1">
          Author Q&amp;As, group listening parties, launches, and AMAs. Replays are free for the first 10 minutes.
        </p>
      </header>

      <section aria-labelledby="upcoming-heading" className="space-y-3">
        <h2 id="upcoming-heading" className="text-lg font-semibold">Upcoming &amp; live</h2>
        {isLoading && <Skeleton className="h-32 w-full" />}
        {!isLoading && upcomingAll.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">No events scheduled yet.</Card>
        )}
        <ul className="space-y-3">
          {upcomingShown.map(ev => (
            <li key={ev.id}>
              <EventCard event={ev} expanded={selectedId === ev.id} onToggle={() => setSelectedId(selectedId === ev.id ? null : ev.id)} />
            </li>
          ))}
        </ul>
        {upcomingAll.length > upcomingShown.length && (
          <div className="flex justify-center mt-3">
            <Button variant="outline" onClick={() => setUpcomingPage(p => p + 1)} data-testid="btn-events-upcoming-more">
              Show more ({upcomingAll.length - upcomingShown.length} remaining)
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="past-heading" className="space-y-3">
        <h2 id="past-heading" className="text-lg font-semibold">Past events &amp; replays</h2>
        {isLoading && <Skeleton className="h-32 w-full" />}
        {!isLoading && pastAll.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">No past events yet.</Card>
        )}
        <ul className="space-y-3">
          {pastShown.map(ev => (
            <li key={ev.id}>
              <EventCard event={ev} expanded={selectedId === ev.id} onToggle={() => setSelectedId(selectedId === ev.id ? null : ev.id)} />
            </li>
          ))}
        </ul>
        {pastAll.length > pastShown.length && (
          <div className="flex justify-center mt-3">
            <Button variant="outline" onClick={() => setPastPage(p => p + 1)} data-testid="btn-events-past-more">
              Show more ({pastAll.length - pastShown.length} remaining)
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function EventCard({ event, expanded, onToggle }: { event: LiveEvent; expanded: boolean; onToggle: () => void }) {
  const { user } = useAuth() as any;
  const { toast } = useToast();

  const { data: detail } = useQuery<{
    event: LiveEvent; rsvped: boolean; replayAccess: "none" | "preview" | "full"; freeReplayPreviewSeconds: number;
  }>({
    queryKey: ["/api/events", event.id, "detail"],
    queryFn: async () => {
      const r = await fetch(`/api/events/${event.id}`, { credentials: "include" });
      return r.json();
    },
    enabled: expanded,
  });

  const rsvpM = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/events/${event.id}/rsvp`, {});
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events", event.id, "detail"] });
      toast({ title: data.rsvped ? "RSVP confirmed — we'll remind you." : "RSVP canceled.", duration: 2500 });
    },
  });

  const isLive = event.status === "live";

  return (
    <Card data-testid={`event-card-${event.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant={isLive ? "destructive" : "outline"}>
                {isLive ? "🔴 LIVE NOW" : event.status === "ended" ? "Replay" : "Upcoming"}
              </Badge>
              <Badge variant="secondary">{event.eventType.replace(/_/g, " ")}</Badge>
            </div>
            <CardTitle className="text-base">
              <button
                onClick={onToggle}
                className="text-left hover:underline focus-visible:ring-2 focus-visible:ring-primary rounded"
                aria-expanded={expanded}
                data-testid={`event-toggle-${event.id}`}
              >
                {event.title}
              </button>
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {formatWhen(event.scheduledStartAt)} · {event.hostDisplayName}
              {event.bookTitle && <> · 📖 {event.bookTitle}</>}
            </p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Users className="h-3 w-3" aria-hidden="true" /> {event.rsvpCount} going · {event.attendedCount} attended
            </p>
          </div>
          {user && event.status !== "ended" && (
            <Button
              size="sm"
              variant={detail?.rsvped ? "secondary" : "default"}
              onClick={() => rsvpM.mutate()}
              disabled={rsvpM.isPending}
              data-testid={`event-rsvp-${event.id}`}
            >
              {detail?.rsvped ? "Going ✓" : "RSVP"}
            </Button>
          )}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          <p className="text-sm whitespace-pre-wrap">{event.description}</p>

          {isLive && (
            <Link href="/party">
              <Button data-testid={`event-join-${event.id}`}>
                <PlayCircle className="h-4 w-4 mr-1" aria-hidden="true" /> Join the room
              </Button>
            </Link>
          )}

          {event.status === "ended" && event.replayUrl && (
            <ReplaySection access={detail?.replayAccess ?? "none"} replayUrl={event.replayUrl} previewSec={event.freeReplayPreviewSeconds} />
          )}

          <EventChat eventId={event.id} />
        </CardContent>
      )}
    </Card>
  );
}

function ReplaySection({ access, replayUrl, previewSec }: { access: "none" | "preview" | "full"; replayUrl: string; previewSec: number }) {
  if (access === "none") {
    return <p className="text-sm text-muted-foreground">Replay is being prepared.</p>;
  }
  if (access === "preview") {
    return (
      <Card className="p-4 bg-muted/40">
        <div className="flex items-start gap-3">
          <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-medium">First {Math.round(previewSec / 60)} minutes free</p>
            <p className="text-xs text-muted-foreground mt-1">
              Plus and Premium members get full replay access.
            </p>
            <audio
              controls
              src={`${replayUrl}#t=0,${previewSec}`}
              className="w-full mt-2"
              aria-label="Event replay preview"
            />
            <Link href="/pricing">
              <Button size="sm" className="mt-2" data-testid="replay-upgrade">Unlock full replay</Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <audio controls src={replayUrl} className="w-full" aria-label="Event replay" data-testid="replay-full" />
  );
}

function EventChat({ eventId }: { eventId: string }) {
  const { user } = useAuth() as any;
  const [text, setText] = useState("");
  const { toast } = useToast();

  const { data, refetch } = useQuery<{ messages: { id: string; displayName: string; body: string; createdAt: string }[] }>({
    queryKey: ["/api/events", eventId, "chat"],
    queryFn: async () => {
      const r = await fetch(`/api/events/${eventId}/chat`, { credentials: "include" });
      return r.json();
    },
    refetchInterval: 5000,
  });

  const sendM = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/events/${eventId}/chat`, { body: text });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.message ?? "Failed to send");
      }
      return r.json();
    },
    onSuccess: () => { setText(""); refetch(); },
    onError: (err: any) => toast({ title: err.message, variant: "destructive", duration: 3000 }),
  });

  return (
    <section aria-label="Event chat" className="space-y-2 border-t pt-3">
      <h3 className="text-sm font-semibold flex items-center gap-1">
        <MessageCircle className="h-4 w-4" aria-hidden="true" /> Chat
      </h3>
      <ul className="space-y-1 max-h-48 overflow-y-auto" aria-live="polite" data-testid={`chat-list-${eventId}`}>
        {(data?.messages ?? []).map(m => (
          <li key={m.id} className="text-sm">
            <span className="font-medium">{m.displayName}:</span>{" "}
            <span>{m.body}</span>
          </li>
        ))}
        {(data?.messages ?? []).length === 0 && (
          <li className="text-xs text-muted-foreground">No messages yet.</li>
        )}
      </ul>
      {user && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (text.trim()) sendM.mutate(); }}
          className="flex gap-2"
        >
          <label className="sr-only" htmlFor={`chat-input-${eventId}`}>Send a message</label>
          <Input
            id={`chat-input-${eventId}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="Say hi…"
            data-testid={`chat-input-${eventId}`}
          />
          <Button type="submit" size="sm" disabled={!text.trim() || sendM.isPending} data-testid={`chat-send-${eventId}`}>
            Send
          </Button>
        </form>
      )}
    </section>
  );
}
