import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, RefreshCw, ArrowLeft, Zap, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ServedAd {
  noFill: boolean;
  impressionId?: string;
  ad?: {
    id: string;
    headline: string;
    body?: string;
    imageUrl?: string;
    destinationUrl: string;
    clickUrl: string;
  };
}

interface DemoSlot {
  id: string;
  name: string;
  category: string;
  width: number;
  height: number;
}

function AdSlotPreview({ slotId, width, height }: { slotId: string; width: number; height: number }) {
  const [adData, setAdData] = useState<ServedAd | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auctionTime, setAuctionTime] = useState<number | null>(null);

  const fetchAd = async () => {
    setLoading(true);
    setError(null);
    setAdData(null);
    const start = Date.now();
    try {
      const r = await fetch(`/api/serve/${slotId}`);
      const elapsed = Date.now() - start;
      setAuctionTime(elapsed);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: ServedAd = await r.json();
      setAdData(data);
    } catch (e: any) {
      setError(e.message || "Failed to fetch ad");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAd();
  }, [slotId]);

  const containerStyle: React.CSSProperties = {
    width: Math.min(width, 728),
    minHeight: Math.min(height, 250),
    border: "2px dashed #334155",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    overflow: "hidden",
    position: "relative",
  };

  return (
    <div>
      <div style={containerStyle}>
        {loading && (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">Running auction…</span>
          </div>
        )}
        {error && (
          <div className="text-red-400 text-xs px-4 text-center">{error}</div>
        )}
        {!loading && !error && adData?.noFill && (
          <div className="text-slate-500 text-xs px-4 text-center">
            No eligible ads (no fill) — approve an ad and set its campaign to "active" to see it here.
          </div>
        )}
        {!loading && !error && adData && !adData.noFill && adData.ad && (
          <a
            href={adData.ad.clickUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full h-full p-4 hover:bg-slate-800 transition-colors"
          >
            {adData.ad.imageUrl ? (
              <img
                src={adData.ad.imageUrl}
                alt={adData.ad.headline}
                style={{ maxWidth: "100%", maxHeight: height - 16 }}
                className="mx-auto rounded"
              />
            ) : (
              <div>
                <p className="text-white font-semibold text-sm">{adData.ad.headline}</p>
                {adData.ad.body && (
                  <p className="text-slate-300 text-xs mt-1">{adData.ad.body}</p>
                )}
                <p className="text-blue-400 text-xs mt-2 underline">
                  {adData.ad.destinationUrl}
                </p>
              </div>
            )}
            <div
              style={{
                position: "absolute",
                bottom: 4,
                right: 6,
                fontSize: 9,
                color: "#64748b",
              }}
            >
              Ad
            </div>
          </a>
        )}
      </div>

      <div className="flex items-center gap-3 mt-2">
        {auctionTime !== null && (
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Zap className="h-3 w-3" />
            Auction: {auctionTime}ms
          </span>
        )}
        {adData && !adData.noFill && (
          <Badge variant="outline" className="text-green-400 border-green-800 text-xs">
            Ad served
          </Badge>
        )}
        {adData?.noFill && (
          <Badge variant="outline" className="text-slate-400 border-slate-700 text-xs">
            No fill
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-xs h-7 px-2 text-slate-400"
          onClick={fetchAd}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Refresh
        </Button>
      </div>
    </div>
  );
}

export default function DemoSlotPage() {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  // Public endpoint — no auth required
  const { data: slots, isLoading: slotsLoading } = useQuery<DemoSlot[]>({
    queryKey: ["/api/ad/demo-slots"],
    retry: false,
  });

  const firstSlot = slots?.[0];
  const activeSlotId = selectedSlotId ?? firstSlot?.id ?? null;
  const activeSlot = slots?.find((s) => s.id === activeSlotId) ?? firstSlot;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/ad-platform">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Ad Serving Demo</h1>
            <p className="text-slate-400 text-sm">Live end-to-end test of the bidding engine</p>
          </div>
        </div>

        <Alert className="mb-6 border-blue-800 bg-blue-950/40">
          <Info className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-blue-200 text-sm">
            This page simulates a publisher's website. Each slot fetch triggers a real Vickrey (second-price)
            auction against the database. For ads to appear, at least one ad must be{" "}
            <strong>approved</strong> with a campaign in <strong>active</strong> status and a funded wallet.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="bg-[#1e293b] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-100 text-lg">Mock Article Page</CardTitle>
                <CardDescription className="text-slate-400">
                  Simulates a real publisher page with a live ad slot
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="prose prose-invert max-w-none">
                    <h2 className="text-white text-xl font-bold">The Future of Accessible Reading</h2>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      Audiobooks have transformed how millions of people experience literature, offering
                      accessibility to those with visual impairments, reading difficulties, or simply busy
                      schedules. The latest advances in text-to-speech technology and AI narration are
                      pushing the boundaries even further…
                    </p>
                  </div>

                  <div className="border-t border-slate-700 pt-4">
                    <p className="text-xs text-slate-500 mb-2">Advertisement</p>
                    {slotsLoading && (
                      <div className="flex items-center gap-2 text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Loading slot…</span>
                      </div>
                    )}
                    {!slotsLoading && !activeSlotId && (
                      <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center">
                        <p className="text-slate-500 text-sm">
                          No active publisher slots found. A publisher needs to create a slot in the{" "}
                          <Link href="/ad-platform">
                            <span className="text-blue-400 underline cursor-pointer">Publisher Dashboard</span>
                          </Link>{" "}
                          first.
                        </p>
                      </div>
                    )}
                    {!slotsLoading && activeSlotId && activeSlot && (
                      <AdSlotPreview
                        slotId={activeSlotId}
                        width={activeSlot.width}
                        height={activeSlot.height}
                      />
                    )}
                  </div>

                  <div className="prose prose-invert max-w-none">
                    <p className="text-slate-300 text-sm leading-relaxed">
                      Platform developers are now integrating real-time bidding systems that allow advertisers
                      to reach readers at precisely the right moment — while ensuring publishers receive
                      competitive revenue through transparent, second-price auctions…
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="bg-[#1e293b] border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-slate-100 text-base">Available Slots</CardTitle>
              </CardHeader>
              <CardContent>
                {slotsLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                {!slotsLoading && (!slots || slots.length === 0) && (
                  <p className="text-slate-500 text-sm">No active slots available</p>
                )}
                {slots && slots.length > 0 && (
                  <div className="space-y-2">
                    {slots.map((slot) => (
                      <button
                        key={slot.id}
                        onClick={() => setSelectedSlotId(slot.id)}
                        className={`w-full text-left p-2 rounded-lg text-sm border transition-colors ${
                          activeSlotId === slot.id
                            ? "bg-blue-900/40 border-blue-600 text-blue-200"
                            : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        <div className="font-medium truncate">{slot.name}</div>
                        <div className="text-xs text-slate-500">
                          {slot.width}×{slot.height} · {slot.category}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-[#1e293b] border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-slate-100 text-base">How it works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-slate-400">
                <div className="flex gap-2">
                  <span className="text-blue-400 font-bold shrink-0">1.</span>
                  <span>The slot calls <code className="text-blue-300">/api/serve/:slotId</code></span>
                </div>
                <div className="flex gap-2">
                  <span className="text-blue-400 font-bold shrink-0">2.</span>
                  <span>Server runs a Vickrey auction — highest bidder wins, pays second-highest price</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-blue-400 font-bold shrink-0">3.</span>
                  <span>Auction row + impression row written; advertiser wallet debited</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-blue-400 font-bold shrink-0">4.</span>
                  <span>Creative JSON returned; embed script renders the ad</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-blue-400 font-bold shrink-0">5.</span>
                  <span>Clicking the ad hits <code className="text-blue-300">/api/click/:impressionId</code> → redirect</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Link href="/ad-platform" className="flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-slate-600 text-slate-300 hover:bg-slate-800"
                >
                  Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
