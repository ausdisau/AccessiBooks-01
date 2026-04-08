import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Building2, Users, BarChart3, GraduationCap, Mail, Loader2, CheckCircle,
  Briefcase, Target, BookOpen, Clock, Flame, Shield, UserMinus, UserPlus,
  TrendingUp, Award, Headphones, ChevronRight, Eye,
} from "lucide-react";

interface OrgAccount {
  id: string;
  orgName: string;
  orgType: string;
  maxSeats: number;
  currentSeats: number;
  isActive: boolean;
  weeklyGoalMinutes: number;
}

interface OrgMember {
  id: string;
  userId: string;
  role: string;
  addedAt: string | null;
  email: string | null;
  name: string | null;
  profileImage: string | null;
  listeningMinutesTotal: number;
  weeklyListeningMinutes: number;
  booksCompleted: number;
  currentStreak: number;
  activePreset: string | null;
}

interface MembersResponse {
  account: OrgAccount;
  members: OrgMember[];
  myRole: string;
}

interface TopBook {
  bookId: string;
  bookTitle: string;
  bookCover: string | null;
  plays: number;
}

interface PresetEntry {
  preset: string;
  count: number;
}

interface WeeklyDay {
  day: number;
  minutes: number;
}

interface AnalyticsResponse {
  totalListeningMinutes: number;
  totalBooksCompleted: number;
  avgCompletionRate: number;
  activeUsersCount: number;
  topBooks: TopBook[];
  presetDistribution: PresetEntry[];
  weeklyListeningMinutes: WeeklyDay[];
}

interface HistoryEntry {
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  bookCover: string | null;
  currentTime: number;
  totalDuration: number | null;
  lastPlayedAt: string | null;
  completedAt: string | null;
  playCount: number;
}

interface MemberDetailResponse {
  user: { id: string; email: string | null; name: string | null; profileImage: string | null };
  role: string;
  addedAt: string | null;
  history: HistoryEntry[];
  streak: { currentStreak: number; longestStreak: number } | null;
  xp: { totalListeningMinutes: number; booksCompleted: number } | null;
  accessibilityProfile: Record<string, unknown> | null;
  activePreset: string | null;
}

const PLANS = [
  {
    key: "education",
    name: "Education",
    price: "$99/mo",
    seats: 50,
    icon: GraduationCap,
    features: ["Up to 50 seats", "Ad-free for all members", "Premium features included", "Admin analytics dashboard"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "$299/mo",
    seats: 200,
    icon: Briefcase,
    features: ["Up to 200 seats", "Ad-free for all members", "Premium features included", "Admin analytics dashboard", "Priority support", "Custom branding"],
  },
];

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name) {
    const parts = name.trim().split(" ");
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : parts[0][0].toUpperCase();
  }
  return email?.[0]?.toUpperCase() ?? "?";
}

