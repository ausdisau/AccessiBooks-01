import { useState } from "react";
import { Bell, BellOff, BellRing, Check, Send, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { usePushNotifications, type NotificationType } from "@/hooks/use-push-notifications";

const NOTIFICATION_TYPE_LABELS: Record<NotificationType, { label: string; description: string }> = {
  streak_reminder: {
    label: "Streak Reminders",
    description: "Get reminded to maintain your listening streak",
  },
  goal_nudge: {
    label: "Goal Progress",
    description: "Updates on your daily listening goal",
  },
  new_content: {
    label: "New Content",
    description: "When new audiobooks or episodes are available",
  },
  achievement: {
    label: "Achievements",
    description: "When you unlock badges and earn XP",
  },
  recommendation: {
    label: "Recommendations",
    description: "Personalized content suggestions",
  },
  re_engagement: {
    label: "Come Back Reminders",
    description: "Gentle nudges when you haven't visited in a while",
  },
  author_update: {
    label: "Author Updates",
    description: "New releases from authors you follow",
  },
  system: {
    label: "System Updates",
    description: "Platform announcements and updates",
  },
};

function NotificationPreferences() {
  const {
    isSupported,
    permission,
    isSubscribed,
    enabledTypes,
    subscribe,
    unsubscribe,
    updatePreferences,
    subscribing,
    sendTest,
    testPending,
  } = usePushNotifications();
  const { toast } = useToast();
  const [showSettings, setShowSettings] = useState(false);

  if (!isSupported) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Push notifications are not supported in this browser.
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <BellOff className="h-5 w-5 mb-2" />
        <p>Notifications are blocked. Please enable them in your browser settings to receive updates.</p>
      </div>
    );
  }

  const handleSubscribe = async () => {
    try {
      await subscribe();
      toast({ title: "Notifications enabled", description: "You'll now receive updates about your activity." });
    } catch {
      toast({ title: "Could not enable notifications", variant: "destructive" });
    }
  };

  const handleUnsubscribe = async () => {
    try {
      await unsubscribe();
      toast({ title: "Notifications disabled" });
    } catch {
      toast({ title: "Error disabling notifications", variant: "destructive" });
    }
  };

  const handleToggleType = async (type: NotificationType, enabled: boolean) => {
    const newTypes = enabled
      ? [...enabledTypes, type]
      : enabledTypes.filter((t) => t !== type);
    try {
      await updatePreferences(newTypes);
    } catch {
      toast({ title: "Failed to update preferences", variant: "destructive" });
    }
  };

  const handleTest = async () => {
    try {
      await sendTest();
      toast({ title: "Test notification sent!" });
    } catch {
      toast({ title: "Failed to send test", variant: "destructive" });
    }
  };

  if (!isSubscribed) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <BellRing className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Enable Notifications</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Get notified about your listening streaks, achievements, new content, and personalized recommendations.
        </p>
        <Button onClick={handleSubscribe} disabled={subscribing} className="w-full" size="sm">
          {subscribing ? "Enabling..." : "Enable Push Notifications"}
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-green-500" />
          <span className="font-semibold text-sm">Notifications On</span>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSettings(!showSettings)}>
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleTest} disabled={testPending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showSettings && (
        <div className="space-y-2 pt-2">
          <Separator />
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide pt-1">
            Notification Types
          </p>
          {(Object.entries(NOTIFICATION_TYPE_LABELS) as [NotificationType, { label: string; description: string }][]).map(
            ([type, { label, description }]) => (
              <div key={type} className="flex items-center justify-between py-1.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground truncate">{description}</p>
                </div>
                <Switch
                  checked={enabledTypes.includes(type)}
                  onCheckedChange={(checked) => handleToggleType(type, checked)}
                  aria-label={`Toggle ${label} notifications`}
                />
              </div>
            ),
          )}
          <Separator />
          <Button variant="outline" size="sm" className="w-full text-destructive" onClick={handleUnsubscribe}>
            <BellOff className="h-4 w-4 mr-1" />
            Disable All Notifications
          </Button>
        </div>
      )}
    </div>
  );
}

function NotificationHistory() {
  const { notifications, markClicked } = usePushNotifications();

  if (notifications.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p>No notifications yet</p>
      </div>
    );
  }

  const handleClick = (notif: typeof notifications[0]) => {
    if (!notif.clicked) {
      markClicked(notif.id);
    }
    if (notif.url) window.location.href = notif.url;
  };

  return (
    <div className="divide-y divide-border">
      {notifications.slice(0, 20).map((notif) => (
        <div
          key={notif.id}
          className={`p-3 hover:bg-muted/50 transition-colors cursor-pointer ${notif.clicked ? "opacity-60" : ""}`}
          onClick={() => handleClick(notif)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleClick(notif);
          }}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{notif.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{notif.body}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(notif.sentAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
            {notif.clicked ? (
              <Check className="h-3 w-3 text-muted-foreground mt-1 flex-shrink-0" />
            ) : (
              <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function NotificationBell() {
  const { notifications, isSubscribed } = usePushNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"notifications" | "settings">("notifications");

  const unreadCount = notifications.filter((n) => !n.clicked).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[350px] sm:w-[400px] p-0">
        <SheetHeader className="p-4 pb-2">
          <SheetTitle className="flex items-center justify-between">
            <span>Notifications</span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex border-b border-border">
          <button
            className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${
              tab === "notifications"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("notifications")}
          >
            History
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${
              tab === "settings"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("settings")}
          >
            Settings
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(100vh-120px)]">
          {tab === "notifications" ? (
            isSubscribed ? (
              <NotificationHistory />
            ) : (
              <NotificationPreferences />
            )
          ) : (
            <NotificationPreferences />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
