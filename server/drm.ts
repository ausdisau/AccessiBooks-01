import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { validatePlaybackSession, getActiveSession } from "./monetization";
import { getDrmSigningSecret } from "./env";

const EFFECTIVE_SIGNING_SECRET = getDrmSigningSecret();
const URL_EXPIRY_SECONDS = 15 * 60; // 15 minutes

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute

export function generateSignedStreamUrl(bookId: string, userId?: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + URL_EXPIRY_SECONDS;
  const payload = `${bookId}:${userId || "anonymous"}:${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", EFFECTIVE_SIGNING_SECRET)
    .update(payload)
    .digest("hex")
    .substring(0, 16);
  
  return `/api/stream/${bookId}?expires=${expiresAt}&sig=${signature}&uid=${userId || "anonymous"}`;
}

export function verifySignedUrl(
  bookId: string,
  expires: string,
  signature: string,
  uid: string
): boolean {
  if (!signature || typeof signature !== "string") {
    return false;
  }
  
  const expiresAt = parseInt(expires, 10);
  
  if (isNaN(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }
  
  const payload = `${bookId}:${uid}:${expiresAt}`;
  const expectedSignature = crypto
    .createHmac("sha256", EFFECTIVE_SIGNING_SECRET)
    .update(payload)
    .digest("hex")
    .substring(0, 16);
  
  if (signature.length !== expectedSignature.length) {
    return false;
  }
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "utf8"),
      Buffer.from(expectedSignature, "utf8")
    );
  } catch {
    return false;
  }
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).user?.claims?.sub || (req as any).user?.id || req.ip;
  const key = `ratelimit:${userId}`;
  const now = Date.now();
  
  let entry = rateLimitStore.get(key);
  
  if (!entry || now > entry.resetTime) {
    entry = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
    rateLimitStore.set(key, entry);
  } else {
    entry.count++;
  }
  
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX_REQUESTS.toString());
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("Retry-After", Math.ceil((entry.resetTime - now) / 1000).toString());
    
    return res.status(429).json({
      message: "Too many requests. Please try again later.",
      retryAfter: Math.ceil((entry.resetTime - now) / 1000),
    });
  }
  
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX_REQUESTS.toString());
  res.setHeader("X-RateLimit-Remaining", Math.max(0, RATE_LIMIT_MAX_REQUESTS - entry.count).toString());
  
  next();
}

export async function drmGuardMiddleware(req: Request, res: Response, next: NextFunction) {
  const bookId = req.params.bookId || req.params.id;
  
  if (!bookId) {
    return res.status(400).json({ message: "Book ID required" });
  }
  
  const { expires, sig, uid } = req.query as { expires?: string; sig?: string; uid?: string };
  
  if (expires && sig && uid) {
    if (!verifySignedUrl(bookId, expires, sig, uid)) {
      return res.status(403).json({ message: "Invalid or expired stream URL" });
    }
    return next();
  }
  
  if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
    return res.status(401).json({ 
      message: "Authentication required to stream content",
      loginRequired: true,
    });
  }
  
  next();
}

export async function sessionEnforcementMiddleware(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.headers["x-playback-session"] as string | undefined;
  const deviceId = req.headers["x-device-id"] as string | undefined;
  const userId = (req as any).user?.id || (req as any).user?.claims?.sub;

  if (!userId) {
    return next();
  }

  const activeSession = getActiveSession(userId);
  
  if (activeSession && sessionId && deviceId) {
    const validation = validatePlaybackSession(sessionId, deviceId);
    if (!validation.valid) {
      return res.status(403).json({
        message: validation.message || "Playback session invalid",
        sessionInvalid: true,
        reason: "concurrent_stream",
      });
    }
  }

  next();
}

export async function premiumContentMiddleware(req: Request, res: Response, next: NextFunction) {
  const bookId = req.params.bookId || req.params.id;
  
  const isPremiumContent = bookId.startsWith("premium-");
  
  if (!isPremiumContent) {
    return next();
  }
  
  const userId = (req as any).user?.claims?.sub || (req as any).user?.id;
  
  if (!userId) {
    return res.status(401).json({ 
      message: "Authentication required for premium content",
      premiumRequired: true,
    });
  }
  
  const user = await storage.getUser(userId);
  
  if (!user || user.subscriptionTier !== "premium") {
    return res.status(403).json({
      message: "Premium subscription required to access this content",
      premiumRequired: true,
      upgradeUrl: "/api/subscription/create-checkout",
    });
  }
  
  next();
}

setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  rateLimitStore.forEach((entry, key) => {
    if (now > entry.resetTime) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => rateLimitStore.delete(key));
}, RATE_LIMIT_WINDOW_MS);
