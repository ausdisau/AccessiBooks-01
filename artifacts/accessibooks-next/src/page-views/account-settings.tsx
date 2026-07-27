import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PlanBadge } from "@/components/plan-badge";
import { PreferencesKernel } from "@/components/preferences-kernel";
import { PremiumUpgradeModal } from "@/components/premium-upgrade-modal";
import { OfflineDownloads } from "@/components/offline-downloads";
import { useSubscription } from "@/hooks/use-subscription";
import {
  Crown,
  Settings2,
  Volume2,
  Eye,
  CreditCard,
  Accessibility,
  Loader2,
  Check,
  X,
  Wifi,
  Activity,
  Smartphone,
  Users,
  Zap,
  Bell,
} from "lucide-react";
import { Link } from "@/lib/wouter-compat";
import type { A11yProfile } from "@shared/schema";
import { DeviceManagement } from "@/components/device-management";
import { BillingDashboard } from "@/components/billing-dashboard";
import { ReferralSection } from "@/components/referral-section";

interface SettingsSummary {
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    subscriptionTier: string;
    subscriptionEndDate: string | null;
  };
  preferences: A11yProfile;
  billing: {
    canManagePortal: boolean;
    nextBillingDate: string | null;
    estimatedNextAmount: number | null;
  };
}

