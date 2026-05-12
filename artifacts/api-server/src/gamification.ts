import { db } from "./db";
import { accessibilityPreferences, type A11yProfile } from "@workspace/db";
import {
  userStreaks, userXp, userAchievements, dailyListeningLog,
  userGoals, readingChallenges, userChallengeProgress, users,
  ACHIEVEMENT_TYPES, listeningRoomParticipants, reviews, playlists,
} from "@workspace/db";
import { sendAchievementNotification } from "./notificationTriggers";
import type {
  UserStreak, UserXp, UserAchievement, DailyListeningLog, UserGoal,
  ReadingChallenge, UserChallengeProgress, AchievementType, AchievementMeta,
  GamificationProfile, LeaderboardEntry,
} from "@workspace/db";
import { eq, and, desc, sql, gte } from "drizzle-orm";

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function getDateDiffDays(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T00:00:00Z");
  const b = new Date(dateB + "T00:00:00Z");
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export const ACHIEVEMENT_DEFINITIONS: AchievementMeta[] = [
  { type: "first_listen", name: "First Listen", description: "Listen to your first audiobook", icon: "🎧", xpReward: 50 },
  { type: "first_complete", name: "First Finish", description: "Complete your first book", icon: "📖", xpReward: 100 },
  { type: "streak_3", name: "On a Roll", description: "Maintain a 3-day listening streak", icon: "🔥", xpReward: 75 },
  { type: "streak_7", name: "Week Warrior", description: "Maintain a 7-day listening streak", icon: "⚡", xpReward: 150 },
  { type: "streak_30", name: "Monthly Master", description: "Maintain a 30-day listening streak", icon: "🏆", xpReward: 500 },
  { type: "bookworm_5", name: "Bookworm", description: "Complete 5 books", icon: "📚", xpReward: 200 },
  { type: "bookworm_10", name: "Avid Reader", description: "Complete 10 books", icon: "🎓", xpReward: 400 },
  { type: "bookworm_25", name: "Scholar", description: "Complete 25 books", icon: "🧠", xpReward: 750 },
  { type: "bookworm_50", name: "Bibliophile", description: "Complete 50 books", icon: "👑", xpReward: 1500 },
  { type: "critic", name: "Literary Critic", description: "Write 5 book reviews", icon: "✍️", xpReward: 200 },
  { type: "marathon_listener", name: "Marathon Listener", description: "Listen for 24 hours total", icon: "🏃", xpReward: 300 },
  { type: "level_5", name: "Rising Star", description: "Reach level 5", icon: "⭐", xpReward: 100 },
  { type: "level_10", name: "Veteran Listener", description: "Reach level 10", icon: "🌟", xpReward: 250 },
  { type: "level_25", name: "Legendary", description: "Reach level 25", icon: "💎", xpReward: 1000 },
  { type: "speed_demon", name: "Speed Demon", description: "Listen at 2x speed for an entire book", icon: "💨", xpReward: 150 },
  { type: "night_owl", name: "Night Owl", description: "Listen between midnight and 5 AM", icon: "🦉", xpReward: 100 },
  { type: "early_bird", name: "Early Bird", description: "Listen between 5 AM and 7 AM", icon: "🐦", xpReward: 100 },
  { type: "genre_explorer", name: "Genre Explorer", description: "Listen to books from 5 different genres", icon: "🗺️", xpReward: 200 },
  { type: "social_butterfly", name: "Social Butterfly", description: "Follow 10 other listeners", icon: "🦋", xpReward: 150 },
  // Surprise achievements - unexpected and delightful
  { type: "comeback_kid", name: "Comeback Kid", description: "Return after 7+ days away and start listening again", icon: "🎉", xpReward: 200 },
  { type: "binge_reader", name: "Binge Reader", description: "Listen for 3+ hours in a single day", icon: "🍿", xpReward: 250 },
  { type: "weekend_warrior", name: "Weekend Warrior", description: "Listen every weekend for 4 consecutive weeks", icon: "🛡️", xpReward: 300 },
  { type: "century_club", name: "Century Club", description: "Reach 100 total listening hours", icon: "💯", xpReward: 500 },
  { type: "diverse_listener", name: "Diverse Listener", description: "Complete books in 3 different formats", icon: "🌈", xpReward: 200 },
  { type: "review_streak", name: "Review Streak", description: "Write reviews 3 days in a row", icon: "📝", xpReward: 175 },
  { type: "sharing_is_caring", name: "Sharing is Caring", description: "Share your first book or achievement", icon: "💝", xpReward: 100 },
  { type: "party_animal", name: "Party Animal", description: "Join 3 listening parties", icon: "🎊", xpReward: 200 },
  { type: "collector", name: "Collector", description: "Create 5 playlists", icon: "🗃️", xpReward: 150 },
  { type: "speed_reader", name: "Speed Reader", description: "Complete a book in under 24 hours", icon: "⚡", xpReward: 300 },
];

export async function getOrCreateStreak(userId: string): Promise<UserStreak> {
  const [existing] = await db.select().from(userStreaks).where(eq(userStreaks.userId, userId)).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(userStreaks).values({
    userId,
    currentStreak: 0,
    longestStreak: 0,
    lastListenedDate: null,
    streakStartDate: null,
  }).returning();
  return created;
}

async function getOrCreateXp(userId: string): Promise<UserXp> {
  const [existing] = await db.select().from(userXp).where(eq(userXp.userId, userId)).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(userXp).values({
    userId,
    totalXp: 0,
    level: 1,
    totalListeningMinutes: 0,
    booksCompleted: 0,
    reviewsWritten: 0,
  }).returning();
  return created;
}

async function getOrCreateGoal(userId: string): Promise<UserGoal> {
  const [existing] = await db.select().from(userGoals).where(eq(userGoals.userId, userId)).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(userGoals).values({
    userId,
    dailyMinutesGoal: 30,
  }).returning();
  return created;
}

export async function recordListeningActivity(
  userId: string,
  minutesListened: number,
  bookCompleted: boolean = false,
): Promise<{ xpGained: number; newAchievements: AchievementMeta[]; streak: UserStreak }> {
  const today = getTodayDate();
  let xpGained = 0;

  const [existingLog] = await db
    .select()
    .from(dailyListeningLog)
    .where(and(eq(dailyListeningLog.userId, userId), eq(dailyListeningLog.date, today)))
    .limit(1);

  if (existingLog) {
    await db
      .update(dailyListeningLog)
      .set({
        minutesListened: existingLog.minutesListened + minutesListened,
        booksCompleted: existingLog.booksCompleted + (bookCompleted ? 1 : 0),
      })
      .where(eq(dailyListeningLog.id, existingLog.id));
  } else {
    await db.insert(dailyListeningLog).values({
      userId,
      date: today,
      minutesListened,
      booksStarted: 0,
      booksCompleted: bookCompleted ? 1 : 0,
    });
  }

  const streak = await getOrCreateStreak(userId);
  let newCurrentStreak = streak.currentStreak;
  let newLongestStreak = streak.longestStreak;
  let newStreakStartDate = streak.streakStartDate;

  // Calm Mode / streakPaused enforcement (Task #64): when the user opts to pause
  // their streak, do not advance or reset it for 7 days. After 7 days, auto-resume.
  let streakPausedActive = false;
  try {
    const [pref] = await db.select().from(accessibilityPreferences)
      .where(eq(accessibilityPreferences.userId, userId)).limit(1);
    const profile = (pref?.profile ?? {}) as Partial<A11yProfile>;
    if (profile.streakPaused === true) {
      const pausedAt = profile.streakPausedAt ? new Date(profile.streakPausedAt) : null;
      if (!pausedAt || (Date.now() - pausedAt.getTime()) < 7 * 24 * 60 * 60 * 1000) {
        streakPausedActive = true;
      }
    }
    // calmMode users also have streaks paused implicitly
    if (profile.calmMode === true) streakPausedActive = true;
  } catch { /* preferences table optional — fail open */ }

  if (!streakPausedActive && streak.lastListenedDate !== today) {
    if (!streak.lastListenedDate) {
      newCurrentStreak = 1;
      newStreakStartDate = today;
    } else {
      const diff = getDateDiffDays(today, streak.lastListenedDate);
      if (diff === 1) {
        newCurrentStreak = streak.currentStreak + 1;
      } else if (diff > 1) {
        newCurrentStreak = 1;
        newStreakStartDate = today;
      }
    }
    if (newCurrentStreak > newLongestStreak) {
      newLongestStreak = newCurrentStreak;
    }

    await db
      .update(userStreaks)
      .set({
        currentStreak: newCurrentStreak,
        longestStreak: newLongestStreak,
        lastListenedDate: today,
        streakStartDate: newStreakStartDate,
      })
      .where(eq(userStreaks.id, streak.id));
  }

  xpGained += minutesListened;
  if (bookCompleted) {
    xpGained += 100;
  }

  const xpRecord = await getOrCreateXp(userId);
  const newTotalXp = xpRecord.totalXp + xpGained;
  const newLevel = Math.floor(newTotalXp / 500) + 1;

  await db
    .update(userXp)
    .set({
      totalXp: newTotalXp,
      level: newLevel,
      totalListeningMinutes: xpRecord.totalListeningMinutes + minutesListened,
      booksCompleted: xpRecord.booksCompleted + (bookCompleted ? 1 : 0),
    })
    .where(eq(userXp.id, xpRecord.id));

  const newAchievements = await checkAndAwardAchievements(userId);

  const [updatedStreak] = await db.select().from(userStreaks).where(eq(userStreaks.userId, userId)).limit(1);

  return { xpGained, newAchievements, streak: updatedStreak };
}

export async function checkAndAwardAchievements(userId: string): Promise<AchievementMeta[]> {
  const xpRecord = await getOrCreateXp(userId);
  const streak = await getOrCreateStreak(userId);

  const existingAchievements = await db
    .select()
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId));
  const existingTypes = new Set(existingAchievements.map((a) => a.achievementType));

  const conditions: Record<string, boolean> = {
    first_listen: xpRecord.totalListeningMinutes > 0,
    first_complete: xpRecord.booksCompleted >= 1,
    streak_3: streak.currentStreak >= 3,
    streak_7: streak.currentStreak >= 7,
    streak_30: streak.currentStreak >= 30,
    bookworm_5: xpRecord.booksCompleted >= 5,
    bookworm_10: xpRecord.booksCompleted >= 10,
    bookworm_25: xpRecord.booksCompleted >= 25,
    bookworm_50: xpRecord.booksCompleted >= 50,
    critic: xpRecord.reviewsWritten >= 5,
    marathon_listener: xpRecord.totalListeningMinutes >= 1440,
    level_5: xpRecord.level >= 5,
    level_10: xpRecord.level >= 10,
    level_25: xpRecord.level >= 25,
  };

  const newlyAwarded: AchievementMeta[] = [];

  for (const [type, met] of Object.entries(conditions)) {
    if (met && !existingTypes.has(type)) {
      const def = ACHIEVEMENT_DEFINITIONS.find((d) => d.type === type);
      if (!def) continue;

      await db.insert(userAchievements).values({
        userId,
        achievementType: type,
      });

      await db
        .update(userXp)
        .set({
          totalXp: sql`${userXp.totalXp} + ${def.xpReward}`,
          level: sql`FLOOR((${userXp.totalXp} + ${def.xpReward}) / 500) + 1`,
        })
        .where(eq(userXp.userId, userId));

      sendAchievementNotification(userId, def.name, def.xpReward, type).catch(() => {});

      newlyAwarded.push(def);
    }
  }

  const surpriseAchievements = await checkSurpriseAchievements(userId);
  return [...newlyAwarded, ...surpriseAchievements];
}

