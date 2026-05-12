import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Clock, BookOpen, Flame, Trophy, Calendar,
  Share2, Star, BarChart3
} from "lucide-react";
import { useRef } from "react";

interface YearInReview {
  year: number;
  totalMinutes: number;
  totalHours: number;
  totalBooksCompleted: number;
  totalDaysActive: number;
  longestStreak: number;
  achievementsEarned: number;
  currentLevel: number;
  totalXp: number;
  monthlyData: { month: number; minutes: number; books: number }[];
  mostActiveDay: string;
  bestMonth: { name: string; minutes: number };
}

export function YearInReview() {
  const year = new Date().getFullYear();
  const cardRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<YearInReview>({
    queryKey: [`/api/gamification/year-in-review?year=${year}`],
  });

  const handleShare = async () => {
    const text = `My ${year} AccessiBooks Year in Review:\n` +
      `📚 ${data?.totalBooksCompleted || 0} books completed\n` +
      `⏱️ ${data?.totalHours || 0} hours listened\n` +
      `🔥 ${data?.longestStreak || 0} day longest streak\n` +
      `🏆 ${data?.achievementsEarned || 0} achievements earned\n` +
      `Check out AccessiBooks!`;
    
    if (navigator.share) {
      await navigator.share({ title: `My ${year} Reading Year`, text });
    } else {
      await navigator.clipboard.writeText(text);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-48 mx-auto" />
            <div className="h-4 bg-muted rounded w-32 mx-auto" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.totalMinutes === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {year} Year in Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Start listening to build your year in review!
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxMonthMinutes = Math.max(...data.monthlyData.map(m => m.minutes), 1);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <Card className="overflow-hidden" ref={cardRef}>
      <div className="bg-gradient-to-br from-primary/90 via-primary to-primary/80 text-primary-foreground p-6 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm opacity-80 font-medium uppercase tracking-wider">Your</p>
            <h2 className="text-3xl md:text-4xl font-bold">{year} Year in Review</h2>
          </div>
          <Button variant="secondary" size="sm" onClick={handleShare} className="gap-1">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </div>
        <p className="text-sm opacity-80">Here's what you accomplished this year</p>
      </div>

      <CardContent className="p-4 md:p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Clock className="h-5 w-5 text-blue-500" />} value={`${data.totalHours}h`} label="Listened" color="blue" />
          <StatCard icon={<BookOpen className="h-5 w-5 text-green-500" />} value={data.totalBooksCompleted.toString()} label="Books Completed" color="green" />
          <StatCard icon={<Flame className="h-5 w-5 text-orange-500" />} value={`${data.longestStreak}d`} label="Longest Streak" color="orange" />
          <StatCard icon={<Trophy className="h-5 w-5 text-yellow-500" />} value={data.achievementsEarned.toString()} label="Achievements" color="yellow" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-lg font-bold">{data.totalDaysActive}</div>
            <div className="text-xs text-muted-foreground">Days Active</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-lg font-bold">{data.mostActiveDay}</div>
            <div className="text-xs text-muted-foreground">Best Day</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-lg font-bold">Lv.{data.currentLevel}</div>
            <div className="text-xs text-muted-foreground">Current Level</div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1">
            <BarChart3 className="h-4 w-4" />
            Monthly Activity
          </h3>
          <div className="flex items-end gap-1 h-32">
            {data.monthlyData.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div 
                  className="w-full bg-primary/20 hover:bg-primary/40 rounded-t transition-colors relative group"
                  style={{ height: `${Math.max((m.minutes / maxMonthMinutes) * 100, 4)}%` }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                    {Math.round(m.minutes / 60 * 10) / 10}h
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">{monthNames[i]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-muted/30 rounded-lg p-4 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1">
            <Star className="h-4 w-4 text-yellow-500" />
            Fun Facts
          </h3>
          <ul className="text-sm space-y-1.5 text-muted-foreground">
            <li>Your best month was <span className="font-medium text-foreground">{data.bestMonth.name}</span> with {Math.round(data.bestMonth.minutes / 60 * 10) / 10} hours</li>
            <li>You were most active on <span className="font-medium text-foreground">{data.mostActiveDay}s</span></li>
            <li>You earned <span className="font-medium text-foreground">{data.totalXp.toLocaleString()} XP</span> total</li>
            {data.totalBooksCompleted > 0 && (
              <li>That's about <span className="font-medium text-foreground">{Math.round(data.totalBooksCompleted / 12 * 10) / 10}</span> books per month</li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ icon, value, label, color }: { icon: React.ReactNode; value: string; label: string; color: string }) {
  const bgMap: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-950/30",
    green: "bg-green-50 dark:bg-green-950/30",
    orange: "bg-orange-50 dark:bg-orange-950/30",
    yellow: "bg-yellow-50 dark:bg-yellow-950/30",
  };
  return (
    <div className={`rounded-lg p-3 ${bgMap[color] || "bg-muted/50"}`}>
      <div className="flex items-center gap-2 mb-1">{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
