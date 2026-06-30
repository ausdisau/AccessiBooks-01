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
import {
  Activity, FileText, Share2, Trash2, ShieldCheck, Loader2,
  Target, Plus, Pencil, Check, X,
} from "lucide-react";
import {
  OUTCOME_TAGS, OUTCOME_TAG_LABELS, ACTIVITY_EVENT_LABELS,
  GOAL_METRICS, GOAL_METRIC_LABELS, GOAL_METRIC_UNITS,
  GOAL_PERIODS, GOAL_PERIOD_LABELS,
  type OutcomeTag, type UserActivityEvent, type ActivityEventType,
  type UserActivityShare, type GoalMetric, type GoalPeriod,
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

interface GoalTrendPoint { label: string; actual: number; target: number; met: boolean; }
interface GoalProgressItem {
  id: string;
  metric: GoalMetric;
  period: GoalPeriod;
  target: number;
  current: { label: string; actual: number; target: number; percent: number; met: boolean } | null;
  trend: GoalTrendPoint[];
  metPeriods: number;
  totalPeriods: number;
}
interface GoalsProgressResp { optedIn: boolean; goals: GoalProgressItem[]; }

/** Pull the server's JSON `message` out of apiRequest's `"<status>: <body>"` error. */
function errMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : "";
  const body = raw.replace(/^\d+:\s*/, "");
  try {
    const j = JSON.parse(body);
    if (j && typeof j.message === "string") return j.message;
  } catch {
    /* not JSON */
  }
  return body || fallback;
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

  const goalsProgress = useQuery<GoalsProgressResp>({
    queryKey: ["/api/activity/goals/progress"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/activity/goals/progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/goals"] });
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

  const invalidateGoals = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/activity/goals/progress"] });
    queryClient.invalidateQueries({ queryKey: ["/api/activity/goals"] });
  };

  const createGoalMut = useMutation({
    mutationFn: (body: { metric: GoalMetric; period: GoalPeriod; target: number }) =>
      apiRequest("POST", "/api/activity/goals", body),
    onSuccess: () => {
      invalidateGoals();
      toast({ title: "Goal added" });
    },
    onError: (err) => toast({ title: errMessage(err, "Could not add goal"), variant: "destructive" }),
  });

  const updateGoalMut = useMutation({
    mutationFn: ({ id, target }: { id: string; target: number }) =>
      apiRequest("PATCH", `/api/activity/goals/${id}`, { target }),
    onSuccess: () => {
      invalidateGoals();
      toast({ title: "Goal updated" });
    },
    onError: (err) =>
      toast({ title: errMessage(err, "Could not update goal"), variant: "destructive" }),
  });

  const deleteGoalMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/activity/goals/${id}`),
    onSuccess: () => {
      invalidateGoals();
      toast({ title: "Goal removed" });
    },
    onError: (err) =>
      toast({ title: errMessage(err, "Could not remove goal"), variant: "destructive" }),
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
          generate a report. You can still wipe any previously stored activity below.
        </p>
      )}

      {/* Wipe is always available — including after opting out — so users can
          permanently delete anything that was stored while tracking was on. */}
      <section
        aria-labelledby="wipe-heading"
        className="rounded-lg border p-4 space-y-3 order-last"
        data-testid="section-wipe"
      >
        <h2 id="wipe-heading" className="text-lg font-semibold flex items-center gap-2 text-red-600">
          <Trash2 className="h-5 w-5" />
          Wipe all activity
        </h2>
        <p className="text-sm text-muted-foreground">
          Permanently delete every activity event for your account and revoke any active caregiver
          shares. Available even when tracking is off. This cannot be undone.
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

          {/* Goals & progress */}
          <section aria-labelledby="goals-heading" className="space-y-4">
            <h2 id="goals-heading" className="text-lg font-semibold flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Goals &amp; progress
            </h2>
            <p className="text-sm text-muted-foreground">
              Set listening and reading goals for yourself or together with a caregiver. Progress
              shows your most recent weeks and months and is included in shared reports.
            </p>

            <GoalAddForm
              existing={goalsProgress.data?.goals ?? []}
              onAdd={(body) => createGoalMut.mutate(body)}
              pending={createGoalMut.isPending}
            />

            {goalsProgress.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !goalsProgress.data?.goals.length ? (
              <p className="text-sm text-muted-foreground" role="note">
                No goals yet. Add one above to start tracking progress.
              </p>
            ) : (
              <ul className="space-y-3" data-testid="list-goals">
                {goalsProgress.data.goals.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    onSave={(target) => updateGoalMut.mutate({ id: g.id, target })}
                    onDelete={() => deleteGoalMut.mutate(g.id)}
                    saving={updateGoalMut.isPending}
                    deleting={deleteGoalMut.isPending}
                  />
                ))}
              </ul>
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
                        {new Date(String(e.occurredAt)).toLocaleString()}
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

function GoalAddForm({
  existing,
  onAdd,
  pending,
}: {
  existing: GoalProgressItem[];
  onAdd: (body: { metric: GoalMetric; period: GoalPeriod; target: number }) => void;
  pending: boolean;
}) {
  const [metric, setMetric] = useState<GoalMetric>("listening_minutes");
  const [period, setPeriod] = useState<GoalPeriod>("week");
  const [target, setTarget] = useState("150");

  const duplicate = existing.some((g) => g.metric === metric && g.period === period);
  const targetNum = Number(target);
  const valid = Number.isFinite(targetNum) && targetNum > 0 && !duplicate;

  return (
    <div className="rounded-lg border p-4 flex flex-wrap gap-3 items-end" data-testid="form-add-goal">
      <div className="flex flex-col gap-1 min-w-[180px]">
        <Label htmlFor="goal-metric" className="text-sm">Measure</Label>
        <Select value={metric} onValueChange={(v) => setMetric(v as GoalMetric)}>
          <SelectTrigger id="goal-metric" className="w-full" data-testid="select-goal-metric">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GOAL_METRICS.map((m) => (
              <SelectItem key={m} value={m}>{GOAL_METRIC_LABELS[m]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1 min-w-[140px]">
        <Label htmlFor="goal-period" className="text-sm">Period</Label>
        <Select value={period} onValueChange={(v) => setPeriod(v as GoalPeriod)}>
          <SelectTrigger id="goal-period" className="w-full" data-testid="select-goal-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GOAL_PERIODS.map((p) => (
              <SelectItem key={p} value={p}>{GOAL_PERIOD_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1 w-32">
        <Label htmlFor="goal-target" className="text-sm">Target ({GOAL_METRIC_UNITS[metric]})</Label>
        <Input
          id="goal-target"
          type="number"
          min={1}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          data-testid="input-goal-target"
        />
      </div>
      <Button
        onClick={() => valid && onAdd({ metric, period, target: targetNum })}
        disabled={!valid || pending}
        data-testid="button-add-goal"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        Add goal
      </Button>
      {duplicate && (
        <p className="w-full text-xs text-amber-600" role="note">
          You already have a {GOAL_METRIC_LABELS[metric].toLowerCase()} goal {GOAL_PERIOD_LABELS[period]}.
          Edit it below instead.
        </p>
      )}
    </div>
  );
}

function GoalCard({
  goal,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  goal: GoalProgressItem;
  onSave: (target: number) => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(goal.target));
  const unit = GOAL_METRIC_UNITS[goal.metric];
  const periodLabel = GOAL_PERIOD_LABELS[goal.period];
  const periodNoun = goal.period === "week" ? "weeks" : "months";
  const current = goal.current;
  const pct = current?.percent ?? 0;

  const startEdit = () => {
    setValue(String(goal.target));
    setEditing(true);
  };
  const save = () => {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) onSave(n);
    setEditing(false);
  };

  return (
    <li className="rounded-lg border p-4 space-y-3" data-testid={`goal-${goal.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[180px]">
          <div className="font-medium">{GOAL_METRIC_LABELS[goal.metric]}</div>
          <div className="text-xs text-muted-foreground">
            Target: {goal.target} {unit} {periodLabel}
          </div>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <Label htmlFor={`goal-edit-${goal.id}`} className="sr-only">New target</Label>
            <Input
              id={`goal-edit-${goal.id}`}
              type="number"
              min={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-24"
              data-testid={`input-goal-edit-${goal.id}`}
            />
            <Button size="sm" onClick={save} disabled={saving} data-testid={`button-goal-save-${goal.id}`} aria-label="Save target">
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} aria-label="Cancel edit">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={startEdit} data-testid={`button-goal-edit-${goal.id}`}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              disabled={deleting}
              data-testid={`button-goal-delete-${goal.id}`}
              aria-label="Remove goal"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {current ? `This ${goal.period}: ${current.actual} / ${goal.target} ${unit}` : "No data yet"}
          </span>
          {current?.met && <Badge variant="secondary">Met</Badge>}
        </div>
        <div
          className="h-2 rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={`Progress this ${goal.period}`}
        >
          <div
            className={`h-full ${current?.met ? "bg-emerald-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {goal.trend.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            Met target in {goal.metPeriods} of {goal.totalPeriods} {periodNoun}
          </div>
          <div className="flex items-end gap-1 h-16" data-testid={`goal-trend-${goal.id}`}>
            {goal.trend.map((t, i) => {
              const h = goal.target > 0 ? Math.min(100, Math.round((t.actual / goal.target) * 100)) : 0;
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col justify-end items-center"
                  title={`${t.label}: ${t.actual} ${unit} (target ${t.target})`}
                >
                  <div
                    className={`w-full rounded-t ${t.met ? "bg-emerald-500" : "bg-primary/40"}`}
                    style={{ height: `${Math.max(4, h)}%` }}
                    aria-hidden="true"
                  />
                  <span className="sr-only">
                    {t.label}: {t.actual} {unit}, target {t.target}, {t.met ? "met" : "not met"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </li>
  );
}
