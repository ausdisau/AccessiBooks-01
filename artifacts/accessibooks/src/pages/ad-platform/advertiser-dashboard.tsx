/**
 * pages/ad-platform/advertiser-dashboard.tsx — Display Ad Bidding Platform (AdBid)
 *
 * This dashboard is for users with role="advertiser" in the AdBid display-ad marketplace.
 * Manages display ad campaigns (with image/text creatives), ad wallet top-ups,
 * and analytics. Only accessible in the /ad-platform section.
 * API: /api/ad/*
 *
 * NOT to be confused with components/advertiser-dashboard.tsx, which handles audio
 * self-serve ads for regular app users at /advertise.
 * API: /api/self-serve-ads/*
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  type LucideIcon,
  BarChart3, Plus, Zap, TrendingUp, Eye, MousePointer,
  LogOut, Target, Play, Pause, ChevronRight, Wallet,
  Clock, CheckCircle, XCircle, AlertCircle, Edit2, Trash2,
  Image, RefreshCw, DollarSign, CreditCard,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AD_CATEGORIES, type AdCampaign, type DisplayAd, type AdvertiserWallet } from "@shared/schema";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";

const campaignSchema = z.object({
  name: z.string().min(1, "Campaign name required"),
  category: z.string().min(1, "Category required"),
  budgetCents: z.coerce.number().min(500, "Minimum $5 total budget"),
  dailyBudgetCents: z.coerce.number().min(0).default(0),
  cpmBidCents: z.coerce.number().min(50, "Minimum $0.50 CPM"),
  startDate: z.string().optional().or(z.literal("")),
  endDate: z.string().optional().or(z.literal("")),
});

const adSchema = z.object({
  campaignId: z.string().min(1, "Select a campaign"),
  headline: z.string().min(3, "Headline required"),
  body: z.string().optional(),
  imageUrl: z.string().url("Enter a valid image URL").optional().or(z.literal("")),
  destinationUrl: z.string().url("Enter a valid URL"),
  maxCpmCents: z.coerce.number().min(50, "Minimum $0.50 CPM"),
});

type CampaignForm = z.infer<typeof campaignSchema>;
type AdForm = z.infer<typeof adSchema>;

function formatMoney(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function formatNum(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString(); }

const STATUS_CONFIG: Record<string, { color: string; icon: LucideIcon; label: string }> = {
  draft: { color: "text-white/50 bg-white/10", icon: Clock, label: "Draft" },
  pending_review: { color: "text-yellow-400 bg-yellow-400/10", icon: AlertCircle, label: "In Review" },
  approved: { color: "text-green-400 bg-green-400/10", icon: CheckCircle, label: "Approved" },
  active: { color: "text-green-400 bg-green-400/10", icon: Play, label: "Active" },
  rejected: { color: "text-red-400 bg-red-400/10", icon: XCircle, label: "Rejected" },
  paused: { color: "text-orange-400 bg-orange-400/10", icon: Pause, label: "Paused" },
  completed: { color: "text-blue-400 bg-blue-400/10", icon: CheckCircle, label: "Completed" },
  archived: { color: "text-white/30 bg-white/5", icon: Clock, label: "Archived" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { color: "text-white/50 bg-white/10", icon: Clock, label: status };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

export default function AdvertiserDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [adOpen, setAdOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<AdCampaign | null>(null);
  const [editingAd, setEditingAd] = useState<DisplayAd | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "campaign" | "ad"; id: string } | null>(null);

  const [days, setDays] = useState(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [topupOpen, setTopupOpen] = useState(false);

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<AdCampaign[]>({
    queryKey: ["/api/ad/campaigns"],
  });

  const { data: displayAds = [] } = useQuery<DisplayAd[]>({
    queryKey: ["/api/ad/display-ads"],
  });

  const { data: wallet } = useQuery<AdvertiserWallet>({
    queryKey: ["/api/ad/wallet"],
  });

  function buildAnalyticsUrl(base: string) {
    if (customFrom && customTo) return `${base}?from=${customFrom}&to=${customTo}`;
    return `${base}?days=${days}`;
  }

  const { data: analytics, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery<{
    totals: { impressions: number; clicks: number; spentCents: number };
    campaigns: Array<{ id: string; name: string; status: string; impressions: number; clicks: number; spentCents: number; budgetCents: number }>;
    daily: Array<{ date: string; impressions: number; clicks: number; spentCents: number }>;
    wallet: AdvertiserWallet | null;
  }>({
    queryKey: ["/api/analytics/advertiser", days, customFrom, customTo],
    queryFn: () => fetch(buildAnalyticsUrl("/api/analytics/advertiser")).then(r => r.json()),
    refetchInterval: 30000,
    staleTime: 25000,
  });

  const topupMutation = useMutation({
    mutationFn: (amountCents: number) =>
      apiRequest("POST", "/api/billing/ad-topup", { amountCents }).then(r => r.json()),
    onSuccess: (data: { checkoutUrl: string }) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    },
    onError: (e: Error) => toast({ title: "Top-up failed", description: e.message, variant: "destructive" }),
  });

  const TOPUP_PRESETS = [
    { label: "$10", cents: 1000 },
    { label: "$25", cents: 2500 },
    { label: "$50", cents: 5000 },
    { label: "$100", cents: 10000 },
    { label: "$250", cents: 25000 },
    { label: "$500", cents: 50000 },
  ];

  const campaignForm = useForm<CampaignForm>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { name: "", category: "other", budgetCents: 10000, dailyBudgetCents: 0, cpmBidCents: 200, startDate: "", endDate: "" },
  });

  const adForm = useForm<AdForm>({
    resolver: zodResolver(adSchema),
    defaultValues: { campaignId: "", headline: "", body: "", imageUrl: "", destinationUrl: "https://", maxCpmCents: 200 },
  });

  function prepareCampaignPayload(data: CampaignForm) {
    return {
      ...data,
      startDate: data.startDate ? new Date(data.startDate).toISOString() : null,
      endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
    };
  }

  const createCampaignMutation = useMutation({
    mutationFn: (data: CampaignForm) => apiRequest("POST", "/api/ad/campaigns", prepareCampaignPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ad/campaigns"] });
      campaignForm.reset();
      setCampaignOpen(false);
      toast({ title: "Campaign created!" });
    },
    onError: () => toast({ title: "Failed to create campaign", variant: "destructive" }),
  });

  const updateCampaignMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CampaignForm> }) =>
      apiRequest("PATCH", `/api/ad/campaigns/${id}`, prepareCampaignPayload(data as CampaignForm)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ad/campaigns"] });
      setEditingCampaign(null);
      toast({ title: "Campaign updated!" });
    },
    onError: () => toast({ title: "Failed to update campaign", variant: "destructive" }),
  });

  const pauseResumeCampaignMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/ad/campaigns/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ad/campaigns"] }),
    onError: () => toast({ title: "Failed to update campaign status", variant: "destructive" }),
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ad/campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ad/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ad/display-ads"] });
      setDeleteConfirm(null);
      setSelectedCampaign(null);
      toast({ title: "Campaign deleted" });
    },
    onError: () => toast({ title: "Failed to delete campaign", variant: "destructive" }),
  });

  const createAdMutation = useMutation({
    mutationFn: (data: AdForm) => apiRequest("POST", "/api/ad/display-ads", { ...data, imageUrl: data.imageUrl || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ad/display-ads"] });
      adForm.reset();
      setAdOpen(false);
      toast({ title: "Ad submitted for review!" });
    },
    onError: () => toast({ title: "Failed to submit ad", variant: "destructive" }),
  });

  type AdUpdatePayload = Partial<AdForm> & { status?: "paused" | "pending_review" };
  const updateAdMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AdUpdatePayload }) =>
      apiRequest("PATCH", `/api/ad/display-ads/${id}`, { ...data, imageUrl: data.imageUrl || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ad/display-ads"] });
      setEditingAd(null);
      toast({ title: "Ad updated and resubmitted for review!" });
    },
    onError: () => toast({ title: "Failed to update ad", variant: "destructive" }),
  });

  const pauseResumeAdMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/ad/display-ads/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ad/display-ads"] }),
    onError: () => toast({ title: "Failed to update ad status", variant: "destructive" }),
  });

  const deleteAdMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ad/display-ads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ad/display-ads"] });
      setDeleteConfirm(null);
      toast({ title: "Ad deleted" });
    },
    onError: () => toast({ title: "Failed to delete ad", variant: "destructive" }),
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout", {}),
    onSuccess: () => { queryClient.clear(); window.location.href = "/"; },
  });

  const liveWallet = analytics?.wallet ?? wallet ?? null;
  const totalImpressions = analytics?.totals.impressions ?? displayAds.reduce((s, a) => s + (a.impressionCount ?? 0), 0);
  const totalClicks = analytics?.totals.clicks ?? displayAds.reduce((s, a) => s + (a.clickCount ?? 0), 0);
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00";
  const totalSpentCents = analytics?.totals.spentCents ?? 0;

  // Budget burn rate: sum of (spent / budget) across active campaigns, capped at 100%
  const totalBudgetCents = (analytics?.campaigns ?? []).reduce((s, c) => s + c.budgetCents, 0);
  const burnRatePct = totalBudgetCents > 0 ? Math.min(100, (totalSpentCents / totalBudgetCents) * 100) : 0;

  function openEditCampaign(c: AdCampaign) {
    setEditingCampaign(c);
    campaignForm.reset({
      name: c.name,
      category: c.category ?? "other",
      budgetCents: c.budgetCents ?? 0,
      dailyBudgetCents: c.dailyBudgetCents ?? 0,
      cpmBidCents: c.cpmBidCents ?? 0,
      startDate: c.startDate ? new Date(c.startDate).toISOString().slice(0, 10) : "",
      endDate: c.endDate ? new Date(c.endDate).toISOString().slice(0, 10) : "",
    });
  }

  function openEditAd(ad: DisplayAd) {
    setEditingAd(ad);
    adForm.reset({ campaignId: ad.campaignId, headline: ad.headline, body: ad.body ?? "", imageUrl: ad.imageUrl ?? "", destinationUrl: ad.destinationUrl, maxCpmCents: ad.maxCpmCents ?? 0 });
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white flex">
      {/* Sidebar */}
      <aside className="w-60 border-r border-white/10 flex flex-col py-6 px-4 flex-shrink-0">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-bold">AdBid</span>
          <Badge className="text-[9px] bg-blue-600/20 text-blue-400 border-blue-500/30 ml-auto">Advertiser</Badge>
        </div>

        <nav className="space-y-1 flex-1">
          {[
            { icon: BarChart3, label: "Dashboard", active: true },
            { icon: Target, label: "Campaigns" },
            { icon: Eye, label: "Ads" },
            { icon: Wallet, label: "Wallet" },
          ].map(({ icon: Icon, label, active }) => (
            <button key={label} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-blue-600/20 text-blue-300" : "text-white/50 hover:text-white hover:bg-white/5"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>

        <div className="border-t border-white/10 pt-4 mt-4 space-y-1">
          <div className="px-3 py-2 text-xs text-white/30">
            <div className="font-medium text-white/60 truncate">{user?.companyName || user?.email}</div>
            <div className="truncate">{user?.email}</div>
          </div>
          <button
            onClick={() => logoutMutation.mutate()}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-5xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold">Dashboard</h1>
              <p className="text-white/40 text-sm mt-1">Welcome back, {user?.firstName || "Advertiser"}</p>
            </div>
            <div className="flex gap-3">
              {/* Create Campaign dialog */}
              <Dialog open={campaignOpen && !editingCampaign} onOpenChange={(v) => { if (!v) { setCampaignOpen(false); campaignForm.reset(); } else setCampaignOpen(true); }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10 gap-2">
                    <Plus className="h-4 w-4" /> New Campaign
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#0d1527] border-white/10 text-white max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-white">Create Campaign</DialogTitle>
                  </DialogHeader>
                  <CampaignForm
                    form={campaignForm}
                    onSubmit={(d) => createCampaignMutation.mutate(d)}
                    isPending={createCampaignMutation.isPending}
                    submitLabel="Create Campaign"
                  />
                </DialogContent>
              </Dialog>

              {/* Create Ad dialog */}
              <Dialog open={adOpen && !editingAd} onOpenChange={(v) => { if (!v) { setAdOpen(false); adForm.reset(); } else setAdOpen(true); }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                    <Plus className="h-4 w-4" /> New Ad
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#0d1527] border-white/10 text-white max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-white">Create Ad</DialogTitle>
                  </DialogHeader>
                  <AdFormFields
                    form={adForm}
                    campaigns={campaigns}
                    onSubmit={(d) => createAdMutation.mutate(d)}
                    isPending={createAdMutation.isPending}
                    submitLabel="Submit for Review"
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Edit Campaign dialog */}
          <Dialog open={!!editingCampaign} onOpenChange={(v) => { if (!v) setEditingCampaign(null); }}>
            <DialogContent className="bg-[#0d1527] border-white/10 text-white max-w-md">
              <DialogHeader>
                <DialogTitle className="text-white">Edit Campaign</DialogTitle>
              </DialogHeader>
              <CampaignForm
                form={campaignForm}
                onSubmit={(d) => editingCampaign && updateCampaignMutation.mutate({ id: editingCampaign.id, data: d })}
                isPending={updateCampaignMutation.isPending}
                submitLabel="Save Changes"
              />
            </DialogContent>
          </Dialog>

          {/* Edit Ad dialog */}
          <Dialog open={!!editingAd} onOpenChange={(v) => { if (!v) setEditingAd(null); }}>
            <DialogContent className="bg-[#0d1527] border-white/10 text-white max-w-md">
              <DialogHeader>
                <DialogTitle className="text-white">Edit Ad</DialogTitle>
              </DialogHeader>
              <AdFormFields
                form={adForm}
                campaigns={campaigns}
                showCampaignSelect={false}
                onSubmit={(d) => editingAd && updateAdMutation.mutate({ id: editingAd.id, data: { ...d, status: "pending_review" } })}
                isPending={updateAdMutation.isPending}
                submitLabel="Save & Resubmit"
              />
            </DialogContent>
          </Dialog>

          {/* Delete confirm dialog */}
          <Dialog open={!!deleteConfirm} onOpenChange={(v) => { if (!v) setDeleteConfirm(null); }}>
            <DialogContent className="bg-[#0d1527] border-white/10 text-white max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-white">Confirm Delete</DialogTitle>
              </DialogHeader>
              <p className="text-white/60 text-sm mt-2">
                {deleteConfirm?.type === "campaign"
                  ? "Delete this campaign and all its ads? This cannot be undone."
                  : "Delete this ad? This cannot be undone."}
              </p>
              <div className="flex gap-3 mt-4">
                <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10 flex-1" onClick={() => setDeleteConfirm(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-500 text-white flex-1"
                  onClick={() => {
                    if (deleteConfirm?.type === "campaign") deleteCampaignMutation.mutate(deleteConfirm.id);
                    else if (deleteConfirm?.type === "ad") deleteAdMutation.mutate(deleteConfirm.id);
                  }}
                  disabled={deleteCampaignMutation.isPending || deleteAdMutation.isPending}
                >
                  Delete
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Top-up Dialog */}
          <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
            <DialogContent className="bg-[#0d1527] border-white/10 text-white max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-white flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-blue-400" /> Add Wallet Credits
                </DialogTitle>
              </DialogHeader>
              <div className="mt-2">
                <p className="text-white/50 text-sm mb-4">Choose a credit amount. You will be redirected to Stripe to complete payment securely.</p>
                <div className="grid grid-cols-3 gap-2">
                  {TOPUP_PRESETS.map(({ label, cents }) => (
                    <Button
                      key={cents}
                      variant="outline"
                      size="sm"
                      disabled={topupMutation.isPending}
                      onClick={() => topupMutation.mutate(cents)}
                      className="border-white/20 text-white hover:bg-blue-600/30 hover:border-blue-400"
                    >
                      {topupMutation.isPending ? "..." : label}
                    </Button>
                  ))}
                </div>
                <p className="text-white/30 text-xs mt-3 text-center">Credits are added instantly after payment</p>
              </div>
            </DialogContent>
          </Dialog>

          {/* Wallet stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <Card className="bg-blue-600/10 border-blue-500/30 col-span-2 sm:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Wallet className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-blue-300">Wallet Balance</span>
                </div>
                <div className="text-2xl font-bold">{liveWallet ? formatMoney(liveWallet.balanceCents) : "$0.00"}</div>
                {liveWallet && liveWallet.totalSpendCents > 0 && (
                  <div className="text-xs text-white/30 mt-1">Total spent: {formatMoney(liveWallet.totalSpendCents)}</div>
                )}
                <Button
                  size="sm"
                  onClick={() => setTopupOpen(true)}
                  className="mt-3 w-full bg-blue-600/40 hover:bg-blue-600/60 text-blue-200 text-xs border border-blue-500/30 gap-1"
                >
                  <CreditCard className="h-3 w-3" /> Top Up
                </Button>
              </CardContent>
            </Card>
            {[
              { icon: Eye, label: "Total Impressions", value: formatNum(totalImpressions), color: "text-white/60" },
              { icon: MousePointer, label: "Total Clicks", value: formatNum(totalClicks), color: "text-white/60" },
              { icon: TrendingUp, label: "CTR", value: `${ctr}%`, color: "text-green-400" },
            ].map(({ icon: Icon, label, value, color }) => (
              <Card key={label} className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className="h-4 w-4 text-white/40" />
                    <span className="text-sm text-white/40">{label}</span>
                  </div>
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Analytics Section */}
          <div className="mb-8">
            <div className="flex items-center flex-wrap gap-2 mb-4">
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider flex-shrink-0 mr-2">Analytics</h2>
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => { setDays(d); setCustomFrom(""); setCustomTo(""); }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${days === d && !customFrom ? "bg-blue-600/30 text-blue-300 border border-blue-500/30" : "text-white/40 hover:text-white/70"}`}
                >
                  {d}d
                </button>
              ))}
              <div className="flex items-center gap-1 ml-1">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-1.5 py-0.5 rounded text-xs bg-white/5 border border-white/10 text-white/60 focus:border-blue-500/50 focus:outline-none w-28"
                  placeholder="From"
                />
                <span className="text-white/30 text-xs">–</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-1.5 py-0.5 rounded text-xs bg-white/5 border border-white/10 text-white/60 focus:border-blue-500/50 focus:outline-none w-28"
                  placeholder="To"
                />
              </div>
              <button onClick={() => refetchAnalytics()} className="p-1 text-white/30 hover:text-white/60 ml-auto" title="Refresh">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              {/* Daily impressions bar chart */}
              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs text-white/50 font-medium">Impressions per Day</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {analyticsLoading ? (
                    <div className="h-32 flex items-center justify-center text-white/20 text-xs">Loading...</div>
                  ) : !analytics?.daily?.length ? (
                    <div className="h-32 flex items-center justify-center text-white/20 text-xs">No data yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={analytics.daily} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                        <XAxis dataKey="date" tick={{ fill: "#ffffff33", fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fill: "#ffffff33", fontSize: 9 }} />
                        <Tooltip
                          contentStyle={{ background: "#0d1527", border: "1px solid #ffffff14", borderRadius: 6 }}
                          labelStyle={{ color: "#ffffff80", fontSize: 11 }}
                          itemStyle={{ color: "#60a5fa", fontSize: 11 }}
                        />
                        <Bar dataKey="impressions" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Campaign spend breakdown bar chart */}
              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs text-white/50 font-medium">Campaign Spend</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {analyticsLoading ? (
                    <div className="h-32 flex items-center justify-center text-white/20 text-xs">Loading...</div>
                  ) : !analytics?.campaigns?.length ? (
                    <div className="h-32 flex items-center justify-center text-white/20 text-xs">No campaigns yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={128}>
                      <BarChart
                        data={analytics.campaigns.slice(0, 6).map((c) => ({
                          name: c.name.length > 12 ? c.name.slice(0, 12) + "…" : c.name,
                          spentCents: c.spentCents,
                        }))}
                        margin={{ top: 0, right: 4, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                        <XAxis dataKey="name" tick={{ fill: "#ffffff33", fontSize: 8 }} />
                        <YAxis tick={{ fill: "#ffffff33", fontSize: 9 }} tickFormatter={(v: number) => `$${(v / 100).toFixed(0)}`} />
                        <Tooltip
                          contentStyle={{ background: "#0d1527", border: "1px solid #ffffff14", borderRadius: 6 }}
                          labelStyle={{ color: "#ffffff80", fontSize: 11 }}
                          formatter={(v: number) => [`$${(v / 100).toFixed(2)}`, "Spent"]}
                        />
                        <Bar dataKey="spentCents" name="Spent" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Period Spend", value: formatMoney(totalSpentCents), icon: DollarSign, color: "text-red-400" },
                { label: "Wallet Loaded", value: liveWallet ? formatMoney(liveWallet.totalTopupCents) : "$0.00", icon: CreditCard, color: "text-blue-400" },
                { label: "Balance", value: liveWallet ? formatMoney(liveWallet.balanceCents) : "$0.00", icon: Wallet, color: liveWallet && liveWallet.balanceCents < 500 ? "text-red-400" : "text-green-400" },
              ].map(({ label, value, icon: Icon, color }) => (
                <Card key={label} className="bg-white/5 border-white/10">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className={`h-3.5 w-3.5 ${color}`} />
                      <span className="text-xs text-white/40">{label}</span>
                    </div>
                    <div className={`text-lg font-bold ${color}`}>{value}</div>
                  </CardContent>
                </Card>
              ))}
              {/* Budget burn rate card */}
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className={`h-3.5 w-3.5 ${burnRatePct > 80 ? "text-red-400" : burnRatePct > 50 ? "text-yellow-400" : "text-blue-400"}`} />
                    <span className="text-xs text-white/40">Budget Burn</span>
                  </div>
                  <div className={`text-lg font-bold ${burnRatePct > 80 ? "text-red-400" : burnRatePct > 50 ? "text-yellow-400" : "text-blue-400"}`}>
                    {burnRatePct.toFixed(1)}%
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${burnRatePct > 80 ? "bg-red-500" : burnRatePct > 50 ? "bg-yellow-500" : "bg-blue-500"}`}
                      style={{ width: `${burnRatePct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-white/30 mt-1">{formatMoney(totalSpentCents)} / {formatMoney(totalBudgetCents)}</div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Campaigns */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">Campaigns</h2>
            {campaignsLoading ? (
              <div className="text-center py-12 text-white/30">Loading campaigns...</div>
            ) : campaigns.length === 0 ? (
              <Card className="bg-white/5 border-white/10 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Target className="h-10 w-10 text-white/20 mb-3" />
                  <p className="text-white/40 text-sm mb-4">No campaigns yet. Create your first campaign to start reaching your audience.</p>
                  <Button size="sm" onClick={() => setCampaignOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                    <Plus className="h-4 w-4" /> Create Campaign
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {campaigns.map((c) => (
                  <Card key={c.id} className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div
                          className="flex items-center gap-3 flex-1 cursor-pointer"
                          onClick={() => setSelectedCampaign(c.id === selectedCampaign ? null : c.id)}
                        >
                          <div className="h-8 w-8 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                            <Target className="h-4 w-4 text-blue-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm">{c.name}</div>
                            <div className="text-xs text-white/40 capitalize">{c.category?.replace(/_/g, " ")} · Budget: {formatMoney(c.budgetCents ?? 0)}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <StatusBadge status={c.status} />
                          <button
                            onClick={() => openEditCampaign(c)}
                            className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
                            title="Edit campaign"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => pauseResumeCampaignMutation.mutate({ id: c.id, status: c.status === "paused" ? "active" : "paused" })}
                            className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
                            title={c.status === "paused" ? "Resume campaign" : "Pause campaign"}
                          >
                            {c.status === "paused" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ type: "campaign", id: c.id })}
                            className="p-1.5 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                            title="Delete campaign"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <ChevronRight
                            className={`h-4 w-4 text-white/30 transition-transform cursor-pointer ${selectedCampaign === c.id ? "rotate-90" : ""}`}
                            onClick={() => setSelectedCampaign(c.id === selectedCampaign ? null : c.id)}
                          />
                        </div>
                      </div>
                      {selectedCampaign === c.id && (
                        <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-4 text-sm">
                          <div><div className="text-white/40 text-xs">Total Budget</div><div className="font-medium">{formatMoney(c.budgetCents ?? 0)}</div></div>
                          <div><div className="text-white/40 text-xs">Max CPM</div><div className="font-medium">{formatMoney(c.cpmBidCents ?? 0)}</div></div>
                          <div><div className="text-white/40 text-xs">Total Spend</div><div className="font-medium">{formatMoney(c.spentCents ?? 0)}</div></div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Ads */}
          <div>
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">Ads</h2>
            {displayAds.length === 0 ? (
              <Card className="bg-white/5 border-white/10 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Eye className="h-10 w-10 text-white/20 mb-3" />
                  <p className="text-white/40 text-sm mb-4">No ads yet. Create an ad to start bidding in auctions.</p>
                  <Button size="sm" onClick={() => setAdOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                    <Plus className="h-4 w-4" /> Create Ad
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {displayAds.map((ad) => (
                  <Card key={ad.id} className="bg-white/5 border-white/10">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="font-medium text-sm leading-snug flex-1">{ad.headline}</div>
                        <StatusBadge status={ad.status} />
                      </div>
                      {ad.imageUrl && (
                        <div className="mb-3 rounded overflow-hidden h-20 bg-white/5 flex items-center justify-center">
                          <img src={ad.imageUrl} alt="Ad creative" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                      )}
                      {ad.body && <p className="text-xs text-white/40 mb-3 line-clamp-2">{ad.body}</p>}
                      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                        <div><div className="text-white/30">Impressions</div><div className="font-medium">{formatNum(ad.impressionCount ?? 0)}</div></div>
                        <div><div className="text-white/30">Clicks</div><div className="font-medium">{formatNum(ad.clickCount ?? 0)}</div></div>
                        <div><div className="text-white/30">Max CPM</div><div className="font-medium">{formatMoney(ad.maxCpmCents ?? 0)}</div></div>
                      </div>
                      {ad.rejectionReason && (
                        <div className="mb-3 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-300">{ad.rejectionReason}</div>
                      )}
                      <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                        <button
                          onClick={() => openEditAd(ad)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                          title="Edit ad"
                        >
                          <Edit2 className="h-3 w-3" /> Edit
                        </button>
                        {(ad.status === "approved" || ad.status === "active") && (
                          <button
                            onClick={() => pauseResumeAdMutation.mutate({ id: ad.id, status: "paused" })}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-white/50 hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
                          >
                            <Pause className="h-3 w-3" /> Pause
                          </button>
                        )}
                        {ad.status === "paused" && (
                          <button
                            onClick={() => pauseResumeAdMutation.mutate({ id: ad.id, status: "pending_review" })}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-white/50 hover:text-green-400 hover:bg-green-500/10 transition-colors"
                            title="Resubmit for admin review"
                          >
                            <Play className="h-3 w-3" /> Resubmit
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteConfirm({ type: "ad", id: ad.id })}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-colors ml-auto"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function CampaignForm({ form, onSubmit, isPending, submitLabel }: {
  form: ReturnType<typeof useForm<CampaignForm>>;
  onSubmit: (d: CampaignForm) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
      <div>
        <Label className="text-white/70 text-sm">Campaign Name</Label>
        <Input {...form.register("name")} placeholder="Q4 Brand Awareness" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
        {form.formState.errors.name && <p className="text-red-400 text-xs mt-1">{form.formState.errors.name.message}</p>}
      </div>
      <div>
        <Label className="text-white/70 text-sm">Category</Label>
        <Select onValueChange={(v) => form.setValue("category", v)} defaultValue={form.getValues("category") || "other"}>
          <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#0d1527] border-white/10 text-white">
            {AD_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="capitalize focus:bg-white/10">{c.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-white/70 text-sm">Total Budget ($)</Label>
          <Input {...form.register("budgetCents")} type="number" placeholder="500" className="mt-1 bg-white/5 border-white/10 text-white" />
          {form.formState.errors.budgetCents && <p className="text-red-400 text-xs mt-1">{form.formState.errors.budgetCents.message}</p>}
        </div>
        <div>
          <Label className="text-white/70 text-sm">Daily Budget ($) <span className="text-white/30 text-xs">optional</span></Label>
          <Input {...form.register("dailyBudgetCents")} type="number" placeholder="0" className="mt-1 bg-white/5 border-white/10 text-white" />
        </div>
      </div>
      <div>
        <Label className="text-white/70 text-sm">Max CPM Bid ($)</Label>
        <Input {...form.register("cpmBidCents")} type="number" step="0.1" placeholder="2.00" className="mt-1 bg-white/5 border-white/10 text-white" />
        {form.formState.errors.cpmBidCents && <p className="text-red-400 text-xs mt-1">{form.formState.errors.cpmBidCents.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-white/70 text-sm">Start Date <span className="text-white/30 text-xs">optional</span></Label>
          <Input {...form.register("startDate")} type="date" className="mt-1 bg-white/5 border-white/10 text-white" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">End Date <span className="text-white/30 text-xs">optional</span></Label>
          <Input {...form.register("endDate")} type="date" className="mt-1 bg-white/5 border-white/10 text-white" />
        </div>
      </div>
      <Button type="submit" disabled={isPending} className="w-full bg-blue-600 hover:bg-blue-500 text-white">
        {isPending ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}

function AdFormFields({ form, campaigns, onSubmit, isPending, submitLabel, showCampaignSelect = true }: {
  form: ReturnType<typeof useForm<AdForm>>;
  campaigns: AdCampaign[];
  onSubmit: (d: AdForm) => void;
  isPending: boolean;
  submitLabel: string;
  showCampaignSelect?: boolean;
}) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
      {showCampaignSelect && (
        <div>
          <Label className="text-white/70 text-sm">Campaign</Label>
          <Select onValueChange={(v) => form.setValue("campaignId", v)} defaultValue={form.getValues("campaignId")}>
            <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Select a campaign" />
            </SelectTrigger>
            <SelectContent className="bg-[#0d1527] border-white/10 text-white">
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id} className="focus:bg-white/10">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.campaignId && <p className="text-red-400 text-xs mt-1">{form.formState.errors.campaignId.message}</p>}
        </div>
      )}
      <div>
        <Label className="text-white/70 text-sm">Headline</Label>
        <Input {...form.register("headline")} placeholder="Discover something amazing" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
        {form.formState.errors.headline && <p className="text-red-400 text-xs mt-1">{form.formState.errors.headline.message}</p>}
      </div>
      <div>
        <Label className="text-white/70 text-sm">Body Text (optional)</Label>
        <Textarea {...form.register("body")} placeholder="Short description of your offer..." className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none" rows={2} />
      </div>
      <div>
        <Label className="text-white/70 text-sm flex items-center gap-1.5">
          <Image className="h-3.5 w-3.5" /> Image URL (optional)
        </Label>
        <Input {...form.register("imageUrl")} type="url" placeholder="https://yoursite.com/banner.jpg" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
        {form.formState.errors.imageUrl && <p className="text-red-400 text-xs mt-1">{form.formState.errors.imageUrl.message}</p>}
      </div>
      <div>
        <Label className="text-white/70 text-sm">Destination URL</Label>
        <Input {...form.register("destinationUrl")} type="url" placeholder="https://yoursite.com/landing" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
        {form.formState.errors.destinationUrl && <p className="text-red-400 text-xs mt-1">{form.formState.errors.destinationUrl.message}</p>}
      </div>
      <div>
        <Label className="text-white/70 text-sm">Max CPM Bid ($)</Label>
        <Input {...form.register("maxCpmCents")} type="number" step="0.1" placeholder="2.00" className="mt-1 bg-white/5 border-white/10 text-white" />
        {form.formState.errors.maxCpmCents && <p className="text-red-400 text-xs mt-1">{form.formState.errors.maxCpmCents.message}</p>}
      </div>
      <Button type="submit" disabled={isPending} className="w-full bg-blue-600 hover:bg-blue-500 text-white">
        {isPending ? "Submitting..." : submitLabel}
      </Button>
    </form>
  );
}
