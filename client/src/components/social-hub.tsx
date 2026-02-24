import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, UserPlus, UserMinus, BookOpen, Plus, Clock, Globe, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ActivityItem {
  id: string;
  userId: string;
  username: string;
  activityType: string;
  bookId?: string;
  bookTitle?: string;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  email?: string;
  profileImageUrl?: string;
}

interface Club {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  currentBookTitle?: string;
  creatorId: string;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

function getActivityDescription(activity: ActivityItem): string {
  switch (activity.activityType) {
    case "finished_book":
      return `finished reading ${activity.bookTitle || "a book"}`;
    case "started_book":
      return `started listening to ${activity.bookTitle || "a book"}`;
    case "wrote_review":
      return `wrote a review for ${activity.bookTitle || "a book"}`;
    case "joined_club":
      return "joined a reading club";
    case "earned_achievement":
      return "earned an achievement";
    default:
      return "did something";
  }
}

export function SocialHub() {
  const { toast } = useToast();
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [clubForm, setClubForm] = useState({ name: "", description: "" });
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch activity feed
  const { data: activities = [] as ActivityItem[], isLoading: activitiesLoading } = useQuery<ActivityItem[]>({
    queryKey: ["/api/social/feed"],
  });

  // Fetch following list
  const { data: following = [] as User[], isLoading: followingLoading } = useQuery<User[]>({
    queryKey: ["/api/social/following/me"],
  });

  // Fetch clubs
  const { data: clubs = [] as Club[], isLoading: clubsLoading } = useQuery<Club[]>({
    queryKey: ["/api/clubs"],
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/users/${userId}/follow`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/following/me"] });
      toast({ title: "Unfollowed successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Join club mutation
  const joinClubMutation = useMutation({
    mutationFn: async (clubId: string) => {
      const res = await apiRequest("POST", `/api/clubs/${clubId}/join`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clubs"] });
      toast({ title: "Joined club successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create club mutation
  const createClubMutation = useMutation({
    mutationFn: async (data: typeof clubForm) => {
      const res = await apiRequest("POST", "/api/clubs", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clubs"] });
      setShowCreateClub(false);
      setClubForm({ name: "", description: "" });
      toast({ title: "Club created successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateClub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubForm.name.trim()) {
      toast({
        title: "Error",
        description: "Club name is required",
        variant: "destructive",
      });
      return;
    }
    createClubMutation.mutate(clubForm);
  };

  return (
    <div className="w-full bg-background text-foreground">
      <Tabs defaultValue="feed" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-muted border-b">
          <TabsTrigger value="feed">Feed</TabsTrigger>
          <TabsTrigger value="friends">Friends</TabsTrigger>
          <TabsTrigger value="clubs">Clubs</TabsTrigger>
        </TabsList>

        {/* FEED TAB */}
        <TabsContent value="feed" className="p-4">
          <ScrollArea className="h-[600px] pr-4">
            {activitiesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : activities.length > 0 ? (
              <div className="space-y-3">
                {(activities as ActivityItem[]).map((activity: ActivityItem) => (
                  <Card key={activity.id} className="bg-card hover:bg-muted/50 transition-colors">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {activity.username
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{activity.username}</span>
                            <Badge variant="outline" className="text-xs">
                              {activity.activityType}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {getActivityDescription(activity)}
                          </p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                            <Clock className="h-3 w-3" />
                            {formatTimeAgo(activity.createdAt)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Globe className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">
                  No activities yet. Follow users to see their updates!
                </p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* FRIENDS TAB */}
        <TabsContent value="friends" className="p-4">
          <div className="space-y-4">
            {/* Search for users */}
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Discover more readers</p>
                  <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-background"
                  />
                </div>
              </CardContent>
            </Card>

            <Separator />

            {/* Following list */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                People You Follow
              </h3>

              <ScrollArea className="h-[400px] pr-4">
                {followingLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : following.length > 0 ? (
                  <div className="space-y-2">
                    {(following as User[]).map((user: User) => (
                      <Card key={user.id} className="bg-card hover:bg-muted/50 transition-colors">
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                  {user.name
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")
                                    .toUpperCase()
                                    .slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm truncate">{user.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => unfollowMutation.mutate(user.id)}
                              disabled={unfollowMutation.isPending}
                            >
                              <UserMinus className="h-3 w-3 mr-1" />
                              <span className="hidden sm:inline">Unfollow</span>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Users className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-muted-foreground text-sm">
                      You're not following anyone yet.
                    </p>
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </TabsContent>

        {/* CLUBS TAB */}
        <TabsContent value="clubs" className="p-4">
          <div className="space-y-4">
            {/* Create club button */}
            <Dialog open={showCreateClub} onOpenChange={setShowCreateClub}>
              <DialogTrigger asChild>
                <Button className="w-full gap-2 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90">
                  <Plus className="h-4 w-4" />
                  Create New Club
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-background text-foreground">
                <DialogHeader>
                  <DialogTitle>Create Reading Club</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateClub} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Club Name</label>
                    <Input
                      placeholder="Enter club name"
                      value={clubForm.name}
                      onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })}
                      className="bg-muted/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description</label>
                    <Input
                      placeholder="What's your club about?"
                      value={clubForm.description}
                      onChange={(e) => setClubForm({ ...clubForm, description: e.target.value })}
                      className="bg-muted/50"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={createClubMutation.isPending}
                  >
                    {createClubMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Create Club
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            {/* Clubs list */}
            <ScrollArea className="h-[520px] pr-4">
              {clubsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : clubs.length > 0 ? (
                <div className="space-y-3">
                  {(clubs as Club[]).map((club: Club) => (
                    <Card key={club.id} className="bg-card hover:bg-muted/50 transition-colors">
                      <CardContent className="pt-4">
                        <div className="space-y-3">
                          <div>
                            <h4 className="font-semibold text-sm mb-1">{club.name}</h4>
                            {club.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {club.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              <Users className="h-3 w-3 mr-1" />
                              {club.memberCount} members
                            </Badge>
                            {club.currentBookTitle && (
                              <Badge variant="outline" className="text-xs">
                                <BookOpen className="h-3 w-3 mr-1" />
                                {club.currentBookTitle}
                              </Badge>
                            )}
                          </div>

                          <Button
                            size="sm"
                            className="w-full gap-2 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
                            onClick={() => joinClubMutation.mutate(club.id)}
                            disabled={joinClubMutation.isPending}
                          >
                            <UserPlus className="h-3 w-3" />
                            Join Club
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <BookOpen className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground text-sm">
                    No clubs yet. Create one to get started!
                  </p>
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
