import { Request, Response, NextFunction } from "express";

interface RateBucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateBucket>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}, 60_000);

export function drmRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();

  let bucket = store.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    store.set(ip, bucket);
  }

  bucket.count++;

  res.setHeader("X-RateLimit-Limit", MAX_REQUESTS);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, MAX_REQUESTS - bucket.count));
  res.setHeader("X-RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));

  if (bucket.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: "RATE_LIMITED",
      message: "Too many requests, try again later",
      retryAfterMs: bucket.resetAt - now,
    });
  }

  next();
}
