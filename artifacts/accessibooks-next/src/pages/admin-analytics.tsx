import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart3, RefreshCw, Users, DollarSign, Headphones, TrendingUp, Accessibility, Info, Calendar as CalendarIcon, MessageSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import type { DateRange as DayPickerRange } from "react-day-picker";
import {
  useSubscriptionAnalytics,
  useAdAnalytics,
  useListeningAnalytics,
  useFunnelAnalytics,
  useAccessibilityAnalytics,
} from "@/hooks/use-admin-analytics";
import { queryClient } from "@/lib/queryClient";

type DateRange = "7d" | "30d" | "90d" | "custom";

function getDateRange(range: Exclude<DateRange, "custom">): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (range === "7d") from.setDate(from.getDate() - 7);
  else if (range === "30d") from.setDate(from.getDate() - 30);
  else from.setDate(from.getDate() - 90);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function StatCard({ title, value, sub, icon }: { title: string; value: string | number; sub?: string; icon?: React.ReactNode }) {
  return (
    <Card className="dark:bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-tight">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card className="dark:bg-card">
      <CardHeader className="pb-2">
        <Skeleton className="h-3 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mb-1" />
        <Skeleton className="h-2 w-16" />
      </CardContent>
    </Card>
  );
}

function SubscriptionsTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useSubscriptionAnalytics(from, to);

  const total = (data?.totalFree ?? 0) + (data?.totalPlus ?? 0) + (data?.totalPremium ?? 0);
  const freeWidth = total > 0 ? Math.round(((data?.totalFree ?? 0) / total) * 100) : 0;
  const plusWidth = total > 0 ? Math.round(((data?.totalPlus ?? 0) / total) * 100) : 0;
  const premiumWidth = total > 0 ? Math.round(((data?.totalPremium ?? 0) / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 7 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard title="Free Users" value={data?.totalFree ?? 0} sub="current count" icon={<Users className="h-4 w-4" />} />
            <StatCard title="Plus Users" value={data?.totalPlus ?? 0} sub="current count" icon={<Users className="h-4 w-4" />} />
            <StatCard title="Premium Users" value={data?.totalPremium ?? 0} sub="current count" icon={<Users className="h-4 w-4" />} />
            <StatCard title="New Signups" value={data?.newSignupsThisPeriod ?? 0} sub="this period" icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard title="Upgrades" value={data?.upgradesThisPeriod ?? 0} sub="this period" icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard title="Cancellations" value={data?.cancellationsThisPeriod ?? 0} sub="this period" icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard title="Est. MRR" value={formatCents(data?.estimatedMRRCents ?? 0)} sub="this period" icon={<DollarSign className="h-4 w-4" />} />
          </>
        )}
      </div>

      {!isLoading && total > 0 && (
        <Card className="dark:bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">Tier Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="flex h-6 rounded overflow-hidden"
              role="img"
              aria-label={`User tier breakdown: Free ${freeWidth}%, Plus ${plusWidth}%, Premium ${premiumWidth}%`}
            >
              {freeWidth > 0 && (
                <div
                  className="bg-muted flex items-center justify-center text-[10px] text-muted-foreground font-bold"
                  style={{ width: `${freeWidth}%` }}
                >
                  {freeWidth > 10 ? `FREE ${freeWidth}%` : ""}
                </div>
              )}
              {plusWidth > 0 && (
                <div
                  className="bg-blue-600 flex items-center justify-center text-[10px] text-white font-bold"
                  style={{ width: `${plusWidth}%` }}
                >
                  {plusWidth > 10 ? `PLUS ${plusWidth}%` : ""}
                </div>
              )}
              {premiumWidth > 0 && (
                <div
                  className="bg-purple-700 flex items-center justify-center text-[10px] text-white font-bold"
                  style={{ width: `${premiumWidth}%` }}
                >
                  {premiumWidth > 10 ? `PREMIUM ${premiumWidth}%` : ""}
                </div>
              )}
            </div>
            <div className="flex gap-4 mt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-muted inline-block border border-border" />Free</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" />Plus</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-purple-700 inline-block" />Premium</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AdsTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useAdAnalytics(from, to);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard title="Impressions Served" value={(data?.impressionsServed ?? 0).toLocaleString()} sub="audio ad requests" icon={<BarChart3 className="h-4 w-4" />} />
            <StatCard title="Completion Rate" value={formatPct(data?.completionRate ?? 0)} sub="of impressions" icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard title="Click Rate" value={formatPct(data?.clickRate ?? 0)} sub="of impressions" icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard title="Rewarded Completions" value={(data?.rewardedCompletions ?? 0).toLocaleString()} sub="rewarded ad completes" icon={<BarChart3 className="h-4 w-4" />} />
            <StatCard title="Est. Ad Revenue" value={formatCents(data?.estimatedAdRevenueCents ?? 0)} sub="from impressions" icon={<DollarSign className="h-4 w-4" />} />
            <Card className="dark:bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
                  <BarChart3 className="h-4 w-4" />
                  Fill Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPct(data?.fillRate ?? 0)}</div>
                <Badge variant="outline" className="mt-1 text-[10px] h-5 px-1.5 uppercase font-bold tracking-wider">
                  {data && data.fillRate > 0.8 ? "Good" : data && data.fillRate > 0.5 ? "Fair" : "Low"}
                </Badge>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function ListeningTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useListeningAnalytics(from, to);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard title="Total Minutes" value={(data?.totalMinutes ?? 0).toLocaleString()} sub="all tiers" icon={<Headphones className="h-4 w-4" />} />
            <StatCard title="Total Sessions" value={(data?.totalSessions ?? 0).toLocaleString()} sub="from events" icon={<BarChart3 className="h-4 w-4" />} />
            <StatCard title="Avg Session" value={`${data?.averageSessionMinutes ?? 0} min`} sub="per session" icon={<Headphones className="h-4 w-4" />} />
          </>
        )}
      </div>

      {!isLoading && (
        <Card className="dark:bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Minutes by Tier</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <caption className="text-xs text-muted-foreground text-left mb-2">Listening minutes broken down by subscription tier</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Minutes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(["free", "plus", "premium"] as const).map(tier => (
                  <TableRow key={tier}>
                    <TableCell className="font-medium capitalize">{tier}</TableCell>
                    <TableCell className="text-right">{(data?.totalMinutesByTier?.[tier] ?? 0).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="top-titles-by-tier">
          {(["free", "plus", "premium"] as const).map(tier => {
            const titles = data?.topTitlesByTier?.[tier] ?? [];
            return (
              <Card key={tier} className="dark:bg-slate-900/50" data-testid={`top-titles-${tier}`}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium capitalize">Top Titles — {tier}</CardTitle>
                  <CardDescription>Most-played titles for {tier} listeners</CardDescription>
                </CardHeader>
                <CardContent>
                  {titles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No plays in this period.</p>
                  ) : (
                    <Table>
                      <caption className="sr-only">Top 5 titles played by {tier} listeners</caption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead className="text-right">Plays</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {titles.map(t => (
                          <TableRow key={`${tier}-${t.titleId}`}>
                            <TableCell className="font-medium">
                              {t.title ?? <span className="text-muted-foreground font-mono text-xs">{t.titleId.slice(0, 8)}…</span>}
                            </TableCell>
                            <TableCell className="text-right">{t.plays.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FunnelTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useFunnelAnalytics(from, to);

  const maxCount = Math.max(...(data?.funnel?.map(s => s.count) ?? [1]), 1);

  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
    <Card className="dark:bg-card">
      <CardHeader>
        <CardTitle className="text-xs font-semibold uppercase tracking-wider">Conversion Funnel</CardTitle>
        <CardDescription className="text-[10px] uppercase tracking-tight">Signed Up → Free Active → Upgraded → Retained</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4" role="list" aria-label="Conversion funnel steps">
          {(data?.funnel ?? []).map((step, i) => {
            const widthPct = maxCount > 0 ? Math.round((step.count / maxCount) * 100) : 0;
            return (
              <div key={step.step} role="listitem" className="space-y-1">
                <div className="flex items-center justify-between text-xs font-medium uppercase tracking-tight">
                  <span>{step.step}</span>
                  <span className="text-muted-foreground">{step.count.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="h-6 rounded bg-primary/20 border-l-2 border-primary transition-all"
                    style={{ width: `${widthPct}%`, minWidth: widthPct > 0 ? "2px" : "0" }}
                    aria-label={`${step.step}: ${step.count} users`}
                  />
                </div>
                {i > 0 && step.dropoffRate > 0 && (
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                    DROP-OFF: {formatPct(step.dropoffRate)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <Separator className="my-6" />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Signup → Upgrade</p>
            <p className="font-bold text-xl">{formatPct(data?.signupToUpgradeRate ?? 0)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Upgrade Retention</p>
            <p className="font-bold text-xl">{formatPct(data?.upgradeToRetainRate ?? 0)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
      )}
    </div>
  );
}

interface EngagementSummary {
  hubVisits: { total: number; byTier: Record<string, number> };
  threads: { total: number; byTier: Record<string, number> };
  replies: { total: number; byTier: Record<string, number> };
  rsvps: { total: number; byTier: Record<string, number> };
  attended: { total: number; byTier: Record<string, number> };
  clips: { total: number; byTier: Record<string, number> };
  nudgesShown: { total: number; byTier: Record<string, number> };
  nudgesClicked: { total: number; byTier: Record<string, number> };
}

function EngagementTab({ days }: { days: number }) {
  const { data, isLoading } = useQuery<EngagementSummary>({
    queryKey: ["/api/admin/analytics/engagement", days],
    queryFn: async () => {
      const r = await fetch(`/api/admin/analytics/engagement?days=${days}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch engagement summary");
      return r.json();
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data) return <p className="text-sm text-muted-foreground">No engagement data yet.</p>;

  const rows: Array<{ key: keyof EngagementSummary; label: string }> = [
    { key: "hubVisits", label: "Hub visits" },
    { key: "threads", label: "Threads created" },
    { key: "replies", label: "Replies posted" },
    { key: "rsvps", label: "Event RSVPs" },
    { key: "attended", label: "Events attended" },
    { key: "clips", label: "Share clips created" },
    { key: "nudgesShown", label: "Upgrade nudges shown" },
    { key: "nudgesClicked", label: "Upgrade nudges clicked" },
  ];

  const nudgeCtr = data.nudgesShown.total > 0
    ? ((data.nudgesClicked.total / data.nudgesShown.total) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-4" data-testid="tab-engagement">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Conversion attribution</CardTitle>
          <CardDescription>Nudge click-through (proxy for monetization conversion)</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{nudgeCtr}<span className="text-sm font-normal text-muted-foreground">% CTR</span></p>
          <p className="text-xs text-muted-foreground mt-1">
            {data.nudgesClicked.total.toLocaleString()} clicks / {data.nudgesShown.total.toLocaleString()} shown
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Engagement breakdown by tier</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Free</TableHead>
                <TableHead className="text-right">Plus</TableHead>
                <TableHead className="text-right">Premium</TableHead>
                <TableHead className="text-right font-medium">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ key, label }) => {
                const m = data[key];
                return (
                  <TableRow key={key} data-testid={`row-engagement-${key}`}>
                    <TableCell className="font-medium">{label}</TableCell>
                    <TableCell className="text-right">{(m.byTier.free ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{(m.byTier.plus ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{(m.byTier.premium ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium">{m.total.toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AccessibilityTab() {
  const { data, isLoading } = useAccessibilityAnalytics();

  return (
    <div className="space-y-6">
      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-4">
          <div className="flex gap-2 items-start text-sm text-blue-700 dark:text-blue-300">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>Feature usage is aggregated — no individual user data is shown.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="dark:bg-card">
        <CardHeader>
          <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
            <Accessibility className="h-4 w-4" />
            Feature Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : !data || data.length === 0 ? (
            <p className="text-muted-foreground text-xs text-center py-8">No accessibility preference data yet.</p>
          ) : (
            <Table>
              <caption className="text-[10px] text-muted-foreground text-left mb-2 uppercase tracking-tight">
                Accessibility feature adoption across all users with saved preferences
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wider h-10">Feature</TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider h-10">Users</TableHead>
                  <TableHead className="w-40 text-[11px] font-bold uppercase tracking-wider h-10">Usage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((feature) => (
                  <TableRow key={feature.featureKey}>
                    <TableCell className="font-medium text-xs py-2">{feature.featureName}</TableCell>
                    <TableCell className="text-right text-xs py-2">{feature.enabledCount.toLocaleString()}</TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 rounded-full bg-primary flex-shrink-0"
                          style={{ width: `${feature.percentage}%`, maxWidth: "80px", minWidth: "1px" }}
                          aria-label={`${feature.percentage}% of users`}
                        />
                        <span className="text-[10px] font-bold text-muted-foreground">{feature.percentage}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState<DateRange>("30d");
  // `customRange` is the *applied* range driving the queries; it only updates
  // when the user has selected both endpoints. `pickerSelection` tracks the
  // in-progress selection inside the open popover so editing an existing
  // range doesn't cause a transient fallback to 30d while only `from` is set.
  const [customRange, setCustomRange] = useState<DayPickerRange | undefined>();
  const [pickerSelection, setPickerSelection] = useState<DayPickerRange | undefined>();
  const [pickerOpen, setPickerOpen] = useState(false);

  let from: string;
  let to: string;
  if (range === "custom" && customRange?.from && customRange?.to) {
    const fromDate = new Date(customRange.from);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(customRange.to);
    toDate.setHours(23, 59, 59, 999);
    from = fromDate.toISOString();
    to = toDate.toISOString();
  } else {
    const r = getDateRange(range === "custom" ? "30d" : range);
    from = r.from;
    to = r.to;
  }

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
  };

  const customLabel =
    customRange?.from && customRange?.to
      ? `${format(customRange.from, "MMM d, yyyy")} – ${format(customRange.to, "MMM d, yyyy")}`
      : "Custom range";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 operator-shell">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-3">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground mt-1">Monetization and engagement reporting</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-md border border-border overflow-hidden">
            {(["7d", "30d", "90d"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                data-testid={`range-chip-${r}`}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  range === r
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {r === "7d" ? "7 days" : r === "30d" ? "30 days" : "90 days"}
              </button>
            ))}
          </div>

          <Popover
            open={pickerOpen}
            onOpenChange={(open) => {
              setPickerOpen(open);
              if (open) setPickerSelection(customRange);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant={range === "custom" ? "default" : "outline"}
                size="sm"
                className="gap-2"
                data-testid="range-chip-custom"
                aria-label="Pick a custom date range"
                onClick={() => {
                  if (range !== "custom" && customRange?.from && customRange?.to) {
                    setRange("custom");
                  }
                }}
              >
                <CalendarIcon className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {range === "custom" ? customLabel : "Custom range"}
                </span>
                <span className="sm:hidden">Custom</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={pickerSelection}
                onSelect={(value) => {
                  setPickerSelection(value);
                  if (value?.from && value?.to) {
                    setCustomRange(value);
                    setRange("custom");
                    setPickerOpen(false);
                  }
                }}
                numberOfMonths={2}
                disabled={(date) => date > new Date()}
                initialFocus
                data-testid="range-calendar"
              />
              {customRange?.from && customRange?.to && (
                <div className="flex items-center justify-between gap-2 border-t border-border p-2">
                  <span className="px-2 text-xs text-muted-foreground">
                    {customLabel}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCustomRange(undefined);
                      setPickerSelection(undefined);
                      setRange("30d");
                      setPickerOpen(false);
                    }}
                    data-testid="range-clear"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            aria-label="Refresh analytics data"
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="subscriptions">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="subscriptions" className="gap-1.5">
            <Users className="h-4 w-4" />
            Subscriptions
          </TabsTrigger>
          <TabsTrigger value="ads" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Ads
          </TabsTrigger>
          <TabsTrigger value="listening" className="gap-1.5">
            <Headphones className="h-4 w-4" />
            Listening
          </TabsTrigger>
          <TabsTrigger value="funnel" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            Funnel
          </TabsTrigger>
          <TabsTrigger value="engagement" className="gap-1.5" data-testid="tab-trigger-engagement">
            <MessageSquare className="h-4 w-4" />
            Engagement
          </TabsTrigger>
          <TabsTrigger value="accessibility" className="gap-1.5">
            <Accessibility className="h-4 w-4" />
            Accessibility
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subscriptions" className="mt-6">
          <SubscriptionsTab from={from} to={to} />
        </TabsContent>

        <TabsContent value="ads" className="mt-6">
          <AdsTab from={from} to={to} />
        </TabsContent>

        <TabsContent value="listening" className="mt-6">
          <ListeningTab from={from} to={to} />
        </TabsContent>

        <TabsContent value="funnel" className="mt-6">
          <FunnelTab from={from} to={to} />
        </TabsContent>

        <TabsContent value="engagement" className="mt-6">
          <EngagementTab days={Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000))} />
        </TabsContent>

        <TabsContent value="accessibility" className="mt-6">
          <AccessibilityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
