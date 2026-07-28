import { db } from "./db";
import {
  pushSubscriptions,
  userStreaks,
  userGoals,
  dailyListeningLog,
  users,
  listeningHistory,
  accessibilityPreferences,
  DEFAULT_A11Y_PROFILE,
  eventRsvps,
  liveEvents,
  battlePasses,
  battlePassMilestones,
  battlePassPurchases,
  notificationLog,
  type A11yProfile,
  type NotificationType,
} from "@workspace/db";
import { sendEmail } from "./mailer";
import { eq, sql, lt, and, isNotNull, ne, gte, lte, isNull } from "drizzle-orm";
import { sendNotificationToUser, getNotificationPayload } from "./pushNotifications";
import { engagementEvents } from "@workspace/db";
import { analyticsService } from "./analyticsService";

/**
 * Record a per-user engagement event AND a tier-anonymised product event so
 * the admin analytics dashboard can compute notification trigger health
 * (sent / skipped / suppressed counts and per-category split).
 */
async function trackTrigger(
  userId: string,
  eventType: string,
  category: NotificationType,
  outcome: "sent" | "skipped" | "failed",
  reason?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(engagementEvents).values({
      userId,
      eventType,
      category,
      outcome,
      reason: reason ?? null,
      metadata: metadata ?? null,
    });
  } catch {
    // Engagement table may not yet be migrated — analytics path must never
    // disrupt the trigger run.
  }
  try {
    let tier = "unknown";
    try {
      const [u] = await db.select({ t: users.subscriptionTier }).from(users).where(eq(users.id, userId)).limit(1);
      if (u?.t) tier = u.t;
    } catch { /* best-effort */ }
    analyticsService.track(`notification_${outcome}`, tier, {
      eventType, category, reason: reason ?? null, ...(metadata ?? {}),
    });
  } catch { /* fire-and-forget */ }
}

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
    // Quiet hours — enforce per-user local time when the user has set a timezone
    // in their accessibility profile (IANA name); otherwise fall back to server time.
    const quiet = profile.quietHours;
    if (quiet) {
      const tz = profile.timezone || undefined;
      let hour: number;
      try {
        hour = tz
          ? Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz })
              .format(new Date()))
          : new Date().getHours();
      } catch {
        hour = new Date().getHours();
      }
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
        if (!(await shouldSendForUser(userId, "streak_at_risk"))) {
          await trackTrigger(userId, "streak_reminder", "streak_at_risk", "skipped", "guardrail");
          continue;
        }
        const payload = getNotificationPayload("streak_at_risk", {
          streak: streak.currentStreak,
          minutes: 5,
        });
        const result = await sendNotificationToUser(userId, payload);
        sent += result.sent;
        await trackTrigger(userId, "streak_reminder", "streak_at_risk",
          result.sent > 0 ? "sent" : "failed", undefined, { streak: streak.currentStreak });
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
        if (!(await shouldSendForUser(userId, "goal_nudge"))) {
          await trackTrigger(userId, "goal_nudge", "goal_nudge", "skipped", "guardrail");
          continue;
        }
        const payload = getNotificationPayload("goal_nudge", { remaining });
        const result = await sendNotificationToUser(userId, payload);
        sent += result.sent;
        await trackTrigger(userId, "goal_nudge", "goal_nudge",
          result.sent > 0 ? "sent" : "failed", undefined, { remaining });
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
    if (!(await shouldSendForUser(userId, "achievement"))) {
      await trackTrigger(userId, "achievement", "achievement", "skipped", "guardrail", { achievementId });
      return;
    }
    const payload = getNotificationPayload("achievement", {
      name: achievementName,
      xp: xpReward,
      achievementId,
    });
    const result = await sendNotificationToUser(userId, payload);
    await trackTrigger(userId, "achievement", "achievement",
      result.sent > 0 ? "sent" : "failed", undefined, { achievementId, xpReward });
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
    if (!(await shouldSendForUser(userId, "new_content"))) {
      await trackTrigger(userId, "new_content", "new_content", "skipped", "guardrail", { contentId });
      return;
    }
    const payload = getNotificationPayload("new_content", {
      title,
      description,
      url: contentUrl,
      contentId,
    });
    const result = await sendNotificationToUser(userId, payload);
    await trackTrigger(userId, "new_content", "new_content",
      result.sent > 0 ? "sent" : "failed", undefined, { contentId });
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
      if (!(await shouldSendForUser(userId, "re_engagement"))) {
        await trackTrigger(userId, "re_engagement", "re_engagement", "skipped", "guardrail");
        continue;
      }
      const payload = getNotificationPayload("re_engagement");
      const result = await sendNotificationToUser(userId, payload);
      sent += result.sent;
      await trackTrigger(userId, "re_engagement", "re_engagement",
        result.sent > 0 ? "sent" : "failed");
    }
  } catch (error) {
    console.error("Re-engagement check failed:", error);
  }
  return sent;
}