function MemberAvatar({ name, email, size = "md" }: { name?: string | null; email?: string | null; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  return (
    <div className={`${dim} rounded-full bg-primary/15 flex items-center justify-center font-semibold text-primary flex-shrink-0`}>
      {getInitials(name, email)}
    </div>
  );
}

function MemberDetailDrawer({ userId, open, onClose }: { userId: string | null; open: boolean; onClose: () => void }) {
  const memberDetailQuery = useQuery<MemberDetailResponse>({
    queryKey: ["/api/institutional/member", userId],
    queryFn: () =>
      fetch(`/api/institutional/member/${userId}`, { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("Failed to load member");
        return r.json() as Promise<MemberDetailResponse>;
      }),
    enabled: !!userId && open,
  });

  const detail = memberDetailQuery.data;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Member Profile
          </SheetTitle>
          <SheetDescription>Read-only view of this member's reading activity and accessibility settings.</SheetDescription>
        </SheetHeader>

        {memberDetailQuery.isLoading ? (
          <div className="space-y-4 mt-6">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : memberDetailQuery.isError || !detail ? (
          <p className="text-muted-foreground mt-6">Could not load member data.</p>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="flex items-center gap-3">
              <MemberAvatar name={detail.user?.name} email={detail.user?.email} />
              <div>
                <p className="font-semibold text-foreground">{detail.user?.name || detail.user?.email}</p>
                <p className="text-xs text-muted-foreground">{detail.user?.email}</p>
                <Badge variant={detail.role === "admin" ? "default" : "secondary"} className="mt-1 text-xs">
                  {detail.role}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-xl font-bold text-foreground">{Math.round((detail.xp?.totalListeningMinutes ?? 0) / 60)}h</p>
                <p className="text-xs text-muted-foreground">Listened</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-xl font-bold text-foreground">{detail.xp?.booksCompleted ?? 0}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-xl font-bold text-foreground">{detail.streak?.currentStreak ?? 0}</p>
                <p className="text-xs text-muted-foreground">Day Streak</p>
              </div>
            </div>

            {detail.activePreset && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1">Active Accessibility Preset</p>
                <p className="text-sm font-semibold text-foreground">{detail.activePreset}</p>
              </div>
            )}

            {detail.accessibilityProfile && Object.keys(detail.accessibilityProfile).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Accessibility Settings
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(detail.accessibilityProfile).map(([key, val]) => (
                    <div key={key} className="p-2 rounded bg-muted/40">
                      <p className="text-xs text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                      <p className="text-xs font-medium text-foreground truncate">{String(val)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4" /> Recent Reading History
              </h4>
              {detail.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reading history yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.history.slice(0, 8).map((h) => (
                    <div key={h.bookId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors">
                      {h.bookCover ? (
                        <img src={h.bookCover} alt={h.bookTitle} className="h-10 w-7 object-cover rounded flex-shrink-0" />
                      ) : (
                        <div className="h-10 w-7 bg-muted rounded flex items-center justify-center flex-shrink-0">
                          <BookOpen className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{h.bookTitle}</p>
                        <p className="text-xs text-muted-foreground">{h.bookAuthor ?? ""}</p>
                      </div>
                      {h.completedAt && (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">Done</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AdminDashboard({ data }: { data: MembersResponse }) {
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState("");
  const [weeklyGoal, setWeeklyGoal] = useState<string>(String(data.account?.weeklyGoalMinutes ?? 180));
  const [selectedMemberUserId, setSelectedMemberUserId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const account = data.account;
  const members = data.members;
  const myRole = data.myRole;

  const analyticsQuery = useQuery<AnalyticsResponse>({
    queryKey: ["/api/institutional/analytics"],
    queryFn: () =>
      fetch("/api/institutional/analytics", { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("Admin access required");
        return r.json() as Promise<AnalyticsResponse>;
      }),
    enabled: myRole === "admin",
  });
  const analytics = analyticsQuery.data;

  const inviteMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/institutional/invite", { email: inviteEmail }),
    onSuccess: () => {
      toast({ title: "Member added!", description: `${inviteEmail} has been added to your organization.` });
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["/api/institutional/members"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add member", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => apiRequest("DELETE", `/api/institutional/members/${memberId}`),
    onSuccess: () => {
      toast({ title: "Member removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/institutional/members"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove member", description: err.message, variant: "destructive" });
    },
  });

  const goalMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/institutional/settings", {
      weeklyGoalMinutes: parseInt(weeklyGoal, 10),
    }),
    onSuccess: () => {
      toast({ title: "Reading goal updated!" });
      queryClient.invalidateQueries({ queryKey: ["/api/institutional/members"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update goal", description: err.message, variant: "destructive" });
    },
  });

  const seatUsedPct = account ? Math.round((account.currentSeats / account.maxSeats) * 100) : 0;

  const openMemberDrawer = (userId: string) => {
    setSelectedMemberUserId(userId);
    setDrawerOpen(true);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 text-foreground">
            <Building2 className="h-8 w-8 text-primary" />
            {account?.orgName}
          </h1>
          <p className="text-muted-foreground capitalize mt-1">{account?.orgType} · Admin Portal</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="secondary" className="text-sm px-3 py-1">
            {account?.currentSeats} / {account?.maxSeats} seats
          </Badge>
          {account?.isActive && <Badge className="bg-emerald-600 text-white text-sm">Active</Badge>}
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Seat Usage</span>
            <span className="text-sm text-muted-foreground">{account?.currentSeats} / {account?.maxSeats}</span>
          </div>
          <Progress value={seatUsedPct} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">{seatUsedPct}% of seats used</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="members">
        <TabsList className="grid grid-cols-3 w-full max-w-sm">
          <TabsTrigger value="members">
            <Users className="h-4 w-4 mr-1.5" />Members
          </TabsTrigger>
          <TabsTrigger value="insights">
            <BarChart3 className="h-4 w-4 mr-1.5" />Insights
          </TabsTrigger>
          <TabsTrigger value="goals">
            <Target className="h-4 w-4 mr-1.5" />Goals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4 mt-4">
          {myRole === "admin" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" /> Invite Member by Email
                </CardTitle>
                <CardDescription>They must already have an AccessiBooks account.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="member@school.edu"
                      type="email"
                      className="pl-10"
                      onKeyDown={(e) => { if (e.key === "Enter" && inviteEmail) inviteMutation.mutate(); }}
                    />
                  </div>
                  <Button
                    onClick={() => inviteMutation.mutate()}
                    disabled={inviteMutation.isPending || !inviteEmail}
                  >
                    {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Members ({members.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {members.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p>No members yet. Invite your team above.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group">
                      <MemberAvatar name={m.name} email={m.email} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm text-foreground truncate">{m.name || m.email}</p>
                          <Badge variant={m.role === "admin" ? "default" : "secondary"} className="text-xs">
                            {m.role}
                          </Badge>
                          {m.activePreset && (
                            <Badge variant="outline" className="text-xs text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700">
                              {m.activePreset}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {Math.round(m.listeningMinutesTotal / 60)}h listened
                          </span>
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3 w-3" />
                            {m.booksCompleted} books
                          </span>
                          <span className="flex items-center gap-1">
                            <Flame className="h-3 w-3" />
                            {m.currentStreak}d streak
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openMemberDrawer(m.userId)}
                          title="View profile"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        {myRole === "admin" && m.role !== "admin" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMutation.mutate(m.id)}
                            disabled={removeMutation.isPending}
                            className="text-destructive hover:text-destructive"
                            title="Remove member"
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4 mt-4">
          {analyticsQuery.isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : myRole !== "admin" ? (
            <div className="p-8 text-center text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>Insights are available to admins only.</p>
            </div>
          ) : analytics ? (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                        <Headphones className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">
                          {Math.round(analytics.totalListeningMinutes / 60)}h
                        </p>
                        <p className="text-xs text-muted-foreground">Total Listening</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                        <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{analytics.totalBooksCompleted}</p>
                        <p className="text-xs text-muted-foreground">Books Completed</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-950 flex items-center justify-center">
                        <TrendingUp className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{analytics.avgCompletionRate}%</p>
                        <p className="text-xs text-muted-foreground">Completion Rate</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                        <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{analytics.activeUsersCount}</p>
                        <p className="text-xs text-muted-foreground">Active Readers</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      7-Day Listening Activity (minutes)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-1 h-24">
                      {analytics.weeklyListeningMinutes.map((d, i) => {
                        const maxMin = Math.max(...analytics.weeklyListeningMinutes.map((x) => x.minutes), 1);
                        const pct = (d.minutes / maxMin) * 100;
                        const dayLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                          (new Date().getDay() - 6 + i + 7) % 7
                        ];
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div
                              className="w-full rounded-sm bg-primary/70 transition-all"
                              style={{ height: `${Math.max(pct, 4)}%` }}
                              title={`${d.minutes} min`}
                            />
                            <span className="text-xs text-muted-foreground">{dayLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Award className="h-4 w-4 text-primary" />
                      Top Books This Org
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.topBooks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {analytics.topBooks.map((b, i) => (
                          <div key={b.bookId} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                            {b.bookCover && (
                              <img src={b.bookCover} alt={b.bookTitle} className="h-7 w-5 object-cover rounded" />
                            )}
                            <p className="text-sm text-foreground truncate flex-1">{b.bookTitle}</p>
                            <Badge variant="secondary" className="text-xs">{b.plays} plays</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {analytics.presetDistribution.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      Accessibility Preset Usage
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analytics.presetDistribution.map((p) => {
                        const total = analytics.presetDistribution.reduce((s, x) => s + x.count, 0);
                        const pct = total > 0 ? Math.round((p.count / total) * 100) : 0;
                        return (
                          <div key={p.preset} className="flex items-center gap-3">
                            <span className="text-sm text-foreground w-28 truncate">{p.preset}</span>
                            <Progress value={pct} className="flex-1 h-2" />
                            <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : analyticsQuery.isError ? (
            <div className="p-8 text-center text-muted-foreground">
              <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>Analytics unavailable.</p>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="goals" className="space-y-4 mt-4">
          {myRole !== "admin" ? (
            <Card>
              <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
                <Target className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>Only admins can set org reading goals.</p>
                <p className="text-sm mt-1">
                  Current goal: <strong>{account?.weeklyGoalMinutes ?? 180} minutes/week</strong>
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Org-Wide Weekly Reading Goal
                </CardTitle>
                <CardDescription>
                  Set a weekly listening target for all members. Members see their progress in the library.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    max={10080}
                    value={weeklyGoal}
                    onChange={(e) => setWeeklyGoal(e.target.value)}
                    className="w-36"
                  />
                  <span className="text-sm text-muted-foreground">minutes per week</span>
                  <span className="text-sm text-muted-foreground">
                    (= {Math.round(parseInt(weeklyGoal || "0", 10) / 60 * 10) / 10}h)
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[60, 120, 180, 300, 420].map((m) => (
                    <Button
                      key={m}
                      variant="outline"
                      size="sm"
                      onClick={() => setWeeklyGoal(String(m))}
                      className={weeklyGoal === String(m) ? "ring-2 ring-primary" : ""}
                    >
                      {m / 60}h/wk
                    </Button>
                  ))}
                </div>
                <Button
                  onClick={() => goalMutation.mutate()}
                  disabled={goalMutation.isPending || !weeklyGoal || parseInt(weeklyGoal, 10) < 0}
                >
                  {goalMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                  ) : (
                    "Save Goal"
                  )}
                </Button>
                <Separator />
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Current goal: <strong className="text-foreground">{account?.weeklyGoalMinutes ?? 180} min/week</strong></p>
                  <p>Members see a progress bar in their library showing weekly listening toward this goal.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <MemberDetailDrawer
        userId={selectedMemberUserId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}

function SignupForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [orgName, setOrgName] = useState("");
  const [contactEmail, setContactEmail] = useState(user?.email ?? "");
  const [orgType, setOrgType] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("education");

  const createOrgMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/institutional/create", {
        orgName,
        contactEmail,
        orgType,
        plan: selectedPlan,
      }),
    onSuccess: () => {
      toast({ title: "Organization created successfully!" });
      queryClient.invalidateQueries({ queryKey: ["/api/institutional/members"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create organization", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold flex items-center gap-3 text-foreground">
          <Building2 className="h-8 w-8 text-primary" />
          Institutional Account
        </h1>
        <p className="text-muted-foreground">Manage plans for schools, libraries, and nonprofits</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const isSelected = selectedPlan === plan.key;
          return (
            <Card
              key={plan.key}
              className={`cursor-pointer transition-all bg-card ${isSelected ? "ring-2 ring-primary" : "hover:shadow-lg"}`}
              onClick={() => setSelectedPlan(plan.key)}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription className="text-2xl font-bold text-foreground">{plan.price}</CardDescription>
                  </div>
                </div>
                <Badge variant="secondary" className="w-fit mt-2">{plan.seats} seats included</Badge>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Create Organization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Organization Name</label>
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Springfield Library"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Contact Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="admin@school.edu"
                  type="email"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Organization Type</label>
              <Select value={orgType} onValueChange={setOrgType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="school">School</SelectItem>
                  <SelectItem value="library">Library</SelectItem>
                  <SelectItem value="nonprofit">Nonprofit</SelectItem>
                  <SelectItem value="university">University</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => createOrgMutation.mutate()}
            disabled={createOrgMutation.isPending || !orgName || !contactEmail || !orgType}
            className="w-full"
          >
            {createOrgMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
            ) : (
              "Create Organization"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function InstitutionalPage() {
  const { user } = useAuth();

  const membersQuery = useQuery<MembersResponse>({
    queryKey: ["/api/institutional/members"],
    queryFn: () =>
      fetch("/api/institutional/members", { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("Not a member");
        return r.json() as Promise<MembersResponse>;
      }),
    enabled: !!user,
    retry: false,
  });

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Building2 className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium text-foreground">Sign in to access institutional features</p>
        <p className="text-muted-foreground text-sm">You need an account to manage institutional plans.</p>
      </div>
    );
  }

  if (membersQuery.isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-40" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  const hasOrg = membersQuery.isSuccess && membersQuery.data;

  if (hasOrg) {
    return <AdminDashboard data={membersQuery.data} />;
  }

  return <SignupForm />;
}
