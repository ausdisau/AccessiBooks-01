import type { FlipbookPage } from "./flipbook-types";

export interface PageMatch {
  start: number;
  end: number;
}

export interface PageSearchResult {
  pageNumber: number;
  pageId: string;
  matchCount: number;
  matches: PageMatch[];
  snippet: string;
}

export interface SearchSummary {
  query: string;
  totalMatches: number;
  pages: PageSearchResult[];
}

const SNIPPET_RADIUS = 40;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Locate every occurrence of `query` in the given pages. Case-insensitive,
 * literal substring match (no regex syntax exposed to the user). Empty or
 * whitespace queries return an empty summary.
 */
export function searchPages(pages: FlipbookPage[], query: string): SearchSummary {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { query: trimmed, totalMatches: 0, pages: [] };
  }
  const re = new RegExp(escapeRegExp(trimmed), "gi");
  const results: PageSearchResult[] = [];
  let total = 0;
  for (const page of pages) {
    const matches: PageMatch[] = [];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(page.content)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length });
      // Defensive: zero-length match would loop forever (shouldn't happen here).
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (matches.length === 0) continue;
    const first = matches[0];
    const snippet = buildSnippet(page.content, first.start, first.end);
    results.push({
      pageNumber: page.pageNumber,
      pageId: page.id,
      matchCount: matches.length,
      matches,
      snippet,
    });
    total += matches.length;
  }
  return { query: trimmed, totalMatches: total, pages: results };
}

function buildSnippet(text: string, start: number, end: number): string {
  const from = Math.max(0, start - SNIPPET_RADIUS);
  const to = Math.min(text.length, end + SNIPPET_RADIUS);
  const prefix = from > 0 ? "…" : "";
  const suffix = to < text.length ? "…" : "";
  return prefix + text.slice(from, to).replace(/\s+/g, " ").trim() + suffix;
}

export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

/**
 * Slice a page's content into alternating plain and matched segments, suitable
 * for rendering with <mark> for the matches. Returns a single non-match
 * segment if `matches` is empty.
 */
export function buildHighlightSegments(
  text: string,
  matches: PageMatch[],
): HighlightSegment[] {
  if (matches.length === 0) return [{ text, isMatch: false }];
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) {
      segments.push({ text: text.slice(cursor, m.start), isMatch: false });
    }
    segments.push({ text: text.slice(m.start, m.end), isMatch: true });
    cursor = m.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isMatch: false });
  }
  return segments;
}
