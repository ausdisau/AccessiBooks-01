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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function formatMoney(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function formatNum(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString(); }

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pending_review: { color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", label: "In Review" },
  approved: { color: "text-green-400 bg-green-400/10 border-green-400/20", label: "Approved" },
  rejected: { color: "text-red-400 bg-red-400/10 border-red-400/20", label: "Rejected" },
  draft: { color: "text-white/50 bg-white/10 border-white/20", label: "Draft" },
  active: { color: "text-green-400 bg-green-400/10 border-green-400/20", label: "Active" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { color: "text-white/50 bg-white/10 border-white/20", label: status };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>{cfg.label}</span>;
}

export default function AdminPlatformDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: pendingAds = [], refetch: refetchAds } = useQuery<any[]>({
    queryKey: ["/api/ad/admin/pending-ads"],
  });

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/ad/admin/users"],
  });

  const { data: platformStats } = useQuery<any>({
    queryKey: ["/api/ad/admin/stats"],
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

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout", {}),
    onSuccess: () => { queryClient.clear(); window.location.href = "/"; },
  });

  const advertisers = allUsers.filter((u: any) => u.role === "advertiser");
  const publishers = allUsers.filter((u: any) => u.role === "publisher");

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
              { icon: DollarSign, label: "Platform Revenue", value: formatMoney(platformStats?.revenueCents ?? 0), color: "text-green-400" },
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
                  {pendingAds.map((ad: any) => (
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
                  allUsers.map((u: any) => (
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
          </Tabs>
        </div>
      </main>
    </div>
  );
}
