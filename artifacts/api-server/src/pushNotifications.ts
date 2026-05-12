import { Express } from "express";
import webpush from "web-push";
import { z } from "zod";
import { db } from "./db";
import {
  pushSubscriptions,
  notificationLog,
  NOTIFICATION_TYPES,
  type NotificationType,
} from "@workspace/db";
import { eq, and, sql, desc, arrayContains } from "drizzle-orm";

const vapidPublic = process.env.VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(
    "mailto:accessibooks@example.com",
    vapidPublic,
    vapidPrivate,
  );
}

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const preferencesSchema = z.object({
  enabledTypes: z
    .array(z.enum(NOTIFICATION_TYPES))
    .min(0),
});

interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

const NOTIFICATION_TEMPLATES: Record<string, (data?: Record<string, string | number>) => NotificationPayload> = {
  streak_reminder: (data) => ({
    type: "streak_reminder",
    title: "Don't lose your streak! 🔥",
    body: `You have a ${data?.streak ?? 0}-day listening streak. Listen today to keep it going!`,
    icon: "/assets/icons/streak.png",
    url: "/",
    tag: "streak-reminder",
  }),
  goal_nudge: (data) => ({
    type: "goal_nudge",
    title: "Almost there! 🎯",
    body: `You're ${data?.remaining ?? 0} minutes away from your daily listening goal!`,
    icon: "/assets/icons/goal.png",
    url: "/",
    tag: "goal-nudge",
  }),
  new_content: (data) => ({
    type: "new_content",
    title: `New: ${data?.title ?? "New Content"}`,
    body: `${data?.description ?? "New content is available for you!"}`,
    icon: "/assets/icons/new.png",
    url: data?.url as string ?? "/library",
    tag: `new-${data?.contentId ?? "content"}`,
  }),
  achievement: (data) => ({
    type: "achievement",
    title: "Achievement Unlocked! 🏆",
    body: `You earned "${data?.name ?? "an achievement"}"! +${data?.xp ?? 0} XP`,
    icon: "/assets/icons/achievement.png",
    url: "/profile",
    tag: `achievement-${data?.achievementId ?? "new"}`,
  }),
  recommendation: (data) => ({
    type: "recommendation",
    title: "Recommended for You 📚",
    body: `${data?.title ?? "Check out this new recommendation"} by ${data?.author ?? "a great author"}`,
    icon: "/assets/icons/recommend.png",
    url: data?.url as string ?? "/library",
    tag: "recommendation",
  }),
  re_engagement: () => ({
    type: "re_engagement",
    title: "We miss you! 👋",
    body: "Come back and discover what's new in your library.",
    icon: "/assets/icons/wave.png",
    url: "/",
    tag: "re-engagement",
  }),
  author_update: (data) => ({
    type: "author_update",
    title: `New from ${data?.author ?? "an author you follow"}`,
    body: `"${data?.title ?? "A new release"}" is now available!`,
    icon: "/assets/icons/author.png",
    url: data?.url as string ?? "/library",
    tag: `author-${data?.authorId ?? "update"}`,
  }),
  system: (data) => ({
    type: "system",
    title: data?.title as string ?? "AccessiBooks Update",
    body: data?.body as string ?? "You have a new update.",
    icon: "/assets/icons/system.png",
    url: data?.url as string ?? "/",
    tag: "system",
  }),
  // Re-engagement notifications — welcome-back framing, no shame
  streak_at_risk: (data) => ({
    type: "streak_at_risk",
    title: "A few minutes today? 🌱",
    body: `You're on a ${data?.streak ?? 0}-day streak — listen for ${data?.minutes ?? 5} minutes to keep it going.`,
    icon: "/assets/icons/streak.png",
    url: "/hub",
    tag: "streak-at-risk",
  }),
  friend_digest: (data) => ({
    type: "friend_digest",
    title: "What your friends are reading 📚",
    body: data?.summary
      ? String(data.summary)
      : (data?.count
          ? `${data.count} friend${Number(data.count) === 1 ? "" : "s"} listened to ${data?.sampleTitle ?? "new books"} recently.`
          : "See what your community is enjoying this week."),
    icon: "/assets/icons/community.png",
    url: "/hub",
    tag: "friend-digest",
  }),
  rsvp_reminder: (data) => ({
    type: "rsvp_reminder",
    title: `Event soon: ${data?.title ?? "an event you RSVP'd to"}`,
    body: `Starts ${data?.when ?? "soon"}. Tap to join.`,
    icon: "/assets/icons/event.png",
    url: data?.url as string ?? "/events",
    tag: `rsvp-${data?.eventId ?? "soon"}`,
  }),
  win_back: () => ({
    type: "win_back",
    title: "We're here when you're ready 💛",
    body: "Whenever you're back, your library and bookmarks are waiting.",
    icon: "/assets/icons/wave.png",
    url: "/hub",
    tag: "win-back",
  }),
  weekly_recap: (data) => ({
    type: "weekly_recap",
    title: "Your week in books 📊",
    body: `${data?.minutes ?? 0} minutes listened, ${data?.books ?? 0} finished. See your recap.`,
    icon: "/assets/icons/recap.png",
    url: "/hub?recap=1",
    tag: "weekly-recap",
  }),
};

