/**
 * Browser-level e2e tests for the Account & Settings page.
 *
 * Uses Playwright's request-routing to stub the backend responses so the
 * tests can verify UI behavior independently of database state and
 * authentication wiring. This is the right boundary for these tests:
 *
 *   - The HTTP API contract is covered by tests/account-settings.test.ts
 *   - This spec covers the browser layer: page renders, controls react to
 *     interaction, debounced PUT fires with the right payload, the
 *     Free vs Plus/Premium UI fork renders the right thing, and values
 *     persist across a page refresh.
 *
 * Run (server must already be running on :5000):
 *   TEST_BASE_URL=http://localhost:5000 npx playwright test
 */
import { test, expect, type Page, type Route } from "@playwright/test";

const DEFAULT_PROFILE = {
  fontSize: 16,
  fontFamily: "system",
  highContrast: false,
  reducedMotion: false,
  screenReaderHints: true,
  captionsOn: false,
  captionPosition: "below",
  playbackSpeed: 1.0,
  colorScheme: "default",
  lineSpacing: 1.5,
  letterSpacing: 0,
  dyslexiaFont: false,
  focusHighlight: true,
  darkMode: false,
  karaokeFollowAlong: false,
  transcriptOpenByDefault: false,
  reduceDistractionMode: false,
  suppressAnimatedAds: false,
  rewardedAdPreference: "ask",
  preferredSkipForward: 15,
  preferredSkipBack: 15,
  autoAdvanceChapters: true,
  sleepTimerDefault: null as number | null,
};

type StoredProfile = typeof DEFAULT_PROFILE;

/**
 * Install per-test API stubs. Stubs:
 *   - /api/auth/me            -> authenticated user with the given tier
 *   - /api/settings/summary   -> { user, preferences (current store), billing }
 *   - /api/a11y/preferences   -> GET returns current store, PUT deep-merges
 *
 * The returned `state` lets the test inspect the persisted profile and the
 * recorded PUT payloads to assert deep-merge behavior.
 */
function installApiStubs(page: Page, opts: { tier: "free" | "plus" | "premium" }) {
  const state = {
    profile: { ...DEFAULT_PROFILE } as StoredProfile,
    putCalls: [] as Array<Record<string, unknown>>,
  };

  const userPayload = {
    id: "test-user-id",
    email: `${opts.tier}-user@e2e.test`,
    firstName: opts.tier,
    lastName: "User",
    subscriptionTier: opts.tier,
    subscriptionEndDate: null,
  };

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

  return {
    state,
    install: async () => {
      // Suppress the first-visit "Welcome bonus" modal — it overlays the page
      // and obscures the controls under test.
      await page.addInitScript(() => {
        try {
          localStorage.setItem("accessibooks_welcome_shown", "1");
        } catch {}
      });
      // useAuth() in the app queries /api/auth/user (NOT /api/auth/me).
      await page.route("**/api/auth/user", (route) => json(route, userPayload));
      await page.route("**/api/auth/me", (route) => json(route, userPayload));
      await page.route("**/api/auth/providers", (route) =>
        json(route, { local: true, google: false, replit: false }),
      );
      await page.route("**/api/settings/summary", (route) =>
        json(route, {
          user: userPayload,
          preferences: state.profile,
          billing: {
            canManagePortal: opts.tier !== "free",
            nextBillingDate: null,
            estimatedNextAmount: null,
          },
        }),
      );
      await page.route("**/api/a11y/preferences**", async (route) => {
        const req = route.request();
        if (req.method() === "GET") {
          return json(route, { profile: state.profile, activePreset: null });
        }
        if (req.method() === "PUT") {
          const body = JSON.parse(req.postData() || "{}");
          const incoming = (body.profile || {}) as Partial<StoredProfile>;
          state.putCalls.push(incoming as Record<string, unknown>);
          // Server-side deep merge — same behavior as accessibilityKernel.ts
          state.profile = { ...state.profile, ...incoming };
          return json(route, { profile: state.profile, activePreset: null });
        }
        return route.continue();
      });
    },
  };
}

