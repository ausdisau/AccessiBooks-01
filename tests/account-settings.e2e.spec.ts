/**
 * Browser-level e2e tests for the Account & Settings page.
 *
 * These tests drive the REAL backend — each test registers a fresh local-auth
 * user via POST /api/auth/register, optionally upgrades their tier through the
 * dev-only /api/dev/set-tier seam (gated by NODE_ENV !== "production"), then
 * navigates to /settings and exercises the page through the browser.
 *
 * What we assert end-to-end:
 *   - The page renders for an authenticated session and surfaces the user's
 *     real subscription tier (Free vs Plus/Premium UI fork).
 *   - Toggling controls fires PUT /api/a11y/preferences against the live
 *     backend and the values persist across a page refresh.
 *   - The HTTP API contract (deep-merge, partial patches, 401s, etc.) is
 *     covered separately by tests/account-settings.test.ts.
 *
 * Run (server must already be running on :5000):
 *   TEST_BASE_URL=http://localhost:5000 npx playwright test
 */
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";

/**
 * Register a fresh user against the real backend and return their session
 * cookies (parsed from set-cookie). Optionally upgrade the user's tier via
 * the dev-only /api/dev/set-tier endpoint.
 */
async function registerRealUser(
  request: APIRequestContext,
  tier: "free" | "plus" | "premium",
): Promise<{ email: string; cookies: Array<{ name: string; value: string; url: string }> }> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `e2e-${tier}-${stamp}@accessibooks.test`;
  const password = "E2eTest!Password123";

  const reg = await request.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password, firstName: tier, lastName: "User" },
  });
  if (!reg.ok()) {
    throw new Error(
      `Register failed (${reg.status()}): ${await reg.text().catch(() => "<no body>")}`,
    );
  }

  // Capture session cookies so we can hand them to the browser context.
  const setCookies = reg.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
  const cookies = setCookies.map((h) => {
    const [pair] = h.value.split(";");
    const eq = pair.indexOf("=");
    return {
      name: pair.slice(0, eq).trim(),
      value: pair.slice(eq + 1).trim(),
      url: BASE_URL,
    };
  });

  if (tier !== "free") {
    const setTier = await request.post(`${BASE_URL}/api/dev/set-tier`, {
      data: { tier },
      headers: { Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") },
    });
    if (!setTier.ok()) {
      throw new Error(
        `set-tier failed (${setTier.status()}): ${await setTier.text().catch(() => "<no body>")}`,
      );
    }
  }

  return { email, cookies };
}

/** Apply session cookies to the page's browser context BEFORE navigation. */
async function applyCookies(
  page: Page,
  cookies: Array<{ name: string; value: string; url: string }>,
) {
  await page.context().addCookies(cookies);
  // Also suppress the first-visit "Welcome bonus" modal which overlays the
  // controls under test on a brand-new account.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("accessibooks_welcome_shown", "1");
    } catch {}
  });
}

test.describe("Account & Settings page — Free user (real auth)", () => {
  test("renders the ad-preference toggles, NOT the ad-free message", async ({ page, request }) => {
    const { cookies } = await registerRealUser(request, "free");
    await applyCookies(page, cookies);

    await page.goto("/settings");
    await expect(page.getByTestId("panel-settings")).toBeAttached({ timeout: 30000 });
    await expect(page.locator('[data-testid="panel-settings"] h1')).toHaveText(
      "Account Settings",
      { timeout: 30000 },
    );

    // No green "Ad-free" badge for free tier
    await expect(page.getByRole("note", { name: /ad-free/i })).toHaveCount(0);

    // The ad-preferences toggle controls ARE rendered
    await expect(page.locator("#suppress-animated")).toBeVisible();
    await expect(page.locator("#rewarded-ask")).toBeVisible();
    await expect(page.locator("#rewarded-always")).toBeVisible();
    await expect(page.locator("#rewarded-never")).toBeVisible();

    // Plus/Premium fork message must NOT appear
    await expect(page.getByText(/you're listening ad-free/i)).toHaveCount(0);

    // Upgrade CTAs are visible for free users
    await expect(page.getByRole("button", { name: /upgrade to plus/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /upgrade to premium/i })).toBeVisible();
  });

  test("toggles persist to the real backend across a page refresh", async ({ page, request }) => {
    const { cookies } = await registerRealUser(request, "free");
    await applyCookies(page, cookies);

    await page.goto("/settings");
    await expect(page.locator('[data-testid="panel-settings"] h1')).toBeVisible({
      timeout: 30000,
    });

    // The page's saveMutation is debounced via a SHARED 500ms timer, so we
    // pace each change with a small pause to ensure each PUT actually fires.
    const pause = () => page.waitForTimeout(700);

    // Toggle a representative slice of controls (one of each "kind"):
    //   - a switch (suppress-animated)
    //   - a switch starting ON (auto-advance)
    //   - a radio group (rewarded-always)
    //   - a select (skip-forward → 30, playback-speed → 1.5×)
    await page.locator("#suppress-animated").click();
    await pause();

    await page.locator("#auto-advance").click();
    await pause();

    await page.locator("#rewarded-always").click();
    await pause();

    await page.locator("#skip-forward").click();
    await page.getByRole("option", { name: "30 seconds", exact: true }).click();
    await pause();

    await page.locator("#playback-speed").click();
    await page.getByRole("option", { name: "1.5×" }).click();
    await pause();

    // Hit the live backend directly to verify the values were truly saved.
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    await expect
      .poll(
        async () => {
          const res = await request.get(`${BASE_URL}/api/a11y/preferences`, {
            headers: { Cookie: cookieHeader },
          });
          if (!res.ok()) return null;
          const body = await res.json();
          return body?.profile ?? null;
        },
        { timeout: 8000, intervals: [300, 500, 800] },
      )
      .toMatchObject({
        suppressAnimatedAds: true,
        autoAdvanceChapters: false,
        rewardedAdPreference: "always",
        preferredSkipForward: 30,
        playbackSpeed: 1.5,
      });

    // Refresh the page; controls should reflect the persisted values.
    await page.reload();
    await expect(page.locator('[data-testid="panel-settings"] h1')).toBeVisible({
      timeout: 30000,
    });

    await expect(page.locator("#suppress-animated")).toHaveAttribute("data-state", "checked");
    await expect(page.locator("#auto-advance")).toHaveAttribute("data-state", "unchecked");
    await expect(page.locator("#rewarded-always")).toHaveAttribute("data-state", "checked");
    await expect(page.locator("#skip-forward")).toContainText("30 seconds");
    await expect(page.locator("#playback-speed")).toContainText("1.5×");
  });
});

test.describe("Account & Settings page — Plus/Premium user (real auth)", () => {
  for (const tier of ["plus", "premium"] as const) {
    test(`${tier} user sees the ad-free message and NOT the ad toggles`, async ({
      page,
      request,
    }) => {
      const { cookies } = await registerRealUser(request, tier);
      await applyCookies(page, cookies);

      await page.goto("/settings");
      await expect(page.locator('[data-testid="panel-settings"] h1')).toBeVisible({
        timeout: 30000,
      });

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
