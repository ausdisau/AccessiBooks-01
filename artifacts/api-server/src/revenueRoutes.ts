import type { Express } from "express";
import { db } from "./db";
import { eq, desc, sql, and, count, sum, gte, lte } from "drizzle-orm";
import {
  voicePacks, voicePackPurchases, annotationSync,
  enterpriseAccounts, enterpriseMembers, sponsoredQueues, users,
} from "@workspace/db";
import { isAuthenticated } from "./multiAuth";

export function registerRevenueRoutes(app: Express) {

  app.get("/api/voice-packs", async (req: any, res) => {
    try {
      const packs = await db.select().from(voicePacks);
      const userId = req.user?.id;
      let owned: string[] = [];
      let isPremium = false;

      if (userId) {
        const [user] = await db.select().from(users).where(eq(users.id, userId));
        isPremium = user?.subscriptionTier === "premium";
        const purchases = await db.select().from(voicePackPurchases).where(eq(voicePackPurchases.userId, userId));
        owned = purchases.map(p => p.voicePackId);
      }

      const result = packs.map(pack => ({
        ...pack,
        isOwned: owned.includes(pack.id) || (isPremium && pack.isPremiumIncluded),
        isLocked: !owned.includes(pack.id) && !(isPremium && pack.isPremiumIncluded),
      }));

      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch voice packs" });
    }
  });

  app.post("/api/voice-packs/:id/purchase", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const packId = req.params.id;
      const [pack] = await db.select().from(voicePacks).where(eq(voicePacks.id, packId));
      if (!pack) return res.status(404).json({ message: "Voice pack not found" });

      const existing = await db.select().from(voicePackPurchases)
        .where(and(eq(voicePackPurchases.userId, userId), eq(voicePackPurchases.voicePackId, packId)));
      if (existing.length > 0) return res.status(400).json({ message: "Already purchased" });

      await db.insert(voicePackPurchases).values({
        userId,
        voicePackId: packId,
        amountCents: pack.priceCents,
        stripePaymentId: req.body.stripePaymentId || null,
      });

      res.json({ message: "Voice pack purchased", packId });
    } catch (error) {
      res.status(500).json({ message: "Failed to purchase voice pack" });
    }
  });

  app.get("/api/voice-packs/owned", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const isPremium = user?.subscriptionTier === "premium";

      const purchases = await db.select().from(voicePackPurchases).where(eq(voicePackPurchases.userId, userId));
      const purchasedIds = purchases.map(p => p.voicePackId);

      const allPacks = await db.select().from(voicePacks);
      const ownedPacks = allPacks.filter(p =>
        purchasedIds.includes(p.id) || (isPremium && p.isPremiumIncluded)
      );

      res.json(ownedPacks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch owned voice packs" });
    }
  });

  app.post("/api/annotations/sync", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || user.subscriptionTier === "free") {
        return res.status(403).json({ message: "Annotation sync requires Plus or Premium subscription" });
      }

      const { bookId, annotations, bookmarks } = req.body;
      if (!bookId) return res.status(400).json({ message: "bookId required" });

      const existing = await db.select().from(annotationSync)
        .where(and(eq(annotationSync.userId, userId), eq(annotationSync.bookId, bookId)));

      if (existing.length > 0) {
        await db.update(annotationSync)
          .set({
            annotations: JSON.stringify(annotations || []),
            bookmarks: JSON.stringify(bookmarks || []),
            lastSyncedAt: new Date(),
          })
          .where(and(eq(annotationSync.userId, userId), eq(annotationSync.bookId, bookId)));
      } else {
        await db.insert(annotationSync).values({
          userId,
          bookId,
          annotations: JSON.stringify(annotations || []),
          bookmarks: JSON.stringify(bookmarks || []),
        });
      }

      res.json({ message: "Annotations synced" });
    } catch (error) {
      res.status(500).json({ message: "Failed to sync annotations" });
    }
  });

  app.get("/api/annotations/:bookId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || user.subscriptionTier === "free") {
        return res.status(403).json({ message: "Annotation sync requires Plus or Premium subscription" });
      }

      const [record] = await db.select().from(annotationSync)
        .where(and(eq(annotationSync.userId, userId), eq(annotationSync.bookId, req.params.bookId)));

      if (!record) return res.json({ annotations: [], bookmarks: [], synced: false });

      res.json({
        annotations: JSON.parse(record.annotations),
        bookmarks: JSON.parse(record.bookmarks),
        lastSyncedAt: record.lastSyncedAt,
        synced: true,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch annotations" });
    }
  });

  app.get("/api/annotations/export", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || user.subscriptionTier === "free") {
        return res.status(403).json({ message: "Export requires Plus or Premium subscription" });
      }

      const records = await db.select().from(annotationSync)
        .where(eq(annotationSync.userId, userId));

      const exported = records.map(r => ({
        bookId: r.bookId,
        annotations: JSON.parse(r.annotations),
        bookmarks: JSON.parse(r.bookmarks),
        lastSyncedAt: r.lastSyncedAt,
      }));

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", "attachment; filename=accessibooks-notes.json");
      res.json(exported);
    } catch (error) {
      res.status(500).json({ message: "Failed to export annotations" });
    }
  });

  // Gift card routes are defined in routes.ts with full Stripe integration

  app.post("/api/enterprise/create", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { orgName, contactEmail, tier } = req.body;
      if (!orgName || !contactEmail) return res.status(400).json({ message: "orgName and contactEmail required" });

      const entTier = tier === "enterprise" ? "enterprise" : "education";
      const maxSeats = entTier === "enterprise" ? 200 : 50;
      const amountCents = entTier === "enterprise" ? 29900 : 9900;

      const [account] = await db.insert(enterpriseAccounts).values({
        orgName,
        contactEmail,
        tier: entTier,
        maxSeats,
        currentSeats: 1,
        amountCents,
        billingCycle: "monthly",
      }).returning();

      await db.insert(enterpriseMembers).values({
        enterpriseId: account.id,
        userId,
        role: "admin",
      });

      await db.update(users).set({ subscriptionTier: "premium" }).where(eq(users.id, userId));

      res.json({ account });
    } catch (error) {
      res.status(500).json({ message: "Failed to create enterprise account" });
    }
  });

  app.post("/api/enterprise/invite", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "email required" });

      const [membership] = await db.select().from(enterpriseMembers)
        .where(and(eq(enterpriseMembers.userId, userId), eq(enterpriseMembers.role, "admin")));
      if (!membership) return res.status(403).json({ message: "Only admins can invite" });

      const [account] = await db.select().from(enterpriseAccounts)
        .where(eq(enterpriseAccounts.id, membership.enterpriseId));
      if (!account) return res.status(404).json({ message: "Enterprise account not found" });
      if (account.currentSeats >= account.maxSeats) {
        return res.status(400).json({ message: "Seat limit reached" });
      }

      const [invitedUser] = await db.select().from(users).where(eq(users.email, email));
      if (!invitedUser) return res.status(404).json({ message: "User not found with that email" });

      const existing = await db.select().from(enterpriseMembers)
        .where(and(eq(enterpriseMembers.enterpriseId, account.id), eq(enterpriseMembers.userId, invitedUser.id)));
      if (existing.length > 0) return res.status(400).json({ message: "User already a member" });

      await db.insert(enterpriseMembers).values({
        enterpriseId: account.id,
        userId: invitedUser.id,
        role: "member",
      });

      await db.update(enterpriseAccounts).set({
        currentSeats: account.currentSeats + 1,
      }).where(eq(enterpriseAccounts.id, account.id));

      await db.update(users).set({ subscriptionTier: "premium" }).where(eq(users.id, invitedUser.id));

      res.json({ message: `${email} added to organization` });
    } catch (error) {
      res.status(500).json({ message: "Failed to invite member" });
    }
  });

  app.get("/api/enterprise/members", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [membership] = await db.select().from(enterpriseMembers)
        .where(eq(enterpriseMembers.userId, userId));
      if (!membership) return res.status(404).json({ message: "Not part of an enterprise" });

      const members = await db.select({
        id: enterpriseMembers.id,
        userId: enterpriseMembers.userId,
        role: enterpriseMembers.role,
        addedAt: enterpriseMembers.addedAt,
        email: users.email,
        name: users.name,
      }).from(enterpriseMembers)
        .innerJoin(users, eq(enterpriseMembers.userId, users.id))
        .where(eq(enterpriseMembers.enterpriseId, membership.enterpriseId));

      const [account] = await db.select().from(enterpriseAccounts)
        .where(eq(enterpriseAccounts.id, membership.enterpriseId));

      res.json({ members, account });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch members" });
    }
  });

  app.delete("/api/enterprise/members/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [adminCheck] = await db.select().from(enterpriseMembers)
        .where(and(eq(enterpriseMembers.userId, userId), eq(enterpriseMembers.role, "admin")));
      if (!adminCheck) return res.status(403).json({ message: "Only admins can remove members" });

      const memberId = req.params.id;
      const [member] = await db.select().from(enterpriseMembers).where(eq(enterpriseMembers.id, memberId));
      if (!member) return res.status(404).json({ message: "Member not found" });

      await db.delete(enterpriseMembers).where(eq(enterpriseMembers.id, memberId));

      await db.update(enterpriseAccounts).set({
        currentSeats: sql`current_seats - 1`,
      }).where(eq(enterpriseAccounts.id, adminCheck.enterpriseId));

      await db.update(users).set({ subscriptionTier: "free" }).where(eq(users.id, member.userId));

      res.json({ message: "Member removed" });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  app.get("/api/enterprise/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [membership] = await db.select().from(enterpriseMembers)
        .where(and(eq(enterpriseMembers.userId, userId), eq(enterpriseMembers.role, "admin")));
      if (!membership) return res.status(403).json({ message: "Admin access required" });

      const [account] = await db.select().from(enterpriseAccounts)
        .where(eq(enterpriseAccounts.id, membership.enterpriseId));

      const memberList = await db.select({ userId: enterpriseMembers.userId })
        .from(enterpriseMembers)
        .where(eq(enterpriseMembers.enterpriseId, membership.enterpriseId));

      res.json({
        orgName: account?.orgName,
        tier: account?.tier,
        totalMembers: memberList.length,
        maxSeats: account?.maxSeats,
        amountCents: account?.amountCents,
        billingCycle: account?.billingCycle,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.post("/api/sponsorships/create", isAuthenticated, async (req: any, res) => {
    try {
      const { sponsorName, queueId, adAudioUrl, sponsorLogo, amountCents, startDate, endDate } = req.body;
      if (!sponsorName || !amountCents || !startDate || !endDate) {
        return res.status(400).json({ message: "sponsorName, amountCents, startDate, endDate required" });
      }

      const [sponsorship] = await db.insert(sponsoredQueues).values({
        sponsorName,
        queueId: queueId || null,
        adAudioUrl: adAudioUrl || null,
        sponsorLogo: sponsorLogo || null,
        amountCents,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: true,
      }).returning();

      res.json(sponsorship);
    } catch (error) {
      res.status(500).json({ message: "Failed to create sponsorship" });
    }
  });

  app.get("/api/sponsorships/active", async (_req, res) => {
    try {
      const now = new Date();
      const active = await db.select().from(sponsoredQueues)
        .where(and(
          eq(sponsoredQueues.isActive, true),
          lte(sponsoredQueues.startDate, now),
          gte(sponsoredQueues.endDate, now),
        ));
      res.json(active);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sponsorships" });
    }
  });

  app.post("/api/sponsorships/:id/impression", async (req, res) => {
    try {
      await db.update(sponsoredQueues).set({
        impressions: sql`impressions + 1`,
      }).where(eq(sponsoredQueues.id, req.params.id));
      res.json({ recorded: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to track impression" });
    }
  });

  app.post("/api/sponsorships/:id/click", async (req, res) => {
    try {
      await db.update(sponsoredQueues).set({
        clicks: sql`clicks + 1`,
      }).where(eq(sponsoredQueues.id, req.params.id));
      res.json({ recorded: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to track click" });
    }
  });
}

export async function seedVoicePacks() {
  const existing = await db.select().from(voicePacks);
  if (existing.length > 0) return;

  await db.insert(voicePacks).values([
    {
      name: "Storyteller Pack",
      description: "Warm, engaging voices perfect for fiction and narrative content. Includes enhanced storytelling prompts for more expressive reading.",
      voices: ["fable", "nova"],
      priceCents: 299,
      isPremiumIncluded: true,
      systemPrompt: "Read the following text as an engaging storyteller, with warmth and expression. Add natural pauses and emphasis for dramatic effect.",
    },
    {
      name: "Professional Pack",
      description: "Clear, authoritative voices ideal for non-fiction, textbooks, and professional content. Formal reading style with precise enunciation.",
      voices: ["onyx", "echo"],
      priceCents: 399,
      isPremiumIncluded: true,
      systemPrompt: "Read the following text in a clear, professional manner with precise enunciation. Maintain a steady, authoritative tone throughout.",
    },
    {
      name: "Celebrity-Style Pack",
      description: "All 6 premium voices with character-acting prompts. Brings characters to life with distinct personality for each voice.",
      voices: ["nova", "alloy", "echo", "fable", "onyx", "shimmer"],
      priceCents: 499,
      isPremiumIncluded: true,
      systemPrompt: "Read the following text with character and personality. Use distinct voices for dialogue, add emotion and dramatic flair. Bring the text to life as a skilled voice actor would.",
    },
  ]);
  console.log("[Revenue] Seeded 3 voice packs");
}