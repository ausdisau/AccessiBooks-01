import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";

vi.mock("@/lib/queryClient", () => ({
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), clear: vi.fn() },
  apiRequest: vi.fn(
    async () =>
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
  ),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-subscription", () => ({
  useSubscription: () => ({ upgradeToTier: vi.fn(), isUpgrading: false }),
}));
// Heavy child sections are irrelevant to the notifications toggle.
vi.mock("@/components/plan-badge", () => ({ PlanBadge: () => null }));
vi.mock("@/components/preferences-kernel", () => ({ PreferencesKernel: () => null }));
vi.mock("@/components/premium-upgrade-modal", () => ({ PremiumUpgradeModal: () => null }));
vi.mock("@/components/offline-downloads", () => ({ OfflineDownloads: () => null }));
vi.mock("@/components/device-management", () => ({ DeviceManagement: () => null }));
vi.mock("@/components/billing-dashboard", () => ({ BillingDashboard: () => null }));
vi.mock("@/components/referral-section", () => ({ ReferralSection: () => null }));
vi.mock("wouter", () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>,
}));

import { AccountSettingsPage } from "@/pages/account-settings";
import { apiRequest } from "@/lib/queryClient";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(limitHitEmails: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/notifications/email-preferences") {
        return json({ limitHitEmails });
      }
      if (url.pathname === "/api/settings/summary") {
        return json({
          user: {
            id: "user-1",
            email: "reader@test.dev",
            firstName: "Reader",
            subscriptionTier: "free",
            subscriptionEndDate: null,
          },
          preferences: {},
          billing: { canManagePortal: false, nextBillingDate: null, estimatedNextAmount: null },
        });
      }
      return json({});
    }),
  );
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Mirror the app's default queryFn: join the key into a URL and fetch it.
        queryFn: async ({ queryKey }) => {
          const res = await fetch(queryKey.join("/") as string);
          return res.json();
        },
      },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AccountSettingsPage />
    </QueryClientProvider>,
  );
}

describe("Settings → Notifications limit-email toggle", () => {
  beforeEach(() => {
    focusManager.setFocused(true);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders on for opted-in users and PUTs false when switched off", async () => {
    installFetch(true);
    const user = userEvent.setup();
    renderPage();

    const toggle = await screen.findByTestId("switch-limit-hit-emails");
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));

    await user.click(toggle);
    expect(apiRequest).toHaveBeenCalledWith("PUT", "/api/notifications/email-preferences", {
      limitHitEmails: false,
    });
  });

  it("renders off for opted-out users and PUTs true when switched back on", async () => {
    installFetch(false);
    const user = userEvent.setup();
    renderPage();

    const toggle = await screen.findByTestId("switch-limit-hit-emails");
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));

    await user.click(toggle);
    expect(apiRequest).toHaveBeenCalledWith("PUT", "/api/notifications/email-preferences", {
      limitHitEmails: true,
    });
  });
});