// Win-back: 14+ days inactive, single email/push, opt-out honored.
// Eligibility is based on listening activity + an email on file — push
// enrollment is NOT required, so users who never opted into web push still
// receive the win-back email when inactive.
export async function checkWinBack(): Promise<number> {
  let sent = 0;
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const inactive = await db
      .select({ userId: listeningHistory.userId })
      .from(listeningHistory)
      .innerJoin(users, eq(users.id, listeningHistory.userId))
      .where(and(lt(listeningHistory.lastPlayedAt, cutoff), sql`${users.email} IS NOT NULL`))
      .groupBy(listeningHistory.userId)
      .limit(200);

    for (const { userId } of inactive) {
      if (!(await shouldSendForUser(userId, "win_back"))) {
        await trackTrigger(userId, "win_back", "win_back", "skipped", "guardrail");
        continue;
      }

      // Persistent single-send guard: do not send a second win-back to the same
      // user. Spec requires one message per inactivity episode.
      const [pref] = await db.select().from(accessibilityPreferences)
        .where(eq(accessibilityPreferences.userId, userId)).limit(1);
      const profile = (pref?.profile ?? {}) as A11yProfile;
      if (profile.lastWinBackSentAt) continue;

      const payload = getNotificationPayload("win_back");
      const result = await sendNotificationToUser(userId, payload);
      sent += result.sent;
      await trackTrigger(userId, "win_back", "win_back",
        result.sent > 0 ? "sent" : "failed");

      // Send accompanying email when configured. Category opt-out is already
      // honored above via shouldSendForUser; quietHours guards push timing only.
      try {
        const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
        if (u?.email) {
          await sendEmail({
            to: u.email,
            subject: "We miss you on AccessiBooks",
            text: "It's been a while since your last listen. Pick up where you left off — your progress and bookmarks are saved.\n\nOpen AccessiBooks: " + (process.env.PUBLIC_BASE_URL || "https://accessibooks.app") + "/hub",
          });
        }
      } catch (mailErr) {
        console.warn("[Win-back] email send failed:", (mailErr as Error)?.message);
      }

      // Persist marker so subsequent runs skip this user. The marker is cleared
      // by the analytics/playback path when the user returns (resetWinBackOnReturn).
      const merged: A11yProfile = { ...DEFAULT_A11Y_PROFILE, ...profile, lastWinBackSentAt: new Date().toISOString() };
      if (pref) {
        await db.update(accessibilityPreferences)
          .set({ profile: merged, updatedAt: new Date() })
          .where(eq(accessibilityPreferences.userId, userId));
      } else {
        await db.insert(accessibilityPreferences).values({ userId, profile: merged });
      }
    }
  } catch (err) {
    console.error("Win-back check failed:", err);
  }
  return sent;
}

/**
 * Clear the win-back marker so the user is eligible again after the next
 * 14-day inactivity episode. Call from playback resume paths.
 */
