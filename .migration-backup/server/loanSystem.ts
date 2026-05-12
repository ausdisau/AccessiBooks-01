import type { Express } from "express";
import crypto from "crypto";
import { db } from "./db";
import { eq, and, desc, sql, lt, count, asc, ne } from "drizzle-orm";
import { isAuthenticated } from "./multiAuth";
import { bookLoans, loanWaitlist, users, books, userXp } from "@shared/schema";

const LOAN_LIMITS = {
  free: { maxLoans: 1, expiryDays: 7, maxDownloads: 2 },
  plus: { maxLoans: 3, expiryDays: 14, maxDownloads: 5 },
  premium: { maxLoans: 5, expiryDays: 21, maxDownloads: 10 },
} as const;

const MAX_CONCURRENT_LOANS_PER_BOOK = 5;

export function registerLoanRoutes(app: Express) {

  app.post("/api/loans/borrow", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { bookId } = req.body;
      if (!bookId) return res.status(400).json({ message: "bookId is required" });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "User not found" });

      const tier = (user.subscriptionTier || "free") as keyof typeof LOAN_LIMITS;
      const limits = LOAN_LIMITS[tier] || LOAN_LIMITS.free;

      const [{ value: activeCount }] = await db
        .select({ value: count() })
        .from(bookLoans)
        .where(and(eq(bookLoans.userId, userId), eq(bookLoans.status, "active")));

      if (activeCount >= limits.maxLoans) {
        return res.status(400).json({
          message: `You have reached your loan limit of ${limits.maxLoans} for the ${tier} tier. Return a book or upgrade your plan.`,
        });
      }

      const [{ value: bookLoanCount }] = await db
        .select({ value: count() })
        .from(bookLoans)
        .where(and(eq(bookLoans.bookId, bookId), eq(bookLoans.status, "active")));

      if (bookLoanCount >= MAX_CONCURRENT_LOANS_PER_BOOK) {
        return res.status(400).json({
          message: "All copies of this book are currently loaned out. Join the waitlist to be notified when a copy becomes available.",
          suggestWaitlist: true,
        });
      }

      const existingLoan = await db
        .select()
        .from(bookLoans)
        .where(and(eq(bookLoans.userId, userId), eq(bookLoans.bookId, bookId), eq(bookLoans.status, "active")));

      if (existingLoan.length > 0) {
        return res.status(400).json({ message: "You already have an active loan for this book" });
      }

      const [book] = await db.select().from(books).where(eq(books.id, bookId));
      if (!book) return res.status(404).json({ message: "Book not found" });

      const downloadToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + limits.expiryDays);

      const [loan] = await db.insert(bookLoans).values({
        userId,
        bookId,
        expiresAt,
        downloadToken,
        maxDownloads: limits.maxDownloads,
        status: "active",
      }).returning();

      res.json({
        ...loan,
        book: {
          title: book.title,
          author: book.author,
          coverImage: book.coverImage,
        },
      });
    } catch (error) {
      console.error("[Loans] Borrow error:", error);
      res.status(500).json({ message: "Failed to borrow book" });
    }
  });

  app.post("/api/loans/return/:loanId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { loanId } = req.params;
      const [loan] = await db.select().from(bookLoans)
        .where(and(eq(bookLoans.id, loanId), eq(bookLoans.userId, userId), eq(bookLoans.status, "active")));

      if (!loan) return res.status(404).json({ message: "Active loan not found" });

      await db.update(bookLoans).set({
        status: "returned",
        returnedAt: new Date(),
      }).where(eq(bookLoans.id, loanId));

      const [xpRecord] = await db.select().from(userXp).where(eq(userXp.userId, userId));
      if (xpRecord) {
        await db.update(userXp).set({
          totalXp: xpRecord.totalXp + 25,
        }).where(eq(userXp.userId, userId));
      }

      const [nextInLine] = await db.select().from(loanWaitlist)
        .where(and(eq(loanWaitlist.bookId, loan.bookId), eq(loanWaitlist.status, "waiting")))
        .orderBy(asc(loanWaitlist.position))
        .limit(1);

      if (nextInLine) {
        await db.update(loanWaitlist).set({
          status: "notified",
          notifiedAt: new Date(),
        }).where(eq(loanWaitlist.id, nextInLine.id));
      }

      res.json({ message: "Book returned successfully. +25 XP earned!", xpAwarded: 25 });
    } catch (error) {
      console.error("[Loans] Return error:", error);
      res.status(500).json({ message: "Failed to return book" });
    }
  });

  app.get("/api/loans/active", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const tier = (user?.subscriptionTier || "free") as keyof typeof LOAN_LIMITS;
      const limits = LOAN_LIMITS[tier] || LOAN_LIMITS.free;

      const activeLoans = await db
        .select({
          id: bookLoans.id,
          bookId: bookLoans.bookId,
          loanedAt: bookLoans.loanedAt,
          expiresAt: bookLoans.expiresAt,
          status: bookLoans.status,
          downloadCount: bookLoans.downloadCount,
          maxDownloads: bookLoans.maxDownloads,
          downloadToken: bookLoans.downloadToken,
          bookTitle: books.title,
          bookAuthor: books.author,
          bookCover: books.coverImage,
        })
        .from(bookLoans)
        .innerJoin(books, eq(bookLoans.bookId, books.id))
        .where(and(eq(bookLoans.userId, userId), eq(bookLoans.status, "active")))
        .orderBy(desc(bookLoans.loanedAt));

      res.json({
        loans: activeLoans,
        limits: {
          tier,
          maxLoans: limits.maxLoans,
          expiryDays: limits.expiryDays,
          maxDownloads: limits.maxDownloads,
          currentCount: activeLoans.length,
        },
      });
    } catch (error) {
      console.error("[Loans] Active loans error:", error);
      res.status(500).json({ message: "Failed to fetch active loans" });
    }
  });

  app.get("/api/loans/history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const history = await db
        .select({
          id: bookLoans.id,
          bookId: bookLoans.bookId,
          loanedAt: bookLoans.loanedAt,
          expiresAt: bookLoans.expiresAt,
          returnedAt: bookLoans.returnedAt,
          status: bookLoans.status,
          downloadCount: bookLoans.downloadCount,
          maxDownloads: bookLoans.maxDownloads,
          bookTitle: books.title,
          bookAuthor: books.author,
          bookCover: books.coverImage,
        })
        .from(bookLoans)
        .innerJoin(books, eq(bookLoans.bookId, books.id))
        .where(eq(bookLoans.userId, userId))
        .orderBy(desc(bookLoans.loanedAt))
        .limit(50);

      res.json(history);
    } catch (error) {
      console.error("[Loans] History error:", error);
      res.status(500).json({ message: "Failed to fetch loan history" });
    }
  });

  app.post("/api/loans/waitlist/:bookId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { bookId } = req.params;

      const existing = await db.select().from(loanWaitlist)
        .where(and(eq(loanWaitlist.userId, userId), eq(loanWaitlist.bookId, bookId), eq(loanWaitlist.status, "waiting")));

      if (existing.length > 0) {
        return res.status(400).json({ message: "You are already on the waitlist for this book", position: existing[0].position });
      }

      const [{ value: waitingCount }] = await db
        .select({ value: count() })
        .from(loanWaitlist)
        .where(and(eq(loanWaitlist.bookId, bookId), eq(loanWaitlist.status, "waiting")));

      const position = waitingCount + 1;

      const [entry] = await db.insert(loanWaitlist).values({
        userId,
        bookId,
        position,
        status: "waiting",
      }).returning();

      res.json({ message: "Added to waitlist", position, entry });
    } catch (error) {
      console.error("[Loans] Waitlist join error:", error);
      res.status(500).json({ message: "Failed to join waitlist" });
    }
  });

  app.delete("/api/loans/waitlist/:bookId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { bookId } = req.params;

      await db.update(loanWaitlist).set({
        status: "cancelled",
      }).where(and(eq(loanWaitlist.userId, userId), eq(loanWaitlist.bookId, bookId), eq(loanWaitlist.status, "waiting")));

      res.json({ message: "Removed from waitlist" });
    } catch (error) {
      console.error("[Loans] Waitlist leave error:", error);
      res.status(500).json({ message: "Failed to leave waitlist" });
    }
  });

  app.get("/api/loans/waitlist", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const entries = await db
        .select({
          id: loanWaitlist.id,
          bookId: loanWaitlist.bookId,
          position: loanWaitlist.position,
          joinedAt: loanWaitlist.joinedAt,
          notifiedAt: loanWaitlist.notifiedAt,
          status: loanWaitlist.status,
          bookTitle: books.title,
          bookAuthor: books.author,
          bookCover: books.coverImage,
        })
        .from(loanWaitlist)
        .innerJoin(books, eq(loanWaitlist.bookId, books.id))
        .where(and(eq(loanWaitlist.userId, userId), ne(loanWaitlist.status, "cancelled")))
        .orderBy(asc(loanWaitlist.joinedAt));

      res.json(entries);
    } catch (error) {
      console.error("[Loans] Waitlist fetch error:", error);
      res.status(500).json({ message: "Failed to fetch waitlist" });
    }
  });

  app.get("/api/loans/download/:loanId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { loanId } = req.params;
      const [loan] = await db.select().from(bookLoans)
        .where(and(eq(bookLoans.id, loanId), eq(bookLoans.userId, userId)));

      if (!loan) return res.status(404).json({ message: "Loan not found" });
      if (loan.status !== "active") return res.status(400).json({ message: "Loan is no longer active" });
      if (new Date() > loan.expiresAt) return res.status(400).json({ message: "Loan has expired" });
      if (loan.downloadCount >= loan.maxDownloads) {
        return res.status(400).json({ message: `Download limit reached (${loan.maxDownloads} max)` });
      }

      await db.update(bookLoans).set({
        downloadCount: loan.downloadCount + 1,
      }).where(eq(bookLoans.id, loanId));

      const [book] = await db.select().from(books).where(eq(books.id, loan.bookId));
      if (!book) return res.status(404).json({ message: "Book not found" });

      res.json({
        downloadUrl: book.audioUrl || book.contentUrl,
        downloadToken: loan.downloadToken,
        expiresAt: loan.expiresAt,
        downloadsRemaining: loan.maxDownloads - loan.downloadCount - 1,
        book: {
          title: book.title,
          author: book.author,
        },
      });
    } catch (error) {
      console.error("[Loans] Download error:", error);
      res.status(500).json({ message: "Failed to process download" });
    }
  });

  app.get("/api/loans/book/:bookId/status", async (req: any, res) => {
    try {
      const { bookId } = req.params;

      const [{ value: activeLoanCount }] = await db
        .select({ value: count() })
        .from(bookLoans)
        .where(and(eq(bookLoans.bookId, bookId), eq(bookLoans.status, "active")));

      const [{ value: waitlistCount }] = await db
        .select({ value: count() })
        .from(loanWaitlist)
        .where(and(eq(loanWaitlist.bookId, bookId), eq(loanWaitlist.status, "waiting")));

      const result: any = {
        availableCopies: Math.max(0, MAX_CONCURRENT_LOANS_PER_BOOK - activeLoanCount),
        waitlistCount,
      };

      const userId = req.user?.id;
      if (userId) {
        const [userLoan] = await db.select().from(bookLoans)
          .where(and(eq(bookLoans.userId, userId), eq(bookLoans.bookId, bookId), eq(bookLoans.status, "active")));

        const [userWaitlist] = await db.select().from(loanWaitlist)
          .where(and(eq(loanWaitlist.userId, userId), eq(loanWaitlist.bookId, bookId), eq(loanWaitlist.status, "waiting")));

        if (userLoan) result.userLoan = userLoan;
        if (userWaitlist) result.userWaitlist = userWaitlist;
      }

      res.json(result);
    } catch (error) {
      console.error("[Loans] Book status error:", error);
      res.status(500).json({ message: "Failed to fetch book loan status" });
    }
  });
}

