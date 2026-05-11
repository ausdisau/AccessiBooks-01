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
} from "lucide-react";
import { Link } from "wouter";
import type { A11yProfile } from "@shared/schema";

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
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (summary?.preferences) {
      setLocalPrefs(summary.preferences);
    }
  }, [summary?.preferences]);

  useEffect(() => {
    if (localPrefs.reduceDistractionMode !== undefined) {
      document.documentElement.classList.toggle("reduce-distraction", !!localPrefs.reduceDistractionMode);
    }
  }, [localPrefs.reduceDistractionMode]);

  // Low-Bandwidth + Text-Only documentElement classes are applied globally
  // by usePreferencesKernel so they take effect on app boot, not just when
  // visiting this settings page.

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

  // Pending patch accumulates fields between debounced flushes so that
  // back-to-back updatePref() calls (e.g. setting two related fields in
  // the same handler) all reach the server in a single PUT instead of
  // the last-write-wins behavior the previous implementation had.
  const pendingPatchRef = useRef<Partial<A11yProfile>>({});

  const updatePref = useCallback(
    <K extends keyof A11yProfile>(key: K, value: A11yProfile[K]) => {
      setLocalPrefs((prev) => ({ ...prev, [key]: value }));
      pendingPatchRef.current = { ...pendingPatchRef.current, [key]: value };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
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
    <div className="max-w-2xl mx-auto space-y-10 py-6">
      <div className="flex items-center gap-3">
        <Settings2 className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
      </div>

      {/* Section 1 — Your Plan */}
      <section aria-labelledby="section-plan-heading">
        <h2 id="section-plan-heading" className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-500" />
          Your Plan
          <PlanBadge tier={tier} />
          {(tier === "plus" || tier === "premium") && (
            <Badge
              role="note"
              className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs"
            >
              Ad-free
            </Badge>
          )}
        </h2>

        <div className="rounded-lg border p-4 space-y-4">
          <ul className="space-y-2">
            {tierFeatures.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                {f.included ? (
                  <Check className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
                <span className={f.included ? "text-foreground" : "text-muted-foreground/60"}>
                  {f.text}
                </span>
              </li>
            ))}
          </ul>

          {summary?.billing.nextBillingDate && (
            <p className="text-xs text-muted-foreground">
              Next billing: {formatDate(summary.billing.nextBillingDate)}
              {summary.billing.estimatedNextAmount != null &&
                ` — ${formatCents(summary.billing.estimatedNextAmount)}`}
            </p>
          )}
          {summary?.user.subscriptionEndDate && !summary?.billing.nextBillingDate && (
            <p className="text-xs text-muted-foreground">
              Access until: {formatDate(summary.user.subscriptionEndDate)}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {isFree ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                  onClick={() => setUpgradeOpen(true)}
                >
                  Upgrade to Plus
                </Button>
                <Button
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={() => setUpgradeOpen(true)}
                >
                  Upgrade to Premium
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending || !summary?.billing.canManagePortal}
              >
                {portalMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Manage Subscription
              </Button>
            )}
          </div>
        </div>
      </section>

      <Separator />

      {/* Section 2 — Ad Preferences (free only) */}
      <section aria-labelledby="section-ads-heading">
        <h2 id="section-ads-heading" className="text-lg font-semibold mb-4">
          Ad Preferences
        </h2>

        {isFree ? (
          <div className="rounded-lg border p-4 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="suppress-animated"
                  className="font-medium"
                  aria-describedby="suppress-animated-desc"
                >
                  Prefer static ads over animated or video ads
                </Label>
                <Switch
                  id="suppress-animated"
                  aria-describedby="suppress-animated-desc"
                  checked={!!localPrefs.suppressAnimatedAds}
                  onCheckedChange={(v) => updatePref("suppressAnimatedAds", v)}
                />
              </div>
              <p id="suppress-animated-desc" className="text-xs text-muted-foreground">
                When enabled, you may see fewer ads overall, but those shown will be static images
                only.
              </p>
            </div>

            <div className="space-y-3">
              <fieldset>
                <legend className="font-medium text-sm mb-2">Rewarded listening offers</legend>
                <RadioGroup
                  value={localPrefs.rewardedAdPreference || "ask"}
                  onValueChange={(v) =>
                    updatePref("rewardedAdPreference", v as "always" | "never" | "ask")
                  }
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="rewarded-ask" value="ask" />
                    <Label htmlFor="rewarded-ask">Ask me each time</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="rewarded-always" value="always" />
                    <Label htmlFor="rewarded-always">Always accept</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="rewarded-never" value="never" />
                    <Label htmlFor="rewarded-never">Never show</Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground mt-2">
                  Rewarded ads let you unlock ad-free listening for a session by watching a short
                  ad.
                </p>
              </fieldset>
            </div>

            <p className="text-xs text-muted-foreground border-t pt-3">
              These preferences reduce certain ad formats — they don't remove ads entirely. Upgrade
              to Plus to go fully ad-free.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border p-4">
            <p role="note" className="text-sm text-muted-foreground">
              You're listening ad-free. These settings don't apply to your plan.
            </p>
          </div>
        )}
      </section>

      <Separator />

      {/* Section 3 — Listening Defaults */}
      <section aria-labelledby="section-listening-heading">
        <h2 id="section-listening-heading" className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-muted-foreground" />
          Listening Defaults
        </h2>

        <div className="rounded-lg border p-4 space-y-5">
          <div className="flex items-center justify-between">
            <Label htmlFor="playback-speed" className="font-medium">
              Default playback speed
            </Label>
            <Select
              value={String(localPrefs.playbackSpeed ?? 1)}
              onValueChange={(v) => updatePref("playbackSpeed", parseFloat(v))}
            >
              <SelectTrigger id="playback-speed" className="w-36" aria-label="Default playback speed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}×
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="skip-forward" className="font-medium">
              Skip forward duration
            </Label>
            <Select
              value={String(localPrefs.preferredSkipForward ?? 15)}
              onValueChange={(v) =>
                updatePref("preferredSkipForward", parseInt(v) as 10 | 15 | 30)
              }
            >
              <SelectTrigger id="skip-forward" className="w-36" aria-label="Skip forward duration in seconds">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 seconds</SelectItem>
                <SelectItem value="15">15 seconds</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="skip-back" className="font-medium">
              Skip back duration
            </Label>
            <Select
              value={String(localPrefs.preferredSkipBack ?? 15)}
              onValueChange={(v) =>
                updatePref("preferredSkipBack", parseInt(v) as 5 | 10 | 15)
              }
            >
              <SelectTrigger id="skip-back" className="w-36" aria-label="Skip back duration in seconds">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 seconds</SelectItem>
                <SelectItem value="10">10 seconds</SelectItem>
                <SelectItem value="15">15 seconds</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-advance" className="font-medium" aria-describedby="auto-advance-desc">
                Automatically advance to next chapter
              </Label>
            </div>
            <Switch
              id="auto-advance"
              aria-describedby="auto-advance-desc"
              checked={localPrefs.autoAdvanceChapters !== false}
              onCheckedChange={(v) => updatePref("autoAdvanceChapters", v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="sleep-timer" className="font-medium">
              Default sleep timer
            </Label>
            <Select
              value={String(localPrefs.sleepTimerDefault ?? "null")}
              onValueChange={(v) =>
                updatePref("sleepTimerDefault", v === "null" ? null : parseInt(v))
              }
            >
              <SelectTrigger id="sleep-timer" className="w-36" aria-label="Default sleep timer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="null">Off</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">60 minutes</SelectItem>
                <SelectItem value="90">90 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <Separator />

      {/* Section 4 — Focus & Distraction */}
      <section aria-labelledby="section-focus-heading">
        <h2 id="section-focus-heading" className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Eye className="h-5 w-5 text-muted-foreground" />
          Focus & Distraction
        </h2>

        <div className="rounded-lg border p-4 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="transcript-default"
                className="font-medium"
                aria-describedby="transcript-default-desc"
              >
                Show transcript panel by default when playing
              </Label>
              <Switch
                id="transcript-default"
                aria-describedby="transcript-default-desc"
                checked={!!localPrefs.transcriptOpenByDefault}
                onCheckedChange={(v) => updatePref("transcriptOpenByDefault", v)}
              />
            </div>
            <p id="transcript-default-desc" className="text-xs text-muted-foreground">
              Opens the transcript automatically when you start a book.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="reduce-distraction"
                className="font-medium"
                aria-describedby="reduce-distraction-desc"
              >
                Reduce distraction mode
              </Label>
              <Switch
                id="reduce-distraction"
                aria-describedby="reduce-distraction-desc"
                checked={!!localPrefs.reduceDistractionMode}
                onCheckedChange={(v) => updatePref("reduceDistractionMode", v)}
              />
            </div>
            <p id="reduce-distraction-desc" className="text-xs text-muted-foreground">
              Hides decorative images and reduces visual noise throughout the app.
            </p>
          </div>
        </div>
      </section>

      <Separator />

      {/* Section 4b — Calm Mode & Notifications (Task #64) */}
      <section aria-labelledby="section-calm-heading" data-testid="section-calm">
        <h2 id="section-calm-heading" className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Accessibility className="h-5 w-5 text-emerald-600" />
          Calm Mode &amp; Notifications
        </h2>
        <div className="rounded-lg border p-4 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="calm-mode" className="font-medium">Calm Mode</Label>
              <Switch
                id="calm-mode"
                data-testid="switch-calm-mode"
                checked={!!localPrefs.calmMode}
                onCheckedChange={(v) => updatePref("calmMode", v)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Turns off streaks, leaderboards, push notifications, and rewarded-ad nudges. The hub
              focuses on books and bookmarks.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="streak-paused" className="font-medium">Pause my streak (7 days)</Label>
              <Switch
                id="streak-paused"
                data-testid="switch-streak-paused"
                checked={!!localPrefs.streakPaused}
                onCheckedChange={(v) => {
                  updatePref("streakPaused", v);
                  if (v) updatePref("streakPausedAt", new Date().toISOString().slice(0, 10));
                  else updatePref("streakPausedAt", null);
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Take a guilt-free week off — your streak resumes automatically afterward.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="font-medium">Quiet hours</Label>
            <div className="flex items-center gap-2">
              <Label htmlFor="quiet-start" className="text-sm">From</Label>
              <Select
                value={String(localPrefs.quietHours?.start ?? 21)}
                onValueChange={(v) => updatePref("quietHours", { start: parseInt(v), end: localPrefs.quietHours?.end ?? 8 })}
              >
                <SelectTrigger id="quiet-start" data-testid="select-quiet-start" className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, h) => (
                    <SelectItem key={h} value={String(h)}>{h}:00</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label htmlFor="quiet-end" className="text-sm">until</Label>
              <Select
                value={String(localPrefs.quietHours?.end ?? 8)}
                onValueChange={(v) => updatePref("quietHours", { start: localPrefs.quietHours?.start ?? 21, end: parseInt(v) })}
              >
                <SelectTrigger id="quiet-end" data-testid="select-quiet-end" className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, h) => (
                    <SelectItem key={h} value={String(h)}>{h}:00</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              No push notifications during these hours.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="font-medium">Notification categories</Label>
            <div className="space-y-2">
              {([
                { key: "streak_at_risk", label: "Streak reminders" },
                { key: "rsvp_reminder", label: "Event reminders" },
                { key: "friend_digest", label: "Friend activity digest" },
                { key: "weekly_recap", label: "Weekly recap" },
                { key: "win_back", label: "Win-back emails" },
                { key: "recommendation", label: "Recommendations" },
              ] as const).map((cat) => {
                const cats = localPrefs.notificationCategories ?? {};
                const checked = cats[cat.key] !== false;
                return (
                  <div key={cat.key} className="flex items-center justify-between">
                    <Label htmlFor={`notify-${cat.key}`} className="text-sm">{cat.label}</Label>
                    <Switch
                      id={`notify-${cat.key}`}
                      data-testid={`switch-notify-${cat.key}`}
                      checked={checked}
                      onCheckedChange={(v) => updatePref("notificationCategories", {
                        ...cats,
                        [cat.key]: v,
                      })}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="hub-as-home" className="font-medium">Make Hub my home page</Label>
              <Switch
                id="hub-as-home"
                data-testid="switch-hub-as-home"
                checked={localPrefs.hubAsHome !== false}
                onCheckedChange={(v) => updatePref("hubAsHome", v)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              When on, signing in lands on your engagement Hub instead of the library.
            </p>
          </div>

          {isFree && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="hide-nudges" className="font-medium">Hide upgrade prompts (30 days)</Label>
                <Switch
                  id="hide-nudges"
                  data-testid="switch-hide-nudges"
                  checked={!!localPrefs.hideUpgradeNudgesUntil && new Date(localPrefs.hideUpgradeNudgesUntil) > new Date()}
                  onCheckedChange={(v) => {
                    if (v) {
                      const until = new Date();
                      until.setDate(until.getDate() + 30);
                      updatePref("hideUpgradeNudgesUntil", until.toISOString());
                    } else {
                      updatePref("hideUpgradeNudgesUntil", null);
                    }
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Won't affect your access — just quiets the upgrade suggestions.
              </p>
            </div>
          )}
        </div>
      </section>

      <Separator />

      {/* Section 4c — Sensory Regulation Mode (Task #65) */}
      <section aria-labelledby="section-sensory-heading" data-testid="section-sensory">
        <h2 id="section-sensory-heading" className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Accessibility className="h-5 w-5 text-indigo-600" />
          Low Sensory Mode
        </h2>
        <div className="rounded-lg border p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="sensory-mode" className="font-medium" aria-describedby="sensory-mode-desc">
                Low Sensory Mode
              </Label>
              <Switch
                id="sensory-mode"
                data-testid="switch-sensory-mode"
                checked={!!localPrefs.sensoryMode}
                onCheckedChange={(v) => {
                  updatePref("sensoryMode", v);
                  // Mark as explicitly chosen so the OS-level auto-enable
                  // notice does not re-fire on subsequent loads.
                  updatePref("sensoryModeChosen", true);
                }}
              />
            </div>
            <p id="sensory-mode-desc" className="text-xs text-muted-foreground">
              A single switch that calms the whole app — softer motion, quieter
              audio peaks, and a simpler layout. Helpful for sensory sensitivity,
              vestibular concerns, or when you just want less.
            </p>
          </div>
          <details className="text-xs text-muted-foreground border-t pt-3">
            <summary className="cursor-pointer font-medium text-foreground">
              What does this change?
            </summary>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>Animations and transitions are reduced to nearly instant.</li>
              <li>Decorative images, gradients, and parallax effects are hidden.</li>
              <li>The audio player applies a gentle peak limiter so loud spikes
                  (ad cues, chapter intros) are softened.</li>
              <li>Existing reduced-motion and reduce-distraction settings remain
                  available below as fine-grained overrides.</li>
            </ul>
          </details>
        </div>
      </section>

      <Separator />

      {/* Section 4d — Low-Bandwidth & Text-Only (Task #66) */}
      <section aria-labelledby="section-bandwidth-heading" data-testid="section-bandwidth">
        <h2 id="section-bandwidth-heading" className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Wifi className="h-5 w-5 text-sky-600" />
          Low-Bandwidth &amp; Text-Only
        </h2>
        <div className="rounded-lg border p-4 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="low-bandwidth-mode"
                className="font-medium"
                aria-describedby="low-bandwidth-desc"
              >
                Low-Bandwidth Mode
              </Label>
              <Switch
                id="low-bandwidth-mode"
                data-testid="switch-low-bandwidth"
                checked={!!localPrefs.lowBandwidthMode}
                onCheckedChange={(v) => updatePref("lowBandwidthMode", v)}
              />
            </div>
            <p id="low-bandwidth-desc" className="text-xs text-muted-foreground">
              Forces audio to the lowest-bitrate stream (128 kbps) regardless of your plan,
              suppresses video and animated ads, and tells the ebook reader to skip background
              videos. Helpful on slow networks or capped data plans.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="text-only-mode"
                className="font-medium"
                aria-describedby="text-only-desc"
              >
                Text-Only ebook reading
              </Label>
              <Switch
                id="text-only-mode"
                data-testid="switch-text-only"
                checked={!!localPrefs.textOnlyMode}
                onCheckedChange={(v) => updatePref("textOnlyMode", v)}
              />
            </div>
            <p id="text-only-desc" className="text-xs text-muted-foreground">
              Hides covers, illustrations, and the Visual Reading background video so only the
              text remains.
            </p>
          </div>
        </div>
      </section>

      <Separator />

      {/* Section 4e — Storage & Downloads (Task #66) */}
      <section aria-labelledby="section-storage-heading" data-testid="section-storage">
        <h2 id="section-storage-heading" className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Wifi className="h-5 w-5 text-muted-foreground" />
          Storage &amp; Downloads
        </h2>
        <div className="rounded-lg border p-4">
          <OfflineDownloads />
        </div>
      </section>

      <Separator />

      {/* Section 4f — My Activity (Task #67) */}
      <section aria-labelledby="section-activity-heading" data-testid="section-activity">
        <h2 id="section-activity-heading" className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-emerald-600" />
          My Activity
        </h2>
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Opt in to record your own listening, transcript, and accessibility-feature use,
            attach outcome tags (capacity building, independent access, daily living,
            communication support), and generate a plain-language report you can save, print,
            or share with a caregiver. Wipe everything in one click.
          </p>
          <Button asChild variant="outline" data-testid="link-my-activity">
            <Link href="/activity">Open My Activity</Link>
          </Button>
        </div>
      </section>

      <Separator />

      {/* Section 5 — Accessibility Preferences */}
      <section aria-labelledby="section-a11y-heading">
        <h2 id="section-a11y-heading" className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Accessibility className="h-5 w-5 text-muted-foreground" />
          Accessibility Preferences
        </h2>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground mb-4">
            Manage font size, contrast, captions, motion settings, and more in the full
            accessibility panel.
          </p>
          <Button variant="outline" onClick={() => setPrefsOpen(true)}>
            Open full accessibility settings
          </Button>
        </div>
      </section>

      <PreferencesKernel open={prefsOpen} onOpenChange={setPrefsOpen} />

      <PremiumUpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        book={null}
        onUpgrade={(plan) => {
          const tier = typeof plan === "object" ? plan.tier : "premium";
          const period = typeof plan === "object" ? plan.plan : plan;
          upgradeToTier(tier, period);
          setUpgradeOpen(false);
        }}
        isUpgrading={isUpgrading}
      />
    </div>
  );
}
