import type { Book } from "@workspace/db";
import { computeReadingLevel } from "./readingLevelUtils";

async function fetchWithTimeout(url: string, timeout = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (compatible; AccessiBooks/1.0; +https://accessibooks.app)',
        'Accept': 'application/atom+xml, application/xml, text/xml, application/rss+xml, */*',
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================
// 1. LOYAL BOOKS (via RSS feed)
// ============================================================

interface LoyalBooksEntry {
  title: string;
  link: string;
  description: string;
  author: string;
  category?: string;
  enclosure?: { url: string; type: string };
}

function parseLoyalBooksRSS(xml: string): LoyalBooksEntry[] {
  const entries: LoyalBooksEntry[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || "";
    const link = item.match(/<link>(.*?)<\/link>/)?.[1] || "";
    const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || "";
    const author = item.match(/<dc:creator><!\[CDATA\[(.*?)\]\]><\/dc:creator>|<dc:creator>(.*?)<\/dc:creator>/)?.[1] || 
                   item.match(/<itunes:author>(.*?)<\/itunes:author>/)?.[1] || "Unknown Author";
    const category = item.match(/<category>(.*?)<\/category>/)?.[1] || undefined;
    const encUrl = item.match(/<enclosure[^>]*url="([^"]*)"[^>]*>/)?.[1] || undefined;
    const encType = item.match(/<enclosure[^>]*type="([^"]*)"[^>]*>/)?.[1] || "audio/mpeg";
    
    entries.push({
      title: title.replace(/<[^>]*>/g, '').trim(),
      link,
      description: desc.replace(/<[^>]*>/g, '').substring(0, 500),
      author: author.replace(/<[^>]*>/g, '').trim(),
      category,
      enclosure: encUrl ? { url: encUrl, type: encType } : undefined,
    });
  }
  return entries;
}

function transformLoyalBook(entry: LoyalBooksEntry, index: number): Book {
  return {
    id: `loyalbooks-${index}-${entry.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20)}`,
    title: entry.title,
    author: entry.author,
    narrator: null,
    description: entry.description,
    duration: 3600,
    coverImage: null,
    audioUrl: entry.enclosure?.url || entry.link,
    contentUrl: null,
    genre: entry.category || "Classic Literature",
    publishedYear: null,
    source: "loyalbooks",
    narrationType: "human",
    sourceId: entry.link,
    totalTime: null,
    language: "English",
    contentType: "audiobook",
    isPremium: false,
    pageCount: null,
    searchVector: null,
    readingLevel: computeReadingLevel(entry.description, entry.category || "Classic Literature"),
  };
}

