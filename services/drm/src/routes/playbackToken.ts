import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import pool from "../db/neon";
import type { PlaybackTokenResponse, JWTClaims } from "@accessibooks/shared";

const router = Router();

const PlaybackTokenRequestSchema = z.object({
  userId: z.string().uuid(),
  titleId: z.string().uuid(),
});

const DRM_SIGNING_SECRET = process.env.DRM_SIGNING_SECRET || "dev-secret-change-me";
const DRM_BASE_URL = process.env.DRM_BASE_URL || `http://localhost:${process.env.DRM_PORT || 4000}`;

router.post("/api/playback/token", async (req, res) => {
  try {
    const parsed = PlaybackTokenRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.errors });
    }

    const { userId, titleId } = parsed.data;

    const entitlementResult = await pool.query(
      `SELECT id, user_id, title_id, access_type, expires_at, max_concurrent_streams, offline_allowed
       FROM entitlements WHERE user_id = $1 AND title_id = $2 LIMIT 1`,
      [userId, titleId]
    );

    if (entitlementResult.rows.length === 0) {
      return res.status(403).json({ error: "NO_ENTITLEMENT", message: "No entitlement found for this title" });
    }

    const entitlement = entitlementResult.rows[0];

    if (entitlement.expires_at && new Date(entitlement.expires_at) < new Date()) {
      return res.status(403).json({ error: "ENTITLEMENT_EXPIRED", message: "Entitlement has expired" });
    }

    const titleResult = await pool.query(
      `SELECT id, name, manifest_url, drm_enabled FROM titles WHERE id = $1`,
      [titleId]
    );

    if (titleResult.rows.length === 0) {
      return res.status(404).json({ error: "TITLE_NOT_FOUND", message: "Title not found" });
    }

    const title = titleResult.rows[0];

    const activeSessionsResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM stream_sessions
       WHERE user_id = $1 AND active = true AND last_heartbeat > NOW() - INTERVAL '120 seconds'`,
      [userId]
    );

    const activeCount = activeSessionsResult.rows[0].count;

    if (activeCount >= entitlement.max_concurrent_streams) {
      return res.status(429).json({
        error: "CONCURRENCY_EXCEEDED",
        message: "Too many active streams",
        activeStreams: activeCount,
        maxAllowed: entitlement.max_concurrent_streams,
      });
    }

    const sessionResult = await pool.query(
      `INSERT INTO stream_sessions (user_id, title_id) VALUES ($1, $2) RETURNING id`,
      [userId, titleId]
    );

    const sessionId = sessionResult.rows[0].id;

    const expiresAtEpoch = entitlement.expires_at
      ? new Date(entitlement.expires_at).getTime()
      : null;

    const payload = {
      sub: userId,
      tid: titleId,
      sid: sessionId,
      policy: {
        offline: entitlement.offline_allowed,
        max_concurrent: entitlement.max_concurrent_streams,
        entitlement_expiry: expiresAtEpoch,
      },
    };

    const token = jwt.sign(payload, DRM_SIGNING_SECRET, {
      expiresIn: "10m",
      algorithm: "HS256",
    });

    const decoded = jwt.decode(token) as JWTClaims;

    const response: PlaybackTokenResponse = {
      token,
      manifestUrl: title.manifest_url,
      licenseUrl: `${DRM_BASE_URL}/drm/widevine/license`,
      expiresAt: decoded.exp * 1000,
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error("[DRM] playback token error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Internal server error" });
  }
});

export default router;
