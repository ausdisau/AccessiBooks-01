import { describe, it, expect } from "vitest";
import {
  splitIntoChapters,
  splitIntoSubChunks,
  wordsFromAlignment,
  groupWordsIntoSegments,
  MAX_TOTAL_CHARS,
  MAX_CHAPTERS,
  CHARS_PER_SYNTHETIC_CHAPTER,
  TTS_SUBCHUNK_CHARS,
} from "../narrationText";

describe("splitIntoChapters", () => {
  it("splits on chapter headings when there are at least two", () => {
    const text = `Chapter 1\n${"x".repeat(120)}\nChapter 2\n${"y".repeat(120)}`;
    const chapters = splitIntoChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].number).toBe(1);
    expect(chapters[0].title.toLowerCase()).toContain("chapter 1");
    expect(chapters[1].title.toLowerCase()).toContain("chapter 2");
    expect(chapters[0].text).toContain("x".repeat(120));
  });

  it("falls back to synthetic chunking when there are no headings", () => {
    const text = "a".repeat(CHARS_PER_SYNTHETIC_CHAPTER * 2 + 2000); // ~20k, no ". " boundary
    const chapters = splitIntoChapters(text);
    expect(chapters).toHaveLength(3);
    expect(chapters[0].title).toBe("Part 1");
    expect(chapters[0].text.length).toBe(CHARS_PER_SYNTHETIC_CHAPTER);
    expect(chapters[2].text.length).toBe(2000);
  });

  it("truncates total text to MAX_TOTAL_CHARS", () => {
    const text =
      `Chapter 1\n${"a".repeat(300_000)}\nChapter 2\n${"b".repeat(400_000)}`; // ~700k total
    const chapters = splitIntoChapters(text);
    const total = chapters.reduce((sum, c) => sum + c.text.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_CHARS);
  });

  it("caps the number of chapters at MAX_CHAPTERS", () => {
    let text = "";
    for (let i = 1; i <= 70; i++) text += `Chapter ${i}\n${"x".repeat(60)}\n`;
    const chapters = splitIntoChapters(text);
    expect(chapters).toHaveLength(MAX_CHAPTERS);
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(splitIntoChapters("")).toEqual([]);
    expect(splitIntoChapters("    \n   ")).toEqual([]);
  });
});

describe("splitIntoSubChunks", () => {
  it("returns a single chunk for short text", () => {
    const chunks = splitIntoSubChunks("A short line of text.");
    expect(chunks).toEqual(["A short line of text."]);
  });

  it("splits oversized text into bounded chunks", () => {
    const text = "a".repeat(TTS_SUBCHUNK_CHARS + 500); // no ". " boundary -> hard split
    const chunks = splitIntoSubChunks(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].length).toBe(TTS_SUBCHUNK_CHARS);
    expect(chunks[1].length).toBe(500);
  });

  it("prefers a sentence boundary when one is available", () => {
    const head = "Sentence one. ".repeat(300); // ~4200 chars, well over the sub-chunk cap
    const chunks = splitIntoSubChunks(head + "tail.");
    expect(chunks.length).toBeGreaterThan(1);
    // Every non-final chunk should end at a sentence boundary (a period).
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.endsWith(".")).toBe(true);
      expect(chunk.length).toBeLessThanOrEqual(TTS_SUBCHUNK_CHARS);
    }
  });
});

describe("wordsFromAlignment", () => {
  it("converts character alignment into word timings and applies the offset", () => {
    const alignment = {
      characters: ["H", "i", " ", "t", "h", "e", "r", "e", "."],
      character_start_times_seconds: [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
      character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
    };
    const words = wordsFromAlignment(alignment, 10);
    expect(words).toHaveLength(2);
    expect(words[0].text).toBe("Hi");
    expect(words[0].start).toBeCloseTo(10.0, 5);
    expect(words[0].end).toBeCloseTo(10.2, 5);
    expect(words[1].text).toBe("there.");
    expect(words[1].start).toBeCloseTo(10.3, 5);
    expect(words[1].end).toBeCloseTo(10.9, 5);
  });

  it("returns no words for empty alignment", () => {
    const words = wordsFromAlignment(
      { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] },
      0,
    );
    expect(words).toEqual([]);
  });
});

describe("groupWordsIntoSegments", () => {
  it("groups words into sentence segments with per-segment word indices", () => {
    const words = [
      { text: "The", start: 0, end: 0.2 },
      { text: "cat", start: 0.2, end: 0.4 },
      { text: "sat.", start: 0.4, end: 0.6 },
      { text: "A", start: 0.6, end: 0.8 },
      { text: "dog", start: 0.8, end: 1.0 },
      { text: "ran.", start: 1.0, end: 1.2 },
    ];
    const segments = groupWordsIntoSegments(words);
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe("The cat sat.");
    expect(segments[0].start).toBeCloseTo(0, 5);
    expect(segments[0].end).toBeCloseTo(0.6, 5);
    expect(segments[0].words.map((w) => w.index)).toEqual([0, 1, 2]);
    expect(segments[1].text).toBe("A dog ran.");
  });
});
