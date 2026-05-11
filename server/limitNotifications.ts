/**
 * limitNotifications.ts — Triggered upgrade emails for free-tier users who hit
 * a freemium limit (skip / device / loan).
 *
 * The client dispatches `accessibooks:limit-reached` and posts to
 * `POST /api/notifications/limit-hit { limitType }`. We:
 *   1. Verify the user is authenticated and on the free tier (paid users are no-op).
 *   2. De-duplicate per (userId, limitType) within a 24h window via `notificationLog`.
 *   3. Send a transactional upgrade email (SMTP via mailer.ts, AgentMail fallback).
 *   4. Insert a row into `notificationLog` so future fires within 24h are suppressed.
 *
 * The email links to `/pricing` on the current host so users land in the
 * existing in-app upgrade flow (which then opens Stripe checkout).
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { notificationLog, TIER_PRICING, users } from "@shared/schema";
import { isAuthenticated } from "./multiAuth";
import { storage } from "./storage";
import { sendEmail, isEmailConfigured } from "./mailer";
import { sendViaAgentMail } from "./agentMailer";

const LIMIT_TYPES = ["skip", "device", "loan"] as const;
type LimitType = (typeof LIMIT_TYPES)[number];

const bodySchema = z.object({
  limitType: z.enum(LIMIT_TYPES),
});

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Stable notification-log type string used for the 24h dedup query. */
function notifType(limitType: LimitType): string {
  return `limit_hit_${limitType}`;
}

const COPY: Record<LimitType, { subject: string; headline: string; body: string }> = {
  skip: {
    subject: "You hit your free-plan skip limit — unlock unlimited skips",
    headline: "Skip as much as you want with Plus or Premium",
    body: "Free accounts get 6 skips per hour. Upgrade to Plus or Premium for unlimited skips, plus an ad-free listening experience.",
  },
  device: {
    subject: "You hit your free-plan device limit — listen on more devices",
    headline: "Add more devices with Plus or Premium",
    body: "Free accounts can listen on 2 devices. Plus supports 3, Premium supports 5, and includes offline downloads.",
  },
  loan: {
    subject: "You hit your free-plan loan limit — borrow more titles",
    headline: "Borrow more titles with Plus or Premium",
    body: "Free accounts get 1 active loan at a time. Plus supports 3 concurrent loans, Premium supports 5 with longer loan periods and more downloads.",
  },
};

function buildEmail(opts: {
  to: string;
  firstName: string | null;
  limitType: LimitType;
  pricingUrl: string;
}) {
  const c = COPY[opts.limitType];
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "Hi there,";
  const plus = TIER_PRICING.plus;
  const premium = TIER_PRICING.premium;

  const text = `${greeting}

${c.body}

Plans:
  • Plus    — ${plus.monthlyDisplay}/month  (or ${plus.yearlyDisplay}/year — works out to ${plus.yearlyMonthly}/mo)
  • Premium — ${premium.monthlyDisplay}/month (or ${premium.yearlyDisplay}/year — works out to ${premium.yearlyMonthly}/mo)

Upgrade in one click: ${opts.pricingUrl}

If you'd rather stay on the free plan, no problem — you can always upgrade later from Settings → Plan.

— The AccessiBooks team`;

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px">
  <p>${greeting}</p>
  <h2 style="margin:16px 0 8px">${c.headline}</h2>
  <p style="color:#444;line-height:1.5">${c.body}</p>
  <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee"><strong>Plus</strong></td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${plus.monthlyDisplay}/mo · ${plus.yearlyDisplay}/yr</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee"><strong>Premium</strong></td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${premium.monthlyDisplay}/mo · ${premium.yearlyDisplay}/yr</td></tr>
  </table>
  <p style="margin:24px 0">
    <a href="${opts.pricingUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Compare plans &amp; upgrade</a>
  </p>
  <p style="color:#666;font-size:13px;line-height:1.5">If you'd rather stay on the free plan, no problem — you can always upgrade later from Settings → Plan.</p>
  <p style="color:#888;font-size:12px;margin-top:24px">— The AccessiBooks team</p>
</body></html>`;

  return { subject: c.subject, text, html };
}

/** Resolve a user's id from `req.user`, supporting both local and OIDC shapes. */
function getUserId(req: Request): string | null {
  const u = req.user as any;
  if (!u) return null;
  return u.claims?.sub || u.id || null;
}

/** Pick a base URL for the upgrade link from request headers (falls back safely). */
function getBaseUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = req.get("host") || "accessibooks.app";
  return `${proto}://${host}`;
}

