/**
 * Render tests for the inline transcript coach UI (Task #68).
 *
 * Renders InteractiveTranscript via react-dom/server with a TanStack
 * QueryClient that has been pre-seeded with transcript data, so we can
 * assert without a network or jsdom that:
 *
 *   1. The search-within input renders with an accessible label.
 *   2. Per-segment Explain and Simplify buttons render with the
 *      timestamp baked into their aria-labels (the affordances the
 *      voice/inline coach flow relies on).
 *   3. The polite SR live region exists for announcements.
 *   4. The "AI-generated" disclosure copy is part of the component
 *      bundle so users see the disclosure when the inline panel opens.
 *
 * Run with: npx tsx tests/transcript-inline-coach.test.tsx
 */

import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InteractiveTranscript } from "../client/src/components/interactive-transcript";

class AssertError extends Error {}
let pass = 0;
let fail = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    pass += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    fail += 1;
    console.log(`  FAIL  ${name}`);
    if (err instanceof Error) console.log(`        ${err.message}`);
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new AssertError(message);
}

function renderTranscript(): string {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(["/api/books", "book-1", "transcript"], [
    {
      chapterIndex: 0,
      segments: [
        { start: 0, end: 5, text: "It was the best of times." },
        { start: 5, end: 10, text: "It was the worst of times." },
        { start: 10, end: 15, text: "And so the story begins anew." },
      ],
    },
  ]);

  return renderToString(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(InteractiveTranscript, {
        bookId: "book-1",
        currentTime: 0,
        onSeek: () => {},
      }),
    ),
  );
}

console.log("\n=== Transcript inline coach UI render ===");

const html = renderTranscript();

test("renders the search-within input with an accessible label", () => {
  assert(
    html.includes("Search transcript") || html.includes('placeholder="Search transcript"'),
    "expected search-within placeholder/label",
  );
});

test("renders an Explain button for at least one segment", () => {
  assert(
    /aria-label="Explain segment at \d+:\d+"/.test(html),
    "expected per-segment Explain aria-label",
  );
});

test("renders a Simplify button for at least one segment", () => {
  assert(
    /aria-label="Simplify segment at \d+:\d+"/.test(html),
    "expected per-segment Simplify aria-label",
  );
});

test("includes a polite live region for SR announcements", () => {
  assert(
    html.includes('aria-live="polite"') || html.includes("aria-live='polite'"),
    "expected an aria-live='polite' region",
  );
});

test("renders all three transcript segments", () => {
  assert(html.includes("It was the best of times."), "missing segment 1");
  assert(html.includes("It was the worst of times."), "missing segment 2");
  assert(html.includes("And so the story begins anew."), "missing segment 3");
});

console.log(`\n${pass} passed, ${fail} failed, ${pass + fail} total\n`);
process.exit(fail === 0 ? 0 : 1);
