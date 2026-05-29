import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type NotificationType =
  | "streak_reminder"
  | "goal_nudge"
  | "new_content"
  | "achievement"
  | "recommendation"
  | "re_engagement"
  | "author_update"
  | "system";

interface PushPreferences {
  subscribed: boolean;
  enabledTypes: NotificationType[];
  subscriptionCount?: number;
}

interface NotificationLogEntry {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  sentAt: string;
  clicked: number;
}

export function usePushNotifications() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );
  const [isSupported, setIsSupported] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);

    if (supported && isAuthenticated) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => setSwRegistration(reg))
        .catch((err) => console.error("SW registration failed:", err));
    }
  }, [isAuthenticated]);

  const { data: preferences, isLoading: prefsLoading } = useQuery<PushPreferences>({
    queryKey: ["/api/push/preferences"],
    enabled: isSupported && isAuthenticated,
  });

  const { data: history } = useQuery<{ notifications: NotificationLogEntry[] }>({
    queryKey: ["/api/push/history"],
    enabled: isSupported && isAuthenticated,
  });

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      if (!swRegistration) throw new Error("Service worker not registered");

      let perm = Notification.permission;
      if (perm === "default") {
        perm = await Notification.requestPermission();
      }
      setPermission(perm);
      if (perm !== "granted") throw new Error("Permission denied");

      const vapidRes = await fetch("/api/push/vapid-key");
      const { publicKey } = await vapidRes.json();
      if (!publicKey) throw new Error("VAPID key not available");

      const subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const subJson = subscription.toJSON();
      await apiRequest("POST", "/api/push/subscribe", {
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth,
        },
      });

      return subscription;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/push/preferences"] });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      if (!swRegistration) return;
      const subscription = await swRegistration.pushManager.getSubscription();
      if (subscription) {
        await apiRequest("DELETE", "/api/push/subscribe", {
          endpoint: subscription.endpoint,
        });
        await subscription.unsubscribe();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/push/preferences"] });
    },
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (enabledTypes: NotificationType[]) => {
      await apiRequest("PUT", "/api/push/preferences", { enabledTypes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/push/preferences"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/push/test");
    },
  });

  const markClickedMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("POST", `/api/push/clicked/${notificationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/push/history"] });
    },
  });

  const subscribe = useCallback(() => subscribeMutation.mutateAsync(), [subscribeMutation]);
  const unsubscribe = useCallback(() => unsubscribeMutation.mutateAsync(), [unsubscribeMutation]);
  const updatePreferences = useCallback(
    (types: NotificationType[]) => updatePreferencesMutation.mutateAsync(types),
    [updatePreferencesMutation],
  );
  const sendTest = useCallback(() => testMutation.mutateAsync(), [testMutation]);
  const markClicked = useCallback(
    (id: string) => markClickedMutation.mutate(id),
    [markClickedMutation],
  );

  return {
    isSupported,
    permission,
    isSubscribed: preferences?.subscribed ?? false,
    enabledTypes: preferences?.enabledTypes ?? [],
    notifications: history?.notifications ?? [],
    prefsLoading,
    subscribing: subscribeMutation.isPending,
    subscribe,
    unsubscribe,
    updatePreferences,
    sendTest,
    testPending: testMutation.isPending,
    markClicked,
  };
}
