import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { easyEnglishConvert } from "@/lib/integrations/openai";
import { handleRouteError, jsonError, parseJson } from "@/lib/zod";

const schema = z.object({ text: z.string().min(1).max(20_000) });

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const tier = session.subscriptionTier ?? "free";
    if (tier !== "premium" && tier !== "plus") {
      return jsonError("Easy English requires Plus or Premium", 402);
    }
    const { text } = await parseJson(req, schema);
    const result = await easyEnglishConvert(text);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err, "POST /api/easy-english/convert");
  }
}
