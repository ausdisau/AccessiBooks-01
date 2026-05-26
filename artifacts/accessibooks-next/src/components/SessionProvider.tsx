"use client";
/**
 * SessionProvider — wraps the app in Auth.js's React provider so any client
 * component can call useSession(). Mounted from the root layout.
 */
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // basePath is needed when the Next.js app is served under a non-root path
  // (e.g. /next/ in the Replit preview). On Vercel BASE_PATH is empty and
  // this collapses to the default.
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  return (
    <NextAuthSessionProvider basePath={`${basePath}/api/auth`}>
      {children}
    </NextAuthSessionProvider>
  );
}
