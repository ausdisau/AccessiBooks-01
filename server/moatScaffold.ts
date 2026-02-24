import type { Express } from "express";
import { db } from "./db";
import {
  accessibilityReviews, accessibilityMetadata,
  institutionalAccounts, institutionalMembers,
  moatMetricsSnapshots, accessibilityPreferences, bookTranscripts,
  users,
} from "@shared/schema";
import { eq, and, count, avg, sql, desc } from "drizzle-orm";
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

  app.post("/api/books/:id/a11y-reviews", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { rating, screenReaderScore, navigationScore, contrastScore, comments } = req.body;

      const [review] = await db.insert(accessibilityReviews).values({
        userId,
        bookId: req.params.id,
        rating,
        screenReaderScore,
        navigationScore,
        contrastScore,
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
        ));

      const [averages] = await db.select({
        rating: avg(accessibilityReviews.rating),
        screenReaderScore: avg(accessibilityReviews.screenReaderScore),
        navigationScore: avg(accessibilityReviews.navigationScore),
        contrastScore: avg(accessibilityReviews.contrastScore),
      }).from(accessibilityReviews)
        .where(and(
          eq(accessibilityReviews.bookId, bookId),
          eq(accessibilityReviews.status, "approved")
        ));

      res.json({
        reviews,
        averages: {
          rating: Number(averages?.rating) || 0,
          screenReaderScore: Number(averages?.screenReaderScore) || 0,
          navigationScore: Number(averages?.navigationScore) || 0,
          contrastScore: Number(averages?.contrastScore) || 0,
        },
        total: reviews.length,
      });
    } catch (error) {
      console.error("[Moat] Failed to fetch accessibility reviews:", error);
      res.status(500).json({ message: "Failed to fetch accessibility reviews" });
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