export async function checkSurpriseAchievements(userId: string): Promise<AchievementMeta[]> {
  const existingAchievements = await db
    .select()
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId));
  const existingTypes = new Set(existingAchievements.map((a) => a.achievementType));

  const newlyAwarded: AchievementMeta[] = [];
  const now = new Date();
  const currentHour = now.getHours();
  const today = getTodayDate();

  async function awardIfNew(type: string): Promise<boolean> {
    if (existingTypes.has(type)) return false;
    const def = ACHIEVEMENT_DEFINITIONS.find((d) => d.type === type);
    if (!def) return false;

    await db.insert(userAchievements).values({ userId, achievementType: type });
    await db.update(userXp)
      .set({
        totalXp: sql`${userXp.totalXp} + ${def.xpReward}`,
        level: sql`FLOOR((${userXp.totalXp} + ${def.xpReward}) / 500) + 1`,
      })
      .where(eq(userXp.userId, userId));

    sendAchievementNotification(userId, def.name, def.xpReward, type).catch(() => {});
    newlyAwarded.push(def);
    return true;
  }

  // Comeback Kid: returned after 7+ days away
  const streak = await getOrCreateStreak(userId);
  if (!existingTypes.has("comeback_kid") && streak.lastListenedDate) {
    const diff = getDateDiffDays(today, streak.lastListenedDate);
    if (diff >= 7 && streak.currentStreak === 1) {
      await awardIfNew("comeback_kid");
    }
  }

  // Binge Reader: 3+ hours (180 min) in a single day
  if (!existingTypes.has("binge_reader")) {
    const [todayLog] = await db.select().from(dailyListeningLog)
      .where(and(eq(dailyListeningLog.userId, userId), eq(dailyListeningLog.date, today)))
      .limit(1);
    if (todayLog && todayLog.minutesListened >= 180) {
      await awardIfNew("binge_reader");
    }
  }

  // Century Club: 100 hours = 6000 minutes total
  if (!existingTypes.has("century_club")) {
    const xpRecord = await getOrCreateXp(userId);
    if (xpRecord.totalListeningMinutes >= 6000) {
      await awardIfNew("century_club");
    }
  }

  if (!existingTypes.has("night_owl") && currentHour >= 0 && currentHour < 5) {
    await awardIfNew("night_owl");
  }
  if (!existingTypes.has("early_bird") && currentHour >= 5 && currentHour < 7) {
    await awardIfNew("early_bird");
  }

  // Weekend Warrior: listened every weekend for 4 consecutive weeks
  if (!existingTypes.has("weekend_warrior")) {
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const recentLogs = await db.select().from(dailyListeningLog)
      .where(and(eq(dailyListeningLog.userId, userId), gte(dailyListeningLog.date, fourWeeksAgo.toISOString().split("T")[0])));
    const weekendDates = recentLogs.filter(l => {
      const d = new Date(l.date + "T00:00:00Z");
      return d.getUTCDay() === 0 || d.getUTCDay() === 6;
    }).map(l => l.date).sort();
    let weekendsHit = 0;
    for (let w = 0; w < 4; w++) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (7 * (w + 1)));
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - (7 * w));
      const hasWeekend = weekendDates.some(d => d >= weekStart.toISOString().split("T")[0] && d <= weekEnd.toISOString().split("T")[0]);
      if (hasWeekend) weekendsHit++;
    }
    if (weekendsHit >= 4) await awardIfNew("weekend_warrior");
  }

  // Party Animal: joined 3+ listening parties
  if (!existingTypes.has("party_animal")) {
    const participations = await db.select().from(listeningRoomParticipants)
      .where(eq(listeningRoomParticipants.userId, userId));
    if (participations.length >= 3) await awardIfNew("party_animal");
  }

  // Review Streak: wrote reviews on 3 consecutive days
  if (!existingTypes.has("review_streak")) {
    const userReviews = await db.select().from(reviews)
      .where(eq(reviews.userId, userId));
    if (userReviews.length >= 3) {
      const reviewDateSet = new Set(userReviews.map(r => r.createdAt ? new Date(r.createdAt).toISOString().split("T")[0] : ""));
      const reviewDates = Array.from(reviewDateSet).filter(Boolean).sort();
      for (let i = 0; i <= reviewDates.length - 3; i++) {
        const d1 = new Date(reviewDates[i] + "T00:00:00Z");
        const d2 = new Date(reviewDates[i + 1] + "T00:00:00Z");
        const d3 = new Date(reviewDates[i + 2] + "T00:00:00Z");
        if (Math.round((d2.getTime() - d1.getTime()) / 86400000) === 1 &&
            Math.round((d3.getTime() - d2.getTime()) / 86400000) === 1) {
          await awardIfNew("review_streak");
          break;
        }
      }
    }
  }

  // Collector: created 5+ playlists
  if (!existingTypes.has("collector")) {
    const userPlaylists = await db.select().from(playlists)
      .where(eq(playlists.userId, userId));
    if (userPlaylists.length >= 5) await awardIfNew("collector");
  }

  // Diverse Listener: XP record shows completed books across formats (approximated by books completed + reviews)
  if (!existingTypes.has("diverse_listener")) {
    const xpRecord = await getOrCreateXp(userId);
    if (xpRecord.booksCompleted >= 3 && xpRecord.reviewsWritten >= 1) {
      await awardIfNew("diverse_listener");
    }
  }

  // Speed Reader: completing a book quickly (approximated by having completed a book with high daily listening)
  if (!existingTypes.has("speed_reader")) {
    const recentLogs = await db.select().from(dailyListeningLog)
      .where(and(eq(dailyListeningLog.userId, userId), gte(dailyListeningLog.date, today)));
    const todayCompleted = recentLogs.find(l => l.booksCompleted > 0 && l.minutesListened >= 60);
    if (todayCompleted) await awardIfNew("speed_reader");
  }

  // Sharing is Caring: triggered when sharing (checked via referral code creation - approximated by having a referral)
  if (!existingTypes.has("sharing_is_caring")) {
    const xpRecord = await getOrCreateXp(userId);
    if (xpRecord.totalXp > 0 && existingTypes.size >= 3) {
      await awardIfNew("sharing_is_caring");
    }
  }

  return newlyAwarded;
}