export async function resetWinBackOnReturn(userId: string): Promise<void> {
  try {
    const [pref] = await db.select().from(accessibilityPreferences)
      .where(eq(accessibilityPreferences.userId, userId)).limit(1);
    if (!pref) return;
    const profile = (pref.profile ?? {}) as A11yProfile;
    if (!profile.lastWinBackSentAt) return;
    await db.update(accessibilityPreferences)
      .set({ profile: { ...profile, lastWinBackSentAt: null }, updatedAt: new Date() })
      .where(eq(accessibilityPreferences.userId, userId));
  } catch (err) {
    console.warn("[Notifications] resetWinBackOnReturn failed:", (err as Error)?.message);
  }
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
        // Dedupe: only send once per RSVP per window. We store the most-recent
        // window crossed in reminderSentAt; if it already covers the current
        // window we skip. 1h window > 1 hour ago means 24h was last sent.
        if (r.reminderSentAt) {
          const sinceMs = now.getTime() - new Date(r.reminderSentAt).getTime();
          if (hitsDay && sinceMs < 23 * 60 * 60 * 1000) continue; // 24h already sent
          if (hitsHour && sinceMs < 50 * 60 * 1000) continue;     // 1h already sent
        }
        if (!(await shouldSendForUser(r.userId, "rsvp_reminder"))) {
          await trackTrigger(r.userId, "rsvp_reminder", "rsvp_reminder", "skipped", "guardrail",
            { eventId: event.id, window: hitsHour ? "1h" : "24h" });
          continue;
        }
        const payload = getNotificationPayload("rsvp_reminder", {
          title: event.title,
          when: hitsHour ? "in about an hour" : "tomorrow",
          eventId: event.id,
          url: `/events/${event.id}`,
        });
        const result = await sendNotificationToUser(r.userId, payload);
        sent += result.sent;
        await trackTrigger(r.userId, "rsvp_reminder", "rsvp_reminder",
          result.sent > 0 ? "sent" : "failed", undefined,
          { eventId: event.id, window: hitsHour ? "1h" : "24h" });
        // Persist send-once marker so restarts/reruns don't double-send.
        await db.update(eventRsvps)
          .set({ reminderSentAt: now })
          .where(eq(eventRsvps.id, r.id));
      }
    }
  } catch (err) {
    console.error("Event reminder check failed:", err);
  }
  return sent;
}

