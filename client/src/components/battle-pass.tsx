import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Trophy, Lock, Star, Zap, Shield, Gift, Sparkles,
  Crown, Loader2, CheckCircle2, Clock, Users, ChevronRight,
  Snowflake, Award, Target,
} from "lucide-react";
import type { BattlePass, BattlePassMilestone, BattlePassPurchase } from "@shared/schema";

interface BattlePassData {
  season: BattlePass | null;
  milestones: BattlePassMilestone[];
  purchase: (BattlePassPurchase & { currentTier: number; xpEarned: number }) | null;
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
  isPurchased,
  onClaim,
  isClaiming,
}: {
  milestone: BattlePassMilestone;
  currentXp: number;
  isClaimed: boolean;
  isPurchased: boolean;
  onClaim: (id: string) => void;
  isClaiming: boolean;
}) {
  const isReached = currentXp >= milestone.xpRequired;
  const progress = Math.min((currentXp / milestone.xpRequired) * 100, 100);
  const Icon = REWARD_ICONS[milestone.rewardType] || Gift;
  const gradientColor = REWARD_COLORS[milestone.rewardType] || "from-gray-500 to-gray-600";

  return (
    <div className={`relative flex items-center gap-4 p-4 rounded-xl border transition-all ${
      isClaimed
        ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
        : isReached && isPurchased
          ? "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border-amber-200 dark:border-amber-800 shadow-md"
          : "bg-card border-border"
    }`}>
      <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${
        isClaimed
          ? "bg-green-500 text-white"
          : isReached
            ? `bg-gradient-to-br ${gradientColor} text-white`
            : "bg-muted text-muted-foreground"
      }`}>
        {isClaimed ? (
          <CheckCircle2 className="h-6 w-6" />
        ) : isReached ? (
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
      </div>

      <div className="flex-shrink-0">
        {isClaimed ? (
          <span className="text-xs text-green-600 dark:text-green-400 font-medium">Claimed</span>
        ) : isReached && isPurchased ? (
          <Button
            size="sm"
            onClick={() => onClaim(milestone.id)}
            disabled={isClaiming}
            className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white"
          >
            {isClaiming ? <Loader2 className="h-4 w-4 animate-spin" /> : "Claim"}
          </Button>
        ) : !isPurchased && isReached ? (
          <Lock className="h-4 w-4 text-muted-foreground" />
        ) : null}
      </div>
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

  const purchaseMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/battle-pass/purchase"),
    onSuccess: async (response) => {
      const result = await response.json();
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        toast({ title: "Battle Pass Purchased!", description: "Start earning XP to unlock rewards!" });
        queryClient.invalidateQueries({ queryKey: ["/api/battle-pass/current"] });
      }
    },
    onError: () => {
      toast({ title: "Purchase Failed", description: "Could not purchase the battle pass.", variant: "destructive" });
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
    onError: () => {
      toast({ title: "Claim Failed", description: "Could not claim this milestone.", variant: "destructive" });
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

  const { season, milestones, purchase } = data;
  const currentXp = purchase?.xpEarned ?? 0;
  const claimedMilestones: string[] = purchase ? (() => { try { return JSON.parse(purchase.claimedMilestones); } catch { return []; } })() : [];
  const maxXp = milestones.length > 0 ? milestones[milestones.length - 1].xpRequired : 1;
  const overallProgress = Math.min((currentXp / maxXp) * 100, 100);

  const endDate = new Date(season.endDate);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <Card className="overflow-hidden">
        <div className="bg-card p-4 sm:p-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold">{season.seasonName}</h2>
                <p className="text-sm text-muted-foreground">{season.description}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {daysLeft} days left
              </div>
              <p className="text-lg font-bold text-primary">${(season.priceCents / 100).toFixed(2)}</p>
            </div>
          </div>

          {purchase ? (
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">Season Progress</span>
                <span className="font-medium">{currentXp.toLocaleString()} / {maxXp.toLocaleString()} XP</span>
              </div>
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-sm">
                <span className="text-muted-foreground font-medium text-xs">Current Tier: {purchase.currentTier} / {milestones.length}</span>
                <span className="text-muted-foreground font-medium text-xs">
                  {claimedMilestones.length} / {milestones.filter(m => currentXp >= m.xpRequired).length} rewards claimed
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {user ? (
                <Button
                  onClick={() => purchaseMutation.mutate()}
                  disabled={purchaseMutation.isPending}
                  className="bg-primary hover:bg-primary/90 text-white font-semibold"
                >
                  {purchaseMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Crown className="h-4 w-4 mr-2" />
                  )}
                  Get Battle Pass - ${(season.priceCents / 100).toFixed(2)}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Sign in to purchase the Battle Pass</p>
              )}
            </div>
          )}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Milestones
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLeaderboard(!showLeaderboard)}
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

      <div className="space-y-3">
        {milestones.map((milestone) => (
          <MilestoneCard
            key={milestone.id}
            milestone={milestone}
            currentXp={currentXp}
            isClaimed={claimedMilestones.includes(milestone.id)}
            isPurchased={!!purchase}
            onClaim={(id) => claimMutation.mutate(id)}
            isClaiming={claimMutation.isPending}
          />
        ))}
      </div>

      {!purchase && milestones.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center">
            <Lock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h4 className="font-semibold mb-1">Unlock All Rewards</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Purchase the Battle Pass to claim milestone rewards as you earn XP
            </p>
            {user && (
              <Button
                onClick={() => purchaseMutation.mutate()}
                disabled={purchaseMutation.isPending}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              >
                {purchaseMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Get Battle Pass - ${(season.priceCents / 100).toFixed(2)}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
