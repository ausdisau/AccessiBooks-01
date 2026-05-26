/** Legacy /api/auth/microsoft alias — redirects via /api/auth/token-handoff. */
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

function basePath(): string {
  return (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const base = basePath();
  const handoff = `${base}/api/auth/token-handoff?next=/`;
  return NextResponse.redirect(
    `${url.origin}${base}/api/auth/signin/microsoft?callbackUrl=${encodeURIComponent(handoff)}`,
  );
}
