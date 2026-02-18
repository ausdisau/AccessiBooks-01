import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Crown, BookOpen, Clock, Headphones, Lock, Check, X, TrendingUp, BarChart3 } from "lucide-react";
import { localStorageService } from "@/lib/storage";

interface UsageDashboardProps {
  isPremium: boolean;
  onUpgrade: () => void;
}

const AD_SECONDS_PER_IMPRESSION = 30;
const AD_IMPRESSIONS_KEY = "accessibooks_ad_impressions";

function getAdImpressions(): number {
  try {
    const stored = localStorage.getItem(AD_IMPRESSIONS_KEY);
    return stored ? parseInt(stored, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

const FEATURES = [
  { feature: "Bookmarks", free: "5 per book", premium: "Unlimited" },
  { feature: "Speed", free: "Up to 1.5x", premium: "Up to 3x" },
  { feature: "Audio quality", free: "Standard", premium: "High Quality" },
  { feature: "Ads", free: "With ads", premium: "Ad-free" },
  { feature: "Skips", free: "Limited", premium: "Unlimited" },
  { feature: "Downloads", free: "Not available", premium: "Offline listening" },
];

export function UsageDashboard({ isPremium, onUpgrade }: UsageDashboardProps) {
  const [stats, setStats] = useState(localStorageService.getStats());

  useEffect(() => {
    setStats(localStorageService.getStats());
  }, []);

  const totalHours = Math.floor(stats.totalSecondsListened / 3600);
  const totalMinutes = Math.floor((stats.totalSecondsListened % 3600) / 60);
  const progressPercent = Math.min((stats.totalSecondsListened / (100 * 3600)) * 100, 100);

  const adImpressions = getAdImpressions();
  const adMinutes = Math.round((adImpressions * AD_SECONDS_PER_IMPRESSION) / 60);
  const adHoursPerMonth = Math.max(1, Math.round(adMinutes / 4));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            My Usage
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Your monthly listening dashboard</p>
        </div>
        {!isPremium && (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1">
            <Crown className="h-3 w-3" />
            Free Plan
          </Badge>
        )}
        {isPremium && (
          <Badge className="bg-amber-500 text-white gap-1">
            <Crown className="h-3 w-3" />
            Premium
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-2">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hours Listened</p>
                <p className="text-2xl font-bold">{totalHours}<span className="text-base font-normal text-muted-foreground">h {totalMinutes}m</span></p>
              </div>
            </div>
            <Progress value={progressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {progressPercent < 100 ? `${Math.round(progressPercent)}% toward 100h milestone` : "100h milestone reached!"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <BookOpen className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Books Completed</p>
                <p className="text-2xl font-bold">{stats.booksCompleted}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              {stats.booksStarted} started total
            </div>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Headphones className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Listening Streak</p>
                <p className="text-2xl font-bold">{stats.currentStreak} <span className="text-base font-normal text-muted-foreground">days</span></p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              Best: {stats.longestStreak} days
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            Free vs Premium
            <Crown className="h-4 w-4 text-amber-500" />
          </CardTitle>
          <CardDescription>See what you're missing with a Premium subscription</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-3 bg-muted/50 px-4 py-2 text-sm font-medium border-b">
              <span>Feature</span>
              <span className="text-center">Free</span>
              <span className="text-center text-amber-600 flex items-center justify-center gap-1">
                <Crown className="h-3 w-3" /> Premium
              </span>
            </div>
            {FEATURES.map((row, i) => (
              <div key={row.feature} className={`grid grid-cols-3 px-4 py-3 text-sm items-center ${i < FEATURES.length - 1 ? "border-b" : ""}`}>
                <span className="font-medium">{row.feature}</span>
                <span className="text-center text-muted-foreground flex items-center justify-center gap-1">
                  {row.free === "Not available" || row.free === "With ads" || row.free === "Limited" ? (
                    <X className="h-3.5 w-3.5 text-red-400" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                  {row.free}
                </span>
                <span className="text-center text-amber-600 font-medium flex items-center justify-center gap-1">
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  {row.premium}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {!isPremium && (
        <Card className="border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-amber-500/10 to-orange-500/5">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Crown className="h-6 w-6 text-amber-500" />
              </div>
              <h3 className="text-xl font-bold">You're Missing Out</h3>
              <div className="space-y-2 text-sm">
                {adMinutes > 0 && (
                  <p className="text-muted-foreground">
                    You've listened to approximately <span className="font-semibold text-red-500">{adMinutes} minutes</span> of ads this month
                  </p>
                )}
                <p className="text-muted-foreground">
                  Upgrade to save <span className="font-semibold text-amber-600">{adHoursPerMonth}+ hours/month</span> on ads alone
                </p>
              </div>
              <Button
                size="lg"
                className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8"
                onClick={onUpgrade}
              >
                <Crown className="h-4 w-4 mr-2" />
                Start 7-Day Free Trial
              </Button>
              <p className="text-xs text-muted-foreground">No commitment. Cancel anytime.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}