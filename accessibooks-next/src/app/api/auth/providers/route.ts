import { NextResponse } from "next/server";
import { listProviders } from "@/lib/integrations/auth0";
import { handleRouteError } from "@/lib/zod";

export async function GET() {
  try {
    return NextResponse.json({ providers: listProviders() });
  } catch (err) {
    return handleRouteError(err, "GET /api/auth/providers");
  }
}
