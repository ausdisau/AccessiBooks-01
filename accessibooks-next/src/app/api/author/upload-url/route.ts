import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { createSignedUploadUrl } from "@/lib/integrations/storage";
import { handleRouteError, parseJson } from "@/lib/zod";

const schema = z.object({
  kind: z.enum(["audio", "cover", "attachment"]),
  contentType: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { kind, contentType } = await parseJson(req, schema);
    const upload = await createSignedUploadUrl({
      prefix: `author/${kind}`,
      contentType,
      userId: session.id,
    });
    return NextResponse.json(upload);
  } catch (err) {
    return handleRouteError(err, "POST /api/author/upload-url");
  }
}
