/**
 * selfServeAds.ts — Audio Self-Serve Ad Platform API
 *
 * Responsibility: Audio ad campaigns with audio creatives (recorded or uploaded files):
 *   - /api/self-serve-ads/campaigns          — campaign CRUD
 *   - /api/self-serve-ads/campaigns/:id/creatives — audio creative management
 *   - /api/self-serve-ads/campaigns/:id/stats    — impression/click stats
 *   - /api/self-serve-ads/upload-url             — object storage pre-signed upload URL
 *   - /api/self-serve-ads/audio/*                — audio file serving proxy
 *
 * Also exports selectSelfServeAd(), recordImpression(), recordImpressionEvent()
 * used by adMediation.ts when programmatic providers return no fill.
 *
 * NOT responsible for display (banner/image) ads — see adPlatformRoutes.ts for those.
 */
import { Router, Request, Response } from "express";
import { db } from "./db";
import { adCampaigns, adCreatives, adImpressions } from "@workspace/db";
import { eq, desc, and, sql, gte, lte, or } from "drizzle-orm";
import { isAuthenticated } from "./multiAuth";
import { ObjectStorageService, canAccessObject, ObjectPermission } from "./replit_integrations/object_storage";

const objectStorageService = new ObjectStorageService();
const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/webm", "audio/ogg", "audio/mp4", "audio/x-m4a"];
const MAX_AD_AUDIO_SIZE = 20 * 1024 * 1024;

