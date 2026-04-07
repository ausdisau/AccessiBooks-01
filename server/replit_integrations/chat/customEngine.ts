import { storage } from "../../storage";
import type { Book } from "@shared/schema";

export type Intent = "catalog_search" | "greeting" | "help" | "general";

export interface Entities {
  format?: "audiobook" | "ebook" | "magazine";
  genre?: string;
  language?: string;
  durationPref?: "short" | "medium" | "long";
  authorKeywords?: string;
  accessibilityKeywords?: string[];
  coreQuery: string;
}

export interface BookSummary {
  id: string;
  title: string;
  author: string;
  genre: string | null | undefined;
  contentType: string | null | undefined;
  language: string | null | undefined;
  duration: number | null | undefined;
  totalTime: string | null | undefined;
  description: string | null;
  coverImage: string | null | undefined;
  isPremium: boolean;
}

export interface EngineResult {
  text: string;
  books: BookSummary[];
}

const GREETING_PATTERNS = [
  /^\s*(hi|hello|hey|howdy|greetings|good\s+(morning|afternoon|evening)|sup|what'?s\s+up)\b/i,
  /^\s*yo\b/i,
];

const HELP_PATTERNS = [
  /\b(what\s+can\s+you\s+do|how\s+(do(es)?\s+this|does\s+it)\s+work|what\s+are\s+you|who\s+are\s+you|your\s+capabilities|how\s+to\s+use\s+(you|this))\b/i,
];

/**
 * Explanatory questions — user wants information/explanation, not a catalog search.
 * These take priority over format/genre keyword matching.
 * NOTE: must NOT also contain explicit search verbs to qualify.
 */
const EXPLANATORY_QUESTION_PATTERNS = [
  /\bwhat'?s?\s+(the\s+)?(difference|distinction|advantage|benefit|point|meaning)\b/i,
  /\bhow\s+(does|do|is|are)\s+.{3,}\s+(work|different|better|used)\b/i,
  /\bwhat\s+(is|are)\s+(a[n]?\s+)?(podcast|audiobook|ebook|epub|drm|isbn)\b/i,
  /\bcan\s+you\s+explain\b/i,
  /\bexplain\s+(what|how|why|the)\b/i,
  /\btell\s+me\s+(what|how|why|about\s+the\s+difference)\b/i,
  /\bwhy\s+(is|are|do|does|should)\b/i,
  /\bis\s+(it\s+)?(possible|safe|legal|free|good|bad|worth)\b/i,
];

/**
 * Explicit search verbs — strong signals the user wants to search the catalog.
 * A message with one of these is ALWAYS catalog_search regardless of question words.
 */
const EXPLICIT_SEARCH_VERBS =
  /\b(find\s+me|search\s+for|look\s+for|show\s+me|recommend\s+me?|suggest|give\s+me|discover|browse|i('m|\s+am|\s+was)\s+looking\s+for|i\s+need\s+(a[n]?\s+)?(book|audiobook|ebook)|any\s+(good\s+)?(books?|audiobooks?|ebooks?|magazines?))\b/i;

/**
 * Weaker but still clear search signals (format + genre/topic without question framing).
 */
const CATALOG_SIGNAL_PATTERNS = [
  /\b(audiobooks?|ebooks?|e-books?|magazines?)\s+(about|on|for|in|with|featuring|set\s+in)\b/i,
  /\b(want\s+to|looking\s+to)\s+(listen|read)\b/i,
  /\b(listen|read)\s+to\s+\w/i,
  /\bby\s+[A-Z][a-z]+\s+[A-Z]/,
  /\b(dyslexia|dyslexic|visually\s+impaired|blind|large\s+print|adhd)\s+(books?|audiobooks?|friendly|accessible)\b/i,
  /\b(short|long|quick)\s+(audiobooks?|ebooks?|reads?|listens?)\b/i,
  /\b(mystery|thriller|romance|fantasy|sci.?fi|biography|history|self.?help)\s+(audiobooks?|ebooks?|books?)\b/i,
  /\b(audiobooks?|ebooks?|books?)\s+(in\s+(spanish|french|german|italian|portuguese|russian|chinese|japanese|arabic))\b/i,
];

export function classifyIntent(message: string): Intent {
  if (GREETING_PATTERNS.some((p) => p.test(message))) return "greeting";
  if (HELP_PATTERNS.some((p) => p.test(message))) return "help";

  const hasExplicitSearch = EXPLICIT_SEARCH_VERBS.test(message);
  if (hasExplicitSearch) return "catalog_search";

  const isExplanatoryQuestion = EXPLANATORY_QUESTION_PATTERNS.some((p) => p.test(message));
  if (isExplanatoryQuestion) return "general";

  if (CATALOG_SIGNAL_PATTERNS.some((p) => p.test(message))) return "catalog_search";

  return "general";
}

const FORMAT_PATTERNS: Array<[RegExp, "audiobook" | "ebook" | "magazine"]> = [
  [/\b(audiobooks?|audio\s+books?|listen\s+to|narrated|voiced|spoken)\b/i, "audiobook"],
  [/\b(ebooks?|e-books?|digital\s+books?|read\s+online|pdf)\b/i, "ebook"],
  [/\b(magazines?|journals?|periodicals?|publications?)\b/i, "magazine"],
];

const GENRE_MAP: Array<[RegExp, string]> = [
  [/\b(mystery|mysteries|detective|whodun)\b/i, "Mystery"],
  [/\b(thriller|suspense|espionage)\b/i, "Thriller"],
  [/\b(romance|romantic|love\s+story|love\s+stories)\b/i, "Romance"],
  [/\b(fantasy|magic|wizards?|dragons?|sword)\b/i, "Fantasy"],
  [/\b(sci.?fi|science\s+fiction|space|futuristic|dystopian)\b/i, "Science Fiction"],
  [/\b(horror|scary|ghost|haunted|supernatural)\b/i, "Horror"],
  [/\b(biography|biographies|memoir|autobiography|life\s+story)\b/i, "Biography"],
  [/\b(history|historical|ancient|medieval|war)\b/i, "History"],
  [/\b(self.?help|self\s+improvement|personal\s+(growth|development)|motivation|motivational)\b/i, "Self-Help"],
  [/\b(business|entrepreneur|leadership|management|finance|investing)\b/i, "Business"],
  [/\b(technology|tech|programming|coding|software|computer)\b/i, "Technology"],
  [/\b(science|scientific|physics|biology|chemistry|nature)\b/i, "Science"],
  [/\b(children'?s?|kids?|young\s+readers?|middle\s+grade)\b/i, "Children's"],
  [/\b(young\s+adult|ya\b|teen)\b/i, "Young Adult"],
  [/\b(adventure|action|quest)\b/i, "Adventure"],
  [/\b(comedy|humor|funny|humorous)\b/i, "Humor"],
  [/\b(religion|spirituality|spiritual|faith|christian|islamic|buddhist)\b/i, "Religion & Spirituality"],
  [/\b(cooking|food|recipes?|culinary)\b/i, "Food & Cooking"],
  [/\b(travel|travelogue|journey|explore)\b/i, "Travel"],
  [/\b(poetry|poems?|verse)\b/i, "Poetry"],
  [/\b(philosophy|philosophical|ethics)\b/i, "Philosophy"],
  [/\b(psychology|mental\s+health|mindfulness|meditation)\b/i, "Psychology"],
  [/\b(politics?|political\s+science|government|democracy)\b/i, "Politics"],
  [/\b(art|artwork|painting|music|classical)\b/i, "Arts"],
  [/\b(education|educational|academic|textbook|learning)\b/i, "Education"],
  [/\b(classic|classics|literary\s+fiction|literature)\b/i, "Classic Literature"],
  [/\b(non.?fiction|nonfiction|true\s+crime)\b/i, "Non-Fiction"],
  [/\b(graphic|comic|illustrated)\b/i, "Graphic Novel"],
];

const LANGUAGE_MAP: Array<[RegExp, string]> = [
  [/\b(english|en\b)/i, "English"],
  [/\b(spanish|español|espanol)\b/i, "Spanish"],
  [/\b(french|français|francais)\b/i, "French"],
  [/\b(german|deutsch)\b/i, "German"],
  [/\b(italian|italiano)\b/i, "Italian"],
  [/\b(portuguese|português)\b/i, "Portuguese"],
  [/\b(russian|русский)\b/i, "Russian"],
  [/\b(chinese|mandarin|cantonese)\b/i, "Chinese"],
  [/\b(japanese|日本語)\b/i, "Japanese"],
  [/\b(arabic|عربي)\b/i, "Arabic"],
  [/\b(dutch|netherlands)\b/i, "Dutch"],
  [/\b(korean|한국어)\b/i, "Korean"],
];

const DURATION_PATTERNS: Array<[RegExp, "short" | "medium" | "long"]> = [
  [/\b(short|quick|brief|fast|under\s+\d+\s*(hour|hr)|less\s+than\s+\d+\s*(hour|hr))\b/i, "short"],
  [/\b(medium|moderate|average|mid.length)\b/i, "medium"],
  [/\b(long|lengthy|epic|extended|over\s+\d+\s*(hour|hr)|more\s+than\s+\d+\s*(hour|hr))\b/i, "long"],
];

const AUTHOR_PATTERN = /\bby\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/;
const AUTHOR_PATTERN2 = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})'?s?\s+books?\b/;

const ACCESSIBILITY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(dyslexia|dyslexic)\b/i, "dyslexia-friendly"],
  [/\b(visual\s+impairment|visually\s+impaired|blind(ness)?|low\s+vision)\b/i, "visual accessibility"],
  [/\b(hearing\s+impairment|hearing\s+impaired|deaf(ness)?)\b/i, "hearing accessibility"],
  [/\b(large\s+print|big\s+font|enlarged\s+text)\b/i, "large print"],
  [/\b(learning\s+disabilit|adhd|autism|autistic)\b/i, "learning accessibility"],
];

const NOISE_WORDS = new Set([
  "find", "search", "show", "recommend", "suggest", "give", "me", "some",
  "any", "please", "can", "you", "a", "an", "the", "books", "audiobooks",
  "ebooks", "about", "related", "to", "for", "want", "need", "looking",
  "something", "anything", "i", "im", "id", "like", "listen", "read",
  "short", "long", "medium", "quick", "brief", "good", "great", "best",
  "popular", "top", "new", "recent", "latest", "old", "classic", "modern",
  "interesting", "exciting", "fun", "entertaining",
]);

export function extractEntities(message: string): Entities {
  let remaining = message;

  let format: Entities["format"] | undefined;
  for (const [pattern, fmt] of FORMAT_PATTERNS) {
    if (pattern.test(remaining)) {
      format = fmt;
      remaining = remaining.replace(pattern, " ");
      break;
    }
  }

  let genre: string | undefined;
  for (const [pattern, g] of GENRE_MAP) {
    if (pattern.test(remaining)) {
      genre = g;
      remaining = remaining.replace(pattern, " ");
      break;
    }
  }

  let language: string | undefined;
  for (const [pattern, lang] of LANGUAGE_MAP) {
    if (pattern.test(remaining)) {
      language = lang;
      remaining = remaining.replace(pattern, " ");
      break;
    }
  }

  let durationPref: Entities["durationPref"] | undefined;
  for (const [pattern, dur] of DURATION_PATTERNS) {
    if (pattern.test(remaining)) {
      durationPref = dur;
      remaining = remaining.replace(pattern, " ");
      break;
    }
  }

  let authorKeywords: string | undefined;
  const authorMatch = AUTHOR_PATTERN.exec(remaining) ?? AUTHOR_PATTERN2.exec(remaining);
  if (authorMatch) {
    authorKeywords = authorMatch[1];
    remaining = remaining.replace(authorMatch[0], " ");
  }

  const accessibilityKeywords: string[] = [];
  for (const [pattern, label] of ACCESSIBILITY_PATTERNS) {
    if (pattern.test(remaining)) {
      accessibilityKeywords.push(label);
      remaining = remaining.replace(pattern, " ");
    }
  }

  const coreQuery = remaining
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NOISE_WORDS.has(w))
    .join(" ")
    .trim();

  return {
    format,
    genre,
    language,
    durationPref,
    authorKeywords: authorKeywords || undefined,
    accessibilityKeywords: accessibilityKeywords.length ? accessibilityKeywords : undefined,
    coreQuery: coreQuery || (genre ?? "") || (authorKeywords ?? "") || message.trim(),
  };
}

