/**
 * /api/auth/providers — legacy provider-availability shape.
 *
 * The existing sign-in modal (src/components/LoginModal.tsx) reads this to
 * decide which OAuth buttons to render. We deliberately return the same
 * `{ local, google, facebook, microsoft, auth0 }` shape the Express server
 * returned so the modal ports over without conditional code. The `magicLink`
 * field is additive — older clients ignore it, newer ones can use it.
 *
 * Note: this is distinct from NextAuth's built-in /api/auth/providers (which
 * returns a richer object keyed by provider id). The Next.js catch-all
 * handler at [...nextauth]/route.ts does not register a `providers` segment
 * because we override it here.
 */
import { NextResponse } from "next/server";
import { providerStatus } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(providerStatus);
}
