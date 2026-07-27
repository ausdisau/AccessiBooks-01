import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";

vi.mock("@/lib/queryClient", () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

import AdminAnalyticsPage from "@/pages/admin-analytics";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const listeningBody = {
  totalMinutes: 100,
  totalSessions: 10,
  averageSessionMinutes: 10,
  totalMinutesByTier: { free: 50, plus: 30, premium: 20 },
  topTitlesByTier: {
    free: [
      { titleId: "book-1", title: "Resolved Book", plays: 42 },
      { titleId: "deleted-1", title: null, plays: 7 },
    ],
    plus: [],
    premium: [],
  },
};

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/admin/analytics/listening") {
        return json(listeningBody);
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

describe("admin analytics top-title rows", () => {
  beforeEach(() => {
    focusManager.setFocused(true);
    installFetch();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function openListeningTab(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("tab", { name: /listening/i }));
    return await screen.findByTestId("top-title-row-free-book-1");
  }

  it("resolved rows are clickable and dispatch accessibooks:open-book", async () => {
    const user = userEvent.setup();
    renderPage();
    const row = await openListeningTab(user);

    const events: Array<{ bookId?: string }> = [];
    const handler = (e: Event) => events.push((e as CustomEvent).detail);
    document.addEventListener("accessibooks:open-book", handler);
    try {
      expect(row).toHaveAttribute("role", "button");
      expect(row).toHaveAttribute("tabindex", "0");
      await user.click(row);
      expect(events).toEqual([{ bookId: "book-1" }]);

      // keyboard: focus + Enter
      row.focus();
      await user.keyboard("{Enter}");
      expect(events).toHaveLength(2);
    } finally {
      document.removeEventListener("accessibooks:open-book", handler);
    }
  });

  it("unresolved (deleted book) rows are not interactive", async () => {
    const user = userEvent.setup();
    renderPage();
    await openListeningTab(user);
    const row = screen.getByTestId("top-title-row-free-deleted-1");
    expect(row).not.toHaveAttribute("role");
    expect(row).not.toHaveAttribute("tabindex");

    const events: Event[] = [];
    const handler = (e: Event) => events.push(e);
    document.addEventListener("accessibooks:open-book", handler);
    try {
      await user.click(row);
      expect(events).toHaveLength(0);
    } finally {
      document.removeEventListener("accessibooks:open-book", handler);
    }
  });
});
