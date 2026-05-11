import { db } from "./db";
import {
  pushSubscriptions,
  userStreaks,
  userGoals,
  dailyListeningLog,
  users,
  listeningHistory,
  accessibilityPreferences,
  eventRsvps,
  liveEvents,
  type A11yProfile,
  type NotificationType,
} from "@shared/schema";
import { eq, sql, lt, and, isNotNull, ne, gte, lte, isNull } from "drizzle-orm";
import { sendNotificationToUser, getNotificationPayload } from "./pushNotifications";

/**
 * Engagement guardrails — respect Calm Mode, per-category opt-outs, quiet hours.
 * Returns true if the notification SHOULD be sent.
 */
async function shouldSendForUser(userId: string, category: NotificationType): Promise<boolean> {
  try {
    const [prefs] = await db.select().from(accessibilityPreferences)
      .where(eq(accessibilityPreferences.userId, userId)).limit(1);
    const profile = (prefs?.profile ?? null) as A11yProfile | null;
    if (!profile) return true;
    if (profile.calmMode) return false;
    const cats = profile.notificationCategories ?? {};
    if (cats[category] === false) return false;
    // Quiet hours (server local time approximation; mobile push provider also respects local TZ)
    const quiet = profile.quietHours;
    if (quiet) {
      const hour = new Date().getHours();
      const { start, end } = quiet;
      const inQuiet = start <= end ? (hour >= start && hour < end) : (hour >= start || hour < end);
      if (inQuiet) return false;
    }
    return true;
  } catch {
    return true;
  }
}

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
        if (!(await shouldSendForUser(userId, "streak_at_risk"))) continue;
        // Welcome-back framing: never shame, always invite
        const payload = getNotificationPayload("streak_at_risk", {
          streak: streak.currentStreak,
          minutes: 5,
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
        if (!(await shouldSendForUser(userId, "goal_nudge"))) continue;
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
      if (!(await shouldSendForUser(userId, "re_engagement"))) continue;
      const payload = getNotificationPayload("re_engagement");
      const result = await sendNotificationToUser(userId, payload);
      sent += result.sent;
    }
  } catch (error) {
    console.error("Re-engagement check failed:", error);
  }
  return sent;
}

// Win-back: 14+ days inactive, single email/push, opt-out honored
export async function checkWinBack(): Promise<number> {
  let sent = 0;
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const inactive = await db
      .select({ userId: pushSubscriptions.userId })
      .from(pushSubscriptions)
      .innerJoin(listeningHistory, eq(pushSubscriptions.userId, listeningHistory.userId))
      .where(lt(listeningHistory.lastPlayedAt, cutoff))
      .groupBy(pushSubscriptions.userId)
      .limit(50);

    for (const { userId } of inactive) {
      if (!(await shouldSendForUser(userId, "win_back"))) continue;
      const payload = getNotificationPayload("win_back");
      const result = await sendNotificationToUser(userId, payload);
      sent += result.sent;
    }
  } catch (err) {
    console.error("Win-back check failed:", err);
  }
  return sent;
}

// RSVP reminder: 1 day + 1 hour before scheduled event
export async function checkEventReminders(): Promise<number> {
  let sent = 0;
  try {
    const now = new Date();
    const oneHour = new Date(now.getTime() + 60 * 60 * 1000);
    const oneDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const upcoming = await db.select().from(liveEvents)
      .where(and(
        eq(liveEvents.status, "scheduled"),
        gte(liveEvents.scheduledStartAt, now),
        lte(liveEvents.scheduledStartAt, oneDay),
      ));

    for (const event of upcoming) {
      const minsAway = Math.round((new Date(event.scheduledStartAt).getTime() - now.getTime()) / 60000);
      // Send at the 1h or 24h windows (within 30-min slack for hourly cron)
      const hitsHour = Math.abs(minsAway - 60) <= 30;
      const hitsDay = Math.abs(minsAway - 1440) <= 30;
      if (!hitsHour && !hitsDay) continue;

      const rsvps = await db.select().from(eventRsvps).where(eq(eventRsvps.eventId, event.id));
      for (const r of rsvps) {
        if (!(await shouldSendForUser(r.userId, "rsvp_reminder"))) continue;
        const payload = getNotificationPayload("rsvp_reminder", {
          title: event.title,
          when: hitsHour ? "in about an hour" : "tomorrow",
          eventId: event.id,
          url: `/events/${event.id}`,
        });
        const result = await sendNotificationToUser(r.userId, payload);
        sent += result.sent;
      }
    }
  } catch (err) {
    console.error("Event reminder check failed:", err);
  }
  return sent;
}

