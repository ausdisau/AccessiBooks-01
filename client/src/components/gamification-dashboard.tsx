import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Trophy, Lock, Star, BookOpen, Clock, Flame, Target,
  Medal, Crown, Zap, Users, Calendar, CheckCircle2, Loader2,
  ChevronRight, Award, TrendingUp,
} from "lucide-react";
import type {
  GamificationProfile,
  AchievementMeta,
  LeaderboardEntry,
  ReadingChallenge,
  UserChallengeProgress,
} from "@shared/schema";

function ProgressRing({ progress, size = 120, strokeWidth = 10 }: { progress: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(Math.max(progress, 0), 100);
  const offset = circumference - (clampedProgress / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted/30 dark:text-muted/20"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#progressGradient)"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700 ease-out"
      />
      <defs>
        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 bg-muted/50 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-muted/50 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function OverviewTab({ profile }: { profile: GamificationProfile }) {
  const { toast } = useToast();
  const [showGoalSelector, setShowGoalSelector] = useState(false);

  const goalMutation = useMutation({
    mutationFn: async (dailyMinutesGoal: number) => {
      await apiRequest("PUT", "/api/gamification/goal", { dailyMinutesGoal });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/profile"] });
      setShowGoalSelector(false);
      toast({ title: "Goal updated!", description: "Your daily listening goal has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update goal", description: error.message, variant: "destructive" });
    },
  });

  const minutesListened = profile.dailyLog?.minutesListened ?? 0;
  const dailyGoal = profile.goal.dailyMinutesGoal;
  const goalProgress = dailyGoal > 0 ? Math.min((minutesListened / dailyGoal) * 100, 100) : 0;

  const xpProgress = profile.xpForCurrentLevel > 0
    ? ((profile.xp.totalXp - (profile.xpForCurrentLevel)) / (profile.xpToNextLevel - profile.xpForCurrentLevel)) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="relative overflow-hidden border-amber-200/50 dark:border-amber-800/50 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="text-5xl">🔥</div>
              <div>
                <div className="text-3xl font-bold text-amber-700 dark:text-amber-400">
                  {profile.streak.currentStreak} Day{profile.streak.currentStreak !== 1 ? "s" : ""}!
                </div>
                <p className="text-sm text-amber-600/80 dark:text-amber-500/80 font-medium">
                  Current Streak
                </p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Trophy className="h-3 w-3" />
                  Longest: {profile.streak.longestStreak} days
                </p>
              </div>
            </div>
            <div className="absolute -right-4 -bottom-4 text-8xl opacity-10">🔥</div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-purple-200/50 dark:border-purple-800/50 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/40 dark:to-indigo-950/40">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                <Star className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                  Level {profile.level}
                </div>
                <p className="text-xs text-muted-foreground">
                  {profile.xp.totalXp.toLocaleString()} XP total
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <Progress value={Math.max(0, Math.min(xpProgress, 100))} className="h-2.5 bg-purple-100 dark:bg-purple-900/50 [&>[role=progressbar]]:bg-gradient-to-r [&>[role=progressbar]]:from-purple-500 [&>[role=progressbar]]:to-indigo-500" />
              <p className="text-xs text-muted-foreground text-right">
                {profile.xpToNextLevel - profile.xp.totalXp > 0
                  ? `${(profile.xpToNextLevel - profile.xp.totalXp).toLocaleString()} XP to Level ${profile.level + 1}`
                  : "Max level reached!"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Daily Goal</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowGoalSelector(!showGoalSelector)}
              >
                Adjust
              </Button>
            </div>
            {showGoalSelector && (
              <div className="flex gap-2 mb-3 flex-wrap">
                {[15, 30, 45, 60].map((mins) => (
                  <Button
                    key={mins}
                    variant={dailyGoal === mins ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    disabled={goalMutation.isPending}
                    onClick={() => goalMutation.mutate(mins)}
                  >
                    {mins}m
                  </Button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-center relative">
              <ProgressRing progress={goalProgress} size={100} strokeWidth={8} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold">{minutesListened}</span>
                <span className="text-[10px] text-muted-foreground">/ {dailyGoal} min</span>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-2">
              {goalProgress >= 100 ? "🎉 Goal reached!" : `${Math.round(goalProgress)}% complete`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total XP", value: profile.xp.totalXp.toLocaleString(), icon: Zap, color: "text-purple-500" },
          { label: "Books Completed", value: profile.xp.booksCompleted.toString(), icon: BookOpen, color: "text-green-500" },
          { label: "Minutes Listened", value: profile.xp.totalListeningMinutes.toLocaleString(), icon: Clock, color: "text-blue-500" },
          { label: "Reviews Written", value: profile.xp.reviewsWritten.toString(), icon: Award, color: "text-amber-500" },
        ].map((stat) => (
          <Card key={stat.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`${stat.color} bg-muted/50 p-2 rounded-lg`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AchievementsTab({ profile }: { profile: GamificationProfile }) {
  const { data: allAchievements, isLoading } = useQuery<AchievementMeta[]>({
    queryKey: ["/api/gamification/achievements"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-32 bg-muted/50 rounded-xl" />
        ))}
      </div>
    );
  }

  const unlockedTypes = new Set(profile.achievements.map((a) => a.achievementType));
  const unlockedMap = new Map(profile.achievements.map((a) => [a.achievementType, a.unlockedAt]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Trophy className="h-4 w-4 text-green-500" />
        <span>{unlockedTypes.size} of {allAchievements?.length ?? 0} unlocked</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {allAchievements?.map((achievement) => {
          const isUnlocked = unlockedTypes.has(achievement.type);
          const unlockedAt = unlockedMap.get(achievement.type);

          return (
            <Card
              key={achievement.type}
              className={`relative overflow-hidden transition-all duration-300 ${
                isUnlocked
                  ? "border-green-200/60 dark:border-green-800/60 bg-gradient-to-br from-green-50/50 to-emerald-50/50 dark:from-green-950/30 dark:to-emerald-950/30 hover:shadow-lg hover:shadow-green-100/50 dark:hover:shadow-green-900/20"
                  : "opacity-60 grayscale hover:opacity-80"
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <span className="text-3xl">{achievement.icon}</span>
                    {!isUnlocked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-full">
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm truncate">{achievement.name}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {achievement.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs font-medium text-purple-600 dark:text-purple-400 flex items-center gap-0.5">
                        <Zap className="h-3 w-3" /> +{achievement.xpReward} XP
                      </span>
                      {isUnlocked && unlockedAt && (
                        <span className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-0.5">
                          <CheckCircle2 className="h-3 w-3" />
                          {new Date(unlockedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
              {isUnlocked && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function LeaderboardTab() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<"weekly" | "monthly" | "alltime">("weekly");

  const { data: leaderboard, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/gamification/leaderboard", `?period=${period}&limit=20`],
  });

  const medalColors: Record<number, string> = {
    1: "text-yellow-500 bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-800",
    2: "text-gray-400 bg-gray-50 dark:bg-gray-950/40 border-gray-200 dark:border-gray-800",
    3: "text-amber-700 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
  };

  const medalIcons: Record<number, typeof Crown> = {
    1: Crown,
    2: Medal,
    3: Medal,
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["weekly", "monthly", "alltime"] as const).map((p) => (
          <Button
            key={p}
            variant={period === p ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {p === "weekly" ? "Weekly" : p === "monthly" ? "Monthly" : "All Time"}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-muted/50 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {leaderboard?.map((entry) => {
            const isCurrentUser = user?.id === entry.userId;
            const isTopThree = entry.rank <= 3;
            const MedalIcon = medalIcons[entry.rank];
            const initials = `${entry.firstName?.[0] ?? ""}${entry.lastName?.[0] ?? ""}`.toUpperCase() || "?";

            return (
              <Card
                key={entry.userId}
                className={`transition-all duration-200 ${
                  isCurrentUser
                    ? "ring-2 ring-primary/50 bg-primary/5 dark:bg-primary/10"
                    : isTopThree
                    ? medalColors[entry.rank]
                    : "hover:shadow-sm"
                }`}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-8 text-center font-bold text-lg">
                    {isTopThree && MedalIcon ? (
                      <MedalIcon className={`h-6 w-6 mx-auto ${entry.rank === 1 ? "text-yellow-500" : entry.rank === 2 ? "text-gray-400" : "text-amber-700"}`} />
                    ) : (
                      <span className="text-muted-foreground">{entry.rank}</span>
                    )}
                  </div>

                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
                    {entry.profileImageUrl ? (
                      <img src={entry.profileImageUrl} alt="" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      initials
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">
                        {entry.firstName ?? "User"} {entry.lastName ?? ""}
                      </span>
                      {isCurrentUser && (
                        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">You</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Level {entry.level}</p>
                  </div>

                  <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3 w-3" /> {entry.booksCompleted}
                    </span>
                    <span className="flex items-center gap-1">
                      <Flame className="h-3 w-3 text-amber-500" /> {entry.currentStreak}d
                    </span>
                  </div>

                  <div className="text-right">
                    <div className="font-bold text-sm text-purple-600 dark:text-purple-400">
                      {entry.totalXp.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-muted-foreground">XP</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {(!leaderboard || leaderboard.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No leaderboard data yet. Start listening to climb the ranks!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChallengesTab() {
  const { toast } = useToast();

  const { data: challenges, isLoading: challengesLoading } = useQuery<ReadingChallenge[]>({
    queryKey: ["/api/gamification/challenges"],
  });

  const { data: myProgress, isLoading: progressLoading } = useQuery<UserChallengeProgress[]>({
    queryKey: ["/api/gamification/challenges/mine"],
  });

  const joinMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      await apiRequest("POST", `/api/gamification/challenges/${challengeId}/join`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/challenges/mine"] });
      toast({ title: "Challenge joined!", description: "Good luck! Start reading to make progress." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to join challenge", description: error.message, variant: "destructive" });
    },
  });

  const isLoading = challengesLoading || progressLoading;

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 bg-muted/50 rounded-xl" />
        ))}
      </div>
    );
  }

  const progressMap = new Map(myProgress?.map((p) => [p.challengeId, p]));

  return (
    <div className="space-y-4">
      {challenges?.map((challenge) => {
        const progress = progressMap.get(challenge.id);
        const hasJoined = !!progress;
        const isCompleted = !!progress?.completedAt;
        const booksProgress = progress?.booksCompleted ?? 0;
        const progressPercent = challenge.targetBooks > 0 ? (booksProgress / challenge.targetBooks) * 100 : 0;

        const endDate = new Date(challenge.endDate);
        const now = new Date();
        const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

        return (
          <Card
            key={challenge.id}
            className={`relative overflow-hidden transition-all ${
              isCompleted
                ? "border-green-200/60 dark:border-green-800/60 bg-gradient-to-r from-green-50/30 to-emerald-50/30 dark:from-green-950/20 dark:to-emerald-950/20"
                : "hover:shadow-md"
            }`}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">{challenge.badgeIcon || "📖"}</span>
                    <h3 className="font-semibold">{challenge.title}</h3>
                    {isCompleted && (
                      <span className="bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Completed
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {challenge.description}
                  </p>

                  {hasJoined && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {booksProgress} / {challenge.targetBooks} books
                        </span>
                        <span className="text-muted-foreground">{Math.round(progressPercent)}%</span>
                      </div>
                      <Progress value={progressPercent} className="h-2" />
                    </div>
                  )}

                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Target className="h-3 w-3" /> {challenge.targetBooks} books
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {daysRemaining > 0 ? `${daysRemaining} days left` : "Ended"}
                    </span>
                  </div>
                </div>

                {!hasJoined && (
                  <Button
                    onClick={() => joinMutation.mutate(challenge.id)}
                    disabled={joinMutation.isPending}
                    className="shrink-0"
                    size="sm"
                  >
                    {joinMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>Join<ChevronRight className="h-4 w-4 ml-1" /></>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {(!challenges || challenges.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <Target className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No active challenges right now. Check back soon!</p>
        </div>
      )}
    </div>
  );
}

export function GamificationDashboard() {
  const { data: profile, isLoading } = useQuery<GamificationProfile>({
    queryKey: ["/api/gamification/profile"],
  });

  return (
    <div className="w-full max-w-5xl mx-auto p-4 md:p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Your Progress</h2>
          <p className="text-sm text-muted-foreground">Track your reading journey</p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <Flame className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="achievements" className="flex items-center gap-1.5">
            <Trophy className="h-4 w-4" />
            <span className="hidden sm:inline">Achievements</span>
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Leaderboard</span>
          </TabsTrigger>
          <TabsTrigger value="challenges" className="flex items-center gap-1.5">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Challenges</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {isLoading || !profile ? <LoadingSkeleton /> : <OverviewTab profile={profile} />}
        </TabsContent>

        <TabsContent value="achievements">
          {isLoading || !profile ? <LoadingSkeleton /> : <AchievementsTab profile={profile} />}
        </TabsContent>

        <TabsContent value="leaderboard">
          <LeaderboardTab />
        </TabsContent>

        <TabsContent value="challenges">
          <ChallengesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