const TIER_FEATURE_ITEMS = {
  free: [
    { text: "All content with ads", included: true },
    { text: "128kbps audio quality", included: true },
    { text: "6 skips per hour", included: true },
    { text: "2 devices", included: true },
    { text: "10 bookmarks", included: true },
    { text: "Ad-free listening", included: false },
    { text: "Offline downloads", included: false },
    { text: "Text-to-Speech", included: false },
  ],
  plus: [
    { text: "All content, ad-free", included: true },
    { text: "192kbps audio quality", included: true },
    { text: "Unlimited skips", included: true },
    { text: "3 devices", included: true },
    { text: "Unlimited bookmarks", included: true },
    { text: "Ad-free listening", included: true },
    { text: "10 TTS pages/day", included: true },
    { text: "Offline downloads", included: false },
  ],
  premium: [
    { text: "All content, ad-free", included: true },
    { text: "320kbps HD audio", included: true },
    { text: "Unlimited skips", included: true },
    { text: "5 devices", included: true },
    { text: "Unlimited bookmarks", included: true },
    { text: "Ad-free listening", included: true },
    { text: "Unlimited TTS", included: true },
    { text: "Offline downloads", included: true },
  ],
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function AccountSettingsPage() {
  const { toast } = useToast();
  const { upgradeToTier, isUpgrading } = useSubscription();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const { data: summary, isLoading } = useQuery<SettingsSummary>({
    queryKey: ["/api/settings/summary"],
  });

  const [localPrefs, setLocalPrefs] = useState<Partial<A11yProfile>>({});
  const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (summary?.preferences) {
      setLocalPrefs(summary.preferences);
    }
  }, [summary?.preferences]);

  useEffect(() => {
    return () => {
      for (const t of Object.values(debounceTimersRef.current)) {
        clearTimeout(t);
      }
      debounceTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (localPrefs.reduceDistractionMode !== undefined) {
      document.documentElement.classList.toggle("reduce-distraction", !!localPrefs.reduceDistractionMode);
    }
  }, [localPrefs.reduceDistractionMode]);

  const saveMutation = useMutation({
    mutationFn: (profile: Partial<A11yProfile>) =>
      apiRequest("PUT", "/api/a11y/preferences", { profile }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/a11y/preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/summary"] });
      toast({ title: "Settings saved", duration: 2000 });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
      if (summary?.preferences) {
        setLocalPrefs(summary.preferences);
        document.documentElement.classList.toggle(
          "reduce-distraction",
          !!summary.preferences.reduceDistractionMode,
        );
      }
    },
  });

  const pendingPatchRef = useRef<Partial<A11yProfile>>({});

  const updatePref = useCallback(
    <K extends keyof A11yProfile>(key: K, value: A11yProfile[K]) => {
      setLocalPrefs((prev) => ({ ...prev, [key]: value }));
      pendingPatchRef.current = { ...pendingPatchRef.current, [key]: value };
      const fieldKey = key as string;
      const existing = debounceTimersRef.current[fieldKey];
      if (existing) clearTimeout(existing);
      debounceTimersRef.current[fieldKey] = setTimeout(() => {
        delete debounceTimersRef.current[fieldKey];
        const patch = pendingPatchRef.current;
        pendingPatchRef.current = {};
        if (Object.keys(patch).length > 0) saveMutation.mutate(patch);
      }, 500);
    },
    [saveMutation],
  );

  const portalMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/billing/create-portal-session"),
    onSuccess: async (res) => {
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
    },
    onError: () => {
      toast({ title: "Could not open billing portal", variant: "destructive" });
    },
  });

  const { data: emailPrefs, isLoading: emailPrefsLoading } = useQuery<{ limitHitEmails: boolean }>({
    queryKey: ["/api/notifications/email-preferences"],
  });

  const emailPrefsMutation = useMutation({
    mutationFn: (limitHitEmails: boolean) =>
      apiRequest("PUT", "/api/notifications/email-preferences", { limitHitEmails }),
    onSuccess: (_res, limitHitEmails) => {
      queryClient.setQueryData(["/api/notifications/email-preferences"], { limitHitEmails });
      toast({
        title: limitHitEmails
          ? "Limit-reached emails turned on"
          : "You won't get limit-reached emails anymore",
        duration: 2000,
      });
    },
    onError: () => {
      toast({ title: "Failed to save notification setting", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/email-preferences"] });
    },
  });

  const tier = (summary?.user?.subscriptionTier || "free") as "free" | "plus" | "premium";
  const isFree = tier === "free";
  const tierFeatures = TIER_FEATURE_ITEMS[tier] || TIER_FEATURE_ITEMS.free;

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-8 py-6">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="page-hero mb-6">
        <h1 className="page-title text-3xl mb-2">Account &amp; Settings</h1>
        <p className="text-muted-foreground">Manage your plan, ad preferences, listening defaults, and accessibility.</p>
      </div>
      <div className="flex flex-col md:flex-row gap-10">
        {/* Left Navigation Panel */}
        <aside className="w-full md:w-64 shrink-0" aria-label="Settings sections">
          <div className="sticky top-20 space-y-1">
            <h2 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground mb-3 px-3">Sections</h2>
            {[
              { id: "plan", label: "Your Plan", icon: Crown },
              { id: "ads", label: "Ad Preferences", icon: Zap },
              { id: "listening", label: "Listening Defaults", icon: Volume2 },
              { id: "focus", label: "Focus & Distraction", icon: Eye },
              { id: "notifications", label: "Notifications", icon: Bell },
              { id: "a11y", label: "Accessibility", icon: Accessibility },
              { id: "devices", label: "Devices", icon: Smartphone },
              { id: "billing", label: "Billing & History", icon: CreditCard },
              { id: "referrals", label: "Referrals", icon: Users },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  const el = document.getElementById(`section-${item.id}`);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
            
          </div>
        </aside>

        {/* Right Content Panel */}
        <main className="flex-1 space-y-16">
          {/* Section 1 — Your Plan */}
          <section id="section-plan" aria-labelledby="section-plan-heading" className="scroll-mt-20">
            <div className="mb-6">
              <h2 id="section-plan-heading" className="text-xl font-serif font-bold flex items-center gap-2">
                Your Plan
                <PlanBadge tier={tier} />
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Manage your subscription and features.</p>
            </div>

            <div className="rounded-xl border bg-card p-6 space-y-6">
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {tierFeatures.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    {f.included ? (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                    )}
                    <span className={f.included ? "text-foreground font-medium" : "text-muted-foreground"}>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>

              {summary?.billing.nextBillingDate && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Next billing: <span className="text-foreground font-medium">{formatDate(summary.billing.nextBillingDate)}</span>
                    {summary.billing.estimatedNextAmount != null &&
                      ` (${formatCents(summary.billing.estimatedNextAmount)})`}
                  </p>
                </div>
              )}
              
              <div className="flex flex-wrap gap-3 pt-2">
                {isFree ? (
                  <Button
                    className="bg-primary hover:bg-primary/90 text-white px-8"
                    onClick={() => setUpgradeOpen(true)}
                  >
                    Explore Premium Plans
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => portalMutation.mutate()}
                    disabled={portalMutation.isPending || !summary?.billing.canManagePortal}
                    className="gap-2"
                  >
                    {portalMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )}
                    Manage Subscription
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* Section 2 — Ad Preferences */}
          <section id="section-ads" aria-labelledby="section-ads-heading" className="scroll-mt-20">
            <div className="mb-6">
              <h2 id="section-ads-heading" className="text-xl font-serif font-bold">Ad Preferences</h2>
              <p className="text-sm text-muted-foreground mt-1">Configure how ads appear during your listening sessions.</p>
            </div>

            {isFree ? (
              <div className="rounded-xl border bg-card p-6 space-y-8">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="suppress-animated" className="text-base font-medium">Static Ads Only</Label>
                    <p className="text-sm text-muted-foreground">Prefer static images over animated or video ads.</p>
                  </div>
                  <Switch
                    id="suppress-animated"
                    checked={!!localPrefs.suppressAnimatedAds}
                    onCheckedChange={(v) => updatePref("suppressAnimatedAds", v)}
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <Label className="text-base font-medium">Rewarded Listening</Label>
                  <p className="text-sm text-muted-foreground">Unlock ad-free sessions by watching a short rewarded ad.</p>
                  <RadioGroup
                    value={localPrefs.rewardedAdPreference || "ask"}
                    onValueChange={(v) => updatePref("rewardedAdPreference", v as any)}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-4"
                  >
                    {["ask", "always", "never"].map((val) => (
                      <div key={val} className="relative">
                        <RadioGroupItem value={val} id={`rewarded-${val}`} className="peer sr-only" />
                        <Label
                          htmlFor={`rewarded-${val}`}
                          className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                        >
                          <span className="capitalize font-semibold">{val}</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-6">
                <p className="text-sm text-primary font-medium flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  You're listening ad-free. These settings don't apply to your plan.
                </p>
              </div>
            )}
          </section>

          {/* Section 3 — Listening Defaults */}
          <section id="section-listening" aria-labelledby="section-listening-heading" className="scroll-mt-20">
            <div className="mb-6">
              <h2 id="section-listening-heading" className="text-xl font-serif font-bold">Listening Defaults</h2>
              <p className="text-sm text-muted-foreground mt-1">Your preferred playback settings for all books.</p>
            </div>

            <div className="rounded-xl border bg-card p-6 space-y-6">
              {[
                { id: "playback-speed", label: "Playback Speed", key: "playbackSpeed", options: [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3].map(v => ({ value: String(v), label: `${v}x` })) },
                { id: "skip-forward", label: "Skip Forward", key: "preferredSkipForward", options: [{ value: "10", label: "10s" }, { value: "15", label: "15s" }, { value: "30", label: "30s" }] },
                { id: "skip-back", label: "Skip Backward", key: "preferredSkipBack", options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }, { value: "15", label: "15s" }] },
              ].map((field) => (
                <div key={field.id} className="flex items-center justify-between gap-4">
                  <Label htmlFor={field.id} className="font-medium">{field.label}</Label>
                  <Select
                    value={String((localPrefs as any)[field.key] ?? "1")}
                    onValueChange={(v) => updatePref(field.key as any, field.id.includes("speed") ? parseFloat(v) : parseInt(v))}
                  >
                    <SelectTrigger id={field.id} className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="auto-advance" className="font-medium">Auto-advance Chapters</Label>
                  <p className="text-sm text-muted-foreground">Continue to the next chapter automatically.</p>
                </div>
                <Switch
                  id="auto-advance"
                  checked={localPrefs.autoAdvanceChapters !== false}
                  onCheckedChange={(v) => updatePref("autoAdvanceChapters", v)}
                />
              </div>
            </div>
          </section>

          {/* Section 4 — Focus & Distraction */}
          <section id="section-focus" aria-labelledby="section-focus-heading" className="scroll-mt-20">
            <div className="mb-6">
              <h2 id="section-focus-heading" className="text-xl font-serif font-bold">Focus & Distraction</h2>
              <p className="text-sm text-muted-foreground mt-1">Control visual elements to help you concentrate.</p>
            </div>

            <div className="rounded-xl border bg-card p-6 space-y-6">
              {[
                { id: "transcript-default", label: "Show Transcript", desc: "Open transcript panel automatically when playing.", key: "transcriptOpenByDefault" },
                { id: "reduce-distraction", label: "Reduce Distractions", desc: "Hide decorative images and UI flourishes.", key: "reduceDistractionMode" },
                { id: "low-bandwidth", label: "Low Bandwidth Mode", desc: "Save data by hiding heavy visual assets.", key: "lowBandwidthMode" },
              ].map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor={item.id} className="font-medium">{item.label}</Label>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch
                    id={item.id}
                    checked={!!(localPrefs as any)[item.key]}
                    onCheckedChange={(v) => updatePref(item.key as any, v)}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Notifications */}
          <section id="section-notifications" aria-labelledby="section-notifications-heading" className="scroll-mt-20">
            <div className="mb-6">
              <h2 id="section-notifications-heading" className="text-xl font-serif font-bold">Notifications</h2>
              <p className="text-sm text-muted-foreground mt-1">Choose which emails you receive from AccessiBooks.</p>
            </div>

            <div className="rounded-xl border bg-card p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="limit-hit-emails" className="text-base font-medium">Limit-reached upgrade emails</Label>
                  <p className="text-sm text-muted-foreground">
                    Email me upgrade options when I hit a free-plan limit (at most one per day per limit).
                  </p>
                </div>
                <Switch
                  id="limit-hit-emails"
                  data-testid="switch-limit-hit-emails"
                  checked={emailPrefs ? emailPrefs.limitHitEmails : true}
                  disabled={emailPrefsLoading || emailPrefsMutation.isPending}
                  onCheckedChange={(v) => emailPrefsMutation.mutate(v)}
                />
              </div>
            </div>
          </section>

          {/* Section 5 — Accessibility Profile */}
          <section id="section-a11y" aria-labelledby="section-a11y-heading" className="scroll-mt-20">
            <div className="mb-6">
              <h2 id="section-a11y-heading" className="text-xl font-serif font-bold">Accessibility</h2>
              <p className="text-sm text-muted-foreground mt-1">Fine-tune your reading and listening experience.</p>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <PreferencesKernel open={prefsOpen} onOpenChange={setPrefsOpen} />
              <div className="mt-6 pt-6 border-t flex items-center justify-between">
                <div>
                  <p className="font-medium">Custom Preferences</p>
                  <p className="text-sm text-muted-foreground">Adjust fonts, colors, and motion settings.</p>
                </div>
                <Button variant="outline" onClick={() => setPrefsOpen(true)}>
                  Configure
                </Button>
              </div>
            </div>
          </section>

          {/* Section 6 — Devices */}
          <section id="section-devices" aria-labelledby="section-devices-heading" className="scroll-mt-20">
            <div className="mb-6">
              <h2 id="section-devices-heading" className="text-xl font-serif font-bold">Devices</h2>
              <p className="text-sm text-muted-foreground mt-1">Manage where you can stream your library.</p>
            </div>
            <DeviceManagement />
          </section>

          {/* Section 7 — Billing */}
          <section id="section-billing" aria-labelledby="section-billing-heading" className="scroll-mt-20">
            <div className="mb-6">
              <h2 id="section-billing-heading" className="text-xl font-serif font-bold">Billing & History</h2>
              <p className="text-sm text-muted-foreground mt-1">View your transactions and download invoices.</p>
            </div>
            <BillingDashboard />
          </section>

          {/* Section 8 — Referrals */}
          <section id="section-referrals" aria-labelledby="section-referrals-heading" className="scroll-mt-20 pb-20">
            <div className="mb-6">
              <h2 id="section-referrals-heading" className="text-xl font-serif font-bold">Referrals</h2>
              <p className="text-sm text-muted-foreground mt-1">Share AccessiBooks and earn rewards.</p>
            </div>
            <ReferralSection />
          </section>
        </main>
      </div>

      <PremiumUpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        book={null}
        onUpgrade={(plan) => {
          if (typeof plan === "object" && plan !== null) {
            upgradeToTier(plan.tier, plan.plan);
          } else {
            upgradeToTier("premium", plan ?? "monthly");
          }
          setUpgradeOpen(false);
        }}
        isUpgrading={isUpgrading}
      />
    </div>
  );
}
