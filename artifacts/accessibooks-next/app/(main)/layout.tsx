import { AuthGate } from "@/components/shell/AuthGate";

/**
 * Layout for every authenticated-user route. Wraps children in the auth
 * gate (which in turn renders LandingPage / GuestShell / MainShell depending
 * on session state). Standalone public routes (clip viewer, hands-free
 * sign-in, ad-platform pages) live outside this route group.
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