const DURATION_THRESHOLDS = {
  short: 3600,
  medium_min: 3600,
  medium_max: 18000,
  long: 18000,
};

function applyFilters(books: Book[], entities: Entities): Book[] {
  let filtered = books;

  if (entities.format) {
    const fmtLower = entities.format.toLowerCase();
    filtered = filtered.filter((b) => b.contentType?.toLowerCase() === fmtLower);
  }

  if (entities.language) {
    const langLower = entities.language.toLowerCase();
    filtered = filtered.filter((b) => b.language?.toLowerCase().includes(langLower));
  }

  if (entities.genre) {
    const genreLower = entities.genre.toLowerCase();
    const genreFiltered = filtered.filter((b) => b.genre?.toLowerCase().includes(genreLower));
    if (genreFiltered.length > 0) filtered = genreFiltered;
  }

  if (entities.durationPref === "short") {
    const durationFiltered = filtered.filter(
      (b) => b.duration && b.duration <= DURATION_THRESHOLDS.short
    );
    if (durationFiltered.length > 0) filtered = durationFiltered;
  } else if (entities.durationPref === "medium") {
    const durationFiltered = filtered.filter(
      (b) =>
        b.duration &&
        b.duration >= DURATION_THRESHOLDS.medium_min &&
        b.duration <= DURATION_THRESHOLDS.medium_max
    );
    if (durationFiltered.length > 0) filtered = durationFiltered;
  } else if (entities.durationPref === "long") {
    const durationFiltered = filtered.filter(
      (b) => b.duration && b.duration >= DURATION_THRESHOLDS.long
    );
    if (durationFiltered.length > 0) filtered = durationFiltered;
  }

  return filtered;
}

