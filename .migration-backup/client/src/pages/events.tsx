import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Calendar, Users, Lock, PlayCircle, MessageCircle, CalendarPlus } from "lucide-react";
import { AdSlot } from "@/components/AdSlot";
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
  replayPreviewUrl: string | null;
  rsvpCount: number;
  attendedCount: number;
  freeReplayPreviewSeconds: number;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function downloadEventIcs(event: LiveEvent): void {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AccessiBooks//Live Events//EN",
    "BEGIN:VEVENT",
    `UID:accessibooks-event-${event.id}`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${toIcsDate(event.scheduledStartAt)}`,
    `DTEND:${toIcsDate(event.scheduledEndAt)}`,
    `SUMMARY:${(event.title || "AccessiBooks event").replace(/\n/g, " ")}`,
    `DESCRIPTION:${(event.description || "").replace(/\n/g, "\\n")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(event.title || "event").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const EVENTS_PAGE_SIZE = 5;

interface AuthUser { id?: string; role?: string; subscriptionTier?: string | null; }

export default function EventsPage({ focusEventId }: { focusEventId?: string } = {}) {
  const { user } = useAuth() as { user: AuthUser | null | undefined };
  const isAdmin = user?.role === "admin";
  const [selectedId, setSelectedId] = useState<string | null>(focusEventId ?? null);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [pastPage, setPastPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: "", description: "",
    eventType: "group_listen" as "author_qa" | "group_listen" | "launch_party" | "community_ama",
    scheduledStartAt: "", durationMinutes: 60,
  });
  const { toast } = useToast();
  const createMutation = useMutation({
    mutationFn: async (payload: typeof newEvent) => {
      const start = new Date(payload.scheduledStartAt);
      const end = new Date(start.getTime() + payload.durationMinutes * 60_000);
      return apiRequest("POST", "/api/events", {
        eventType: payload.eventType,
        title: payload.title,
        description: payload.description,
        scheduledStartAt: start.toISOString(),
        scheduledEndAt: end.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setShowCreate(false);
      setNewEvent({ title: "", description: "", eventType: "group_listen", scheduledStartAt: "", durationMinutes: 60 });
      toast({ title: "Event scheduled" });
    },
    onError: (e: any) => toast({ title: "Could not create event", description: e?.message ?? "Try again.", variant: "destructive" }),
  });

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

      {isAdmin && (
        <section aria-labelledby="admin-create-heading" className="space-y-3" data-testid="section-admin-event-create">
          <div className="flex items-center justify-between">
            <h2 id="admin-create-heading" className="text-lg font-semibold">Admin · schedule an event</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreate((s) => !s)}
              aria-expanded={showCreate}
              data-testid="btn-admin-toggle-create"
            >
              {showCreate ? "Cancel" : "New event"}
            </Button>
          </div>
          {showCreate && (
            <Card className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ev-title" className="text-sm font-medium">Title</label>
                  <Input id="ev-title" value={newEvent.title}
                    onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                    data-testid="input-event-title" />
                </div>
                <div>
                  <label htmlFor="ev-type" className="text-sm font-medium">Type</label>
                  <select id="ev-type" className="w-full border rounded-md h-10 px-2 bg-background"
                    value={newEvent.eventType}
                    onChange={(e) => setNewEvent({ ...newEvent, eventType: e.target.value as typeof newEvent.eventType })}
                    data-testid="select-event-type">
                    <option value="group_listen">Group listen</option>
                    <option value="author_qa">Author Q&amp;A</option>
                    <option value="community_ama">Community AMA</option>
                    <option value="launch_party">Launch party</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="ev-desc" className="text-sm font-medium">Description</label>
                  <Input id="ev-desc" value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    data-testid="input-event-description" />
                </div>
                <div>
                  <label htmlFor="ev-start" className="text-sm font-medium">Starts at</label>
                  <Input id="ev-start" type="datetime-local" value={newEvent.scheduledStartAt}
                    onChange={(e) => setNewEvent({ ...newEvent, scheduledStartAt: e.target.value })}
                    data-testid="input-event-start" />
                </div>
                <div>
                  <label htmlFor="ev-dur" className="text-sm font-medium">Duration (minutes)</label>
                  <Input id="ev-dur" type="number" min={15} max={240} value={newEvent.durationMinutes}
                    onChange={(e) => setNewEvent({ ...newEvent, durationMinutes: Number(e.target.value) })}
                    data-testid="input-event-duration" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    if (!newEvent.title || !newEvent.scheduledStartAt) {
                      toast({ title: "Title and start time are required.", variant: "destructive" });
                      return;
                    }
                    createMutation.mutate({
                      ...newEvent,
                      scheduledStartAt: new Date(newEvent.scheduledStartAt).toISOString(),
                    });
                  }}
                  disabled={createMutation.isPending}
                  data-testid="btn-admin-create-event"
                >
                  {createMutation.isPending ? "Saving…" : "Schedule event"}
                </Button>
              </div>
            </Card>
          )}
        </section>
      )}

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
  const { user } = useAuth() as { user: AuthUser | null | undefined };
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
          <div className="flex flex-col items-end gap-2">
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
            {event.status !== "ended" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => downloadEventIcs(event)}
                data-testid={`event-add-to-calendar-${event.id}`}
                aria-label={`Add ${event.title} to calendar`}
              >
                <CalendarPlus className="h-4 w-4 mr-1" aria-hidden="true" /> Add to calendar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          <p className="text-sm whitespace-pre-wrap">{event.description}</p>

          {isLive && (
            <Button
              data-testid={`event-join-${event.id}`}
              onClick={async () => {
                // Record attendance (idempotent server-side) before navigating into the live room.
                try {
                  await apiRequest("POST", `/api/events/${event.id}/attend`, {});
                  queryClient.invalidateQueries({ queryKey: ["/api/events", event.id, "detail"] });
                } catch { /* non-blocking */ }
                // Pass event context so /party can scope its room/sync to this live event.
                window.location.href = `/party?event=${encodeURIComponent(event.id)}`;
              }}
            >
              <PlayCircle className="h-4 w-4 mr-1" aria-hidden="true" /> Join the room
            </Button>
          )}

          {event.status === "ended" && (event.replayUrl || event.replayPreviewUrl) && (
            <>
              {/* Pre-replay sponsor card — free users only; suppressed server-side for Plus/Premium */}
              {(!user?.subscriptionTier || user.subscriptionTier === "free") && (
                <div className="rounded-md border-2 border-dashed border-muted-foreground/30 p-2" data-testid="replay-sponsor-slot">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 px-1">
                    Sponsored · before the replay
                  </p>
                  <AdSlot placementId="event-replay-preroll" />
                </div>
              )}
              <ReplaySection
                access={detail?.replayAccess ?? "none"}
                replayUrl={event.replayUrl ?? event.replayPreviewUrl ?? ""}
                previewSec={event.freeReplayPreviewSeconds}
              />
            </>
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
  const { user } = useAuth() as { user: AuthUser | null | undefined };
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
