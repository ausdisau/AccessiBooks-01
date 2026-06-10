import type { Express } from "express";
import { db } from "./db";
import { eq, desc, sql, and, count, sum } from "drizzle-orm";
import { userSubmissions, authorProfiles, contentAnalytics, users, books, authorEarnings } from "@shared/schema";
import { isAuthenticated } from "./multiAuth";
import {
  registerObjectStorageRoutes,
  ObjectStorageService,
} from "./integrations/object-storage";

const objectStorageService = new ObjectStorageService();

const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/mp3", "audio/wav"];
const ALLOWED_EBOOK_TYPES = ["application/pdf", "application/epub+zip"];
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_AUDIO_SIZE = 500 * 1024 * 1024;
const MAX_EBOOK_SIZE = 50 * 1024 * 1024;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export function registerSelfPublishingRoutes(app: Express) {
  registerObjectStorageRoutes(app);

  app.get("/api/author/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [profile] = await db.select().from(authorProfiles).where(eq(authorProfiles.userId, userId));
      if (!profile) {
        return res.json({ exists: false });
      }
      res.json({ exists: true, profile });
    } catch (error) {
      console.error("Error fetching author profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.post("/api/author/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { displayName, bio, website, socialLinks, profileImage } = req.body;
      if (!displayName || displayName.trim().length < 2) {
        return res.status(400).json({ message: "Display name must be at least 2 characters" });
      }

      const [existing] = await db.select().from(authorProfiles).where(eq(authorProfiles.userId, userId));
      if (existing) {
        const [updated] = await db.update(authorProfiles)
          .set({ displayName: displayName.trim(), bio, website, socialLinks, profileImage })
          .where(eq(authorProfiles.userId, userId))
          .returning();
        return res.json(updated);
      }

      const [profile] = await db.insert(authorProfiles).values({
        userId,
        displayName: displayName.trim(),
        bio,
        website,
        socialLinks,
        profileImage,
      }).returning();
      res.json(profile);
    } catch (error) {
      console.error("Error creating/updating author profile:", error);
      res.status(500).json({ message: "Failed to save profile" });
    }
  });

  app.get("/api/author/profile/:userId", async (req: any, res) => {
    try {
      const { userId } = req.params;
      const [profile] = await db.select().from(authorProfiles).where(eq(authorProfiles.userId, userId));
      if (!profile) {
        return res.status(404).json({ message: "Author not found" });
      }

      const submissions = await db.select().from(userSubmissions)
        .where(and(eq(userSubmissions.userId, userId), eq(userSubmissions.status, "approved")))
        .orderBy(desc(userSubmissions.createdAt));

      res.json({ profile, books: submissions });
    } catch (error) {
      console.error("Error fetching author profile:", error);
      res.status(500).json({ message: "Failed to fetch author" });
    }
  });

  app.post("/api/author/upload-url", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [profile] = await db.select().from(authorProfiles).where(eq(authorProfiles.userId, userId));
      if (!profile) {
        return res.status(403).json({ message: "Create an author profile first" });
      }

      const { name, size, contentType, uploadType } = req.body;
      if (!name || !contentType) {
        return res.status(400).json({ message: "Missing file name or content type" });
      }

      if (uploadType === "audio") {
        if (!ALLOWED_AUDIO_TYPES.includes(contentType)) {
          return res.status(400).json({ message: "Only MP3, M4A, and WAV audio files are accepted" });
        }
        if (size && size > MAX_AUDIO_SIZE) {
          return res.status(400).json({ message: "Audio files must be under 500MB" });
        }
      } else if (uploadType === "ebook") {
        if (!ALLOWED_EBOOK_TYPES.includes(contentType)) {
          return res.status(400).json({ message: "Only PDF and EPUB files are accepted" });
        }
        if (size && size > MAX_EBOOK_SIZE) {
          return res.status(400).json({ message: "Ebook files must be under 50MB" });
        }
      } else if (uploadType === "cover") {
        if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
          return res.status(400).json({ message: "Only JPEG, PNG, and WebP images are accepted" });
        }
        if (size && size > MAX_IMAGE_SIZE) {
          return res.status(400).json({ message: "Cover images must be under 5MB" });
        }
      } else {
        return res.status(400).json({ message: "Invalid upload type. Use: audio, ebook, or cover" });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  app.post("/api/author/books", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [profile] = await db.select().from(authorProfiles).where(eq(authorProfiles.userId, userId));
      if (!profile) {
        return res.status(403).json({ message: "Create an author profile first" });
      }

      const { title, description, contentType, genre, language, audioUrl, contentUrl, coverImage, narrator, tags, duration, pageCount } = req.body;
      if (!title || title.trim().length < 1) {
        return res.status(400).json({ message: "Title is required" });
      }
      if (!contentType || !["audiobook", "ebook"].includes(contentType)) {
        return res.status(400).json({ message: "Content type must be audiobook or ebook" });
      }
      if (contentType === "audiobook" && !audioUrl) {
        return res.status(400).json({ message: "Audio file is required for audiobooks" });
      }
      if (contentType === "ebook" && !contentUrl) {
        return res.status(400).json({ message: "Content file is required for ebooks" });
      }

      const [submission] = await db.insert(userSubmissions).values({
        userId,
        title: title.trim(),
        author: profile.displayName,
        description,
        contentType,
        audioUrl,
        contentUrl,
        coverImage,
        genre,
        language: language || "English",
        narrator,
        tags: tags || [],
        duration,
        pageCount,
        status: "pending",
      }).returning();

      res.json(submission);
    } catch (error) {
      console.error("Error creating book submission:", error);
      res.status(500).json({ message: "Failed to submit book" });
    }
  });

  app.get("/api/author/books", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const submissions = await db.select().from(userSubmissions)
        .where(eq(userSubmissions.userId, userId))
        .orderBy(desc(userSubmissions.createdAt));

      res.json(submissions);
    } catch (error) {
      console.error("Error fetching author books:", error);
      res.status(500).json({ message: "Failed to fetch books" });
    }
  });

  app.put("/api/author/books/:bookId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { bookId } = req.params;
      const [existing] = await db.select().from(userSubmissions)
        .where(and(eq(userSubmissions.id, bookId), eq(userSubmissions.userId, userId)));

      if (!existing) {
        return res.status(404).json({ message: "Book not found" });
      }

      const { title, description, genre, language, coverImage, narrator, tags, duration, pageCount } = req.body;

      const [updated] = await db.update(userSubmissions)
        .set({
          ...(title && { title: title.trim() }),
          ...(description !== undefined && { description }),
          ...(genre !== undefined && { genre }),
          ...(language && { language }),
          ...(coverImage !== undefined && { coverImage }),
          ...(narrator !== undefined && { narrator }),
          ...(tags && { tags }),
          ...(duration !== undefined && { duration }),
          ...(pageCount !== undefined && { pageCount }),
        })
        .where(and(eq(userSubmissions.id, bookId), eq(userSubmissions.userId, userId)))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating book:", error);
      res.status(500).json({ message: "Failed to update book" });
    }
  });

  app.delete("/api/author/books/:bookId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { bookId } = req.params;
      const [existing] = await db.select().from(userSubmissions)
        .where(and(eq(userSubmissions.id, bookId), eq(userSubmissions.userId, userId)));

      if (!existing) {
        return res.status(404).json({ message: "Book not found" });
      }

      await db.delete(userSubmissions)
        .where(and(eq(userSubmissions.id, bookId), eq(userSubmissions.userId, userId)));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting book:", error);
      res.status(500).json({ message: "Failed to delete book" });
    }
  });

  app.post("/api/analytics/event", async (req: any, res) => {
    try {
      const { bookId, eventType, duration } = req.body;
      if (!bookId || !eventType) {
        return res.status(400).json({ message: "bookId and eventType required" });
      }

      const listenerId = req.user?.id || null;

      const [submission] = await db.select().from(userSubmissions).where(eq(userSubmissions.id, bookId));
      if (!submission) {
        return res.json({ tracked: false });
      }

      await db.insert(contentAnalytics).values({
        bookId,
        authorUserId: submission.userId,
        eventType,
        listenerId,
        duration: duration || null,
      });

      if (eventType === "play") {
        await db.update(userSubmissions)
          .set({ totalPlays: sql`COALESCE(${userSubmissions.totalPlays}, 0) + 1` })
          .where(eq(userSubmissions.id, bookId));

        await db.update(authorProfiles)
          .set({ totalPlays: sql`COALESCE(${authorProfiles.totalPlays}, 0) + 1` })
          .where(eq(authorProfiles.userId, submission.userId));
      } else if (eventType === "read") {
        await db.update(userSubmissions)
          .set({ totalReads: sql`COALESCE(${userSubmissions.totalReads}, 0) + 1` })
          .where(eq(userSubmissions.id, bookId));
      }

      res.json({ tracked: true });
    } catch (error) {
      console.error("Error tracking analytics:", error);
      res.status(500).json({ message: "Failed to track event" });
    }
  });

  app.get("/api/author/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const submissions = await db.select().from(userSubmissions)
        .where(eq(userSubmissions.userId, userId));

      if (submissions.length === 0) {
        return res.json({
          totalPlays: 0,
          totalReads: 0,
          totalCompletions: 0,
          uniqueListeners: 0,
          books: [],
          recentEvents: [],
          playsByDay: [],
        });
      }

      const bookIds = submissions.map(s => s.id);

      const totalPlays = submissions.reduce((sum, s) => sum + (s.totalPlays || 0), 0);
      const totalReads = submissions.reduce((sum, s) => sum + (s.totalReads || 0), 0);

      const completions = await db.select({ count: count() })
        .from(contentAnalytics)
        .where(and(
          eq(contentAnalytics.authorUserId, userId),
          eq(contentAnalytics.eventType, "complete")
        ));

      const uniqueListenersResult = await db.select({
        count: sql<number>`COUNT(DISTINCT ${contentAnalytics.listenerId})`
      })
        .from(contentAnalytics)
        .where(eq(contentAnalytics.authorUserId, userId));

      const recentEvents = await db.select().from(contentAnalytics)
        .where(eq(contentAnalytics.authorUserId, userId))
        .orderBy(desc(contentAnalytics.createdAt))
        .limit(50);

      const playsByDay = await db.select({
        date: sql<string>`DATE(${contentAnalytics.createdAt})`,
        plays: sql<number>`COUNT(*) FILTER (WHERE ${contentAnalytics.eventType} = 'play')`,
        reads: sql<number>`COUNT(*) FILTER (WHERE ${contentAnalytics.eventType} = 'read')`,
      })
        .from(contentAnalytics)
        .where(eq(contentAnalytics.authorUserId, userId))
        .groupBy(sql`DATE(${contentAnalytics.createdAt})`)
        .orderBy(sql`DATE(${contentAnalytics.createdAt})`)
        .limit(30);

      const bookAnalytics = submissions.map(s => ({
        id: s.id,
        title: s.title,
        contentType: s.contentType,
        status: s.status,
        totalPlays: s.totalPlays || 0,
        totalReads: s.totalReads || 0,
        coverImage: s.coverImage,
        createdAt: s.createdAt,
      }));

      res.json({
        totalPlays,
        totalReads,
        totalCompletions: completions[0]?.count || 0,
        uniqueListeners: uniqueListenersResult[0]?.count || 0,
        books: bookAnalytics,
        recentEvents,
        playsByDay,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/author/analytics/:bookId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { bookId } = req.params;

      const [submission] = await db.select().from(userSubmissions)
        .where(and(eq(userSubmissions.id, bookId), eq(userSubmissions.userId, userId)));

      if (!submission) {
        return res.status(404).json({ message: "Book not found" });
      }

      const events = await db.select().from(contentAnalytics)
        .where(eq(contentAnalytics.bookId, bookId))
        .orderBy(desc(contentAnalytics.createdAt))
        .limit(100);

      const uniqueListeners = await db.select({
        count: sql<number>`COUNT(DISTINCT ${contentAnalytics.listenerId})`
      })
        .from(contentAnalytics)
        .where(eq(contentAnalytics.bookId, bookId));

      const completionRate = await db.select({
        total: count(),
        completed: sql<number>`COUNT(*) FILTER (WHERE ${contentAnalytics.eventType} = 'complete')`,
      })
        .from(contentAnalytics)
        .where(eq(contentAnalytics.bookId, bookId));

      const playsByDay = await db.select({
        date: sql<string>`DATE(${contentAnalytics.createdAt})`,
        count: count(),
      })
        .from(contentAnalytics)
        .where(and(
          eq(contentAnalytics.bookId, bookId),
          eq(contentAnalytics.eventType, "play")
        ))
        .groupBy(sql`DATE(${contentAnalytics.createdAt})`)
        .orderBy(sql`DATE(${contentAnalytics.createdAt})`)
        .limit(30);

      res.json({
        book: submission,
        totalPlays: submission.totalPlays || 0,
        totalReads: submission.totalReads || 0,
        uniqueListeners: uniqueListeners[0]?.count || 0,
        completionRate: completionRate[0]?.total
          ? ((completionRate[0]?.completed || 0) / completionRate[0].total * 100).toFixed(1)
          : "0",
        recentEvents: events,
        playsByDay,
      });
    } catch (error) {
      console.error("Error fetching book analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/browse/author-content", async (_req: any, res) => {
    try {
      const approvedBooks = await db.select().from(userSubmissions)
        .where(eq(userSubmissions.status, "approved"))
        .orderBy(desc(userSubmissions.createdAt))
        .limit(50);

      res.json(approvedBooks);
    } catch (error) {
      console.error("Error fetching author content:", error);
      res.status(500).json({ message: "Failed to fetch content" });
    }
  });

  app.get("/api/author/earnings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [profile] = await db.select().from(authorProfiles).where(eq(authorProfiles.userId, userId));
      if (!profile) return res.status(404).json({ message: "Author profile not found" });

      const totalResult = await db.select({
        totalGross: sum(authorEarnings.grossCents),
        totalCommission: sum(authorEarnings.commissionCents),
      }).from(authorEarnings).where(eq(authorEarnings.userId, userId));

      const pendingResult = await db.select({
        pendingAmount: sum(authorEarnings.commissionCents),
      }).from(authorEarnings).where(and(
        eq(authorEarnings.userId, userId),
        eq(authorEarnings.status, "pending"),
      ));

      const paidResult = await db.select({
        paidAmount: sum(authorEarnings.commissionCents),
      }).from(authorEarnings).where(and(
        eq(authorEarnings.userId, userId),
        eq(authorEarnings.status, "paid"),
      ));

      res.json({
        totalGrossCents: parseInt(totalResult[0]?.totalGross || "0"),
        totalCommissionCents: parseInt(totalResult[0]?.totalCommission || "0"),
        pendingCents: parseInt(pendingResult[0]?.pendingAmount || "0"),
        paidCents: parseInt(paidResult[0]?.paidAmount || "0"),
      });
    } catch (error) {
      console.error("Error fetching author earnings:", error);
      res.status(500).json({ message: "Failed to fetch earnings" });
    }
  });

  app.get("/api/author/earnings/history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const earnings = await db.select().from(authorEarnings)
        .where(eq(authorEarnings.userId, userId))
        .orderBy(desc(authorEarnings.createdAt))
        .limit(limit)
        .offset(offset);

      const [countResult] = await db.select({ total: count() })
        .from(authorEarnings)
        .where(eq(authorEarnings.userId, userId));

      res.json({ earnings, total: countResult?.total || 0 });
    } catch (error) {
      console.error("Error fetching earnings history:", error);
      res.status(500).json({ message: "Failed to fetch earnings history" });
    }
  });

  app.post("/api/author/earnings/request-payout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const updated = await db.update(authorEarnings)
        .set({ status: "payout_requested" })
        .where(and(
          eq(authorEarnings.userId, userId),
          eq(authorEarnings.status, "pending"),
        ));

      res.json({ message: "Payout requested for all pending earnings" });
    } catch (error) {
      console.error("Error requesting payout:", error);
      res.status(500).json({ message: "Failed to request payout" });
    }
  });

  app.post("/api/author/promote", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { bookId } = req.body;
      if (!bookId) return res.status(400).json({ message: "bookId required" });

      const [submission] = await db.select().from(userSubmissions)
        .where(and(
          eq(userSubmissions.id, bookId),
          eq(userSubmissions.authorUserId, userId),
        ));

      if (!submission) return res.status(404).json({ message: "Book not found or not yours" });

      await db.update(userSubmissions)
        .set({ isPromoted: true })
        .where(eq(userSubmissions.id, bookId));

      res.json({ message: "Content promoted successfully" });
    } catch (error) {
      console.error("Error promoting content:", error);
      res.status(500).json({ message: "Failed to promote content" });
    }
  });
}

export async function recordAuthorEarning(userId: string, bookId: string, grossCents: number, earningType: string = "sale") {
  const platformFeePct = 30;
  const platformCut = Math.round(grossCents * platformFeePct / 100);
  const authorCut = grossCents - platformCut;

  await db.insert(authorEarnings).values({
    userId,
    bookId,
    earningType,
    grossCents,
    commissionCents: authorCut,
    platformFeePct,
    status: "pending",
  });

  return { authorCut, platformCut };
}
