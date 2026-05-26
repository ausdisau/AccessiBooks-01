"use client";

/**
 * Thin compatibility shim that re-exports the wouter API surface used by the
 * ported AccessiBooks UI on top of next/link + next/navigation. This lets the
 * many components that still call `useLocation()` / `<Link href>` work
 * unchanged while routing is actually handled by the Next.js App Router.
 *
 * The wouter package itself is no longer a dependency — only this file
 * remains. New code should import directly from "next/link" and
 * "next/navigation".
 */

import NextLink from "next/link";
import {
  usePathname,
  useRouter,
  useParams as useNextParams,
} from "next/navigation";
import type { ComponentProps, ReactNode } from "react";

type LinkProps = { href: string; children?: ReactNode } & Omit<
  ComponentProps<typeof NextLink>,
  "href"
>;

export function Link({ href, children, ...rest }: LinkProps) {
  return (
    <NextLink href={href} {...rest}>
      {children}
    </NextLink>
  );
}

export function useLocation(): [string, (to: string) => void] {
  const pathname = usePathname() || "/";
  const router = useRouter();
  return [
    pathname,
    (to: string) => {
      if (to.startsWith("http://") || to.startsWith("https://")) {
        if (typeof window !== "undefined") window.location.href = to;
        return;
      }
      router.push(to);
    },
  ];
}

export function useParams<T extends Record<string, string>>(): T {
  return (useNextParams() as unknown as T) || ({} as T);
}

/**
 * Minimal pattern matcher supporting `:name` segments (no regex/optional
 * groups). Returns `[matches, params]` like wouter. Used by a handful of
 * legacy callers (e.g. clip-view).
 */
export function useRoute(
  pattern: string,
): [boolean, Record<string, string> | null] {
  const pathname = usePathname() || "/";
  const patParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patParts.length !== pathParts.length) return [false, null];
  const params: Record<string, string> = {};
  for (let i = 0; i < patParts.length; i++) {
    const p = patParts[i];
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (p !== pathParts[i]) {
      return [false, null];
    }
  }
  return [true, params];
}

/** No-op — the App Router replaces wouter's <Router base>. */
export function Router({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** Renders nothing — kept so any straggling `<Route>` references compile. */
export function Route(_props: unknown) {
  return null;
}

/** Pass-through — straggling `<Switch>` references render their children. */
export function Switch({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** Redirect via next router on mount. */
export function Redirect({ to }: { to: string }) {
  const router = useRouter();
  if (typeof window !== "undefined") {
    queueMicrotask(() => router.replace(to));
  }
  return null;
}
