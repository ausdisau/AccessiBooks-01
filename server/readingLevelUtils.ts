/**
 * Reading Level Utilities
 * Computes a 1-4 reading difficulty level for book content using a simplified
 * Flesch-Kincaid Grade Level estimate based on sentence length and word complexity.
 *
 * Levels:
 *   1 = Very Easy  (FK grade 0–2)   – picture books, simple readers
 *   2 = Easy       (FK grade 3–5)   – middle-grade, accessible non-fiction
 *   3 = Moderate   (FK grade 6–9)   – YA, popular fiction, general non-fiction
 *   4 = Advanced   (FK grade 10+)   – literary fiction, academic, technical
 */

const GENRE_LEVEL_MAP: Record<string, number> = {
  // Level 1: Very Easy (children's, early readers)
  "children": 1,
  "children's": 1,
  "picture book": 1,
  "early reader": 1,
  "beginning reader": 1,
  "board book": 1,
  "abc": 1,
  "preschool": 1,
  "kindergarten": 1,
  // Level 2: Easy (middle grade, YA, accessible popular fiction)
  "juvenile fiction": 2,
  "juvenile literature": 2,
  "juvenile nonfiction": 2,
  "juvenile": 2,
  "young adult": 2,
  "ya fiction": 2,
  "teen": 2,
  "middle grade": 2,
  "coming of age": 2,
  "fairy tale": 2,
  "fairy tales": 2,
  "folk tale": 2,
  "folklore": 2,
  "fable": 2,
  "self-help": 2,
  "self help": 2,
  "personal development": 2,
  "romance": 2,
  "mystery": 2,
  "thriller": 2,
  "cozy mystery": 2,
  "adventure": 2,
  "humor": 2,
  "comedy": 2,
  "cooking": 2,
  "food": 2,
  // Level 3: Moderate (popular adult fiction, general non-fiction)
  "horror": 3,
  "science fiction": 3,
  "sci-fi": 3,
  "fantasy": 3,
  "historical fiction": 3,
  "biography": 3,
  "autobiography": 3,
  "memoir": 3,
  "history": 3,
  "psychology": 3,
  "travel": 3,
  "nature": 3,
  "sports": 3,
  "music": 3,
  "art": 3,
  "business": 3,
  "management": 3,
  "leadership": 3,
  "classics": 3,
  "poetry": 3,
  "drama": 3,
  "play": 3,
  "religion": 3,
  "spirituality": 3,
  "health": 3,
  "fitness": 3,
  "parenting": 3,
  "family": 3,
  "social science": 3,
  "education": 3,
  "fiction": 3,
  // Level 4: Advanced (academic, technical, dense non-fiction)
  "economics": 4,
  "philosophy": 4,
  "academic": 4,
  "science": 4,
  "technology": 4,
  "technical": 4,
  "computer": 4,
  "programming": 4,
  "law": 4,
  "legal": 4,
  "medicine": 4,
  "medical": 4,
  "literary fiction": 4,
  "literary criticism": 4,
  "literary": 4,
  "political science": 4,
  "politics": 4,
  "sociology": 4,
  "anthropology": 4,
  "mathematics": 4,
  "physics": 4,
  "chemistry": 4,
  "engineering": 4,
};

/**
 * Count approximate syllables in a single word using vowel-group heuristics.
 */
function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");
  if (cleaned.length === 0) return 0;
  if (cleaned.length <= 3) return 1;

  let count = 0;
  let prevWasVowel = false;
  const vowels = new Set(["a", "e", "i", "o", "u", "y"]);

  for (const ch of cleaned) {
    const isVowel = vowels.has(ch);
    if (isVowel && !prevWasVowel) count++;
    prevWasVowel = isVowel;
  }

  // Silent 'e' at end
  if (cleaned.endsWith("e") && count > 1) count--;
  // Common endings that add a syllable
  if (cleaned.endsWith("le") && cleaned.length > 2) count = Math.max(count, 1);

  return Math.max(count, 1);
}

/**
 * Compute Flesch-Kincaid Grade Level from text.
 * FK = 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 */
function fleschKincaidGrade(text: string): number {
  if (!text || text.trim().length === 0) return 6;

  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const words = text
    .split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z']/g, ""))
    .filter(w => w.length > 0);

  if (words.length < 5) return 6;
  const sentenceCount = Math.max(sentences.length, 1);
  const wordCount = words.length;
  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const avgSentenceLength = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllableCount / wordCount;

  const fk = 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;
  return Math.max(0, fk);
}

/**
 * Map a Flesch-Kincaid grade to our 1-4 scale.
 */
function gradeToLevel(grade: number): 1 | 2 | 3 | 4 {
  if (grade < 3) return 1;
  if (grade < 6) return 2;
  if (grade < 10) return 3;
  return 4;
}

/**
 * Sorted genre entries: longest keys checked first so "juvenile fiction" (specific)
 * matches before "fiction" (general) — prevents false matches like "literary fiction"→level 3.
 */
const SORTED_GENRE_ENTRIES = Object.entries(GENRE_LEVEL_MAP).sort(
  ([a], [b]) => b.length - a.length
);

/**
 * Estimate reading level (1-4) from genre hint alone, without text.
 */
function levelFromGenre(genre: string | null | undefined): number | null {
  if (!genre) return null;
  const g = genre.toLowerCase().trim();
  for (const [key, level] of SORTED_GENRE_ENTRIES) {
    if (g.includes(key)) return level;
  }
  return null;
}

/**
 * Primary export: compute reading level 1-4 for a book given its description and/or genre.
 * Genre takes priority over description analysis because descriptions are written ABOUT books
 * (often in adult prose) rather than AT the same reading level as the book itself.
 */
export function computeReadingLevel(
  description: string | null | undefined,
  genre: string | null | undefined,
): 1 | 2 | 3 | 4 {
  // Genre-first: most reliable signal for difficulty categorization
  const genreLevel = levelFromGenre(genre);
  if (genreLevel !== null) return genreLevel as 1 | 2 | 3 | 4;

  // Fall back to description FK analysis only when no genre match
  if (description && description.trim().length >= 30) {
    const grade = fleschKincaidGrade(description);
    return gradeToLevel(grade);
  }

  return 3;
}

export const READING_LEVEL_LABELS: Record<number, string> = {
  1: "Very Easy",
  2: "Easy",
  3: "Moderate",
  4: "Advanced",
};

export const READING_LEVEL_COLORS: Record<number, string> = {
  1: "bg-green-500",
  2: "bg-teal-500",
  3: "bg-amber-500",
  4: "bg-red-500",
};
