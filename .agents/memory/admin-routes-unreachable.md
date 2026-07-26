---
name: Admin routes unreachable via role
description: role='admin' users are diverted to the ad-platform shell before the main router, so /analytics, /health, /admin/entitlements can't be reached in a browser.
---

The web apps (both the Vite SPA and the Next port) branch on `user.role` at the top-level app/auth-gate: any authenticated user with role `advertiser`, `publisher`, or `admin` is rendered into the ad-platform shell (or redirected to /admin) BEFORE the main router mounts. Meanwhile the main app's admin pages are gated by an `AdminOnly` component that requires `role === "admin"`.

**Why:** These two gates use the same field with contradictory requirements — a role-admin never reaches `/analytics` in the browser, and a non-role user is blocked by AdminOnly. Server-side `requireAdmin` additionally honors an `ADMIN_EMAILS` allow-list, but the client gate does not.

**How to apply:** Browser/e2e tests of admin analytics pages will land on the ad-platform "Platform Overview" instead — this is the routing conflict, not your feature breaking. Verify admin dashboard UI with offline jsdom component tests (route-mocked fetch, `focusManager.setFocused(true)`) instead of the testing agent, until the routing conflict is fixed.