function toBookSummary(b: Book): BookSummary {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    genre: b.genre,
    contentType: b.contentType,
    language: b.language,
    duration: b.duration,
    totalTime: b.totalTime,
    description: b.description ? b.description.slice(0, 200) : null,
    coverImage: b.coverImage,
    isPremium: b.isPremium,
  };
}

function buildContextDescription(entities: Entities): string {
  const parts: string[] = [];
  if (entities.format) parts.push(entities.format + "s");
  if (entities.genre) parts.push(`in ${entities.genre}`);
  if (entities.language && entities.language !== "English") parts.push(`in ${entities.language}`);
  if (entities.durationPref === "short") parts.push("(short)");
  if (entities.durationPref === "long") parts.push("(long)");
  if (entities.authorKeywords) parts.push(`by ${entities.authorKeywords}`);
  if (entities.coreQuery && !entities.genre && !entities.authorKeywords)
    parts.push(`about "${entities.coreQuery}"`);
  return parts.join(" ") || `matching "${entities.coreQuery}"`;
}

const OPENERS_FOUND = [
  "Great news — I found",
  "Here you go! I found",
  "I searched the catalog and found",
  "I've got some matches for you —",
  "Looking good! I found",
];

const OPENERS_ONE = [
  "I found exactly one match for you:",
  "Here's a pick that might suit you:",
  "Just one result, but it looks promising:",
];

