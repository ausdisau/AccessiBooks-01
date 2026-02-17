import type { Book } from "@shared/schema";

async function fetchWithTimeout(url: string, timeout = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'AccessiBooks/1.0 (audiobook-platform)' }
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
    sourceId: entry.link,
    totalTime: null,
    language: "English",
    contentType: "audiobook",
    isPremium: false,
    pageCount: null,
  };
}

export async function fetchLoyalBooks(limit = 20): Promise<Book[]> {
  try {
    const genres = ['Fiction', 'History', 'Science', 'Philosophy', 'Poetry', 'Adventure'];
    const genre = genres[Math.floor(Date.now() / 86400000) % genres.length];
    const url = `https://www.loyalbooks.com/book/genre/${genre}/feed`;
    const response = await fetchWithTimeout(url, 10000);
    if (!response.ok) return [];
    const xml = await response.text();
    const entries = parseLoyalBooksRSS(xml);
    return entries.slice(0, limit).map((e, i) => transformLoyalBook(e, i));
  } catch (error) {
    console.warn('Loyal Books fetch failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

export async function searchLoyalBooks(query: string, limit = 10): Promise<Book[]> {
  try {
    const url = `https://www.loyalbooks.com/search?q=${encodeURIComponent(query)}&type=audiobook`;
    const response = await fetchWithTimeout(url, 10000);
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
        sourceId: m[1],
        totalTime: null,
        language: "English",
        contentType: "audiobook",
        isPremium: false,
        pageCount: null,
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
    isPremium: false,
    pageCount: null,
  };
}

export async function fetchStandardEbooks(limit = 20): Promise<Book[]> {
  try {
    const response = await fetchWithTimeout('https://standardebooks.org/feeds/opds/new-releases', 10000);
    if (!response.ok) return [];
    const xml = await response.text();
    const entries = parseOPDSFeed(xml);
    return entries.slice(0, limit).map(transformStandardEbook);
  } catch (error) {
    console.warn('Standard Ebooks fetch failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

export async function searchStandardEbooks(query: string, limit = 10): Promise<Book[]> {
  try {
    const response = await fetchWithTimeout(
      `https://standardebooks.org/feeds/opds/all?query=${encodeURIComponent(query)}`,
      10000
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
    const response = await fetchWithTimeout('https://catalog.feedbooks.com/publicdomain/browse/recent.atom', 10000);
    if (!response.ok) return [];
    const xml = await response.text();
    const entries = parseOPDSFeed(xml);
    return entries.slice(0, limit).map(entry => {
      const coverUrl = entry.coverUrl ? 
        (entry.coverUrl.startsWith('http') ? entry.coverUrl : `https://catalog.feedbooks.com${entry.coverUrl}`) : null;
      const epubUrl = entry.contentUrl ?
        (entry.contentUrl.startsWith('http') ? entry.contentUrl : `https://catalog.feedbooks.com${entry.contentUrl}`) : null;
      return {
        id: `feedbooks-${entry.id.replace(/[^a-z0-9-]/gi, '-').substring(0, 50)}`,
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
      };
    });
  } catch (error) {
    console.warn('Feedbooks fetch failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

export async function searchFeedbooks(query: string, limit = 10): Promise<Book[]> {
  try {
    const response = await fetchWithTimeout(
      `https://catalog.feedbooks.com/publicdomain/browse/search.atom?query=${encodeURIComponent(query)}`,
      10000
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
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Spoken_articles&cmlimit=${limit}&cmnamespace=0&format=json&origin=*`;
    const response = await fetchWithTimeout(url, 10000);
    if (!response.ok) return [];
    const data = await response.json();
    const members: WikiSpokenArticle[] = data.query?.categorymembers || [];
    
    const books: Book[] = members.map((article, idx) => ({
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
      sourceId: String(article.pageid),
      totalTime: null,
      language: "English",
      contentType: "audiobook",
      isPremium: false,
      pageCount: null,
    }));
    
    return books;
  } catch (error) {
    console.warn('Wikipedia Spoken Articles fetch failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

export async function searchWikipediaSpokenArticles(query: string, limit = 10): Promise<Book[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}+incategory:Spoken_articles&srlimit=${limit}&format=json&origin=*`;
    const response = await fetchWithTimeout(url, 10000);
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
      sourceId: String(result.pageid),
      totalTime: null,
      language: "English",
      contentType: "audiobook",
      isPremium: false,
      pageCount: null,
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
    const terms = ['audiobook fiction', 'serialized fiction podcast', 'audio drama'];
    const term = terms[Math.floor(Date.now() / 86400000) % terms.length];
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=podcast&limit=${limit}&country=us&genreId=1483`;
    const response = await fetchWithTimeout(url, 10000);
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
      genre: "Podcast - Fiction",
      publishedYear: podcast.releaseDate ? new Date(podcast.releaseDate).getFullYear() : null,
      source: "podcast",
      sourceId: String(podcast.collectionId || podcast.trackId),
      totalTime: null,
      language: "English",
      contentType: "audiobook",
      isPremium: false,
      pageCount: null,
    }));
  } catch (error) {
    console.warn('Podcast fetch failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}

export async function searchSerializedFictionPodcasts(query: string, limit = 10): Promise<Book[]> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=podcast&limit=${limit}&country=us`;
    const response = await fetchWithTimeout(url, 10000);
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
      sourceId: String(podcast.collectionId || podcast.trackId),
      totalTime: null,
      language: "English",
      contentType: "audiobook",
      isPremium: false,
      pageCount: null,
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
  { id: 'p02nrsln', title: 'Kermode and Mayo\'s Film Review', genre: 'Entertainment' },
  { id: 'p02nq0lx', title: 'More or Less', genre: 'Educational - Science' },
  { id: 'p02r4s31', title: 'Thinking Allowed', genre: 'Educational - Social Sciences' },
  { id: 'p02nrslm', title: 'Click', genre: 'Educational - Technology' },
  { id: 'p02nrsft', title: 'The Forum', genre: 'Educational - Humanities' },
  { id: 'p02pc9qc', title: 'Witness History', genre: 'Educational - History' },
  { id: 'p02pc9xt', title: 'Outlook', genre: 'Documentary' },
  { id: 'p02nq0sr', title: 'Science in Action', genre: 'Educational - Science' },
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
        sourceId: podcast.id,
        totalTime: null,
        language: "English",
        contentType: "audiobook",
        isPremium: false,
        pageCount: null,
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
        sourceId: podcast.id,
        totalTime: null,
        language: "English",
        contentType: "audiobook",
        isPremium: false,
        pageCount: null,
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
    }));
  } catch (error) {
    console.warn('Spotify podcast search failed:', error instanceof Error ? error.message : 'Unknown');
    return [];
  }
}