export function registerSelfServeAdRoutes(app: any) {
  const router = Router();

  router.get("/campaigns", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const campaigns = await db.select().from(adCampaigns)
      .where(eq(adCampaigns.advertiserId, user.id))
      .orderBy(desc(adCampaigns.createdAt));
    res.json(campaigns);
  });

  router.post("/campaigns", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const { name, description, budgetCents, cpmBidCents, targetGenres, targetTimeSlots, startDate, endDate } = req.body;

    if (!name || typeof name !== "string" || name.trim().length < 1) {
      return res.status(400).json({ error: "Campaign name is required" });
    }
    if (!budgetCents || budgetCents < 100) {
      return res.status(400).json({ error: "Minimum budget is $1.00" });
    }
    if (!cpmBidCents || cpmBidCents < 50) {
      return res.status(400).json({ error: "Minimum CPM bid is $0.50" });
    }

    const [campaign] = await db.insert(adCampaigns).values({
      advertiserId: user.id,
      name: name.trim(),
      description: description?.trim() || null,
      status: "draft",
      budgetCents,
      cpmBidCents,
      targetGenres: targetGenres || null,
      targetTimeSlots: targetTimeSlots || null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    }).returning();

    res.json(campaign);
  });

  router.get("/campaigns/:id", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const [campaign] = await db.select().from(adCampaigns)
      .where(and(eq(adCampaigns.id, req.params.id), eq(adCampaigns.advertiserId, user.id)))
      .limit(1);

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    res.json(campaign);
  });

  router.patch("/campaigns/:id", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const [existing] = await db.select().from(adCampaigns)
      .where(and(eq(adCampaigns.id, req.params.id), eq(adCampaigns.advertiserId, user.id)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Campaign not found" });

    const updates: any = { updatedAt: new Date() };
    if (req.body.name) updates.name = req.body.name.trim();
    if (req.body.description !== undefined) updates.description = req.body.description?.trim() || null;
    if (req.body.budgetCents) updates.budgetCents = req.body.budgetCents;
    if (req.body.cpmBidCents) updates.cpmBidCents = req.body.cpmBidCents;
    if (req.body.targetGenres !== undefined) updates.targetGenres = req.body.targetGenres;
    if (req.body.targetTimeSlots !== undefined) updates.targetTimeSlots = req.body.targetTimeSlots;
    if (req.body.startDate !== undefined) updates.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    if (req.body.endDate !== undefined) updates.endDate = req.body.endDate ? new Date(req.body.endDate) : null;

    const [updated] = await db.update(adCampaigns)
      .set(updates)
      .where(eq(adCampaigns.id, req.params.id))
      .returning();

    res.json(updated);
  });

  router.post("/campaigns/:id/submit", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const [campaign] = await db.select().from(adCampaigns)
      .where(and(eq(adCampaigns.id, req.params.id), eq(adCampaigns.advertiserId, user.id)))
      .limit(1);

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const creatives = await db.select().from(adCreatives)
      .where(eq(adCreatives.campaignId, campaign.id));

    if (creatives.length === 0) {
      return res.status(400).json({ error: "Add at least one ad creative before submitting" });
    }

    const [updated] = await db.update(adCampaigns)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(adCampaigns.id, campaign.id))
      .returning();

    await db.update(adCreatives)
      .set({ status: "approved" })
      .where(eq(adCreatives.campaignId, campaign.id));

    res.json(updated);
  });

  router.post("/campaigns/:id/pause", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const [campaign] = await db.select().from(adCampaigns)
      .where(and(eq(adCampaigns.id, req.params.id), eq(adCampaigns.advertiserId, user.id)))
      .limit(1);

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const newStatus = campaign.status === "paused" ? "active" : "paused";
    const [updated] = await db.update(adCampaigns)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(adCampaigns.id, campaign.id))
      .returning();

    res.json(updated);
  });

  router.delete("/campaigns/:id", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const [campaign] = await db.select().from(adCampaigns)
      .where(and(eq(adCampaigns.id, req.params.id), eq(adCampaigns.advertiserId, user.id)))
      .limit(1);

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    await db.delete(adCampaigns).where(eq(adCampaigns.id, campaign.id));
    res.json({ success: true });
  });

  router.get("/campaigns/:id/creatives", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const [campaign] = await db.select().from(adCampaigns)
      .where(and(eq(adCampaigns.id, req.params.id), eq(adCampaigns.advertiserId, user.id)))
      .limit(1);

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const creatives = await db.select().from(adCreatives)
      .where(eq(adCreatives.campaignId, campaign.id))
      .orderBy(desc(adCreatives.createdAt));

    res.json(creatives);
  });

  router.post("/campaigns/:id/creatives", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const [campaign] = await db.select().from(adCampaigns)
      .where(and(eq(adCampaigns.id, req.params.id), eq(adCampaigns.advertiserId, user.id)))
      .limit(1);

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const { name, audioUrl, duration, mimeType, fileSize, isRecorded, clickThroughUrl, companionImageUrl } = req.body;

    if (!name || !audioUrl) {
      return res.status(400).json({ error: "Name and audio URL are required" });
    }

    const [creative] = await db.insert(adCreatives).values({
      campaignId: campaign.id,
      name: name.trim(),
      audioUrl,
      duration: duration || 0,
      mimeType: mimeType || "audio/mpeg",
      fileSize: fileSize || null,
      isRecorded: isRecorded || false,
      clickThroughUrl: clickThroughUrl?.trim() || null,
      companionImageUrl: companionImageUrl?.trim() || null,
      status: "pending",
    }).returning();

    res.json(creative);
  });

  router.delete("/campaigns/:campaignId/creatives/:creativeId", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const [campaign] = await db.select().from(adCampaigns)
      .where(and(eq(adCampaigns.id, req.params.campaignId), eq(adCampaigns.advertiserId, user.id)))
      .limit(1);

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    await db.delete(adCreatives).where(
      and(eq(adCreatives.id, req.params.creativeId), eq(adCreatives.campaignId, campaign.id))
    );

    res.json({ success: true });
  });

  router.post("/upload-url", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId: string | undefined = user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { fileName, contentType, fileSize } = req.body;

      if (!fileName || !contentType) {
        return res.status(400).json({ error: "fileName and contentType required" });
      }

      if (!ALLOWED_AUDIO_TYPES.includes(contentType)) {
        return res.status(400).json({ error: "Unsupported audio format. Use MP3, WAV, OGG, or WebM." });
      }

      if (fileSize && fileSize > MAX_AD_AUDIO_SIZE) {
        return res.status(400).json({ error: "File too large. Maximum 20MB." });
      }

      const uploadUrl = await objectStorageService.getObjectEntityUploadURL(userId);

      res.json({
        uploadUrl,
      });
    } catch (err) {
      req.log?.error({ err }, "[SelfServeAds] Upload URL error");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Serve ad audio creatives. Authentication is required; the path must resolve
  // to an owner-scoped upload (uploads/u_<b64>/...) so arbitrary private objects
  // cannot be reached through this route.
  router.get("/audio/*path", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const rawSubpath: string = req.params[0] ?? "";

      // Restrict to owner-scoped upload paths only. This prevents this route
      // from being used to access arbitrary private objects (e.g. covers/).
      if (!rawSubpath.startsWith("uploads/u_")) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const objectPath = "/objects/" + rawSubpath;
      const requesterId: string | undefined = (req.user as any)?.id;

      // Verify the requester owns this upload (path-encoded owner check).
      const ownerFromPath = objectStorageService.getUploadOwnerFromObjectPath(objectPath);

      if (ownerFromPath === null) {
        // Owner could not be decoded from the path (malformed or legacy format).
        // Deny by default — all uploads via this route must use the
        // owner-scoped `uploads/u_<b64>/<uuid>` format.
        return res.status(403).json({ error: "Forbidden" });
      }

      if (ownerFromPath !== requesterId) {
        // Non-owner: check ACL before serving (e.g. shared/approved creative).
        const file = await objectStorageService.getObjectEntityFile(objectPath);
        const allowed = await canAccessObject({
          userId: requesterId,
          objectFile: file,
          requestedPermission: ObjectPermission.READ,
        });
        if (!allowed) {
          return res.status(403).json({ error: "Forbidden" });
        }
        await objectStorageService.downloadObject(file, res, 86400);
        return;
      }

      // Requester is the owner.
      const file = await objectStorageService.getObjectEntityFile(objectPath);
      await objectStorageService.downloadObject(file, res, 86400);
    } catch (err: any) {
      if (err?.name === "ObjectNotFoundError") {
        return res.status(404).json({ error: "Audio not found" });
      }
      req.log?.error({ err }, "[SelfServeAds] Audio serve error");
      res.status(500).json({ error: "Failed to serve audio" });
    }
  });

  router.get("/campaigns/:id/stats", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const [campaign] = await db.select().from(adCampaigns)
      .where(and(eq(adCampaigns.id, req.params.id), eq(adCampaigns.advertiserId, user.id)))
      .limit(1);

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const impressionStats = await db.select({
      totalImpressions: sql<number>`COUNT(*)`,
      totalClicks: sql<number>`SUM(CASE WHEN ${adImpressions.clicked} THEN 1 ELSE 0 END)`,
      totalSpentCents: sql<number>`SUM(${adImpressions.costCents})`,
      completions: sql<number>`SUM(CASE WHEN ${adImpressions.completed} THEN 1 ELSE 0 END)`,
      q25: sql<number>`SUM(CASE WHEN ${adImpressions.quartile25} THEN 1 ELSE 0 END)`,
      q50: sql<number>`SUM(CASE WHEN ${adImpressions.quartile50} THEN 1 ELSE 0 END)`,
      q75: sql<number>`SUM(CASE WHEN ${adImpressions.quartile75} THEN 1 ELSE 0 END)`,
    }).from(adImpressions)
      .where(eq(adImpressions.campaignId, campaign.id));

    const stats = impressionStats[0] || {};

    res.json({
      impressions: Number(stats.totalImpressions) || 0,
      clicks: Number(stats.totalClicks) || 0,
      spent: Number(stats.totalSpentCents) || 0,
      completions: Number(stats.completions) || 0,
      quartile25: Number(stats.q25) || 0,
      quartile50: Number(stats.q50) || 0,
      quartile75: Number(stats.q75) || 0,
      budgetRemaining: campaign.budgetCents - campaign.spentCents,
      ctr: Number(stats.totalImpressions) > 0
        ? ((Number(stats.totalClicks) / Number(stats.totalImpressions)) * 100).toFixed(2) + "%"
        : "0%",
      completionRate: Number(stats.totalImpressions) > 0
        ? ((Number(stats.completions) / Number(stats.totalImpressions)) * 100).toFixed(1) + "%"
        : "0%",
    });
  });

  app.use("/api/self-serve-ads", router);
}

