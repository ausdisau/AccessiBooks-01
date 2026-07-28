import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Trophy, Lock, Zap, Gift, Sparkles,
  Crown, Loader2, CheckCircle2, Clock, Users,
  Snowflake, Award, Target,
} from "lucide-react";
import type { BattlePass, BattlePassMilestone, BattlePassPurchase } from "@shared/schema";

type Progress = (BattlePassPurchase & { currentTier: number; xpEarned: number }) | null;

interface BattlePassData {
  season: BattlePass | null;
  milestones: BattlePassMilestone[];
  progress: Progress;
}

interface LeaderboardEntry {
  userId: string;
  xpEarned: number;
  currentTier: number;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  rank: number;
}

const REWARD_ICONS: Record<string, typeof Trophy> = {
  badge: Award,
  streak_freeze: Snowflake,
  xp_multiplier: Zap,
  premium_trial: Crown,
  discount: Gift,
};

const REWARD_COLORS: Record<string, string> = {
  badge: "from-purple-500 to-pink-500",
  streak_freeze: "from-cyan-500 to-blue-500",
  xp_multiplier: "from-yellow-500 to-orange-500",
  premium_trial: "from-amber-500 to-yellow-500",
  discount: "from-green-500 to-emerald-500",
};

function MilestoneCard({
  milestone,
  currentXp,
  isClaimed,
  claimable,
  lockedPremium,
  onClaim,
  isClaiming,
}: {
  milestone: BattlePassMilestone;
  currentXp: number;
  isClaimed: boolean;
  claimable: boolean;
  lockedPremium: boolean;
  onClaim: (id: string) => void;
  isClaiming: boolean;
}) {
  const isReached = currentXp >= milestone.xpRequired;
  const progress = Math.min((currentXp / milestone.xpRequired) * 100, 100);
  const Icon = REWARD_ICONS[milestone.rewardType] || Gift;
  const gradientColor = REWARD_COLORS[milestone.rewardType] || "from-gray-500 to-gray-600";

  return (
    <div
      data-testid={`milestone-${milestone.id}`}
      className={`relative flex items-center gap-4 p-4 rounded-xl border transition-all ${
        isClaimed
          ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
          : claimable
            ? "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border-amber-200 dark:border-amber-800 shadow-md"
            : "bg-card border-border"
      }`}
    >
      <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${
        isClaimed
          ? "bg-green-500 text-white"
          : isReached && !lockedPremium
            ? `bg-gradient-to-br ${gradientColor} text-white`
            : "bg-muted text-muted-foreground"
      }`}>
        {isClaimed ? (
          <CheckCircle2 className="h-6 w-6" />
        ) : isReached && !lockedPremium ? (
          <Icon className="h-6 w-6" />
        ) : (
          <Lock className="h-5 w-5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={isClaimed ? "default" : "secondary"} className="text-xs">
            Tier {milestone.tier}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {milestone.xpRequired.toLocaleString()} XP
          </span>
        </div>
        <p className={`text-sm font-medium ${isClaimed ? "text-green-700 dark:text-green-300" : ""}`}>
          {milestone.description}
        </p>
        {!isReached && (
          <div className="mt-2">
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">
              {currentXp.toLocaleString()} / {milestone.xpRequired.toLocaleString()} XP
            </p>
          </div>
        )}
        {isReached && lockedPremium && !isClaimed && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
            <Lock className="h-3 w-3" /> Unlock the premium track to claim
          </p>
        )}
      </div>

      <div className="flex-shrink-0">
        {isClaimed ? (
          <span className="text-xs text-green-600 dark:text-green-400 font-medium">Claimed</span>
        ) : claimable ? (
          <Button
            size="sm"
            data-testid={`button-claim-${milestone.id}`}
            onClick={() => onClaim(milestone.id)}
            disabled={isClaiming}
            className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white"
          >
            {isClaiming ? <Loader2 className="h-4 w-4 animate-spin" /> : "Claim"}
          </Button>
        ) : isReached && lockedPremium ? (
          <Lock className="h-4 w-4 text-muted-foreground" />
        ) : null}
      </div>
    </div>
  );
}

function TrackColumn({
  title,
  icon,
  accent,
  milestones,
  currentXp,
  claimedMilestones,
  trackUnlocked,
  isPremiumTrack,
  onClaim,
  isClaiming,
  headerExtra,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  milestones: BattlePassMilestone[];
  currentXp: number;
  claimedMilestones: string[];
  trackUnlocked: boolean;
  isPremiumTrack: boolean;
  onClaim: (id: string) => void;
  isClaiming: boolean;
  headerExtra?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className={`text-base font-semibold flex items-center gap-2 ${accent}`}>
          {icon}
          {title}
        </h3>
        {headerExtra}
      </div>
      {milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No rewards on this track yet.</p>
      ) : (
        <div className="space-y-3">
          {milestones.map((m) => {
            const isClaimed = claimedMilestones.includes(m.id);
            const isReached = currentXp >= m.xpRequired;
            const claimable = isReached && trackUnlocked && !isClaimed;
            const lockedPremium = isPremiumTrack && !trackUnlocked;
            return (
              <MilestoneCard
                key={m.id}
                milestone={m}
                currentXp={currentXp}
                isClaimed={isClaimed}
                claimable={claimable}
                lockedPremium={lockedPremium}
                onClaim={onClaim}
                isClaiming={isClaiming}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BattlePassComponent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const { data, isLoading } = useQuery<BattlePassData>({
    queryKey: ["/api/battle-pass/current"],
  });

  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/battle-pass/leaderboard"],
    enabled: showLeaderboard,
  });

  // Handle return from Stripe checkout (?battle_pass=success|cancelled).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("battle_pass");
    if (!status) return;
    if (status === "success") {
      toast({ title: "Premium Unlocked! 🎉", description: "The premium reward track is now yours for this season." });
      queryClient.invalidateQueries({ queryKey: ["/api/battle-pass/current"] });
    } else if (status === "cancelled") {
      toast({ title: "Checkout Cancelled", description: "You can unlock the premium track any time." });
    }
    params.delete("battle_pass");
    const newSearch = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (newSearch ? `?${newSearch}` : ""));
  }, [toast]);

  const purchaseMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/battle-pass/purchase"),
    onSuccess: async (response) => {
      const result = await response.json();
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        toast({ title: "Premium Unlocked!", description: "Premium rewards are now claimable as you earn XP." });
        queryClient.invalidateQueries({ queryKey: ["/api/battle-pass/current"] });
      }
    },
    onError: () => {
      toast({ title: "Unlock Failed", description: "Could not unlock the premium track.", variant: "destructive" });
    },
  });

  const claimMutation = useMutation({
    mutationFn: (milestoneId: string) => apiRequest("POST", `/api/battle-pass/claim/${milestoneId}`),
    onSuccess: async (response) => {
      const result = await response.json();
      toast({
        title: "Reward Claimed! 🎉",
        description: result.reward?.description || "Reward has been added to your account.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/battle-pass/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/freezes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/rewards"] });
    },
    onError: async (error: any) => {
      let description = "Could not claim this milestone.";
      try {
        const body = await error?.response?.json?.();
        if (body?.message) description = body.message;
      } catch { /* keep default */ }
      toast({ title: "Claim Failed", description, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data?.season) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="py-12 text-center">
          <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Active Season</h3>
          <p className="text-muted-foreground">Check back soon for the next Battle Pass season!</p>
        </CardContent>
      </Card>
    );
  }

  const { season, milestones, progress } = data;
  const premiumUnlocked = !!progress?.isPremium;
  const currentXp = progress?.xpEarned ?? 0;
  const claimedMilestones: string[] = progress
    ? (() => { try { return JSON.parse(progress.claimedMilestones); } catch { return []; } })()
    : [];

  const freeMilestones = milestones.filter((m) => !m.isPremium);
  const premiumMilestones = milestones.filter((m) => m.isPremium);

  const maxXp = milestones.length > 0 ? Math.max(...milestones.map((m) => m.xpRequired)) : 1;
  const overallProgress = Math.min((currentXp / maxXp) * 100, 100);
  const reachedCount = milestones.filter((m) => currentXp >= m.xpRequired).length;

  const endDate = new Date(season.endDate);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  const priceLabel = `$${(season.priceCents / 100).toFixed(2)}`;

  // Reached-but-unclaimed rewards the user could claim right now (premium
  // milestones only count when the premium track is unlocked). These are
  // lost when the season resets, so surface urgency before the end date.
  const unclaimedClaimable = progress
    ? milestones.filter(
        (m) =>
          currentXp >= m.xpRequired &&
          !claimedMilestones.includes(m.id) &&
          (!m.isPremium || premiumUnlocked),
      ).length
    : 0;
  const seasonEndingSoon = daysLeft <= 7;
  const daysLeftLabel =
    daysLeft === 0 ? "Ends today" : daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Season header */}
      <Card className="overflow-hidden">
        <div className="bg-card p-4 sm:p-6 border-b">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold" data-testid="text-season-name">{season.seasonName}</h2>
                <p className="text-sm text-muted-foreground">{season.description}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div
                data-testid="text-days-left"
                className={`flex items-center gap-1 text-sm justify-end font-medium ${
                  seasonEndingSoon ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                }`}
              >
                <Clock className="h-4 w-4" />
                {daysLeftLabel}
              </div>
              {premiumUnlocked ? (
                <Badge className="mt-1 bg-gradient-to-r from-amber-500 to-yellow-500 text-white border-0">
                  <Crown className="h-3 w-3 mr-1" /> Premium
                </Badge>
              ) : (
                <p className="text-lg font-bold text-primary">{priceLabel}</p>
              )}
            </div>
          </div>

          {progress ? (
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">Season Progress</span>
                <span className="font-medium">{currentXp.toLocaleString()} / {maxXp.toLocaleString()} XP</span>
              </div>
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${overallProgress}%` }}
                  data-testid="bar-overall-progress"
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground font-medium">
                <span>Current Tier: {progress.currentTier} / {Math.max(freeMilestones.length, premiumMilestones.length)}</span>
                <span>{claimedMilestones.length} / {reachedCount} rewards claimed</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sign in to start earning rewards this season.</p>
          )}
        </div>

        {/* Unclaimed rewards reminder — rewards are lost when the season resets */}
        {unclaimedClaimable > 0 && (
          <div
            role="status"
            data-testid="banner-unclaimed-rewards"
            className={`px-4 sm:px-6 py-3 border-b flex items-start gap-3 ${
              seasonEndingSoon
                ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                : "bg-muted/50"
            }`}
          >
            <Gift
              className={`h-5 w-5 mt-0.5 shrink-0 ${
                seasonEndingSoon ? "text-amber-600 dark:text-amber-400" : "text-primary"
              }`}
            />
            <p className="text-sm">
              <span className="font-semibold">
                You have {unclaimedClaimable} unclaimed reward{unclaimedClaimable === 1 ? "" : "s"}
              </span>{" "}
              {seasonEndingSoon ? (
                <>
                  — the season {daysLeft === 0 ? "ends today" : daysLeft === 1 ? "ends tomorrow" : `ends in ${daysLeft} days`}.
                  Unclaimed rewards are lost when the season resets, so claim them below before it's too late.
                </>
              ) : (
                <>waiting below. Claim them any time before the season ends.</>
              )}
            </p>
          </div>
        )}

        {/* Premium unlock CTA */}
        {user && !premiumUnlocked && (
          <div className="p-4 sm:p-6 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <Crown className="h-6 w-6 text-amber-500 shrink-0" />
                <div>
                  <h4 className="font-semibold">Unlock the Premium Track</h4>
                  <p className="text-sm text-muted-foreground">
                    Claim exclusive premium rewards at every tier you reach this season.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => purchaseMutation.mutate()}
                disabled={purchaseMutation.isPending}
                data-testid="button-unlock-premium"
                className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white font-semibold shrink-0"
              >
                {purchaseMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Crown className="h-4 w-4 mr-2" />
                )}
                Unlock Premium — {priceLabel}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Leaderboard toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Reward Tracks
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLeaderboard(!showLeaderboard)}
          data-testid="button-toggle-leaderboard"
          className="flex items-center gap-1"
        >
          <Users className="h-4 w-4" />
          {showLeaderboard ? "Hide Leaderboard" : "Leaderboard"}
        </Button>
      </div>

      {showLeaderboard && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              Season Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboardLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !leaderboard?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No participants yet</p>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((entry) => (
                  <div key={entry.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      entry.rank === 1 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                      entry.rank === 2 ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" :
                      entry.rank === 3 ? "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {entry.rank}
                    </div>
                    {entry.profileImageUrl ? (
                      <img src={entry.profileImageUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {(entry.firstName?.[0] || "?").toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {entry.firstName || "Anonymous"} {entry.lastName?.[0] ? entry.lastName[0] + "." : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">Tier {entry.currentTier}</p>
                    </div>
                    <span className="text-sm font-semibold">{entry.xpEarned.toLocaleString()} XP</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Two tracks */}
      <div className="grid md:grid-cols-2 gap-6">
        <TrackColumn
          title="Free Track"
          icon={<Gift className="h-5 w-5" />}
          accent="text-foreground"
          milestones={freeMilestones}
          currentXp={currentXp}
          claimedMilestones={claimedMilestones}
          trackUnlocked={true}
          isPremiumTrack={false}
          onClaim={(id) => claimMutation.mutate(id)}
          isClaiming={claimMutation.isPending}
        />
        <TrackColumn
          title="Premium Track"
          icon={<Crown className="h-5 w-5" />}
          accent="text-amber-600 dark:text-amber-400"
          milestones={premiumMilestones}
          currentXp={currentXp}
          claimedMilestones={claimedMilestones}
          trackUnlocked={premiumUnlocked}
          isPremiumTrack={true}
          onClaim={(id) => claimMutation.mutate(id)}
          isClaiming={claimMutation.isPending}
          headerExtra={
            premiumUnlocked ? (
              <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500 text-white border-0 text-xs">
                Unlocked
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="h-3 w-3" /> Locked
              </span>
            )
          }
        />
      </div>
    </div>
  );
}
