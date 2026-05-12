/**
 * Stage 6 — Typed content model for the flipbook reader.
 *
 * The reader's renderer is intentionally decoupled from how content is
 * ingested. Whether pages come from in-memory demo data, a mock API, a real
 * EPUB parser, or a server-rendered chapter feed, they all flow through the
 * shapes in this module.
 *
 * Design notes:
 * - `FlipbookPage` extends what the renderer already consumed (id,
 *   pageNumber, content) with optional chapter/image/transcript metadata.
 *   Existing callers continue to compile because the new fields are
 *   optional.
 * - Transcript segments carry optional `startMs`/`endMs` so a future
 *   audiobook read-along can light up phrases as audio plays. Until real
 *   timing exists, the read-along subsystem stays gated off (see
 *   `use-readalong.ts`).
 * - `FlipbookLandmark` mirrors EPUB's structural landmarks (cover, toc,
 *   bodymatter, …) so an EPUB parser can map directly onto this model.
 */

export interface FlipbookChapter {
  /** Stable identifier (chapter id, EPUB spine idref, hash, …). */
  id: string;
  /** Display title for the chapter. */
  title: string;
  /** Page number this chapter starts on (1-indexed, matches FlipbookPage.pageNumber). */
  startPage: number;
  /** Optional ordering hint when the source emits chapters out of order. */
  order?: number;
}

/**
 * Read-along transcript segment for a single page.
 *
 * `startMs`/`endMs` are optional: when omitted the segment exists for layout
 * and selection purposes only and the read-along highlighter remains off.
 */
export interface TranscriptSegment {
  id: string;
  /** The visible text for this segment (a phrase, sentence, or word). */
  text: string;
  /** Character offset within the parent page's `content` (inclusive). */
  startOffset: number;
  /** Character offset within the parent page's `content` (exclusive). */
  endOffset: number;
  /** Audio start time in ms (audiobook timing data). */
  startMs?: number;
  /** Audio end time in ms (audiobook timing data). */
  endMs?: number;
}

export interface FlipbookImageMeta {
  src: string;
  alt: string;
  /** Optional caption rendered below the image. */
  caption?: string;
  width?: number;
  height?: number;
}

/**
 * Renderer-facing page shape. Backward compatible with the original
 * `{id, pageNumber, content}` contract used since Stage 1.
 */
export interface FlipbookPage {
  id: string;
  pageNumber: number;
  content: string;
  chapterId?: string;
  /** Resolved chapter title for display (derived once, not looked up per render). */
  chapterTitle?: string;
  /** Optional inline image for image-rich pages (poetry, picture books). */
  image?: FlipbookImageMeta;
  /** Optional transcript segments for read-along / selection. */
  segments?: TranscriptSegment[];
}

/**
 * EPUB-style structural landmark. The reader does not currently expose a
 * landmarks UI, but content providers can populate them so a future "Jump
 * to: cover / toc / bodymatter" menu plugs in without a refactor.
 */
export type FlipbookLandmarkType =
  | "cover"
  | "toc"
  | "bodymatter"
  | "bibliography"
  | "index"
  | "glossary"
  | "other";

export interface FlipbookLandmark {
  type: FlipbookLandmarkType;
  label: string;
  page: number;
}

/** Top-level content envelope returned by a content provider. */
export interface FlipbookBookContent {
  /** Stable book identifier matching the renderer's `bookKey`. */
  bookId: string;
  title: string;
  author?: string;
  language?: string;
  pages: FlipbookPage[];
  chapters: FlipbookChapter[];
  landmarks: FlipbookLandmark[];
  /**
   * True when the provider attached real per-segment audio timing to enough
   * pages for read-along highlighting to be worth enabling. Stays false for
   * the demo provider and any text-only EPUB.
   */
  hasReadAlongTiming: boolean;
}
