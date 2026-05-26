/**
 * rateLimit.ts — minimal in-memory fixed-window rate limiter for Next.js
 * route handlers, mirroring the express-rate-limit configuration used by the
 * legacy api-server (see api-server/src/auth.ts).
 *
 * In serverless deployments each cold instance has its own counter, so this
 * is best-effort defense-in-depth — exactly the same property as the legacy
 * Express server under multiple replicas. For production-grade enforcement,
 * front the route with a shared store (Redis / Vercel KV); this module is the
 * single chokepoint where that swap would happen.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(opts: {
  key: string;
  windowMs: number;
  limit: number;
}): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(opts.key);
  if (!entry || entry.resetAt <= now) {
    const resetAt = now + opts.windowMs;
    buckets.set(opts.key, { count: 1, resetAt });
    return { ok: true, remaining: opts.limit - 1, resetAt };
  }
  if (entry.count >= opts.limit) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count += 1;
  return { ok: true, remaining: opts.limit - entry.count, resetAt: entry.resetAt };
}

/** Extract a stable client IP from common proxy headers. */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function rateLimitResponse(result: RateLimitResult, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": Math.max(
        1,
        Math.ceil((result.resetAt - Date.now()) / 1000),
      ).toString(),
    },
  });
}
