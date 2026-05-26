/**
 * Layout for fully-public/standalone routes (clip viewer, hands-free sign-in,
 * ad-platform marketing pages, demo slot). Skips the auth gate intentionally
 * so these pages render without the main shell chrome.
 */
export default function StandaloneLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