const OPENERS_NONE = [
  "I couldn't find anything matching that in our catalog right now.",
  "No results came up for that search.",
  "Nothing in the catalog matched that combination.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildSearchResponse(books: BookSummary[], entities: Entities): string {
  const ctx = buildContextDescription(entities);

  if (books.length === 0) {
    const suggestions: string[] = [];
    if (entities.format) suggestions.push("try removing the format filter");
    if (entities.language) suggestions.push("try a different language");
    if (entities.durationPref) suggestions.push("try removing the length preference");
    const hint = suggestions.length
      ? ` You could ${suggestions.join(" or ")} to broaden your search.`
      : " Try different keywords or browse by genre.";
    return `${pick(OPENERS_NONE)}${hint}`;
  }

  if (books.length === 1) {
    return `${pick(OPENERS_ONE)}\n\nThis ${
      books[0].contentType ?? "title"
    } is ${ctx}. Tap it to start reading or listening!`;
  }

  const count = books.length >= 6 ? "6" : `${books.length}`;
  const opener = pick(OPENERS_FOUND);
  return `${opener} ${count} ${ctx}. Here's what's available — tap any title to open it!`;
}

/**
 * Run a catalog search using the local PostgreSQL full-text index only.
 * No external API calls are made — this is entirely self-contained.
 */