export function startLoanExpirationJob() {
  const INTERVAL_MS = 5 * 60 * 1000;

  setInterval(async () => {
    try {
      const now = new Date();

      const expiredLoans = await db.select().from(bookLoans)
        .where(and(eq(bookLoans.status, "active"), lt(bookLoans.expiresAt, now)));

      if (expiredLoans.length === 0) return;

      await db.update(bookLoans).set({ status: "expired" })
        .where(and(eq(bookLoans.status, "active"), lt(bookLoans.expiresAt, now)));

      for (const loan of expiredLoans) {
        const [nextInLine] = await db.select().from(loanWaitlist)
          .where(and(eq(loanWaitlist.bookId, loan.bookId), eq(loanWaitlist.status, "waiting")))
          .orderBy(asc(loanWaitlist.position))
          .limit(1);

        if (nextInLine) {
          await db.update(loanWaitlist).set({
            status: "notified",
            notifiedAt: new Date(),
          }).where(eq(loanWaitlist.id, nextInLine.id));
        }
      }

      console.log(`[Loans] Expired ${expiredLoans.length} loan(s)`);
    } catch (error) {
      console.error("[Loans] Expiration job error:", error);
    }
  }, INTERVAL_MS);

  console.log("[Loans] Expiration job started (runs every 5 minutes)");
}
