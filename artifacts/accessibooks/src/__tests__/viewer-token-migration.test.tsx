import { describe, it, expect, vi } from "vitest";

// jsdom lacks DOMMatrix/Path2D, which pdfjs-dist touches at import time.
class DOMMatrixStub {}
(globalThis as any).DOMMatrix ??= DOMMatrixStub;
(globalThis as any).Path2D ??= class Path2D {};

// Compile/import smoke test for the semantic-token migration in the three viewers.
vi.mock("@/lib/queryClient", () => ({
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), clear: vi.fn() },
  apiRequest: vi.fn(async () => new Response("{}", { status: 200 })),
}));

describe("viewer token migration compiles", () => {
  it("imports all three viewers without errors", async () => {
    const epub = await import("@/components/epub-viewer");
    const pdf = await import("@/components/pdf-viewer");
    const tts = await import("@/components/tts-player");
    expect(epub).toBeTruthy();
    expect(pdf).toBeTruthy();
    expect(tts).toBeTruthy();
  });
});
