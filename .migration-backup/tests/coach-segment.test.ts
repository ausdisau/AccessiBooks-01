/**
 * Tests for the inline transcript coach (Task #68).
 *
 *   POST /api/coach/segment
 *     - 400 when text is missing
 *     - 400 when text exceeds 2000 chars
 *     - 200 with { mode, content } for a valid simplify request
 *     - 200 with { mode, content } for a valid explain request
 *     - When OpenAI is not configured, returns the documented fallback
 *       string (still 200) so the UI degrades gracefully instead of
 *       erroring per click.
 *
 * Run: TEST_BASE_URL=http://localhost:5000 npx tsx tests/coach-segment.test.ts
 */

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";
const WAIT_TIMEOUT_MS = Number(process.env.SERVER_WAIT_MS ?? 30_000);
const POLL_INTERVAL_MS = 500;

type FetchOpts = { method?: string; body?: unknown };

async function request(path: string, opts: FetchOpts = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  return fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body,
  });
}

async function waitForServer(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/providers`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.status < 500) return true;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

async function runTests() {
  const results: { name: string; passed: boolean; error?: string }[] = [];

  function test(name: string, fn: () => Promise<void>) {
    return fn()
      .then(() => results.push({ name, passed: true }))
      .catch((err: Error) => results.push({ name, passed: false, error: err.message }));
  }

  console.log(`Waiting for server at ${BASE_URL} (up to ${WAIT_TIMEOUT_MS / 1000}s)...`);
  const ready = await waitForServer(WAIT_TIMEOUT_MS);
  if (!ready) {
    console.error(`\n[ERROR] Server at ${BASE_URL} not reachable.\n`);
    process.exit(1);
  }
  console.log("Server is up. Running tests...\n");

  await test("POST /api/coach/segment returns 400 when text is missing", async () => {
    const res = await request("/api/coach/segment", { method: "POST", body: { mode: "explain" } });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const body = (await res.json()) as { error?: string };
    if (!body.error) throw new Error("Expected error field on 400");
  });

  await test("POST /api/coach/segment returns 400 when text is empty string", async () => {
    const res = await request("/api/coach/segment", { method: "POST", body: { text: "   " } });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  await test("POST /api/coach/segment returns 400 when text exceeds 2000 chars", async () => {
    const big = "a".repeat(2001);
    const res = await request("/api/coach/segment", { method: "POST", body: { text: big, mode: "simplify" } });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  await test("POST /api/coach/segment 200 + content for simplify", async () => {
    const res = await request("/api/coach/segment", {
      method: "POST",
      body: { text: "It was the best of times, it was the worst of times.", mode: "simplify" },
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = (await res.json()) as { mode?: string; content?: string };
    if (body.mode !== "simplify") throw new Error(`mode should be 'simplify', got ${String(body.mode)}`);
    if (typeof body.content !== "string" || body.content.length === 0) {
      throw new Error("content should be a non-empty string (real or fallback)");
    }
  });

  await test("POST /api/coach/segment 200 + content for explain (default mode)", async () => {
    const res = await request("/api/coach/segment", {
      method: "POST",
      body: { text: "She turned the page and gasped at what she read." },
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = (await res.json()) as { mode?: string; content?: string };
    if (body.mode !== "explain") throw new Error(`mode should default to 'explain', got ${String(body.mode)}`);
    if (typeof body.content !== "string" || body.content.length === 0) {
      throw new Error("content should be a non-empty string");
    }
  });

  await test("POST /api/coach/segment accepts optional context field", async () => {
    const res = await request("/api/coach/segment", {
      method: "POST",
      body: {
        text: "He nodded in reply.",
        mode: "explain",
        context: "Earlier, she had asked if he was ready to leave.",
      },
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  // ── Report ──────────────────────────────────────────────────────────────
  console.log("\n=== Coach segment test results ===");
  let failed = 0;
  for (const r of results) {
    if (r.passed) {
      console.log(`  PASS  ${r.name}`);
    } else {
      failed += 1;
      console.log(`  FAIL  ${r.name}`);
      if (r.error) console.log(`        ${r.error}`);
    }
  }
  console.log(`\n${results.length - failed} passed, ${failed} failed, ${results.length} total\n`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
