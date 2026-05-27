import { NextRequest } from "next/server";
import { verifyCronRequest, forwardToLegacy } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauth = verifyCronRequest(req);
  if (unauth) return unauth;
  const result = await forwardToLegacy("expire-loans");
  return Response.json({ job: "expire-loans", ...result });
}
