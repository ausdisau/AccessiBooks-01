/**
 * Stage 6 — Content provider abstraction.
 *
 * The flipbook reader never reaches into demo-specific shapes anymore. It
 * always asks a `FlipbookContentProvider` for a `FlipbookBookContent`
 * envelope and renders whatever it gets back. That same seam is what an
 * EPUB parser, a server-side chapter API, or an audiobook transcript feed
 * will plug into later — no renderer changes required.
 */

import type { Book } from "@shared/schema";
import type {
  FlipbookBookContent,
  FlipbookChapter,
  FlipbookLandmark,
  FlipbookPage,
} from "./flipbook-content-types";

export interface FlipbookContentProvider {
  /**
   * Resolve the full content envelope for a book. Implementations may be
   * sync-fast (in-memory) or genuinely async (network/parser); callers must
   * always treat this as a Promise and surface loading/error UI.
   */
  load(book: Book, signal?: AbortSignal): Promise<FlipbookBookContent>;
}

const DEMO_PARAGRAPHS = [
  "Welcome to the AccessiBooks flipbook reader. Stage 6 swaps the demo loader for a typed content provider so real book data and an EPUB pipeline can plug in without touching the renderer.",
  "Use the Read Aloud button in the toolbar — or press R — to listen to the current page. Press S to stop. Adjust the voice, speaking rate, pitch, and volume from the settings panel.",
  "Type at least two characters in the search field to scan every page. Press / to jump straight into the search field. The results list shows match counts per page and the first matching snippet — choose any result to jump there.",
  "Open the Settings panel with G or Annotations with A. Both panels share their state with the toolbar buttons and announce themselves to screen readers using polite live updates.",
  "Press F at any time to toggle Focus Mode. Surrounding controls quiet down, the reading column narrows, and the page itself gains a soft glow. Your choice is remembered the next time you open this book.",
  "Use the previous and next buttons in the toolbar, swipe on touch devices, or press the Left and Right arrow keys to turn pages. Page Up and Page Down work too, and Home or End jump to the first or last page.",
  "Open the keyboard shortcuts help from the toolbar or by pressing the question-mark key. Every binding is listed there with a clear description.",
  "When you have asked your operating system to reduce motion, the page-flip animation gracefully degrades to a quick fade so the reader stays comfortable.",
];

const DEMO_CHAPTER_BREAKS: Array<{ startPage: number; title: string }> = [
  { startPage: 1, title: "Welcome" },
  { startPage: 5, title: "Reading & Focus" },
  { startPage: 9, title: "Keyboard & Motion" },
];

function buildDemoPages(book: Book): FlipbookPage[] {
  const total = 12;
  return Array.from({ length: total }, (_, i) => {
    const pageNumber = i + 1;
    const para = DEMO_PARAGRAPHS[i % DEMO_PARAGRAPHS.length];
    const chapter =
      [...DEMO_CHAPTER_BREAKS]
        .reverse()
        .find((c) => pageNumber >= c.startPage) ?? DEMO_CHAPTER_BREAKS[0];
    return {
      id: `demo-${book.id}-${pageNumber}`,
      pageNumber,
      content: `${book.title} — sample chapter\n\n${para}\n\nThis is page ${pageNumber} of ${total}. Real book data and an EPUB pipeline will replace this in a future stage.`,
      chapterId: `demo-ch-${chapter.startPage}`,
      chapterTitle: chapter.title,
    };
  });
}

function buildDemoChapters(): FlipbookChapter[] {
  return DEMO_CHAPTER_BREAKS.map((c, i) => ({
    id: `demo-ch-${c.startPage}`,
    title: c.title,
    startPage: c.startPage,
    order: i,
  }));
}

function buildDemoLandmarks(): FlipbookLandmark[] {
  return [
    { type: "bodymatter", label: "Start reading", page: 1 },
    { type: "toc", label: "Table of contents", page: 1 },
  ];
}

/**
 * Default in-memory provider. Wraps the existing demo paragraphs so the
 * reader continues to render exactly the same content it did in Stage 5,
 * but now flowing through the typed content model.
 */
export const demoContentProvider: FlipbookContentProvider = {
  async load(book) {
    return {
      bookId: String(book.id),
      title: book.title,
      author: book.author ?? undefined,
      language: book.language ?? undefined,
      pages: buildDemoPages(book),
      chapters: buildDemoChapters(),
      landmarks: buildDemoLandmarks(),
      hasReadAlongTiming: false,
    };
  },
};

/**
 * Build an in-memory provider from a pre-resolved envelope. Useful for
 * tests, mock APIs, and Storybook fixtures. The renderer never has to know
 * the shape of the source — only that it eventually got a typed envelope.
 */
export function inMemoryContentProvider(
  content: FlipbookBookContent,
): FlipbookContentProvider {
  return {
    async load() {
      return content;
    },
  };
}
