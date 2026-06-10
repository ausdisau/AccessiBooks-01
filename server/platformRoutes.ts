import { Express, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { eq, desc, sql, and, count, inArray } from "drizzle-orm";
import {
  userPreferences, users, books, listeningHistory, notificationLog,
  userFollows, activityFeed, readingClubs, readingClubMembers,
  familyAccounts, familyMembers, authorTips, contentReports,
  engagementMetrics, seederProgress
} from "@shared/schema";
import rateLimit from "express-rate-limit";
import { isAuthenticated, requireAdmin } from "./multiAuth";

export function createRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    keyGenerator: (req: any) => {
      return req.user?.id || req.ip || "anonymous";
    },
    limit: (req: any) => {
      if (!req.isAuthenticated || !req.isAuthenticated()) return 60;
      const tier = req.user?.subscriptionTier || "free";
      if (tier === "premium") return 1000;
      if (tier === "plus") return 300;
      return 100;
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

async function updateChurnRisk(userId: string) {
  try {
    const [metrics] = await db.select().from(engagementMetrics).where(eq(engagementMetrics.userId, userId));
    if (!metrics) return;

    const now = new Date();
    const lastActive = metrics.lastActiveAt ? new Date(metrics.lastActiveAt) : now;
    const daysSinceActive = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
    const sessions = metrics.totalSessionsLast30d || 0;

    let risk = "low";
    if (daysSinceActive > 30 || sessions < 2) {
      risk = "high";
    } else if (daysSinceActive > 14 || sessions < 5) {
      risk = "medium";
    }

    await db.update(engagementMetrics)
      .set({ churnRisk: risk, updatedAt: new Date() })
      .where(eq(engagementMetrics.userId, userId));
  } catch (err) {
    console.error("[Churn] Error updating churn risk:", err);
  }
}

export function registerPlatformRoutes(app: Express) {

  // ─── 1. Onboarding Enhancement ───
  app.put("/api/user/preferences", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { favoriteGenres, preferredContentTypes, listeningHabit, onboardingCompleted } = req.body;

      const [existing] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));

      if (existing) {
        const updateData: any = {};
        if (favoriteGenres !== undefined) updateData.favoriteGenres = favoriteGenres;
        if (preferredContentTypes !== undefined) updateData.preferredContentTypes = preferredContentTypes;
        if (listeningHabit !== undefined) updateData.listeningHabit = listeningHabit;
        if (onboardingCompleted !== undefined) updateData.onboardingCompleted = onboardingCompleted;

        const [updated] = await db.update(userPreferences)
          .set(updateData)
          .where(eq(userPreferences.userId, userId))
          .returning();
        return res.json(updated);
      }

      const [created] = await db.insert(userPreferences).values({
        userId,
        favoriteGenres: favoriteGenres || [],
        preferredContentTypes: preferredContentTypes || [],
        listeningHabit: listeningHabit || null,
        onboardingCompleted: onboardingCompleted || false,
      }).returning();

      res.json(created);
    } catch (error) {
      console.error("Error saving preferences:", error);
      res.status(500).json({ message: "Failed to save preferences" });
    }
  });

  // ─── 2. Recommendations API ───
  app.get("/api/recommendations", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;

      const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
      const genres = prefs?.favoriteGenres || [];

      const history = await db.select({ bookAuthor: listeningHistory.bookAuthor })
        .from(listeningHistory)
        .where(eq(listeningHistory.userId, userId))
        .limit(50);

      const listenedAuthors = Array.from(new Set(history.map(h => h.bookAuthor).filter(Boolean))) as string[];

      let recommended: any[] = [];

      if (genres.length > 0) {
        const genreBooks = await db.select().from(books)
          .where(inArray(books.genre, genres))
          .limit(20);
        recommended.push(...genreBooks);
      }

      if (listenedAuthors.length > 0 && recommended.length < 20) {
        const authorBooks = await db.select().from(books)
          .where(inArray(books.author, listenedAuthors))
          .limit(20 - recommended.length);
        const existingIds = new Set(recommended.map(b => b.id));
        for (const b of authorBooks) {
          if (!existingIds.has(b.id)) recommended.push(b);
        }
      }

      if (recommended.length < 20) {
        const filler = await db.select().from(books)
          .orderBy(desc(books.publishedYear))
          .limit(20 - recommended.length);
        const existingIds = new Set(recommended.map(b => b.id));
        for (const b of filler) {
          if (!existingIds.has(b.id)) recommended.push(b);
        }
      }

      res.json(recommended.slice(0, 20));
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  app.get("/api/recommendations/similar/:bookId", async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const [book] = await db.select().from(books).where(eq(books.id, bookId));
      if (!book) return res.status(404).json({ message: "Book not found" });

      let similar: any[] = [];

      if (book.genre) {
        const genreMatches = await db.select().from(books)
          .where(and(eq(books.genre, book.genre), sql`${books.id} != ${bookId}`))
          .limit(10);
        similar.push(...genreMatches);
      }

      if (similar.length < 10) {
        const authorMatches = await db.select().from(books)
          .where(and(eq(books.author, book.author), sql`${books.id} != ${bookId}`))
          .limit(10 - similar.length);
        const existingIds = new Set(similar.map(b => b.id));
        for (const b of authorMatches) {
          if (!existingIds.has(b.id)) similar.push(b);
        }
      }

      res.json(similar.slice(0, 10));
    } catch (error) {
      console.error("Error fetching similar books:", error);
      res.status(500).json({ message: "Failed to fetch similar books" });
    }
  });

  // ─── 3. Notifications / In-App Inbox ───
  app.get("/api/notifications", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const notifications = await db.select().from(notificationLog)
        .where(eq(notificationLog.userId, userId))
        .orderBy(desc(notificationLog.sentAt))
        .limit(50);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const [updated] = await db.update(notificationLog)
        .set({ clicked: 1 })
        .where(eq(notificationLog.id, id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Notification not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.post("/api/notifications/read-all", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      await db.update(notificationLog)
        .set({ clicked: 1 })
        .where(eq(notificationLog.userId, userId));
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      console.error("Error marking all notifications read:", error);
      res.status(500).json({ message: "Failed to mark all as read" });
    }
  });

  // ─── 4. Social Features APIs ───
  app.get("/api/social/feed", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const following = await db.select({ followingId: userFollows.followingId })
        .from(userFollows)
        .where(eq(userFollows.followerId, userId));

      const followedIds = following.map(f => f.followingId);
      if (followedIds.length === 0) return res.json([]);

      const activities = await db.select().from(activityFeed)
        .where(inArray(activityFeed.userId, followedIds))
        .orderBy(desc(activityFeed.createdAt))
        .limit(50);

      res.json(activities);
    } catch (error) {
      console.error("Error fetching social feed:", error);
      res.status(500).json({ message: "Failed to fetch social feed" });
    }
  });

  app.post("/api/social/activity", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { activityType, bookId, bookTitle, metadata } = req.body;

      if (!activityType) return res.status(400).json({ message: "activityType is required" });

      const [activity] = await db.insert(activityFeed).values({
        userId,
        activityType,
        bookId: bookId || null,
        bookTitle: bookTitle || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      }).returning();

      res.json(activity);
    } catch (error) {
      console.error("Error recording activity:", error);
      res.status(500).json({ message: "Failed to record activity" });
    }
  });

  app.get("/api/social/followers/:userId", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const followers = await db.select({
        id: userFollows.id,
        followerId: userFollows.followerId,
        createdAt: userFollows.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        },
      })
        .from(userFollows)
        .innerJoin(users, eq(users.id, userFollows.followerId))
        .where(eq(userFollows.followingId, userId));

      res.json(followers);
    } catch (error) {
      console.error("Error fetching followers:", error);
      res.status(500).json({ message: "Failed to fetch followers" });
    }
  });

  app.get("/api/social/following/:userId", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const followingList = await db.select({
        id: userFollows.id,
        followingId: userFollows.followingId,
        createdAt: userFollows.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        },
      })
        .from(userFollows)
        .innerJoin(users, eq(users.id, userFollows.followingId))
        .where(eq(userFollows.followerId, userId));

      res.json(followingList);
    } catch (error) {
      console.error("Error fetching following:", error);
      res.status(500).json({ message: "Failed to fetch following" });
    }
  });

  app.get("/api/users/:userId/profile", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const [user] = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, userId));

      if (!user) return res.status(404).json({ message: "User not found" });

      const [followerCount] = await db.select({ count: count() })
        .from(userFollows)
        .where(eq(userFollows.followingId, userId));

      const [followingCount] = await db.select({ count: count() })
        .from(userFollows)
        .where(eq(userFollows.followerId, userId));

      const recentActivity = await db.select().from(activityFeed)
        .where(eq(activityFeed.userId, userId))
        .orderBy(desc(activityFeed.createdAt))
        .limit(10);

      res.json({
        ...user,
        followerCount: followerCount?.count || 0,
        followingCount: followingCount?.count || 0,
        recentActivity,
      });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });

  // ─── 5. Reading Clubs ───
  app.post("/api/clubs", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { name, description, isPublic } = req.body;
      if (!name) return res.status(400).json({ message: "Club name is required" });

      const [club] = await db.insert(readingClubs).values({
        name,
        description: description || null,
        creatorId: userId,
        isPublic: isPublic !== false,
      }).returning();

      await db.insert(readingClubMembers).values({
        clubId: club.id,
        userId,
      });

      res.json(club);
    } catch (error) {
      console.error("Error creating club:", error);
      res.status(500).json({ message: "Failed to create club" });
    }
  });

  app.get("/api/clubs", async (_req: Request, res: Response) => {
    try {
      const clubs = await db.select().from(readingClubs)
        .where(eq(readingClubs.isPublic, true))
        .orderBy(desc(readingClubs.createdAt));
      res.json(clubs);
    } catch (error) {
      console.error("Error listing clubs:", error);
      res.status(500).json({ message: "Failed to list clubs" });
    }
  });

  app.get("/api/clubs/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const [club] = await db.select().from(readingClubs).where(eq(readingClubs.id, id));
      if (!club) return res.status(404).json({ message: "Club not found" });

      const members = await db.select({
        id: readingClubMembers.id,
        userId: readingClubMembers.userId,
        joinedAt: readingClubMembers.joinedAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        },
      })
        .from(readingClubMembers)
        .innerJoin(users, eq(users.id, readingClubMembers.userId))
        .where(eq(readingClubMembers.clubId, id));

      res.json({ ...club, members });
    } catch (error) {
      console.error("Error fetching club:", error);
      res.status(500).json({ message: "Failed to fetch club" });
    }
  });

  app.post("/api/clubs/:id/join", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const [club] = await db.select().from(readingClubs).where(eq(readingClubs.id, id));
      if (!club) return res.status(404).json({ message: "Club not found" });

      const existing = await db.select().from(readingClubMembers)
        .where(and(eq(readingClubMembers.clubId, id), eq(readingClubMembers.userId, userId)));
      if (existing.length > 0) return res.status(400).json({ message: "Already a member" });

      await db.insert(readingClubMembers).values({ clubId: id, userId });
      await db.update(readingClubs)
        .set({ memberCount: sql`${readingClubs.memberCount} + 1` })
        .where(eq(readingClubs.id, id));

      res.json({ message: "Joined club successfully" });
    } catch (error) {
      console.error("Error joining club:", error);
      res.status(500).json({ message: "Failed to join club" });
    }
  });

  app.delete("/api/clubs/:id/leave", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      await db.delete(readingClubMembers)
        .where(and(eq(readingClubMembers.clubId, id), eq(readingClubMembers.userId, userId)));
      await db.update(readingClubs)
        .set({ memberCount: sql`GREATEST(${readingClubs.memberCount} - 1, 0)` })
        .where(eq(readingClubs.id, id));

      res.json({ message: "Left club successfully" });
    } catch (error) {
      console.error("Error leaving club:", error);
      res.status(500).json({ message: "Failed to leave club" });
    }
  });

  app.put("/api/clubs/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { description, currentBookId, currentBookTitle } = req.body;

      const [club] = await db.select().from(readingClubs).where(eq(readingClubs.id, id));
      if (!club) return res.status(404).json({ message: "Club not found" });
      if (club.creatorId !== userId) return res.status(403).json({ message: "Only the creator can update this club" });

      const updateData: any = {};
      if (description !== undefined) updateData.description = description;
      if (currentBookId !== undefined) updateData.currentBookId = currentBookId;
      if (currentBookTitle !== undefined) updateData.currentBookTitle = currentBookTitle;

      const [updated] = await db.update(readingClubs)
        .set(updateData)
        .where(eq(readingClubs.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating club:", error);
      res.status(500).json({ message: "Failed to update club" });
    }
  });

  // ─── 6. Family Plan ───
  app.post("/api/family/create", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;

      const existing = await db.select().from(familyAccounts).where(eq(familyAccounts.ownerId, userId));
      if (existing.length > 0) return res.status(400).json({ message: "You already have a family account" });

      const [family] = await db.insert(familyAccounts).values({
        ownerId: userId,
      }).returning();

      await db.insert(familyMembers).values({
        familyId: family.id,
        userId,
        role: "owner",
      });

      res.json(family);
    } catch (error) {
      console.error("Error creating family account:", error);
      res.status(500).json({ message: "Failed to create family account" });
    }
  });

  app.get("/api/family", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;

      let [family] = await db.select().from(familyAccounts).where(eq(familyAccounts.ownerId, userId));

      if (!family) {
        const memberEntry = await db.select().from(familyMembers).where(eq(familyMembers.userId, userId));
        if (memberEntry.length > 0) {
          [family] = await db.select().from(familyAccounts).where(eq(familyAccounts.id, memberEntry[0].familyId));
        }
      }

      if (!family) return res.status(404).json({ message: "No family account found" });

      const members = await db.select({
        id: familyMembers.id,
        userId: familyMembers.userId,
        role: familyMembers.role,
        addedAt: familyMembers.addedAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          profileImageUrl: users.profileImageUrl,
        },
      })
        .from(familyMembers)
        .innerJoin(users, eq(users.id, familyMembers.userId))
        .where(eq(familyMembers.familyId, family.id));

      res.json({ ...family, members });
    } catch (error) {
      console.error("Error fetching family:", error);
      res.status(500).json({ message: "Failed to fetch family account" });
    }
  });

  app.post("/api/family/invite", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      const [family] = await db.select().from(familyAccounts).where(eq(familyAccounts.ownerId, userId));
      if (!family) return res.status(404).json({ message: "No family account found" });

      const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, family.id));
      if (members.length >= family.maxMembers) return res.status(400).json({ message: "Family plan is full" });

      const [invitee] = await db.select().from(users).where(eq(users.email, email));
      if (!invitee) return res.status(404).json({ message: "User with that email not found" });

      const alreadyMember = members.find(m => m.userId === invitee.id);
      if (alreadyMember) return res.status(400).json({ message: "User is already a member" });

      const [member] = await db.insert(familyMembers).values({
        familyId: family.id,
        userId: invitee.id,
        role: "member",
      }).returning();

      res.json(member);
    } catch (error) {
      console.error("Error inviting family member:", error);
      res.status(500).json({ message: "Failed to invite family member" });
    }
  });

  app.delete("/api/family/members/:memberId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { memberId } = req.params;

      const [family] = await db.select().from(familyAccounts).where(eq(familyAccounts.ownerId, userId));
      if (!family) return res.status(403).json({ message: "Only the owner can remove members" });

      await db.delete(familyMembers)
        .where(and(eq(familyMembers.id, memberId), eq(familyMembers.familyId, family.id)));

      res.json({ message: "Member removed" });
    } catch (error) {
      console.error("Error removing family member:", error);
      res.status(500).json({ message: "Failed to remove family member" });
    }
  });

  // ─── 7. Author Tipping ───
  app.post("/api/tips", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { toAuthorId, bookId, amountCents, message } = req.body;

      if (!toAuthorId || !amountCents) {
        return res.status(400).json({ message: "toAuthorId and amountCents are required" });
      }

      const [tip] = await db.insert(authorTips).values({
        fromUserId: userId,
        toAuthorId,
        bookId: bookId || null,
        amountCents,
        message: message || null,
      }).returning();

      res.json(tip);
    } catch (error) {
      console.error("Error recording tip:", error);
      res.status(500).json({ message: "Failed to record tip" });
    }
  });

  app.get("/api/tips/received", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const tips = await db.select().from(authorTips)
        .where(eq(authorTips.toAuthorId, userId))
        .orderBy(desc(authorTips.createdAt));
      res.json(tips);
    } catch (error) {
      console.error("Error fetching received tips:", error);
      res.status(500).json({ message: "Failed to fetch received tips" });
    }
  });

  app.get("/api/tips/sent", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const tips = await db.select().from(authorTips)
        .where(eq(authorTips.fromUserId, userId))
        .orderBy(desc(authorTips.createdAt));
      res.json(tips);
    } catch (error) {
      console.error("Error fetching sent tips:", error);
      res.status(500).json({ message: "Failed to fetch sent tips" });
    }
  });

  // ─── 8. Content Reporting & Moderation ───
  app.post("/api/reports", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { contentType, contentId, reason, details } = req.body;

      if (!contentType || !contentId || !reason) {
        return res.status(400).json({ message: "contentType, contentId, and reason are required" });
      }

      const [report] = await db.insert(contentReports).values({
        reporterId: userId,
        contentType,
        contentId,
        reason,
        details: details || null,
      }).returning();

      res.json(report);
    } catch (error) {
      console.error("Error submitting report:", error);
      res.status(500).json({ message: "Failed to submit report" });
    }
  });

  app.get("/api/admin/reports", requireAdmin, async (req: any, res: Response) => {
    try {
      const reports = await db.select().from(contentReports)
        .orderBy(desc(contentReports.createdAt));
      res.json(reports);
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  app.patch("/api/admin/reports/:id", requireAdmin, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { status } = req.body;

      if (!status) return res.status(400).json({ message: "status is required" });

      const [updated] = await db.update(contentReports)
        .set({
          status,
          reviewedBy: userId,
          reviewedAt: new Date(),
        })
        .where(eq(contentReports.id, id))
        .returning();

      if (!updated) return res.status(404).json({ message: "Report not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating report:", error);
      res.status(500).json({ message: "Failed to update report" });
    }
  });

  // ─── 10. Engagement Tracking & Churn ───
  app.post("/api/engagement/track", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;

      const [existing] = await db.select().from(engagementMetrics).where(eq(engagementMetrics.userId, userId));

      if (existing) {
        await db.update(engagementMetrics)
          .set({
            lastActiveAt: new Date(),
            totalSessionsLast30d: sql`${engagementMetrics.totalSessionsLast30d} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(engagementMetrics.userId, userId));
      } else {
        await db.insert(engagementMetrics).values({
          userId,
          lastActiveAt: new Date(),
          totalSessionsLast30d: 1,
        });
      }

      await updateChurnRisk(userId);

      res.json({ message: "Engagement tracked" });
    } catch (error) {
      console.error("Error tracking engagement:", error);
      res.status(500).json({ message: "Failed to track engagement" });
    }
  });

  app.get("/api/admin/churn-risk", requireAdmin, async (req: any, res: Response) => {
    try {
      const atRisk = await db.select({
        userId: engagementMetrics.userId,
        lastActiveAt: engagementMetrics.lastActiveAt,
        totalSessionsLast30d: engagementMetrics.totalSessionsLast30d,
        churnRisk: engagementMetrics.churnRisk,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
        .from(engagementMetrics)
        .innerJoin(users, eq(users.id, engagementMetrics.userId))
        .where(eq(engagementMetrics.churnRisk, "high"))
        .orderBy(desc(engagementMetrics.lastActiveAt));

      res.json(atRisk);
    } catch (error) {
      console.error("Error fetching churn risk:", error);
      res.status(500).json({ message: "Failed to fetch churn risk data" });
    }
  });

  // ─── 11. Admin Health Dashboard ───
  app.get("/api/admin/health", requireAdmin, async (req: any, res: Response) => {
    try {
      const [bookCount] = await db.select({ count: count() }).from(books);
      const [userCount] = await db.select({ count: count() }).from(users);

      let seederEntries: any[] = [];
      try {
        seederEntries = await db.select().from(seederProgress);
      } catch {}

      const mem = process.memoryUsage();

      res.json({
        totalBooks: bookCount?.count || 0,
        totalUsers: userCount?.count || 0,
        activeSessions: 0,
        seederStatus: seederEntries.length > 0 ? seederEntries : "no seeder entries",
        cacheStats: {
          rss: mem.rss,
          heapTotal: mem.heapTotal,
          heapUsed: mem.heapUsed,
          external: mem.external,
        },
      });
    } catch (error) {
      console.error("Error fetching health:", error);
      res.status(500).json({ message: "Failed to fetch system health" });
    }
  });
}
