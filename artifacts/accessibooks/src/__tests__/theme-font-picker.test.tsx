import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";

vi.mock("@/lib/queryClient", () => ({
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), clear: vi.fn() },
  apiRequest: vi.fn(
    async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
  ),
}));
// Logged out → picker persists to localStorage, no server writes.
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));

import { PreferencesKernel } from "@/components/preferences-kernel";
import { apiRequest } from "@/lib/queryClient";
import { THEME_FONTS } from "@/lib/themeFont";

// Radix Select needs these in jsdom.
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.releasePointerCapture = vi.fn();

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderKernel() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const res = await fetch(queryKey.join("/") as string);
          return res.json();
        },
      },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <PreferencesKernel open={true} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("theme font picker", () => {
  beforeEach(() => {
    focusManager.setFocused(true);
    localStorage.clear();
    document.documentElement.classList.remove("theme-font-active");
    document.documentElement.style.removeProperty("--theme-font");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname === "/api/a11y/preferences/presets") return json([]);
        return json({});
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("exposes all 25 self-hosted families plus a system default", async () => {
    expect(THEME_FONTS).toHaveLength(25);
    const user = userEvent.setup();
    renderKernel();

    const trigger = await screen.findByTestId("select-theme-font");
    expect(trigger.textContent).toContain("System default");
    await user.click(trigger);

    // Every family is listed, rendered with its own font for preview.
    for (const label of ["DM Sans", "Plus Jakarta Sans", "Lora", "Merriweather", "Atkinson Hyperlegible"]) {
      expect(await screen.findByText(label)).toBeTruthy();
    }
    const lora = screen.getByText("Lora").closest('[role="option"]') as HTMLElement;
    expect(lora.style.fontFamily).toContain("Lora");
  });

  it("applies and persists the chosen family (logged out → localStorage)", async () => {
    const user = userEvent.setup();
    renderKernel();

    await user.click(await screen.findByTestId("select-theme-font"));
    await user.click(await screen.findByText("Lora"));

    await waitFor(() => {
      expect(document.documentElement.classList.contains("theme-font-active")).toBe(true);
    });
    expect(document.documentElement.style.getPropertyValue("--theme-font")).toContain("Lora");

    // Persisted for rehydration on next load.
    const stored = JSON.parse(localStorage.getItem("accessibooks_settings") || "{}");
    expect(stored.themeFont).toBe("lora");

    // Logged out: no server write.
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
