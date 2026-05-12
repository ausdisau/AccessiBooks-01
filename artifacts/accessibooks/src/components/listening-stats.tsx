import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { localStorageService, ListeningStats as Stats } from "@/lib/storage";
import {
  Clock,
  BookOpen,
  Trophy,
  Flame,
  Award,
  Target,
  Headphones,
  Zap,
  Star,
  Calendar,
} from "lucide-react";

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: typeof Trophy;
  color: string;
}

const BADGES: Badge[] = [
  { id: "first_hour", name: "First Hour", description: "Listen for 1 hour", icon: Clock, color: "text-blue-500" },
  { id: "ten_hours", name: "Dedicated Listener", description: "Listen for 10 hours", icon: Headphones, color: "text-green-500" },
  { id: "fifty_hours", name: "Bookworm", description: "Listen for 50 hours", icon: BookOpen, color: "text-purple-500" },
  { id: "hundred_hours", name: "Audio Master", description: "Listen for 100 hours", icon: Zap, color: "text-yellow-500" },
  { id: "first_book", name: "First Finish", description: "Complete your first book", icon: Trophy, color: "text-orange-500" },
  { id: "five_books", name: "Story Seeker", description: "Complete 5 books", icon: Target, color: "text-cyan-500" },
  { id: "ten_books", name: "Literary Lion", description: "Complete 10 books", icon: Award, color: "text-pink-500" },
  { id: "twentyfive_books", name: "Reading Royalty", description: "Complete 25 books", icon: Star, color: "text-amber-500" },
  { id: "week_streak", name: "Week Warrior", description: "Listen 7 days in a row", icon: Flame, color: "text-red-500" },
  { id: "month_streak", name: "Monthly Master", description: "Listen 30 days in a row", icon: Calendar, color: "text-indigo-500" },
];

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours >= 1) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function ListeningStatsCard() {
  const [stats, setStats] = useState<Stats>(() => localStorageService.getStats());

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(localStorageService.getStats());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const earnedBadges = BADGES.filter(b => stats.badges.includes(b.id));
  const unearnedBadges = BADGES.filter(b => !stats.badges.includes(b.id));
  const totalHours = stats.totalSecondsListened / 3600;

  // Calculate next milestone
  const hourMilestones = [1, 10, 50, 100, 250, 500];
  const nextHourMilestone = hourMilestones.find(m => totalHours < m) || 500;
  const progressToNextMilestone = (totalHours / nextHourMilestone) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          Your Listening Stats
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-secondary/50 rounded-lg p-4 text-center">
            <Clock className="h-8 w-8 mx-auto mb-2 text-primary" />
            <div className="text-2xl font-bold">{formatDuration(stats.totalSecondsListened)}</div>
            <div className="text-xs text-muted-foreground">Total Listening Time</div>
          </div>
          
          <div className="bg-secondary/50 rounded-lg p-4 text-center">
            <BookOpen className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <div className="text-2xl font-bold">{stats.booksCompleted}</div>
            <div className="text-xs text-muted-foreground">Books Completed</div>
          </div>
          
          <div className="bg-secondary/50 rounded-lg p-4 text-center">
            <Flame className="h-8 w-8 mx-auto mb-2 text-orange-500" />
            <div className="text-2xl font-bold">{stats.currentStreak}</div>
            <div className="text-xs text-muted-foreground">Day Streak</div>
          </div>
          
          <div className="bg-secondary/50 rounded-lg p-4 text-center">
            <Award className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
            <div className="text-2xl font-bold">{earnedBadges.length}</div>
            <div className="text-xs text-muted-foreground">Badges Earned</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress to {nextHourMilestone}h milestone</span>
            <span>{totalHours.toFixed(1)}h / {nextHourMilestone}h</span>
          </div>
          <Progress value={Math.min(progressToNextMilestone, 100)} className="h-2" />
        </div>

        {earnedBadges.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Star className="h-4 w-4" /> Earned Badges
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {earnedBadges.map((badge) => (
                <div
                  key={badge.id}
                  className="bg-secondary/50 rounded-lg p-3 text-center hover:bg-secondary transition-colors"
                  title={badge.description}
                >
                  <badge.icon className={`h-8 w-8 mx-auto mb-1 ${badge.color}`} />
                  <div className="text-xs font-medium truncate">{badge.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {unearnedBadges.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3 text-muted-foreground">Badges to Unlock</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {unearnedBadges.slice(0, 5).map((badge) => (
                <div
                  key={badge.id}
                  className="bg-secondary/30 rounded-lg p-3 text-center opacity-50"
                  title={badge.description}
                >
                  <badge.icon className="h-8 w-8 mx-auto mb-1 text-muted-foreground" />
                  <div className="text-xs font-medium truncate">{badge.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{badge.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ListeningStatsCompact() {
  const [stats, setStats] = useState<Stats>(() => localStorageService.getStats());

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(localStorageService.getStats());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1">
        <Clock className="h-4 w-4 text-primary" />
        <span>{formatDuration(stats.totalSecondsListened)}</span>
      </div>
      <div className="flex items-center gap-1">
        <Flame className="h-4 w-4 text-orange-500" />
        <span>{stats.currentStreak} day streak</span>
      </div>
      <div className="flex items-center gap-1">
        <Trophy className="h-4 w-4 text-yellow-500" />
        <span>{stats.badges.length} badges</span>
      </div>
    </div>
  );
}
