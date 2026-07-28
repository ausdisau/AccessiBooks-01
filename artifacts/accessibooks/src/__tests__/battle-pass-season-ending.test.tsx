// Task #246 — season-end warning: users with reached-but-unclaimed rewards
// see an urgency banner, and the days-left indicator flags an ending season.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/queryClient", () => ({
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), clear: vi.fn() },
  apiRequest: vi.fn(
    async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
  ),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

import { BattlePassComponent } from "@/components/battle-pass";

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function makeData(opts: { daysLeft: number; claimed: string[] }) {
  return {
    season: {
      id: "s1",
      seasonName: "Season One",
      description: "Test season",
      priceCents: 299,
      startDate: daysFromNow(-30),
      endDate: daysFromNow(opts.daysLeft),
      isActive: true,
    },
    milestones: [
      { id: "m1", battlePassId: "s1", tier: 1, xpRequired: 100, rewardType: "badge", rewardValue: null, description: "Free tier 1", isPremium: false },
      { id: "m2", battlePassId: "s1", tier: 2, xpRequired: 500, rewardType: "badge", rewardValue: null, description: "Free tier 2", isPremium: false },
      { id: "p1", battlePassId: "s1", tier: 1, xpRequired: 100, rewardType: "premium_trial", rewardValue: null, description: "Premium tier 1", isPremium: true },
    ],
    progress: {
      id: "bp1",
      userId: "u1",
      battlePassId: "s1",
      currentTier: 1,
      xpEarned: 150, // reached m1 and p1, not m2
      claimedMilestones: JSON.stringify(opts.claimed),
      isPremium: false, // premium track locked → p1 not claimable
      status: "active",
    },
  };
}

function renderWith(data: unknown) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: async () => data } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <BattlePassComponent />
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup());

describe("battle pass season-end warning", () => {
  it("shows an urgent banner when the season ends soon and rewards are unclaimed", async () => {
    renderWith(makeData({ daysLeft: 3, claimed: [] }));
    const banner = await screen.findByTestId("banner-unclaimed-rewards");
    // Only m1 is claimable (m2 unreached, p1 premium-locked).
    expect(banner.textContent).toContain("1 unclaimed reward");
    expect(banner.textContent?.toLowerCase()).toContain("lost when the season resets");
    expect(screen.getByTestId("text-days-left").textContent).toContain("3 days left");
  });

  it("shows a calm reminder when unclaimed rewards exist but the season is not ending soon", async () => {
    renderWith(makeData({ daysLeft: 20, claimed: [] }));
    const banner = await screen.findByTestId("banner-unclaimed-rewards");
    expect(banner.textContent).toContain("1 unclaimed reward");
    expect(banner.textContent?.toLowerCase()).not.toContain("lost when the season resets");
  });

  it("hides the banner when every claimable reward is claimed", async () => {
    renderWith(makeData({ daysLeft: 3, claimed: ["m1"] }));
    await screen.findByTestId("text-days-left");
    expect(screen.queryByTestId("banner-unclaimed-rewards")).toBeNull();
  });
});