export async function selectSelfServeAd(
  adType: "preroll" | "midroll",
  contentGenre?: string,
): Promise<{
  campaignId: string;
  creativeId: string;
  audioUrl: string;
  mimeType: string;
  duration: number;
  title: string;
  advertiser: string;
  clickThroughUrl?: string;
  companionImageUrl?: string;
  cpmBidCents: number;
} | null> {
  const now = new Date();

  const eligibleCampaigns = await db.select().from(adCampaigns)
    .where(and(
      eq(adCampaigns.status, "active"),
      sql`${adCampaigns.spentCents} < ${adCampaigns.budgetCents}`,
      or(
        sql`${adCampaigns.startDate} IS NULL`,
        lte(adCampaigns.startDate, now),
      ),
      or(
        sql`${adCampaigns.endDate} IS NULL`,
        gte(adCampaigns.endDate, now),
      ),
    ))
    .orderBy(desc(adCampaigns.cpmBidCents));

  for (const campaign of eligibleCampaigns) {
    if (contentGenre && campaign.targetGenres && campaign.targetGenres.length > 0) {
      const genreMatch = campaign.targetGenres.some(g =>
        g.toLowerCase() === contentGenre.toLowerCase()
      );
      if (!genreMatch) continue;
    }

    const creatives = await db.select().from(adCreatives)
      .where(and(
        eq(adCreatives.campaignId, campaign.id),
        eq(adCreatives.status, "approved"),
      ));

    if (creatives.length === 0) continue;

    const creative = creatives[Math.floor(Math.random() * creatives.length)]!;

    return {
      campaignId: campaign.id,
      creativeId: creative.id,
      audioUrl: creative.audioUrl,
      mimeType: creative.mimeType,
      duration: creative.duration,
      title: creative.name,
      advertiser: campaign.name,
      clickThroughUrl: creative.clickThroughUrl || undefined,
      companionImageUrl: creative.companionImageUrl || undefined,
      cpmBidCents: campaign.cpmBidCents,
    };
  }

  return null;
}

