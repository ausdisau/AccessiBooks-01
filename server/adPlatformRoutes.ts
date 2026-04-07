import { Express, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import {
  adCampaigns, displayAds, adSlots, adAuctions, slotImpressions, slotClicks,
  advertiserWallets, publisherEarnings, payoutRequests, users,
  insertAdCampaignSchema, insertDisplayAdSchema, insertAdSlotSchema,
  type User,
} from "@shared/schema";
import { runAuction } from "./auctionEngine";

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

  // GET /api/ad/campaigns/:id — single campaign (owner or admin)
  app.get("/api/ad/campaigns/:id", requireAnyRole("advertiser", "admin"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const [row] = user.role === "admin"
        ? await db.select().from(adCampaigns).where(eq(adCampaigns.id, req.params.id))
        : await db.select().from(adCampaigns).where(and(eq(adCampaigns.id, req.params.id), eq(adCampaigns.advertiserId, user.id)));
      if (!row) return res.status(404).json({ message: "Campaign not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch campaign" });
    }
  });

  // POST /api/ad/campaigns
  app.post("/api/ad/campaigns", requireRole("advertiser"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      // Pre-process date strings to Date objects before schema validation
      const body = { ...req.body, advertiserId: user.id };
      if (body.startDate && typeof body.startDate === "string") body.startDate = new Date(body.startDate);
      if (body.endDate && typeof body.endDate === "string") body.endDate = new Date(body.endDate);
      if (body.startDate === "") body.startDate = null;
      if (body.endDate === "") body.endDate = null;
      const parsed = insertAdCampaignSchema.safeParse(body);
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
        dailyBudgetCents: z.number().min(0).optional(),
        cpmBidCents: z.number().min(0).optional(),
        startDate: z.string().datetime({ offset: true }).optional().nullable(),
        endDate: z.string().datetime({ offset: true }).optional().nullable(),
        status: z.enum(["draft", "pending_review", "active", "paused", "completed", "rejected"]).optional(),
      });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
      const { startDate, endDate, ...rest } = parsed.data;
      const [row] = await db
        .update(adCampaigns)
        .set({
          ...rest,
          ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
          ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
          updatedAt: new Date(),
        })
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

  // GET /api/ad/display-ads/:id — single ad (owner or admin)
  app.get("/api/ad/display-ads/:id", requireAnyRole("advertiser", "admin"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const [row] = user.role === "admin"
        ? await db.select().from(displayAds).where(eq(displayAds.id, req.params.id))
        : await db.select().from(displayAds).where(and(eq(displayAds.id, req.params.id), eq(displayAds.advertiserId, user.id)));
      if (!row) return res.status(404).json({ message: "Ad not found" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch ad" });
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

  function withEmbedSnippet<T extends { id: string }>(row: T, req?: Request) {
    const base = req ? `${req.protocol}://${req.get("host")}` : "";
    const snippet = `<!-- AdBid Display Ad -->
<div id="adbid-slot-${row.id}" style="display:inline-block;min-width:100px;min-height:30px;"></div>
<script>
(function(){
  fetch("${base}/api/serve/${row.id}")
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.noFill) return;
      var c=document.getElementById("adbid-slot-${row.id}");
      if(!c) return;
      var a=d.ad;
      var link=document.createElement("a");
      link.href=a.clickUrl;
      link.target="_blank";
      link.rel="noopener noreferrer";
      link.style.display="block";
      if(a.imageUrl){
        var img=document.createElement("img");
        img.src=a.imageUrl;
        img.alt=a.headline;
        img.style.maxWidth="100%";
        link.appendChild(img);
      } else {
        var hl=document.createElement("strong");
        hl.textContent=a.headline;
        link.appendChild(hl);
        if(a.body){
          var bd=document.createElement("p");
          bd.textContent=a.body;
          bd.style.margin="4px 0 0";
          bd.style.fontSize="13px";
          link.appendChild(bd);
        }
      }
      c.appendChild(link);
    })
    .catch(function(){});
})();
</script>`;
    return { ...row, embedSnippet: snippet };
  }

  app.get("/api/ad/slots", requireAnyRole("publisher", "admin"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const rows = user.role === "admin"
        ? await db.select().from(adSlots).orderBy(desc(adSlots.createdAt))
        : await db.select().from(adSlots).where(eq(adSlots.publisherId, user.id)).orderBy(desc(adSlots.createdAt));
      res.json(rows.map((row) => withEmbedSnippet(row, req)));
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch slots" });
    }
  });

  // GET /api/ad/slots/:id — single slot (owner or admin)
  app.get("/api/ad/slots/:id", requireAnyRole("publisher", "admin"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const [row] = user.role === "admin"
        ? await db.select().from(adSlots).where(eq(adSlots.id, req.params.id))
        : await db.select().from(adSlots).where(and(eq(adSlots.id, req.params.id), eq(adSlots.publisherId, user.id)));
      if (!row) return res.status(404).json({ message: "Slot not found" });
      res.json(withEmbedSnippet(row, req));
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch slot" });
    }
  });

  app.post("/api/ad/slots", requireRole("publisher"), async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req)!;
      const parsed = insertAdSlotSchema.safeParse({ ...req.body, publisherId: user.id });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
      const [row] = await db.insert(adSlots).values({ ...parsed.data, publisherId: user.id }).returning();
      res.status(201).json(withEmbedSnippet(row, req));
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
      res.json(withEmbedSnippet(row, req));
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

  // Legacy internal auction endpoint (kept for backward compatibility)
  app.post("/api/ad/auction/:slotId", async (req: Request, res: Response) => {
    try {
      const result = await runAuction(req.params.slotId);
      if (result.noFill) return res.json({ noFill: true });
      const { winner } = result;
      res.json({
        noFill: false,
        auctionId: winner!.auction.id,
        ad: {
          id: winner!.ad.id,
          headline: winner!.ad.headline,
          body: winner!.ad.body,
          imageUrl: winner!.ad.imageUrl,
          destinationUrl: winner!.ad.destinationUrl,
        },
      });
    } catch (e) {
      console.error("Auction error:", e);
      res.status(500).json({ message: "Auction failed" });
    }
  });

  // GET /api/ad/demo-slots — public, no auth required
  // Returns a minimal list of active slots for the /demo-slot test page.
  // Only exposes id, name, width, height, category — no sensitive data.
  app.get("/api/ad/demo-slots", async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: adSlots.id,
          name: adSlots.name,
          category: adSlots.category,
          width: adSlots.width,
          height: adSlots.height,
        })
        .from(adSlots)
        .where(eq(adSlots.isActive, true))
        .orderBy(desc(adSlots.createdAt))
        .limit(20);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch demo slots" });
    }
  });

  // GET /api/serve/:slotId — public endpoint for publisher embed script
  // Runs a Vickrey auction and returns the winning creative + click tracking URL.
  // No auth required (called by third-party publisher sites).
  app.get("/api/serve/:slotId", async (req: Request, res: Response) => {
    try {
      const { slotId } = req.params;
      res.set("Cache-Control", "no-store");
      res.set("Access-Control-Allow-Origin", "*");

      const result = await runAuction(slotId);

      if (result.noFill) {
        return res.json({ noFill: true });
      }

      const { winner } = result;
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const clickUrl = `${baseUrl}/api/click/${winner!.impression.id}`;

      return res.json({
        noFill: false,
        impressionId: winner!.impression.id,
        ad: {
          id: winner!.ad.id,
          headline: winner!.ad.headline,
          body: winner!.ad.body,
          imageUrl: winner!.ad.imageUrl,
          destinationUrl: winner!.ad.destinationUrl,
          clickUrl,
        },
      });
    } catch (e) {
      console.error("[Serve] Error:", e);
      res.status(500).json({ message: "Ad serving failed" });
    }
  });

  // GET /api/click/:impressionId — idempotent click tracking + redirect
  // Atomically inserts a click row using ON CONFLICT DO NOTHING (unique constraint on impression_id).
  // Only increments counters when the insert actually succeeded (rowCount > 0).
  app.get("/api/click/:impressionId", async (req: Request, res: Response) => {
    try {
      const { impressionId } = req.params;

      // Fetch impression and ad destination in one shot
      const [row] = await db
        .select({
          impressionId: slotImpressions.id,
          adId: slotImpressions.adId,
          advertiserId: slotImpressions.advertiserId,
          destinationUrl: displayAds.destinationUrl,
        })
        .from(slotImpressions)
        .innerJoin(displayAds, eq(displayAds.id, slotImpressions.adId))
        .where(eq(slotImpressions.id, impressionId));

      if (!row) return res.status(404).send("Impression not found");

      // Atomic insert — unique index on impression_id means concurrent
      // double-clicks conflict and only one row is ever inserted.
      const insertResult = await db
        .insert(slotClicks)
        .values({ impressionId, adId: row.adId })
        .onConflictDoNothing()
        .returning({ id: slotClicks.id });

      // Only update counters if this was the first click (insert succeeded)
      if (insertResult.length > 0) {
        await Promise.all([
          db
            .update(slotImpressions)
            .set({ clicked: true })
            .where(eq(slotImpressions.id, impressionId)),

          db
            .update(displayAds)
            .set({ clickCount: sql`${displayAds.clickCount} + 1`, updatedAt: new Date() })
            .where(eq(displayAds.id, row.adId)),

          db
            .update(adCampaigns)
            .set({ clicks: sql`${adCampaigns.clicks} + 1`, updatedAt: new Date() })
            .where(
              sql`${adCampaigns.id} = (SELECT campaign_id FROM display_ads WHERE id = ${row.adId})`
            ),
        ]);
      }

      // Redirect to destination URL regardless of whether this is a duplicate click
      const dest = row.destinationUrl.startsWith("http")
        ? row.destinationUrl
        : `https://${row.destinationUrl}`;
      return res.redirect(302, dest);
    } catch (e) {
      console.error("[Click] Error:", e);
      res.status(500).send("Click tracking failed");
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