// Battle pass season ending — remind users with reached-but-unclaimed rewards
// before the season resets and those rewards are lost (Task #246).
export async function checkBattlePassSeasonEnding(): Promise<number> {
  let sent = 0;
  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const endingSeasons = await db.select().from(battlePasses)
      .where(and(
        eq(battlePasses.isActive, true),
        gte(battlePasses.endDate, now),
        lte(battlePasses.endDate, windowEnd),
      ));

    for (const season of endingSeasons) {
      const milestones = await db.select().from(battlePassMilestones)
        .where(eq(battlePassMilestones.battlePassId, season.id));
      if (milestones.length === 0) continue;

      const daysLeft = Math.max(0, Math.ceil(
        (new Date(season.endDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      ));
      // Season-scoped URL doubles as the send-once dedupe key in notificationLog.
      const reminderUrl = `/stats?bpSeason=${season.id}`;

      const participants = await db.select().from(battlePassPurchases)
        .where(eq(battlePassPurchases.battlePassId, season.id));

      for (const p of participants) {
        let claimed: string[] = [];
        try {
          const parsed = JSON.parse(p.claimedMilestones);
          if (Array.isArray(parsed)) claimed = parsed;
        } catch { /* treat as none claimed */ }

        // Only count rewards the user can actually claim right now:
        // reached tiers, not yet claimed, and premium ones only if unlocked.
        const unclaimed = milestones.filter((m) =>
          p.xpEarned >= m.xpRequired &&
          !claimed.includes(m.id) &&
          (!m.isPremium || p.isPremium),
        ).length;
        if (unclaimed === 0) continue;

        // Send at most one reminder per user per season.
        const [already] = await db.select({ id: notificationLog.id })
          .from(notificationLog)
          .where(and(
            eq(notificationLog.userId, p.userId),
            eq(notificationLog.url, reminderUrl),
          ))
          .limit(1);
        if (already) continue;

        if (!(await shouldSendForUser(p.userId, "system"))) {
          await trackTrigger(p.userId, "bp_season_ending", "system", "skipped", "guardrail",
            { seasonId: season.id, daysLeft, unclaimed });
          continue;
        }

        const payload = getNotificationPayload("bp_season_ending", {
          seasonName: season.seasonName,
          daysLeft,
          unclaimed,
          url: reminderUrl,
        });
        const result = await sendNotificationToUser(p.userId, payload);
        sent += result.sent;
        // sendNotificationToUser only writes the in-app notificationLog row
        // when VAPID is configured. Guarantee the in-app reminder exists —
        // it is the fallback delivery channel AND the dedupe marker, so a
        // user is only ever marked "reminded" once the reminder is actually
        // visible in their in-app notification inbox.
        const [logged] = await db.select({ id: notificationLog.id })
          .from(notificationLog)
          .where(and(
            eq(notificationLog.userId, p.userId),
            eq(notificationLog.url, reminderUrl),
          ))
          .limit(1);
        if (!logged) {
          await db.insert(notificationLog).values({
            userId: p.userId,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            url: reminderUrl,
          });
        }
        await trackTrigger(p.userId, "bp_season_ending", "system",
          "sent", result.sent > 0 ? undefined : "in_app_only",
          { seasonId: season.id, daysLeft, unclaimed, pushSent: result.sent });
      }
    }
  } catch (err) {
    console.error("Battle pass season-end check failed:", err);
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

    // Recipients = users with any listening activity in the past week and a
    // valid email on file. Push enrollment is NOT a precondition — the recap
    // is delivered via email (and additionally via push if the user is
    // subscribed). This matches the spec of a Sunday recap email.
    const recipients = await db
      .selectDistinct({ userId: dailyListeningLog.userId })
      .from(dailyListeningLog)
      .innerJoin(users, eq(users.id, dailyListeningLog.userId))
      .where(and(gte(dailyListeningLog.date, wkAgoStr), sql`${users.email} IS NOT NULL`));
    for (const { userId } of recipients) {
      if (!(await shouldSendForUser(userId, "weekly_recap"))) {
        await trackTrigger(userId, "weekly_recap", "weekly_recap", "skipped", "guardrail");
        continue;
      }
      const logs = await db.select().from(dailyListeningLog)
        .where(and(eq(dailyListeningLog.userId, userId), gte(dailyListeningLog.date, wkAgoStr)));
      const minutes = logs.reduce((s, l) => s + (l.minutesListened || 0), 0);
      const books = logs.reduce((s, l) => s + (l.booksCompleted || 0), 0);
      if (minutes < 5) {
        await trackTrigger(userId, "weekly_recap", "weekly_recap", "skipped", "empty_week", { minutes });
        continue;
      }
      const payload = getNotificationPayload("weekly_recap", { minutes, books });
      const result = await sendNotificationToUser(userId, payload);
      sent += result.sent;
      await trackTrigger(userId, "weekly_recap", "weekly_recap",
        result.sent > 0 ? "sent" : "failed", undefined, { minutes, books });

      // Accompanying weekly-recap email (category opt-out already enforced).
      try {
        const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
        if (u?.email) {
          await sendEmail({
            to: u.email,
            subject: `Your week on AccessiBooks: ${minutes} min, ${books} finished`,
            text: `Hi! Here's your weekly listening recap:\n\n• ${minutes} minutes listened\n• ${books} title${books === 1 ? "" : "s"} finished\n\nView the full breakdown: ${process.env.PUBLIC_BASE_URL || "https://accessibooks.app"}/hub`,
          });
        }
      } catch (mailErr) {
        console.warn("[Weekly recap] email send failed:", (mailErr as Error)?.message);
      }
    }
  } catch (err) {
    console.error("Weekly recap check failed:", err);
  }
  return sent;
}

let streakInterval: ReturnType<typeof setInterval> | null = null;
let bpSeasonEndingInterval: ReturnType<typeof setInterval> | null = null;
let goalInterval: ReturnType<typeof setInterval> | null = null;
let reEngageInterval: ReturnType<typeof setInterval> | null = null;
let eventReminderInterval: ReturnType<typeof setInterval> | null = null;
let weeklyRecapInterval: ReturnType<typeof setInterval> | null = null;
let winBackInterval: ReturnType<typeof setInterval> | null = null;
let friendDigestInterval: ReturnType<typeof setInterval> | null = null;

// Friend-finished digest: batches "people you follow finished books this week"
// into a single per-day notification at 18:00 local. Skips users who disabled
// the friend_digest category or are in calmMode/quietHours.
export async function checkFriendDigest(): Promise<number> {
  let sent = 0;
  try {
    // Hard cap on lookback so a brand-new follower never receives a digest
    // covering ancient history.
    const lookbackFloor = new Date();
    lookbackFloor.setDate(lookbackFloor.getDate() - 7);

    // Per-follower window starts at max(lastFriendDigestSentAt, lookbackFloor),
    // so the digest only fires when there are *new* completions since the last
    // successful send. If a user already received a digest today and nothing
    // new happened, no notification goes out (idempotent across daily runs).
    const candidates = await db.execute(sql`
      SELECT DISTINCT uf.follower_id AS follower_id
      FROM user_follows uf
      JOIN listening_history lh ON lh.user_id = uf.following_id
      WHERE lh.completed_at IS NOT NULL
        AND lh.completed_at >= ${lookbackFloor}
    `);
    const candidateRows = friendDigestRowsAdapter(candidates) as Array<{ follower_id: string }>;

    for (const c of candidateRows) {
      const followerId = c.follower_id;
      if (!(await shouldSendForUser(followerId, "friend_digest"))) {
        await trackTrigger(followerId, "friend_digest", "friend_digest", "skipped", "guardrail");
        continue;
      }

      const [pref] = await db.select().from(accessibilityPreferences)
        .where(eq(accessibilityPreferences.userId, followerId)).limit(1);
      const profile = (pref?.profile ?? {}) as A11yProfile;
      const lastSent = profile.lastFriendDigestSentAt
        ? new Date(profile.lastFriendDigestSentAt)
        : null;
      const windowStart = lastSent && lastSent > lookbackFloor ? lastSent : lookbackFloor;

      const detailRows = await db.execute(sql`
        SELECT COUNT(DISTINCT lh.book_id)::int AS books_finished,
               MAX(b.title) AS sample_title,
               MAX(lh.completed_at) AS latest_completed_at
        FROM user_follows uf
        JOIN listening_history lh ON lh.user_id = uf.following_id
        LEFT JOIN books b ON b.id = lh.book_id
        WHERE uf.follower_id = ${followerId}
          AND lh.completed_at IS NOT NULL
          AND lh.completed_at > ${windowStart}
      `);
      const detail = (friendDigestRowsAdapter(detailRows)[0] ?? {}) as {
        books_finished?: number; sample_title?: string | null; latest_completed_at?: string | Date | null;
      };
      const newCount = Number(detail.books_finished ?? 0);
      if (newCount < 1) continue; // nothing new since last digest — skip

      const payload = getNotificationPayload("friend_digest", {
        count: newCount,
        sampleTitle: detail.sample_title ?? "a book",
        url: "/hub",
      });
      const result = await sendNotificationToUser(followerId, payload);
      sent += result.sent;
      await trackTrigger(followerId, "friend_digest", "friend_digest",
        result.sent > 0 ? "sent" : "failed", undefined, { count: newCount });

      // Persist marker so the next run only counts completions newer than this.
      const merged: A11yProfile = {
        ...DEFAULT_A11Y_PROFILE,
        ...profile,
        lastFriendDigestSentAt: new Date().toISOString(),
      };
      if (pref) {
        await db.update(accessibilityPreferences)
          .set({ profile: merged, updatedAt: new Date() })
          .where(eq(accessibilityPreferences.userId, followerId));
      } else {
        await db.insert(accessibilityPreferences).values({ userId: followerId, profile: merged });
      }
    }
  } catch (err) {
    console.error("Friend digest check failed:", err);
  }
  return sent;
}

// Adapter: drizzle's db.execute returns either { rows } or an array shape
// depending on the driver. Normalize for use above.
function friendDigestRowsAdapter(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  const r = result as { rows?: unknown[] } | null | undefined;
  return r?.rows ?? [];
}

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

  // Battle pass season-end reminders — hourly check, fires only at noon
  bpSeasonEndingInterval = setInterval(async () => {
    const hour = new Date().getHours();
    if (hour === 12) {
      const sent = await checkBattlePassSeasonEnding();
      if (sent > 0) console.log(`[Notifications] Sent ${sent} battle pass season-end reminders`);
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

  // Friend digest — once a day at 18:00 (batched, never one-per-friend)
  friendDigestInterval = setInterval(async () => {
    const hour = new Date().getHours();
    if (hour === 18) {
      const sent = await checkFriendDigest();
      if (sent > 0) console.log(`[Notifications] Sent ${sent} friend digests`);
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
  if (friendDigestInterval) clearInterval(friendDigestInterval);
  if (bpSeasonEndingInterval) clearInterval(bpSeasonEndingInterval);
  bpSeasonEndingInterval = null;
  friendDigestInterval = null;
  streakInterval = null;
  goalInterval = null;
  reEngageInterval = null;
  eventReminderInterval = null;
  weeklyRecapInterval = null;
  winBackInterval = null;
  console.log("[Notifications] Scheduler stopped");
}