/**
 * Select a self-serve display creative: finds active campaigns whose creatives
 * have a companion image (companionImageUrl). Returns null if none found.
 * Used by SelfServeAdProvider for the display waterfall leg.
 */
export async function selectSelfServeDisplayAd(
  contentGenre?: string,
): Promise<{
  campaignId: string;
  creativeId: string;
  title: string;
  advertiser: string;
  imageUrl: string;
  clickThrough?: string;
} | null> {
  const now = new Date();

  const eligibleCampaigns = await db.select().from(adCampaigns)
    .where(and(
      eq(adCampaigns.status, "active"),
      sql`${adCampaigns.spentCents} < ${adCampaigns.budgetCents}`,
      or(
        sql`${adCampaigns.startDate} IS NULL`,
        lte(adCampaigns.startDate, now),
      ),
      or(
        sql`${adCampaigns.endDate} IS NULL`,
        gte(adCampaigns.endDate, now),
      ),
    ))
    .orderBy(desc(adCampaigns.cpmBidCents));

  for (const campaign of eligibleCampaigns) {
    if (contentGenre && campaign.targetGenres && campaign.targetGenres.length > 0) {
      const genreMatch = campaign.targetGenres.some(g =>
        g.toLowerCase() === contentGenre.toLowerCase()
      );
      if (!genreMatch) continue;
    }

    const creatives = await db.select().from(adCreatives)
      .where(and(
        eq(adCreatives.campaignId, campaign.id),
        eq(adCreatives.status, "approved"),
        sql`${adCreatives.companionImageUrl} IS NOT NULL`,
      ));

    if (creatives.length === 0) continue;

    const creative = creatives[Math.floor(Math.random() * creatives.length)]!;
    if (!creative.companionImageUrl) continue;

    return {
      campaignId: campaign.id,
      creativeId: creative.id,
      title: creative.name,
      advertiser: campaign.name,
      imageUrl: creative.companionImageUrl,
      clickThrough: creative.clickThroughUrl || undefined,
    };
  }

  return null;
}

export async function recordImpression(
  campaignId: string,
  creativeId: string,
  userId?: string,
  adType: "preroll" | "midroll" = "preroll",
): Promise<string> {
  const campaign = await db.select().from(adCampaigns)
    .where(eq(adCampaigns.id, campaignId)).limit(1);

  if (!campaign[0]) throw new Error("Campaign not found");

  const costCents = Math.round(campaign[0].cpmBidCents / 1000);

  const [impression] = await db.insert(adImpressions).values({
    campaignId,
    creativeId,
    userId: userId || null,
    adType,
    costCents,
  }).returning();

  await db.update(adCampaigns).set({
    impressions: sql`${adCampaigns.impressions} + 1`,
    spentCents: sql`${adCampaigns.spentCents} + ${costCents}`,
  }).where(eq(adCampaigns.id, campaignId));

  const [updated] = await db.select().from(adCampaigns)
    .where(eq(adCampaigns.id, campaignId)).limit(1);

  if (updated && updated.spentCents >= updated.budgetCents) {
    await db.update(adCampaigns)
      .set({ status: "completed" })
      .where(eq(adCampaigns.id, campaignId));
  }

  return impression.id;
}

export async function recordImpressionEvent(
  impressionId: string,
  event: "click" | "quartile_25" | "quartile_50" | "quartile_75" | "completed",
) {
  const updates: any = {};
  if (event === "click") updates.clicked = true;
  if (event === "quartile_25") updates.quartile25 = true;
  if (event === "quartile_50") updates.quartile50 = true;
  if (event === "quartile_75") updates.quartile75 = true;
  if (event === "completed") updates.completed = true;

  await db.update(adImpressions)
    .set(updates)
    .where(eq(adImpressions.id, impressionId));

  if (event === "click") {
    const [imp] = await db.select().from(adImpressions)
      .where(eq(adImpressions.id, impressionId)).limit(1);
    if (imp) {
      await db.update(adCampaigns)
        .set({ clicks: sql`${adCampaigns.clicks} + 1` })
        .where(eq(adCampaigns.id, imp.campaignId));
    }
  }
}