export async function fetchLoyalBooks(limit = 20): Promise<Book[]> {
  try {
    const genres = ['Fiction', 'History', 'Science', 'Philosophy', 'Poetry', 'Adventure', 'Children', 'Mystery', 'Romance', 'Humor', 'Drama', 'Short+Stories', 'Travel', 'Religion', 'Biography', 'Horror', 'Fantasy', 'War', 'Politics', 'Nature', 'Psychology', 'Economics', 'Art', 'Music', 'Education'];
    const perGenre = Math.ceil(limit / genres.length);
    const allBooks: Book[] = [];
    const seenTitles = new Set<string>();
    
    const promises = genres.map(async (genre) => {
      try {
        const url = `https://www.loyalbooks.com/book/genre/${genre}/feed`;
        const response = await fetchWithTimeout(url, 20000);
        if (!response.ok) return [];
        const xml = await response.text();
        return parseLoyalBooksRSS(xml);
      } catch {
        return [];
      }
    });
    
    const results = await Promise.all(promises);
    let globalIdx = 0;
    results.forEach(entries => {
      entries.forEach(entry => {
        const key = entry.title.toLowerCase().trim();
        if (!seenTitles.has(key)) {
          seenTitles.add(key);
          allBooks.push(transformLoyalBook(entry, globalIdx++));
        }
      });
    });
    
    return allBooks.slice(0, limit);
  } catch (error) {
    console.warn('Loyal Books fetch failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

export async function searchLoyalBooks(query: string, limit = 10): Promise<Book[]> {
  try {
    const url = `https://www.loyalbooks.com/search?q=${encodeURIComponent(query)}&type=audiobook`;
    const response = await fetchWithTimeout(url, 20000);
    if (!response.ok) return [];
    const html = await response.text();
    const books: Book[] = [];
    const resultRegex = /<td[^>]*class="result"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span[^>]*class="author"[^>]*>([\s\S]*?)<\/span>/g;
    let m;
    let idx = 0;
    while ((m = resultRegex.exec(html)) !== null && idx < limit) {
      books.push({
        id: `loyalbooks-s-${idx}-${m[2].replace(/<[^>]*>/g, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20)}`,
        title: m[2].replace(/<[^>]*>/g, '').trim(),
        author: m[3].replace(/<[^>]*>/g, '').trim() || "Unknown Author",
        narrator: null,
        description: null,
        duration: 3600,
        coverImage: null,
        audioUrl: `https://www.loyalbooks.com${m[1]}`,
        contentUrl: null,
        genre: "Classic Literature",
        publishedYear: null,
        source: "loyalbooks",
        narrationType: "human",
        sourceId: m[1],
        totalTime: null,
        readingLevel: computeReadingLevel(null, "Classic Literature"),
        language: "English",
        contentType: "audiobook",
        isPremium: false,
        pageCount: null,
        searchVector: null,
      });
      idx++;
    }
    return books;
  } catch (error) {
    console.warn('Loyal Books search failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

// ============================================================
// 2. STANDARD EBOOKS (OPDS feed)
// ============================================================

interface StandardEbookEntry {
  id: string;
  title: string;
  author: string;
  description: string;
  coverUrl: string | null;
  contentUrl: string | null;
  language: string;
  subject: string;
  updated: string;
}

function parseAtomFeed(xml: string): StandardEbookEntry[] {
  const entries: StandardEbookEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const id = entry.match(/<id>(.*?)<\/id>/)?.[1] || 
               entry.match(/<link[^>]*rel="alternate"[^>]*href="([^"]*)"[^>]*>/)?.[1] || "";
    const title = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "";
    const author = entry.match(/<author>[\s\S]*?<name>(.*?)<\/name>/)?.[1] || 
                   entry.match(/<name>(.*?)<\/name>/)?.[1] || "Unknown Author";
    const desc = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] ||
                 entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || "";
    const coverUrl = entry.match(/<link[^>]*rel="http:\/\/opds-spec\.org\/image[^"]*"[^>]*href="([^"]*)"[^>]*>/)?.[1] ||
                     entry.match(/<link[^>]*type="image\/[^"]*"[^>]*href="([^"]*)"[^>]*>/)?.[1] ||
                     entry.match(/<link[^>]*href="([^"]*\.(jpg|jpeg|png|gif))"[^>]*>/)?.[1] || null;
    const contentUrl = entry.match(/<link[^>]*type="application\/epub\+zip"[^>]*href="([^"]*)"[^>]*>/)?.[1] ||
                       entry.match(/<link[^>]*href="([^"]*\.epub[^"]*)"[^>]*>/)?.[1] || null;
    const language = entry.match(/<dcterms:language>(.*?)<\/dcterms:language>/)?.[1] ||
                     entry.match(/<dc:language>(.*?)<\/dc:language>/)?.[1] || "en";
    const subject = entry.match(/<category[^>]*term="([^"]*)"[^>]*>/)?.[1] ||
                    entry.match(/<dcterms:subject>(.*?)<\/dcterms:subject>/)?.[1] || "Literature";
    const updated = entry.match(/<updated>(.*?)<\/updated>/)?.[1] || "";
    
    if (title.trim()) {
      entries.push({
        id: id.replace(/https?:\/\/[^/]+\//g, ''),
        title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]*>/g, '').trim(),
        author: author.replace(/&amp;/g, '&').replace(/<[^>]*>/g, '').trim(),
        description: desc.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').substring(0, 500),
        coverUrl,
        contentUrl,
        language,
        subject,
        updated,
      });
    }
  }
  return entries;
}

function parseOPDSFeed(xml: string): StandardEbookEntry[] {
  const entries: StandardEbookEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const id = entry.match(/<id>(.*?)<\/id>/)?.[1] || "";
    const title = entry.match(/<title[^>]*>(.*?)<\/title>/)?.[1] || "";
    const author = entry.match(/<name>(.*?)<\/name>/)?.[1] || "Unknown Author";
    const desc = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] || 
                 entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || "";
    const coverUrl = entry.match(/<link[^>]*rel="http:\/\/opds-spec\.org\/image"[^>]*href="([^"]*)"[^>]*>/)?.[1] ||
                     entry.match(/<link[^>]*type="image\/[^"]*"[^>]*href="([^"]*)"[^>]*>/)?.[1] || null;
    const contentUrl = entry.match(/<link[^>]*type="application\/epub\+zip"[^>]*href="([^"]*)"[^>]*>/)?.[1] || null;
    const language = entry.match(/<dcterms:language>(.*?)<\/dcterms:language>/)?.[1] || 
                     entry.match(/<dc:language>(.*?)<\/dc:language>/)?.[1] || "en";
    const subject = entry.match(/<category[^>]*term="([^"]*)"[^>]*>/)?.[1] || "Literature";
    const updated = entry.match(/<updated>(.*?)<\/updated>/)?.[1] || "";
    
    entries.push({
      id: id.replace(/https?:\/\/[^/]+\//g, ''),
      title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
      author: author.replace(/&amp;/g, '&'),
      description: desc.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').substring(0, 500),
      coverUrl,
      contentUrl,
      language,
      subject,
      updated,
    });
  }
  return entries;
}

function transformStandardEbook(entry: StandardEbookEntry): Book {
  const coverUrl = entry.coverUrl ? 
    (entry.coverUrl.startsWith('http') ? entry.coverUrl : `https://standardebooks.org${entry.coverUrl}`) : null;
  const epubUrl = entry.contentUrl ?
    (entry.contentUrl.startsWith('http') ? entry.contentUrl : `https://standardebooks.org${entry.contentUrl}`) : null;
  
  return {
    id: `standardebooks-${entry.id.replace(/[^a-z0-9-]/gi, '-').substring(0, 50)}`,
    title: entry.title,
    author: entry.author,
    narrator: null,
    description: entry.description,
    duration: 0,
    coverImage: coverUrl,
    audioUrl: null,
    contentUrl: epubUrl,
    genre: entry.subject,
    publishedYear: null,
    source: "standardebooks",
    sourceId: entry.id,
    totalTime: null,
    language: entry.language === "en" ? "English" : entry.language,
    contentType: "ebook",
    readingLevel: computeReadingLevel(entry.description, entry.subject),
    isPremium: false,
    pageCount: null,
    searchVector: null,
  };
}