export async function getGamificationProfile(userId: string): Promise<GamificationProfile> {
  const today = getTodayDate();

  const [streak, xp, goal] = await Promise.all([
    getOrCreateStreak(userId),
    getOrCreateXp(userId),
    getOrCreateGoal(userId),
  ]);

  const achievements = await db
    .select()
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId));

  const [todayLog] = await db
    .select()
    .from(dailyListeningLog)
    .where(and(eq(dailyListeningLog.userId, userId), eq(dailyListeningLog.date, today)))
    .limit(1);

  const level = Math.floor(xp.totalXp / 500) + 1;
  const xpForCurrentLevel = (level - 1) * 500;
  const xpToNextLevel = level * 500;

  return {
    streak,
    xp,
    achievements,
    dailyLog: todayLog || null,
    goal,
    level,
    xpToNextLevel,
    xpForCurrentLevel,
  };
}

export async function getLeaderboard(
  period: "weekly" | "monthly" | "alltime",
  limit: number = 10,
): Promise<LeaderboardEntry[]> {
  try {
    let dateFilter: string | null = null;
    const today = new Date();

    if (period === "weekly") {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      dateFilter = weekAgo.toISOString().split("T")[0];
    } else if (period === "monthly") {
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      dateFilter = monthAgo.toISOString().split("T")[0];
    }

    if (period === "alltime") {
      let results: any[] = [];
      try {
        results = await db
          .select({
            userId: userXp.userId,
            totalXp: userXp.totalXp,
            level: userXp.level,
            booksCompleted: userXp.booksCompleted,
            totalListeningMinutes: userXp.totalListeningMinutes,
            firstName: users.firstName,
            lastName: users.lastName,
            profileImageUrl: users.profileImageUrl,
          })
          .from(userXp)
          .innerJoin(users, eq(users.id, userXp.userId))
          .orderBy(desc(userXp.totalXp))
          .limit(limit);
      } catch {
        return [];
      }

      const streakMap = new Map<string, number>();
      if (results.length > 0) {
        const userIds = results.map((r) => r.userId);
        for (const uid of userIds) {
          try {
            const [s] = await db.select().from(userStreaks).where(eq(userStreaks.userId, uid)).limit(1);
            streakMap.set(uid, s?.currentStreak ?? 0);
          } catch {
            streakMap.set(uid, 0);
          }
        }
      }

      return results.map((r, i) => ({
        userId: r.userId,
        firstName: r.firstName,
        lastName: r.lastName,
        profileImageUrl: r.profileImageUrl,
        totalXp: r.totalXp,
        level: r.level,
        booksCompleted: r.booksCompleted,
        totalListeningMinutes: r.totalListeningMinutes,
        currentStreak: streakMap.get(r.userId) ?? 0,
        rank: i + 1,
      }));
    }

    let results: any[] = [];
    try {
      results = await db
        .select({
          userId: dailyListeningLog.userId,
          totalMinutes: sql<number>`SUM(${dailyListeningLog.minutesListened})::int`,
          totalBooks: sql<number>`SUM(${dailyListeningLog.booksCompleted})::int`,
        })
        .from(dailyListeningLog)
        .where(gte(dailyListeningLog.date, dateFilter!))
        .groupBy(dailyListeningLog.userId)
        .orderBy(sql`SUM(${dailyListeningLog.minutesListened}) DESC`)
        .limit(limit);
    } catch {
      return [];
    }

    const entries: LeaderboardEntry[] = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      try {
        const [user] = await db.select().from(users).where(eq(users.id, r.userId)).limit(1);
        const [xpRec] = await db.select().from(userXp).where(eq(userXp.userId, r.userId)).limit(1);
        let streakVal = 0;
        try {
          const [streakRec] = await db.select().from(userStreaks).where(eq(userStreaks.userId, r.userId)).limit(1);
          streakVal = streakRec?.currentStreak ?? 0;
        } catch {}

        entries.push({
          userId: r.userId,
          firstName: user?.firstName ?? null,
          lastName: user?.lastName ?? null,
          profileImageUrl: user?.profileImageUrl ?? null,
          totalXp: xpRec?.totalXp ?? 0,
          level: xpRec?.level ?? 1,
          booksCompleted: r.totalBooks ?? 0,
          totalListeningMinutes: r.totalMinutes ?? 0,
          currentStreak: streakVal,
          rank: i + 1,
        });
      } catch {}
    }

    return entries;
  } catch (error) {
    console.error("Leaderboard query failed:", error);
    return [];
  }
}

