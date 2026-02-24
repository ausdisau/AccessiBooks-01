import { Router } from "express";
import pool from "../db/neon";
import { verifyToken } from "../middleware/verifyToken";

const router = Router();

router.post("/drm/widevine/license", verifyToken, async (req, res) => {
  try {
    const { sub: userId, tid: titleId, sid: sessionId } = req.auth;

    const sessionResult = await pool.query(
      `SELECT id, user_id, title_id, active
       FROM stream_sessions WHERE id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(403).json({ error: "SESSION_NOT_FOUND", message: "Stream session does not exist" });
    }

    const session = sessionResult.rows[0];

    if (!session.active) {
      return res.status(403).json({ error: "SESSION_INACTIVE", message: "Stream session is no longer active" });
    }

    if (session.user_id !== userId || session.title_id !== titleId) {
      return res.status(403).json({ error: "SESSION_MISMATCH", message: "Token claims do not match session" });
    }

    await pool.query(
      `UPDATE stream_sessions SET last_heartbeat = NOW() WHERE id = $1`,
      [sessionId]
    );

    return res.status(501).json({
      error: "WIDEVINE_LICENSE_NOT_IMPLEMENTED",
      message: "Widevine SDK integration pending",
    });
  } catch (err) {
    console.error("[DRM] widevine license error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Internal server error" });
  }
});

export default router;