export function getNotificationPayload(
  templateKey: string,
  data?: Record<string, string | number>,
): NotificationPayload {
  const template = NOTIFICATION_TEMPLATES[templateKey];
  if (!template) {
    return {
      type: "system",
      title: "AccessiBooks",
      body: "You have a notification",
      url: "/",
      tag: "generic",
    };
  }
  return template(data);
}

export async function sendNotificationToUser(
  userId: string,
  payload: NotificationPayload,
): Promise<{ sent: number; failed: number }> {
  if (!vapidPublic || !vapidPrivate) {
    console.warn("VAPID keys not configured, skipping push notification");
    return { sent: 0, failed: 0 };
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        arrayContains(pushSubscriptions.enabledTypes, [payload.type]),
      ),
    );

  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
        { TTL: 86400 },
      );
      sent++;
      await db
        .update(pushSubscriptions)
        .set({ lastUsedAt: new Date() })
        .where(eq(pushSubscriptions.id, sub.id));
    } catch (err: any) {
      failed++;
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }

  await db.insert(notificationLog).values({
    userId,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    url: payload.url ?? null,
  });

  return { sent, failed };
}

export async function sendNotificationToAll(
  payload: NotificationPayload,
): Promise<{ sent: number; failed: number }> {
  if (!vapidPublic || !vapidPrivate) {
    return { sent: 0, failed: 0 };
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(arrayContains(pushSubscriptions.enabledTypes, [payload.type]));

  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
        { TTL: 86400 },
      );
      sent++;
    } catch (err: any) {
      failed++;
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }

  return { sent, failed };
}

function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated?.() && req.user?.id) {
    return next();
  }
  return res.status(401).json({ error: "Not authenticated" });
}

export function registerPushNotificationRoutes(app: Express) {
  app.post("/api/push/subscribe", isAuthenticated, async (req: any, res) => {
    try {
      const result = subscribeSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid subscription data" });
      }

      const { endpoint, keys } = result.data;
      const userId = req.user.id;

      const existing = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(pushSubscriptions)
          .set({ userId, p256dh: keys.p256dh, auth: keys.auth, lastUsedAt: new Date() })
          .where(eq(pushSubscriptions.id, existing[0].id));
        return res.json({ status: "updated", id: existing[0].id });
      }

      const [sub] = await db
        .insert(pushSubscriptions)
        .values({
          userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        })
        .returning();

      res.json({ status: "subscribed", id: sub.id });
    } catch (error) {
      console.error("Push subscribe error:", error);
      res.status(500).json({ error: "Failed to subscribe" });
    }
  });

  app.delete("/api/push/subscribe", isAuthenticated, async (req: any, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) {
        return res.status(400).json({ error: "Endpoint required" });
      }

      await db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, req.user.id),
            eq(pushSubscriptions.endpoint, endpoint),
          ),
        );

      res.json({ status: "unsubscribed" });
    } catch (error) {
      console.error("Push unsubscribe error:", error);
      res.status(500).json({ error: "Failed to unsubscribe" });
    }
  });

  app.get("/api/push/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const subs = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, req.user.id));

      if (subs.length === 0) {
        return res.json({ subscribed: false, enabledTypes: [] });
      }

      res.json({
        subscribed: true,
        enabledTypes: subs[0].enabledTypes,
        subscriptionCount: subs.length,
      });
    } catch (error) {
      console.error("Push preferences error:", error);
      res.status(500).json({ error: "Failed to get preferences" });
    }
  });

  app.put("/api/push/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const result = preferencesSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid preferences" });
      }

      await db
        .update(pushSubscriptions)
        .set({ enabledTypes: result.data.enabledTypes })
        .where(eq(pushSubscriptions.userId, req.user.id));

      res.json({ status: "updated", enabledTypes: result.data.enabledTypes });
    } catch (error) {
      console.error("Push preferences update error:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  app.get("/api/push/history", isAuthenticated, async (req: any, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const logs = await db
        .select()
        .from(notificationLog)
        .where(eq(notificationLog.userId, req.user.id))
        .orderBy(desc(notificationLog.sentAt))
        .limit(limit);

      res.json({ notifications: logs });
    } catch (error) {
      console.error("Push history error:", error);
      res.status(500).json({ error: "Failed to get notification history" });
    }
  });

  app.post("/api/push/clicked/:id", isAuthenticated, async (req: any, res) => {
    try {
      await db
        .update(notificationLog)
        .set({ clicked: 1 })
        .where(
          and(
            eq(notificationLog.id, req.params.id),
            eq(notificationLog.userId, req.user.id),
          ),
        );
      res.json({ status: "ok" });
    } catch (error) {
      res.status(500).json({ error: "Failed to record click" });
    }
  });

  app.get("/api/push/vapid-key", (_req, res) => {
    res.json({ publicKey: vapidPublic ?? null });
  });

  app.post("/api/push/test", isAuthenticated, async (req: any, res) => {
    try {
      const payload = getNotificationPayload("system", {
        title: "Test Notification",
        body: "Push notifications are working! You'll receive updates about your listening activity.",
        url: "/",
      });
      const result = await sendNotificationToUser(req.user.id, payload);
      res.json({ ...result, message: "Test notification sent" });
    } catch (error) {
      console.error("Push test error:", error);
      res.status(500).json({ error: "Failed to send test notification" });
    }
  });
}
