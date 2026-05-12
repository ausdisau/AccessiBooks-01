import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bell,
  Flame,
  Star,
  Zap,
  Users,
  Send,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  sentAt: string;
  clicked: number;
}

function getRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const secondsAgo = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secondsAgo < 60) return "just now";
  if (secondsAgo < 3600) {
    const minutes = Math.floor(secondsAgo / 60);
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  }
  if (secondsAgo < 86400) {
    const hours = Math.floor(secondsAgo / 3600);
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }
  if (secondsAgo < 604800) {
    const days = Math.floor(secondsAgo / 86400);
    if (days === 1) return "yesterday";
    return `${days} days ago`;
  }
  if (secondsAgo < 2592000) {
    const weeks = Math.floor(secondsAgo / 604800);
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }

  const months = Math.floor(secondsAgo / 2592000);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

function getTypeIcon(type: string) {
  const size = "h-4 w-4";
  switch (type) {
    case "streak_reminder":
      return <Flame className={`${size} text-orange-500`} />;
    case "achievement":
      return <Star className={`${size} text-yellow-500`} />;
    case "goal_nudge":
      return <Zap className={`${size} text-blue-500`} />;
    case "author_update":
      return <Users className={`${size} text-purple-500`} />;
    case "recommendation":
      return <Send className={`${size} text-green-500`} />;
    case "system":
      return <AlertCircle className={`${size} text-red-500`} />;
    default:
      return <Bell className={`${size} text-slate-500`} />;
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "streak_reminder":
      return "Streak Reminder";
    case "goal_nudge":
      return "Goal Progress";
    case "new_content":
      return "New Content";
    case "achievement":
      return "Achievement";
    case "recommendation":
      return "Recommendation";
    case "re_engagement":
      return "Re-engagement";
    case "author_update":
      return "Author Update";
    case "system":
      return "System";
    default:
      return "Notification";
  }
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: notifications = [], isLoading, isError } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: open,
    refetchInterval: open ? 10000 : false,
  });

  const unreadCount = notifications.filter((n) => n.clicked === 0).length;

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark notification as read",
        variant: "destructive",
      });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/notifications/read-all");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "Success",
        description: "All notifications marked as read",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark all notifications as read",
        variant: "destructive",
      });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (notification.clicked === 0) {
      markReadMutation.mutate(notification.id);
    }
    if (notification.url) {
      window.location.href = notification.url;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
          }
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] rounded-full"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[400px] p-0" align="end">
        <div className="flex flex-col h-[500px]">
          {/* Header */}
          <div className="flex items-center justify-between p-4">
            <h2 className="text-lg font-semibold">Notifications</h2>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
              >
                {markAllReadMutation.isPending ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Marking...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Mark all read
                  </>
                )}
              </Button>
            )}
          </div>

          <Separator />

          {/* Content */}
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="flex-1 flex items-center justify-center p-4 text-center">
              <div>
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Failed to load notifications
                </p>
              </div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-4 text-center">
              <div>
                <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border dark:divide-border">
                {notifications.map((notification) => {
                  const isUnread = notification.clicked === 0;
                  return (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-muted/50 dark:hover:bg-muted/50 cursor-pointer transition-colors ${
                        isUnread
                          ? "bg-blue-50 dark:bg-blue-950/20"
                          : "opacity-60"
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          handleNotificationClick(notification);
                        }
                      }}
                    >
                      <div className="flex gap-3">
                        {/* Icon */}
                        <div className="flex-shrink-0 mt-1">
                          {getTypeIcon(notification.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              {notification.title}
                            </p>
                            {isUnread && (
                              <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {notification.body}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {getRelativeTime(notification.sentAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
