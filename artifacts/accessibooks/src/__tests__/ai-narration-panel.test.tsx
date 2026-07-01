import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";

// Mock the panel's hooks so the test controls auth + quota and the ONLY network
// traffic is the narration status/generate/voices fetches we stub below.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: "u1" }, isLoading: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/lib/authToken", () => ({
  getAuthToken: () => "test-token",
}));
vi.mock("@/hooks/use-ai-addons", () => ({
  useAiAddons: () => ({
    tier: "premium",
    addons: [],
    addonsByFeature: {
      ai_narration: {
        feature: "ai_narration",
        label: "AI narration",
        description: "",
        tier: "premium",
        unlimited: true,
        limit: null,
        used: 0,
        remaining: null,
        allowed: true,
        upgradeRequired: false,
      },
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

import { AINarrationPanel } from "@/components/ai-narration-panel";

const VOICE = { id: "voice-1", name: "Rachel", description: "Calm" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type JobState = "processing" | "failed" | "queued";

let jobState: JobState;
let statusFetches: number;
let generateInits: RequestInit[];

function statusBody(state: JobState) {
  if (state === "failed") {
    return {
      status: "failed",
      totalChapters: 3,
      completedChapters: 1,
      error: "The voice service failed on chapter 2.",
      voiceId: VOICE.id,
    };
  }
  if (state === "queued") {
    return { status: "queued", totalChapters: 3, completedChapters: 0, error: null, voiceId: VOICE.id };
  }
  return { status: "processing", totalChapters: 3, completedChapters: 1, error: null, voiceId: VOICE.id };
}

beforeEach(() => {
  jobState = "processing";
  statusFetches = 0;
  generateInits = [];
  // Force react-query to treat the app as focused so refetchInterval polling
  // actually fires under jsdom (otherwise visibility state can suppress it).
  focusManager.setFocused(true);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/narration/voices")) {
        return json({ voices: [VOICE], configured: true });
      }
      if (url.includes("/generate")) {
        generateInits.push(init ?? {});
        jobState = "queued"; // a retry restarts the job
        return json({ status: "queued", totalChapters: 3, completedChapters: 0, voiceId: VOICE.id }, 202);
      }
      if (url.includes("/status")) {
        statusFetches += 1;
        return json(statusBody(jobState));
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AINarrationPanel bookId="book-1" />
    </QueryClientProvider>,
  );
}

describe("AINarrationPanel — mid-book failure never fails silently", () => {
  it("polls a processing job, surfaces the failure with a retry, and retry restarts generation", async () => {
    const user = userEvent.setup();
    renderPanel();

    // 1) Processing state renders and the status query begins polling.
    await screen.findByTestId("narration-progress", undefined, { timeout: 4000 });

    // 2) The background job fails. The next poll must surface the error and a
    //    retry affordance rather than leaving the user stuck on the spinner.
    jobState = "failed";
    const retry = await screen.findByTestId("button-retry-narration", undefined, { timeout: 6000 });
    expect(screen.getByText(/failed on chapter 2/i)).toBeInTheDocument();
    // Proves the failure was observed via polling, not just the initial fetch.
    expect(statusFetches).toBeGreaterThanOrEqual(2);

    // 3) Retry re-issues the generate request and the panel returns to progress.
    await user.click(retry);
    await screen.findByTestId("narration-progress", undefined, { timeout: 6000 });
    expect(generateInits).toHaveLength(1);
    expect(generateInits[0]?.method).toBe("POST");
  });
});