export function registerLimitNotificationRoutes(app: Express) {
  app.post(
    "/api/notifications/limit-hit",
    isAuthenticated,
    async (req: Request, res: Response) => {
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "limitType must be skip, device, or loan" });
      }
      const { limitType } = parsed.data;

      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      let user;
      try {
        user = await storage.getUser(userId);
      } catch (err) {
        console.error("[LimitNotif] getUser failed:", err);
        return res.status(503).json({ message: "Profile lookup unavailable" });
      }
      if (!user || !user.email) {
        return res.status(404).json({ message: "User not found or no email on file" });
      }

      // Paid tiers don't get upgrade emails — silent no-op so the client
      // never has to branch on tier.
      const tier = user.subscriptionTier || "free";
      if (tier !== "free") {
        return res.json({ sent: false, reason: "paid_tier" });
      }

      // 24h dedup per (userId, limitType). Use DB-side NOW() so the cutoff
      // is consistent across app/DB clock skew rather than app-process time.
      const type = notifType(limitType);
      try {
        const recent = await db
          .select({ id: notificationLog.id })
          .from(notificationLog)
          .where(
            and(
              eq(notificationLog.userId, userId),
              eq(notificationLog.type, type),
              sql`${notificationLog.sentAt} >= NOW() - INTERVAL '24 hours'`,
            ),
          )
          .limit(1);
        if (recent.length > 0) {
          return res.json({ sent: false, reason: "deduped_24h" });
        }
      } catch (err) {
        // If the dedup query fails we fail-closed on the email so we don't
        // accidentally spam a user.
        console.error("[LimitNotif] dedup query failed:", err);
        return res.status(503).json({ message: "Notification log unavailable" });
      }

      const pricingUrl = `${getBaseUrl(req)}/pricing?utm_source=email&utm_medium=limit_hit&utm_campaign=${limitType}`;
      const email = buildEmail({
        to: user.email,
        firstName: user.firstName ?? null,
        limitType,
        pricingUrl,
      });

      // Prefer SMTP (mailer.ts) when configured; if it isn't or the send
      // fails (e.g. SMTP outage), fall through to AgentMail so we still get
      // the message out.
      let delivered = false;
      try {
        if (isEmailConfigured()) {
          delivered = await sendEmail({ to: user.email, ...email });
        }
        if (!delivered) {
          delivered = await sendViaAgentMail({ to: user.email, ...email });
        }
      } catch (err) {
        console.error("[LimitNotif] send failed:", err);
        delivered = false;
      }

      if (!delivered) {
        // Don't insert a dedup row when delivery failed — let the next limit
        // hit retry. Surface a soft error so the client can log it but not
        // disrupt the user flow.
        return res.status(202).json({ sent: false, reason: "delivery_failed" });
      }

      // Best-effort log — if it fails the email still went out, so we don't
      // 500. Worst case we may double-send within the 24h window once.
      try {
        await db.insert(notificationLog).values({
          userId,
          type,
          title: email.subject,
          body: COPY[limitType].body,
          url: "/pricing",
        });
      } catch (err) {
        console.error("[LimitNotif] notificationLog insert failed:", err);
      }

      return res.json({ sent: true, limitType });
    },
  );
}
