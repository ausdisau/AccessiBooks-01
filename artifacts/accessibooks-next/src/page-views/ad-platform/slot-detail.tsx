import { useParams } from "@/lib/wouter-compat";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/wouter-compat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, Globe, Zap, Copy, CheckCircle, Eye, MousePointer,
  DollarSign, Calendar, ToggleLeft, ToggleRight, Code
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { AdSlot } from "@shared/schema";

type AdSlotWithEmbed = AdSlot & { embedSnippet?: string };

function formatMoney(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function formatDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function SlotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: slot, isLoading, isError } = useQuery<AdSlotWithEmbed>({
    queryKey: ["/api/ad/slots", id],
    queryFn: async () => {
      const r = await fetch(`/api/ad/slots/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error(`Failed to fetch slot: ${r.status}`);
      return r.json();
    },
  });

  function copySnippet() {
    const snippet = slot?.embedSnippet ?? `<script src="https://adbid.io/serve.js" data-slot="${id}" async></script>`;
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      toast({ title: "Embed snippet copied!" });
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-500" />
      </div>
    );
  }

  if (isError || !slot) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white flex flex-col items-center justify-center gap-4">
        <p className="text-white/60">Slot not found or you don't have access.</p>
        <Link href="/ad-platform/publisher">
          <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const snippet = slot.embedSnippet ?? `<script src="https://adbid.io/serve.js" data-slot="${id}" async></script>`;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-4xl mx-auto p-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/ad-platform/publisher">
            <button className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm">
              <ArrowLeft className="h-4 w-4" /> Back to Publisher Dashboard
            </button>
          </Link>
        </div>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{slot.name}</h1>
            <div className="flex items-center gap-2 mt-2">
              <a href={slot.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-violet-400 hover:text-violet-300 text-sm transition-colors">
                <Globe className="h-3.5 w-3.5" /> {slot.websiteUrl}
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {slot.isActive ? (
              <Badge className="bg-green-500/10 text-green-400 border-green-500/20 flex items-center gap-1">
                <ToggleRight className="h-3 w-3" /> Active
              </Badge>
            ) : (
              <Badge className="bg-white/5 text-white/40 border-white/10 flex items-center gap-1">
                <ToggleLeft className="h-3 w-3" /> Inactive
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Eye, label: "Impressions", value: (slot.totalImpressions ?? 0).toLocaleString() },
            { icon: MousePointer, label: "Clicks", value: (slot.totalImpressions && slot.totalImpressions > 0 ? "—" : "0") },
            { icon: DollarSign, label: "Earned", value: formatMoney(slot.totalEarningsCents ?? 0) },
            { icon: Zap, label: "Floor CPM", value: formatMoney(slot.minCpmCents ?? 0) },
          ].map(({ icon: Icon, label, value }) => (
            <Card key={label} className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
                  <Icon className="h-3.5 w-3.5" /> {label}
                </div>
                <div className="text-xl font-bold text-white">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/60 font-medium">Slot Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-white/40">Category</span>
                <span className="text-white capitalize">{slot.category?.replace(/_/g, " ") || "Other"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Dimensions</span>
                <span className="text-white">{slot.width}×{slot.height}px</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Floor CPM</span>
                <span className="text-white">{formatMoney(slot.minCpmCents ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Status</span>
                <span className={slot.isActive ? "text-green-400" : "text-white/40"}>{slot.isActive ? "Active" : "Inactive"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Created</span>
                <span className="text-white">{formatDate(slot.createdAt)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/60 font-medium flex items-center gap-2">
                <Code className="h-3.5 w-3.5" /> Embed Snippet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-white/40 mb-3">Paste this script tag in your site's HTML where you want the ad to appear:</p>
              <pre className="bg-black/40 rounded p-3 text-xs text-green-300 overflow-x-auto whitespace-pre-wrap break-all mb-3">
                {snippet}
              </pre>
              <Button
                onClick={copySnippet}
                size="sm"
                variant="outline"
                className="w-full border-white/20 text-white hover:bg-white/10 gap-2"
              >
                {copied ? <CheckCircle className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy Embed Snippet"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-start">
          <Link href="/ad-platform/publisher">
            <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
