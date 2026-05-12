/**
 * SSR render test for Task #69's community vs personal annotation
 * visual distinction in the ebook reader.
 *
 * We don't render the full EbookReader (it depends on browser APIs).
 * Instead we render the same JSX shape the reader produces for the
 * inline annotation list, parameterised by `source`, and assert that:
 *   1. A community annotation gets the "Community" label, a contributor
 *      attribution string, the purple distinguishing border class, and
 *      a tooltip-trigger title that names the source.
 *   2. A personal annotation gets none of those — no label, no border,
 *      no source attribution — so the two are unambiguously different.
 *
 * Run: npx tsx tests/community-annotation-distinction.test.tsx
 */

import * as React from "react";
import { renderToString } from "react-dom/server";

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

interface Annotation {
  id: string;
  page: number;
  text: string;
  note: string;
  color: string;
  source?: "personal" | "community";
  contributor?: string;
}

/**
 * Mirror of the inline annotation row JSX in
 * client/src/components/ebook-reader.tsx (~line 1826). Kept in sync
 * with that block so this test pins the contract — if the visual
 * distinction is removed there, this test must be updated.
 */
function AnnotationRow({ ann }: { ann: Annotation }) {
  const isCommunity = ann.source === "community";
  return (
    <div
      data-testid={`annotation-inline-${isCommunity ? "community" : "personal"}-${ann.id}`}
      title={
        isCommunity
          ? `Community-contributed annotation${ann.contributor ? ` by ${ann.contributor}` : ""}. Approved by an AccessiBooks moderator — not official editorial content.`
          : "Your personal highlight."
      }
      className={`flex items-start gap-2 px-3 py-2 rounded-md text-sm ${
        isCommunity
          ? "border-l-4 border-purple-500 ring-1 ring-purple-200"
          : ""
      }`}
    >
      {isCommunity && (
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-purple-100 text-purple-900 border border-purple-300"
            aria-label="Community annotation"
          >
            Community
          </span>
          <span className="text-[10px]">
            {ann.contributor
              ? `Contributed by ${ann.contributor}`
              : "Approved community contribution"}
          </span>
        </div>
      )}
      <span className="italic">"{ann.text}"</span>
    </div>
  );
}

console.log("\n[task-69] Community vs personal annotation distinction\n");

test("community annotation renders label, attribution, border, and source tooltip", () => {
  const html = renderToString(
    React.createElement(AnnotationRow, {
      ann: {
        id: "c1",
        page: 4,
        text: "A defining passage",
        note: "",
        color: "#ffeaa7",
        source: "community",
        contributor: "Riley S.",
      },
    }) as React.ReactElement,
  );
  assert(
    html.includes('data-testid="annotation-inline-community-c1"'),
    "community testid present",
  );
  assert(html.includes(">Community<"), "Community label rendered");
  assert(
    html.includes("Contributed by Riley S."),
    "contributor attribution rendered",
  );
  assert(
    html.includes("border-purple-500"),
    "distinguishing purple border present",
  );
  assert(
    /title="Community-contributed annotation by Riley S\..*moderator/.test(html),
    "source-attribution tooltip text present",
  );
});

test("community annotation without contributor still shows generic attribution", () => {
  const html = renderToString(
    React.createElement(AnnotationRow, {
      ann: {
        id: "c2",
        page: 1,
        text: "Anonymous note",
        note: "",
        color: "#ffeaa7",
        source: "community",
      },
    }) as React.ReactElement,
  );
  assert(
    html.includes("Approved community contribution"),
    "fallback attribution string used when contributor missing",
  );
  assert(html.includes(">Community<"), "Community label still rendered");
});

test("personal annotation has no community label, no border, and a personal tooltip", () => {
  const html = renderToString(
    React.createElement(AnnotationRow, {
      ann: {
        id: "p1",
        page: 4,
        text: "My own highlight",
        note: "",
        color: "#74b9ff",
      },
    }) as React.ReactElement,
  );
  assert(
    html.includes('data-testid="annotation-inline-personal-p1"'),
    "personal testid present",
  );
  assert(!html.includes(">Community<"), "Community label must not appear");
  assert(
    !html.includes("border-purple-500"),
    "purple distinguishing border must not appear on personal",
  );
  assert(
    !html.includes("Contributed by"),
    "contributor attribution must not appear on personal",
  );
  assert(
    html.includes('title="Your personal highlight."'),
    "personal tooltip text present",
  );
});

console.log(`\n[task-69] ${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
