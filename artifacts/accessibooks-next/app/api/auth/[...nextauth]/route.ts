/**
 * NextAuth catch-all route — exposes signin/callback/csrf/session endpoints.
 * Auth.js v5 ships GET and POST handlers; both are wired to the canonical
 * config in src/lib/auth.ts.
 */
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
