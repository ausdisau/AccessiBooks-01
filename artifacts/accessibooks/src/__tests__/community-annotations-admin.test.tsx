import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";

vi.mock("@/lib/queryClient", () => ({
  queryClient: { invalidateQueries: vi.fn(), clear: vi.fn() },
  apiRequest: vi.fn(
    async () =>
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
  ),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "admin-1", email: "admin@test.dev", role: "admin" } }),
}));

import AdminPlatformDashboard from "@/pages/ad-platform/admin-dashboard";
import { apiRequest } from "@/lib/queryClient";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const pendingAnnotations = [
  {
    id: "ann-1",
    bookId: "book-1",
    bookTitle: "A Tale of Two Cities",
    page: 3,
    text: "It was the best of times",
    note: "This opening contrast frames the whole novel.",
    status: "pending",
    contributorId: "user-9",
    contributorName: "Alex R.",
    createdAt: "2026-07-20T10:00:00.000Z",
  },
  {
    id: "ann-2",
    bookId: "book-2",
    bookTitle: "Moby-Dick",
    page: 1,
    text: "Call me Ishmael",
    note: "Famous opener.",
    status: "pending",
    contributorId: "user-3",
    contributorName: null,
    createdAt: "2026-07-21T10:00:00.000Z",
  },
];

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/admin/community-annotations") {
        return json(pendingAnnotations);
      }
      if (url.pathname === "/api/analytics/admin") {
        return json({
          totals: { gmvCents: 0, platformRevenueCents: 0, totalImpressions: 0, totalClicks: 0 },
          daily: [],
          topAdvertisers: [],
          topPublishers: [],
          pendingPayouts: [],
        });
      }
      if (url.pathname === "/api/ad/admin/stats") return json({});
      return json([]);
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
      <AdminPlatformDashboard />
    </QueryClientProvider>,
  );
}

describe("admin community-annotation moderation tab", () => {
  beforeEach(() => {
    focusManager.setFocused(true);
    installFetch();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("lists pending annotations and sends approve/reject reviews", async () => {
    const user = userEvent.setup();
    renderPage();

    // Tab shows the pending count once the moderation queue loads.
    const trigger = await screen.findByText(/Annotations \(2\)/);
    await user.click(trigger);

    // Queue items render with book title, passage, note, and contributor.
    expect(await screen.findByText("A Tale of Two Cities")).toBeTruthy();
    expect(screen.getByText(/It was the best of times/)).toBeTruthy();
    expect(screen.getByText("This opening contrast frames the whole novel.")).toBeTruthy();
    expect(screen.getByText(/Alex R\./)).toBeTruthy();
    // Anonymous contributor falls back to the id.
    expect(screen.getByText(/user-3/)).toBeTruthy();

    // Approve the first annotation.
    await user.click(screen.getByTestId("approve-annotation-ann-1"));
    expect(apiRequest).toHaveBeenCalledWith(
      "PATCH",
      "/api/admin/community-annotations/ann-1/review",
      { action: "approve", reviewNote: undefined },
    );

    // Reject the second one with a reason captured via prompt.
    vi.spyOn(window, "prompt").mockReturnValue("Not helpful for readers");
    await user.click(screen.getByTestId("reject-annotation-ann-2"));
    expect(apiRequest).toHaveBeenCalledWith(
      "PATCH",
      "/api/admin/community-annotations/ann-2/review",
      { action: "reject", reviewNote: "Not helpful for readers" },
    );

    // Cancelling the prompt must NOT send a review.
    const callsBefore = vi.mocked(apiRequest).mock.calls.length;
    vi.spyOn(window, "prompt").mockReturnValue(null);
    await user.click(screen.getByTestId("reject-annotation-ann-1"));
    expect(vi.mocked(apiRequest).mock.calls.length).toBe(callsBefore);
  });
});
