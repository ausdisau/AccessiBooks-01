import { db } from "./db";
import {
  pushSubscriptions,
  userStreaks,
  userGoals,
  dailyListeningLog,
  users,
  listeningHistory,
} from "@shared/schema";
import { eq, sql, lt, and, isNotNull, ne } from "drizzle-orm";
import { sendNotificationToUser, getNotificationPayload } from "./pushNotifications";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function checkStreakReminders(): Promise<number> {
  let sent = 0;
  try {
    const subscribedUsers = await db
      .selectDistinct({ userId: pushSubscriptions.userId })
      .from(pushSubscriptions);

    for (const { userId } of subscribedUsers) {
      const [streak] = await db
        .select()
        .from(userStreaks)
        .where(eq(userStreaks.userId, userId))
        .limit(1);

      if (!streak || streak.currentStreak < 2) continue;

      const [todayLog] = await db
        .select()
        .from(dailyListeningLog)
        .where(
          and(
            eq(dailyListeningLog.userId, userId),
            eq(dailyListeningLog.date, todayStr()),
          ),
        )
        .limit(1);

      if (!todayLog || todayLog.minutesListened === 0) {
        const payload = getNotificationPayload("streak_reminder", {
          streak: streak.currentStreak,
        });
        const result = await sendNotificationToUser(userId, payload);
        sent += result.sent;
      }
    }
  } catch (error) {
    console.error("Streak reminder check failed:", error);
  }
  return sent;
}

export async function checkGoalNudges(): Promise<number> {
  let sent = 0;
  try {
    const subscribedUsers = await db
      .selectDistinct({ userId: pushSubscriptions.userId })
      .from(pushSubscriptions);

    for (const { userId } of subscribedUsers) {
      const [goal] = await db
        .select()
        .from(userGoals)
        .where(eq(userGoals.userId, userId))
        .limit(1);

      if (!goal) continue;

      const [todayLog] = await db
        .select()
        .from(dailyListeningLog)
        .where(
          and(
            eq(dailyListeningLog.userId, userId),
            eq(dailyListeningLog.date, todayStr()),
          ),
        )
        .limit(1);

      const listened = todayLog?.minutesListened ?? 0;
      const remaining = goal.dailyMinutesGoal - listened;

      if (remaining > 0 && remaining <= 15 && listened > 0) {
        const payload = getNotificationPayload("goal_nudge", {
          remaining,
        });
        const result = await sendNotificationToUser(userId, payload);
        sent += result.sent;
      }
    }
  } catch (error) {
    console.error("Goal nudge check failed:", error);
  }
  return sent;
}

export async function sendAchievementNotification(
  userId: string,
  achievementName: string,
  xpReward: number,
  achievementId: string,
): Promise<void> {
  try {
    const payload = getNotificationPayload("achievement", {
      name: achievementName,
      xp: xpReward,
      achievementId,
    });
    await sendNotificationToUser(userId, payload);
  } catch (error) {
    console.error("Achievement notification failed:", error);
  }
}

export async function sendNewContentNotification(
  userId: string,
  title: string,
  description: string,
  contentUrl: string,
  contentId: string,
): Promise<void> {
  try {
    const payload = getNotificationPayload("new_content", {
      title,
      description,
      url: contentUrl,
      contentId,
    });
    await sendNotificationToUser(userId, payload);
  } catch (error) {
    console.error("New content notification failed:", error);
  }
}

export async function checkReEngagement(): Promise<number> {
  let sent = 0;
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const inactiveUsers = await db
      .select({ userId: pushSubscriptions.userId })
      .from(pushSubscriptions)
      .innerJoin(
        listeningHistory,
        eq(pushSubscriptions.userId, listeningHistory.userId),
      )
      .where(
        lt(listeningHistory.lastPlayedAt, threeDaysAgo),
      )
      .groupBy(pushSubscriptions.userId)
      .limit(50);

    for (const { userId } of inactiveUsers) {
      const payload = getNotificationPayload("re_engagement");
      const result = await sendNotificationToUser(userId, payload);
      sent += result.sent;
    }
  } catch (error) {
    console.error("Re-engagement check failed:", error);
  }
  return sent;
}

let streakInterval: ReturnType<typeof setInterval> | null = null;
let goalInterval: ReturnType<typeof setInterval> | null = null;
let reEngageInterval: ReturnType<typeof setInterval> | null = null;

export function startNotificationScheduler(): void {
  console.log("[Notifications] Starting scheduler...");

  streakInterval = setInterval(async () => {
    const hour = new Date().getHours();
    if (hour === 18) {
      const sent = await checkStreakReminders();
      if (sent > 0) console.log(`[Notifications] Sent ${sent} streak reminders`);
    }
  }, 60 * 60 * 1000);

  goalInterval = setInterval(async () => {
    const hour = new Date().getHours();
    if (hour >= 14 && hour <= 22) {
      const sent = await checkGoalNudges();
      if (sent > 0) console.log(`[Notifications] Sent ${sent} goal nudges`);
    }
  }, 2 * 60 * 60 * 1000);

  reEngageInterval = setInterval(async () => {
    const hour = new Date().getHours();
    if (hour === 10) {
      const sent = await checkReEngagement();
      if (sent > 0) console.log(`[Notifications] Sent ${sent} re-engagement notifications`);
    }
  }, 24 * 60 * 60 * 1000);

  console.log("[Notifications] Scheduler started");
}

export function stopNotificationScheduler(): void {
  if (streakInterval) clearInterval(streakInterval);
  if (goalInterval) clearInterval(goalInterval);
  if (reEngageInterval) clearInterval(reEngageInterval);
  streakInterval = null;
  goalInterval = null;
  reEngageInterval = null;
  console.log("[Notifications] Scheduler stopped");
}
