import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for AccessiBooks e2e tests.
 *
 * Tests live in `tests/` and only files matching *.e2e.spec.ts are picked up
 * here so the existing tsx-based HTTP test files (e.g. google-oauth.test.ts)
 * are not double-collected.
 *
 * The dev server (npm run dev) must already be running on PORT 5000 — this
 * matches the existing project workflow. We do NOT spawn one from
 * Playwright because the project's single-port Vite+Express setup is already
 * managed by the `Start application` workflow.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.e2e\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:5000",
    trace: "off",
    screenshot: "only-on-failure",
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