// Weekly recap: Sunday digest preview
export async function checkWeeklyRecap(): Promise<number> {
  let sent = 0;
  try {
    if (new Date().getDay() !== 0) return 0; // Sunday only
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const wkAgoStr = weekAgo.toISOString().slice(0, 10);

    const subscribed = await db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions);
    for (const { userId } of subscribed) {
      if (!(await shouldSendForUser(userId, "weekly_recap"))) continue;
      const logs = await db.select().from(dailyListeningLog)
        .where(and(eq(dailyListeningLog.userId, userId), gte(dailyListeningLog.date, wkAgoStr)));
      const minutes = logs.reduce((s, l) => s + (l.minutesListened || 0), 0);
      const books = logs.reduce((s, l) => s + (l.booksCompleted || 0), 0);
      if (minutes < 5) continue; // Don't spam users with empty weeks
      const payload = getNotificationPayload("weekly_recap", { minutes, books });
      const result = await sendNotificationToUser(userId, payload);
      sent += result.sent;
    }
  } catch (err) {
    console.error("Weekly recap check failed:", err);
  }
  return sent;
}

let streakInterval: ReturnType<typeof setInterval> | null = null;
let goalInterval: ReturnType<typeof setInterval> | null = null;
let reEngageInterval: ReturnType<typeof setInterval> | null = null;
let eventReminderInterval: ReturnType<typeof setInterval> | null = null;
let weeklyRecapInterval: ReturnType<typeof setInterval> | null = null;
let winBackInterval: ReturnType<typeof setInterval> | null = null;

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

  // RSVP reminders — hourly check for 1h and 24h windows
  eventReminderInterval = setInterval(async () => {
    const sent = await checkEventReminders();
    if (sent > 0) console.log(`[Notifications] Sent ${sent} RSVP reminders`);
  }, 60 * 60 * 1000);

  // Weekly recap — daily check, fires only on Sunday morning
  weeklyRecapInterval = setInterval(async () => {
    const hour = new Date().getHours();
    if (hour === 9) {
      const sent = await checkWeeklyRecap();
      if (sent > 0) console.log(`[Notifications] Sent ${sent} weekly recaps`);
    }
  }, 60 * 60 * 1000);

  // Win-back — once a day at 11am
  winBackInterval = setInterval(async () => {
    const hour = new Date().getHours();
    if (hour === 11) {
      const sent = await checkWinBack();
      if (sent > 0) console.log(`[Notifications] Sent ${sent} win-back nudges`);
    }
  }, 60 * 60 * 1000);

  console.log("[Notifications] Scheduler started");
}

export function stopNotificationScheduler(): void {
  if (streakInterval) clearInterval(streakInterval);
  if (goalInterval) clearInterval(goalInterval);
  if (reEngageInterval) clearInterval(reEngageInterval);
  if (eventReminderInterval) clearInterval(eventReminderInterval);
  if (weeklyRecapInterval) clearInterval(weeklyRecapInterval);
  if (winBackInterval) clearInterval(winBackInterval);
  streakInterval = null;
  goalInterval = null;
  reEngageInterval = null;
  eventReminderInterval = null;
  weeklyRecapInterval = null;
  winBackInterval = null;
  console.log("[Notifications] Scheduler stopped");
}
