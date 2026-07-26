import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";

// Task #263: lock in the narration quota / upgrade-prompt UX.
// Unlike ai-narration-panel.test.tsx (which stubs useAiAddons), these tests use
// the REAL useAiAddons hook against a stubbed /api/ai-addons/status endpoint, so
// a refactor of the hook or of the panel's controlled 402 fetch would fail here.

const toastSpy = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: "u1" }, isLoading: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));
vi.mock("@/lib/authToken", () => ({
  getAuthToken: () => "test-token",
}));

import { AINarrationPanel } from "@/components/ai-narration-panel";

const VOICE = { id: "voice-1", name: "Rachel", description: "Calm" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface AddonState {
  limit: number;
  used: number;
}

let addonState: AddonState;
let generateCalls: number;

function addonStatusBody() {
  const remaining = Math.max(0, addonState.limit - addonState.used);
  return {
    tier: "free",
    addons: [
      {
        feature: "ai_narration",
        label: "AI narration",
        description: "",
        tier: "free",
        unlimited: false,
        limit: addonState.limit,
        used: addonState.used,
        remaining,
        allowed: remaining > 0,
        upgradeRequired: remaining <= 0,
      },
    ],
  };
}

beforeEach(() => {
  addonState = { limit: 2, used: 0 };
  generateCalls = 0;
  toastSpy.mockClear();
  window.history.replaceState(null, "", "/");
  focusManager.setFocused(true);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/ai-addons/status")) {
        return json(addonStatusBody());
      }
      if (url.includes("/api/narration/voices")) {
        return json({ voices: [VOICE], configured: true });
      }
      if (url.includes("/generate")) {
        generateCalls += 1;
        const remaining = addonState.limit - addonState.used;
        if (remaining <= 0) {
          // Mirrors buildUpsellPayload() from the api-server.
          return json(
            {
              error: "quota_exhausted",
              message: "You've used your free AI narration allowance for this month. Upgrade to keep going.",
              upgradeRequired: true,
              feature: "ai_narration",
              currentTier: "free",
              limit: addonState.limit,
              used: addonState.used,
              remaining: 0,
            },
            402,
          );
        }
        addonState.used += 1;
        return json({ status: "queued", totalChapters: 3, completedChapters: 0, voiceId: VOICE.id }, 202);
      }
      if (url.includes("/status")) {
        return json({ status: "none", totalChapters: 0, completedChapters: 0, voiceId: VOICE.id });
      }
      if (url.includes("/manifest")) {
        return json({ bookId: "book-1", voiceId: VOICE.id, chapters: [] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // useAiAddons relies on the app's default queryFn (fetch by queryKey).
        queryFn: async ({ queryKey }) => {
          const res = await fetch(queryKey[0] as string, { credentials: "include" });
          if (!res.ok) throw new Error(`${res.status}`);
          return res.json();
        },
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AINarrationPanel bookId="book-1" />
    </QueryClientProvider>,
  );
}

describe("AINarrationPanel — quota allowance and upgrade prompt", () => {
  it("shows the remaining monthly allowance next to the generate button", async () => {
    addonState = { limit: 2, used: 1 };
    renderPanel();

    const allowance = await screen.findByTestId("narration-allowance", undefined, { timeout: 4000 });
    expect(allowance).toHaveTextContent("1 of 2 narrations left this month.");
    expect(screen.getByTestId("button-generate-narration")).toBeInTheDocument();
    expect(screen.queryByTestId("narration-upsell")).not.toBeInTheDocument();
  });

  it("replaces the generate button with the upsell card when quota is already spent", async () => {
    addonState = { limit: 2, used: 2 };
    renderPanel();

    const upsell = await screen.findByTestId("narration-upsell", undefined, { timeout: 4000 });
    expect(upsell).toHaveTextContent(/used your narration allowance/i);
    // Free-tier copy, not the generic paid-tier copy.
    expect(upsell).toHaveTextContent(/free plan includes a limited number/i);
    expect(screen.queryByTestId("button-generate-narration")).not.toBeInTheDocument();

    // "View plans" navigates to /pricing.
    const user = userEvent.setup();
    await user.click(screen.getByTestId("button-narration-upgrade"));
    await waitFor(() => expect(window.location.pathname).toBe("/pricing"));
  });

  it("handles a server 402 gracefully: upsell appears, no raw error toast", async () => {
    // Client believes it still has allowance, but the server says it's spent
    // (e.g. used on another device). The generate attempt returns 402.
    addonState = { limit: 2, used: 1 };
    renderPanel();

    const button = await screen.findByTestId("button-generate-narration", undefined, { timeout: 4000 });

    // Server-side quota flips to exhausted before the user clicks.
    addonState.used = 2;

    const user = userEvent.setup();
    await user.click(button);

    // 402 → panel re-syncs quota and swaps to the upsell card.
    await screen.findByTestId("narration-upsell", undefined, { timeout: 6000 });
    expect(generateCalls).toBe(1);
    expect(screen.queryByTestId("button-generate-narration")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-narration-upgrade")).toBeInTheDocument();

    // No toast at all for the paywall path — especially not a raw "402: ..."
    // destructive error.
    expect(toastSpy).not.toHaveBeenCalled();
  });
});
