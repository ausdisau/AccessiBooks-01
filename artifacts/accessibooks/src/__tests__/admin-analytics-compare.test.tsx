import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";

vi.mock("@/lib/queryClient", () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

import AdminAnalyticsPage from "@/pages/admin-analytics";
import { getPreviousWindow, computeDelta } from "@/hooks/use-admin-analytics";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const subsBody = (mult: number) => ({
  totalFree: 100 * mult,
  totalPlus: 50 * mult,
  totalPremium: 20 * mult,
  newSignupsThisPeriod: 10 * mult,
  upgradesThisPeriod: 5 * mult,
  cancellationsThisPeriod: 2 * mult,
  estimatedMRRCents: 100000 * mult,
});

let fetchedWindows: Array<{ url: string; from: string; to: string }>;

function installFetch() {
  fetchedWindows = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "";
      fetchedWindows.push({ url: url.pathname, from, to });
      if (url.pathname === "/api/admin/analytics/subscriptions") {
        // Current window ends ~now; the previous window ends earlier.
        const isCurrent = new Date(to).getTime() > Date.now() - 60_000;
        return json(subsBody(isCurrent ? 2 : 1));
      }
      return json({});
    }),
  );
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminAnalyticsPage />
    </QueryClientProvider>,
  );
}

describe("admin analytics compare-to-previous-period", () => {
  beforeEach(() => {
    focusManager.setFocused(true);
    installFetch();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("getPreviousWindow returns the equal-length window immediately before", () => {
    const from = "2026-07-01T00:00:00.000Z";
    const to = "2026-07-08T00:00:00.000Z";
    const prev = getPreviousWindow(from, to);
    expect(prev.to).toBe(from);
    expect(prev.from).toBe("2026-06-24T00:00:00.000Z");
  });

  it("computeDelta handles growth, decline, and missing baseline", () => {
    expect(computeDelta(150, 100)).toBeCloseTo(0.5);
    expect(computeDelta(50, 100)).toBeCloseTo(-0.5);
    expect(computeDelta(5, 0)).toBeNull();
    expect(computeDelta(undefined, 100)).toBeNull();
  });

  it("shows no delta badges by default, then shows +% deltas when toggled on", async () => {
    const user = userEvent.setup();
    renderPage();

    // Wait for the current-window data to render.
    await screen.findByText("200"); // Free Users = 100 * 2
    expect(screen.queryAllByTestId("delta-badge")).toHaveLength(0);
    // Only current-window requests so far.
    const subsCalls = () =>
      fetchedWindows.filter((w) => w.url === "/api/admin/analytics/subscriptions");
    expect(subsCalls()).toHaveLength(1);

    await user.click(screen.getByTestId("compare-toggle"));

    // Previous-window request fired with the equal-length prior window.
    const badges = await screen.findAllByTestId("delta-badge");
    expect(badges.length).toBeGreaterThan(0);
    expect(subsCalls()).toHaveLength(2);
    const [cur, prev] = subsCalls();
    expect(prev.to).toBe(cur.from);
    const curLen = new Date(cur.to).getTime() - new Date(cur.from).getTime();
    const prevLen = new Date(prev.to).getTime() - new Date(prev.from).getTime();
    expect(prevLen).toBe(curLen);

    // Current values are 2x the previous values → +100% everywhere.
    const freeUsersCard = screen.getByText("Free Users").closest("div")!
      .parentElement!.parentElement!;
    expect(within(freeUsersCard).getByTestId("delta-badge").textContent).toContain(
      "+100",
    );

    // Toggling off removes the badges again.
    await user.click(screen.getByTestId("compare-toggle"));
    expect(screen.queryAllByTestId("delta-badge")).toHaveLength(0);
  });
});