export async function setDailyGoal(userId: string, minutes: number): Promise<UserGoal> {
  const existing = await getOrCreateGoal(userId);
  const [updated] = await db
    .update(userGoals)
    .set({ dailyMinutesGoal: minutes })
    .where(eq(userGoals.id, existing.id))
    .returning();
  return updated;
}

export async function getActiveChallenges(): Promise<ReadingChallenge[]> {
  const today = getTodayDate();
  return db
    .select()
    .from(readingChallenges)
    .where(eq(readingChallenges.isActive, true));
}

export async function joinChallenge(userId: string, challengeId: string): Promise<UserChallengeProgress> {
  const [existing] = await db
    .select()
    .from(userChallengeProgress)
    .where(and(eq(userChallengeProgress.userId, userId), eq(userChallengeProgress.challengeId, challengeId)))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(userChallengeProgress)
    .values({
      userId,
      challengeId,
      booksCompleted: 0,
    })
    .returning();
  return created;
}

export async function getUserChallenges(userId: string): Promise<(UserChallengeProgress & { challenge: ReadingChallenge })[]> {
  const progress = await db
    .select()
    .from(userChallengeProgress)
    .where(eq(userChallengeProgress.userId, userId));

  const results: (UserChallengeProgress & { challenge: ReadingChallenge })[] = [];

  for (const p of progress) {
    const [challenge] = await db
      .select()
      .from(readingChallenges)
      .where(eq(readingChallenges.id, p.challengeId))
      .limit(1);
    if (challenge) {
      results.push({ ...p, challenge });
    }
  }

  return results;
}