export async function runCatalogSearch(message: string): Promise<EngineResult> {
  const entities = extractEntities(message);

  const searchQuery =
    [entities.authorKeywords, entities.coreQuery].filter(Boolean).join(" ").trim() ||
    message.trim();

  let books: Book[] = [];
  try {
    books = await storage.searchBooksDB(searchQuery, 50);
  } catch (err) {
    console.error("[CustomEngine] searchBooksDB error:", err);
  }

  const filtered = applyFilters(books, entities).slice(0, 6);
  const summaries = filtered.map(toBookSummary);
  const text = buildSearchResponse(summaries, entities);

  return { text, books: summaries };
}

export function greetingResponse(): string {
  const responses = [
    "Hi there! I'm AccessiBooks AI — your personal reading and listening guide. Ask me to find audiobooks, ebooks, or magazines, or tell me a genre you enjoy and I'll pull up some great matches from the catalog!",
    "Hello! Welcome to AccessiBooks. I'm here to help you discover your next great listen or read. What are you in the mood for today?",
    "Hey! Great to see you. Tell me what kind of book or audiobook you're looking for and I'll search our catalog for you right away!",
  ];
  return pick(responses);
}

export function helpResponse(): string {
  return `I'm AccessiBooks AI — your guide to our entire catalog of audiobooks, ebooks, and magazines.

Here's what I can do:
- Find books by genre, author, title, or topic — just describe what you're looking for
- Filter by format — audiobooks to listen to, ebooks to read, or magazines
- Filter by language — English, Spanish, French, German, and more
- Filter by length — short, medium, or long
- Recommend by mood — "something relaxing", "an exciting thriller", "a quick read"

Try asking things like:
- "Find me short mystery audiobooks"
- "Show me romance ebooks in Spanish"
- "Recommend something by Charles Dickens"
- "I want a long fantasy audiobook"`;
}

export function generalFallbackResponse(message: string): string {
  const lower = message.toLowerCase();

  if (/\b(thank|thanks|thank you|cheers)\b/.test(lower)) {
    return pick([
      "You're welcome! Let me know if you'd like more recommendations.",
      "Happy to help! Enjoy your reading (or listening)!",
      "Anytime! Feel free to ask whenever you want to find more books.",
    ]);
  }

  if (/\b(yes|yeah|sure|ok|okay|sounds\s+good|great|perfect)\b/.test(lower)) {
    return "Great! What kind of book or audiobook are you looking for? Tell me a genre, author, or topic and I'll search the catalog.";
  }

  if (/\b(no|nope|not\s+really|don't|not\s+interested)\b/.test(lower)) {
    return "No problem! Let me know if you'd like to try a different search or browse another genre.";
  }

  return "I'm best at finding books and audiobooks in our catalog! Try asking me to find a specific genre, author, or topic — for example: \"Find me mystery audiobooks\" or \"Show me ebooks about history\".";
}
