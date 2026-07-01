// ---------------------------------------------------------------------------
// Pure text + timing helpers for AI narration generation.
//
// Extracted from narration.ts so they can be unit-tested in isolation. Every
// import here is type-only (erased at runtime), so this module pulls in NO
// runtime dependencies — no DB, object storage, or ElevenLabs client — and can
// be imported directly by tests without mocking that graph.
// ---------------------------------------------------------------------------
import type { TranscriptSegment, TranscriptWordTiming } from "@workspace/db";
import type { CharacterAlignment } from "./replit_integrations/audio/elevenlabs";

// Abuse / cost controls.
export const MAX_TOTAL_CHARS = 600_000; // ~hard cap on book text we will synthesize
export const MAX_CHAPTERS = 60; // cap chapters per book
export const CHARS_PER_SYNTHETIC_CHAPTER = 9_000; // when no headings are detected
export const TTS_SUBCHUNK_CHARS = 2_500; // ElevenLabs safe per-request size

export interface Chapter {
  number: number;
  title: string;
  text: string;
}

const CHAPTER_HEADING_REGEX = /^\s{0,6}(chapter|part|book|section|canto|act)\b[^\n]{0,80}$/gim;

export function splitIntoChapters(rawText: string): Chapter[] {
  let text = rawText.replace(/\r\n/g, "\n").trim();
  if (text.length > MAX_TOTAL_CHARS) {
    text = text.slice(0, MAX_TOTAL_CHARS);
  }

  // 1) Try heading-based splitting.
  const headings: Array<{ index: number; title: string }> = [];
  let match: RegExpExecArray | null;
  CHAPTER_HEADING_REGEX.lastIndex = 0;
  while ((match = CHAPTER_HEADING_REGEX.exec(text)) !== null) {
    headings.push({ index: match.index, title: match[0].trim().replace(/\s+/g, " ") });
    if (headings.length > MAX_CHAPTERS * 4) break; // safety against pathological input
  }

  const chapters: Chapter[] = [];
  if (headings.length >= 2) {
    for (let i = 0; i < headings.length; i++) {
      const start = headings[i].index;
      const end = i + 1 < headings.length ? headings[i + 1].index : text.length;
      const body = text.slice(start, end).trim();
      if (body.length < 40) continue; // skip empty/duplicate heading lines
      chapters.push({ number: chapters.length + 1, title: headings[i].title.slice(0, 200), text: body });
      if (chapters.length >= MAX_CHAPTERS) break;
    }
  }

  // 2) Fallback: synthetic chunking by character budget at sentence boundaries.
  if (chapters.length === 0) {
    let remaining = text;
    while (remaining.length > 0 && chapters.length < MAX_CHAPTERS) {
      if (remaining.length <= CHARS_PER_SYNTHETIC_CHAPTER) {
        chapters.push({ number: chapters.length + 1, title: `Part ${chapters.length + 1}`, text: remaining.trim() });
        break;
      }
      let splitAt = remaining.lastIndexOf(". ", CHARS_PER_SYNTHETIC_CHAPTER);
      if (splitAt === -1 || splitAt < CHARS_PER_SYNTHETIC_CHAPTER / 2) splitAt = CHARS_PER_SYNTHETIC_CHAPTER;
      else splitAt += 1;
      chapters.push({ number: chapters.length + 1, title: `Part ${chapters.length + 1}`, text: remaining.slice(0, splitAt).trim() });
      remaining = remaining.slice(splitAt).trim();
    }
  }

  return chapters;
}

export function splitIntoSubChunks(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    if (remaining.length <= TTS_SUBCHUNK_CHARS) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf(". ", TTS_SUBCHUNK_CHARS);
    if (splitAt === -1 || splitAt < TTS_SUBCHUNK_CHARS / 2) splitAt = TTS_SUBCHUNK_CHARS;
    else splitAt += 1;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  return chunks;
}

// Convert ElevenLabs character-level alignment into word timings. Times are in
// seconds; `offsetSeconds` shifts a sub-chunk's local timeline onto the
// concatenated chapter audio timeline.
export function wordsFromAlignment(a: CharacterAlignment, offsetSeconds: number): TranscriptWordTiming[] {
  const chars = a.characters || [];
  const starts = a.character_start_times_seconds || [];
  const ends = a.character_end_times_seconds || [];
  const words: TranscriptWordTiming[] = [];
  let cur = "";
  let curStart = -1;
  let curEnd = -1;
  const flush = () => {
    const t = cur.trim();
    if (t && curStart >= 0) {
      words.push({ text: t, start: curStart + offsetSeconds, end: Math.max(curEnd, curStart) + offsetSeconds });
    }
    cur = "";
    curStart = -1;
    curEnd = -1;
  };
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    const s = Number.isFinite(starts[i]) ? starts[i] : curEnd >= 0 ? curEnd : 0;
    const e = Number.isFinite(ends[i]) ? ends[i] : s;
    if (curStart < 0) curStart = s;
    curEnd = e;
    cur += ch;
  }
  flush();
  return words;
}

// Group flat word timings into sentence-level segments (terminal punctuation),
// matching the shared `TranscriptSegment` read-along format.
export function groupWordsIntoSegments(words: TranscriptWordTiming[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let bucket: TranscriptWordTiming[] = [];
  const flush = () => {
    if (!bucket.length) return;
    segments.push({
      start: bucket[0].start,
      end: bucket[bucket.length - 1].end,
      text: bucket.map((w) => w.text).join(" "),
      words: bucket.map((w, i) => ({ ...w, index: i })),
    });
    bucket = [];
  };
  for (const w of words) {
    bucket.push(w);
    if (/[.!?]["')\]]?$/.test(w.text) && bucket.length >= 3) flush();
  }
  flush();
  return segments;
}
