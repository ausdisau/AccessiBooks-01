import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Target, DollarSign, Zap, Shield, Globe, ArrowRight, TrendingUp, Users, Eye, ChevronRight } from "lucide-react";
import AdAuthModal from "./auth-modal";

const FEATURES = [
  {
    icon: Target,
    title: "Precision Targeting",
    description: "Reach exactly the right audience with category-level targeting across thousands of publisher sites.",
  },
  {
    icon: Zap,
    title: "Real-Time Bidding",
    description: "Second-price auction engine ensures you never overpay. Compete fairly and win more impressions.",
  },
  {
    icon: BarChart3,
    title: "Live Analytics",
    description: "Track impressions, clicks, CTR, and spend in real-time. Optimise campaigns with full transparency.",
  },
  {
    icon: DollarSign,
    title: "Flexible Budgets",
    description: "Set daily and total budgets with full control. Top up your wallet and pause anytime.",
  },
  {
    icon: Shield,
    title: "Brand Safety",
    description: "Admin-reviewed creatives and category whitelisting keep your brand protected.",
  },
  {
    icon: Globe,
    title: "Publisher Network",
    description: "Access a growing network of premium publisher slots across tech, finance, health, and more.",
  },
];

const STATS = [
  { value: "12M+", label: "Monthly Impressions" },
  { value: "3,200+", label: "Active Publishers" },
  { value: "$0.85", label: "Avg. CPM" },
  { value: "99.9%", label: "Auction Uptime" },
];

export default function AdPlatformLanding() {
  const [, navigate] = useLocation();
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [defaultRole, setDefaultRole] = useState<"advertiser" | "publisher">("advertiser");

  const openAdvertiser = () => {
    setDefaultRole("advertiser");
    setAuthMode("register");
  };

  const openPublisher = () => {
    setDefaultRole("publisher");
    setAuthMode("register");
  };

  const openLogin = () => {
    setAuthMode("login");
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      {/* Nav */}
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0a0f1e]/95 backdrop-blur z-40">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">AdBid</span>
          <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-400 ml-1">PLATFORM</Badge>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10" onClick={openLogin}>
            Sign In
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white" onClick={() => setAuthMode("register")}>
            Get Started
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-24 pb-20 text-center max-w-5xl mx-auto">
        <Badge className="mb-6 bg-blue-600/20 text-blue-400 border-blue-500/30 hover:bg-blue-600/20">
          Real-Time Bidding Platform
        </Badge>
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
          Buy & Sell Ad Space
          <br />
          <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            in Real Time
          </span>
        </h1>
        <p className="text-xl text-white/60 max-w-2xl mx-auto mb-10">
          AdBid connects advertisers with premium publisher inventory through transparent,
          second-price auctions. Launch campaigns in minutes.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white px-8 gap-2 text-base h-12" onClick={openAdvertiser}>
            Start Advertising <ArrowRight className="h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 px-8 gap-2 text-base h-12" onClick={openPublisher}>
            Monetise Your Site <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-white/10 py-12">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-3xl font-bold text-white mb-1">{s.value}</div>
              <div className="text-sm text-white/50">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Everything you need to run great ad campaigns</h2>
          <p className="text-white/50 text-lg">Built for performance marketers and publishers who demand transparency.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <Card key={f.title} className="bg-white/5 border-white/10 hover:bg-white/8 transition-colors">
              <CardContent className="p-6">
                <div className="h-10 w-10 rounded-lg bg-blue-600/20 flex items-center justify-center mb-4">
                  <f.icon className="h-5 w-5 text-blue-400" />
                </div>
                <h3 className="font-semibold mb-2 text-white">{f.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{f.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Dual CTA */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-6">
          <Card className="bg-gradient-to-br from-blue-600/20 to-blue-900/20 border-blue-500/30">
            <CardContent className="p-8">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-blue-400" />
                <span className="font-semibold text-blue-300">Advertisers</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Reach your audience at scale</h3>
              <ul className="space-y-2 text-sm text-white/60 mb-6">
                <li className="flex items-center gap-2"><span className="text-blue-400">✓</span> Category-level targeting</li>
                <li className="flex items-center gap-2"><span className="text-blue-400">✓</span> Second-price auction fairness</li>
                <li className="flex items-center gap-2"><span className="text-blue-400">✓</span> Real-time spend controls</li>
                <li className="flex items-center gap-2"><span className="text-blue-400">✓</span> Creative review in 24h</li>
              </ul>
              <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white" onClick={openAdvertiser}>
                Create Advertiser Account
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-violet-600/20 to-violet-900/20 border-violet-500/30">
            <CardContent className="p-8">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="h-5 w-5 text-violet-400" />
                <span className="font-semibold text-violet-300">Publishers</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Monetise your audience</h3>
              <ul className="space-y-2 text-sm text-white/60 mb-6">
                <li className="flex items-center gap-2"><span className="text-violet-400">✓</span> Set your own floor price</li>
                <li className="flex items-center gap-2"><span className="text-violet-400">✓</span> Automated payouts</li>
                <li className="flex items-center gap-2"><span className="text-violet-400">✓</span> Earnings dashboard</li>
                <li className="flex items-center gap-2"><span className="text-violet-400">✓</span> Multiple ad slots</li>
              </ul>
              <Button className="w-full bg-violet-600 hover:bg-violet-500 text-white" onClick={openPublisher}>
                Create Publisher Account
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-10 text-center text-sm text-white/30 px-6">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="h-6 w-6 rounded bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <Zap className="h-3 w-3 text-white" />
          </div>
          <span className="text-white/60 font-medium">AdBid Platform</span>
        </div>
        <p>© {new Date().getFullYear()} AdBid. Transparent real-time ad bidding.</p>
        <p className="mt-2">
          <button onClick={() => navigate("/")} className="underline underline-offset-2 hover:text-white/60 transition-colors">
            Back to AccessiBooks
          </button>
        </p>
      </footer>

      {/* Auth Modal */}
      {authMode && (
        <AdAuthModal
          mode={authMode}
          defaultRole={defaultRole}
          onClose={() => setAuthMode(null)}
          onSwitchMode={(m) => setAuthMode(m)}
        />
      )}
    </div>
  );
}
