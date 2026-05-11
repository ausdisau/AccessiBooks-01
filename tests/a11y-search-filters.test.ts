/**
 * Backend coverage for the Task #69 search facets:
 *   - narrationType (human | ai)
 *   - chapterLength (short | medium | long)
 *   - transcriptAvailable
 *
 * Verifies that /api/books/search accepts the new filter query parameters
 * and that the response respects them. We don't seed fixture rows — we
 * just assert the contract: each filter narrows (or leaves unchanged)
 * the result set and the endpoint never throws when the new params are
 * combined with a real query string.
 *
 * Run: TEST_BASE_URL=http://localhost:5000 npx tsx tests/a11y-search-filters.test.ts
 */

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";
const WAIT_TIMEOUT_MS = Number(process.env.SERVER_WAIT_MS ?? 30_000);
const POLL_INTERVAL_MS = 500;

class AssertError extends Error {}
let pass = 0;
let fail = 0;

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new AssertError(message);
}

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    fail += 1;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  FAIL  ${name}`);
    console.log(`        ${msg}`);
  }
}

async function waitForServer(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/providers`, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return true;
    } catch {}
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

async function searchJson(qs: string): Promise<any[]> {
  const res = await fetch(`${BASE_URL}/api/books/search?${qs}`);
  assert(res.ok, `search returned ${res.status}`);
  const body = await res.json();
  assert(Array.isArray(body), "search response should be an array");
  return body;
}

(async () => {
  console.log(`\n[task-69] /api/books/search facet tests against ${BASE_URL}\n`);

  const ready = await waitForServer(WAIT_TIMEOUT_MS);
  if (!ready) {
    console.error("Server did not become ready in time");
    process.exit(1);
  }

  await test("base search returns array (no filters)", async () => {
    const results = await searchJson("q=the");
    assert(Array.isArray(results), "results must be an array");
  });

  await test("narrationType=human is accepted and never returns ai", async () => {
    const results = await searchJson("q=the&narrationType=human");
    for (const b of results) {
      if (b.narrationType !== undefined && b.narrationType !== null) {
        assert(b.narrationType === "human", `unexpected narrationType ${b.narrationType}`);
      }
    }
  });

  await test("narrationType=ai is accepted and never returns human", async () => {
    const results = await searchJson("q=the&narrationType=ai");
    for (const b of results) {
      if (b.narrationType !== undefined && b.narrationType !== null) {
        assert(b.narrationType === "ai", `unexpected narrationType ${b.narrationType}`);
      }
    }
  });

  await test("invalid narrationType is silently ignored (does not 400)", async () => {
    // Should fall back to no narration filter rather than crashing.
    const res = await fetch(`${BASE_URL}/api/books/search?q=the&narrationType=garbage`);
    assert(res.ok, `expected 2xx, got ${res.status}`);
  });

  await test("chapterLength=short keeps only short audiobooks (<5h)", async () => {
    const results = await searchJson("q=the&chapterLength=short");
    for (const b of results) {
      if (b.contentType === "audiobook" && b.duration && b.duration > 0) {
        assert(b.duration / 3600 < 5, `expected <5h, got ${b.duration / 3600}h`);
      }
    }
  });

  await test("chapterLength=long keeps only long audiobooks (>15h)", async () => {
    const results = await searchJson("q=the&chapterLength=long");
    for (const b of results) {
      if (b.contentType === "audiobook" && b.duration && b.duration > 0) {
        assert(b.duration / 3600 > 15, `expected >15h, got ${b.duration / 3600}h`);
      }
    }
  });

  await test("transcriptAvailable=true keeps only books with transcript", async () => {
    const results = await searchJson("q=the&transcriptAvailable=true");
    for (const b of results) {
      assert(b.transcriptAvailable === true, `expected transcriptAvailable true, got ${b.transcriptAvailable}`);
    }
  });

  await test("combined filters (narration + transcript) compose correctly", async () => {
    const results = await searchJson("q=the&narrationType=human&transcriptAvailable=true");
    for (const b of results) {
      assert(b.transcriptAvailable === true, "transcriptAvailable must be true");
      if (b.narrationType !== undefined && b.narrationType !== null) {
        assert(b.narrationType === "human", `unexpected narrationType ${b.narrationType}`);
      }
    }
  });

  await test("missing query still returns 400", async () => {
    const res = await fetch(`${BASE_URL}/api/books/search?narrationType=human`);
    assert(res.status === 400, `expected 400, got ${res.status}`);
  });

  console.log(`\n[task-69] ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
})();
