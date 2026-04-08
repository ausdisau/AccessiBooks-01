import type { Express } from "express";
import { db } from "./db";
import {
  accessibilityReviews, accessibilityMetadata,
  institutionalAccounts, institutionalMembers,
  moatMetricsSnapshots, accessibilityPreferences, bookTranscripts,
  users, books, DISABILITY_TYPES,
} from "@shared/schema";
import { eq, and, count, avg, sql, desc, inArray } from "drizzle-orm";
import { isAuthenticated } from "./multiAuth";
import { z } from "zod";

export function registerMoatScaffoldRoutes(app: Express) {

  app.get("/api/books/:id/accessibility", async (req: any, res) => {
    try {
      res.json({
        bookId: req.params.id,
        hasTranscript: false,
        hasDyslexiaFont: true,
        hasLargeText: true,
        readingLevel: "intermediate",
        contentWarnings: [],
        accessibilityScore: 72,
      });
    } catch (error) {
      console.error("[Moat] Failed to fetch accessibility metadata:", error);
      res.status(500).json({ message: "Failed to fetch accessibility metadata" });
    }
  });

  app.post("/api/books/:id/accessibility", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      res.json({ message: "Accessibility metadata updated" });
    } catch (error) {
      console.error("[Moat] Failed to update accessibility metadata:", error);
      res.status(500).json({ message: "Failed to update accessibility metadata" });
    }
  });

  const reviewBodySchema = z.object({
    disabilityType: z.enum(DISABILITY_TYPES).default("other"),
    rating: z.number().int().min(1).max(5),
    screenReaderScore: z.number().int().min(1).max(5).optional().nullable(),
    navigationScore: z.number().int().min(1).max(5).optional().nullable(),
    contrastScore: z.number().int().min(1).max(5).optional().nullable(),
    audioQualityScore: z.number().int().min(1).max(5).optional().nullable(),
    comments: z.string().max(2000).optional().nullable(),
  });

  app.post("/api/books/:id/a11y-reviews", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const parsed = reviewBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid review data", errors: parsed.error.flatten() });

      const { disabilityType, rating, screenReaderScore, navigationScore, contrastScore, audioQualityScore, comments } = parsed.data;

      const [review] = await db.insert(accessibilityReviews).values({
        userId,
        bookId: req.params.id,
        disabilityType,
        rating,
        screenReaderScore,
        navigationScore,
        contrastScore,
        audioQualityScore,
        comments,
        status: "pending",
      }).returning();

      res.json(review);
    } catch (error) {
      console.error("[Moat] Failed to create accessibility review:", error);
      res.status(500).json({ message: "Failed to create accessibility review" });
    }
  });

  app.get("/api/books/:id/a11y-reviews", async (req: any, res) => {
    try {
      const bookId = req.params.id;

      const reviews = await db.select().from(accessibilityReviews)
        .where(and(
          eq(accessibilityReviews.bookId, bookId),
          eq(accessibilityReviews.status, "approved")
        ))
        .orderBy(desc(accessibilityReviews.createdAt));

      const byDisabilityType: Record<string, {
        count: number;
        avgRating: number;
        avgScreenReader: number;
        avgNavigation: number;
        avgContrast: number;
        avgAudioQuality: number;
        certified: boolean;
      }> = {};

      for (const dtype of DISABILITY_TYPES) {
        const group = reviews.filter(r => r.disabilityType === dtype);
        if (group.length === 0) continue;
        const avg = (arr: (number | null)[]) => {
          const valid = arr.filter((v): v is number => v !== null);
          return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
        };
        const avgRating = avg(group.map(r => r.rating));
        byDisabilityType[dtype] = {
          count: group.length,
          avgRating: Math.round(avgRating * 10) / 10,
          avgScreenReader: Math.round(avg(group.map(r => r.screenReaderScore)) * 10) / 10,
          avgNavigation: Math.round(avg(group.map(r => r.navigationScore)) * 10) / 10,
          avgContrast: Math.round(avg(group.map(r => r.contrastScore)) * 10) / 10,
          avgAudioQuality: Math.round(avg(group.map(r => r.audioQualityScore)) * 10) / 10,
          certified: group.length >= 5 && avgRating >= 4.0,
        };
      }

      const allRatings = reviews.map(r => r.rating);
      const overallAvg = allRatings.length > 0 ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0;

      res.json({
        reviews,
        byDisabilityType,
        averages: {
          rating: Math.round(overallAvg * 10) / 10,
          total: reviews.length,
        },
      });
    } catch (error) {
      console.error("[Moat] Failed to fetch accessibility reviews:", error);
      res.status(500).json({ message: "Failed to fetch accessibility reviews" });
    }
  });

  const CERTIFIED_MIN_RATING = 4.0;
  const CERTIFIED_MIN_COUNT = 5;

  function isValidDisabilityType(value: string | undefined): value is typeof DISABILITY_TYPES[number] {
    return typeof value === "string" && (DISABILITY_TYPES as readonly string[]).includes(value);
  }

  app.get("/api/accessible-picks", async (req: any, res) => {
    try {
      const rawDisabilityType = req.query.disabilityType as string | undefined;
      const sortBy = (req.query.sortBy as string) || "rating";
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));

      const validDisabilityType = isValidDisabilityType(rawDisabilityType) ? rawDisabilityType : null;

      const reviewRows = await db
        .select({
          bookId: accessibilityReviews.bookId,
          disabilityType: accessibilityReviews.disabilityType,
          rating: accessibilityReviews.rating,
        })
        .from(accessibilityReviews)
        .where(and(
          eq(accessibilityReviews.status, "approved"),
          ...(validDisabilityType ? [eq(accessibilityReviews.disabilityType, validDisabilityType)] : []),
        ));

      const bookStats: Record<string, {
        bookId: string;
        count: number;
        totalRating: number;
        certifiedTypes: string[];
        disabilityGroups: Record<string, { count: number; total: number }>;
      }> = {};

      for (const row of reviewRows) {
        if (!bookStats[row.bookId]) {
          bookStats[row.bookId] = { bookId: row.bookId, count: 0, totalRating: 0, certifiedTypes: [], disabilityGroups: {} };
        }
        const s = bookStats[row.bookId];
        s.count++;
        s.totalRating += row.rating;
        if (!s.disabilityGroups[row.disabilityType]) s.disabilityGroups[row.disabilityType] = { count: 0, total: 0 };
        s.disabilityGroups[row.disabilityType].count++;
        s.disabilityGroups[row.disabilityType].total += row.rating;
      }

      for (const stat of Object.values(bookStats)) {
        for (const [dtype, group] of Object.entries(stat.disabilityGroups)) {
          const groupAvg = group.total / group.count;
          if (group.count >= CERTIFIED_MIN_COUNT && groupAvg >= CERTIFIED_MIN_RATING) {
            stat.certifiedTypes.push(dtype);
          }
        }
      }

      const avgRating = (s: typeof bookStats[string]) => s.totalRating / s.count;
      const statsList = Object.values(bookStats)
        .filter(s => s.count > 0)
        .sort((a, b) => {
          if (sortBy === "count") return b.count - a.count;
          return avgRating(b) - avgRating(a);
        });

      const pagedStats = statsList.slice((page - 1) * limit, page * limit);
      const bookIds = pagedStats.map(s => s.bookId);

      if (bookIds.length === 0) {
        return res.json({ books: [], total: statsList.length, page, certifiedBookIds: [] });
      }

      const bookRows = await db.select().from(books).where(inArray(books.id, bookIds));

      const certifiedBookIds = statsList.filter(s => s.certifiedTypes.length > 0).map(s => s.bookId);

      const enriched = bookIds.map(id => {
        const book = bookRows.find(b => b.id === id);
        const stat = bookStats[id];
        return book ? {
          ...book,
          accessibilityScore: stat ? Math.round(avgRating(stat) * 10) / 10 : 0,
          accessibilityReviewCount: stat?.count ?? 0,
          certifiedTypes: stat?.certifiedTypes ?? [],
          isCertified: (stat?.certifiedTypes.length ?? 0) > 0,
        } : null;
      }).filter(Boolean);

      res.json({ books: enriched, total: statsList.length, page, certifiedBookIds });
    } catch (error) {
      console.error("[Moat] Failed to fetch accessible picks:", error);
      res.status(500).json({ message: "Failed to fetch accessible picks" });
    }
  });

  app.patch("/api/a11y-reviews/:id/moderate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { status } = req.body;

      await db.update(accessibilityReviews)
        .set({ status })
        .where(eq(accessibilityReviews.id, req.params.id));

      res.json({ message: "Review moderated" });
    } catch (error) {
      console.error("[Moat] Failed to moderate review:", error);
      res.status(500).json({ message: "Failed to moderate review" });
    }
  });

  app.post("/api/institutional/create", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { orgName, contactEmail, orgType, maxSeats } = req.body;
      if (!orgName || !contactEmail) return res.status(400).json({ message: "orgName and contactEmail required" });

      const [account] = await db.insert(institutionalAccounts).values({
        orgName,
        contactEmail,
        orgType: orgType || "school",
        maxSeats: maxSeats || 50,
        currentSeats: 1,
      }).returning();

      await db.insert(institutionalMembers).values({
        institutionalId: account.id,
        userId,
        role: "admin",
      });

      res.json(account);
    } catch (error) {
      console.error("[Moat] Failed to create institutional account:", error);
      res.status(500).json({ message: "Failed to create institutional account" });
    }
  });

  app.post("/api/institutional/invite", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "email required" });

      res.json({ message: "Invitation sent", email });
    } catch (error) {
      console.error("[Moat] Failed to send invitation:", error);
      res.status(500).json({ message: "Failed to send invitation" });
    }
  });

  app.get("/api/institutional/members", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [membership] = await db.select().from(institutionalMembers)
        .where(eq(institutionalMembers.userId, userId));
      if (!membership) return res.status(404).json({ message: "Not part of an institution" });

      const members = await db.select({
        id: institutionalMembers.id,
        userId: institutionalMembers.userId,
        role: institutionalMembers.role,
        addedAt: institutionalMembers.addedAt,
        email: users.email,
        name: users.name,
      }).from(institutionalMembers)
        .innerJoin(users, eq(institutionalMembers.userId, users.id))
        .where(eq(institutionalMembers.institutionalId, membership.institutionalId));

      res.json(members);
    } catch (error) {
      console.error("[Moat] Failed to fetch institutional members:", error);
      res.status(500).json({ message: "Failed to fetch institutional members" });
    }
  });

  app.delete("/api/institutional/members/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      res.json({ message: "Member removed" });
    } catch (error) {
      console.error("[Moat] Failed to remove member:", error);
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  app.get("/api/institutional/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      res.json({
        listeningHours: 1247,
        activeUsers: 34,
        popularBooks: ["Pride and Prejudice", "Moby Dick", "The Great Gatsby"],
        completionRate: 67,
      });
    } catch (error) {
      console.error("[Moat] Failed to fetch institutional analytics:", error);
      res.status(500).json({ message: "Failed to fetch institutional analytics" });
    }
  });

  app.get("/api/recommendations", async (_req: any, res) => {
    try {
      res.json([
        { bookId: "rec-1", title: "Recommended for You", reason: "Based on your listening history", score: 0.95 },
        { bookId: "rec-2", title: "Popular in Your Genre", reason: "Trending in Fiction", score: 0.88 },
        { bookId: "rec-3", title: "Accessibility Pick", reason: "High accessibility score", score: 0.82 },
      ]);
    } catch (error) {
      console.error("[Moat] Failed to fetch recommendations:", error);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  app.post("/api/recommendations/feedback", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      res.json({ message: "Feedback recorded" });
    } catch (error) {
      console.error("[Moat] Failed to record feedback:", error);
      res.status(500).json({ message: "Failed to record feedback" });
    }
  });

  app.get("/api/admin/moat-metrics", async (_req: any, res) => {
    try {
      res.json({
        totalA11yReviews: 156,
        avgA11yScore: 74,
        transcriptCoverage: 12,
        prefsSyncedUsers: 89,
        institutionalOrgs: 3,
        recommendationClicks: 1247,
        trendsWeekly: { reviews: 23, newTranscripts: 5, newPrefsUsers: 12 },
      });
    } catch (error) {
      console.error("[Moat] Failed to fetch moat metrics:", error);
      res.status(500).json({ message: "Failed to fetch moat metrics" });
    }
  });

  app.post("/api/admin/moat-metrics/snapshot", async (_req: any, res) => {
    try {
      const [reviewCount] = await db.select({ value: count() }).from(accessibilityReviews);
      const [avgScore] = await db.select({ value: avg(accessibilityReviews.rating) }).from(accessibilityReviews);
      const [transcriptCount] = await db.select({ value: count() }).from(bookTranscripts);
      const [prefsCount] = await db.select({ value: count() }).from(accessibilityPreferences);
      const [orgCount] = await db.select({ value: count() }).from(institutionalAccounts);

      const [snapshot] = await db.insert(moatMetricsSnapshots).values({
        date: new Date(),
        totalA11yReviews: reviewCount?.value || 0,
        avgA11yScore: Math.round(Number(avgScore?.value) || 0),
        transcriptCoverage: transcriptCount?.value || 0,
        prefsSyncedUsers: prefsCount?.value || 0,
        institutionalOrgs: orgCount?.value || 0,
        recommendationClicks: 0,
      }).returning();

      res.json(snapshot);
    } catch (error) {
      console.error("[Moat] Failed to create metrics snapshot:", error);
      res.status(500).json({ message: "Failed to create metrics snapshot" });
    }
  });
}
