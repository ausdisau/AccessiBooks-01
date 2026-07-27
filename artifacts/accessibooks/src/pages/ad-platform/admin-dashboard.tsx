import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield, Zap, LogOut, Eye, Users, DollarSign, TrendingUp,
  CheckCircle, XCircle, Clock, AlertCircle, Globe, Target, Building2,
  RefreshCw, Send, CheckSquare,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface PendingAd {
  id: string;
  headline: string;
  body: string | null;
  destinationUrl: string;
  status: string;
  maxCpmCents: number;
  advertiserId: string;
  advertiserEmail: string | null;
  createdAt: Date | null;
}

interface PendingCommunityAnnotation {
  id: string;
  bookId: string;
  bookTitle: string | null;
  page: number;
  text: string;
  note: string;
  status: string;
  contributorId: string;
  contributorName: string | null;
  createdAt: string | null;
}

interface PlatformUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  companyName: string | null;
  website: string | null;
  createdAt: Date | null;
}

interface PlatformStats {
  advertiserCount: number;
  publisherCount: number;
  totalImpressions: number;
  revenueCents: number;
}

interface PayoutRequest {
  id: string;
  publisherId: string;
  publisherEmail: string | null;
  amountCents: number;
  status: string;
  createdAt: Date | null;
}

function formatMoney(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function formatNum(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString(); }

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pending_review: { color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", label: "In Review" },
  approved: { color: "text-green-400 bg-green-400/10 border-green-400/20", label: "Approved" },
  rejected: { color: "text-red-400 bg-red-400/10 border-red-400/20", label: "Rejected" },
  draft: { color: "text-white/50 bg-white/10 border-white/20", label: "Draft" },
  active: { color: "text-green-400 bg-green-400/10 border-green-400/20", label: "Active" },
  pending: { color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", label: "Pending" },
  paid: { color: "text-green-400 bg-green-400/10 border-green-400/20", label: "Paid" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { color: "text-white/50 bg-white/10 border-white/20", label: status };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>{cfg.label}</span>;
}

export default function AdminPlatformDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [days, setDays] = useState(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  function buildAnalyticsUrl(base: string) {
    if (customFrom && customTo) return `${base}?from=${customFrom}&to=${customTo}`;
    return `${base}?days=${days}`;
  }

  const { data: pendingAds = [], refetch: refetchAds } = useQuery<PendingAd[]>({
    queryKey: ["/api/ad/admin/pending-ads"],
  });

  const { data: allUsers = [] } = useQuery<PlatformUser[]>({
    queryKey: ["/api/ad/admin/users"],
  });

  const { data: platformStats } = useQuery<PlatformStats>({
    queryKey: ["/api/ad/admin/stats"],
  });

  const { data: payouts = [], refetch: refetchPayouts } = useQuery<PayoutRequest[]>({
    queryKey: ["/api/ad/admin/payouts"],
  });

  const { data: pendingAnnotations = [], refetch: refetchAnnotations } = useQuery<PendingCommunityAnnotation[]>({
    queryKey: ["/api/admin/community-annotations", "pending"],
    queryFn: () => fetch("/api/admin/community-annotations?status=pending", { credentials: "include" }).then(r => r.json()),
  });

  const { data: analytics, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery<{
    totals: { gmvCents: number; platformRevenueCents: number; totalImpressions: number; totalClicks: number };
    daily: Array<{ date: string; auctions: number; filled: number; gmvCents: number }>;
    topAdvertisers: Array<{ advertiserId: string; email: string | null; companyName: string | null; totalSpendCents: number; balanceCents: number }>;
    topPublishers: Array<{ publisherId: string; email: string | null; companyName: string | null; totalEarnedCents: number; pendingCents: number }>;
    pendingPayouts: Array<{ id: string; publisherId: string; amountCents: number; status: string; createdAt: Date | null; email: string | null }>;
  }>({
    queryKey: ["/api/analytics/admin", days, customFrom, customTo],
    queryFn: () => fetch(buildAnalyticsUrl("/api/analytics/admin")).then(r => r.json()),
    refetchInterval: 30000,
    staleTime: 25000,
  });

  const reviewAdMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      apiRequest("PATCH", `/api/ad/admin/display-ads/${id}/review`, { status, rejectionReason: reason }),
    onSuccess: () => {
      refetchAds();
      queryClient.invalidateQueries({ queryKey: ["/api/ad/admin/stats"] });
      toast({ title: "Ad reviewed" });
    },
    onError: () => toast({ title: "Review failed", variant: "destructive" }),
  });

  const payoutActionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "paid" | "rejected" }) =>
      apiRequest("PATCH", `/api/ad/admin/payouts/${id}`, { status }),
    onSuccess: () => {
      refetchPayouts();
      toast({ title: "Payout updated" });
    },
    onError: () => toast({ title: "Failed to update payout", variant: "destructive" }),
  });

  const reviewAnnotationMutation = useMutation({
    mutationFn: ({ id, action, reviewNote }: { id: string; action: "approve" | "reject"; reviewNote?: string }) =>
      apiRequest("PATCH", `/api/admin/community-annotations/${id}/review`, { action, reviewNote }),
    onSuccess: () => {
      refetchAnnotations();
      toast({ title: "Annotation reviewed" });
    },
    onError: () => toast({ title: "Review failed", variant: "destructive" }),
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout", {}),
    onSuccess: () => { queryClient.clear(); window.location.href = "/"; },
  });

  const advertisers = allUsers.filter((u) => u.role === "advertiser");
  const publishers = allUsers.filter((u) => u.role === "publisher");
  const pendingPayouts = payouts.filter((p) => p.status === "pending");

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white flex">
      {/* Sidebar */}
      <aside className="w-60 border-r border-white/10 flex flex-col py-6 px-4 flex-shrink-0">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
            <Shield className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-bold">AdBid</span>
          <Badge className="text-[9px] bg-red-600/20 text-red-400 border-red-500/30 ml-auto">Admin</Badge>
        </div>

        <nav className="space-y-1 flex-1">
          {[
            { icon: TrendingUp, label: "Overview", active: true },
            { icon: Eye, label: "Ad Review" },
            { icon: Users, label: "Users" },
            { icon: DollarSign, label: "Payouts" },
          ].map(({ icon: Icon, label, active }) => (
            <button key={label} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-red-600/20 text-red-300" : "text-white/50 hover:text-white hover:bg-white/5"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>

        <div className="border-t border-white/10 pt-4 mt-4 space-y-1">
          <div className="px-3 py-2 text-xs text-white/30">
            <div className="font-medium text-white/60 truncate">{user?.email}</div>
            <div className="text-red-400">Platform Admin</div>
          </div>
          <button
            onClick={() => logoutMutation.mutate()}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl">
          <div className="mb-8">
            <h1 className="text-2xl font-bold">Platform Overview</h1>
            <p className="text-white/40 text-sm mt-1">Ad platform administration</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              { icon: Building2, label: "Advertisers", value: advertisers.length, color: "text-blue-400" },
              { icon: Globe, label: "Publishers", value: publishers.length, color: "text-violet-400" },
              { icon: Target, label: "Pending Review", value: pendingAds.length, color: "text-yellow-400" },
              { icon: DollarSign, label: "Platform Revenue", value: formatMoney(analytics?.totals?.platformRevenueCents ?? platformStats?.revenueCents ?? 0), color: "text-green-400" },
            ].map(({ icon: Icon, label, value, color }) => (
              <Card key={label} className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className="h-4 w-4 text-white/40" />
                    <span className="text-xs text-white/40">{label}</span>
                  </div>
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Analytics */}
          <div className="mb-8">
            <div className="flex items-center flex-wrap gap-2 mb-4">
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider flex-shrink-0 mr-2">Analytics</h2>
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => { setDays(d); setCustomFrom(""); setCustomTo(""); }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${days === d && !customFrom ? "bg-red-600/20 text-red-300 border border-red-500/30" : "text-white/40 hover:text-white/70"}`}
                >
                  {d}d
                </button>
              ))}
              <div className="flex items-center gap-1 ml-1">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-1.5 py-0.5 rounded text-xs bg-white/5 border border-white/10 text-white/60 focus:border-red-500/50 focus:outline-none w-28"
                />
                <span className="text-white/30 text-xs">–</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-1.5 py-0.5 rounded text-xs bg-white/5 border border-white/10 text-white/60 focus:border-red-500/50 focus:outline-none w-28"
                />
              </div>
              <button onClick={() => refetchAnalytics()} className="p-1 text-white/30 hover:text-white/60 ml-auto">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* GMV summary */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Gross Revenue (GMV)", value: formatMoney(analytics?.totals?.gmvCents ?? 0), color: "text-white" },
                { label: "Platform Take (30%)", value: formatMoney(analytics?.totals?.platformRevenueCents ?? 0), color: "text-green-400" },
                { label: "Publisher Payouts (70%)", value: formatMoney(Math.floor((analytics?.totals?.gmvCents ?? 0) * 0.7)), color: "text-violet-400" },
              ].map(({ label, value, color }) => (
                <Card key={label} className="bg-white/5 border-white/10">
                  <CardContent className="p-3">
                    <div className="text-xs text-white/40 mb-1">{label}</div>
                    <div className={`text-xl font-bold ${color}`}>{value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Daily volume line chart */}
            <Card className="bg-white/5 border-white/10 mb-4">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs text-white/50 font-medium">Daily Auction Volume & GMV</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {analyticsLoading ? (
                  <div className="h-36 flex items-center justify-center text-white/20 text-xs">Loading...</div>
                ) : !analytics?.daily?.length ? (
                  <div className="h-36 flex items-center justify-center text-white/20 text-xs">No data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={analytics.daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                      <XAxis dataKey="date" tick={{ fill: "#ffffff33", fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis yAxisId="vol" orientation="left" tick={{ fill: "#ffffff33", fontSize: 9 }} />
                      <YAxis yAxisId="gmv" orientation="right" tick={{ fill: "#ffffff33", fontSize: 9 }} tickFormatter={(v: number) => `$${(v / 100).toFixed(0)}`} />
                      <Tooltip
                        contentStyle={{ background: "#0d1527", border: "1px solid #ffffff14", borderRadius: 6 }}
                        labelStyle={{ color: "#ffffff80", fontSize: 11 }}
                        itemStyle={{ fontSize: 11 }}
                        formatter={(v: number, name: string) => name === "Auctions" ? [v, "Auctions"] : [`$${(v / 100).toFixed(2)}`, "GMV"]}
                      />
                      <Legend wrapperStyle={{ fontSize: 10, color: "#ffffff50" }} />
                      <Line yAxisId="vol" type="monotone" dataKey="auctions" name="Auctions" stroke="#60a5fa" strokeWidth={1.5} dot={false} />
                      <Line yAxisId="gmv" type="monotone" dataKey="gmvCents" name="GMV" stroke="#22c55e" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Top advertisers & publishers */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs text-white/50 font-medium">Top Advertisers</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {!analytics?.topAdvertisers?.length ? (
                    <div className="text-xs text-white/20 py-4 text-center">No data yet</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 text-[10px] text-white/30 mb-1 uppercase">
                        <span>Advertiser</span><span className="text-right">Balance</span><span className="text-right">Total Spend</span>
                      </div>
                      {analytics.topAdvertisers.map((a) => (
                        <div key={a.advertiserId} className="grid grid-cols-3 text-xs">
                          <span className="text-white/60 truncate max-w-[100px]">{a.companyName || a.email}</span>
                          <span className="text-right text-white/40">{formatMoney(a.balanceCents)}</span>
                          <span className="text-right text-blue-400">{formatMoney(a.totalSpendCents)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs text-white/50 font-medium">Top Publishers</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {!analytics?.topPublishers?.length ? (
                    <div className="text-xs text-white/20 py-4 text-center">No data yet</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 text-[10px] text-white/30 mb-1 uppercase">
                        <span>Publisher</span><span className="text-right">Pending</span><span className="text-right">Total Earned</span>
                      </div>
                      {analytics.topPublishers.map((p) => (
                        <div key={p.publisherId} className="grid grid-cols-3 text-xs">
                          <span className="text-white/60 truncate max-w-[100px]">{p.companyName || p.email}</span>
                          <span className="text-right text-white/40">{formatMoney(p.pendingCents)}</span>
                          <span className="text-right text-violet-400">{formatMoney(p.totalEarnedCents)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <Tabs defaultValue="pending" className="space-y-4">
            <TabsList className="bg-white/5 border border-white/10">
              <TabsTrigger value="pending" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
                Ad Review
                {pendingAds.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs">{pendingAds.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="users" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
                Users
              </TabsTrigger>
              <TabsTrigger value="payouts" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
                Payouts
                {pendingPayouts.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded text-xs">{pendingPayouts.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="annotations" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
                Annotations{pendingAnnotations.length > 0 ? ` (${pendingAnnotations.length})` : ""}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              {pendingAds.length === 0 ? (
                <Card className="bg-white/5 border-white/10">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle className="h-10 w-10 text-green-400/40 mb-3" />
                    <p className="text-white/40 text-sm">All caught up! No ads pending review.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {pendingAds.map((ad) => (
                    <Card key={ad.id} className="bg-white/5 border-white/10">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">{ad.headline}</span>
                              <StatusBadge status={ad.status} />
                            </div>
                            {ad.body && <p className="text-sm text-white/50 mb-2">{ad.body}</p>}
                            <div className="flex flex-wrap gap-3 text-xs text-white/30">
                              <span>Advertiser: {ad.advertiserEmail || ad.advertiserId}</span>
                              <span>CPM: {formatMoney(ad.maxCpmCents ?? 0)}</span>
                              <a href={ad.destinationUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                                {ad.destinationUrl}
                              </a>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-3 mt-4">
                          <Button
                            size="sm"
                            onClick={() => reviewAdMutation.mutate({ id: ad.id, status: "approved" })}
                            disabled={reviewAdMutation.isPending}
                            className="bg-green-600 hover:bg-green-500 text-white gap-2"
                          >
                            <CheckCircle className="h-4 w-4" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const reason = window.prompt("Rejection reason:");
                              if (reason !== null) reviewAdMutation.mutate({ id: ad.id, status: "rejected", reason });
                            }}
                            disabled={reviewAdMutation.isPending}
                            className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-2"
                          >
                            <XCircle className="h-4 w-4" /> Reject
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="annotations">
              {pendingAnnotations.length === 0 ? (
                <Card className="bg-white/5 border-white/10">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle className="h-10 w-10 text-green-400/40 mb-3" />
                    <p className="text-white/40 text-sm">All caught up! No community annotations awaiting review.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {pendingAnnotations.map((ann) => (
                    <Card key={ann.id} className="bg-white/5 border-white/10" data-testid={`admin-annotation-${ann.id}`}>
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-medium">{ann.bookTitle ?? ann.bookId}</span>
                          <StatusBadge status={ann.status} />
                          <span className="text-xs text-white/30">Page {ann.page}</span>
                        </div>
                        <p className="text-sm text-white/70 italic mb-1">"{ann.text.slice(0, 200)}{ann.text.length > 200 ? "..." : ""}"</p>
                        <p className="text-sm text-white/50 mb-2">{ann.note}</p>
                        <div className="flex flex-wrap gap-3 text-xs text-white/30">
                          <span>Contributor: {ann.contributorName || ann.contributorId}</span>
                          {ann.createdAt && <span>Submitted {new Date(ann.createdAt).toLocaleDateString()}</span>}
                        </div>
                        <div className="flex gap-3 mt-4">
                          <Button
                            size="sm"
                            onClick={() => reviewAnnotationMutation.mutate({ id: ann.id, action: "approve" })}
                            disabled={reviewAnnotationMutation.isPending}
                            className="bg-green-600 hover:bg-green-500 text-white gap-2"
                            data-testid={`approve-annotation-${ann.id}`}
                          >
                            <CheckCircle className="h-4 w-4" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const reason = window.prompt("Rejection reason (optional):");
                              if (reason !== null) reviewAnnotationMutation.mutate({ id: ann.id, action: "reject", reviewNote: reason || undefined });
                            }}
                            disabled={reviewAnnotationMutation.isPending}
                            className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-2"
                            data-testid={`reject-annotation-${ann.id}`}
                          >
                            <XCircle className="h-4 w-4" /> Reject
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="users">
              <div className="space-y-3">
                {allUsers.length === 0 ? (
                  <Card className="bg-white/5 border-white/10">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <Users className="h-10 w-10 text-white/20 mb-3" />
                      <p className="text-white/40 text-sm">No platform users yet.</p>
                    </CardContent>
                  </Card>
                ) : (
                  allUsers.map((u) => (
                    <Card key={u.id} className="bg-white/5 border-white/10">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${u.role === "advertiser" ? "bg-blue-600/20 text-blue-400" : u.role === "publisher" ? "bg-violet-600/20 text-violet-400" : "bg-red-600/20 text-red-400"}`}>
                            {(u.firstName?.[0] || u.email?.[0] || "?").toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-medium">{u.firstName} {u.lastName} {u.companyName && `· ${u.companyName}`}</div>
                            <div className="text-xs text-white/40">{u.email}</div>
                          </div>
                        </div>
                        <Badge className={`text-xs ${u.role === "advertiser" ? "bg-blue-600/20 text-blue-400 border-blue-500/30" : u.role === "publisher" ? "bg-violet-600/20 text-violet-400 border-violet-500/30" : "bg-red-600/20 text-red-400 border-red-500/30"}`}>
                          {u.role}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="payouts">
              {payouts.length === 0 ? (
                <Card className="bg-white/5 border-white/10">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <DollarSign className="h-10 w-10 text-white/20 mb-3" />
                    <p className="text-white/40 text-sm">No payout requests yet.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {payouts.map((p) => (
                    <Card key={p.id} className="bg-white/5 border-white/10">
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{p.publisherEmail || p.publisherId}</span>
                            <StatusBadge status={p.status} />
                          </div>
                          <div className="text-xs text-white/40">
                            Requested: {formatMoney(p.amountCents)}
                            {p.createdAt && ` · ${new Date(p.createdAt).toLocaleDateString()}`}
                          </div>
                        </div>
                        <div className="text-xl font-bold text-violet-400">{formatMoney(p.amountCents)}</div>
                        {p.status === "pending" && (
                          <div className="flex gap-2 flex-shrink-0">
                            <Button
                              size="sm"
                              onClick={() => payoutActionMutation.mutate({ id: p.id, status: "paid" })}
                              disabled={payoutActionMutation.isPending}
                              className="bg-green-600 hover:bg-green-500 text-white gap-1 text-xs"
                            >
                              <CheckSquare className="h-3.5 w-3.5" /> Mark Paid
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => payoutActionMutation.mutate({ id: p.id, status: "rejected" })}
                              disabled={payoutActionMutation.isPending}
                              className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs gap-1"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
