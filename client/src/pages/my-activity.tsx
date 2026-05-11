import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Activity, FileText, Share2, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import {
  OUTCOME_TAGS, OUTCOME_TAG_LABELS, ACTIVITY_EVENT_LABELS,
  type OutcomeTag, type UserActivityEvent, type ActivityEventType,
  type UserActivityShare,
} from "@shared/schema";

interface StatusResp { enabled: boolean; enabledAt: string | null; }
interface EventsResp {
  optedIn: boolean;
  from?: string;
  to?: string;
  events: UserActivityEvent[];
  summary: {
    totalEvents: number;
    totalListenSeconds: number;
    transcriptOpens: number;
    accessibilityChanges: number;
    byType: Record<string, number>;
    byTag: Record<string, number>;
    perBook: Array<{ bookId: string; title: string | null; sessions: number; seconds: number }>;
  };
}

function formatDuration(s: number): string {
  if (s <= 0) return "0m";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function MyActivityPage() {
  const { toast } = useToast();
  const today = useMemo(() => new Date(), []);
  const monthAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }, []);
  const [from, setFrom] = useState(isoDay(monthAgo));
  const [to, setTo] = useState(isoDay(today));
  const [caregiverLabel, setCaregiverLabel] = useState("");

  const status = useQuery<StatusResp>({ queryKey: ["/api/activity/status"] });

  const events = useQuery<EventsResp>({
    queryKey: ["/api/activity/events", from, to],
    queryFn: async () => {
      const fromIso = new Date(from + "T00:00:00").toISOString();
      const toIso = new Date(to + "T23:59:59").toISOString();
      const res = await fetch(
        `/api/activity/events?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: !!status.data?.enabled,
  });

  const shares = useQuery<UserActivityShare[]>({
    queryKey: ["/api/activity/shares"],
    enabled: !!status.data?.enabled,
  });

  const optInMut = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("POST", "/api/activity/opt-in", { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/events"] });
    },
    onError: () => toast({ title: "Could not save preference", variant: "destructive" }),
  });

  const tagMut = useMutation({
    mutationFn: ({ id, outcomeTag }: { id: string; outcomeTag: OutcomeTag | null }) =>
      apiRequest("PATCH", `/api/activity/events/${id}/tag`, { outcomeTag }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/activity/events"] }),
  });

  const wipeMut = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/activity/events"),
    onSuccess: () => {
      toast({ title: "All activity wiped" });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/shares"] });
    },
    onError: () => toast({ title: "Failed to wipe activity", variant: "destructive" }),
  });

  const shareMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/activity/shares", {
        caregiverLabel: caregiverLabel.trim(),
        rangeFrom: new Date(from + "T00:00:00").toISOString(),
        rangeTo: new Date(to + "T23:59:59").toISOString(),
      }),
    onSuccess: () => {
      setCaregiverLabel("");
      queryClient.invalidateQueries({ queryKey: ["/api/activity/shares"] });
      toast({ title: "Caregiver share created" });
    },
    onError: () => toast({ title: "Could not create share", variant: "destructive" }),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/activity/shares/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity/shares"] });
      toast({ title: "Share revoked" });
    },
  });

  if (status.isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const enabled = !!status.data?.enabled;
  const reportUrl = `/api/activity/report?from=${encodeURIComponent(
    new Date(from + "T00:00:00").toISOString(),
  )}&to=${encodeURIComponent(new Date(to + "T23:59:59").toISOString())}`;

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-8">
      <div className="flex items-center gap-3">
        <Activity className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">My Activity</h1>
      </div>

      {/* Opt-in panel */}
      <section
        aria-labelledby="opt-in-heading"
        className="rounded-lg border p-4 space-y-3"
        data-testid="section-opt-in"
      >
        <h2 id="opt-in-heading" className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          Activity tracking
        </h2>
        <p className="text-sm text-muted-foreground">
          Activity tracking is <strong>opt-in</strong>. When enabled, AccessiBooks records your
          listening time, transcript opens, and accessibility-feature use so you can review them
          here, attach outcome tags, and (optionally) share a plain-language report. No extra
          disability-related data or PII is collected. Disabling it stops new collection. You can
          wipe everything at any time.
        </p>
        <div className="flex items-center justify-between border-t pt-3">
          <Label htmlFor="opt-in-switch" className="font-medium">
            Enable activity tracking
          </Label>
          <Switch
            id="opt-in-switch"
            data-testid="switch-activity-opt-in"
            checked={enabled}
            disabled={optInMut.isPending}
            onCheckedChange={(v) => optInMut.mutate(v)}
          />
        </div>
        {enabled && status.data?.enabledAt && (
          <p className="text-xs text-muted-foreground">
            Tracking on since {new Date(status.data.enabledAt).toLocaleDateString()}.
          </p>
        )}
      </section>

      {!enabled && (
        <p
          role="note"
          className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"
        >
          Turn on activity tracking above to see your listening summary, attach outcome tags, and
          generate a report.
        </p>
      )}

      {enabled && (
        <>
          {/* Date range */}
          <section aria-labelledby="range-heading" className="rounded-lg border p-4 space-y-3">
            <h2 id="range-heading" className="text-lg font-semibold">Date range</h2>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <Label htmlFor="range-from" className="text-sm">From</Label>
                <Input
                  id="range-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-44"
                  data-testid="input-range-from"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="range-to" className="text-sm">To</Label>
                <Input
                  id="range-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-44"
                  data-testid="input-range-to"
                />
              </div>
              <Button asChild variant="outline">
                <a href={reportUrl} target="_blank" rel="noopener noreferrer" data-testid="link-report">
                  <FileText className="h-4 w-4 mr-2" />
                  Generate report
                </a>
              </Button>
            </div>
          </section>

          {/* Summary */}
          <section aria-labelledby="summary-heading" className="space-y-3">
            <h2 id="summary-heading" className="text-lg font-semibold">At a glance</h2>
            {events.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" role="list">
                <SummaryStat label="Listening / reading"
                  value={formatDuration(events.data?.summary.totalListenSeconds ?? 0)} />
                <SummaryStat label="Transcript opens"
                  value={String(events.data?.summary.transcriptOpens ?? 0)} />
                <SummaryStat label="A11y adjustments"
                  value={String(events.data?.summary.accessibilityChanges ?? 0)} />
                <SummaryStat label="Logged events"
                  value={String(events.data?.summary.totalEvents ?? 0)} />
              </div>
            )}
          </section>

          {/* Events list with tagging */}
          <section aria-labelledby="events-heading" className="space-y-3">
            <h2 id="events-heading" className="text-lg font-semibold">Recent activity</h2>
            {events.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !events.data?.events.length ? (
              <p className="text-sm text-muted-foreground" role="note">
                No activity logged in this range yet.
              </p>
            ) : (
              <ul className="rounded-lg border divide-y" data-testid="list-events">
                {events.data.events.slice(0, 100).map((e) => (
                  <li key={e.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
                    <div className="flex-1 min-w-[200px]">
                      <div className="font-medium">
                        {ACTIVITY_EVENT_LABELS[e.eventType as ActivityEventType] ?? e.eventType}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(e.occurredAt as any).toLocaleString()}
                        {e.bookTitle && <> &middot; {e.bookTitle}</>}
                        {e.durationSeconds ? ` · ${formatDuration(e.durationSeconds)}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`tag-${e.id}`} className="sr-only">
                        Outcome tag for this event
                      </Label>
                      <Select
                        value={e.outcomeTag ?? "none"}
                        onValueChange={(v) =>
                          tagMut.mutate({
                            id: e.id,
                            outcomeTag: v === "none" ? null : (v as OutcomeTag),
                          })
                        }
                      >
                        <SelectTrigger
                          id={`tag-${e.id}`}
                          className="w-52"
                          aria-label="Outcome tag"
                          data-testid={`select-tag-${e.id}`}
                        >
                          <SelectValue placeholder="No tag" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No tag</SelectItem>
                          {OUTCOME_TAGS.map((t) => (
                            <SelectItem key={t} value={t}>{OUTCOME_TAG_LABELS[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {e.outcomeTag && (
                        <Badge variant="secondary">{OUTCOME_TAG_LABELS[e.outcomeTag as OutcomeTag]}</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Separator />

          {/* Caregiver share */}
          <section aria-labelledby="share-heading" className="rounded-lg border p-4 space-y-4">
            <h2 id="share-heading" className="text-lg font-semibold flex items-center gap-2">
              <Share2 className="h-5 w-5 text-blue-600" />
              Share with a caregiver
            </h2>
            <p className="text-sm text-muted-foreground">
              Create a read-only link a caregiver or educator can open. They see the report only —
              no other account information. Revoke at any time.
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
                <Label htmlFor="caregiver-label" className="text-sm">
                  Caregiver name or role
                </Label>
                <Input
                  id="caregiver-label"
                  value={caregiverLabel}
                  onChange={(e) => setCaregiverLabel(e.target.value)}
                  placeholder="e.g. Sam (support coordinator)"
                  data-testid="input-caregiver-label"
                />
              </div>
              <Button
                onClick={() => shareMut.mutate()}
                disabled={!caregiverLabel.trim() || shareMut.isPending}
                data-testid="button-create-share"
              >
                {shareMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create share link
              </Button>
            </div>

            {shares.data && shares.data.length > 0 && (
              <ul className="border-t pt-3 divide-y" data-testid="list-shares">
                {shares.data.map((s) => {
                  const url = `${window.location.origin}/api/activity/share/${s.shareToken}/report`;
                  const revoked = !!s.revokedAt;
                  return (
                    <li key={s.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                      <div className="flex-1 min-w-[200px]">
                        <div className="font-medium">{s.caregiverLabel}</div>
                        {revoked ? (
                          <span className="text-xs text-muted-foreground">Revoked</span>
                        ) : (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 underline break-all"
                          >
                            {url}
                          </a>
                        )}
                      </div>
                      {!revoked && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => revokeMut.mutate(s.id)}
                          data-testid={`button-revoke-${s.id}`}
                        >
                          Revoke
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <Separator />

          {/* Wipe */}
          <section aria-labelledby="wipe-heading" className="rounded-lg border p-4 space-y-3">
            <h2 id="wipe-heading" className="text-lg font-semibold flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Wipe all activity
            </h2>
            <p className="text-sm text-muted-foreground">
              Permanently delete every activity event and revoke any active caregiver shares.
              This cannot be undone.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" data-testid="button-wipe">
                  Wipe my activity
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Wipe all activity?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes every activity event for your account and revokes all caregiver
                    shares. It cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => wipeMut.mutate()}
                    data-testid="button-wipe-confirm"
                  >
                    Yes, wipe everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3" role="listitem">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
