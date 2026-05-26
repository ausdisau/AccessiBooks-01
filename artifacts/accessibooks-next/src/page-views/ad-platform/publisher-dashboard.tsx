import { useState, useCallback } from "react";
import { Link } from "@/lib/wouter-compat";
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
import {
  Eye, Plus, Zap, DollarSign, TrendingUp, Globe, LogOut, Wallet,
  ToggleLeft, ToggleRight, MousePointer, Edit2, Trash2, Copy, ChevronDown, ChevronRight,
  RefreshCw, Send, ChevronsUpDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AD_CATEGORIES, type AdSlot, type PublisherEarning } from "@shared/schema";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

type AdSlotWithEmbed = AdSlot & { embedSnippet?: string };

const slotSchema = z.object({
  name: z.string().min(1, "Slot name required"),
  websiteUrl: z.string().url("Enter a valid URL"),
  category: z.string().min(1, "Category required"),
  width: z.coerce.number().min(100, "Min width 100px").max(2000, "Max width 2000px"),
  height: z.coerce.number().min(50, "Min height 50px").max(2000, "Max height 2000px"),
  minCpmCents: z.coerce.number().min(0, "Min floor price $0"),
});

type SlotForm = z.infer<typeof slotSchema>;

function formatMoney(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function formatNum(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString(); }

function embedSnippet(slotId: string) {
  return `<script src="https://adbid.io/serve.js"\n  data-slot="${slotId}"\n  async>\n</script>`;
}

const AD_SIZES = [
  { label: "Leaderboard (728×90)", w: 728, h: 90 },
  { label: "Medium Rectangle (300×250)", w: 300, h: 250 },
  { label: "Wide Skyscraper (160×600)", w: 160, h: 600 },
  { label: "Billboard (970×250)", w: 970, h: 250 },
  { label: "Custom", w: 0, h: 0 },
];

type SlotSortKey = "name" | "totalImpressions" | "totalEarningsCents";
type SortDir = "asc" | "desc";

export default function PublisherDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [slotOpen, setSlotOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<AdSlot | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [slotSort, setSlotSort] = useState<{ key: SlotSortKey; dir: SortDir }>({ key: "totalEarningsCents", dir: "desc" });

  const handleSlotSort = useCallback((key: SlotSortKey) => {
    setSlotSort(prev => ({ key, dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc" }));
  }, []);

  function buildAnalyticsUrl(base: string) {
    if (customFrom && customTo) return `${base}?from=${customFrom}&to=${customTo}`;
    return `${base}?days=${days}`;
  }

  const { data: slots = [], isLoading: slotsLoading } = useQuery<AdSlotWithEmbed[]>({
    queryKey: ["/api/ad/slots"],
  });

  const { data: earnings } = useQuery<PublisherEarning>({
    queryKey: ["/api/ad/earnings"],
  });

  // Live per-placement metrics (impressions, fill rate, completion rate) for
  // the new in-content placements. Server endpoint groups by ad_type over the
  // last 30 days. Fail-soft: returns an empty list rather than breaking the UI.
  const { data: placementMetrics } = useQuery<{
    placements: Array<{
      adType: string;
      impressions: number;
      completions: number;
      skips: number;
      completionRate: number;
      fillRate: number;
      paidImpressions: number;
    }>;
    windowDays: number;
  }>({
    queryKey: ["/api/ads/placement-metrics"],
    refetchInterval: 60000,
    staleTime: 50000,
  });

  const { data: analytics, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery<{
    earnings: PublisherEarning | null;
    slots: Array<{ id: string; name: string; totalImpressions: number; totalEarningsCents: number }>;
    daily: Array<{ date: string; impressions: number; earningsCents: number }>;
  }>({
    queryKey: ["/api/analytics/publisher", days, customFrom, customTo],
    queryFn: () => fetch(buildAnalyticsUrl("/api/analytics/publisher")).then(r => r.json()),
    refetchInterval: 30000,
    staleTime: 25000,
  });

  const payoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ad/publisher/payout", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ad/earnings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/publisher"] });
      toast({ title: "Payout requested!", description: "Your payout request has been submitted for admin review." });
    },
    onError: (e: Error) => toast({ title: "Payout failed", description: e.message, variant: "destructive" }),
  });

  const slotForm = useForm<SlotForm>({
    resolver: zodResolver(slotSchema),
    defaultValues: { name: "", websiteUrl: "https://", category: "other", width: 728, height: 90, minCpmCents: 0 },
  });

  const createSlotMutation = useMutation({
    mutationFn: (data: SlotForm) => apiRequest("POST", "/api/ad/slots", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ad/slots"] });
      slotForm.reset({ name: "", websiteUrl: "https://", category: "other", width: 728, height: 90, minCpmCents: 0 });
      setSlotOpen(false);
      toast({ title: "Ad slot created!" });
    },
    onError: () => toast({ title: "Failed to create slot", variant: "destructive" }),
  });

  const updateSlotMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SlotForm> }) =>
      apiRequest("PATCH", `/api/ad/slots/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ad/slots"] });
      setEditingSlot(null);
      toast({ title: "Slot updated!" });
    },
    onError: () => toast({ title: "Failed to update slot", variant: "destructive" }),
  });

  const toggleSlotMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/ad/slots/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ad/slots"] }),
  });

  const deleteSlotMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ad/slots/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ad/slots"] });
      setDeleteConfirm(null);
      toast({ title: "Slot deleted" });
    },
    onError: () => toast({ title: "Failed to delete slot", variant: "destructive" }),
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout", {}),
    onSuccess: () => { queryClient.clear(); window.location.href = "/"; },
  });

  const liveEarnings = analytics?.earnings ?? earnings ?? null;
  const totalImpressions = slots.reduce((s, slot) => s + (slot.totalImpressions ?? 0), 0);
  const totalEarned = liveEarnings?.totalEarnedCents ?? 0;
  const pending = liveEarnings?.pendingCents ?? 0;
  const paidOut = liveEarnings?.paidOutCents ?? 0;

  function openEditSlot(slot: AdSlot) {
    setEditingSlot(slot);
    slotForm.reset({ name: slot.name, websiteUrl: slot.websiteUrl, category: slot.category, width: slot.width, height: slot.height, minCpmCents: slot.minCpmCents ?? 0 });
  }

  function getSnippet(slot: AdSlotWithEmbed) {
    return slot.embedSnippet ?? embedSnippet(slot.id);
  }

  function copyEmbed(slot: AdSlotWithEmbed) {
    navigator.clipboard.writeText(getSnippet(slot)).then(() => {
      toast({ title: "Embed snippet copied to clipboard!" });
    });
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white flex">
      {/* Sidebar */}
      <aside className="w-60 border-r border-white/10 flex flex-col py-6 px-4 flex-shrink-0">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-bold">AdBid</span>
          <Badge className="text-[9px] bg-violet-600/20 text-violet-400 border-violet-500/30 ml-auto">Publisher</Badge>
        </div>

        <nav className="space-y-1 flex-1">
          {[
            { icon: TrendingUp, label: "Dashboard", active: true },
            { icon: Globe, label: "Ad Slots" },
            { icon: DollarSign, label: "Earnings" },
            { icon: Wallet, label: "Payouts" },
          ].map(({ icon: Icon, label, active }) => (
            <button key={label} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-violet-600/20 text-violet-300" : "text-white/50 hover:text-white hover:bg-white/5"}`}>
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

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-5xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold">Dashboard</h1>
              <p className="text-white/40 text-sm mt-1">Welcome back, {user?.firstName || "Publisher"}</p>
            </div>

            {/* Create Slot dialog */}
            <Dialog open={slotOpen && !editingSlot} onOpenChange={(v) => { if (!v) { setSlotOpen(false); slotForm.reset(); } else setSlotOpen(true); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
                  <Plus className="h-4 w-4" /> New Ad Slot
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#0d1527] border-white/10 text-white max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-white">Create Ad Slot</DialogTitle>
                </DialogHeader>
                <SlotFormFields
                  form={slotForm}
                  onSubmit={(d) => createSlotMutation.mutate(d)}
                  isPending={createSlotMutation.isPending}
                  submitLabel="Create Ad Slot"
                />
              </DialogContent>
            </Dialog>
          </div>

          {/* Edit Slot dialog */}
          <Dialog open={!!editingSlot} onOpenChange={(v) => { if (!v) setEditingSlot(null); }}>
            <DialogContent className="bg-[#0d1527] border-white/10 text-white max-w-md">
              <DialogHeader>
                <DialogTitle className="text-white">Edit Ad Slot</DialogTitle>
              </DialogHeader>
              <SlotFormFields
                form={slotForm}
                onSubmit={(d) => editingSlot && updateSlotMutation.mutate({ id: editingSlot.id, data: d })}
                isPending={updateSlotMutation.isPending}
                submitLabel="Save Changes"
              />
            </DialogContent>
          </Dialog>

          {/* Delete confirm dialog */}
          <Dialog open={!!deleteConfirm} onOpenChange={(v) => { if (!v) setDeleteConfirm(null); }}>
            <DialogContent className="bg-[#0d1527] border-white/10 text-white max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-white">Delete Ad Slot?</DialogTitle>
              </DialogHeader>
              <p className="text-white/60 text-sm mt-2">This will permanently delete this ad slot and its impression history. This cannot be undone.</p>
              <div className="flex gap-3 mt-4">
                <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10 flex-1" onClick={() => setDeleteConfirm(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-500 text-white flex-1"
                  onClick={() => deleteConfirm && deleteSlotMutation.mutate(deleteConfirm)}
                  disabled={deleteSlotMutation.isPending}
                >
                  Delete
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Earnings stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              { icon: DollarSign, label: "Total Earned", value: formatMoney(totalEarned), color: "text-violet-400" },
              { icon: Wallet, label: "Pending", value: formatMoney(pending), color: "text-yellow-400" },
              { icon: TrendingUp, label: "Paid Out", value: formatMoney(paidOut), color: "text-green-400" },
              { icon: Eye, label: "Total Impressions", value: formatNum(totalImpressions), color: "text-white/60" },
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

          {/* Analytics Section */}
          <div className="mb-8">
            <div className="flex items-center flex-wrap gap-2 mb-4">
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider flex-shrink-0 mr-2">Analytics</h2>
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => { setDays(d); setCustomFrom(""); setCustomTo(""); }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${days === d && !customFrom ? "bg-violet-600/30 text-violet-300 border border-violet-500/30" : "text-white/40 hover:text-white/70"}`}
                >
                  {d}d
                </button>
              ))}
              <div className="flex items-center gap-1 ml-1">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-1.5 py-0.5 rounded text-xs bg-white/5 border border-white/10 text-white/60 focus:border-violet-500/50 focus:outline-none w-28"
                />
                <span className="text-white/30 text-xs">–</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-1.5 py-0.5 rounded text-xs bg-white/5 border border-white/10 text-white/60 focus:border-violet-500/50 focus:outline-none w-28"
                />
              </div>
              <button onClick={() => refetchAnalytics()} className="p-1 text-white/30 hover:text-white/60 ml-auto" title="Refresh">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              {/* Daily earnings area chart */}
              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs text-white/50 font-medium">Earnings per Day</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {analyticsLoading ? (
                    <div className="h-32 flex items-center justify-center text-white/20 text-xs">Loading...</div>
                  ) : !analytics?.daily?.length ? (
                    <div className="h-32 flex items-center justify-center text-white/20 text-xs">No data yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={120}>
                      <AreaChart data={analytics.daily} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                        <XAxis dataKey="date" tick={{ fill: "#ffffff33", fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fill: "#ffffff33", fontSize: 9 }} tickFormatter={(v: number) => `$${(v / 100).toFixed(0)}`} />
                        <Tooltip
                          contentStyle={{ background: "#0d1527", border: "1px solid #ffffff14", borderRadius: 6 }}
                          labelStyle={{ color: "#ffffff80", fontSize: 11 }}
                          itemStyle={{ color: "#a78bfa", fontSize: 11 }}
                          formatter={(v: number) => [`$${(v / 100).toFixed(2)}`, "Earnings"]}
                        />
                        <Area type="monotone" dataKey="earningsCents" stroke="#7c3aed" strokeWidth={1.5} fill="url(#earningsGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Slot breakdown table */}
              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs text-white/50 font-medium">Slot Performance</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {analyticsLoading ? (
                    <div className="h-32 flex items-center justify-center text-white/20 text-xs">Loading...</div>
                  ) : !analytics?.slots?.length ? (
                    <div className="h-32 flex items-center justify-center text-white/20 text-xs">No data yet</div>
                  ) : (
                    <div className="mt-1 max-h-40 overflow-y-auto">
                      <table className="w-full text-xs" role="table" aria-label="Slot performance">
                        <caption className="sr-only">Ad slot performance showing impressions and earnings per slot, sortable by column header</caption>
                        <thead>
                          <tr>
                            {([
                              { key: "name" as SlotSortKey, label: "Slot", align: "left" },
                              { key: "totalImpressions" as SlotSortKey, label: "Impr.", align: "right" },
                              { key: "totalEarningsCents" as SlotSortKey, label: "Earned", align: "right" },
                            ] as const).map(col => (
                              <th
                                key={col.key}
                                scope="col"
                                className={`text-[10px] text-white/30 uppercase pb-1 ${col.align === "right" ? "text-right" : "text-left"} cursor-pointer hover:text-white/60 select-none`}
                                onClick={() => handleSlotSort(col.key)}
                                aria-sort={slotSort.key === col.key ? (slotSort.dir === "asc" ? "ascending" : "descending") : "none"}
                              >
                                <span className="inline-flex items-center gap-0.5">
                                  {col.label}
                                  {slotSort.key === col.key
                                    ? <span className="text-violet-400" aria-hidden="true">{slotSort.dir === "asc" ? "↑" : "↓"}</span>
                                    : <ChevronsUpDown className="h-2.5 w-2.5 opacity-30" aria-hidden="true" />
                                  }
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...analytics.slots]
                            .sort((a, b) => {
                              const aVal = a[slotSort.key];
                              const bVal = b[slotSort.key];
                              if (typeof aVal === "string" && typeof bVal === "string") {
                                return slotSort.dir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                              }
                              return slotSort.dir === "asc"
                                ? (aVal as number) - (bVal as number)
                                : (bVal as number) - (aVal as number);
                            })
                            .map((s) => (
                              <tr key={s.id} className="border-t border-white/5">
                                <td className="py-1 text-white/60 truncate max-w-[100px]">{s.name}</td>
                                <td className="py-1 text-right text-white/40 tabular-nums">{formatNum(s.totalImpressions)}</td>
                                <td className="py-1 text-right text-violet-400 tabular-nums">{formatMoney(s.totalEarningsCents)}</td>
                              </tr>
                            ))
                          }
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Payout button */}
          {pending > 0 && (
            <div className="mb-6 p-4 rounded-lg bg-violet-600/10 border border-violet-500/30 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">You have {formatMoney(pending)} available for payout</div>
                <div className="text-xs text-white/40 mt-0.5">Minimum payout: $10.00</div>
              </div>
              <Button
                size="sm"
                onClick={() => payoutMutation.mutate()}
                disabled={payoutMutation.isPending || pending < 1000}
                className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
              >
                <Send className="h-3.5 w-3.5" />
                {payoutMutation.isPending ? "Requesting..." : "Request Payout"}
              </Button>
            </div>
          )}

          {/* In-app Placements (read-only) */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-1">In-App Placements</h2>
            <p className="text-xs text-white/30 mb-4">AccessiBooks fills these placements on Free-tier readers automatically. Your registered slots participate via the bidding system.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { id: "audio-postroll", label: "Audio Post-Roll", desc: "Plays after audiobook finishes", tier: "Free only", badge: "Audio" },
                { id: "ebook-interstitial", label: "Ebook Interstitial", desc: "Full-page between chapters (3 s min)", tier: "Free only", badge: "Display" },
                { id: "ebook-banner", label: "Reading Banner", desc: "Sticky bottom banner while reading", tier: "Free only", badge: "Display" },
                { id: "ebook-end-of-chapter", label: "End-of-Chapter Card", desc: "Sponsored card at chapter completion", tier: "Free only", badge: "Display" },
              ].map(({ id, label, desc, tier, badge }) => {
                // Match placement id ↔ ad_event_logs.ad_type. The client records
                // hyphen-cased ad types (e.g. "post-roll"); the server stores
                // ad_type with the same casing the client sent. Match flexibly.
                const metric = placementMetrics?.placements.find((p) =>
                  p.adType === id ||
                  p.adType.replace(/-/g, "") === id.replace(/-/g, "") ||
                  (id === "audio-postroll" && (p.adType === "post-roll" || p.adType === "postroll"))
                );
                return (
                <Card key={id} className="bg-white/5 border-white/10">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{label}</span>
                          <Badge className={`text-[9px] ${badge === "Audio" ? "bg-blue-600/20 text-blue-300 border-blue-500/30" : "bg-violet-600/20 text-violet-300 border-violet-500/30"}`}>{badge}</Badge>
                        </div>
                        <p className="text-xs text-white/40">{desc}</p>
                      </div>
                      <Badge className="text-[9px] bg-yellow-600/20 text-yellow-300 border-yellow-500/30 whitespace-nowrap">{tier}</Badge>
                    </div>
                    {metric && (
                      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                        <div>
                          <div className="text-white/40">Impressions</div>
                          <div className="text-white font-medium">{formatNum(metric.impressions)}</div>
                        </div>
                        <div>
                          <div className="text-white/40">Fill Rate</div>
                          <div className="text-white font-medium">{(metric.fillRate * 100).toFixed(0)}%</div>
                        </div>
                        <div>
                          <div className="text-white/40">Completion</div>
                          <div className="text-white font-medium">{(metric.completionRate * 100).toFixed(0)}%</div>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 text-[10px] text-white/30 font-mono break-all">{id}</div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          </div>

          {/* Ad slots */}
          <div>
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">Ad Slots</h2>
            {slotsLoading ? (
              <div className="text-center py-12 text-white/30">Loading slots...</div>
            ) : slots.length === 0 ? (
              <Card className="bg-white/5 border-white/10 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Globe className="h-10 w-10 text-white/20 mb-3" />
                  <p className="text-white/40 text-sm mb-4">No ad slots yet. Register your first slot to start earning.</p>
                  <Button size="sm" onClick={() => setSlotOpen(true)} className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
                    <Plus className="h-4 w-4" /> Create Ad Slot
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {slots.map((slot) => (
                  <Card key={slot.id} className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-violet-600/20 flex items-center justify-center flex-shrink-0">
                            <Globe className="h-4 w-4 text-violet-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm">{slot.name}</div>
                            <div className="text-xs text-white/40">
                              {slot.width}×{slot.height} · {slot.category?.replace(/_/g, " ")} · Floor: {formatMoney(slot.minCpmCents ?? 0)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right text-xs hidden sm:block">
                            <div className="text-white/40">Impressions</div>
                            <div className="font-medium">{formatNum(slot.totalImpressions ?? 0)}</div>
                          </div>
                          <div className="text-right text-xs hidden sm:block">
                            <div className="text-white/40">Earned</div>
                            <div className="font-medium text-violet-400">{formatMoney(slot.totalEarningsCents ?? 0)}</div>
                          </div>
                          <button
                            onClick={() => toggleSlotMutation.mutate({ id: slot.id, isActive: !slot.isActive })}
                            className={`transition-colors ${slot.isActive ? "text-green-400 hover:text-green-300" : "text-white/30 hover:text-white/50"}`}
                            title={slot.isActive ? "Active — click to pause" : "Paused — click to activate"}
                          >
                            {slot.isActive ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                          </button>
                          <button
                            onClick={() => openEditSlot(slot)}
                            className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
                            title="Edit slot"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(slot.id)}
                            className="p-1.5 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                            title="Delete slot"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <Link href={`/ad-platform/slots/${slot.id}`}>
                            <button
                              className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
                              title="View slot details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </Link>
                          <button
                            onClick={() => setExpandedSlot(expandedSlot === slot.id ? null : slot.id)}
                            className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
                            title="Show embed snippet"
                          >
                            {expandedSlot === slot.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Per-slot embed snippet */}
                      {expandedSlot === slot.id && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-white/50">Integration snippet — paste into your site's HTML:</p>
                            <button
                              onClick={() => copyEmbed(slot)}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-violet-400 hover:bg-violet-500/10 transition-colors"
                            >
                              <Copy className="h-3 w-3" /> Copy
                            </button>
                          </div>
                          <pre className="bg-black/40 rounded p-3 text-xs text-green-300 overflow-x-auto whitespace-pre">
                            {getSnippet(slot)}
                          </pre>
                          <div className="mt-2 sm:hidden grid grid-cols-2 gap-2 text-xs">
                            <div><div className="text-white/40">Impressions</div><div className="font-medium">{formatNum(slot.totalImpressions ?? 0)}</div></div>
                            <div><div className="text-white/40">Earned</div><div className="font-medium text-violet-400">{formatMoney(slot.totalEarningsCents ?? 0)}</div></div>
                          </div>
                        </div>
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

function SlotFormFields({ form, onSubmit, isPending, submitLabel }: {
  form: ReturnType<typeof useForm<SlotForm>>;
  onSubmit: (d: SlotForm) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
      <div>
        <Label className="text-white/70 text-sm">Slot Name</Label>
        <Input {...form.register("name")} placeholder="Homepage Banner" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
        {form.formState.errors.name && <p className="text-red-400 text-xs mt-1">{form.formState.errors.name.message}</p>}
      </div>
      <div>
        <Label className="text-white/70 text-sm">Website URL</Label>
        <Input {...form.register("websiteUrl")} type="url" placeholder="https://yoursite.com" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
        {form.formState.errors.websiteUrl && <p className="text-red-400 text-xs mt-1">{form.formState.errors.websiteUrl.message}</p>}
      </div>
      <div>
        <Label className="text-white/70 text-sm">Content Category</Label>
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
      <div>
        <Label className="text-white/70 text-sm">Ad Size</Label>
        <Select
          onValueChange={(v) => {
            const size = AD_SIZES.find((s) => `${s.w}x${s.h}` === v);
            if (size && size.w > 0) {
              form.setValue("width", size.w);
              form.setValue("height", size.h);
            }
          }}
          defaultValue="728x90"
        >
          <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#0d1527] border-white/10 text-white">
            {AD_SIZES.map((s) => (
              <SelectItem key={s.label} value={`${s.w}x${s.h}`} className="focus:bg-white/10">{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-white/70 text-sm">Width (px)</Label>
          <Input {...form.register("width")} type="number" className="mt-1 bg-white/5 border-white/10 text-white" />
          {form.formState.errors.width && <p className="text-red-400 text-xs mt-1">{form.formState.errors.width.message}</p>}
        </div>
        <div>
          <Label className="text-white/70 text-sm">Height (px)</Label>
          <Input {...form.register("height")} type="number" className="mt-1 bg-white/5 border-white/10 text-white" />
          {form.formState.errors.height && <p className="text-red-400 text-xs mt-1">{form.formState.errors.height.message}</p>}
        </div>
      </div>
      <div>
        <Label className="text-white/70 text-sm">Floor CPM Price ($) — min bid to win</Label>
        <Input {...form.register("minCpmCents")} type="number" step="0.1" placeholder="0.50" className="mt-1 bg-white/5 border-white/10 text-white" />
      </div>
      <Button type="submit" disabled={isPending} className="w-full bg-violet-600 hover:bg-violet-500 text-white">
        {isPending ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
