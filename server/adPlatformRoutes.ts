import { Express, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import {
  adCampaigns, displayAds, adSlots, adAuctions, slotImpressions,
  advertiserWallets, publisherEarnings, payoutRequests, users,
  insertAdCampaignSchema, insertDisplayAdSchema, insertAdSlotSchema,
  type User,
} from "@shared/schema";

type AuthenticatedUser = Pick<User, "id" | "email" | "role" | "firstName" | "lastName" | "companyName">;

function getAuthUser(req: Request): AuthenticatedUser | null {
  if (!req.user) return null;
  return req.user as AuthenticatedUser;
}

function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    if (user.role !== role) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

function requireAnyRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    if (!user.role || !roles.includes(user.role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

export function registerAdPlatformRoutes(app: Express) {

  // ============ SHARED ============

  // GET /api/ad/campaigns — advertiser gets their own, admin gets all
  app.get("/api/ad/campaigns", requireAnyRole("advertiser", "admin"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const rows = user.role === "admin"
        ? await db.select().from(adCampaigns).orderBy(desc(adCampaigns.createdAt))
        : await db.select().from(adCampaigns).where(eq(adCampaigns.advertiserId, user.id)).orderBy(desc(adCampaigns.createdAt));
      res.json(rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  // POST /api/ad/campaigns
  app.post("/api/ad/campaigns", requireRole("advertiser"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const parsed = insertAdCampaignSchema.safeParse({ ...req.body, advertiserId: user.id });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
      const [row] = await db.insert(adCampaigns).values({ ...parsed.data, advertiserId: user.id }).returning();
      res.status(201).json(row);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  // PATCH /api/ad/campaigns/:id — edit campaign fields
  app.patch("/api/ad/campaigns/:id", requireRole("advertiser"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        budgetCents: z.number().min(0).optional(),
        cpmBidCents: z.number().min(0).optional(),
        status: z.enum(["draft", "pending_review", "active", "paused", "completed", "rejected"]).optional(),
      });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
      const [row] = await db
        .update(adCampaigns)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(adCampaigns.id, req.params.id), eq(adCampaigns.advertiserId, user.id)))
        .returning();
      if (!row) return res.status(404).json({ message: "Campaign not found" });
      res.json(row);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Failed to update campaign" });
    }
  });

  // DELETE /api/ad/campaigns/:id — delete campaign and its ads
  app.delete("/api/ad/campaigns/:id", requireRole("advertiser"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const [row] = await db
        .delete(adCampaigns)
        .where(and(eq(adCampaigns.id, req.params.id), eq(adCampaigns.advertiserId, user.id)))
        .returning();
      if (!row) return res.status(404).json({ message: "Campaign not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Failed to delete campaign" });
    }
  });

  // ============ DISPLAY ADS ============

  app.get("/api/ad/display-ads", requireAnyRole("advertiser", "admin"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const rows = user.role === "admin"
        ? await db.select().from(displayAds).orderBy(desc(displayAds.createdAt))
        : await db.select().from(displayAds).where(eq(displayAds.advertiserId, user.id)).orderBy(desc(displayAds.createdAt));
      res.json(rows);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch ads" });
    }
  });

  app.post("/api/ad/display-ads", requireRole("advertiser"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const parsed = insertDisplayAdSchema.safeParse({ ...req.body, advertiserId: user.id });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
      const [campaign] = await db.select().from(adCampaigns).where(
        and(eq(adCampaigns.id, parsed.data.campaignId), eq(adCampaigns.advertiserId, user.id))
      );
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });
      const [row] = await db.insert(displayAds).values({ ...parsed.data, advertiserId: user.id }).returning();
      res.status(201).json(row);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Failed to create ad" });
    }
  });

  // PATCH /api/ad/display-ads/:id — edit ad creative fields
  // Advertisers may only set status to 'paused' or 'pending_review' (re-submit after edits).
  // 'approved' and 'rejected' are admin-only transitions enforced here.
  app.patch("/api/ad/display-ads/:id", requireRole("advertiser"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const updateSchema = z.object({
        headline: z.string().min(1).optional(),
        body: z.string().optional(),
        imageUrl: z.string().url().optional().nullable(),
        destinationUrl: z.string().url().optional(),
        maxCpmCents: z.number().min(0).optional(),
        status: z.enum(["paused", "pending_review"]).optional(),
      });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
      const [row] = await db
        .update(displayAds)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(displayAds.id, req.params.id), eq(displayAds.advertiserId, user.id)))
        .returning();
      if (!row) return res.status(404).json({ message: "Ad not found" });
      res.json(row);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Failed to update ad" });
    }
  });

  // DELETE /api/ad/display-ads/:id — delete ad
  app.delete("/api/ad/display-ads/:id", requireRole("advertiser"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const [row] = await db
        .delete(displayAds)
        .where(and(eq(displayAds.id, req.params.id), eq(displayAds.advertiserId, user.id)))
        .returning();
      if (!row) return res.status(404).json({ message: "Ad not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Failed to delete ad" });
    }
  });

  // ============ AD SLOTS ============

  function withEmbedSnippet<T extends { id: string }>(row: T) {
    return {
      ...row,
      embedSnippet: `<script src="https://adbid.io/serve.js" data-slot="${row.id}" async></script>`,
    };
  }

  app.get("/api/ad/slots", requireAnyRole("publisher", "admin"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const rows = user.role === "admin"
        ? await db.select().from(adSlots).orderBy(desc(adSlots.createdAt))
        : await db.select().from(adSlots).where(eq(adSlots.publisherId, user.id)).orderBy(desc(adSlots.createdAt));
      res.json(rows.map(withEmbedSnippet));
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch slots" });
    }
  });

  app.post("/api/ad/slots", requireRole("publisher"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const parsed = insertAdSlotSchema.safeParse({ ...req.body, publisherId: user.id });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
      const [row] = await db.insert(adSlots).values({ ...parsed.data, publisherId: user.id }).returning();
      res.status(201).json(withEmbedSnippet(row));
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Failed to create slot" });
    }
  });

  app.patch("/api/ad/slots/:id", requireRole("publisher"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        websiteUrl: z.string().url().optional(),
        category: z.string().optional(),
        width: z.number().min(100).max(2000).optional(),
        height: z.number().min(50).max(2000).optional(),
        minCpmCents: z.number().min(0).optional(),
        isActive: z.boolean().optional(),
      });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
      const [row] = await db
        .update(adSlots)
        .set(parsed.data)
        .where(and(eq(adSlots.id, req.params.id), eq(adSlots.publisherId, user.id)))
        .returning();
      if (!row) return res.status(404).json({ message: "Slot not found" });
      res.json(withEmbedSnippet(row));
    } catch (e) {
      res.status(500).json({ message: "Failed to update slot" });
    }
  });

  // DELETE /api/ad/slots/:id — delete slot
  app.delete("/api/ad/slots/:id", requireRole("publisher"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const [row] = await db
        .delete(adSlots)
        .where(and(eq(adSlots.id, req.params.id), eq(adSlots.publisherId, user.id)))
        .returning();
      if (!row) return res.status(404).json({ message: "Slot not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Failed to delete slot" });
    }
  });

  // ============ WALLET ============

  app.get("/api/ad/wallet", requireRole("advertiser"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      let [wallet] = await db.select().from(advertiserWallets).where(eq(advertiserWallets.advertiserId, user.id));
      if (!wallet) {
        [wallet] = await db.insert(advertiserWallets).values({ advertiserId: user.id }).returning();
      }
      res.json(wallet);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch wallet" });
    }
  });

  // ============ PUBLISHER EARNINGS ============

  app.get("/api/ad/earnings", requireRole("publisher"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      let [earnings] = await db.select().from(publisherEarnings).where(eq(publisherEarnings.publisherId, user.id));
      if (!earnings) {
        [earnings] = await db.insert(publisherEarnings).values({ publisherId: user.id }).returning();
      }
      res.json(earnings);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch earnings" });
    }
  });

  // ============ BIDDING ENGINE ============

  app.post("/api/ad/auction/:slotId", async (req: Request, res: Response) => {
    try {
      const { slotId } = req.params;

      const [slot] = await db.select().from(adSlots).where(and(eq(adSlots.id, slotId), eq(adSlots.isActive, true)));
      if (!slot) return res.status(404).json({ message: "Slot not found or inactive" });

      const eligibleAds = await db.select().from(displayAds).where(
        and(
          eq(displayAds.status, "approved"),
          sql`${displayAds.maxCpmCents} >= ${slot.minCpmCents}`
        )
      );

      if (eligibleAds.length === 0) {
        await db.insert(adAuctions).values({
          slotId,
          noFill: true,
          bidsConsidered: 0,
        });
        return res.json({ noFill: true });
      }

      const sorted = [...eligibleAds].sort((a, b) => (b.maxCpmCents ?? 0) - (a.maxCpmCents ?? 0));
      const winner = sorted[0];
      const winningCpmCents = winner.maxCpmCents ?? 0;
      const secondPriceCpmCents = sorted[1]?.maxCpmCents ?? slot.minCpmCents;
      const chargedCpmCents = Math.max(secondPriceCpmCents + 1, slot.minCpmCents);

      const [auction] = await db.insert(adAuctions).values({
        slotId,
        winningAdId: winner.id,
        winningCpmCents,
        secondPriceCpmCents,
        bidsConsidered: eligibleAds.length,
        noFill: false,
      }).returning();

      await db.insert(slotImpressions).values({
        auctionId: auction.id,
        adId: winner.id,
        slotId,
        advertiserId: winner.advertiserId,
        publisherId: slot.publisherId,
        cpmCents: chargedCpmCents,
      });

      await Promise.all([
        db.update(displayAds).set({ impressionCount: sql`${displayAds.impressionCount} + 1` }).where(eq(displayAds.id, winner.id)),
        db.update(adSlots).set({ totalImpressions: sql`${adSlots.totalImpressions} + 1` }).where(eq(adSlots.id, slotId)),
      ]);

      res.json({
        noFill: false,
        auctionId: auction.id,
        ad: {
          id: winner.id,
          headline: winner.headline,
          body: winner.body,
          imageUrl: winner.imageUrl,
          destinationUrl: winner.destinationUrl,
        },
      });
    } catch (e) {
      console.error("Auction error:", e);
      res.status(500).json({ message: "Auction failed" });
    }
  });

  // ============ ADMIN ============

  app.get("/api/ad/admin/pending-ads", requireRole("admin"), async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: displayAds.id,
          headline: displayAds.headline,
          body: displayAds.body,
          destinationUrl: displayAds.destinationUrl,
          status: displayAds.status,
          maxCpmCents: displayAds.maxCpmCents,
          advertiserId: displayAds.advertiserId,
          advertiserEmail: users.email,
          createdAt: displayAds.createdAt,
        })
        .from(displayAds)
        .leftJoin(users, eq(displayAds.advertiserId, users.id))
        .where(eq(displayAds.status, "pending_review"))
        .orderBy(desc(displayAds.createdAt));
      res.json(rows);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch pending ads" });
    }
  });

  app.patch("/api/ad/admin/display-ads/:id/review", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const { status, rejectionReason } = req.body;
      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Status must be 'approved' or 'rejected'" });
      }
      const [row] = await db
        .update(displayAds)
        .set({ status, rejectionReason: rejectionReason || null, updatedAt: new Date() })
        .where(eq(displayAds.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ message: "Ad not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: "Failed to review ad" });
    }
  });

  app.get("/api/ad/admin/users", requireRole("admin"), async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          companyName: users.companyName,
          website: users.website,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(sql`${users.role} IS NOT NULL`)
        .orderBy(desc(users.createdAt));
      res.json(rows);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/ad/admin/stats", requireRole("admin"), async (_req: Request, res: Response) => {
    try {
      const [{ count: advertiserCount }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.role, "advertiser"));
      const [{ count: publisherCount }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.role, "publisher"));
      const [{ total: totalImpressions }] = await db
        .select({ total: sql<number>`coalesce(sum(total_impressions), 0)` })
        .from(adSlots);
      res.json({
        advertiserCount: Number(advertiserCount),
        publisherCount: Number(publisherCount),
        totalImpressions: Number(totalImpressions),
        revenueCents: 0,
      });
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });
}
