/**
 * /auth/error — custom NextAuth error page.
 *
 * Auth.js redirects failed sign-ins here with an `?error=<code>` query param
 * (e.g. OAuthCallbackError, Configuration). This page deliberately ignores
 * that param: it renders the same generic message regardless, so internal
 * error codes and provider details are never echoed back to the user or
 * reflected into the page. Server component — no client JS needed.
 */
import Link from "next/link";

export const metadata = {
  title: "Sign-in problem — AccessiBooks",
  robots: { index: false, follow: false },
};

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm"
        role="alert"
        aria-live="polite"
      >
        <h1 className="text-2xl font-semibold text-foreground">
          We couldn&apos;t sign you in
        </h1>
        <p className="mt-3 text-muted-foreground">
          Something went wrong during sign-in. This is usually temporary —
          please return to the home page and try again.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="link-auth-error-home"
          >
            Back to home
          </Link>
          <p className="text-sm text-muted-foreground">
            If this keeps happening, try a different sign-in method or contact
            support.
          </p>
        </div>
      </div>
    </main>
  );
}
