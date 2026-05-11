import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { Calendar, MessageSquare, Trophy, BarChart3, Sparkles, BookOpen, Heart } from "lucide-react";
import type { Book } from "@shared/schema";
import { UpgradeNudge } from "@/components/upgrade-nudge";

const ReferralSection = lazy(() => import('@/components/referral-section').then(m => ({ default: m.ReferralSection })));

interface HubData {
  recentThreads: Array<{ id: string; title: string; replyCount: number; topicId: string }>;
  upcomingEvents: Array<{ id: string; title: string; scheduledStartAt: string; status: string; eventType: string }>;
  gamification: { currentStreak: number; longestStreak: number; totalXp: number; level: number; framing: "active" | "welcome_back" | "paused" } | null;
  friendActivity: Array<{ bookId: string; bookTitle: string; bookAuthor: string; listeners: number }>;
  weeklyRecap: { totalMinutes: number; booksFinished: number; days: number } | null;
  plan: { tier: string; paid: boolean };
}

interface AuthUser { firstName?: string | null; subscriptionTier?: string | null; }

export default function HubPage() {
  const { user } = useAuth() as { user: AuthUser | null | undefined };
  const { data, isLoading } = useQuery<HubData>({
    queryKey: ["/api/hub"],
  });
  const { data: forYou } = useQuery<{ recommendations: Book[] } | Book[]>({
    queryKey: ["/api/recommendations"],
  });
  const forYouBooks: Book[] = Array.isArray(forYou)
    ? forYou
    : (forYou?.recommendations ?? []);

  if (isLoading) {
    return (
      <div className="container max-w-6xl mx-auto p-4 space-y-4">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  const greeting = data?.gamification?.framing === "welcome_back"
    ? "Welcome back — your library missed you."
    : data?.gamification?.framing === "paused"
    ? "Your streak is paused. Take the time you need."
    : user?.firstName ? `Hi, ${user.firstName}.` : "Welcome to AccessiBooks.";

  return (
    <div className="container max-w-6xl mx-auto p-4 space-y-6" data-testid="page-hub">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>
        <p className="text-muted-foreground mt-1">Your hub — community, events, progress, and what's new.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gamification card */}
        {data?.gamification ? (
          <Card data-testid="hub-gamification">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" /> Your progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-3">
                <p className="text-3xl font-bold">{data.gamification.currentStreak}</p>
                <p className="text-sm text-muted-foreground">day streak</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Level {data.gamification.level} · {data.gamification.totalXp.toLocaleString()} XP
              </p>
              {data.gamification.framing === "welcome_back" && (
                <p className="text-sm mt-3 text-primary">
                  Listen for 5 minutes to start a fresh streak — no shame, no pressure.
                </p>
              )}
              {data.gamification.framing === "paused" && (
                <p className="text-sm mt-3 text-muted-foreground">
                  Resume anytime in <Link href="/settings"><span className="underline">Settings</span></Link>.
                </p>
              )}
              <Link href="/stats">
                <Button variant="ghost" size="sm" className="mt-3" data-testid="hub-stats-link">View stats</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card data-testid="hub-calm-mode-info">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Calm Mode</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Streaks, leaderboards, and nudges are turned off — focus on the books.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Weekly recap */}
        {data?.weeklyRecap && (
          <Card data-testid="hub-recap">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" /> This week
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{data.weeklyRecap.totalMinutes}<span className="text-sm font-normal text-muted-foreground"> min</span></p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.weeklyRecap.booksFinished} finished · {data.weeklyRecap.days} active days
              </p>
            </CardContent>
          </Card>
        )}

        {/* Upgrade nudge — only if free, non-calm-mode, non-muted (server-checked) */}
        {!data?.plan.paid && (
          <UpgradeNudge
            surface="hub"
            reason="Ad-free listening, unlimited skips, and HD audio."
            onUpgrade={() => (window.location.href = "/pricing")}
          />
        )}
      </div>

      {/* For You rail — personalized recommendations */}
      {forYouBooks.length > 0 && (
        <Card data-testid="hub-for-you">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Heart className="h-4 w-4 text-rose-500" aria-hidden="true" /> For you
            </CardTitle>
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="hub-foryou-all">Browse library</Button>
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {forYouBooks.slice(0, 6).map((b) => (
                <li key={b.id} data-testid={`hub-foryou-${b.id}`}>
                  <Link href={`/?book=${encodeURIComponent(b.id)}`}>
                    <a className="block group focus-visible:ring-2 focus-visible:ring-primary rounded-md">
                      {b.coverImage ? (
                        <img
                          src={b.coverImage}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          className="aspect-[2/3] w-full rounded-md object-cover bg-muted group-hover:opacity-90 transition"
                        />
                      ) : (
                        <div className="aspect-[2/3] w-full rounded-md bg-muted flex items-center justify-center">
                          <BookOpen className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                        </div>
                      )}
                      <p className="text-xs font-medium mt-1 line-clamp-2">{b.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{b.author}</p>
                    </a>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upcoming events */}
        <Card data-testid="hub-events">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" aria-hidden="true" /> Upcoming events
            </CardTitle>
            <Link href="/events">
              <Button variant="ghost" size="sm" data-testid="hub-events-all">See all</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {(data?.upcomingEvents ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled — check back soon.</p>
            ) : (
              <ul className="space-y-2">
                {(data?.upcomingEvents ?? []).slice(0, 5).map(ev => (
                  <li key={ev.id} className="flex items-start justify-between gap-2 text-sm" data-testid={`hub-event-${ev.id}`}>
                    <div>
                      <Link href="/events"><span className="font-medium hover:underline">{ev.title}</span></Link>
                      <p className="text-xs text-muted-foreground">
                        {new Date(ev.scheduledStartAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                    {ev.status === "live" && <Badge variant="destructive">Live</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent bulletin threads */}
        <Card data-testid="hub-bulletin">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" /> Community
            </CardTitle>
            <Link href="/community">
              <Button variant="ghost" size="sm" data-testid="hub-community-all">Open</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {(data?.recentThreads ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Be the first to start a conversation.</p>
            ) : (
              <ul className="space-y-2">
                {(data?.recentThreads ?? []).slice(0, 5).map(t => (
                  <li key={t.id} className="text-sm" data-testid={`hub-thread-${t.id}`}>
                    <Link href="/community"><span className="font-medium hover:underline">{t.title}</span></Link>
                    <p className="text-xs text-muted-foreground">{t.replyCount} replies</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Friend activity */}
        {(data?.friendActivity ?? []).length > 0 && (
          <Card className="md:col-span-2" data-testid="hub-friends">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Trending this week
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {data!.friendActivity.slice(0, 6).map((f, i) => (
                  <li key={i} className="text-sm flex items-start gap-2" data-testid={`hub-friend-${i}`}>
                    <BookOpen className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-medium line-clamp-1">{f.bookTitle}</p>
                      <p className="text-xs text-muted-foreground">{f.bookAuthor} · {f.listeners} listening</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Referrals — share & give */}
      {user && (
        <Suspense fallback={<Skeleton className="h-32" />}>
          <ReferralSection />
        </Suspense>
      )}
    </div>
  );
}
