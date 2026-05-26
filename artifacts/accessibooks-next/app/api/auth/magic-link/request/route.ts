/**
 * /api/auth/magic-link/request — issue and email a magic sign-in link.
 *
 * Mirrors the legacy Express implementation in api-server/src/auth.ts:
 *   - HMAC-signed token with a 15-minute TTL (see lib/magicLink.ts)
 *   - Base URL derived from APP_URL only (never request headers) to defeat
 *     host-header injection that would point the emailed link at an
 *     attacker-controlled domain.
 *   - Resend as the email transport.
 *   - In development, when no email provider is configured, returns a
 *     `devLink` so the dev can click through without inbox access.
 */
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createMagicToken } from "@/lib/magicLink";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  const localPart = atIdx >= 0 ? email.slice(0, atIdx) : email;
  const domain = atIdx >= 0 ? email.slice(atIdx + 1) : "unknown";
  return `${localPart.slice(0, 2)}***@${domain}`;
}

export async function POST(request: Request) {
  // Per-IP coarse limit (mirrors magicLinkIpRateLimiter in api-server/src/auth.ts):
  // 10 requests / 15 minutes.
  const ip = clientIp(request);
  const ipLimit = checkRateLimit({
    key: `magic:ip:${ip}`,
    windowMs: 15 * 60 * 1000,
    limit: 10,
  });
  if (!ipLimit.ok) {
    return rateLimitResponse(
      ipLimit,
      "Too many magic link requests. Please try again later.",
    );
  }

  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ message: "Email is required" }, { status: 400 });
  }
  const email = (body.email ?? "").toString().trim();
  if (!email) {
    return NextResponse.json({ message: "Email is required" }, { status: 400 });
  }

  // Per-identifier targeted limit (mirrors magicLinkIdentifierRateLimiter):
  // 3 requests / 15 minutes per address — prevents inbox flooding.
  const idLimit = checkRateLimit({
    key: `magic:id:${email.toLowerCase()}`,
    windowMs: 15 * 60 * 1000,
    limit: 3,
  });
  if (!idLimit.ok) {
    return rateLimitResponse(
      idLimit,
      "Too many magic link requests for this address. Please try again later.",
    );
  }

  const token = createMagicToken(email);
  const configuredAppUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!configuredAppUrl && process.env.NODE_ENV === "production") {
    console.error(
      "[MagicLink] APP_URL is not set in production — cannot build safe magic-link URL",
    );
    return NextResponse.json(
      { message: "Server misconfiguration. Contact support." },
      { status: 503 },
    );
  }
  const baseUrl =
    configuredAppUrl ?? new URL(request.url).origin.replace(/\/$/, "");
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  const link = `${baseUrl}${basePath}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`;

  const masked = maskEmail(email);
  if (process.env.NODE_ENV === "development") {
    console.log(`[MagicLink] Generated link for ${masked}: ${link}`);
  } else {
    console.log(`[MagicLink] Generated link for ${masked}`);
  }

  if (!isResendConfigured()) {
    if (process.env.NODE_ENV === "production") {
      console.error("[MagicLink] No email service configured in production!");
      return NextResponse.json(
        { message: "Email delivery unavailable. Contact support." },
        { status: 503 },
      );
    }
    console.warn(
      "[MagicLink] RESEND_API_KEY not set. Returning devLink for development.",
    );
    return NextResponse.json({
      message: "No email service configured",
      emailSent: false,
      devLink: link,
    });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const from =
      process.env.RESEND_FROM_EMAIL ?? "AccessiBooks <noreply@accessibooks.org>";
    const result = await resend.emails.send({
      from,
      to: email,
      subject: "Your AccessiBooks sign-in link",
      text: `Click this link to sign in (expires in 15 minutes):\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
      html: `<p>Click the button below to sign in to AccessiBooks. This link expires in 15 minutes.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#6d28d9;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Sign In to AccessiBooks</a></p>
<p style="color:#888;font-size:12px">Or copy this URL into your browser:<br>${link}</p>
<p style="color:#888;font-size:12px">If you didn't request this link, you can safely ignore this email.</p>`,
    });
    if (result.error) {
      console.error(`[MagicLink] Resend error for ${masked}:`, result.error);
      return NextResponse.json(
        { message: "Failed to send magic link. Please try again shortly." },
        { status: 503 },
      );
    }
  } catch (err) {
    console.error(`[MagicLink] Send threw for ${masked}:`, err);
    return NextResponse.json(
      { message: "Failed to send magic link. Please try again shortly." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    message: "Magic link sent — check your inbox",
    emailSent: true,
  });
}
