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
import { Separator } from "@/components/ui/separator";
import {
  type LucideIcon,
  BarChart3, Plus, Zap, TrendingUp, Eye, MousePointer, DollarSign,
  LogOut, Settings, Target, Play, Pause, ChevronRight, Wallet, Building2,
  Clock, CheckCircle, XCircle, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AD_CATEGORIES, type AdCampaign, type DisplayAd, type AdvertiserWallet } from "@shared/schema";

const campaignSchema = z.object({
  name: z.string().min(1, "Campaign name required"),
  category: z.string().min(1, "Category required"),
  budgetCents: z.coerce.number().min(500, "Minimum $5 total budget"),
  cpmBidCents: z.coerce.number().min(50, "Minimum $0.50 CPM"),
});

const adSchema = z.object({
  campaignId: z.string().min(1),
  headline: z.string().min(3, "Headline required"),
  body: z.string().optional(),
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

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<AdCampaign[]>({
    queryKey: ["/api/ad/campaigns"],
  });

  const { data: displayAds = [] } = useQuery<DisplayAd[]>({
    queryKey: ["/api/ad/display-ads"],
  });

  const { data: wallet } = useQuery<AdvertiserWallet>({
    queryKey: ["/api/ad/wallet"],
  });

  const campaignForm = useForm<CampaignForm>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { name: "", category: "other", budgetCents: 10000, cpmBidCents: 200 },
  });

  const adForm = useForm<AdForm>({
    resolver: zodResolver(adSchema),
    defaultValues: { campaignId: "", headline: "", body: "", destinationUrl: "https://", maxCpmCents: 200 },
  });

  const createCampaignMutation = useMutation({
    mutationFn: (data: CampaignForm) => apiRequest("POST", "/api/ad/campaigns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ad/campaigns"] });
      campaignForm.reset();
      setCampaignOpen(false);
      toast({ title: "Campaign created!" });
    },
    onError: () => toast({ title: "Failed to create campaign", variant: "destructive" }),
  });

  const createAdMutation = useMutation({
    mutationFn: (data: AdForm) => apiRequest("POST", "/api/ad/display-ads", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ad/display-ads"] });
      adForm.reset();
      setAdOpen(false);
      toast({ title: "Ad submitted for review!" });
    },
    onError: () => toast({ title: "Failed to submit ad", variant: "destructive" }),
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout", {}),
    onSuccess: () => { queryClient.clear(); window.location.href = "/"; },
  });

  const totalImpressions = displayAds.reduce((s, a) => s + (a.impressionCount ?? 0), 0);
  const totalClicks = displayAds.reduce((s, a) => s + (a.clickCount ?? 0), 0);
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00";

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
              <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10 gap-2">
                    <Plus className="h-4 w-4" /> New Campaign
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#0d1527] border-white/10 text-white max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-white">Create Campaign</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={campaignForm.handleSubmit((d) => createCampaignMutation.mutate(d))} className="space-y-4 mt-2">
                    <div>
                      <Label className="text-white/70 text-sm">Campaign Name</Label>
                      <Input {...campaignForm.register("name")} placeholder="Q4 Brand Awareness" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                      {campaignForm.formState.errors.name && <p className="text-red-400 text-xs mt-1">{campaignForm.formState.errors.name.message}</p>}
                    </div>
                    <div>
                      <Label className="text-white/70 text-sm">Category</Label>
                      <Select onValueChange={(v) => campaignForm.setValue("category", v)} defaultValue="other">
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
                    <div>
                      <Label className="text-white/70 text-sm">Total Budget ($)</Label>
                      <Input {...campaignForm.register("budgetCents")} type="number" placeholder="100" className="mt-1 bg-white/5 border-white/10 text-white" />
                      {campaignForm.formState.errors.budgetCents && <p className="text-red-400 text-xs mt-1">{campaignForm.formState.errors.budgetCents.message}</p>}
                    </div>
                    <div>
                      <Label className="text-white/70 text-sm">Max CPM Bid ($)</Label>
                      <Input {...campaignForm.register("cpmBidCents")} type="number" step="0.1" placeholder="2.00" className="mt-1 bg-white/5 border-white/10 text-white" />
                    </div>
                    <Button type="submit" disabled={createCampaignMutation.isPending} className="w-full bg-blue-600 hover:bg-blue-500 text-white">
                      {createCampaignMutation.isPending ? "Creating..." : "Create Campaign"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={adOpen} onOpenChange={setAdOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                    <Plus className="h-4 w-4" /> New Ad
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#0d1527] border-white/10 text-white max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-white">Create Ad</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={adForm.handleSubmit((d) => createAdMutation.mutate(d))} className="space-y-4 mt-2">
                    <div>
                      <Label className="text-white/70 text-sm">Campaign</Label>
                      <Select onValueChange={(v) => adForm.setValue("campaignId", v)}>
                        <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                          <SelectValue placeholder="Select a campaign" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0d1527] border-white/10 text-white">
                          {campaigns.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="focus:bg-white/10">{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-white/70 text-sm">Headline</Label>
                      <Input {...adForm.register("headline")} placeholder="Discover something amazing" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                      {adForm.formState.errors.headline && <p className="text-red-400 text-xs mt-1">{adForm.formState.errors.headline.message}</p>}
                    </div>
                    <div>
                      <Label className="text-white/70 text-sm">Body Text (optional)</Label>
                      <Textarea {...adForm.register("body")} placeholder="Short description of your offer..." className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none" rows={2} />
                    </div>
                    <div>
                      <Label className="text-white/70 text-sm">Destination URL</Label>
                      <Input {...adForm.register("destinationUrl")} type="url" placeholder="https://yoursite.com/landing" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                      {adForm.formState.errors.destinationUrl && <p className="text-red-400 text-xs mt-1">{adForm.formState.errors.destinationUrl.message}</p>}
                    </div>
                    <div>
                      <Label className="text-white/70 text-sm">Max CPM Bid ($)</Label>
                      <Input {...adForm.register("maxCpmCents")} type="number" step="0.1" placeholder="2.00" className="mt-1 bg-white/5 border-white/10 text-white" />
                    </div>
                    <Button type="submit" disabled={createAdMutation.isPending} className="w-full bg-blue-600 hover:bg-blue-500 text-white">
                      {createAdMutation.isPending ? "Submitting..." : "Submit for Review"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Wallet */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <Card className="bg-blue-600/10 border-blue-500/30 col-span-2 sm:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Wallet className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-blue-300">Wallet Balance</span>
                </div>
                <div className="text-2xl font-bold">{wallet ? formatMoney(wallet.balanceCents) : "$0.00"}</div>
                <Button size="sm" className="mt-3 w-full bg-blue-600/40 hover:bg-blue-600/60 text-blue-200 text-xs border border-blue-500/30">
                  Top Up
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
                  <Card key={c.id} className="bg-white/5 border-white/10 hover:bg-white/8 transition-colors cursor-pointer" onClick={() => setSelectedCampaign(c.id === selectedCampaign ? null : c.id)}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
                            <Target className="h-4 w-4 text-blue-400" />
                          </div>
                          <div>
                            <div className="font-medium text-sm">{c.name}</div>
                            <div className="text-xs text-white/40 capitalize">{c.category?.replace(/_/g, " ")} · Daily: {formatMoney(c.dailyBudgetCents ?? 0)}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={c.status} />
                          <ChevronRight className={`h-4 w-4 text-white/30 transition-transform ${selectedCampaign === c.id ? "rotate-90" : ""}`} />
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
                        <div className="font-medium text-sm leading-snug">{ad.headline}</div>
                        <StatusBadge status={ad.status} />
                      </div>
                      {ad.body && <p className="text-xs text-white/40 mb-3 line-clamp-2">{ad.body}</p>}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div><div className="text-white/30">Impressions</div><div className="font-medium">{formatNum(ad.impressionCount ?? 0)}</div></div>
                        <div><div className="text-white/30">Clicks</div><div className="font-medium">{formatNum(ad.clickCount ?? 0)}</div></div>
                        <div><div className="text-white/30">Max CPM</div><div className="font-medium">{formatMoney(ad.maxCpmCents ?? 0)}</div></div>
                      </div>
                      {ad.rejectionReason && (
                        <div className="mt-3 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-300">{ad.rejectionReason}</div>
                      )}
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
