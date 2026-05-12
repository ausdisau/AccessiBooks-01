import type { Express, Request, Response } from "express";
import { db } from "./db";
import { z } from "zod";
import { eq, and, desc, sql, gte, lte, inArray, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  bulletinTopics, bulletinThreads, bulletinReplies, bulletinReactions,
  liveEvents, eventRsvps, eventChatMessages, shareClips,
  insertBulletinThreadSchema, insertBulletinReplySchema,
  insertLiveEventSchema, insertShareClipSchema,
  contentReports, users, userStreaks, userXp, userAchievements,
  dailyListeningLog, accessibilityPreferences, listeningHistory,
  type A11yProfile,
} from "@shared/schema";
import { isAuthenticated } from "./multiAuth";
import { analyticsService } from "./analyticsService";

const MAX_PAGE = 50;

type ReqUser = { id?: string; role?: string; claims?: { sub?: string } } | undefined;

function reqUser(req: Request): ReqUser {
  return (req as Request & { user?: ReqUser }).user;
}

function userIdFrom(req: Request): string | null {
  const u = reqUser(req);
  return u?.id || u?.claims?.sub || null;
}

async function getUser(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return u;
}

async function getProfile(userId: string): Promise<A11yProfile | null> {
  try {
    const [p] = await db.select().from(accessibilityPreferences)
      .where(eq(accessibilityPreferences.userId, userId)).limit(1);
    return (p?.profile ?? null) as A11yProfile | null;
  } catch {
    return null;
  }
}

function isPaidTier(tier: string | null | undefined) {
  return tier === "plus" || tier === "premium" || tier === "institutional";
}

function isAdmin(req: Request) {
  return reqUser(req)?.role === "admin";
}

function requireAdmin(req: Request, res: Response, next: () => void) {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
  next();
}

// Auto-seed a small set of curated topics on boot if none exist.
export async function seedBulletinTopics() {
  try {
    const existing = await db.select({ c: sql<number>`count(*)` }).from(bulletinTopics);
    if (Number(existing[0]?.c ?? 0) > 0) return;
    await db.insert(bulletinTopics).values([
      { slug: "announcements", name: "Announcements", description: "Release notes and platform news", iconEmoji: "📣", sortOrder: 0 },
      { slug: "currently-reading", name: "Currently Reading", description: "What are you listening to right now?", iconEmoji: "📖", sortOrder: 10 },
      { slug: "accessibility-tips", name: "Accessibility Tips", description: "Share what works for you", iconEmoji: "♿", sortOrder: 20, isAccessibilityCategory: true },
      { slug: "author-spotlights", name: "Author Spotlights", description: "Featured authors and recommendations", iconEmoji: "✍️", sortOrder: 30 },
      { slug: "early-access", name: "Early Access Discussion", description: "Premium-only previews and previews", iconEmoji: "🔒", sortOrder: 40, premiumOnlyView: true, premiumOnlyPost: true },
    ]);
    console.log("[Engagement] Seeded bulletin topics");
  } catch (err: any) {
    console.warn("[Engagement] seedBulletinTopics skipped:", err?.message);
  }
}

const threadInputSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(3).max(240),
  body: z.string().min(1).max(8000),
});

const replyInputSchema = z.object({
  body: z.string().min(1).max(4000),
  parentReplyId: z.string().optional(),
});

const reactionInputSchema = z.object({
  targetType: z.enum(["thread", "reply"]),
  targetId: z.string().min(1),
  emoji: z.string().max(16).default("👍"),
});

const eventInputSchema = z.object({
  eventType: z.enum(["author_qa", "group_listen", "launch_party", "community_ama"]),
  title: z.string().min(3).max(240),
  description: z.string().min(1).max(4000),
  bookId: z.string().optional(),
  bookTitle: z.string().optional(),
  scheduledStartAt: z.string(),
  scheduledEndAt: z.string(),
  freeReplayPreviewSeconds: z.number().int().min(0).max(7200).optional(),
});

const clipInputSchema = z.object({
  bookId: z.string().min(1),
  bookTitle: z.string().min(1),
  startSec: z.number().int().min(0),
  endSec: z.number().int().min(1),
  quote: z.string().max(500).optional(),
  hideAttribution: z.boolean().optional(),
}).refine((d) => d.endSec > d.startSec && (d.endSec - d.startSec) <= 60 && (d.endSec - d.startSec) >= 15, {
  message: "Clip must be 15–60 seconds long",
});