test.describe("Account & Settings page — Free user", () => {
  test("renders the ad-preference toggles, NOT the ad-free message", async ({ page }) => {
    page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE.error:", m.text()); });
    page.on("response", (r) => { if (r.url().includes("/api/")) console.log("HTTP", r.status(), r.request().method(), r.url()); });
    const stubs = installApiStubs(page, { tier: "free" });
    await stubs.install();

    await page.goto("/settings");
    await expect(page.getByTestId("panel-settings")).toBeAttached({ timeout: 30000 });
    // wait until the page is past the skeleton state (heading h1 inside panel)
    await expect(page.locator('[data-testid="panel-settings"] h1')).toHaveText("Account Settings", { timeout: 30000 });

    // Plan section should NOT show the green "Ad-free" badge for free tier
    await expect(page.getByRole("note", { name: /ad-free/i })).toHaveCount(0);

    // The ad-preferences toggle controls ARE rendered
    await expect(page.locator("#suppress-animated")).toBeVisible();
    await expect(page.locator("#rewarded-ask")).toBeVisible();
    await expect(page.locator("#rewarded-always")).toBeVisible();
    await expect(page.locator("#rewarded-never")).toBeVisible();

    // The Plus/Premium fork message must NOT appear
    await expect(page.getByText(/you're listening ad-free/i)).toHaveCount(0);

    // Upgrade CTAs are visible for free users
    await expect(page.getByRole("button", { name: /upgrade to plus/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /upgrade to premium/i })).toBeVisible();
  });

  test("toggles each control, fires debounced PUTs, and persists across refresh", async ({ page }) => {
    const stubs = installApiStubs(page, { tier: "free" });
    await stubs.install();

    await page.goto("/settings");
    await expect(page.locator(`[data-testid="panel-settings"] h1`)).toBeVisible();

    // The page's saveMutation is debounced via a SHARED 500ms timer — fast
    // back-to-back changes coalesce. To verify each control persists
    // correctly we emulate a realistic user (small pause between changes)
    // and assert the put-call count grows after each action.
    const pause = () => page.waitForTimeout(700);

    let expected = 0;
    const expectNextPut = async () => {
      expected += 1;
      await expect
        .poll(() => stubs.state.putCalls.length, { timeout: 5000 })
        .toBeGreaterThanOrEqual(expected);
    };

    // 1. Toggle "suppress animated ads" switch
    await page.locator("#suppress-animated").click();
    await pause();
    await expectNextPut();

    // 2. Toggle "auto-advance chapters" switch (default ON -> OFF)
    await page.locator("#auto-advance").click();
    await pause();
    await expectNextPut();

    // 3. Toggle "transcript open by default"
    await page.locator("#transcript-default").click();
    await pause();
    await expectNextPut();

    // 4. Toggle "reduce distraction"
    await page.locator("#reduce-distraction").click();
    await pause();
    await expectNextPut();

    // 5. Choose "Always accept" rewarded-ad radio
    await page.locator("#rewarded-always").click();
    await pause();
    await expectNextPut();

    // 6. Change "skip forward" select to 30
    await page.locator("#skip-forward").click();
    await page.getByRole("option", { name: "30 seconds", exact: true }).click();
    await pause();
    await expectNextPut();

    // 7. Change "skip back" select to 5
    await page.locator("#skip-back").click();
    await page.getByRole("option", { name: "5 seconds", exact: true }).click();
    await pause();
    await expectNextPut();

    // 8. Change "playback speed" to 1.5
    await page.locator("#playback-speed").click();
    await page.getByRole("option", { name: "1.5×" }).click();
    await pause();
    await expectNextPut();

    // 9. Change "sleep timer" to 30 minutes
    await page.locator("#sleep-timer").click();
    await page.getByRole("option", { name: "30 minutes", exact: true }).click();
    await pause();
    await expectNextPut();

    // Server-side merged store should reflect every control's chosen value.
    expect(stubs.state.profile.suppressAnimatedAds).toBe(true);
    expect(stubs.state.profile.autoAdvanceChapters).toBe(false);
    expect(stubs.state.profile.transcriptOpenByDefault).toBe(true);
    expect(stubs.state.profile.reduceDistractionMode).toBe(true);
    expect(stubs.state.profile.rewardedAdPreference).toBe("always");
    expect(stubs.state.profile.preferredSkipForward).toBe(30);
    expect(stubs.state.profile.preferredSkipBack).toBe(5);
    expect(stubs.state.profile.playbackSpeed).toBe(1.5);
    expect(stubs.state.profile.sleepTimerDefault).toBe(30);

    // Each PUT call sent ONLY the patched key (proving the page sends partial
    // patches and relies on the server's deep-merge — the regression guard).
    for (const call of stubs.state.putCalls) {
      expect(Object.keys(call).length).toBe(1);
    }

    // ── Refresh the page; controls should reflect the persisted values ─────
    await page.reload();
    await expect(page.locator(`[data-testid="panel-settings"] h1`)).toBeVisible();

    await expect(page.locator("#suppress-animated")).toHaveAttribute("data-state", "checked");
    await expect(page.locator("#auto-advance")).toHaveAttribute("data-state", "unchecked");
    await expect(page.locator("#transcript-default")).toHaveAttribute("data-state", "checked");
    await expect(page.locator("#reduce-distraction")).toHaveAttribute("data-state", "checked");
    await expect(page.locator("#rewarded-always")).toHaveAttribute("data-state", "checked");
    await expect(page.locator("#skip-forward")).toContainText("30 seconds");
    await expect(page.locator("#skip-back")).toContainText("5 seconds");
    await expect(page.locator("#playback-speed")).toContainText("1.5×");
    await expect(page.locator("#sleep-timer")).toContainText("30 minutes");
  });
});

test.describe("Account & Settings page — Plus/Premium user", () => {
  for (const tier of ["plus", "premium"] as const) {
    test(`${tier} user sees the "you're listening ad-free" message and NOT the ad toggles`, async ({ page }) => {
      const stubs = installApiStubs(page, { tier });
      await stubs.install();

      await page.goto("/settings");
      await expect(page.locator(`[data-testid="panel-settings"] h1`)).toBeVisible();

      // The ad-free fork message IS visible
      await expect(page.getByText(/you're listening ad-free/i)).toBeVisible();

      // Ad-preference toggles are NOT rendered
      await expect(page.locator("#suppress-animated")).toHaveCount(0);
      await expect(page.locator("#rewarded-ask")).toHaveCount(0);
      await expect(page.locator("#rewarded-always")).toHaveCount(0);
      await expect(page.locator("#rewarded-never")).toHaveCount(0);

      // The "Ad-free" badge is shown next to the plan heading
      await expect(page.getByText("Ad-free", { exact: true })).toBeVisible();

      // Upgrade CTAs are NOT shown — instead a "Manage Subscription" button
      await expect(page.getByRole("button", { name: /upgrade to plus/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /upgrade to premium/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /manage subscription/i })).toBeVisible();

      // Listening defaults & focus controls remain available regardless of tier
      await expect(page.locator("#playback-speed")).toBeVisible();
      await expect(page.locator("#auto-advance")).toBeVisible();
      await expect(page.locator("#transcript-default")).toBeVisible();
    });
  }
});
