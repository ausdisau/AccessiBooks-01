import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, TrendingUp, Users, CreditCard, BarChart3, Radio,
  AlertTriangle, RefreshCw, Shield, ShoppingBag, Star, Crown,
} from "lucide-react";

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface AdminRevenueData {
  mrr: number;
  totalRevenue: number;
  subscriptionRevenue: number;
  adSpend: number;
  totalTransactions: number;
  weeklyRevenue: number;
  weeklyTransactions: number;
  usersByTier: Record<string, number>;
  totalUsers: number;
  paidUsers: number;
  conversionRate: string;
  recentTransactions: Array<{
    id: string;
    type: string;
    amountCents: number;
    currency: string;
    status: string;
    provider: string;
    description: string | null;
    createdAt: string | null;
  }>;
}

interface AdAnalytics {
  totalRequests: number;
  programmaticFills: number;
  houseFills: number;
  passbacks: number;
  errors: number;
  fillRate: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-primary",
  loading = false,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  loading?: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-28 rounded-xl" />;
  }
  return (
    <Card className="dark:bg-card">
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <div className={`rounded bg-muted p-2 shrink-0`}>
            <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-xl font-bold mt-0.5 truncate">{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-tight truncate">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminRevenuePage() {
  const { user } = useAuth();

  const {
    data: revenue,
    isLoading: revenueLoading,
    error: revenueError,
    dataUpdatedAt,
    refetch,
    isFetching,
  } = useQuery<AdminRevenueData>({
    queryKey: ["/api/billing/admin/revenue"],
    queryFn: () => fetch("/api/billing/admin/revenue", { credentials: "include" }).then(r => {
      if (!r.ok) throw new Error("Access denied");
      return r.json();
    }),
    refetchInterval: 60000,
    retry: false,
  });

  const { data: adAnalytics, isLoading: adLoading } = useQuery<AdAnalytics>({
    queryKey: ["/api/ads/analytics"],
    refetchInterval: 30000,
  });

  if (revenueError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 space-y-4">
        <div className="bg-destructive/10 rounded-full p-4">
          <Shield className="h-10 w-10 text-destructive" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold">Admin Access Required</h2>
        <p className="text-muted-foreground max-w-md">
          This page is restricted to admin accounts. If you believe this is an error, contact support.
        </p>
      </div>
    );
  }

  const tierBreakdown = revenue?.usersByTier || {};
  const adFillRate = adAnalytics?.fillRate || "N/A";
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  return (
    <div className="space-y-6" role="region" aria-label="Admin Revenue Dashboard">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" />
            Revenue Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Platform-wide revenue summary — admin only
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">Updated {lastUpdated}</span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Refresh revenue data"
          >
            <RefreshCw className={`h-4 w-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="group" aria-label="Revenue KPIs">
        <StatCard
          icon={TrendingUp}
          label="MRR (30d)"
          value={revenueLoading ? "—" : formatCents(revenue?.mrr || 0)}
          sub="Monthly recurring revenue"
          color="text-green-500"
          loading={revenueLoading}
        />
        <StatCard
          icon={DollarSign}
          label="Total Revenue"
          value={revenueLoading ? "—" : formatCents(revenue?.totalRevenue || 0)}
          sub="All time"
          color="text-blue-500"
          loading={revenueLoading}
        />
        <StatCard
          icon={Radio}
          label="Ad Spend"
          value={revenueLoading ? "—" : formatCents(revenue?.adSpend || 0)}
          sub="Self-serve advertiser spend"
          color="text-purple-500"
          loading={revenueLoading}
        />
        <StatCard
          icon={BarChart3}
          label="Ad Fill Rate"
          value={adLoading ? "—" : adFillRate}
          sub={`${adAnalytics?.totalRequests || 0} total requests`}
          color="text-orange-500"
          loading={adLoading}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Users by Tier
            </CardTitle>
            <CardDescription>
              {revenueLoading ? "Loading..." : `${revenue?.totalUsers || 0} total users · ${revenue?.conversionRate}% conversion`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {revenueLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
              </div>
            ) : (
              <div className="space-y-3" role="list" aria-label="User tier breakdown">
                {[
                  { tier: "free", label: "Free", icon: Users, color: "bg-gray-500", textColor: "text-gray-400" },
                  { tier: "plus", label: "Plus", icon: Star, color: "bg-blue-500", textColor: "text-blue-400" },
                  { tier: "premium", label: "Premium", icon: Crown, color: "bg-amber-500", textColor: "text-amber-400" },
                ].map(({ tier, label, icon: Icon, color, textColor }) => {
                  const count = tierBreakdown[tier] || 0;
                  const total = revenue?.totalUsers || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={tier} className="space-y-1" role="listitem">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest mb-1">
                        <span className={`flex items-center gap-1.5 ${textColor}`}>
                          <Icon className="h-3 w-3" aria-hidden="true" />
                          {label}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {count.toLocaleString()} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} users: ${pct}%`}>
                        <div
                          className={`h-full ${color} rounded-full transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Ad Platform Summary
            </CardTitle>
            <CardDescription>
              Programmatic vs house ads fill breakdown
            </CardDescription>
          </CardHeader>
          <CardContent>
            {adLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
              </div>
            ) : adAnalytics ? (
              <div className="space-y-3" role="list" aria-label="Ad platform metrics">
                {[
                  { label: "Total Requests", value: (adAnalytics.totalRequests || 0).toLocaleString() },
                  { label: "Programmatic Fills", value: (adAnalytics.programmaticFills || 0).toLocaleString() },
                  { label: "House Ad Fills", value: (adAnalytics.houseFills || 0).toLocaleString() },
                  { label: "Passbacks", value: (adAnalytics.passbacks || 0).toLocaleString() },
                  { label: "Errors", value: (adAnalytics.errors || 0).toLocaleString() },
                  { label: "Programmatic Fill Rate", value: adAnalytics.fillRate },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0" role="listitem">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-semibold tabular-nums">{value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-4">No ad data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="group" aria-label="Weekly metrics">
        <StatCard
          icon={CreditCard}
          label="7-Day Revenue"
          value={revenueLoading ? "—" : formatCents(revenue?.weeklyRevenue || 0)}
          sub="Last 7 days"
          color="text-teal-500"
          loading={revenueLoading}
        />
        <StatCard
          icon={ShoppingBag}
          label="Subscription Revenue"
          value={revenueLoading ? "—" : formatCents(revenue?.subscriptionRevenue || 0)}
          sub="All time subscriptions"
          color="text-indigo-500"
          loading={revenueLoading}
        />
        <StatCard
          icon={Users}
          label="Paid Users"
          value={revenueLoading ? "—" : (revenue?.paidUsers || 0).toString()}
          sub={`${revenue?.conversionRate || 0}% conversion rate`}
          color="text-rose-500"
          loading={revenueLoading}
        />
        <StatCard
          icon={TrendingUp}
          label="7-Day Transactions"
          value={revenueLoading ? "—" : (revenue?.weeklyTransactions || 0).toString()}
          sub="New transactions this week"
          color="text-cyan-500"
          loading={revenueLoading}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Recent Transactions
          </CardTitle>
          <CardDescription>Last 10 platform-wide transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {revenueLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : !revenue?.recentTransactions?.length ? (
            <p className="text-center text-sm text-muted-foreground py-8">No transactions recorded yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="table" aria-label="Recent platform transactions">
                <caption className="sr-only">Recent transactions across the platform, showing type, amount, provider, status, and date</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="text-left py-2 pr-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground h-10">Type</th>
                    <th scope="col" className="text-right py-2 px-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground h-10">Amount</th>
                    <th scope="col" className="text-center py-2 px-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground h-10 hidden sm:table-cell">Provider</th>
                    <th scope="col" className="text-center py-2 px-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground h-10">Status</th>
                    <th scope="col" className="text-right py-2 pl-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground h-10 hidden md:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.recentTransactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4">
                        <span className="font-bold text-xs">{tx.description || tx.type}</span>
                        <span className="block text-[10px] text-muted-foreground uppercase tracking-tight">{tx.type.replace(/_/g, " ")}</span>
                      </td>
                      <td className="py-2 px-4 text-right font-bold text-xs tabular-nums">
                        {tx.amountCents > 0 ? formatCents(tx.amountCents) : "—"}
                      </td>
                      <td className="py-2 px-4 text-center text-[10px] font-bold uppercase tracking-widest hidden sm:table-cell text-muted-foreground">
                        {tx.provider}
                      </td>
                      <td className="py-2 px-4 text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 h-5 ${
                            tx.status === 'completed' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 
                            tx.status === 'failed' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
                            'bg-muted text-muted-foreground'
                          }`}
                        >
                          {tx.status}
                        </Badge>
                      </td>
                      <td className="py-2 pl-4 text-right text-muted-foreground text-[10px] font-medium uppercase tracking-tight hidden md:table-cell">
                        {formatDate(tx.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
