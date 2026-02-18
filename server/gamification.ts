import { db } from "./db";
import {
  userStreaks, userXp, userAchievements, dailyListeningLog,
  userGoals, readingChallenges, userChallengeProgress, users,
  ACHIEVEMENT_TYPES,
} from "@shared/schema";
import { sendAchievementNotification } from "./notificationTriggers";
import type {
  UserStreak, UserXp, UserAchievement, DailyListeningLog, UserGoal,
  ReadingChallenge, UserChallengeProgress, AchievementType, AchievementMeta,
  GamificationProfile, LeaderboardEntry,
} from "@shared/schema";
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
  { type: "collector", name: "Collector", description: "Add 20 books to your playlists", icon: "🗃️", xpReward: 150 },
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

  if (streak.lastListenedDate !== today) {
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
    const results = await db
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

    const streakMap = new Map<string, number>();
    if (results.length > 0) {
      const userIds = results.map((r) => r.userId);
      for (const uid of userIds) {
        const [s] = await db.select().from(userStreaks).where(eq(userStreaks.userId, uid)).limit(1);
        streakMap.set(uid, s?.currentStreak ?? 0);
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

  const results = await db
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

  const entries: LeaderboardEntry[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const [user] = await db.select().from(users).where(eq(users.id, r.userId)).limit(1);
    const [xpRec] = await db.select().from(userXp).where(eq(userXp.userId, r.userId)).limit(1);
    const [streakRec] = await db.select().from(userStreaks).where(eq(userStreaks.userId, r.userId)).limit(1);

    entries.push({
      userId: r.userId,
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      profileImageUrl: user?.profileImageUrl ?? null,
      totalXp: xpRec?.totalXp ?? 0,
      level: xpRec?.level ?? 1,
      booksCompleted: r.totalBooks ?? 0,
      totalListeningMinutes: r.totalMinutes ?? 0,
      currentStreak: streakRec?.currentStreak ?? 0,
      rank: i + 1,
    });
  }

  return entries;
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
