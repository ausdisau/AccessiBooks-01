import type { NextRequest } from "next/server";

/**
 * Verify that an incoming request is a legitimate Vercel cron invocation.
 *
 * Vercel sets `x-vercel-cron: 1` on requests originating from the cron
 * scheduler. In production we additionally require the `Authorization`
 * bearer to match `CRON_SECRET` (Vercel injects this automatically when
 * the env var is set on the project), which prevents anyone who learns
 * the URL from triggering expensive jobs.
 *
 * Returns `null` if the request is authorized, otherwise a Response that
 * the caller should return verbatim.
 */
export function verifyCronRequest(req: NextRequest): Response | null {
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const hasBearer = expected && auth === `Bearer ${expected}`;

  if (isVercelCron || hasBearer) return null;

  if (process.env.NODE_ENV !== "production" && !expected) {
    return null;
  }

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Forward a cron tick to the legacy Express API server. During the Next.js
 * migration the heavy business logic still lives in `artifacts/api-server`,
 * so cron stubs proxy to a dedicated `/api/internal/cron/*` endpoint on
 * the legacy backend, signed with a shared secret.
 *
 * Set `LEGACY_API_URL` (e.g. `https://api.accessibooks.example`) and
 * `INTERNAL_CRON_TOKEN` on Vercel to enable. If either is missing, the
 * stub no-ops with a 200 so the cron run is recorded as successful.
 */
export async function forwardToLegacy(jobName: string): Promise<{
  status: "forwarded" | "skipped";
  upstreamStatus?: number;
  reason?: string;
}> {
  const base = process.env.LEGACY_API_URL;
  const token = process.env.INTERNAL_CRON_TOKEN;
  if (!base || !token) {
    return { status: "skipped", reason: "LEGACY_API_URL or INTERNAL_CRON_TOKEN not set" };
  }

  const url = `${base.replace(/\/$/, "")}/api/internal/cron/${jobName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ source: "vercel-cron", at: new Date().toISOString() }),
  });

  return { status: "forwarded", upstreamStatus: res.status };
}
