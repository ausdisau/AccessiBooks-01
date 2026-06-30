import type { Express } from "express";
import { db } from "./db";
import {
  accessibilityReviews, accessibilityMetadata,
  institutionalAccounts, institutionalMembers,
  moatMetricsSnapshots, accessibilityPreferences, bookTranscripts,
  users, books, listeningHistory, userStreaks, userXp, DISABILITY_TYPES,
  LICENSE_PLANS,
} from "@workspace/db";
import { eq, and, count, avg, sql, desc, inArray, gte, sum } from "drizzle-orm";
import { isAuthenticated, requireAdmin } from "./multiAuth";
import { z } from "zod";
import {
  createLicenseCheckout,
  allocateMember,
  reclaimMember,
  InstitutionalLicenseError,
} from "./institutionalLicensing";

// Privacy floor for aggregate institutional reporting: cohorts smaller than this
// suppress per-item breakdowns (top books, preset distribution, weekly detail)
// so individuals cannot be re-identified from "aggregate" stats.
const REPORTING_MIN_COHORT = 5;

export async function ensureMoatMigrations() {
  try {
    await db.execute(sql`
      ALTER TABLE institutional_accounts
      ADD COLUMN IF NOT EXISTS weekly_goal_minutes integer NOT NULL DEFAULT 180
    `);
  } catch (err) {
    console.error("[Moat] Migration warning (weekly_goal_minutes):", err);
  }

  // Task #216: institutional / B2B licensing lifecycle columns + indexes.
  try {
    await db.execute(sql`
      ALTER TABLE institutional_accounts
        ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS license_type text NOT NULL DEFAULT 'seat',
        ADD COLUMN IF NOT EXISTS plan_key text,
        ADD COLUMN IF NOT EXISTS stripe_session_id text,
        ADD COLUMN IF NOT EXISTS period_end timestamp
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_institutional_status ON institutional_accounts (status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_institutional_session ON institutional_accounts (stripe_session_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_institutional_subscription ON institutional_accounts (stripe_subscription_id)`);
  } catch (err) {
    console.error("[Moat] Migration warning (institutional licensing):", err);
  }

  // One org per user: enforce at the DB level so concurrent invites cannot race
  // the route-level "already a member" check and seat a user twice (or across two
  // orgs). Kept in its own try/catch: if legacy data already violates this we log
  // and continue rather than aborting the rest of startup — allocateMember also
  // maps the unique violation to a friendly error at allocation time.
  try {
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_institutional_members_user_unique ON institutional_members (user_id)`);
  } catch (err) {
    console.error("[Moat] Migration warning (unique member index; legacy duplicate memberships?):", err);
  }
}

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

      const { orgName, contactEmail, orgType } = req.body;
      if (!orgName || !contactEmail) return res.status(400).json({ message: "orgName and contactEmail required" });

      const existing = await db.select().from(institutionalMembers)
        .where(eq(institutionalMembers.userId, userId));
      if (existing.length > 0) return res.status(400).json({ message: "Already part of an organization" });

      // New orgs start `pending` and inactive. maxSeats is a placeholder until a
      // licence is purchased — fulfilment sets the real cap from LICENSE_PLANS
      // (never trusted from the client). The admin occupies the first seat. The
      // account + admin-member inserts run in one transaction so a lost race on the
      // unique member index can't leave an orphan org behind.
      let account;
      try {
        account = await db.transaction(async (tx) => {
          const [acct] = await tx.insert(institutionalAccounts).values({
            orgName,
            contactEmail,
            orgType: orgType || "school",
            currentSeats: 1,
            status: "pending",
            isActive: false,
          }).returning();
          await tx.insert(institutionalMembers).values({
            institutionalId: acct.id,
            userId,
            role: "admin",
          });
          return acct;
        });
      } catch (e) {
        if (e && typeof e === "object" && (e as { code?: string }).code === "23505") {
          return res.status(400).json({ message: "Already part of an organization" });
        }
        throw e;
      }

      res.json(account);
    } catch (error) {
      console.error("[Moat] Failed to create institutional account:", error);
      res.status(500).json({ message: "Failed to create institutional account" });
    }
  });

  // Public licence catalogue for display. Pricing/seats are server-authoritative;
  // the client only ever sends a planKey + billingCycle back to /checkout.
  app.get("/api/institutional/plans", (_req, res) => {
    res.json({ plans: Object.values(LICENSE_PLANS) });
  });

  // Admin starts a Stripe checkout to activate (or re-activate) a licence. The
  // server prices it from LICENSE_PLANS; activation happens on the webhook.
  app.post("/api/institutional/checkout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [membership] = await db.select().from(institutionalMembers)
        .where(eq(institutionalMembers.userId, userId));
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Admin only" });
      }

      const { planKey, billingCycle } = req.body ?? {};
      if (!planKey || !billingCycle) {
        return res.status(400).json({ message: "planKey and billingCycle required" });
      }

      const origin = (req.headers.origin as string) || "http://localhost:8080";
      const { checkoutUrl } = await createLicenseCheckout({
        userId,
        orgId: membership.institutionalId,
        planKey,
        billingCycle,
        origin,
      });

      res.json({ checkoutUrl });
    } catch (error) {
      if (error instanceof InstitutionalLicenseError) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("[Moat] Failed to start institutional checkout:", error);
      res.status(500).json({ message: "Failed to start checkout" });
    }
  });

  app.post("/api/institutional/invite", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [membership] = await db.select().from(institutionalMembers)
        .where(eq(institutionalMembers.userId, userId));
      if (!membership || membership.role !== "admin") return res.status(403).json({ message: "Admin only" });

      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "email required" });

      const [invitee] = await db.select().from(users).where(eq(users.email, email));
      if (!invitee) return res.status(404).json({ message: "No AccessiBooks account found for that email" });

      const [alreadyMember] = await db.select().from(institutionalMembers)
        .where(eq(institutionalMembers.userId, invitee.id));
      if (alreadyMember) {
        if (alreadyMember.institutionalId === membership.institutionalId) {
          return res.status(400).json({ message: "User is already a member of this organization" });
        }
        return res.status(400).json({ message: "User already belongs to another organization" });
      }

      // Atomic: claims a seat (enforcing the cap / active licence), inserts the
      // membership, and grants the institutional entitlement in one transaction.
      await allocateMember({ orgId: membership.institutionalId, userId: invitee.id, role: "member" });

      res.json({ message: "Member added", email });
    } catch (error) {
      if (error instanceof InstitutionalLicenseError) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("[Moat] Failed to invite member:", error);
      res.status(500).json({ message: "Failed to invite member" });
    }
  });

  app.get("/api/institutional/members", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [membership] = await db.select().from(institutionalMembers)
        .where(eq(institutionalMembers.userId, userId));
      if (!membership) return res.status(404).json({ message: "Not part of an institution" });

      const [account] = await db.select().from(institutionalAccounts)
        .where(eq(institutionalAccounts.id, membership.institutionalId));

      const memberRows = await db.select({
        id: institutionalMembers.id,
        userId: institutionalMembers.userId,
        role: institutionalMembers.role,
        addedAt: institutionalMembers.addedAt,
        email: users.email,
        name: users.name,
        profileImage: users.profileImageUrl,
      }).from(institutionalMembers)
        .innerJoin(users, eq(institutionalMembers.userId, users.id))
        .where(eq(institutionalMembers.institutionalId, membership.institutionalId));

      const memberUserIds = memberRows.map((m) => m.userId);

      const xpRows = memberUserIds.length > 0
        ? await db.select({
            userId: userXp.userId,
            totalListeningMinutes: userXp.totalListeningMinutes,
            booksCompleted: userXp.booksCompleted,
          }).from(userXp).where(inArray(userXp.userId, memberUserIds))
        : [];

      const streakRows = memberUserIds.length > 0
        ? await db.select({
            userId: userStreaks.userId,
            currentStreak: userStreaks.currentStreak,
          }).from(userStreaks).where(inArray(userStreaks.userId, memberUserIds))
        : [];

      const presetRows = memberUserIds.length > 0
        ? await db.select({
            userId: accessibilityPreferences.userId,
            activePreset: accessibilityPreferences.activePreset,
          }).from(accessibilityPreferences).where(inArray(accessibilityPreferences.userId, memberUserIds))
        : [];

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weeklyListeningRaw = memberUserIds.length > 0
        ? await db.select({
            userId: listeningHistory.userId,
            currentTime: listeningHistory.currentTime,
          }).from(listeningHistory)
            .where(and(
              inArray(listeningHistory.userId, memberUserIds),
              gte(listeningHistory.lastPlayedAt, sevenDaysAgo),
            ))
        : [];

      const weeklyMinutesByUser: Record<string, number> = {};
      for (const row of weeklyListeningRaw) {
        weeklyMinutesByUser[row.userId] = (weeklyMinutesByUser[row.userId] ?? 0) + Math.round((row.currentTime ?? 0) / 60);
      }

      const xpByUser = Object.fromEntries(xpRows.map((r) => [r.userId, r]));
      const streakByUser = Object.fromEntries(streakRows.map((r) => [r.userId, r]));
      const presetByUser = Object.fromEntries(presetRows.map((r) => [r.userId, r]));

      const members = memberRows.map((m) => ({
        ...m,
        listeningMinutesTotal: xpByUser[m.userId]?.totalListeningMinutes ?? 0,
        weeklyListeningMinutes: weeklyMinutesByUser[m.userId] ?? 0,
        booksCompleted: xpByUser[m.userId]?.booksCompleted ?? 0,
        currentStreak: streakByUser[m.userId]?.currentStreak ?? 0,
        activePreset: presetByUser[m.userId]?.activePreset ?? null,
      }));

      res.json({ account, members, myRole: membership.role });
    } catch (error) {
      console.error("[Moat] Failed to fetch institutional members:", error);
      res.status(500).json({ message: "Failed to fetch institutional members" });
    }
  });

  app.get("/api/institutional/member/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const adminId = req.user?.id;
      if (!adminId) return res.status(401).json({ message: "Unauthorized" });

      const [adminMembership] = await db.select().from(institutionalMembers)
        .where(and(
          eq(institutionalMembers.userId, adminId),
          eq(institutionalMembers.role, "admin"),
        ));
      if (!adminMembership) return res.status(403).json({ message: "Admin only" });

      const targetUserId = req.params.userId;

      const [targetMembership] = await db.select().from(institutionalMembers)
        .where(and(
          eq(institutionalMembers.userId, targetUserId),
          eq(institutionalMembers.institutionalId, adminMembership.institutionalId),
        ));
      if (!targetMembership) return res.status(404).json({ message: "Member not found" });

      const [targetUser] = await db.select({
        id: users.id,
        email: users.email,
        name: users.name,
        profileImage: users.profileImageUrl,
      }).from(users).where(eq(users.id, targetUserId));

      const history = await db.select({
        bookId: listeningHistory.bookId,
        bookTitle: listeningHistory.bookTitle,
        bookAuthor: listeningHistory.bookAuthor,
        bookCover: listeningHistory.bookCover,
        currentTime: listeningHistory.currentTime,
        totalDuration: listeningHistory.totalDuration,
        lastPlayedAt: listeningHistory.lastPlayedAt,
        completedAt: listeningHistory.completedAt,
        playCount: listeningHistory.playCount,
      }).from(listeningHistory)
        .where(eq(listeningHistory.userId, targetUserId))
        .orderBy(desc(listeningHistory.lastPlayedAt))
        .limit(20);

      const [streak] = await db.select().from(userStreaks)
        .where(eq(userStreaks.userId, targetUserId));

      const [xp] = await db.select().from(userXp)
        .where(eq(userXp.userId, targetUserId));

      const [prefs] = await db.select().from(accessibilityPreferences)
        .where(eq(accessibilityPreferences.userId, targetUserId));

      res.json({
        user: targetUser,
        role: targetMembership.role,
        addedAt: targetMembership.addedAt,
        history,
        streak: streak ?? null,
        xp: xp ?? null,
        accessibilityProfile: prefs?.profile ?? null,
        activePreset: prefs?.activePreset ?? null,
      });
    } catch (error) {
      console.error("[Moat] Failed to fetch member detail:", error);
      res.status(500).json({ message: "Failed to fetch member detail" });
    }
  });

  app.delete("/api/institutional/members/:id", isAuthenticated, async (req: any, res) => {
    try {
      const adminId = req.user?.id;
      if (!adminId) return res.status(401).json({ message: "Unauthorized" });

      const [adminMembership] = await db.select().from(institutionalMembers)
        .where(and(
          eq(institutionalMembers.userId, adminId),
          eq(institutionalMembers.role, "admin"),
        ));
      if (!adminMembership) return res.status(403).json({ message: "Admin only" });

      const memberId = req.params.id;
      const [target] = await db.select().from(institutionalMembers)
        .where(and(
          eq(institutionalMembers.id, memberId),
          eq(institutionalMembers.institutionalId, adminMembership.institutionalId),
        ));
      if (!target) return res.status(404).json({ message: "Member not found" });
      if (target.role === "admin") return res.status(400).json({ message: "Cannot remove admin" });

      // Atomic: removes the membership, frees the seat, and revokes that member's
      // institutional entitlement in one transaction. Returns the freed userId so
      // the admin can reassign the seat to someone else.
      const { userId: freedUserId } = await reclaimMember({
        orgId: adminMembership.institutionalId,
        memberId,
      });

      res.json({ message: "Member removed", reclaimedUserId: freedUserId });
    } catch (error) {
      if (error instanceof InstitutionalLicenseError) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("[Moat] Failed to remove member:", error);
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  app.patch("/api/institutional/settings", isAuthenticated, async (req: any, res) => {
    try {
      const adminId = req.user?.id;
      if (!adminId) return res.status(401).json({ message: "Unauthorized" });

      const [adminMembership] = await db.select().from(institutionalMembers)
        .where(and(
          eq(institutionalMembers.userId, adminId),
          eq(institutionalMembers.role, "admin"),
        ));
      if (!adminMembership) return res.status(403).json({ message: "Admin only" });

      const schema = z.object({
        weeklyGoalMinutes: z.number().int().min(0).max(10080).optional(),
        orgName: z.string().min(1).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid settings" });

      await db.update(institutionalAccounts)
        .set(parsed.data)
        .where(eq(institutionalAccounts.id, adminMembership.institutionalId));

      res.json({ message: "Settings updated" });
    } catch (error) {
      console.error("[Moat] Failed to update institutional settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.get("/api/institutional/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [membership] = await db.select().from(institutionalMembers)
        .where(and(
          eq(institutionalMembers.userId, userId),
          eq(institutionalMembers.role, "admin"),
        ));
      if (!membership) return res.status(403).json({ message: "Admin access required for org analytics" });

      const memberRows = await db.select({
        userId: institutionalMembers.userId,
      }).from(institutionalMembers)
        .where(eq(institutionalMembers.institutionalId, membership.institutionalId));

      const memberUserIds = memberRows.map((m) => m.userId);

      if (memberUserIds.length === 0) {
        return res.json({
          totalListeningMinutes: 0,
          totalBooksCompleted: 0,
          avgCompletionRate: 0,
          activeUsersCount: 0,
          topBooks: [],
          presetDistribution: [],
          weeklyListeningMinutes: Array.from({ length: 7 }, (_, i) => ({ day: i, minutes: 0 })),
        });
      }

      const [xpAgg] = await db.select({
        totalListeningMinutes: sum(userXp.totalListeningMinutes),
        totalBooksCompleted: sum(userXp.booksCompleted),
        activeCount: count(userXp.userId),
      }).from(userXp).where(inArray(userXp.userId, memberUserIds));

      const topBooksRaw = await db.select({
        bookId: listeningHistory.bookId,
        bookTitle: listeningHistory.bookTitle,
        bookCover: listeningHistory.bookCover,
        plays: count(listeningHistory.id),
      }).from(listeningHistory)
        .where(inArray(listeningHistory.userId, memberUserIds))
        .groupBy(listeningHistory.bookId, listeningHistory.bookTitle, listeningHistory.bookCover)
        .orderBy(desc(count(listeningHistory.id)))
        .limit(5);

      const presetRows = await db.select({
        activePreset: accessibilityPreferences.activePreset,
        cnt: count(accessibilityPreferences.userId),
      }).from(accessibilityPreferences)
        .where(inArray(accessibilityPreferences.userId, memberUserIds))
        .groupBy(accessibilityPreferences.activePreset)
        .orderBy(desc(count(accessibilityPreferences.userId)));

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weeklyRaw = await db.select({
        lastPlayedAt: listeningHistory.lastPlayedAt,
        currentTime: listeningHistory.currentTime,
      }).from(listeningHistory)
        .where(and(
          inArray(listeningHistory.userId, memberUserIds),
          gte(listeningHistory.lastPlayedAt, sevenDaysAgo),
        ));

      const weeklyByDay = Array.from({ length: 7 }, (_, i) => ({ day: i, minutes: 0 }));
      for (const row of weeklyRaw) {
        if (!row.lastPlayedAt) continue;
        const daysAgo = Math.floor((Date.now() - new Date(row.lastPlayedAt).getTime()) / (24 * 60 * 60 * 1000));
        const idx = Math.min(daysAgo, 6);
        weeklyByDay[6 - idx].minutes += Math.round((row.currentTime ?? 0) / 60);
      }

      const totalMinutes = Number(xpAgg?.totalListeningMinutes ?? 0);
      const totalBooks = Number(xpAgg?.totalBooksCompleted ?? 0);
      const historyRows = await db.select({ completedAt: listeningHistory.completedAt })
        .from(listeningHistory).where(inArray(listeningHistory.userId, memberUserIds));
      const totalHistoryCount = historyRows.length;
      const completedCount = historyRows.filter((r) => r.completedAt !== null).length;
      const avgCompletionRate = totalHistoryCount > 0 ? Math.round((completedCount / totalHistoryCount) * 100) : 0;

      // Privacy: for small cohorts, suppress per-item breakdowns (top books,
      // preset distribution, weekly detail) so individuals can't be
      // re-identified. Coarse org-wide totals are still returned.
      const cohortSize = memberUserIds.length;
      const suppressed = cohortSize < REPORTING_MIN_COHORT;

      res.json({
        totalListeningMinutes: totalMinutes,
        totalBooksCompleted: totalBooks,
        avgCompletionRate,
        activeUsersCount: Number(xpAgg?.activeCount ?? 0),
        topBooks: suppressed ? [] : topBooksRaw,
        presetDistribution: suppressed
          ? []
          : presetRows.map((r) => ({
              preset: r.activePreset ?? "None",
              count: Number(r.cnt),
            })),
        weeklyListeningMinutes: suppressed
          ? Array.from({ length: 7 }, (_, i) => ({ day: i, minutes: 0 }))
          : weeklyByDay,
        reportingSuppressed: suppressed,
        minCohort: REPORTING_MIN_COHORT,
      });
    } catch (error) {
      console.error("[Moat] Failed to fetch institutional analytics:", error);
      res.status(500).json({ message: "Failed to fetch institutional analytics" });
    }
  });

  // Note: /api/recommendations is registered in platformRoutes.ts with the real
  // heuristic + agent-aware path. The scaffolding stub has been removed to avoid
  // duplicate route definitions overriding the real implementation.

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

  app.get("/api/admin/moat-metrics", isAuthenticated, requireAdmin, async (_req: any, res) => {
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

  app.post("/api/admin/moat-metrics/snapshot", isAuthenticated, requireAdmin, async (_req: any, res) => {
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
