import { vi, beforeAll, afterAll } from "vitest";

// The narration module transitively imports "@workspace/db", whose main barrel
// throws unless DATABASE_URL is set and constructs a (lazy, never-connected) pg
// Pool. Route tests mock "@workspace/db" down to its side-effect-free ./schema
// subpath, but set a dummy URL as belt-and-suspenders so no import path throws.
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test_db";

// Narration reads the public bucket root from this; without it, generation
// short-circuits to a 503 / "Object storage not configured" job failure.
process.env.PUBLIC_OBJECT_SEARCH_PATHS ??= "/test-bucket/narration";

// The narration failure path logs via console.error/warn by design. Silence it
// so expected-failure tests don't flood the test output; test assertions do not
// depend on console.
let errSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => {
  errSpy?.mockRestore();
  warnSpy?.mockRestore();
});
