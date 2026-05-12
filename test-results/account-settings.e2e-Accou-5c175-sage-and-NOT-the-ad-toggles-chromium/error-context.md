# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: account-settings.e2e.spec.ts >> Account & Settings page — Plus/Premium user (real auth) >> plus user sees the ad-free message and NOT the ad toggles
- Location: tests/account-settings.e2e.spec.ts:211:5

# Error details

```
Error: Register failed (500): {"message":"Registration failed"}
```

# Test source

```ts
  1   | /**
  2   |  * Browser-level e2e tests for the Account & Settings page.
  3   |  *
  4   |  * These tests drive the REAL backend — each test registers a fresh local-auth
  5   |  * user via POST /api/auth/register, optionally upgrades their tier through the
  6   |  * dev-only /api/dev/set-tier seam (gated by NODE_ENV !== "production"), then
  7   |  * navigates to /settings and exercises the page through the browser.
  8   |  *
  9   |  * What we assert end-to-end:
  10  |  *   - The page renders for an authenticated session and surfaces the user's
  11  |  *     real subscription tier (Free vs Plus/Premium UI fork).
  12  |  *   - Toggling controls fires PUT /api/a11y/preferences against the live
  13  |  *     backend and the values persist across a page refresh.
  14  |  *   - The HTTP API contract (deep-merge, partial patches, 401s, etc.) is
  15  |  *     covered separately by tests/account-settings.test.ts.
  16  |  *
  17  |  * Run (server must already be running on :5000):
  18  |  *   TEST_BASE_URL=http://localhost:5000 npx playwright test
  19  |  */
  20  | import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
  21  | 
  22  | const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";
  23  | 
  24  | /**
  25  |  * Register a fresh user against the real backend and return their session
  26  |  * cookies (parsed from set-cookie). Optionally upgrade the user's tier via
  27  |  * the dev-only /api/dev/set-tier endpoint.
  28  |  */
  29  | async function registerRealUser(
  30  |   request: APIRequestContext,
  31  |   tier: "free" | "plus" | "premium",
  32  | ): Promise<{ email: string; cookies: Array<{ name: string; value: string; url: string }> }> {
  33  |   const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  34  |   const email = `e2e-${tier}-${stamp}@accessibooks.test`;
  35  |   const password = "E2eTest!Password123";
  36  | 
  37  |   const reg = await request.post(`${BASE_URL}/api/auth/register`, {
  38  |     data: { email, password, firstName: tier, lastName: "User" },
  39  |   });
  40  |   if (!reg.ok()) {
> 41  |     throw new Error(
      |           ^ Error: Register failed (500): {"message":"Registration failed"}
  42  |       `Register failed (${reg.status()}): ${await reg.text().catch(() => "<no body>")}`,
  43  |     );
  44  |   }
  45  | 
  46  |   // Capture session cookies so we can hand them to the browser context.
  47  |   const setCookies = reg.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
  48  |   const cookies = setCookies.map((h) => {
  49  |     const [pair] = h.value.split(";");
  50  |     const eq = pair.indexOf("=");
  51  |     return {
  52  |       name: pair.slice(0, eq).trim(),
  53  |       value: pair.slice(eq + 1).trim(),
  54  |       url: BASE_URL,
  55  |     };
  56  |   });
  57  | 
  58  |   if (tier !== "free") {
  59  |     const setTier = await request.post(`${BASE_URL}/api/dev/set-tier`, {
  60  |       data: { tier },
  61  |       headers: { Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") },
  62  |     });
  63  |     if (!setTier.ok()) {
  64  |       throw new Error(
  65  |         `set-tier failed (${setTier.status()}): ${await setTier.text().catch(() => "<no body>")}`,
  66  |       );
  67  |     }
  68  |   }
  69  | 
  70  |   return { email, cookies };
  71  | }
  72  | 
  73  | /** Apply session cookies to the page's browser context BEFORE navigation. */
  74  | async function applyCookies(
  75  |   page: Page,
  76  |   cookies: Array<{ name: string; value: string; url: string }>,
  77  | ) {
  78  |   await page.context().addCookies(cookies);
  79  |   // Also suppress the first-visit "Welcome bonus" modal which overlays the
  80  |   // controls under test on a brand-new account.
  81  |   await page.addInitScript(() => {
  82  |     try {
  83  |       localStorage.setItem("accessibooks_welcome_shown", "1");
  84  |     } catch {}
  85  |   });
  86  | }
  87  | 
  88  | test.describe("Account & Settings page — Free user (real auth)", () => {
  89  |   test("renders the ad-preference toggles, NOT the ad-free message", async ({ page, request }) => {
  90  |     const { cookies } = await registerRealUser(request, "free");
  91  |     await applyCookies(page, cookies);
  92  | 
  93  |     await page.goto("/settings");
  94  |     await expect(page.getByTestId("panel-settings")).toBeAttached({ timeout: 30000 });
  95  |     await expect(page.locator('[data-testid="panel-settings"] h1')).toHaveText(
  96  |       "Account Settings",
  97  |       { timeout: 30000 },
  98  |     );
  99  | 
  100 |     // No green "Ad-free" badge for free tier
  101 |     await expect(page.getByRole("note", { name: /ad-free/i })).toHaveCount(0);
  102 | 
  103 |     // The ad-preferences toggle controls ARE rendered
  104 |     await expect(page.locator("#suppress-animated")).toBeVisible();
  105 |     await expect(page.locator("#rewarded-ask")).toBeVisible();
  106 |     await expect(page.locator("#rewarded-always")).toBeVisible();
  107 |     await expect(page.locator("#rewarded-never")).toBeVisible();
  108 | 
  109 |     // Plus/Premium fork message must NOT appear
  110 |     await expect(page.getByText(/you're listening ad-free/i)).toHaveCount(0);
  111 | 
  112 |     // Upgrade CTAs are visible for free users
  113 |     await expect(page.getByRole("button", { name: /upgrade to plus/i })).toBeVisible();
  114 |     await expect(page.getByRole("button", { name: /upgrade to premium/i })).toBeVisible();
  115 |   });
  116 | 
  117 |   test("toggles persist to the real backend across a page refresh", async ({ page, request }) => {
  118 |     const { cookies } = await registerRealUser(request, "free");
  119 |     await applyCookies(page, cookies);
  120 | 
  121 |     await page.goto("/settings");
  122 |     await expect(page.locator('[data-testid="panel-settings"] h1')).toBeVisible({
  123 |       timeout: 30000,
  124 |     });
  125 | 
  126 |     // The page's saveMutation is debounced via a SHARED 500ms timer, so we
  127 |     // pace each change with a small pause to ensure each PUT actually fires.
  128 |     const pause = () => page.waitForTimeout(700);
  129 | 
  130 |     // Toggle EVERY control on the Settings page — switches, the rewarded-ad
  131 |     // radio group, every select. The shared 500 ms debounce means we have to
  132 |     // pace each change with a small pause; otherwise back-to-back changes
  133 |     // coalesce into a single PUT and earlier values get dropped.
  134 |     await page.locator("#suppress-animated").click();
  135 |     await pause();
  136 | 
  137 |     await page.locator("#auto-advance").click(); // default ON -> OFF
  138 |     await pause();
  139 | 
  140 |     await page.locator("#transcript-default").click();
  141 |     await pause();
```