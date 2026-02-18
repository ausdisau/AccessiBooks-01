import type { Express, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { eq, desc, sql, and, ilike, or } from "drizzle-orm";
import { podcastFeeds, podcastEpisodes } from "@shared/schema";
import { z } from "zod";
import { fetchAndParseRSS } from "./rss";
import { randomUUID } from "crypto";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment." },
    });
  }
  next();
}

function requestId(req: Request, _res: Response, next: NextFunction) {
  (req as any).requestId = randomUUID().slice(0, 8);
  next();
}

function log(reqId: string, message: string, data?: any) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${reqId}] ${message}`, data ? JSON.stringify(data) : "");
}

const ingestBodySchema = z.object({
  feedUrl: z.string().url("Must be a valid URL"),
});

const batchIngestSchema = z.object({
  feedUrls: z.array(z.string().url()).min(1).max(50),
});

async function ingestFeed(feedUrl: string, reqId: string): Promise<{
  feedId: string;
  title: string;
  episodesUpserted: number;
  status: "created" | "updated" | "not_modified";
}> {
  log(reqId, "Starting ingestion", { feedUrl });

  const [existing] = await db.select().from(podcastFeeds).where(eq(podcastFeeds.feedUrl, feedUrl));

  const result = await fetchAndParseRSS(feedUrl, existing?.etag, existing?.lastModified);

  if (result === "not_modified") {
    log(reqId, "Feed not modified (304)");
    await db.update(podcastFeeds)
      .set({ lastFetchedAt: new Date() })
      .where(eq(podcastFeeds.feedUrl, feedUrl));
    return {
      feedId: existing!.id,
      title: existing!.title,
      episodesUpserted: 0,
      status: "not_modified",
    };
  }

  const { feed, episodes, etag, lastModified } = result;

  let feedId: string;
  let status: "created" | "updated";

  if (existing) {
    await db.update(podcastFeeds).set({
      title: feed.title,
      description: feed.description,
      imageUrl: feed.imageUrl,
      author: feed.author,
      language: feed.language,
      websiteUrl: feed.websiteUrl,
      categories: feed.categories,
      etag,
      lastModified,
      lastFetchedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(podcastFeeds.id, existing.id));
    feedId = existing.id;
    status = "updated";
  } else {
    const [created] = await db.insert(podcastFeeds).values({
      feedUrl,
      title: feed.title,
      description: feed.description,
      imageUrl: feed.imageUrl,
      author: feed.author,
      language: feed.language,
      websiteUrl: feed.websiteUrl,
      categories: feed.categories,
      etag,
      lastModified,
      lastFetchedAt: new Date(),
    }).returning();
    feedId = created.id;
    status = "created";
  }

  let upsertedCount = 0;

  for (const ep of episodes) {
    const identifier = ep.guid
      ? and(eq(podcastEpisodes.feedId, feedId), eq(podcastEpisodes.guid, ep.guid))
      : and(eq(podcastEpisodes.feedId, feedId), eq(podcastEpisodes.audioUrl, ep.audioUrl));

    const [existingEp] = await db.select({ id: podcastEpisodes.id })
      .from(podcastEpisodes)
      .where(identifier!);

    if (existingEp) {
      await db.update(podcastEpisodes).set({
        title: ep.title,
        descriptionText: ep.descriptionText,
        descriptionHtml: ep.descriptionHtml,
        pubDate: ep.pubDate,
        durationSeconds: ep.durationSeconds,
        audioUrl: ep.audioUrl,
        audioType: ep.audioType,
        audioLengthBytes: ep.audioLengthBytes,
        explicit: ep.explicit,
        updatedAt: new Date(),
      }).where(eq(podcastEpisodes.id, existingEp.id));
    } else {
      await db.insert(podcastEpisodes).values({
        feedId,
        guid: ep.guid,
        title: ep.title,
        descriptionText: ep.descriptionText,
        descriptionHtml: ep.descriptionHtml,
        pubDate: ep.pubDate,
        durationSeconds: ep.durationSeconds,
        audioUrl: ep.audioUrl,
        audioType: ep.audioType,
        audioLengthBytes: ep.audioLengthBytes,
        explicit: ep.explicit,
        transcriptStatus: "none",
      });
    }
    upsertedCount++;
  }

  log(reqId, "Ingestion complete", { feedId, title: feed.title, episodes: upsertedCount, status });

  return { feedId, title: feed.title, episodesUpserted: upsertedCount, status };
}

export function registerPodcastRoutes(app: Express) {
  app.use("/api/podcasts", requestId);
  app.use("/api/podcasts", rateLimiter);
  app.use("/api/ingest", requestId);
  app.use("/api/ingest", rateLimiter);

  app.post("/api/ingest", async (req: any, res) => {
    const reqId = req.requestId || "?";
    try {
      const parsed = ingestBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Invalid input" },
        });
      }

      const result = await ingestFeed(parsed.data.feedUrl, reqId);
      res.json(result);
    } catch (error: any) {
      log(reqId, "Ingestion failed", { error: error.message });
      const message = error.message || "Ingestion failed";
      const status = message.includes("HTTP 4") || message.includes("HTTP 5") ? 502 : 500;
      res.status(status).json({
        error: { code: "INGESTION_FAILED", message },
      });
    }
  });

  app.post("/api/ingest/batch", async (req: any, res) => {
    const reqId = req.requestId || "?";
    try {
      const parsed = batchIngestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Invalid input" },
        });
      }

      const results = [];
      for (const feedUrl of parsed.data.feedUrls) {
        try {
          const result = await ingestFeed(feedUrl, reqId);
          results.push({ feedUrl, ...result });
        } catch (error: any) {
          log(reqId, "Batch item failed", { feedUrl, error: error.message });
          results.push({ feedUrl, error: error.message });
        }
      }

      res.json({ results });
    } catch (error: any) {
      res.status(500).json({
        error: { code: "BATCH_FAILED", message: error.message || "Batch ingestion failed" },
      });
    }
  });

  app.get("/api/podcasts/feeds", async (req: any, res) => {
    const reqId = req.requestId || "?";
    try {
      const q = (req.query.q as string) || "";
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      let query = db.select().from(podcastFeeds);

      if (q.trim()) {
        query = query.where(
          or(
            ilike(podcastFeeds.title, `%${q}%`),
            ilike(podcastFeeds.author, `%${q}%`)
          )
        ) as any;
      }

      const feeds = await (query as any)
        .orderBy(desc(podcastFeeds.updatedAt))
        .limit(limit)
        .offset(offset);

      res.json({ feeds, limit, offset });
    } catch (error: any) {
      log(reqId, "Error listing feeds", { error: error.message });
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list feeds" } });
    }
  });

  app.get("/api/podcasts/feeds/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const [feed] = await db.select().from(podcastFeeds).where(eq(podcastFeeds.id, id));
      if (!feed) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Feed not found" } });
      }

      const episodeCount = await db.select({ count: sql<number>`COUNT(*)` })
        .from(podcastEpisodes)
        .where(eq(podcastEpisodes.feedId, id));

      res.json({ ...feed, episodeCount: episodeCount[0]?.count || 0 });
    } catch (error: any) {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch feed" } });
    }
  });

  app.get("/api/podcasts/feeds/:id/episodes", async (req: any, res) => {
    try {
      const { id } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const [feed] = await db.select({ id: podcastFeeds.id }).from(podcastFeeds).where(eq(podcastFeeds.id, id));
      if (!feed) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Feed not found" } });
      }

      const episodes = await db.select().from(podcastEpisodes)
        .where(eq(podcastEpisodes.feedId, id))
        .orderBy(desc(podcastEpisodes.pubDate))
        .limit(limit)
        .offset(offset);

      res.json({ episodes, limit, offset });
    } catch (error: any) {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch episodes" } });
    }
  });

  app.get("/api/podcasts/episodes/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const [episode] = await db.select().from(podcastEpisodes).where(eq(podcastEpisodes.id, id));
      if (!episode) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Episode not found" } });
      }

      const [feed] = await db.select({
        id: podcastFeeds.id,
        title: podcastFeeds.title,
        imageUrl: podcastFeeds.imageUrl,
        author: podcastFeeds.author,
      }).from(podcastFeeds).where(eq(podcastFeeds.id, episode.feedId));

      res.json({ ...episode, feed: feed || null });
    } catch (error: any) {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch episode" } });
    }
  });
}