export function registerEngagementRoutes(app: Express) {
  // ───────────────── BULLETIN ─────────────────

  app.get("/api/bulletin/topics", async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req);
      const user = userId ? await getUser(userId) : null;
      const paid = isPaidTier(user?.subscriptionTier);
      const topics = await db.select().from(bulletinTopics)
        .where(eq(bulletinTopics.isActive, true))
        .orderBy(bulletinTopics.sortOrder);
      res.json({
        topics: topics.map(t => ({
          ...t,
          canPost: !t.premiumOnlyPost || paid,
          canView: !t.premiumOnlyView || paid,
        })),
      });
    } catch (err: any) {
      console.error("[Bulletin] topics error:", err?.message);
      res.json({ topics: [] });
    }
  });

  app.get("/api/bulletin/threads", async (req: Request, res: Response) => {
    try {
      const topicId = (req.query.topicId as string) || undefined;
      const page = Math.max(1, parseInt((req.query.page as string) || "1"));
      const pageSize = Math.min(MAX_PAGE, parseInt((req.query.pageSize as string) || "20"));
      const offset = (page - 1) * pageSize;

      const userId = userIdFrom(req);
      const user = userId ? await getUser(userId) : null;
      const paid = isPaidTier(user?.subscriptionTier);

      // Block access to premium-only-view topics for free users
      if (topicId) {
        const [t] = await db.select().from(bulletinTopics).where(eq(bulletinTopics.id, topicId)).limit(1);
        if (!t) return res.status(404).json({ message: "Topic not found" });
        if (t.premiumOnlyView && !paid) {
          return res.status(200).json({
            threads: [],
            page, pageSize, total: 0,
            premiumGated: true,
            upgradeReason: "This topic is for Plus and Premium members.",
          });
        }
      }

      // Exclude threads in premium-only-view topics from list/aggregate reads
      // when the caller isn't on a paid tier. Without this, free users could
      // fetch full premium thread bodies via the no-topic listing.
      const premiumExclusion = paid
        ? sql`TRUE`
        : sql`${bulletinThreads.topicId} NOT IN (SELECT id FROM ${bulletinTopics} WHERE ${bulletinTopics.premiumOnlyView} = TRUE)`;
      const baseWhere = topicId
        ? and(eq(bulletinThreads.topicId, topicId), premiumExclusion)
        : premiumExclusion;
      const rows = await db.select().from(bulletinThreads)
        .where(baseWhere)
        .orderBy(desc(bulletinThreads.isPinned), desc(bulletinThreads.lastActivityAt))
        .limit(pageSize)
        .offset(offset);

      const totalRow = await db.select({ c: sql<number>`count(*)` }).from(bulletinThreads)
        .where(baseWhere);
      const total = Number(totalRow[0]?.c ?? 0);

      res.json({ threads: rows, page, pageSize, total, hasMore: offset + rows.length < total });
    } catch (err: any) {
      console.error("[Bulletin] threads error:", err?.message);
      res.json({ threads: [], page: 1, pageSize: 20, total: 0, hasMore: false });
    }
  });

  app.get("/api/bulletin/threads/:id", async (req: Request, res: Response) => {
    try {
      const [thread] = await db.select().from(bulletinThreads).where(eq(bulletinThreads.id, req.params.id)).limit(1);
      if (!thread) return res.status(404).json({ message: "Not found" });

      // Enforce premium-view gating on direct thread access
      const [topic] = await db.select().from(bulletinTopics).where(eq(bulletinTopics.id, thread.topicId)).limit(1);
      if (topic?.premiumOnlyView) {
        const userId = userIdFrom(req);
        const u = userId ? await getUser(userId) : null;
        if (!isPaidTier(u?.subscriptionTier)) {
          return res.status(403).json({ message: "This thread is for Plus and Premium members.", requiresUpgrade: true });
        }
      }

      // Suppress moderator-hidden replies from public reads.
      const replies = await db.select().from(bulletinReplies)
        .where(and(eq(bulletinReplies.threadId, thread.id), isNull(bulletinReplies.hiddenAt)))
        .orderBy(bulletinReplies.createdAt);
      res.json({ thread, replies });
    } catch (err: any) {
      console.error("[Bulletin] thread detail error:", err?.message);
      res.status(500).json({ message: "Failed to load thread" });
    }
  });

  app.post("/api/bulletin/threads", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req)!;
      const parsed = threadInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.errors });

      const [topic] = await db.select().from(bulletinTopics).where(eq(bulletinTopics.id, parsed.data.topicId)).limit(1);
      if (!topic) return res.status(404).json({ message: "Topic not found" });

      const user = await getUser(userId);
      const paid = isPaidTier(user?.subscriptionTier);
      if (topic.premiumOnlyPost && !paid) {
        return res.status(403).json({ message: "This topic is for Plus and Premium members.", requiresUpgrade: true });
      }
      if (topic.slug === "announcements" && !isAdmin(req)) {
        return res.status(403).json({ message: "Only admins can post announcements" });
      }

      const displayName = user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : (user?.email ?? "Member");
      const [thread] = await db.insert(bulletinThreads).values({
        topicId: topic.id,
        authorUserId: userId,
        authorDisplayName: displayName,
        kind: topic.slug === "announcements" ? "announcement" : "discussion",
        title: parsed.data.title,
        body: parsed.data.body,
      }).returning();

      analyticsService.track("bulletin_thread_created", user?.subscriptionTier ?? "free", { topicId: topic.id });
      res.json({ thread });
    } catch (err: any) {
      console.error("[Bulletin] create thread error:", err?.message);
      res.status(500).json({ message: "Failed to create thread" });
    }
  });

  app.post("/api/bulletin/threads/:id/replies", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req)!;
      const parsed = replyInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

      const [thread] = await db.select().from(bulletinThreads).where(eq(bulletinThreads.id, req.params.id)).limit(1);
      if (!thread) return res.status(404).json({ message: "Thread not found" });
      if (thread.isLocked) return res.status(403).json({ message: "Thread is locked" });

      // Enforce premium-post gating on the parent topic for replies as well
      const [topic] = await db.select().from(bulletinTopics).where(eq(bulletinTopics.id, thread.topicId)).limit(1);
      const userForGate = await getUser(userId);
      if (topic?.premiumOnlyView && !isPaidTier(userForGate?.subscriptionTier)) {
        return res.status(403).json({ message: "This thread is for Plus and Premium members.", requiresUpgrade: true });
      }
      if (topic?.premiumOnlyPost && !isPaidTier(userForGate?.subscriptionTier)) {
        return res.status(403).json({ message: "Replying in this topic is for Plus and Premium members.", requiresUpgrade: true });
      }

      const user = userForGate;
      const displayName = user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : (user?.email ?? "Member");

      const [reply] = await db.insert(bulletinReplies).values({
        threadId: thread.id,
        parentReplyId: parsed.data.parentReplyId ?? null,
        authorUserId: userId,
        authorDisplayName: displayName,
        body: parsed.data.body,
      }).returning();

      await db.update(bulletinThreads)
        .set({ replyCount: sql`${bulletinThreads.replyCount} + 1`, lastActivityAt: new Date() })
        .where(eq(bulletinThreads.id, thread.id));

      analyticsService.track("bulletin_reply_created", user?.subscriptionTier ?? "free", { threadId: thread.id });
      res.json({ reply });
    } catch (err: any) {
      console.error("[Bulletin] create reply error:", err?.message);
      res.status(500).json({ message: "Failed to post reply" });
    }
  });

  app.post("/api/bulletin/react", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req)!;
      const parsed = reactionInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

      // Toggle: if exists, remove; else insert
      const existing = await db.select().from(bulletinReactions).where(and(
        eq(bulletinReactions.userId, userId),
        eq(bulletinReactions.targetType, parsed.data.targetType),
        eq(bulletinReactions.targetId, parsed.data.targetId),
        eq(bulletinReactions.emoji, parsed.data.emoji),
      )).limit(1);

      let action: "added" | "removed";
      if (existing.length > 0) {
        await db.delete(bulletinReactions).where(eq(bulletinReactions.id, existing[0].id));
        action = "removed";
      } else {
        await db.insert(bulletinReactions).values({
          userId,
          targetType: parsed.data.targetType,
          targetId: parsed.data.targetId,
          emoji: parsed.data.emoji,
        });
        action = "added";
      }

      const delta = action === "added" ? 1 : -1;
      if (parsed.data.targetType === "thread") {
        await db.update(bulletinThreads)
          .set({ reactionCount: sql`GREATEST(0, ${bulletinThreads.reactionCount} + ${delta})` })
          .where(eq(bulletinThreads.id, parsed.data.targetId));
      } else {
        await db.update(bulletinReplies)
          .set({ reactionCount: sql`GREATEST(0, ${bulletinReplies.reactionCount} + ${delta})` })
          .where(eq(bulletinReplies.id, parsed.data.targetId));
      }
      res.json({ action });
    } catch (err: any) {
      console.error("[Bulletin] react error:", err?.message);
      res.status(500).json({ message: "Failed to react" });
    }
  });

  app.post("/api/bulletin/report", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req)!;
      const { targetType, targetId, reason } = req.body || {};
      if (!targetType || !targetId || !reason) return res.status(400).json({ message: "targetType, targetId, reason required" });

      try {
        await db.insert(contentReports).values({
          reporterId: userId,
          contentType: `bulletin_${targetType}`,
          contentId: String(targetId),
          reason: String(reason).slice(0, 200),
          status: "pending",
        });
      } catch (err: any) {
        console.error("[Bulletin] report insert failed:", err?.message);
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[Bulletin] report error:", err?.message);
      res.status(500).json({ message: "Failed to report" });
    }
  });

  // Admin moderation: hide a reply
  app.post("/api/bulletin/moderate/hide-reply/:id", isAuthenticated, requireAdmin, async (req: Request, res: Response) => {
    try {
      await db.update(bulletinReplies).set({ hiddenAt: new Date() }).where(eq(bulletinReplies.id, req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to hide reply" });
    }
  });

  // ───────────────── EVENTS ─────────────────

  // Helper: strip the full replayUrl from event rows for non-paid callers and
  // expose a server-mediated preview URL instead. The preview endpoint
  // (`/api/events/:id/replay/preview`) is the only path through which free
  // users can reach the replay media, so the paywall cannot be bypassed by
  // reading API responses directly.
  type LiveEventRow = typeof liveEvents.$inferSelect;
  type SanitizedEvent = LiveEventRow & { replayPreviewUrl: string | null };
  const sanitizeEventForTier = (event: LiveEventRow, paid: boolean): SanitizedEvent => {
    const hasReplay = event.status === "ended" && !!event.replayUrl;
    if (paid) {
      return { ...event, replayPreviewUrl: hasReplay ? event.replayUrl : null };
    }
    return {
      ...event,
      replayUrl: null,
      replayPreviewUrl: hasReplay ? `/api/events/${event.id}/replay/preview` : null,
    };
  };

  app.get("/api/events", async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req);
      const user = userId ? await getUser(userId) : null;
      const paid = isPaidTier(user?.subscriptionTier);
      const upcoming = await db.select().from(liveEvents)
        .where(inArray(liveEvents.status, ["scheduled", "live"]))
        .orderBy(liveEvents.scheduledStartAt)
        .limit(50);
      const past = await db.select().from(liveEvents)
        .where(eq(liveEvents.status, "ended"))
        .orderBy(desc(liveEvents.scheduledStartAt))
        .limit(20);
      res.json({
        upcoming: upcoming.map(e => sanitizeEventForTier(e, paid)),
        past: past.map(e => sanitizeEventForTier(e, paid)),
      });
    } catch (err: any) {
      console.error("[Events] list error:", err?.message);
      res.json({ upcoming: [], past: [] });
    }
  });

  app.get("/api/events/:id", async (req: Request, res: Response) => {
    try {
      const [event] = await db.select().from(liveEvents).where(eq(liveEvents.id, req.params.id)).limit(1);
      if (!event) return res.status(404).json({ message: "Event not found" });
      const userId = userIdFrom(req);
      let rsvped = false;
      if (userId) {
        const [r] = await db.select().from(eventRsvps)
          .where(and(eq(eventRsvps.eventId, event.id), eq(eventRsvps.userId, userId))).limit(1);
        rsvped = !!r;
      }

      const user = userId ? await getUser(userId) : null;
      const paid = isPaidTier(user?.subscriptionTier);

      // Replay gating — full URL only for paid; free callers get null + preview.
      let replayAccess: "none" | "preview" | "full" = "none";
      if (event.status === "ended" && event.replayUrl) {
        replayAccess = paid ? "full" : "preview";
      }

      res.json({
        event: sanitizeEventForTier(event, paid),
        rsvped,
        replayAccess,
        freeReplayPreviewSeconds: event.freeReplayPreviewSeconds,
      });
    } catch (err: any) {
      console.error("[Events] detail error:", err?.message);
      res.status(500).json({ message: "Failed to load event" });
    }
  });

  // Server-enforced replay preview proxy. The full replay URL is NEVER
  // exposed to the client — the server fetches the upstream media itself
  // and streams only the byte range corresponding to the configured
  // `freeReplayPreviewSeconds` window (computed from upstream
  // Content-Length × previewSec / scheduledDurationSec). The response
  // disables ranged requests so a free client can't ask for later bytes.
  app.get("/api/events/:id/replay/preview", async (req: Request, res: Response) => {
    try {
      const [event] = await db.select().from(liveEvents).where(eq(liveEvents.id, req.params.id)).limit(1);
      if (!event || event.status !== "ended" || !event.replayUrl) {
        return res.status(404).json({ message: "Replay preview unavailable" });
      }
      const previewSec = Math.max(30, event.freeReplayPreviewSeconds ?? 600);
      const scheduledMs =
        new Date(event.scheduledEndAt).getTime() - new Date(event.scheduledStartAt).getTime();
      const totalSec = Math.max(previewSec + 1, Math.floor(scheduledMs / 1000) || previewSec * 6);

      const head = await fetch(event.replayUrl, { method: "HEAD" });
      const totalBytesHeader = head.headers.get("content-length");
      const upstreamType = head.headers.get("content-type") ?? "audio/mpeg";

      let upstreamRes: globalThis.Response;
      if (totalBytesHeader) {
        const totalBytes = parseInt(totalBytesHeader, 10);
        const fraction = Math.min(1, previewSec / totalSec);
        const lastByte = Math.max(1024, Math.floor(totalBytes * fraction) - 1);
        upstreamRes = await fetch(event.replayUrl, { headers: { Range: `bytes=0-${lastByte}` } });
      } else {
        // No length advertised — fetch up to a safe cap (~previewSec @ 192kbps).
        const safeBytes = Math.floor((previewSec * 192_000) / 8);
        upstreamRes = await fetch(event.replayUrl, { headers: { Range: `bytes=0-${safeBytes - 1}` } });
      }

      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        return res.status(502).json({ message: "Preview source unavailable" });
      }

      // Strip headers that would leak the upstream URL or allow the client to
      // request later bytes; we serve a sealed preview blob.
      res.status(200);
      res.setHeader("Content-Type", upstreamType);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("Accept-Ranges", "none");
      res.setHeader("X-Replay-Preview", "true");

      if (!upstreamRes.body) return res.end();
      const reader = upstreamRes.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength) res.write(Buffer.from(value));
      }
      res.end();
    } catch (err: any) {
      console.error("[Events] preview proxy error:", err?.message);
      if (!res.headersSent) res.status(500).json({ message: "Failed to load preview" });
      else { try { res.end(); } catch { /* ignore */ } }
    }
  });

  app.post("/api/events", isAuthenticated, requireAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = eventInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.errors });
      const userId = userIdFrom(req)!;
      const user = await getUser(userId);

      const [event] = await db.insert(liveEvents).values({
        eventType: parsed.data.eventType,
        title: parsed.data.title,
        description: parsed.data.description,
        bookId: parsed.data.bookId ?? null,
        bookTitle: parsed.data.bookTitle ?? null,
        hostUserId: userId,
        hostDisplayName: user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : "AccessiBooks",
        scheduledStartAt: new Date(parsed.data.scheduledStartAt),
        scheduledEndAt: new Date(parsed.data.scheduledEndAt),
        status: "scheduled",
        freeReplayPreviewSeconds: parsed.data.freeReplayPreviewSeconds ?? 600,
      }).returning();

      res.json({ event });
    } catch (err: any) {
      console.error("[Events] create error:", err?.message);
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  app.post("/api/events/:id/rsvp", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req)!;
      const eventId = req.params.id;
      const [event] = await db.select().from(liveEvents).where(eq(liveEvents.id, eventId)).limit(1);
      if (!event) return res.status(404).json({ message: "Event not found" });

      const existing = await db.select().from(eventRsvps).where(and(
        eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId)
      )).limit(1);

      if (existing.length > 0) {
        await db.delete(eventRsvps).where(eq(eventRsvps.id, existing[0].id));
        await db.update(liveEvents)
          .set({ rsvpCount: sql`GREATEST(0, ${liveEvents.rsvpCount} - 1)` })
          .where(eq(liveEvents.id, eventId));
        return res.json({ rsvped: false });
      }

      await db.insert(eventRsvps).values({ eventId, userId });
      await db.update(liveEvents)
        .set({ rsvpCount: sql`${liveEvents.rsvpCount} + 1` })
        .where(eq(liveEvents.id, eventId));

      const u = await getUser(userId);
      analyticsService.track("event_rsvp", u?.subscriptionTier ?? "free", { eventId, eventType: event.eventType });
      res.json({ rsvped: true });
    } catch (err: any) {
      console.error("[Events] rsvp error:", err?.message);
      res.status(500).json({ message: "Failed to RSVP" });
    }
  });

  app.post("/api/events/:id/attend", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req)!;
      const eventId = req.params.id;
      const [r] = await db.select().from(eventRsvps).where(and(
        eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId)
      )).limit(1);
      let firstAttendance = false;
      if (!r) {
        await db.insert(eventRsvps).values({ eventId, userId, attendedAt: new Date() });
        firstAttendance = true;
      } else if (!r.attendedAt) {
        await db.update(eventRsvps).set({ attendedAt: new Date() }).where(eq(eventRsvps.id, r.id));
        firstAttendance = true;
      }
      // Idempotent: only increment counter on the first attendance mark
      if (firstAttendance) {
        await db.update(liveEvents)
          .set({ attendedCount: sql`${liveEvents.attendedCount} + 1` })
          .where(eq(liveEvents.id, eventId));
        const u = await getUser(userId);
        analyticsService.track("event_attended", u?.subscriptionTier ?? "free", { eventId });
      }
      res.json({ ok: true, firstAttendance });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to record attendance" });
    }
  });

  app.get("/api/events/:id/chat", async (req: Request, res: Response) => {
    try {
      const eventId = req.params.id;
      const limit = Math.min(MAX_PAGE, parseInt((req.query.limit as string) || "30"));
      const msgs = await db.select().from(eventChatMessages)
        .where(eq(eventChatMessages.eventId, eventId))
        .orderBy(desc(eventChatMessages.createdAt))
        .limit(limit);
      res.json({ messages: msgs.reverse() });
    } catch {
      res.json({ messages: [] });
    }
  });

  app.post("/api/events/:id/chat", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req)!;
      const eventId = req.params.id;
      const body = String(req.body?.body || "").trim().slice(0, 500);
      if (!body) return res.status(400).json({ message: "Empty message" });

      const u = await getUser(userId);
      const displayName = u?.firstName ? `${u.firstName} ${u.lastName ?? ""}`.trim() : (u?.email ?? "Member");

      // Slow-mode: 1 msg per 3s per user
      const recent = await db.select().from(eventChatMessages)
        .where(and(eq(eventChatMessages.eventId, eventId), eq(eventChatMessages.userId, userId)))
        .orderBy(desc(eventChatMessages.createdAt)).limit(1);
      if (recent[0]?.createdAt && Date.now() - new Date(recent[0].createdAt).getTime() < 3000) {
        return res.status(429).json({ message: "Please slow down — try again in a moment." });
      }

      const [msg] = await db.insert(eventChatMessages).values({
        eventId, userId, displayName, body,
      }).returning();
      res.json({ message: msg });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // ───────────────── HUB AGGREGATION ─────────────────

  app.get("/api/hub", async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req);
      const user = userId ? await getUser(userId) : null;
      const profile = userId ? await getProfile(userId) : null;
      const tier = user?.subscriptionTier ?? "free";

      // Pinned + recent threads (paginated, no infinite scroll). Premium-only
      // topics are excluded for free users so the hub aggregation cannot leak
      // gated thread bodies.
      const paid = isPaidTier(tier);
      const hubPremiumExclusion = paid
        ? sql`TRUE`
        : sql`${bulletinThreads.topicId} NOT IN (SELECT id FROM ${bulletinTopics} WHERE ${bulletinTopics.premiumOnlyView} = TRUE)`;
      const recentThreads = await db.select().from(bulletinThreads)
        .where(hubPremiumExclusion)
        .orderBy(desc(bulletinThreads.isPinned), desc(bulletinThreads.lastActivityAt))
        .limit(8);

      // Upcoming events (next 5)
      const upcomingEvents = await db.select().from(liveEvents)
        .where(inArray(liveEvents.status, ["scheduled", "live"]))
        .orderBy(liveEvents.scheduledStartAt)
        .limit(5);

      // Gamification card (welcome-back framing if streak broken & not in calm mode)
      let gamification: any = null;
      if (userId && !profile?.calmMode) {
        const [streak] = await db.select().from(userStreaks).where(eq(userStreaks.userId, userId)).limit(1);
        const [xp] = await db.select().from(userXp).where(eq(userXp.userId, userId)).limit(1);
        let framing: "active" | "welcome_back" | "paused" = "active";
        if (profile?.streakPaused) framing = "paused";
        else if (streak?.lastListenedDate) {
          const today = new Date().toISOString().slice(0, 10);
          const last = streak.lastListenedDate;
          const diff = Math.round((new Date(today).getTime() - new Date(last).getTime()) / 86400000);
          if (diff > 1) framing = "welcome_back";
        }
        gamification = {
          currentStreak: streak?.currentStreak ?? 0,
          longestStreak: streak?.longestStreak ?? 0,
          totalXp: xp?.totalXp ?? 0,
          level: xp?.level ?? 1,
          framing,
        };
      }

      // Trending books (anonymized aggregate — no per-user data exposed)
      // Privacy: never leak other users' listening history; aggregate counts only.
      let friendActivity: any[] = [];
      if (userId) {
        try {
          const trending = await db.execute(sql`
            SELECT book_id, book_title, book_author, COUNT(DISTINCT user_id) AS listeners
            FROM listening_history
            WHERE last_played_at >= NOW() - INTERVAL '7 days'
              AND user_id != ${userId}
            GROUP BY book_id, book_title, book_author
            HAVING COUNT(DISTINCT user_id) >= 2
            ORDER BY listeners DESC
            LIMIT 6
          `);
          const rows = (trending as unknown as { rows?: Array<{
            book_id: string; book_title: string; book_author: string; listeners: number | string;
          }> }).rows ?? [];
          friendActivity = rows.map(r => ({
            bookId: r.book_id, bookTitle: r.book_title, bookAuthor: r.book_author,
            listeners: Number(r.listeners),
          }));
        } catch (err: any) {
          console.warn("[Hub] trending query failed:", err?.message);
        }
      }

      // Weekly recap preview
      let weeklyRecap: any = null;
      if (userId) {
        try {
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          const wkAgoStr = weekAgo.toISOString().slice(0, 10);
          const logs = await db.select().from(dailyListeningLog)
            .where(and(eq(dailyListeningLog.userId, userId), gte(dailyListeningLog.date, wkAgoStr)));
          const totalMinutes = logs.reduce((s, l) => s + (l.minutesListened || 0), 0);
          const booksFinished = logs.reduce((s, l) => s + (l.booksCompleted || 0), 0);
          weeklyRecap = { totalMinutes, booksFinished, days: logs.length };
        } catch { /* ignore */ }
      }

      analyticsService.track("hub_visit", tier);

      res.json({
        recentThreads,
        upcomingEvents,
        gamification,
        friendActivity,
        weeklyRecap,
        plan: { tier, paid: isPaidTier(tier) },
      });
    } catch (err: any) {
      console.error("[Hub] error:", err?.message);
      res.json({ recentThreads: [], upcomingEvents: [], gamification: null, friendActivity: [], weeklyRecap: null, plan: { tier: "free", paid: false } });
    }
  });

  app.get("/api/recap/weekly", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req)!;
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const wkAgoStr = weekAgo.toISOString().slice(0, 10);
      const logs = await db.select().from(dailyListeningLog)
        .where(and(eq(dailyListeningLog.userId, userId), gte(dailyListeningLog.date, wkAgoStr)));
      const totalMinutes = logs.reduce((s, l) => s + (l.minutesListened || 0), 0);
      const booksFinished = logs.reduce((s, l) => s + (l.booksCompleted || 0), 0);
      const dayMap = new Map<string, number>();
      logs.forEach(l => dayMap.set(l.date, l.minutesListened || 0));
      res.json({ totalMinutes, booksFinished, perDay: Array.from(dayMap.entries()).map(([date, minutes]) => ({ date, minutes })) });
    } catch (err: any) {
      res.json({ totalMinutes: 0, booksFinished: 0, perDay: [] });
    }
  });

  // ───────────────── SHARE CLIPS ─────────────────

  app.post("/api/share/clip", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req)!;
      const parsed = clipInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid clip" });
      const user = await getUser(userId);
      const paid = isPaidTier(user?.subscriptionTier);

      const token = randomBytes(12).toString("hex");
      const [clip] = await db.insert(shareClips).values({
        userId,
        bookId: parsed.data.bookId,
        bookTitle: parsed.data.bookTitle,
        startSec: parsed.data.startSec,
        endSec: parsed.data.endSec,
        quote: parsed.data.quote ?? null,
        shareToken: token,
        hideAttribution: paid ? !!parsed.data.hideAttribution : false,
      }).returning();

      analyticsService.track("share_clip_generated", user?.subscriptionTier ?? "free", { bookId: parsed.data.bookId });

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      res.json({
        clip,
        shareUrl: `${baseUrl}/c/${token}`,
        attribution: clip.hideAttribution ? null : "Shared from AccessiBooks",
      });
    } catch (err: any) {
      console.error("[Share] clip error:", err?.message);
      res.status(500).json({ message: "Failed to create clip" });
    }
  });

  app.get("/api/share/clip/:token", async (req: Request, res: Response) => {
    try {
      const [clip] = await db.select().from(shareClips).where(eq(shareClips.shareToken, req.params.token)).limit(1);
      if (!clip) return res.status(404).json({ message: "Clip not found" });
      await db.update(shareClips).set({ viewCount: sql`${shareClips.viewCount} + 1` }).where(eq(shareClips.id, clip.id));
      res.json({ clip });
    } catch {
      res.status(500).json({ message: "Failed to load clip" });
    }
  });

  // ───────────────── UPGRADE NUDGE ─────────────────

  // Server-side decision: should we show the nudge? (Plan-aware, 30-day mute respected)
  app.post("/api/nudge/should-show", async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req);
      if (!userId) return res.json({ show: false });
      const user = await getUser(userId);
      if (isPaidTier(user?.subscriptionTier)) return res.json({ show: false, reason: "paid" });
      const profile = await getProfile(userId);
      if (profile?.calmMode) return res.json({ show: false, reason: "calm_mode" });
      if (profile?.hideUpgradeNudgesUntil) {
        const until = new Date(profile.hideUpgradeNudgesUntil);
        if (until.getTime() > Date.now()) return res.json({ show: false, reason: "muted_30d" });
      }
      // Task #64 guardrail: at most one upgrade nudge per session, globally
      // (not per surface). Backed by req.session so multi-tab/multi-surface
      // requests within the same session collapse to one impression even if
      // the client cap is bypassed.
      const sess = (req as any).session as undefined | { __nudgeShown?: boolean };
      if (sess?.__nudgeShown) return res.json({ show: false, reason: "session_capped" });
      if (sess) sess.__nudgeShown = true;
      analyticsService.track("upgrade_nudge_shown", user?.subscriptionTier ?? "free", { surface: req.body?.surface });
      res.json({ show: true });
    } catch {
      res.json({ show: false });
    }
  });

  app.post("/api/nudge/clicked", async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req);
      const user = userId ? await getUser(userId) : null;
      analyticsService.track("upgrade_nudge_clicked", user?.subscriptionTier ?? "free", { surface: req.body?.surface });
      res.json({ ok: true });
    } catch { res.json({ ok: true }); }
  });

  app.post("/api/nudge/dismiss", async (req: Request, res: Response) => {
    try {
      const userId = userIdFrom(req);
      const user = userId ? await getUser(userId) : null;
      analyticsService.track("upgrade_nudge_dismissed", user?.subscriptionTier ?? "free", { surface: req.body?.surface });
      res.json({ ok: true });
    } catch { res.json({ ok: true }); }
  });

  // ───────────────── ENGAGEMENT ANALYTICS (admin) ─────────────────

  app.get("/api/admin/analytics/engagement", isAuthenticated, requireAdmin, async (req: Request, res: Response) => {
    try {
      const days = Math.max(1, Math.min(90, parseInt((req.query.days as string) || "30")));
      const since = new Date();
      since.setDate(since.getDate() - days);

      const fetchEventCount = async (eventType: string) => {
        try {
          const r = await db.execute(sql`SELECT user_tier as tier, COUNT(*) AS cnt FROM product_events WHERE event_type = ${eventType} AND occurred_at >= ${since} GROUP BY user_tier`);
          const rows = (r as unknown as { rows?: Array<{ tier: string | null; cnt: number | string }> }).rows ?? [];
          const out: Record<string, number> = { free: 0, plus: 0, premium: 0 };
          rows.forEach(rr => { out[rr.tier ?? "free"] = Number(rr.cnt); });
          return { total: rows.reduce((s, x) => s + Number(x.cnt), 0), byTier: out };
        } catch (err: any) {
          console.warn(`[Engagement Analytics] ${eventType} query failed:`, err?.message);
          return { total: 0, byTier: { free: 0, plus: 0, premium: 0 } };
        }
      };

      const [hubVisits, threads, replies, rsvps, attended, clips, nudgesShown, nudgesClicked] = await Promise.all([
        fetchEventCount("hub_visit"),
        fetchEventCount("bulletin_thread_created"),
        fetchEventCount("bulletin_reply_created"),
        fetchEventCount("event_rsvp"),
        fetchEventCount("event_attended"),
        fetchEventCount("share_clip_generated"),
        fetchEventCount("upgrade_nudge_shown"),
        fetchEventCount("upgrade_nudge_clicked"),
      ]);

      res.json({
        days,
        hubVisits,
        threads, replies,
        rsvps, attended,
        clips,
        nudgesShown, nudgesClicked,
        nudgeConversionRate: nudgesShown.total > 0 ? nudgesClicked.total / nudgesShown.total : 0,
      });
    } catch (err: any) {
      console.error("[Engagement Analytics] error:", err?.message);
      res.json({ days: 30, hubVisits: { total: 0, byTier: {} } });
    }
  });
}
