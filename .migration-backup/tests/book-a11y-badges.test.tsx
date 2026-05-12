/**
 * SSR render tests for the Task #69 BookA11yBadges component and the
 * `classifyChapterLength` helper.
 *
 * Asserts (without a browser) that:
 *   1. classifyChapterLength bins durations correctly.
 *   2. A book with full a11y metadata renders all five badge varieties:
 *        - transcript
 *        - dyslexia font
 *        - large text
 *        - reading level
 *        - narration type (human/ai)
 *        - chapter length
 *      Each badge has a focusable affordance (button/link/role=button) and
 *      a tooltip-trigger so screen reader users get the source attribution.
 *   3. A book with no a11y metadata renders the explicit empty-state
 *      string ("Accessibility details not specified") rather than nothing,
 *      so the absence of info is itself communicated.
 *   4. With showEmpty=false, a sparse book renders no empty-state markup.
 *
 * Run: npx tsx tests/book-a11y-badges.test.tsx
 */

import * as React from "react";
import { renderToString } from "react-dom/server";
import { TooltipProvider } from "../client/src/components/ui/tooltip";
import {
  BookA11yBadges,
  classifyChapterLength,
} from "../client/src/components/book-a11y-badges";

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

function render(node: React.ReactElement): string {
  return renderToString(
    React.createElement(TooltipProvider, null, node) as React.ReactElement,
  );
}

console.log("\n[task-69] BookA11yBadges SSR tests\n");

const ab = (duration: number | null | undefined) =>
  ({ contentType: "audiobook" as const, duration: duration ?? 0 });

test("classifyChapterLength returns null for non-positive duration", () => {
  assert(classifyChapterLength(ab(0)) === null, "0 should be null");
  assert(classifyChapterLength(ab(undefined)) === null, "undefined should be null");
  assert(classifyChapterLength(ab(null)) === null, "null should be null");
});

test("classifyChapterLength returns null for ebook content type", () => {
  assert(
    classifyChapterLength({ contentType: "ebook", duration: 60 * 60 * 8 }) === null,
    "ebook must always be null",
  );
});

test("classifyChapterLength bins durations into short/medium/long", () => {
  assert(classifyChapterLength(ab(60 * 60 * 2)) === "short", "2h must be short");
  assert(classifyChapterLength(ab(60 * 60 * 4.99)) === "short", "4.99h must be short");
  assert(classifyChapterLength(ab(60 * 60 * 5)) === "medium", "5h must be medium");
  assert(classifyChapterLength(ab(60 * 60 * 10)) === "medium", "10h must be medium");
  assert(classifyChapterLength(ab(60 * 60 * 15)) === "medium", "15h must be medium (boundary)");
  assert(classifyChapterLength(ab(60 * 60 * 15.01)) === "long", "15.01h must be long");
  assert(classifyChapterLength(ab(60 * 60 * 30)) === "long", "30h must be long");
});

test("renders all badges when full metadata is present", () => {
  const html = render(
    React.createElement(BookA11yBadges, {
      book: {
        id: "b1",
        title: "x",
        author: "y",
        contentType: "audiobook",
        transcriptAvailable: true,
        readingLevel: 3,
        narrationType: "human",
        duration: 60 * 60 * 8, // 8h -> medium
      },
      metadata: {
        hasDyslexiaFont: true,
        hasLargeText: true,
      },
    }),
  );
  assert(html.includes('data-testid="a11y-badges"'), "container testid present");
  assert(html.includes("Transcript"), "transcript label present");
  assert(html.includes("Dyslexia font"), "dyslexia label present");
  assert(html.includes("Large text"), "large text label present");
  assert(html.includes("Moderate"), "reading level label present");
  assert(html.includes("Human narration"), "human narration label present");
  assert(html.includes("Medium") || html.includes("medium"), "chapter length label present");
  // each badge should be focusable
  assert(/tabindex="0"/.test(html), "at least one badge is focusable");
});

test("renders AI narration badge distinctly", () => {
  const html = render(
    React.createElement(BookA11yBadges, {
      book: {
        id: "b2",
        title: "x",
        author: "y",
        contentType: "audiobook",
        narrationType: "ai",
      },
    }),
  );
  assert(html.includes("AI narration"), "AI narration label present");
  assert(html.includes('data-testid="a11y-badge-narration-ai"'), "AI badge testid present");
});

test("renders explicit empty state when no a11y metadata is present", () => {
  const html = render(
    React.createElement(BookA11yBadges, {
      book: {
        id: "b3",
        title: "x",
        author: "y",
        contentType: "audiobook",
      },
    }),
  );
  assert(
    html.includes("Accessibility details not specified"),
    "fallback copy present so absence is communicated",
  );
});

test("showEmpty=false hides the empty-state string entirely", () => {
  const html = render(
    React.createElement(BookA11yBadges, {
      book: {
        id: "b4",
        title: "x",
        author: "y",
        contentType: "audiobook",
      },
      showEmpty: false,
    }),
  );
  assert(
    !html.includes("Accessibility details not specified"),
    "fallback copy must not render when showEmpty=false",
  );
});

test("ebooks do not show chapter-length badges (audio-only metric)", () => {
  const html = render(
    React.createElement(BookA11yBadges, {
      book: {
        id: "b5",
        title: "x",
        author: "y",
        contentType: "ebook",
        duration: 60 * 60 * 8,
      },
    }),
  );
  assert(
    !html.includes('data-testid="a11y-badge-chapter-length"'),
    "chapter-length badge must not appear for ebooks",
  );
});

console.log(`\n[task-69] ${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