export async function fetchStandardEbooks(limit = 20): Promise<Book[]> {
  try {
    const feeds = [
      'https://standardebooks.org/feeds/opds/new-releases',
      'https://standardebooks.org/feeds/opds/all',
      'https://standardebooks.org/feeds/rss/new-releases',
      'https://standardebooks.org/feeds/atom/new-releases',
    ];
    const allBooks: Book[] = [];
    const seenIds = new Set<string>();
    
    for (const feedUrl of feeds) {
      if (allBooks.length >= limit) break;
      try {
        const response = await fetchWithTimeout(feedUrl, 25000);
        if (!response.ok) {
          console.warn(`Standard Ebooks feed ${feedUrl} returned ${response.status}`);
          continue;
        }
        const xml = await response.text();
        const entries = parseOPDSFeed(xml);
        if (entries.length === 0) {
          const altEntries = parseAtomFeed(xml);
          altEntries.forEach(entry => {
            const book = transformStandardEbook(entry);
            if (!seenIds.has(book.id) && allBooks.length < limit) {
              seenIds.add(book.id);
              allBooks.push(book);
            }
          });
        } else {
          entries.forEach(entry => {
            const book = transformStandardEbook(entry);
            if (!seenIds.has(book.id) && allBooks.length < limit) {
              seenIds.add(book.id);
              allBooks.push(book);
            }
          });
        }
      } catch (err) {
        console.warn(`Standard Ebooks feed error for ${feedUrl}:`, err instanceof Error ? err.message : 'Unknown');
        continue;
      }
    }
    
    console.log(`Standard Ebooks: parsed ${allBooks.length} titles from feeds`);
    return allBooks;
  } catch (error) {
    console.warn('Standard Ebooks fetch failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

export async function searchStandardEbooks(query: string, limit = 10): Promise<Book[]> {
  try {
    const response = await fetchWithTimeout(
      `https://standardebooks.org/feeds/opds/all?query=${encodeURIComponent(query)}`,
      20000
    );
    if (!response.ok) return [];
    const xml = await response.text();
    const entries = parseOPDSFeed(xml);
    return entries.slice(0, limit).map(transformStandardEbook);
  } catch (error) {
    console.warn('Standard Ebooks search failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

// ============================================================
// 3. FEEDBOOKS (OPDS feed for public domain)
// ============================================================

export async function fetchFeedbooks(limit = 20): Promise<Book[]> {
  try {
    const feeds = [
      'https://catalog.feedbooks.com/publicdomain/browse/recent.atom',
      'https://catalog.feedbooks.com/publicdomain/browse/top.atom',
      'https://catalog.feedbooks.com/publicdomain/browse/awards.atom',
    ];
    const allBooks: Book[] = [];
    const seenIds = new Set<string>();
    
    const promises = feeds.map(async (feedUrl) => {
      try {
        const response = await fetchWithTimeout(feedUrl, 25000);
        if (!response.ok) {
          console.warn(`Feedbooks feed ${feedUrl} returned ${response.status}`);
          return [];
        }
        const xml = await response.text();
        const entries = parseOPDSFeed(xml);
        if (entries.length === 0) {
          return parseAtomFeed(xml);
        }
        return entries;
      } catch (err) {
        console.warn(`Feedbooks feed error for ${feedUrl}:`, err instanceof Error ? err.message : 'Unknown');
        return [];
      }
    });
    
    const results = await Promise.all(promises);
    results.forEach(entries => {
      entries.forEach(entry => {
        const coverUrl = entry.coverUrl ? 
          (entry.coverUrl.startsWith('http') ? entry.coverUrl : `https://catalog.feedbooks.com${entry.coverUrl}`) : null;
        const epubUrl = entry.contentUrl ?
          (entry.contentUrl.startsWith('http') ? entry.contentUrl : `https://catalog.feedbooks.com${entry.contentUrl}`) : null;
        const id = `feedbooks-${entry.id.replace(/[^a-z0-9-]/gi, '-').substring(0, 50)}`;
        if (!seenIds.has(id) && allBooks.length < limit) {
          seenIds.add(id);
          allBooks.push({
            id,
            title: entry.title,
            author: entry.author,
            narrator: null,
            description: entry.description,
            duration: 0,
            coverImage: coverUrl,
            audioUrl: null,
            contentUrl: epubUrl,
            genre: entry.subject || "Literature",
            publishedYear: null,
            source: "feedbooks",
            sourceId: entry.id,
            totalTime: null,
            language: entry.language === "en" ? "English" : entry.language,
            contentType: "ebook",
            isPremium: false,
            pageCount: null,
            searchVector: null,
            readingLevel: computeReadingLevel(entry.description, entry.subject || "Literature"),
          });
        }
      });
    });
    
    return allBooks.slice(0, limit);
  } catch (error) {
    console.warn('Feedbooks fetch failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

export async function searchFeedbooks(query: string, limit = 10): Promise<Book[]> {
  try {
    const response = await fetchWithTimeout(
      `https://catalog.feedbooks.com/publicdomain/browse/search.atom?query=${encodeURIComponent(query)}`,
      20000
    );
    if (!response.ok) return [];
    const xml = await response.text();
    const entries = parseOPDSFeed(xml);
    return entries.slice(0, limit).map(entry => ({
      id: `feedbooks-s-${entry.id.replace(/[^a-z0-9-]/gi, '-').substring(0, 50)}`,
      title: entry.title,
      author: entry.author,
      narrator: null,
      description: entry.description,
      duration: 0,
      coverImage: entry.coverUrl,
      audioUrl: null,
      contentUrl: entry.contentUrl,
      genre: entry.subject || "Literature",
      publishedYear: null,
      source: "feedbooks",
      sourceId: entry.id,
      totalTime: null,
      language: entry.language === "en" ? "English" : entry.language,
      contentType: "ebook",
      isPremium: false,
      pageCount: null,
      searchVector: null,
      readingLevel: computeReadingLevel(entry.description, entry.subject || "Literature"),
    }));
  } catch (error) {
    console.warn('Feedbooks search failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

// ============================================================
// 4. OPENSTAX (Curated educational textbooks)
// ============================================================

interface OpenStaxBook {
  title: string;
  subject: string;
  url: string;
  coverUrl: string;
  description: string;
  authors: string[];
}

const OPENSTAX_CATALOG: OpenStaxBook[] = [
  { title: "Biology 2e", subject: "Science", url: "https://openstax.org/details/books/biology-2e", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/biology2e_702x1024.png", description: "Biology 2e is designed to cover the scope and sequence requirements of a typical two-semester biology course for science majors.", authors: ["Mary Ann Clark", "Matthew Douglas", "Jung Choi"] },
  { title: "Anatomy and Physiology 2e", subject: "Science", url: "https://openstax.org/details/books/anatomy-and-physiology-2e", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/anatomy_702x1024.png", description: "Human Anatomy and Physiology is designed for two-semester anatomy and physiology courses.", authors: ["J. Gordon Betts", "Kelly A. Young"] },
  { title: "Chemistry 2e", subject: "Science", url: "https://openstax.org/details/books/chemistry-2e", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/chemistry2e_702x1024.png", description: "Chemistry 2e is designed to meet the scope and sequence requirements of a two-semester general chemistry course.", authors: ["Paul Flowers", "Klaus Theopold"] },
  { title: "Physics", subject: "Science", url: "https://openstax.org/details/books/physics", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/physics_702x1024.png", description: "Physics is designed for the two- or three-semester calculus-based physics course.", authors: ["Paul Peter Urone", "Roger Hinrichs"] },
  { title: "Principles of Economics 3e", subject: "Social Sciences", url: "https://openstax.org/details/books/principles-economics-3e", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/economics3e_702x1024.png", description: "Principles of Economics 3e covers the scope and sequence of most introductory economics courses.", authors: ["Steven A. Greenlaw", "David Shapiro"] },
  { title: "U.S. History", subject: "Humanities", url: "https://openstax.org/details/books/us-history", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/us_history_702x1024.png", description: "U.S. History covers the breadth of the chronological history of the United States.", authors: ["P. Scott Corbett", "Volker Janssen"] },
  { title: "Psychology 2e", subject: "Social Sciences", url: "https://openstax.org/details/books/psychology-2e", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/psychology2e_702x1024.png", description: "Psychology 2e is designed to meet scope and sequence requirements for introductory psychology courses.", authors: ["Rose M. Spielman"] },
  { title: "Introduction to Sociology 3e", subject: "Social Sciences", url: "https://openstax.org/details/books/introduction-sociology-3e", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/sociology3e_702x1024.png", description: "Introduction to Sociology 3e aligns to the topics and objectives of many introductory sociology courses.", authors: ["Tonja R. Conerly", "Kathleen Holmes"] },
  { title: "Astronomy 2e", subject: "Science", url: "https://openstax.org/details/books/astronomy-2e", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/astronomy2e_702x1024.png", description: "Astronomy 2e is written in clear non-technical language for introductory astronomy survey courses.", authors: ["Andrew Fraknoi", "David Morrison"] },
  { title: "Calculus Volume 1", subject: "Math", url: "https://openstax.org/details/books/calculus-volume-1", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/calculus1_702x1024.png", description: "Calculus Volume 1 covers the breadth of a typical first-year college calculus course.", authors: ["Gilbert Strang", "Edwin Herman"] },
  { title: "American Government 3e", subject: "Social Sciences", url: "https://openstax.org/details/books/american-government-3e", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/amgovt3e_702x1024.png", description: "American Government 3e aligns with the topics and objectives of many government and political science courses.", authors: ["Glen Krutz", "Sylvie Waskiewicz"] },
  { title: "Concepts of Biology", subject: "Science", url: "https://openstax.org/details/books/concepts-biology", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/concepts_biology_702x1024.png", description: "Concepts of Biology is designed for introductory biology courses for non-science majors.", authors: ["Samantha Fowler", "Rebecca Roush"] },
  { title: "Introduction to Philosophy", subject: "Humanities", url: "https://openstax.org/details/books/introduction-philosophy", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/intro_philosophy_702x1024.png", description: "Introduction to Philosophy surveys the major areas and questions of philosophy.", authors: ["Nathan Smith"] },
  { title: "World History Volume 1", subject: "Humanities", url: "https://openstax.org/details/books/world-history-volume-1", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/world_history1_702x1024.png", description: "World History Volume 1 covers the history of the world from prehistory to 1500.", authors: ["Ann Kordas", "Ryan J. Lynch"] },
  { title: "Statistics", subject: "Math", url: "https://openstax.org/details/books/statistics", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/statistics_702x1024.png", description: "Introductory Statistics follows scope and sequence requirements of a one-semester introductory statistics course.", authors: ["Barbara Illowsky", "Susan Dean"] },
  { title: "Calculus Volume 2", subject: "Math", url: "https://openstax.org/details/books/calculus-volume-2", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/calculus2_702x1024.png", description: "Calculus Volume 2 covers integration, differential equations, sequences and series.", authors: ["Gilbert Strang", "Edwin Herman"] },
  { title: "Calculus Volume 3", subject: "Math", url: "https://openstax.org/details/books/calculus-volume-3", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/calculus3_702x1024.png", description: "Calculus Volume 3 covers multivariate calculus topics.", authors: ["Gilbert Strang", "Edwin Herman"] },
  { title: "College Algebra 2e", subject: "Math", url: "https://openstax.org/details/books/college-algebra-2e", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/college_algebra2e_702x1024.png", description: "College Algebra 2e provides a comprehensive exploration of algebraic principles.", authors: ["Jay Abramson"] },
  { title: "Precalculus 2e", subject: "Math", url: "https://openstax.org/details/books/precalculus-2e", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/precalculus2e_702x1024.png", description: "Precalculus 2e is designed for a one or two semester precalculus course.", authors: ["Jay Abramson"] },
  { title: "Algebra and Trigonometry 2e", subject: "Math", url: "https://openstax.org/details/books/algebra-and-trigonometry-2e", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/algebra_trig2e_702x1024.png", description: "Algebra and Trigonometry 2e provides a comprehensive and multi-layered exploration of algebraic principles.", authors: ["Jay Abramson"] },
  { title: "Microbiology", subject: "Science", url: "https://openstax.org/details/books/microbiology", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/microbiology_702x1024.png", description: "Microbiology covers the scope and sequence requirements for a single-semester introductory microbiology course.", authors: ["Nina Parker", "Mark Schneegurt"] },
  { title: "College Physics 2e", subject: "Science", url: "https://openstax.org/details/books/college-physics-2e", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/college_physics2e_702x1024.png", description: "College Physics 2e meets standard scope and sequence requirements for a two-semester introductory algebra-based physics course.", authors: ["Paul Peter Urone", "Roger Hinrichs"] },
  { title: "Business Ethics", subject: "Business", url: "https://openstax.org/details/books/business-ethics", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/business_ethics_702x1024.png", description: "Business Ethics is designed to meet the scope and sequence requirements of a single-semester business ethics course.", authors: ["Stephen Byars", "Kurt Stanberry"] },
  { title: "Principles of Management", subject: "Business", url: "https://openstax.org/details/books/principles-management", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/management_702x1024.png", description: "Principles of Management teaches management principles to tomorrow's business leaders.", authors: ["David S. Bright", "Anastasia H. Cortes"] },
  { title: "Entrepreneurship", subject: "Business", url: "https://openstax.org/details/books/entrepreneurship", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/entrepreneurship_702x1024.png", description: "Entrepreneurship is designed to meet the course needs of introductory courses on Entrepreneurship.", authors: ["Michael Laverty", "Chris Littel"] },
  { title: "Organizational Behavior", subject: "Business", url: "https://openstax.org/details/books/organizational-behavior", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/org_behavior_702x1024.png", description: "Organizational Behavior bridges the gap between theory and practice.", authors: ["J. Stewart Black", "David S. Bright"] },
  { title: "Principles of Accounting Volume 1", subject: "Business", url: "https://openstax.org/details/books/principles-financial-accounting", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/financial_accounting_702x1024.png", description: "Principles of Accounting Volume 1 covers the fundamentals of financial accounting.", authors: ["Mitchell Franklin", "Patty Graybeal"] },
  { title: "Principles of Accounting Volume 2", subject: "Business", url: "https://openstax.org/details/books/principles-managerial-accounting", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/managerial_accounting_702x1024.png", description: "Principles of Accounting Volume 2 covers managerial accounting concepts.", authors: ["Mitchell Franklin", "Patty Graybeal"] },
  { title: "Principles of Marketing", subject: "Business", url: "https://openstax.org/details/books/principles-marketing", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/principles_marketing_702x1024.png", description: "Principles of Marketing provides a foundation for understanding how marketing creates value.", authors: ["Dr. Maria Gomez Albrecht", "Dr. Mark Green"] },
  { title: "Introduction to Business", subject: "Business", url: "https://openstax.org/details/books/introduction-business", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/intro_business_702x1024.png", description: "Introduction to Business covers the scope and sequence of most introductory business courses.", authors: ["Lawrence J. Gitman", "Carl McDaniel"] },
  { title: "Business Law I Essentials", subject: "Business", url: "https://openstax.org/details/books/business-law-i-essentials", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/business_law_702x1024.png", description: "Business Law I Essentials provides an introduction to the foundations of business law.", authors: ["UMGC"] },
  { title: "University Physics Volume 1", subject: "Science", url: "https://openstax.org/details/books/university-physics-volume-1", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/u_physics1_702x1024.png", description: "University Physics Volume 1 covers mechanics, sound, oscillations, and waves.", authors: ["William Moebs", "Samuel J. Ling"] },
  { title: "University Physics Volume 2", subject: "Science", url: "https://openstax.org/details/books/university-physics-volume-2", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/u_physics2_702x1024.png", description: "University Physics Volume 2 covers thermodynamics, electricity and magnetism.", authors: ["Samuel J. Ling", "William Moebs"] },
  { title: "University Physics Volume 3", subject: "Science", url: "https://openstax.org/details/books/university-physics-volume-3", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/u_physics3_702x1024.png", description: "University Physics Volume 3 covers optics, modern physics.", authors: ["Samuel J. Ling", "Jeff Sanny"] },
  { title: "Elementary Algebra 2e", subject: "Math", url: "https://openstax.org/details/books/elementary-algebra-2e", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/elementary_algebra2e_702x1024.png", description: "Elementary Algebra 2e is designed to meet scope and sequence requirements of a one-semester elementary algebra course.", authors: ["Lynn Marecek", "MaryAnne Anthony-Smith"] },
  { title: "Intermediate Algebra 2e", subject: "Math", url: "https://openstax.org/details/books/intermediate-algebra-2e", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/intermediate_algebra2e_702x1024.png", description: "Intermediate Algebra 2e is designed for a one-semester intermediate algebra course.", authors: ["Lynn Marecek", "Andrea Honeycutt Mathis"] },
  { title: "College Success", subject: "Humanities", url: "https://openstax.org/details/books/college-success", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/college_success_702x1024.png", description: "College Success offers practical strategies for student success in college and beyond.", authors: ["Amy Baldwin"] },
  { title: "Writing Guide with Handbook", subject: "Humanities", url: "https://openstax.org/details/books/writing-guide", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/writing_guide_702x1024.png", description: "Writing Guide provides real-world writing instruction with diverse perspectives.", authors: ["Michelle Bachelor Robinson", "Maria Jerskey"] },
  { title: "Introduction to Political Science", subject: "Social Sciences", url: "https://openstax.org/details/books/introduction-political-science", coverUrl: "https://assets.openstax.org/oscms-prodcms/media/documents/intro_poli_sci_702x1024.png", description: "Introduction to Political Science provides a comprehensive overview of political systems.", authors: ["Mark Carl Rom", "Masaki Hidaka"] },
];

function transformOpenStaxBook(book: OpenStaxBook, index: number): Book {
  return {
    id: `openstax-${index}-${book.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20)}`,
    title: book.title,
    author: book.authors.join(", "),
    narrator: null,
    description: book.description,
    duration: 0,
    coverImage: book.coverUrl,
    audioUrl: null,
    contentUrl: book.url,
    genre: `Educational - ${book.subject}`,
    publishedYear: 2024,
    source: "openstax",
    sourceId: book.url,
    totalTime: null,
    language: "English",
    contentType: "ebook",
    isPremium: false,
    pageCount: null,
    searchVector: null,
    readingLevel: computeReadingLevel(book.description, `Educational - ${book.subject}`),
  };
}

export function fetchOpenStaxBooks(limit = 15): Book[] {
  return OPENSTAX_CATALOG.slice(0, limit).map(transformOpenStaxBook);
}

export function searchOpenStaxBooks(query: string, limit = 10): Book[] {
  const q = query.toLowerCase();
  return OPENSTAX_CATALOG
    .filter(b => b.title.toLowerCase().includes(q) || b.subject.toLowerCase().includes(q) || b.description.toLowerCase().includes(q))
    .slice(0, limit)
    .map(transformOpenStaxBook);
}

// ============================================================
// 5. WIKIPEDIA SPOKEN ARTICLES
// ============================================================

interface WikiSpokenArticle {
  pageid: number;
  title: string;
}

export async function fetchWikipediaSpokenArticles(limit = 20): Promise<Book[]> {
  try {
    const categories = [
      'Category:Spoken_articles',
      'Category:Wikipedia_spoken_articles_in_English',
      'Category:Spoken_Wikipedia',
      'Category:Featured_articles_with_spoken_versions',
      'Category:Good_articles_with_spoken_versions',
    ];
    const perCategory = Math.ceil(limit / categories.length);
    const allBooks: Book[] = [];
    const seenIds = new Set<number>();
    
    const promises = categories.map(async (category) => {
      try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(category)}&cmlimit=${Math.min(perCategory, 500)}&cmnamespace=0&format=json&origin=*`;
        const response = await fetchWithTimeout(url, 20000);
        if (!response.ok) return [];
        const data = await response.json();
        return (data.query?.categorymembers || []) as WikiSpokenArticle[];
      } catch {
        return [];
      }
    });
    
    const results = await Promise.all(promises);
    results.forEach(members => {
      members.forEach((article: WikiSpokenArticle) => {
        if (!seenIds.has(article.pageid)) {
          seenIds.add(article.pageid);
          allBooks.push({
            id: `wikipedia-${article.pageid}`,
            title: article.title,
            author: "Wikipedia Contributors",
            narrator: null,
            description: `Listen to the spoken version of the Wikipedia article "${article.title}". Narrated by volunteer readers.`,
            duration: 1200,
            coverImage: null,
            audioUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))}`,
            contentUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))}`,
            genre: "Educational - Encyclopedia",
            publishedYear: null,
            source: "wikipedia",
            narrationType: "human",
            sourceId: String(article.pageid),
            totalTime: null,
            language: "English",
            contentType: "audiobook",
            isPremium: false,
            pageCount: null,
            searchVector: null,
            readingLevel: computeReadingLevel(null, "Educational - Encyclopedia"),
          });
        }
      });
    });
    
    return allBooks.slice(0, limit);
  } catch (error) {
    console.warn('Wikipedia Spoken Articles fetch failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

export async function searchWikipediaSpokenArticles(query: string, limit = 10): Promise<Book[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}+incategory:Spoken_articles&srlimit=${limit}&format=json&origin=*`;
    const response = await fetchWithTimeout(url, 20000);
    if (!response.ok) return [];
    const data = await response.json();
    const results = data.query?.search || [];
    
    return results.map((result: any) => ({
      id: `wikipedia-${result.pageid}`,
      title: result.title,
      author: "Wikipedia Contributors",
      narrator: null,
      description: result.snippet?.replace(/<[^>]*>/g, '') || `Spoken version of "${result.title}" from Wikipedia.`,
      duration: 1200,
      coverImage: null,
      audioUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, '_'))}`,
      contentUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, '_'))}`,
      genre: "Educational - Encyclopedia",
      publishedYear: null,
      source: "wikipedia",
      narrationType: "human",
      sourceId: String(result.pageid),
      totalTime: null,
      language: "English",
      contentType: "audiobook",
      isPremium: false,
      pageCount: null,
      searchVector: null,
      readingLevel: computeReadingLevel(result.snippet?.replace(/<[^>]*>/g, '') || null, "Educational - Encyclopedia"),
    }));
  } catch (error) {
    console.warn('Wikipedia search failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

// ============================================================
// 6. SERIALIZED FICTION PODCASTS (via iTunes Podcast API)
// ============================================================

export async function fetchSerializedFictionPodcasts(limit = 15): Promise<Book[]> {
  try {
    const terms = ['audiobook fiction', 'serialized fiction podcast', 'audio drama', 'fiction podcast', 'storytelling podcast', 'narrative podcast', 'horror fiction podcast', 'comedy podcast drama', 'sci-fi audio drama', 'true crime podcast', 'literary fiction podcast', 'fantasy audio drama', 'mystery thriller podcast', 'history documentary podcast', 'science podcast', 'education podcast lectures', 'philosophy podcast', 'book review podcast', 'writing craft podcast', 'mythology legends podcast'];
    const perTerm = Math.min(Math.ceil(limit / terms.length), 200);
    const allBooks: Book[] = [];
    const seenIds = new Set<string>();
    
    const promises = terms.map(async (term) => {
      try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=podcast&limit=${perTerm}&country=us`;
        const response = await fetchWithTimeout(url, 15000);
        if (!response.ok) return [];
        const data = await response.json();
        return data.results || [];
      } catch {
        return [];
      }
    });
    
    const results = await Promise.all(promises);
    results.forEach((podcasts: any[]) => {
      podcasts.forEach((podcast: any) => {
        const id = `podcast-${podcast.collectionId || podcast.trackId}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          allBooks.push({
            id,
            title: podcast.collectionName || podcast.trackName,
            author: podcast.artistName || "Unknown",
            narrator: null,
            description: podcast.description || podcast.shortDescription || null,
            duration: 1800,
            coverImage: podcast.artworkUrl600 || podcast.artworkUrl100 || null,
            audioUrl: podcast.feedUrl || podcast.collectionViewUrl || "",
            contentUrl: null,
            genre: "Podcast - Fiction",
            publishedYear: podcast.releaseDate ? new Date(podcast.releaseDate).getFullYear() : null,
            source: "podcast",
            narrationType: "human",
            sourceId: String(podcast.collectionId || podcast.trackId),
            totalTime: null,
            language: "English",
            contentType: "audiobook",
            isPremium: false,
            pageCount: null,
            searchVector: null,
            readingLevel: computeReadingLevel(podcast.description || podcast.shortDescription || null, "Podcast - Fiction"),
          });
        }
      });
    });
    
    return allBooks.slice(0, limit);
  } catch (error) {
    console.warn('Podcast fetch failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

export async function searchSerializedFictionPodcasts(query: string, limit = 10): Promise<Book[]> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=podcast&limit=${limit}&country=us`;
    const response = await fetchWithTimeout(url, 20000);
    if (!response.ok) return [];
    const data = await response.json();
    
    return (data.results || []).map((podcast: any) => ({
      id: `podcast-${podcast.collectionId || podcast.trackId}`,
      title: podcast.collectionName || podcast.trackName,
      author: podcast.artistName || "Unknown",
      narrator: null,
      description: podcast.description || podcast.shortDescription || null,
      duration: 1800,
      coverImage: podcast.artworkUrl600 || podcast.artworkUrl100 || null,
      audioUrl: podcast.feedUrl || podcast.collectionViewUrl || "",
      contentUrl: null,
      genre: "Podcast",
      publishedYear: podcast.releaseDate ? new Date(podcast.releaseDate).getFullYear() : null,
      source: "podcast",
      narrationType: "human",
      sourceId: String(podcast.collectionId || podcast.trackId),
      totalTime: null,
      language: "English",
      contentType: "audiobook",
      isPremium: false,
      pageCount: null,
      searchVector: null,
      readingLevel: computeReadingLevel(podcast.description || podcast.shortDescription || null, "Podcast"),
    }));
  } catch (error) {
    console.warn('Podcast search failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

// ============================================================
// 7. BBC SOUNDS / PUBLIC RADIO PODCASTS
// ============================================================

const BBC_PODCAST_IDS = [
  { id: 'p02nq0gn', title: 'In Our Time', genre: 'Educational - History' },
  { id: 'p02pc9pj', title: 'Friday Night Comedy', genre: 'Comedy' },
  { id: 'p02nrss1', title: 'The Infinite Monkey Cage', genre: 'Educational - Science' },
  { id: 'p02pc9zn', title: 'Desert Island Discs', genre: 'Interview' },
  { id: 'p02nrsln', title: 'Kermode and Mayo Film Review', genre: 'Entertainment' },
  { id: 'p02nq0lx', title: 'More or Less', genre: 'Educational - Science' },
  { id: 'p02r4s31', title: 'Thinking Allowed', genre: 'Educational - Social Sciences' },
  { id: 'p02nrslm', title: 'Click', genre: 'Educational - Technology' },
  { id: 'p02nrsft', title: 'The Forum', genre: 'Educational - Humanities' },
  { id: 'p02pc9qc', title: 'Witness History', genre: 'Educational - History' },
  { id: 'p02pc9xt', title: 'Outlook', genre: 'Documentary' },
  { id: 'p02nq0sr', title: 'Science in Action', genre: 'Educational - Science' },
  { id: 'p02nq0s4', title: 'Discovery', genre: 'Educational - Science' },
  { id: 'p02nrsjn', title: 'Analysis', genre: 'Educational - Social Sciences' },
  { id: 'p02pc9v1', title: 'The Real Story', genre: 'News' },
  { id: 'p02nq0nx', title: 'The Food Programme', genre: 'Lifestyle' },
  { id: 'p02nrsmt', title: 'From Our Own Correspondent', genre: 'News' },
  { id: 'p02nrshz', title: 'A Good Read', genre: 'Literature' },
  { id: 'p02nrsd2', title: 'The Life Scientific', genre: 'Educational - Science' },
  { id: 'p02nrtqt', title: 'Costing the Earth', genre: 'Environment' },
  { id: 'p02nrss8', title: 'Inside Science', genre: 'Educational - Science' },
  { id: 'p02nrsjp', title: 'All in the Mind', genre: 'Educational - Psychology' },
  { id: 'p02pc9y1', title: 'Heart and Soul', genre: 'Religion' },
  { id: 'p02nq0pt', title: 'Short Cuts', genre: 'Documentary' },
  { id: 'p02nrsrw', title: 'The Bottom Line', genre: 'Business' },
];

function parseBBCRSS(xml: string): Array<{ title: string; description: string; audioUrl: string; pubDate: string; duration: string }> {
  const items: Array<{ title: string; description: string; audioUrl: string; pubDate: string; duration: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || "";
    const desc = item.match(/<description>([\s\S]*?)<\/description>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || "";
    const audioUrl = item.match(/<enclosure[^>]*url="([^"]*)"[^>]*>/)?.[1] || "";
    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
    const duration = item.match(/<itunes:duration>(.*?)<\/itunes:duration>/)?.[1] || "1800";
    items.push({ title: title.replace(/<[^>]*>/g, ''), description: desc.replace(/<[^>]*>/g, '').substring(0, 500), audioUrl, pubDate, duration });
  }
  return items;
}

export async function fetchBBCPodcasts(limit = 12): Promise<Book[]> {
  const books: Book[] = [];
  const podcastsToFetch = BBC_PODCAST_IDS.slice(0, Math.min(limit, BBC_PODCAST_IDS.length));
  
  const promises = podcastsToFetch.map(async (podcast) => {
    try {
      const response = await fetchWithTimeout(`https://podcasts.files.bbci.co.uk/${podcast.id}.rss`, 8000);
      if (!response.ok) return null;
      const xml = await response.text();
      const showTitle = xml.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')?.replace(/<[^>]*>/g, '') || podcast.title;
      const showImage = xml.match(/<itunes:image[^>]*href="([^"]*)"[^>]*>/)?.[1] || 
                        xml.match(/<image>[\s\S]*?<url>(.*?)<\/url>[\s\S]*?<\/image>/)?.[1] || null;
      const showDesc = xml.match(/<itunes:summary>([\s\S]*?)<\/itunes:summary>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')?.replace(/<[^>]*>/g, '') || "";
      const showAuthor = xml.match(/<itunes:author>(.*?)<\/itunes:author>/)?.[1] || "BBC";
      
      return {
        id: `bbc-${podcast.id}`,
        title: showTitle,
        author: showAuthor,
        narrator: null,
        description: showDesc.substring(0, 500),
        duration: 1800,
        coverImage: showImage,
        audioUrl: `https://podcasts.files.bbci.co.uk/${podcast.id}.rss`,
        contentUrl: null,
        genre: podcast.genre,
        publishedYear: new Date().getFullYear(),
        source: "bbc",
        narrationType: "human",
        sourceId: podcast.id,
        totalTime: null,
        language: "English",
        contentType: "audiobook",
        isPremium: false,
        pageCount: null,
        searchVector: null,
        readingLevel: computeReadingLevel(showDesc.substring(0, 500), podcast.genre),
      } as Book;
    } catch {
      return null;
    }
  });
  
  const results = await Promise.all(promises);
  results.forEach(b => { if (b) books.push(b); });
  return books.slice(0, limit);
}

export async function searchBBCPodcasts(query: string, limit = 5): Promise<Book[]> {
  const q = query.toLowerCase();
  const matching = BBC_PODCAST_IDS.filter(p => p.title.toLowerCase().includes(q) || p.genre.toLowerCase().includes(q));
  if (matching.length === 0) return [];
  
  const books: Book[] = [];
  for (const podcast of matching.slice(0, limit)) {
    try {
      const response = await fetchWithTimeout(`https://podcasts.files.bbci.co.uk/${podcast.id}.rss`, 8000);
      if (!response.ok) continue;
      const xml = await response.text();
      const showTitle = xml.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')?.replace(/<[^>]*>/g, '') || podcast.title;
      const showImage = xml.match(/<itunes:image[^>]*href="([^"]*)"[^>]*>/)?.[1] || null;
      const showDesc = xml.match(/<itunes:summary>([\s\S]*?)<\/itunes:summary>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')?.replace(/<[^>]*>/g, '') || "";
      
      books.push({
        id: `bbc-${podcast.id}`,
        title: showTitle,
        author: "BBC",
        narrator: null,
        description: showDesc.substring(0, 500),
        duration: 1800,
        coverImage: showImage,
        audioUrl: `https://podcasts.files.bbci.co.uk/${podcast.id}.rss`,
        contentUrl: null,
        genre: podcast.genre,
        publishedYear: new Date().getFullYear(),
        source: "bbc",
        narrationType: "human",
        sourceId: podcast.id,
        totalTime: null,
        language: "English",
        contentType: "audiobook",
        isPremium: false,
        pageCount: null,
        searchVector: null,
        readingLevel: computeReadingLevel(showDesc.substring(0, 500), podcast.genre),
      });
    } catch {
      continue;
    }
  }
  return books;
}

// ============================================================
// 8. SPOTIFY PODCASTS (uses existing Spotify client)
// ============================================================

export async function fetchSpotifyPodcasts(spotifyClient: any, limit = 10): Promise<Book[]> {
  try {
    if (!spotifyClient) return [];
    const results = await spotifyClient.search("audiobook fiction drama", ["show"], undefined, limit);
    const shows = results.shows?.items || [];
    
    return shows.map((show: any) => ({
      id: `spotify-show-${show.id}`,
      title: show.name,
      author: show.publisher || "Unknown",
      narrator: null,
      description: show.description?.substring(0, 500) || null,
      duration: show.total_episodes ? show.total_episodes * 1800 : 3600,
      coverImage: show.images?.[0]?.url || null,
      audioUrl: show.external_urls?.spotify || "",
      contentUrl: null,
      genre: "Podcast",
      publishedYear: null,
      source: "spotify-podcast",
      sourceId: show.id,
      totalTime: null,
      language: show.languages?.[0] || "en",
      contentType: "audiobook",
      isPremium: false,
      pageCount: null,
      searchVector: null,
      readingLevel: computeReadingLevel(show.description?.substring(0, 500) || null, "Podcast"),
    }));
  } catch (error) {
    console.warn('Spotify podcast fetch failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

export async function searchSpotifyPodcasts(spotifyClient: any, query: string, limit = 10): Promise<Book[]> {
  try {
    if (!spotifyClient) return [];
    const results = await spotifyClient.search(query, ["show"], undefined, limit);
    const shows = results.shows?.items || [];
    
    return shows.map((show: any) => ({
      id: `spotify-show-${show.id}`,
      title: show.name,
      author: show.publisher || "Unknown",
      narrator: null,
      description: show.description?.substring(0, 500) || null,
      duration: show.total_episodes ? show.total_episodes * 1800 : 3600,
      coverImage: show.images?.[0]?.url || null,
      audioUrl: show.external_urls?.spotify || "",
      contentUrl: null,
      genre: "Podcast",
      publishedYear: null,
      source: "spotify-podcast",
      sourceId: show.id,
      totalTime: null,
      language: show.languages?.[0] || "en",
      contentType: "audiobook",
      isPremium: false,
      pageCount: null,
      searchVector: null,
      readingLevel: computeReadingLevel(show.description?.substring(0, 500) || null, "Podcast"),
    }));
  } catch (error) {
    console.warn('Spotify podcast search failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}
