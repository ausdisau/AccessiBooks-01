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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Eye, Plus, Zap, DollarSign, TrendingUp, Globe, LogOut, Wallet,
  ChevronRight, ToggleLeft, ToggleRight, MousePointer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AD_CATEGORIES, type AdSlot, type PublisherEarning } from "@shared/schema";

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

export default function PublisherDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [slotOpen, setSlotOpen] = useState(false);

  const { data: slots = [], isLoading: slotsLoading } = useQuery<AdSlot[]>({
    queryKey: ["/api/ad/slots"],
  });

  const { data: earnings } = useQuery<PublisherEarning>({
    queryKey: ["/api/ad/earnings"],
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

  const toggleSlotMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/ad/slots/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ad/slots"] }),
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout", {}),
    onSuccess: () => { queryClient.clear(); window.location.href = "/"; },
  });

  const totalImpressions = slots.reduce((s, slot) => s + (slot.totalImpressions ?? 0), 0);
  const totalEarned = earnings?.totalEarnedCents ?? 0;
  const pending = earnings?.pendingCents ?? 0;
  const paidOut = earnings?.paidOutCents ?? 0;

  const AD_SIZES = [
    { label: "Leaderboard (728×90)", w: 728, h: 90 },
    { label: "Medium Rectangle (300×250)", w: 300, h: 250 },
    { label: "Wide Skyscraper (160×600)", w: 160, h: 600 },
    { label: "Billboard (970×250)", w: 970, h: 250 },
    { label: "Custom", w: 0, h: 0 },
  ];

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
            <Dialog open={slotOpen} onOpenChange={setSlotOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
                  <Plus className="h-4 w-4" /> New Ad Slot
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#0d1527] border-white/10 text-white max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-white">Create Ad Slot</DialogTitle>
                </DialogHeader>
                <form onSubmit={slotForm.handleSubmit((d) => createSlotMutation.mutate(d))} className="space-y-4 mt-2">
                  <div>
                    <Label className="text-white/70 text-sm">Slot Name</Label>
                    <Input {...slotForm.register("name")} placeholder="Homepage Banner" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                    {slotForm.formState.errors.name && <p className="text-red-400 text-xs mt-1">{slotForm.formState.errors.name.message}</p>}
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Website URL</Label>
                    <Input {...slotForm.register("websiteUrl")} type="url" placeholder="https://yoursite.com" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                    {slotForm.formState.errors.websiteUrl && <p className="text-red-400 text-xs mt-1">{slotForm.formState.errors.websiteUrl.message}</p>}
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Content Category</Label>
                    <Select onValueChange={(v) => slotForm.setValue("category", v)} defaultValue="other">
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
                          slotForm.setValue("width", size.w);
                          slotForm.setValue("height", size.h);
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
                      <Input {...slotForm.register("width")} type="number" className="mt-1 bg-white/5 border-white/10 text-white" />
                    </div>
                    <div>
                      <Label className="text-white/70 text-sm">Height (px)</Label>
                      <Input {...slotForm.register("height")} type="number" className="mt-1 bg-white/5 border-white/10 text-white" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-white/70 text-sm">Floor CPM Price ($) — min bid to win</Label>
                    <Input {...slotForm.register("minCpmCents")} type="number" step="0.1" placeholder="0.50" className="mt-1 bg-white/5 border-white/10 text-white" />
                  </div>
                  <Button type="submit" disabled={createSlotMutation.isPending} className="w-full bg-violet-600 hover:bg-violet-500 text-white">
                    {createSlotMutation.isPending ? "Creating..." : "Create Ad Slot"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

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

          {/* Payout button */}
          {pending > 0 && (
            <div className="mb-6 p-4 rounded-lg bg-violet-600/10 border border-violet-500/30 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">You have {formatMoney(pending)} available for payout</div>
                <div className="text-xs text-white/40 mt-0.5">Minimum payout: $10.00</div>
              </div>
              <Button size="sm" className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
                Request Payout
              </Button>
            </div>
          )}

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
                  <Card key={slot.id} className="bg-white/5 border-white/10 hover:bg-white/8 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-violet-600/20 flex items-center justify-center">
                            <Globe className="h-4 w-4 text-violet-400" />
                          </div>
                          <div>
                            <div className="font-medium text-sm">{slot.name}</div>
                            <div className="text-xs text-white/40">
                              {slot.width}×{slot.height} · {slot.category?.replace(/_/g, " ")} · Floor: {formatMoney(slot.minCpmCents ?? 0)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right text-xs">
                            <div className="text-white/40">Impressions</div>
                            <div className="font-medium">{formatNum(slot.totalImpressions ?? 0)}</div>
                          </div>
                          <div className="text-right text-xs">
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
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Integration snippet */}
          {slots.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">Integration</h2>
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <p className="text-sm text-white/50 mb-3">Add this script tag to your site to display ads in your slot:</p>
                  <pre className="bg-black/40 rounded p-3 text-xs text-green-300 overflow-x-auto whitespace-pre-wrap">
{`<script src="https://adbid.io/serve.js"
  data-slot="${slots[0].id}"
  async>
</script>`}
                  </pre>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
