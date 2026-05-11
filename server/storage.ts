import { type Book, type InsertBook, type User, type InsertUser, type UpsertUser, users, listeningHistory, type ListeningHistory, type InsertListeningHistory, playlists, playlistItems, type Playlist, type InsertPlaylist, type PlaylistItem, type InsertPlaylistItem, type PlaylistWithCount, type DJRecommendation, chapters, type Chapter, type InsertChapter, books as booksTable, purchases, type Purchase, type InsertPurchase, referrals, type Referral, wordBankEntries, type DbWordBankEntry, plans, type Plan, type InsertPlan, subscriptions, type Subscription, type InsertSubscription, entitlements, type Entitlement, type InsertEntitlement, listeningSessions, type ListeningSession, type InsertListeningSession, adRewards, type AdReward, type InsertAdReward, accessibilityPreferences, type AccessibilityPreferences, type InsertAccessibilityPreferences, userPreferences } from "@shared/schema";
import { analyticsService } from "./analyticsService";
import { computeReadingLevel, genrePatternsForLevel } from "./readingLevelUtils";
import { randomUUID } from "crypto";
import session from "express-session";
import createMemoryStore from "memorystore";
import { db } from "./db";
import { eq, desc, and, sql, count, asc } from "drizzle-orm";
import { fetchWithRetry, cachedFetch, CACHE_TTL } from "./apiCache";
import {
  fetchLoyalBooks, searchLoyalBooks,
  fetchStandardEbooks, searchStandardEbooks,
  fetchFeedbooks, searchFeedbooks,
  fetchOpenStaxBooks, searchOpenStaxBooks,
  fetchWikipediaSpokenArticles, searchWikipediaSpokenArticles,
  fetchSerializedFictionPodcasts, searchSerializedFictionPodcasts,
  fetchBBCPodcasts, searchBBCPodcasts,
  fetchSpotifyPodcasts, searchSpotifyPodcasts,
} from "./contentSources";

const MemoryStore = createMemoryStore(session);

const EXTERNAL_API_BASE = "https://library-management-api-i6if.onrender.com/api";
const LIBRIVOX_API_BASE = "https://librivox.org/api/feed/audiobooks";
const OPEN_LIBRARY_API_BASE = "https://openlibrary.org";
const OPEN_LIBRARY_COVERS_BASE = "https://covers.openlibrary.org";
const GOOGLE_BOOKS_API_BASE = "https://www.googleapis.com/books/v1";
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";
const INTERNET_ARCHIVE_API_BASE = "https://archive.org";
const ITUNES_SEARCH_API_BASE = "https://itunes.apple.com";

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface BookQueryOptions {
  cursor?: string;
  limit?: number;
  source?: string;
  contentType?: string;
  genre?: string;
  search?: string;
  readingLevel?: number;
}

function mapRowToBook(row: any): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    narrator: row.narrator || null,
    description: row.description || null,
    duration: row.duration || 0,
    coverImage: row.cover_image || row.coverImage || null,
    audioUrl: row.audio_url || row.audioUrl || null,
    contentUrl: row.content_url || row.contentUrl || null,
    genre: row.genre || null,
    publishedYear: row.published_year ?? row.publishedYear ?? null,
    source: row.source || "local",
    sourceId: row.source_id || row.sourceId || null,
    totalTime: row.total_time || row.totalTime || null,
    language: row.language || "English",
    contentType: row.content_type || row.contentType || "audiobook",
    isPremium: row.is_premium ?? row.isPremium ?? false,
    freeTierAvailable: row.free_tier_available ?? row.freeTierAvailable ?? true,
    adSupported: row.ad_supported ?? row.adSupported ?? true,
    transcriptAvailable: row.transcript_available ?? row.transcriptAvailable ?? false,
    pageCount: row.page_count ?? row.pageCount ?? null,
    searchVector: row.search_vector || row.searchVector || null,
    readingLevel: row.reading_level ?? row.readingLevel ?? computeReadingLevel(row.description, row.genre),
  };
}

export interface IStorage {
  getBooks(): Promise<Book[]>;
  getBooksPaginated(options: BookQueryOptions): Promise<PaginatedResult<Book>>;
  getBookCount(filters?: { source?: string; contentType?: string; genre?: string }): Promise<number>;
  getBook(id: string): Promise<Book | undefined>;
  createBook(book: InsertBook): Promise<Book>;
  updateBook(id: string, updates: Partial<Omit<InsertBook, 'id'>>, opts?: { preserveReadingLevel?: boolean }): Promise<Book | undefined>;
  searchBooks(query: string): Promise<Book[]>;
  refreshRuntimeBooks(): Promise<{ inserted: number; skipped: number }>;
  
  // User management (Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Legacy user management (for external API compatibility)
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  authenticateExternalUser(username: string, password: string): Promise<User | null>;
  
  // Subscription management
  updateUserSubscription(userId: string, subscription: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string | null;
    subscriptionTier?: string;
    subscriptionStatus?: string;
    subscriptionEndDate?: Date | null;
  }): Promise<User | undefined>;
  getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined>;
  
  // Purchases
  getUserPurchases(userId: string): Promise<Purchase[]>;
  getUserPurchase(userId: string, bookId: string): Promise<Purchase | undefined>;
  createPurchase(purchase: InsertPurchase): Promise<Purchase>;
  
  // Listening history
  getListeningHistory(userId: string, limit?: number): Promise<ListeningHistory[]>;
  updateListeningProgress(userId: string, bookId: string, progress: {
    currentTime: number;
    bookTitle: string;
    bookAuthor?: string;
    bookCover?: string;
    totalDuration?: number;
  }): Promise<ListeningHistory>;
  getContinueListening(userId: string, limit?: number): Promise<ListeningHistory[]>;
  
  // Chapters
  getBookChapters(bookId: string): Promise<Chapter[]>;
  createChapter(chapter: InsertChapter): Promise<Chapter>;
  createChapters(chapters: InsertChapter[]): Promise<Chapter[]>;
  deleteBookChapters(bookId: string): Promise<boolean>;
  
  // Security
  validateAudioUrl(url: string): boolean;
  
  // Playlists (Reading Lists)
  getPlaylists(userId?: string): Promise<PlaylistWithCount[]>;
  getPlaylist(id: string): Promise<PlaylistWithCount | undefined>;
  createPlaylist(playlist: InsertPlaylist): Promise<Playlist>;
  updatePlaylist(id: string, updates: Partial<InsertPlaylist>): Promise<Playlist | undefined>;
  deletePlaylist(id: string): Promise<boolean>;
  addToPlaylist(playlistId: string, book: { bookId: string; bookTitle: string; bookAuthor?: string; bookCover?: string }): Promise<PlaylistItem>;
  removeFromPlaylist(playlistId: string, bookId: string): Promise<boolean>;
  getPlaylistItems(playlistId: string): Promise<PlaylistItem[]>;
  getCuratedPlaylists(): Promise<PlaylistWithCount[]>;
  
  // DJ Recommendations
  getDJRecommendations(userId?: string): Promise<DJRecommendation[]>;
  
  // Referrals
  getReferralByCode(code: string): Promise<Referral | null>;
  createReferral(referrerId: string): Promise<Referral>;
  completeReferral(code: string, referredUserId: string): Promise<void>;
  getUserReferrals(userId: string): Promise<Referral[]>;
  getUserReferralCode(userId: string): Promise<string>;

  // Word Bank
  getWordBankEntries(userId: string): Promise<DbWordBankEntry[]>;
  addWordBankEntry(userId: string, data: { word: string; definition: string | null; imageUrl: string | null }): Promise<{ entry: DbWordBankEntry; isNew: boolean }>;
  removeWordBankEntry(userId: string, entryId: string): Promise<boolean>;
  setWordBankDbAvailable(available: boolean): void;
  getWordBankCount(userId: string): Promise<number>;

  // Plans
  getPlans(): Promise<Plan[]>;
  getPlan(id: string): Promise<Plan | undefined>;
  getPlanByTier(tier: string): Promise<Plan | undefined>;
  upsertPlan(plan: InsertPlan): Promise<Plan>;

  // Subscriptions
  getSubscription(userId: string): Promise<Subscription | undefined>;
  upsertSubscription(subscription: InsertSubscription): Promise<Subscription>;

  // Entitlements
  createEntitlement(entitlement: InsertEntitlement): Promise<Entitlement>;
  getUserEntitlements(userId: string): Promise<Entitlement[]>;

  // Listening Sessions
  createListeningSession(session: InsertListeningSession): Promise<ListeningSession>;
  endListeningSession(sessionId: string, minutesListened: number, interruptedBy?: string): Promise<ListeningSession | undefined>;

  // Ad Rewards
  createAdReward(reward: InsertAdReward): Promise<AdReward>;
  getAdRewards(userId: string): Promise<AdReward[]>;

  // Accessibility Preferences
  getAccessibilityPreferences(userId: string): Promise<AccessibilityPreferences | undefined>;
  upsertAccessibilityPreferences(userId: string, prefs: Omit<InsertAccessibilityPreferences, "userId">): Promise<AccessibilityPreferences>;

  sessionStore: session.Store;
}

interface ExternalBook {
  _id: string;
  title: string;
  author: string;
  isbn?: string;
  publishedYear?: number;
  genre?: string;
  description?: string;
  coverImage?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Open Library API interfaces
interface OpenLibraryBook {
  key: string;
  title: string;
  author_name?: string[];
  author_key?: string[];
  first_publish_year?: number;
  isbn?: string[];
  cover_i?: number;
  subject?: string[];
  publisher?: string[];
  language?: string[];
  ia?: string[];
  has_fulltext?: boolean;
  public_scan_b?: boolean;
  edition_count?: number;
}

interface OpenLibrarySearchResponse {
  numFound: number;
  start: number;
  numFoundExact: boolean;
  docs: OpenLibraryBook[];
}

// Google Books API interfaces
interface GoogleBooksVolumeInfo {
  title: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  industryIdentifiers?: Array<{
    type: string;
    identifier: string;
  }>;
  pageCount?: number;
  categories?: string[];
  averageRating?: number;
  ratingsCount?: number;
  imageLinks?: {
    thumbnail?: string;
    smallThumbnail?: string;
  };
  language?: string;
  previewLink?: string;
  infoLink?: string;
}

interface GoogleBooksVolume {
  kind: string;
  id: string;
  volumeInfo: GoogleBooksVolumeInfo;
  saleInfo?: {
    saleability?: string;
    isEbook?: boolean;
  };
  accessInfo?: {
    viewability?: string;
    webReaderLink?: string;
    embeddable?: boolean;
  };
}

interface GoogleBooksSearchResponse {
  kind: string;
  totalItems: number;
  items?: GoogleBooksVolume[];
}

// iTunes Search API interfaces
interface iTunesAudiobook {
  wrapperType: string;
  kind?: string;
  artistId?: number;
  collectionId: number;
  trackId?: number;
  artistName: string;
  collectionName: string;
  trackName?: string;
  collectionCensoredName?: string;
  trackCensoredName?: string;
  artistViewUrl?: string;
  collectionViewUrl: string;
  trackViewUrl?: string;
  previewUrl?: string;
  artworkUrl30?: string;
  artworkUrl60?: string;
  artworkUrl100?: string;
  collectionPrice?: number;
  trackPrice?: number;
  releaseDate?: string;
  collectionExplicitness?: string;
  trackExplicitness?: string;
  discCount?: number;
  discNumber?: number;
  trackCount?: number;
  trackNumber?: number;
  trackTimeMillis?: number;
  country?: string;
  currency?: string;
  primaryGenreName?: string;
  description?: string;
  shortDescription?: string;
  longDescription?: string;
}

interface iTunesSearchResponse {
  resultCount: number;
  results: iTunesAudiobook[];
}

// Internet Archive API interfaces
interface InternetArchiveDoc {
  identifier: string;
  title: string;
  creator?: string | string[];
  description?: string;
  publisher?: string | string[];
  date?: string;
  year?: number;
  subject?: string | string[];
  language?: string | string[];
  mediatype?: string;
  format?: string[];
  collection?: string[];
}

interface InternetArchiveSearchResponse {
  response: {
    numFound: number;
    docs: InternetArchiveDoc[];
  };
  responseHeader: {
    status: number;
  };
}

// Project Gutenberg API interfaces (via Gutendex)
interface GutenbergBook {
  id: number;
  title: string;
  authors: Array<{
    name: string;
    birth_year?: number;
    death_year?: number;
  }>;
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  copyright: boolean;
  media_type: string;
  formats: Record<string, string>;
  download_count: number;
}

interface GutenbergSearchResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutenbergBook[];
}

// LibriVox API interfaces
interface LibriVoxAuthor {
  id: string;
  first_name: string;
  last_name: string;
  dob?: string;
  dod?: string;
}

interface LibriVoxSection {
  id: string;
  title: string;
  listen_url: string;
  playtime: string;
  section_number: string;
}

// Chapter type now imported from @shared/schema

interface LibriVoxBook {
  id: string;
  title: string;
  description: string;
  url_zip_file: string;
  totaltime: string;
  totaltimesecs: number;
  authors: LibriVoxAuthor[];
  sections: LibriVoxSection[];
  language: string;
  copyright_year?: string;
  genres?: string[];
}

interface ExternalUser {
  _id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Transform external user data to our format (for OAuth compatibility)
function transformExternalUser(externalUser: ExternalUser): User {
  return {
    id: externalUser._id,
    email: externalUser.email,
    firstName: externalUser.firstName || null,
    lastName: externalUser.lastName || null,
    profileImageUrl: externalUser.profilePicture || null,
    passwordHash: null,
    authProvider: "external",
    providerId: externalUser._id,
    subscriptionTier: "free",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionEndDate: null,
    stripeEasyEnglishSubscriptionItemId: null,
    createdAt: externalUser.createdAt ? new Date(externalUser.createdAt) : new Date(),
    updatedAt: externalUser.updatedAt ? new Date(externalUser.updatedAt) : new Date(),
    referralCode: null,
    referralCredits: 0,
    // Legacy NextAuth columns
    name: null,
    emailVerified: null,
    image: null,
  };
}

// Function to transform external API data to our format
function transformExternalBook(externalBook: ExternalBook): Book {
  return {
    id: externalBook._id,
    title: externalBook.title,
    author: externalBook.author,
    narrator: null, // External API doesn't have narrator
    description: externalBook.description || null,
    duration: Math.floor(Math.random() * 30000) + 18000, // Random duration between 5-13 hours
    coverImage: externalBook.coverImage || null,
    audioUrl: `${EXTERNAL_API_BASE}/stream/${externalBook._id}`, // Mock audio URL
    contentUrl: null,
    genre: externalBook.genre || null,
    publishedYear: externalBook.publishedYear || null,
    source: "library-api",
    sourceId: externalBook._id,
    totalTime: null,
    language: "English",
    contentType: "audiobook",
    isPremium: false,
    pageCount: null,
    searchVector: null,
    readingLevel: computeReadingLevel(externalBook.description || null, externalBook.genre || null),
  };
}

// Function to transform Open Library API data to our format
function transformOpenLibraryBook(openLibraryBook: OpenLibraryBook): Book {
  const author = openLibraryBook.author_name ? openLibraryBook.author_name[0] : "Unknown Author";
  const coverImage = openLibraryBook.cover_i 
    ? `${OPEN_LIBRARY_COVERS_BASE}/b/id/${openLibraryBook.cover_i}-M.jpg`
    : null;
  
  // Extract ID from key (e.g., "/works/OL27448W" -> "OL27448W")
  const olid = openLibraryBook.key.split('/').pop() || openLibraryBook.key;
  
  return {
    id: `openlibrary-${olid}`,
    title: openLibraryBook.title,
    author: author,
    narrator: null, // Open Library doesn't have narrator info
    description: null, // Basic search doesn't include description
    duration: 0, // Open Library is for ebooks, not audiobooks
    coverImage: coverImage,
    audioUrl: "", // Open Library doesn't provide audio files
    contentUrl: `https://openlibrary.org${openLibraryBook.key}`,
    genre: openLibraryBook.subject ? openLibraryBook.subject[0] : null,
    publishedYear: openLibraryBook.first_publish_year || null,
    source: "open-library",
    sourceId: olid,
    totalTime: "0:00:00",
    language: openLibraryBook.language ? openLibraryBook.language[0] : "English",
    contentType: "ebook",
    isPremium: false,
    pageCount: null,
    searchVector: null,
    readingLevel: computeReadingLevel(null, openLibraryBook.subject ? openLibraryBook.subject[0] : null),
  };
}

// Function to transform Google Books API data to our format
function transformGoogleBooksVolume(volume: GoogleBooksVolume): Book {
  const volumeInfo = volume.volumeInfo;
  const author = volumeInfo.authors ? volumeInfo.authors[0] : "Unknown Author";
  
  // Get high-quality cover image (prefer regular thumbnail over small)
  const coverImage = volumeInfo.imageLinks?.thumbnail 
    ? volumeInfo.imageLinks.thumbnail.replace('http://', 'https://')
    : volumeInfo.imageLinks?.smallThumbnail?.replace('http://', 'https://') || null;
  
  // Extract ISBN if available
  const isbn = volumeInfo.industryIdentifiers?.find(id => 
    id.type === 'ISBN_13' || id.type === 'ISBN_10'
  )?.identifier;
  
  // Parse year from publishedDate (could be YYYY, YYYY-MM, or YYYY-MM-DD)
  const publishedYear = volumeInfo.publishedDate 
    ? parseInt(volumeInfo.publishedDate.split('-')[0]) 
    : null;
  
  // Check if this is a commercial/paid book
  const isPremium = volume.saleInfo?.saleability === "FOR_SALE" || 
                    volume.accessInfo?.viewability === "NO_PAGES";
  
  return {
    id: `googlebooks-${volume.id}`,
    title: volumeInfo.title,
    author: author,
    narrator: null, // Google Books doesn't have narrator info for ebooks
    description: volumeInfo.description || null,
    duration: 0, // Google Books is for ebooks, not audiobooks
    coverImage: coverImage,
    audioUrl: "", // Google Books doesn't provide audio files
    contentUrl: volume.accessInfo?.webReaderLink || `https://books.google.com/books?id=${volume.id}`,
    genre: volumeInfo.categories ? volumeInfo.categories[0] : null,
    publishedYear: publishedYear,
    source: "google-books",
    sourceId: volume.id,
    totalTime: "0:00:00",
    language: volumeInfo.language || "en",
    contentType: "ebook",
    isPremium: isPremium,
    pageCount: volumeInfo.pageCount || null,
    searchVector: null,
    readingLevel: computeReadingLevel(volumeInfo.description || null, volumeInfo.categories ? volumeInfo.categories[0] : null),
  };
}

// Function to transform iTunes Search API data to our format
function transformiTunesAudiobook(itunes: iTunesAudiobook): Book {
  const author = itunes.artistName || "Unknown Author";
  
  // iTunes provides high-quality artwork
  const coverImage = itunes.artworkUrl100?.replace('100x100', '600x600') || itunes.artworkUrl100 || null;
  
  // Parse year from releaseDate (ISO format: YYYY-MM-DD)
  const publishedYear = itunes.releaseDate 
    ? parseInt(itunes.releaseDate.split('-')[0]) 
    : null;
  
  // Convert trackTimeMillis to duration in seconds (if available)
  const duration = itunes.trackTimeMillis ? Math.floor(itunes.trackTimeMillis / 1000) : 0;
  
  // Format duration as HH:MM:SS
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;
  const totalTime = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  // Use description fields (prefer longDescription > description > shortDescription)
  const description = itunes.longDescription || itunes.description || itunes.shortDescription || null;
  
  // iTunes audiobooks are commercial/premium content
  return {
    id: `itunes-${itunes.collectionId}`,
    title: itunes.collectionName,
    author: author,
    narrator: null, // iTunes API doesn't provide narrator information
    description: description,
    duration: duration,
    coverImage: coverImage,
    audioUrl: itunes.previewUrl || "", // iTunes provides preview URLs
    contentUrl: itunes.collectionViewUrl || null,
    genre: itunes.primaryGenreName || null,
    publishedYear: publishedYear,
    source: "itunes",
    sourceId: itunes.collectionId.toString(),
    totalTime: totalTime,
    language: "en", // iTunes API doesn't always provide language info
    contentType: "audiobook",
    isPremium: true, // iTunes audiobooks are commercial
    pageCount: null,
    searchVector: null,
    readingLevel: computeReadingLevel(description, itunes.primaryGenreName || null),
  };
}

// Function to transform Internet Archive API data to our format
function transformInternetArchiveDoc(doc: InternetArchiveDoc): Book {
  const author = Array.isArray(doc.creator) 
    ? doc.creator[0] 
    : doc.creator || "Unknown Author";
  
  // Internet Archive cover images
  const coverImage = `https://archive.org/services/img/${doc.identifier}`;
  
  // Extract subject/genre
  const subject = Array.isArray(doc.subject) 
    ? doc.subject[0] 
    : doc.subject;
  
  // Extract language
  const language = Array.isArray(doc.language)
    ? doc.language[0]
    : doc.language || "en";
  
  // Internet Archive items are texts/ebooks, not audiobooks in this integration
  // (We already get audiobooks from LibriVox which uses Internet Archive for hosting)
  const isAudiobook = false;
  
  // Determine content type based on media type
  const mediaType = doc.mediatype || "texts";
  let contentType: "audiobook" | "ebook" | "magazine" = "ebook";
  if (mediaType === "audio") {
    contentType = "audiobook";
  } else if (doc.collection?.includes("magazine") || doc.collection?.includes("periodical")) {
    contentType = "magazine";
  }
  
  return {
    id: `internetarchive-${doc.identifier}`,
    title: doc.title,
    author: author,
    narrator: null, // These are ebook texts, not audiobooks
    description: doc.description || null,
    duration: 0, // Ebooks don't have duration
    coverImage: coverImage,
    audioUrl: "", // These are ebook texts, not audiobooks
    contentUrl: `https://archive.org/details/${doc.identifier}`,
    genre: subject || null,
    publishedYear: doc.year || (doc.date ? parseInt(doc.date.split('-')[0]) : null),
    source: "internet-archive",
    sourceId: doc.identifier,
    totalTime: "0:00:00",
    language: language,
    contentType: contentType,
    isPremium: false, // Internet Archive content is free
    pageCount: null,
    searchVector: null,
    readingLevel: computeReadingLevel(doc.description || null, subject || null),
  };
}

// Function to transform LibriVox API data to our format
function transformLibriVoxBook(libriVoxBook: LibriVoxBook): Book {
  const authorNames = libriVoxBook.authors.map(author => 
    `${author.first_name} ${author.last_name}`.trim()
  ).join(", ");
  
  // Prefer first MP3 section over ZIP file for better streaming compatibility
  const audioUrl = libriVoxBook.sections.length > 0 
    ? libriVoxBook.sections[0].listen_url 
    : libriVoxBook.url_zip_file;
  
  // Ensure duration is always a number (LibriVox sometimes returns string)
  const duration = typeof libriVoxBook.totaltimesecs === 'string' 
    ? parseInt(libriVoxBook.totaltimesecs) || 0
    : libriVoxBook.totaltimesecs || 0;
  
  const libriVoxGenre = libriVoxBook.genres ? libriVoxBook.genres.join(", ") : "Classic Literature";
  return {
    id: `librivox-${libriVoxBook.id}`,
    title: libriVoxBook.title,
    author: authorNames || "Unknown Author",
    narrator: "LibriVox Volunteers", // LibriVox uses volunteer narrators
    description: libriVoxBook.description || null,
    duration: duration,
    coverImage: `https://archive.org/services/img/${libriVoxBook.id}`, // LibriVox cover images
    audioUrl: audioUrl,
    contentUrl: null,
    genre: libriVoxGenre,
    publishedYear: libriVoxBook.copyright_year ? parseInt(libriVoxBook.copyright_year) : null,
    source: "librivox",
    sourceId: libriVoxBook.id,
    totalTime: libriVoxBook.totaltime,
    language: libriVoxBook.language || "English",
    contentType: "audiobook",
    isPremium: false, // LibriVox is free public domain
    pageCount: null,
    searchVector: null,
    readingLevel: computeReadingLevel(libriVoxBook.description || null, libriVoxGenre),
  };
}

// Project Gutenberg API base URL
const GUTENBERG_API_BASE = "https://gutendex.com";

// Function to transform Project Gutenberg book to our format
function transformGutenbergBook(gutenberg: GutenbergBook): Book {
  const author = gutenberg.authors.length > 0 
    ? gutenberg.authors.map(a => a.name).join(", ") 
    : "Unknown Author";
  
  // Get cover image - Gutenberg provides cover images via their formats
  const coverImage = gutenberg.formats["image/jpeg"] || 
                     Object.keys(gutenberg.formats).find(k => k.startsWith("image/"))
                       ? gutenberg.formats[Object.keys(gutenberg.formats).find(k => k.startsWith("image/"))!]
                       : `https://www.gutenberg.org/cache/epub/${gutenberg.id}/pg${gutenberg.id}.cover.medium.jpg`;
  
  // Get reading URL - prefer HTML or plain text
  const contentUrl = gutenberg.formats["text/html; charset=utf-8"] ||
                     gutenberg.formats["text/html"] ||
                     gutenberg.formats["text/plain; charset=utf-8"] ||
                     gutenberg.formats["text/plain"] ||
                     `https://www.gutenberg.org/ebooks/${gutenberg.id}`;
  
  // Extract genre from subjects
  const genre = gutenberg.subjects.length > 0 ? gutenberg.subjects[0] : "Classic Literature";
  
  // Language mapping
  const languageMap: Record<string, string> = { "en": "English", "fr": "French", "de": "German", "es": "Spanish" };
  const language = gutenberg.languages.length > 0 
    ? languageMap[gutenberg.languages[0]] || gutenberg.languages[0]
    : "English";
  
  return {
    id: `gutenberg-${gutenberg.id}`,
    title: gutenberg.title,
    author: author,
    narrator: null, // Ebooks don't have narrators
    description: `A classic from Project Gutenberg. ${gutenberg.subjects.slice(0, 3).join(", ")}`,
    duration: 0, // Ebooks don't have duration
    coverImage: coverImage,
    audioUrl: "", // Ebooks don't have audio
    contentUrl: contentUrl,
    genre: genre,
    publishedYear: gutenberg.authors[0]?.death_year 
      ? gutenberg.authors[0].death_year - 20 // Estimate publication date
      : null,
    source: "gutenberg",
    sourceId: gutenberg.id.toString(),
    totalTime: "0:00:00",
    language: language,
    contentType: "ebook",
    isPremium: false, // Gutenberg is free public domain
    pageCount: null,
    searchVector: null,
    readingLevel: computeReadingLevel(`A classic from Project Gutenberg. ${gutenberg.subjects.slice(0, 3).join(", ")}`, genre),
  };
}

async function fetchWithTimeout(url: string, timeout = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Cover enrichment: Try to find covers for books missing them
async function findCoverByTitle(title: string, author: string): Promise<string | null> {
  const searchQuery = encodeURIComponent(`${title} ${author}`.trim());
  
  // Try Open Library first (has the most covers)
  try {
    const olResponse = await fetchWithTimeout(
      `${OPEN_LIBRARY_API_BASE}/search.json?q=${searchQuery}&limit=1&fields=cover_i,title,author_name`,
      3000
    );
    if (olResponse.ok) {
      const data = await olResponse.json() as OpenLibrarySearchResponse;
      if (data.docs?.[0]?.cover_i) {
        return `${OPEN_LIBRARY_COVERS_BASE}/b/id/${data.docs[0].cover_i}-M.jpg`;
      }
    }
  } catch (error) {
    // Silently continue to next source
  }
  
  // Try Google Books as fallback
  if (GOOGLE_BOOKS_API_KEY) {
    try {
      const gbResponse = await fetchWithTimeout(
        `${GOOGLE_BOOKS_API_BASE}/volumes?q=${searchQuery}&maxResults=1&key=${GOOGLE_BOOKS_API_KEY}`,
        3000
      );
      if (gbResponse.ok) {
        const data = await gbResponse.json() as GoogleBooksSearchResponse;
        if (data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail) {
          return data.items[0].volumeInfo.imageLinks.thumbnail.replace('http://', 'https://');
        }
      }
    } catch (error) {
      // Silently continue
    }
  }
  
  return null;
}

// Enrich books with missing covers (batch processing with concurrency limit)
async function enrichBooksWithCovers(books: Book[], maxConcurrent = 5): Promise<Book[]> {
  const booksNeedingCovers = books.filter(book => !book.coverImage);
  
  if (booksNeedingCovers.length === 0) {
    return books;
  }
  
  console.log(`Enriching covers for ${booksNeedingCovers.length} books without covers...`);
  
  // Process in batches to avoid overwhelming APIs
  const coverPromises: Promise<{ bookId: string; coverUrl: string | null }>[] = [];
  
  for (const book of booksNeedingCovers.slice(0, maxConcurrent * 2)) {
    coverPromises.push(
      findCoverByTitle(book.title, book.author).then(coverUrl => ({
        bookId: book.id,
        coverUrl
      }))
    );
  }
  
  const coverResults = await Promise.all(coverPromises);
  const coverMap = new Map(coverResults.filter(r => r.coverUrl).map(r => [r.bookId, r.coverUrl]));
  
  console.log(`Found ${coverMap.size} additional covers via enrichment`);
  
  // Apply found covers to books
  return books.map(book => {
    if (!book.coverImage && coverMap.has(book.id)) {
      return { ...book, coverImage: coverMap.get(book.id)! };
    }
    return book;
  });
}

// Simple in-memory cache with TTL
interface CacheEntry<T> {
  data: T;
  expires: number;
}

export class ExternalAPIStorage implements IStorage {
  private fallbackBooks: Map<string, Book>;
  private localUsers: Map<string, User>; // For session management
  public sessionStore: session.Store;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  
  // Security: Allowed domains for audio streaming and covers
  private readonly ALLOWED_AUDIO_DOMAINS = [
    'librivox.org',
    'archive.org', // Internet Archive base domain
    'www.archive.org', // Internet Archive www
    'library-management-api-i6if.onrender.com', // External API
    'covers.openlibrary.org', // Open Library covers
    'books.google.com', // Google Books covers
    'books.googleusercontent.com', // Google Books CDN
    'audio-ssl.itunes.apple.com', // iTunes preview audio
    'mzstatic.com' // iTunes/Apple CDN (includes is*-ssl.mzstatic.com subdomains)
  ];

  constructor() {
    this.fallbackBooks = new Map();
    this.localUsers = new Map();
    this.initializeFallbackData();
    
    // Initialize session store
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    });
  }

  private initializeFallbackData() {
    const sampleBooks: Omit<Book, 'id' | 'searchVector' | 'readingLevel'>[] = [
      {
        title: "The Great Gatsby",
        author: "F. Scott Fitzgerald",
        narrator: "Jake Gyllenhaal",
        description: "The Great Gatsby, F. Scott Fitzgerald's third book, stands as the supreme achievement of his career. This exemplary novel of the Jazz Age has been acclaimed by generations of readers.",
        duration: 19992,
        coverImage: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=600",
        audioUrl: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav",
        contentUrl: null,
        genre: "Classic Literature",
        publishedYear: 1925,
        source: "local",
        sourceId: null,
        totalTime: "5:33:12",
        language: "English",
        contentType: "audiobook",
        isPremium: false,
        pageCount: null,
      },
      {
        title: "Dune",
        author: "Frank Herbert",
        narrator: "Scott Brick",
        description: "Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides, heir to a noble family tasked with ruling an inhospitable world.",
        duration: 75720,
        coverImage: "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=600",
        audioUrl: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav",
        contentUrl: null,
        genre: "Science Fiction",
        publishedYear: 1965,
        source: "local",
        sourceId: null,
        totalTime: "21:02:00",
        language: "English",
        contentType: "audiobook",
        isPremium: false,
        pageCount: null,
      },
      {
        title: "The Girl with the Dragon Tattoo",
        author: "Stieg Larsson",
        narrator: "Simon Vance",
        description: "Harriet Vanger, a scion of one of Sweden's wealthiest families disappeared over forty years ago. All these years later, her aged uncle continues to seek the truth.",
        duration: 65640,
        coverImage: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=600",
        audioUrl: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav",
        contentUrl: null,
        genre: "Mystery/Thriller",
        publishedYear: 2005,
        source: "local",
        sourceId: null,
        totalTime: "18:14:00",
        language: "English",
        contentType: "audiobook",
        isPremium: false,
        pageCount: null,
      },
      {
        title: "Atomic Habits",
        author: "James Clear",
        narrator: "James Clear",
        description: "No matter your goals, Atomic Habits offers a proven framework for improving--every day. James Clear reveals practical strategies that will teach you exactly how to form good habits.",
        duration: 20100,
        coverImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=600",
        audioUrl: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav",
        contentUrl: null,
        genre: "Self-Help",
        publishedYear: 2018,
        source: "local",
        sourceId: null,
        totalTime: "5:35:00",
        language: "English",
        contentType: "audiobook",
        isPremium: false,
        pageCount: null,
      },
      {
        title: "The Book Thief",
        author: "Markus Zusak",
        narrator: "Allan Corduner",
        description: "It is 1939. Nazi Germany. The country is holding its breath. Death has never been busier, and will become busier still.",
        duration: 50160,
        coverImage: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=600",
        audioUrl: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav",
        contentUrl: null,
        genre: "Historical Fiction",
        publishedYear: 2005,
        source: "local",
        sourceId: null,
        totalTime: "13:56:00",
        language: "English",
        contentType: "audiobook",
        isPremium: false,
        pageCount: null,
      },
      {
        title: "Where the Crawdads Sing",
        author: "Delia Owens",
        narrator: "Cassandra Campbell",
        description: "For years, rumors of the 'Marsh Girl' have haunted Barkley Cove, a quiet town on the North Carolina coast.",
        duration: 43920,
        coverImage: "https://images.unsplash.com/photo-1532012197267-da84d127e765?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=600",
        audioUrl: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav",
        contentUrl: null,
        genre: "Fiction",
        publishedYear: 2018,
        source: "local",
        sourceId: null,
        totalTime: "12:12:00",
        language: "English",
        contentType: "audiobook",
        isPremium: false,
        pageCount: null,
      },
    ];

    sampleBooks.forEach(book => {
      const id = randomUUID();
      this.fallbackBooks.set(id, { ...book, id, searchVector: null, readingLevel: computeReadingLevel(book.description || null, book.genre || null) });
    });
  }

  async getBooks(): Promise<Book[]> {
    const cached = this.getCached<Book[]>('all_books');
    if (cached) return cached;
    
    try {
      const rows = await db.execute(
        sql`SELECT * FROM books ORDER BY title ASC LIMIT 500`
      );
      const allRows = (rows as any).rows || rows;
      if (!Array.isArray(allRows)) return Array.from(this.fallbackBooks.values());
      
      const books: Book[] = allRows.map(mapRowToBook);
      if (books.length < 10) {
        books.push(...Array.from(this.fallbackBooks.values()));
      }
      this.setCached('all_books', books);
      return books;
    } catch (err) {
      console.warn('getBooks DB query failed:', err);
      return Array.from(this.fallbackBooks.values());
    }
  }

  async getBookCount(filters?: { source?: string; contentType?: string; genre?: string }): Promise<number> {
    try {
      const conditions: any[] = [];
      if (filters?.source) conditions.push(sql`source = ${filters.source}`);
      if (filters?.contentType) conditions.push(sql`content_type = ${filters.contentType}`);
      if (filters?.genre) conditions.push(sql`genre ILIKE ${'%' + filters.genre + '%'}`);
      
      const whereClause = conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;
      
      const result = await db.execute(sql`SELECT COUNT(*) as count FROM books ${whereClause}`);
      const rows = (result as any).rows || result;
      return parseInt(rows?.[0]?.count || "0");
    } catch {
      return 0;
    }
  }

  async getRandomBooks(count: number = 10): Promise<Book[]> {
    try {
      const rows = await db.execute(
        sql`SELECT * FROM books ORDER BY RANDOM() LIMIT ${count}`
      );
      const allRows = (rows as any).rows || rows;
      if (!Array.isArray(allRows) || allRows.length === 0) return [];
      return allRows.map(mapRowToBook);
    } catch {
      return [];
    }
  }

  async getFeaturedBook(): Promise<Book | null> {
    try {
      const today = new Date();
      const daysSinceEpoch = Math.floor(today.getTime() / (1000 * 60 * 60 * 24));
      const totalCount = await this.getBookCount();
      if (totalCount === 0) return null;
      const offset = daysSinceEpoch % totalCount;
      const rows = await db.execute(
        sql`SELECT * FROM books ORDER BY id ASC LIMIT 1 OFFSET ${offset}`
      );
      const allRows = (rows as any).rows || rows;
      if (!Array.isArray(allRows) || allRows.length === 0) return null;
      return mapRowToBook(allRows[0]);
    } catch {
      return null;
    }
  }

  async refreshRuntimeBooks(): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;
    
    console.log('[RuntimeRefresh] Starting background ingestion of runtime API books...');
    
    const fetchPromises: Promise<Book[]>[] = [
      ...(Array.from({length: 4}, (_, i) => 
        this.fetchLibriVoxBooks(50, i * 50).then(books => books.map(transformLibriVoxBook)).catch(() => [] as Book[])
      )),
      this.fetchOpenLibraryBooks(200).then((books: OpenLibraryBook[]) => books.map(transformOpenLibraryBook)).catch(() => [] as Book[]),
      this.fetchGoogleBooks(200).then((volumes: GoogleBooksVolume[]) => volumes.map(transformGoogleBooksVolume)).catch(() => [] as Book[]),
      this.fetchiTunesAudiobooks(200).then((audiobooks: iTunesAudiobook[]) => audiobooks.map(transformiTunesAudiobook)).catch(() => [] as Book[]),
      this.fetchExternalAPIBooks().catch(() => [] as Book[]),
      this.fetchGutenbergBooks(32, 1).then(ebooks => ebooks.map(transformGutenbergBook)).catch(() => [] as Book[]),
      this.fetchInternetArchiveBooks(200).then(docs => docs.map(transformInternetArchiveDoc)).catch(() => [] as Book[]),
      fetchLoyalBooks(100).catch(() => [] as Book[]),
      fetchStandardEbooks(200).catch(() => [] as Book[]),
      fetchFeedbooks(100).catch(() => [] as Book[]),
      Promise.resolve(fetchOpenStaxBooks(100)),
      fetchWikipediaSpokenArticles(200).catch(() => [] as Book[]),
      fetchSerializedFictionPodcasts(200).catch(() => [] as Book[]),
      fetchBBCPodcasts(25).catch(() => [] as Book[]),
    ];
    
    const results = await Promise.all(fetchPromises);
    const allBooks: Book[] = [];
    results.forEach((books: Book[]) => allBooks.push(...books));
    
    console.log(`[RuntimeRefresh] Fetched ${allBooks.length} books from runtime APIs, upserting to DB...`);
    
    for (const book of allBooks) {
      try {
        const bookId = book.id || `${book.source}-${book.sourceId || randomUUID()}`;
        await db.insert(booksTable).values({
          ...book,
          id: bookId,
          duration: book.duration ?? 0,
          source: book.source ?? "local",
          contentType: book.contentType ?? "audiobook",
          isPremium: book.isPremium ?? false,
          language: book.language ?? "English",
        }).onConflictDoNothing();
        inserted++;
      } catch {
        skipped++;
      }
    }
    
    this.invalidateCache('all_books');
    console.log(`[RuntimeRefresh] Complete: ${inserted} inserted, ${skipped} skipped`);
    return { inserted, skipped };
  }
  
  private async fetchExternalAPIBooks(): Promise<Book[]> {
    console.log('Fetching books from external API...');
    const response = await fetchWithTimeout(`${EXTERNAL_API_BASE}/books`);
    
    if (response.ok) {
      const responseData = await response.json();
      console.log(`External API summary: ${JSON.stringify({ status: 'success', count: responseData?.books?.length || responseData?.length || 0 })}`);
      
      let externalBooks: ExternalBook[] = [];
      if (Array.isArray(responseData)) {
        externalBooks = responseData;
      } else if (responseData.books && Array.isArray(responseData.books)) {
        externalBooks = responseData.books;
      } else if (responseData.data && Array.isArray(responseData.data)) {
        externalBooks = responseData.data;
      } else {
        console.warn('Unexpected response format from external API');
        return [];
      }
      
      return externalBooks.map(transformExternalBook);
    }
    
    return [];
  }

  async getBook(id: string): Promise<Book | undefined> {
    // Check database first for seeded books
    try {
      const [dbBook] = await db.select().from(booksTable).where(eq(booksTable.id, id)).limit(1);
      if (dbBook) return dbBook;
    } catch (err) {
      // DB check failed, continue to API fallback
    }

    // Check if this is a LibriVox book
    if (id.startsWith('librivox-')) {
      try {
        console.log(`Fetching LibriVox book: ${id}`);
        const libriVoxBook = await this.getLibriVoxBook(id);
        if (libriVoxBook) {
          return transformLibriVoxBook(libriVoxBook);
        }
      } catch (error) {
        console.warn(`Failed to fetch LibriVox book ${id}:`, error);
      }
    }
    
    // Check if this is an Open Library book
    if (id.startsWith('openlibrary-')) {
      try {
        console.log(`Fetching Open Library book: ${id}`);
        const openLibraryBook = await this.getOpenLibraryBook(id);
        if (openLibraryBook) {
          return transformOpenLibraryBook(openLibraryBook);
        }
      } catch (error) {
        console.warn(`Failed to fetch Open Library book ${id}:`, error);
      }
    }
    
    // Check if this is a Google Books volume
    if (id.startsWith('googlebooks-')) {
      try {
        console.log(`Fetching Google Books volume: ${id}`);
        const volumeId = id.replace('googlebooks-', '');
        const googleBook = await this.getGoogleBook(volumeId);
        if (googleBook) {
          return transformGoogleBooksVolume(googleBook);
        }
      } catch (error) {
        console.warn(`Failed to fetch Google Books volume ${id}:`, error);
      }
    }
    
    // Check if this is an iTunes audiobook
    if (id.startsWith('itunes-')) {
      try {
        console.log(`Fetching iTunes audiobook: ${id}`);
        const collectionId = parseInt(id.replace('itunes-', ''));
        const itunesBook = await this.getiTunesAudiobook(collectionId);
        if (itunesBook) {
          return transformiTunesAudiobook(itunesBook);
        }
      } catch (error) {
        console.warn(`Failed to fetch iTunes audiobook ${id}:`, error);
      }
    }
    
    // For new content sources, search in cached books first
    const newSourcePrefixes = ['loyalbooks-', 'standardebooks-', 'feedbooks-', 'openstax-', 'wikipedia-', 'podcast-', 'bbc-', 'spotify-show-'];
    if (newSourcePrefixes.some(prefix => id.startsWith(prefix))) {
      const cached = this.getCached<Book[]>('all_books');
      if (cached) {
        const found = cached.find(b => b.id === id);
        if (found) return found;
      }
      const allBooks = await this.getBooks();
      const found = allBooks.find(b => b.id === id);
      if (found) return found;
      return this.fallbackBooks.get(id);
    }

    // Try external API
    try {
      console.log(`Fetching book ${id} from external API...`);
      const response = await fetchWithTimeout(`${EXTERNAL_API_BASE}/books/${id}`);
      
      if (response.ok) {
        const responseData = await response.json();
        console.log(`External API book response for ${id}:`, JSON.stringify(responseData, null, 2));
        
        // Handle different response formats  
        let externalBook: ExternalBook;
        if (responseData._id || responseData.id) {
          externalBook = responseData;
        } else if (responseData.book) {
          externalBook = responseData.book;
        } else if (responseData.data) {
          externalBook = responseData.data;
        } else {
          console.warn('Unexpected book response format from external API:', responseData);
          return this.fallbackBooks.get(id);
        }
        
        console.log(`Fetched book ${id} from external API`);
        return transformExternalBook(externalBook);
      } else {
        console.warn(`External API returned error for book ${id}, using fallback data`);
        return this.fallbackBooks.get(id);
      }
    } catch (error) {
      console.warn(`Failed to fetch book ${id} from external API, using fallback data:`, error);
      return this.fallbackBooks.get(id);
    }
  }

  async createBook(insertBook: InsertBook): Promise<Book> {
    // For now, we'll add to fallback storage since external API might require authentication
    const id = randomUUID();
    const book: Book = { 
      ...insertBook, 
      id,
      duration: insertBook.duration ?? 0,
      narrator: insertBook.narrator ?? null,
      description: insertBook.description ?? null,
      coverImage: insertBook.coverImage ?? null,
      audioUrl: insertBook.audioUrl ?? null,
      contentUrl: insertBook.contentUrl ?? null,
      genre: insertBook.genre ?? null,
      publishedYear: insertBook.publishedYear ?? null,
      source: insertBook.source ?? "local",
      sourceId: insertBook.sourceId ?? null,
      totalTime: insertBook.totalTime ?? null,
      language: insertBook.language ?? "English",
      contentType: insertBook.contentType ?? "audiobook",
      isPremium: insertBook.isPremium ?? false,
      pageCount: insertBook.pageCount ?? null,
      searchVector: null,
      readingLevel: insertBook.readingLevel ?? computeReadingLevel(insertBook.description ?? null, insertBook.genre ?? null),
    };
    this.fallbackBooks.set(id, book);
    return book;
  }

  async updateBook(
    id: string,
    updates: Partial<Omit<InsertBook, 'id'>>,
    opts: { preserveReadingLevel?: boolean } = {}
  ): Promise<Book | undefined> {
    // Determine reading level for the update
    let newReadingLevel: number | null | undefined = updates.readingLevel;

    // If caller did not supply an explicit readingLevel and description/genre/contentUrl changed, recompute
    if (!opts.preserveReadingLevel && updates.readingLevel === undefined) {
      if (updates.description !== undefined || updates.genre !== undefined || updates.contentUrl !== undefined) {
        const current = await this.getBook(id);
        if (current) {
          const desc = updates.description !== undefined ? updates.description : current.description;
          const genre = updates.genre !== undefined ? updates.genre : current.genre;
          newReadingLevel = computeReadingLevel(desc ?? null, genre ?? null);
        }
      }
    }

    // Update fallback store if present
    if (this.fallbackBooks.has(id)) {
      const existing = this.fallbackBooks.get(id)!;
      const merged: Book = {
        ...existing,
        ...updates,
        readingLevel: newReadingLevel !== undefined ? newReadingLevel : existing.readingLevel,
      };
      this.fallbackBooks.set(id, merged);
      return merged;
    }

    // Persist to DB
    try {
      const setClauses: any[] = [];
      if (updates.title !== undefined) setClauses.push(sql`title = ${updates.title}`);
      if (updates.author !== undefined) setClauses.push(sql`author = ${updates.author}`);
      if (updates.narrator !== undefined) setClauses.push(sql`narrator = ${updates.narrator}`);
      if (updates.description !== undefined) setClauses.push(sql`description = ${updates.description}`);
      if (updates.genre !== undefined) setClauses.push(sql`genre = ${updates.genre}`);
      if (updates.coverImage !== undefined) setClauses.push(sql`cover_image = ${updates.coverImage}`);
      if (updates.audioUrl !== undefined) setClauses.push(sql`audio_url = ${updates.audioUrl}`);
      if (updates.contentUrl !== undefined) setClauses.push(sql`content_url = ${updates.contentUrl}`);
      if (updates.isPremium !== undefined) setClauses.push(sql`is_premium = ${updates.isPremium}`);
      if (newReadingLevel !== undefined) setClauses.push(sql`reading_level = ${newReadingLevel}`);

      if (setClauses.length > 0) {
        await db.execute(sql`UPDATE books SET ${sql.join(setClauses, sql`, `)} WHERE id = ${id}`);
        this.invalidateCache('all_books');
      }
      return await this.getBook(id);
    } catch (err) {
      console.warn('[updateBook] DB update failed:', err);
      return await this.getBook(id);
    }
  }

  async getBooksPaginated(options: BookQueryOptions): Promise<PaginatedResult<Book>> {
    const { cursor, limit = 50, source, contentType, genre, search, readingLevel } = options;

    // If search is provided, use full-text search (then apply any remaining filters in-memory)
    if (search) {
      // Over-fetch when readingLevel filter is active so we have enough matching results
      const searchLimit = readingLevel ? limit * 20 : limit + 1;
      const results = await this.searchBooksDB(search, searchLimit);
      const filtered = readingLevel ? results.filter(b => b.readingLevel === readingLevel) : results;
      const hasMore = filtered.length > limit;
      const data = hasMore ? filtered.slice(0, limit) : filtered;
      const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;
      return { data, nextCursor, hasMore };
    }

    try {
      const conditions: any[] = [];
      if (source) conditions.push(sql`source = ${source}`);
      if (contentType) conditions.push(sql`content_type = ${contentType}`);
      if (genre) conditions.push(sql`genre = ${genre}`);
      if (cursor) conditions.push(sql`id > ${cursor}`);

      const whereClause = conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

      // When filtering by readingLevel, first try DB-level filter; fall back to full in-memory scan
      if (readingLevel) {
        try {
          const rlConditions = [...conditions, sql`reading_level = ${readingLevel}`];
          const rlWhere = rlConditions.length > 0
            ? sql`WHERE ${sql.join(rlConditions, sql` AND `)}`
            : sql``;
          const rlRows = await db.execute(
            sql`SELECT * FROM books ${rlWhere} ORDER BY id ASC LIMIT ${limit + 1}`
          );
          const rlData = (rlRows as any).rows || rlRows;
          if (Array.isArray(rlData)) {
            const hasMore = rlData.length > limit;
            const data = rlData.slice(0, limit).map(mapRowToBook);
            const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;
            return { data, nextCursor, hasMore };
          }
        } catch {
          // reading_level column not available – fall through to genre-pattern SQL filter
        }
        // Genre-pattern fallback: use ILIKE conditions on genre column (no full table scan)
        try {
          const patterns = genrePatternsForLevel(readingLevel);
          if (patterns.length > 0) {
            const genreLikeConditions = patterns.map(p => sql`LOWER(genre) LIKE ${'%' + p.toLowerCase() + '%'}`);
            const genreOr = sql`(${sql.join(genreLikeConditions, sql` OR `)})`;
            const gpConditions = [...conditions, genreOr];
            const gpWhere = sql`WHERE ${sql.join(gpConditions, sql` AND `)}`;
            const gpRows = await db.execute(
              sql`SELECT * FROM books ${gpWhere} ORDER BY id ASC LIMIT ${limit + 1}`
            );
            const gpData = (gpRows as any).rows || gpRows;
            if (Array.isArray(gpData)) {
              const mapped = gpData.map(mapRowToBook);
              const hasMore = mapped.length > limit;
              const data = mapped.slice(0, limit);
              const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;
              // Fetch count for this level so callers can display accurate totals
              let total = 0;
              try {
                const countRes = await db.execute(sql`SELECT COUNT(*) as count FROM books ${gpWhere}`);
                const countRows = (countRes as any).rows || countRes;
                total = parseInt(countRows?.[0]?.count || '0');
              } catch { /* non-fatal */ }
              return { data, nextCursor, hasMore, total };
            }
          }
        } catch (gpErr) {
          console.warn('[getBooksPaginated] Genre-pattern fallback failed:', gpErr);
        }
        return { data: [], nextCursor: null, hasMore: false };
      }

      const fetchLimit = limit + 1;
      const rows = await db.execute(
        sql`SELECT * FROM books ${whereClause} ORDER BY id ASC LIMIT ${fetchLimit}`
      );

      const allRows = (rows as any).rows || rows;
      if (!Array.isArray(allRows)) return { data: [], nextCursor: null, hasMore: false };

      let mapped: Book[] = allRows.map(mapRowToBook);

      const hasMore = mapped.length > limit;
      const pageRows = hasMore ? mapped.slice(0, limit) : mapped;

      const nextCursor = hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1].id : null;
      
      const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM books ${whereClause}`);
      const countRows = (countResult as any).rows || countResult;
      const total = parseInt(countRows?.[0]?.count || "0");
      
      return { data: pageRows, nextCursor, hasMore, total };
    } catch (error) {
      console.warn('Paginated DB query failed:', error);
      return { data: [], nextCursor: null, hasMore: false, total: 0 };
    }
  }

  async searchBooks(query: string): Promise<Book[]> {
    const allBooks: Book[] = [];
    const searchPromises: Promise<Book[]>[] = [];
    
    // Full-text search in PostgreSQL database (instant for millions of rows)
    searchPromises.push(
      this.searchBooksDB(query, 50).catch(error => {
        console.warn('DB full-text search failed:', error);
        return [] as Book[];
      }),
    );
    
    // Parallel search across external API sources
    searchPromises.push(
      this.searchLibriVoxBooks(query, 15).then(books => books.map(transformLibriVoxBook)).catch(error => {
        console.warn('LibriVox search failed:', error);
        return [];
      }),
      this.searchOpenLibraryBooks(query, 10).then(books => books.map(transformOpenLibraryBook)).catch(error => {
        console.warn('Open Library search failed:', error);
        return [];
      }),
      this.searchGoogleBooks(query, 10).then(volumes => volumes.map(transformGoogleBooksVolume)).catch(error => {
        console.warn('Google Books search failed:', error);
        return [];
      }),
      this.searchiTunesAudiobooks(query, 10).then(audiobooks => audiobooks.map(transformiTunesAudiobook)).catch(error => {
        console.warn('iTunes search failed:', error);
        return [];
      }),
      this.searchGutenbergBooks(query, 10).then(ebooks => ebooks.map(transformGutenbergBook)).catch(error => {
        console.warn('Gutenberg search failed:', error);
        return [];
      }),
      searchLoyalBooks(query, 5).catch(() => [] as Book[]),
      searchStandardEbooks(query, 5).catch(() => [] as Book[]),
      searchFeedbooks(query, 5).catch(() => [] as Book[]),
      Promise.resolve(searchOpenStaxBooks(query, 5)),
      searchWikipediaSpokenArticles(query, 5).catch(() => [] as Book[]),
      searchSerializedFictionPodcasts(query, 5).catch(() => [] as Book[]),
      searchBBCPodcasts(query, 3).catch(() => [] as Book[]),
    );
    
    const searchResults = await Promise.all(searchPromises);
    searchResults.forEach(results => allBooks.push(...results));
    
    if (allBooks.length === 0) {
      const fallbackResults = this.searchFallbackBooks(query);
      if (fallbackResults.length > 0) {
        allBooks.push(...fallbackResults);
      }
    }
    
    const deduped = this.deduplicateBooks(allBooks);
    console.log(`Search for "${query}" returned ${deduped.length} results`);
    return deduped;
  }

  async searchBooksDB(query: string, limit: number = 50): Promise<Book[]> {
    try {
      const tsQuery = query.split(/\s+/).filter(Boolean).map(w => `${w}:*`).join(' & ');
      const results = await db.execute(
        sql`SELECT *, ts_rank(search_tsv, to_tsquery('english', ${tsQuery})) AS rank
            FROM books
            WHERE search_tsv @@ to_tsquery('english', ${tsQuery})
            ORDER BY rank DESC
            LIMIT ${limit}`
      );
      const rows = (results as any).rows || results;
      if (!Array.isArray(rows)) return [];
      return rows.map(mapRowToBook);
    } catch (error) {
      console.warn('Full-text search failed, falling back:', error);
      return [];
    }
  }
  
  private async searchExternalAPI(query: string): Promise<Book[]> {
    try {
      console.log(`Searching external API for: ${query}`);
      const response = await fetchWithTimeout(`${EXTERNAL_API_BASE}/books?search=${encodeURIComponent(query)}`);
      
      if (response.ok) {
        const responseData = await response.json();
        console.log(`External API search summary: ${JSON.stringify({ status: 'success', count: responseData?.books?.length || responseData?.length || 0 })}`);
        
        let externalBooks: ExternalBook[] = [];
        if (Array.isArray(responseData)) {
          externalBooks = responseData;
        } else if (responseData.books && Array.isArray(responseData.books)) {
          externalBooks = responseData.books;
        } else if (responseData.data && Array.isArray(responseData.data)) {
          externalBooks = responseData.data;
        }
        
        return externalBooks.map(transformExternalBook);
      }
      return [];
    } catch (error) {
      console.warn('External API search error:', error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }
  
  private deduplicateBooks(books: Book[]): Book[] {
    const seen = new Set<string>();
    return books.filter(book => {
      const key = `${book.title.toLowerCase().trim()}-${book.author.toLowerCase().trim()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  
  // Cache management methods
  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && entry.expires > Date.now()) {
      return entry.data;
    }
    if (entry) {
      this.cache.delete(key); // Remove expired entry
    }
    return null;
  }
  
  private setCached<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.CACHE_TTL
    });
  }

  private invalidateCache(key: string): void {
    this.cache.delete(key);
  }
  
  // Security: Validate audio URL against allowed domains (public method for routes)
  validateAudioUrl(url: string): boolean {
    // Allow internal narration stream URLs generated by the audiobook narration system
    if (url && url.startsWith("/api/audiobook/stream/")) {
      return true;
    }

    try {
      const parsedUrl = new URL(url);
      
      // Check against explicit allowed domains
      const isAllowed = this.ALLOWED_AUDIO_DOMAINS.some(domain => 
        parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain)
      );
      
      if (isAllowed) return true;
      
      // Allow all Internet Archive CDN subdomains (ia###.us.archive.org pattern)
      const archiveCDNPattern = /^ia\d+\.us\.archive\.org$/;
      if (archiveCDNPattern.test(parsedUrl.hostname)) {
        return true;
      }
      
      return false;
    } catch {
      return false;
    }
  }
  
  private searchFallbackBooks(query: string): Book[] {
    const books = Array.from(this.fallbackBooks.values());
    const lowercaseQuery = query.toLowerCase();
    
    return books.filter(book => 
      book.title.toLowerCase().includes(lowercaseQuery) ||
      book.author.toLowerCase().includes(lowercaseQuery) ||
      (book.genre && book.genre.toLowerCase().includes(lowercaseQuery))
    );
  }

  // User management methods integrating with external API
  async getUser(id: string): Promise<User | undefined> {
    // Check in-memory store first (covers DB-full registration fallback)
    const memUser = this.localUsers.get(id);
    if (memUser) return memUser;

    try {
      console.log(`Fetching user ${id} from database...`);
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      console.error(`Error fetching user ${id}:`, error);
      return undefined;
    }
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    try {
      console.log(`Upserting user ${userData.id || 'new'}`);
      const [user] = await db
        .insert(users)
        .values(userData)
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            updatedAt: new Date(),
          },
        })
        .returning();
      console.log(`Successfully upserted user ${user.id}`);
      return user;
    } catch (error) {
      console.error('Error upserting user:', error);
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    // This method is deprecated - use getUserByEmail instead
    // For OAuth-based auth, we don't have usernames
    console.log(`getUserByUsername is deprecated, using email lookup instead`);
    return this.getUserByEmail(username);
  }

  /** Returns a user that was stored in memory (e.g. due to DB-full fallback). */
  getMemUserByEmail(email: string): User | undefined {
    return Array.from(this.localUsers.values()).find((u) => u.email === email);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    // Check local cache first
    const localUser = Array.from(this.localUsers.values()).find(user => user.email === email);
    if (localUser) {
      return localUser;
    }

    try {
      const response = await fetchWithTimeout(`${EXTERNAL_API_BASE}/users`);
      
      if (response.ok) {
        const responseData = await response.json();
        let externalUsers: ExternalUser[];
        
        if (Array.isArray(responseData)) {
          externalUsers = responseData;
        } else if (responseData.users && Array.isArray(responseData.users)) {
          externalUsers = responseData.users;
        } else if (responseData.data && Array.isArray(responseData.data)) {
          externalUsers = responseData.data;
        } else {
          return undefined;
        }
        
        const externalUser = externalUsers.find(user => user.email === email);
        if (externalUser) {
          const user = transformExternalUser(externalUser);
          this.localUsers.set(user.id, user);
          return user;
        }
      }
    } catch (error) {
      console.warn(`Failed to search for user by email:`, error);
    }
    
    return undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      console.log('Creating user in database...');
      
      // Create user in PostgreSQL database (persist all provided fields)
      const [user] = await db
        .insert(users)
        .values({
          email: insertUser.email,
          firstName: insertUser.firstName,
          lastName: insertUser.lastName,
          passwordHash: insertUser.passwordHash,
          authProvider: insertUser.authProvider || "local",
          providerId: insertUser.providerId,
          profileImageUrl: insertUser.profileImageUrl,
          role: insertUser.role,
          companyName: insertUser.companyName,
          website: insertUser.website,
        })
        .returning();
      
      console.log('User created successfully:', user.id);
      this.localUsers.set(user.id, user);
      analyticsService.track("user_signed_up", "free");
      return user;
    } catch (error: any) {
      // Detect NeonDB / PostgreSQL storage-full errors (code 53100 or known message)
      const isStorageFull =
        error?.cause?.code === "53100" ||
        (typeof error?.message === "string" && error.message.includes("could not extend file")) ||
        (typeof error?.cause?.message === "string" && error.cause.message.includes("could not extend file"));

      // Also fall back to in-memory when the Neon HTTP endpoint refuses the
      // request because the project's compute-time / plan quota is exhausted
      // (HTTP 402). Without this fallback the dev environment is unusable
      // for any auth flow whenever the upstream DB is quota-capped. Strictly
      // gated to non-production so we never silently lose writes in prod.
      const causeStr = typeof error?.cause?.message === "string" ? error.cause.message : "";
      const errStr = typeof error?.message === "string" ? error.message : "";
      const isQuotaExceeded =
        process.env.NODE_ENV !== "production" &&
        (/HTTP status 402/i.test(causeStr) ||
          /HTTP status 402/i.test(errStr) ||
          /exceeded the compute time quota/i.test(causeStr) ||
          /exceeded the compute time quota/i.test(errStr));

      if (isStorageFull || isQuotaExceeded) {
        console.warn(
          `[Auth] DB ${isQuotaExceeded ? "compute quota exceeded" : "storage limit reached"} — storing new user in memory (session-only)`,
        );
        const now = new Date();
        const memUser = {
          id: randomUUID(),
          email: insertUser.email ?? null,
          firstName: insertUser.firstName ?? null,
          lastName: insertUser.lastName ?? null,
          passwordHash: insertUser.passwordHash ?? null,
          authProvider: insertUser.authProvider || "local",
          providerId: insertUser.providerId ?? null,
          profileImageUrl: insertUser.profileImageUrl ?? null,
          subscriptionTier: insertUser.subscriptionTier ?? "free",
          stripeCustomerId: insertUser.stripeCustomerId ?? null,
          stripeSubscriptionId: insertUser.stripeSubscriptionId ?? null,
          subscriptionEndDate: insertUser.subscriptionEndDate ?? null,
          stripeEasyEnglishSubscriptionItemId: insertUser.stripeEasyEnglishSubscriptionItemId ?? null,
          createdAt: now,
          updatedAt: now,
          referralCode: insertUser.referralCode ?? null,
          referralCredits: insertUser.referralCredits ?? 0,
          name: insertUser.name ?? null,
          emailVerified: insertUser.emailVerified ?? null,
          image: insertUser.image ?? null,
          role: insertUser.role ?? null,
          companyName: insertUser.companyName ?? null,
          website: insertUser.website ?? null,
        } as User;
        this.localUsers.set(memUser.id, memUser);
        return memUser;
      }

      console.error('Failed to create user:', error);
      throw error;
    }
  }
  
  async authenticateExternalUser(email: string, password: string): Promise<User | null> {
    // This method is deprecated - use local auth via multiAuth.ts instead
    console.log('authenticateExternalUser is deprecated - use local auth instead');
    return null;
  }
  
  private async getOpenLibraryBook(id: string): Promise<OpenLibraryBook | null> {
    try {
      const olid = id.replace('openlibrary-', '');
      console.log(`Fetching Open Library work: ${olid}`);
      
      const url = `${OPEN_LIBRARY_API_BASE}/works/${olid}.json`;
      
      const response = await fetchWithTimeout(url, 20000);
      
      if (response.ok) {
        const responseData = await response.json();
        console.log(`Open Library work response for ${olid}:`, JSON.stringify(responseData, null, 2));
        
        // Transform the work data to our search format
        const openLibraryBook: OpenLibraryBook = {
          key: responseData.key || `/works/${olid}`,
          title: responseData.title,
          author_name: responseData.authors?.map((author: any) => author.name || 'Unknown Author'),
          first_publish_year: responseData.first_publish_date ? new Date(responseData.first_publish_date).getFullYear() : undefined,
          subject: responseData.subjects?.slice(0, 3) || undefined,
          cover_i: responseData.covers?.[0],
          language: responseData.languages?.map((lang: any) => lang.key?.replace('/languages/', '')) || ['eng'],
        };
        
        return openLibraryBook;
      } else {
        console.warn(`Open Library API returned status ${response.status} for ${olid}`);
        return null;
      }
    } catch (error) {
      console.error('Error fetching Open Library work:', error);
      return null;
    }
  }
  
  // Open Library API methods
  private async fetchOpenLibraryBooks(limit: number = 20): Promise<OpenLibraryBook[]> {
    try {
      console.log(`Fetching Open Library books (limit: ${limit})...`);
      const subjects = ['fiction', 'science', 'history', 'philosophy', 'biography', 'poetry', 'mystery', 'romance', 'fantasy', 'adventure', 'thriller', 'horror', 'humor', 'drama', 'travel', 'psychology', 'economics', 'art', 'music', 'nature'];
      const perSubject = Math.ceil(limit / subjects.length);
      const allBooks: OpenLibraryBook[] = [];
      
      const promises = subjects.map(async (subject) => {
        try {
          const url = `${OPEN_LIBRARY_API_BASE}/search.json?subject=${encodeURIComponent(subject)}&limit=${perSubject}&sort=rating`;
          const response = await fetchWithTimeout(url, 20000);
          if (response.ok) {
            const data: OpenLibrarySearchResponse = await response.json();
            return data.docs || [];
          }
          return [];
        } catch {
          return [];
        }
      });
      
      const results = await Promise.all(promises);
      results.forEach(docs => allBooks.push(...docs));
      console.log(`Open Library API response: ${allBooks.length} books`);
      return allBooks.slice(0, limit);
    } catch (error) {
      console.error('Error fetching Open Library books:', error);
      return [];
    }
  }
  
  // Google Books API methods
  private async fetchGoogleBooks(limit: number = 20): Promise<GoogleBooksVolume[]> {
    if (!GOOGLE_BOOKS_API_KEY) {
      console.warn('Google Books API key not configured');
      return [];
    }
    
    try {
      console.log(`Fetching Google Books (limit: ${limit})...`);
      const subjects = ['fiction', 'mystery', 'science+fiction', 'history', 'biography', 'romance', 'fantasy', 'thriller', 'self+help', 'business', 'philosophy', 'poetry', 'adventure', 'horror', 'young+adult', 'psychology', 'cooking', 'art', 'music', 'travel', 'health', 'education', 'religion', 'humor', 'drama'];
      const perSubject = Math.min(Math.ceil(limit / subjects.length), 40);
      const allVolumes: GoogleBooksVolume[] = [];
      const seenIds = new Set<string>();
      
      const promises = subjects.map(async (subject) => {
        try {
          const url = `${GOOGLE_BOOKS_API_BASE}/volumes?q=subject:${subject}&orderBy=relevance&maxResults=${perSubject}&key=${GOOGLE_BOOKS_API_KEY}`;
          const response = await fetchWithTimeout(url, 15000);
          if (response.ok) {
            const data: GoogleBooksSearchResponse = await response.json();
            return data.items || [];
          }
          return [];
        } catch {
          return [];
        }
      });
      
      const results = await Promise.all(promises);
      results.forEach(volumes => {
        volumes.forEach(v => {
          if (!seenIds.has(v.id)) {
            seenIds.add(v.id);
            allVolumes.push(v);
          }
        });
      });
      
      console.log(`Google Books API response: ${allVolumes.length} books`);
      return allVolumes.slice(0, limit);
    } catch (error) {
      console.error('Error fetching Google Books:', error);
      return [];
    }
  }
  
  private async searchGoogleBooks(query: string, limit: number = 10): Promise<GoogleBooksVolume[]> {
    if (!GOOGLE_BOOKS_API_KEY) {
      console.warn('Google Books API key not configured');
      return [];
    }
    
    try {
      console.log(`Searching Google Books for: ${query}`);
      
      const url = `${GOOGLE_BOOKS_API_BASE}/volumes?q=${encodeURIComponent(query)}&maxResults=${Math.min(limit, 40)}&key=${GOOGLE_BOOKS_API_KEY}`;
      
      const response = await fetchWithTimeout(url, 20000);
      
      if (response.ok) {
        const responseData: GoogleBooksSearchResponse = await response.json();
        console.log(`Google Books search: ${responseData.items?.length || 0} results`);
        return responseData.items || [];
      } else {
        console.warn(`Google Books search returned status ${response.status}`);
        return [];
      }
    } catch (error) {
      console.error('Error searching Google Books:', error);
      return [];
    }
  }
  
  private async getGoogleBook(volumeId: string): Promise<GoogleBooksVolume | null> {
    if (!GOOGLE_BOOKS_API_KEY) {
      console.warn('Google Books API key not configured');
      return null;
    }
    
    try {
      console.log(`Fetching Google Books volume: ${volumeId}`);
      
      const url = `${GOOGLE_BOOKS_API_BASE}/volumes/${volumeId}?key=${GOOGLE_BOOKS_API_KEY}`;
      
      const response = await fetchWithTimeout(url, 20000);
      
      if (response.ok) {
        const volume: GoogleBooksVolume = await response.json();
        console.log(`Google Books volume found: ${volume.volumeInfo.title}`);
        return volume;
      } else {
        console.warn(`Google Books API returned status ${response.status} for volume ${volumeId}`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching Google Books volume ${volumeId}:`, error);
      return null;
    }
  }
  
  // iTunes Search API methods
  private async fetchiTunesAudiobooks(limit: number = 20): Promise<iTunesAudiobook[]> {
    return cachedFetch(`itunes_audiobooks_${limit}`, CACHE_TTL.BOOKS, async () => {
      try {
        console.log(`Fetching iTunes audiobooks (limit: ${limit})...`);
        const terms = ['bestseller', 'fiction audiobook', 'mystery audiobook', 'science fiction', 'romance audiobook', 'thriller audiobook', 'fantasy audiobook', 'history audiobook', 'biography audiobook', 'self help'];
        const perTerm = Math.min(Math.ceil(limit / terms.length), 200);
        const allAudiobooks: iTunesAudiobook[] = [];
        const seenIds = new Set<number>();
        
        const promises = terms.map(async (term) => {
          try {
            const url = `${ITUNES_SEARCH_API_BASE}/search?term=${encodeURIComponent(term)}&entity=audiobook&limit=${perTerm}&country=us`;
            const response = await fetchWithRetry(url, {}, 2, 1000);
            if (response.ok) {
              const data: iTunesSearchResponse = await response.json();
              return data.results || [];
            }
            return [];
          } catch {
            return [];
          }
        });
        
        const results = await Promise.all(promises);
        results.forEach(audiobooks => {
          audiobooks.forEach(ab => {
            const id = ab.collectionId || ab.trackId || 0;
            if (id && !seenIds.has(id)) {
              seenIds.add(id);
              allAudiobooks.push(ab);
            }
          });
        });
        
        console.log(`iTunes API response: ${allAudiobooks.length} audiobooks`);
        return allAudiobooks.slice(0, limit);
      } catch (error) {
        console.error('Error fetching iTunes audiobooks:', error);
        return [];
      }
    });
  }
  
  private async searchiTunesAudiobooks(query: string, limit: number = 10): Promise<iTunesAudiobook[]> {
    try {
      console.log(`Searching iTunes for: ${query}`);
      
      const url = `${ITUNES_SEARCH_API_BASE}/search?term=${encodeURIComponent(query)}&entity=audiobook&limit=${limit}&country=us`;
      
      const response = await fetchWithTimeout(url, 20000);
      
      if (response.ok) {
        const responseData: iTunesSearchResponse = await response.json();
        console.log(`iTunes search: ${responseData.results.length} results`);
        return responseData.results || [];
      } else {
        console.warn(`iTunes search returned status ${response.status}`);
        return [];
      }
    } catch (error) {
      console.error('Error searching iTunes:', error);
      return [];
    }
  }
  
  private async getiTunesAudiobook(collectionId: number): Promise<iTunesAudiobook | null> {
    try {
      console.log(`Fetching iTunes audiobook: ${collectionId}`);
      
      const url = `${ITUNES_SEARCH_API_BASE}/lookup?id=${collectionId}&entity=audiobook`;
      
      const response = await fetchWithTimeout(url, 20000);
      
      if (response.ok) {
        const responseData: iTunesSearchResponse = await response.json();
        if (responseData.results && responseData.results.length > 0) {
          console.log(`iTunes audiobook found: ${responseData.results[0].collectionName}`);
          return responseData.results[0];
        }
      }
      
      console.warn(`iTunes audiobook not found: ${collectionId}`);
      return null;
    } catch (error) {
      console.error(`Error fetching iTunes audiobook ${collectionId}:`, error);
      return null;
    }
  }
  
  // Search iTunes by ISBN
  private async searchiTunesByISBN(isbn: string): Promise<iTunesAudiobook[]> {
    try {
      console.log(`Searching iTunes by ISBN: ${isbn}`);
      
      const url = `${ITUNES_SEARCH_API_BASE}/search?term=${isbn}&entity=audiobook&limit=5&country=us`;
      
      const response = await fetchWithTimeout(url, 20000);
      
      if (response.ok) {
        const responseData: iTunesSearchResponse = await response.json();
        console.log(`iTunes ISBN search: ${responseData.results.length} results`);
        return responseData.results || [];
      } else {
        console.warn(`iTunes ISBN search returned status ${response.status}`);
        return [];
      }
    } catch (error) {
      console.error(`Error searching iTunes by ISBN ${isbn}:`, error);
      return [];
    }
  }
  
  // Internet Archive API methods
  private async fetchInternetArchiveBooks(limit: number = 200): Promise<InternetArchiveDoc[]> {
    try {
      console.log(`Fetching Internet Archive books (limit: ${limit})...`);
      
      const queries = [
        'mediatype:texts AND language:eng AND collection:opensource',
        'mediatype:texts AND language:eng AND collection:gutenberg',
        'mediatype:audio AND language:eng AND collection:librivoxaudio',
        'mediatype:texts AND language:eng AND downloads:[100 TO 999999]',
      ];
      const perQuery = Math.ceil(limit / queries.length);
      const allDocs: InternetArchiveDoc[] = [];
      const seenIds = new Set<string>();
      
      const promises = queries.map(async (query) => {
        try {
          const url = `${INTERNET_ARCHIVE_API_BASE}/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier,title,creator,description,year,date,subject,language,mediatype&rows=${perQuery}&sort[]=downloads+desc&output=json`;
          const response = await fetchWithTimeout(url, 20000);
          if (response.ok) {
            const responseData: InternetArchiveSearchResponse = await response.json();
            return responseData.response.docs || [];
          }
          return [];
        } catch {
          return [];
        }
      });
      
      const results = await Promise.all(promises);
      results.forEach(docs => {
        docs.forEach(doc => {
          if (!seenIds.has(doc.identifier)) {
            seenIds.add(doc.identifier);
            allDocs.push(doc);
          }
        });
      });
      
      console.log(`Internet Archive API response: ${allDocs.length} books`);
      return allDocs.slice(0, limit);
    } catch (error) {
      console.error('Error fetching Internet Archive books:', error);
      return [];
    }
  }
  
  private async searchInternetArchiveBooks(query: string, limit: number = 10): Promise<InternetArchiveDoc[]> {
    try {
      console.log(`Searching Internet Archive for: ${query}`);
      
      // Search in title and creator fields, limit to texts
      const searchQuery = `(title:(${query}) OR creator:(${query})) AND mediatype:texts`;
      const url = `${INTERNET_ARCHIVE_API_BASE}/advancedsearch.php?q=${encodeURIComponent(searchQuery)}&fl[]=identifier,title,creator,description,year,date,subject,language,mediatype,format&rows=${limit}&output=json`;
      
      const response = await fetchWithTimeout(url, 20000);
      
      if (response.ok) {
        const responseData: InternetArchiveSearchResponse = await response.json();
        console.log(`Internet Archive search: ${responseData.response.docs.length} results`);
        return responseData.response.docs || [];
      } else {
        console.warn(`Internet Archive search returned status ${response.status}`);
        return [];
      }
    } catch (error) {
      console.error('Error searching Internet Archive:', error);
      return [];
    }
  }
  
  private async getInternetArchiveBook(identifier: string): Promise<InternetArchiveDoc | null> {
    try {
      console.log(`Fetching Internet Archive item: ${identifier}`);
      
      const url = `${INTERNET_ARCHIVE_API_BASE}/metadata/${identifier}`;
      
      const response = await fetchWithTimeout(url, 20000);
      
      if (response.ok) {
        const metadata = await response.json();
        
        // Transform metadata response to match our doc interface
        const doc: InternetArchiveDoc = {
          identifier: metadata.metadata.identifier || identifier,
          title: metadata.metadata.title || "Untitled",
          creator: metadata.metadata.creator,
          description: metadata.metadata.description,
          date: metadata.metadata.date,
          year: metadata.metadata.year,
          subject: metadata.metadata.subject,
          language: metadata.metadata.language,
          mediatype: metadata.metadata.mediatype,
          format: metadata.files?.map((f: any) => f.format),
        };
        
        console.log(`Internet Archive item found: ${doc.title}`);
        return doc;
      } else {
        console.warn(`Internet Archive API returned status ${response.status} for item ${identifier}`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching Internet Archive item ${identifier}:`, error);
      return null;
    }
  }
  
  private async searchOpenLibraryBooks(query: string, limit: number = 10): Promise<OpenLibraryBook[]> {
    try {
      console.log(`Searching Open Library for: ${query}`);
      
      // Try title search first
      const titleUrl = `${OPEN_LIBRARY_API_BASE}/search.json?title=${encodeURIComponent(query)}&limit=${limit}`;
      
      const response = await fetchWithTimeout(titleUrl, 10000);
      
      if (response.ok) {
        const responseData: OpenLibrarySearchResponse = await response.json();
        console.log(`Open Library title search: ${responseData.docs.length} results`);
        
        if (responseData.docs.length > 0) {
          return responseData.docs;
        }
      }
      
      // If title search doesn't yield results, try general search
      const generalUrl = `${OPEN_LIBRARY_API_BASE}/search.json?q=${encodeURIComponent(query)}&limit=${limit}`;
      
      const generalResponse = await fetchWithTimeout(generalUrl, 10000);
      
      if (generalResponse.ok) {
        const generalData: OpenLibrarySearchResponse = await generalResponse.json();
        console.log(`Open Library general search: ${generalData.docs.length} results`);
        return generalData.docs || [];
      }
      
      return [];
    } catch (error) {
      console.error('Error searching Open Library books:', error);
      return [];
    }
  }

  // LibriVox API integration methods
  private async fetchLibriVoxBooks(limit = 50, offset = 0): Promise<LibriVoxBook[]> {
    return cachedFetch(`librivox_books_${limit}_${offset}`, CACHE_TTL.BOOKS, async () => {
      try {
        console.log(`Fetching LibriVox books (limit: ${limit}, offset: ${offset})...`);
        const url = `${LIBRIVOX_API_BASE}?format=json&extended=1&limit=${limit}&offset=${offset}`;
        
        const response = await fetchWithRetry(url, {}, 2, 1500);
        
        if (response.ok) {
          const responseData = await response.json();
          console.log(`LibriVox API response: ${responseData.books?.length || 0} books`);
          
          if (responseData.books && Array.isArray(responseData.books)) {
            return responseData.books;
          }
          return [];
        } else {
          console.warn('LibriVox API returned error:', response.status);
          return [];
        }
      } catch (error) {
        console.warn('Failed to fetch from LibriVox API:', error);
        return [];
      }
    });
  }
  
  private async searchLibriVoxBooks(query: string, limit = 20): Promise<LibriVoxBook[]> {
    try {
      console.log(`Searching LibriVox for: "${query}"`);
      
      // Correct LibriVox API URL format with query parameters
      const titleUrl = `${LIBRIVOX_API_BASE}?title=^${encodeURIComponent(query)}&format=json&extended=1&limit=${limit}`;
      
      const response = await fetchWithTimeout(titleUrl, 10000);
      
      if (response.ok) {
        const responseData = await response.json();
        console.log(`LibriVox title search returned: ${responseData.books?.length || 0} books`);
        
        if (responseData.books && Array.isArray(responseData.books) && responseData.books.length > 0) {
          return responseData.books;
        }
      }
      
      // If title search doesn't yield results, try author search
      const authorUrl = `${LIBRIVOX_API_BASE}?author=^${encodeURIComponent(query)}&format=json&extended=1&limit=${limit}`;
      
      const authorResponse = await fetchWithTimeout(authorUrl, 10000);
      
      if (authorResponse.ok) {
        const authorData = await authorResponse.json();
        console.log(`LibriVox author search returned: ${authorData.books?.length || 0} books`);
        
        if (authorData.books && Array.isArray(authorData.books)) {
          return authorData.books;
        }
      }
      
      return [];
    } catch (error) {
      console.warn('Failed to search LibriVox API:', error);
      return [];
    }
  }
  
  private async getLibriVoxBook(id: string): Promise<LibriVoxBook | null> {
    try {
      // Extract LibriVox ID from our prefixed ID
      const librivoxId = id.startsWith('librivox-') ? id.replace('librivox-', '') : id;
      console.log(`Fetching LibriVox book: ${librivoxId}`);
      
      const url = `${LIBRIVOX_API_BASE}?id=${librivoxId}&format=json&extended=1`;
      
      const response = await fetchWithTimeout(url, 20000);
      
      if (response.ok) {
        const responseData = await response.json();
        
        if (responseData.books && Array.isArray(responseData.books) && responseData.books.length > 0) {
          return responseData.books[0];
        }
      }
      
      return null;
    } catch (error) {
      console.warn(`Failed to fetch LibriVox book ${id}:`, error);
      return null;
    }
  }

  // Project Gutenberg API integration methods
  private async fetchGutenbergBooks(limit = 32, page = 1): Promise<GutenbergBook[]> {
    const cacheKey = `gutenberg_books_p${page}_l${limit}`;
    return cachedFetch(cacheKey, CACHE_TTL.BOOKS, async () => {
      try {
        console.log(`Fetching Gutenberg ebooks (page: ${page}, limit: ${limit})...`);
        const url = `${GUTENBERG_API_BASE}/books?page=${page}&languages=en`;
        
        const response = await fetchWithRetry(url, {}, 3, 2000);
        
        if (response.ok) {
          const data = await response.json() as GutenbergSearchResponse;
          console.log(`Gutenberg API response: ${data.results?.length || 0} ebooks`);
          return data.results?.slice(0, limit) || [];
        } else {
          console.warn('Gutenberg API returned error:', response.status);
          return [];
        }
      } catch (error) {
        console.warn('Failed to fetch from Gutenberg API:', error);
        return [];
      }
    });
  }

  private async searchGutenbergBooks(query: string, limit = 20): Promise<GutenbergBook[]> {
    const cacheKey = `gutenberg_search_${query}_${limit}`;
    return cachedFetch(cacheKey, CACHE_TTL.SEARCH, async () => {
      try {
        console.log(`Searching Gutenberg for: "${query}"`);
        const url = `${GUTENBERG_API_BASE}/books?search=${encodeURIComponent(query)}&languages=en`;
        
        const response = await fetchWithRetry(url, {}, 2, 2000);
        
        if (response.ok) {
          const data = await response.json() as GutenbergSearchResponse;
          console.log(`Gutenberg search returned: ${data.results?.length || 0} ebooks`);
          return data.results?.slice(0, limit) || [];
        }
        return [];
      } catch (error) {
        console.warn('Failed to search Gutenberg API:', error);
        return [];
      }
    });
  }

  private async getGutenbergBook(id: string): Promise<GutenbergBook | null> {
    try {
      const gutenbergId = id.startsWith('gutenberg-') ? id.replace('gutenberg-', '') : id;
      console.log(`Fetching Gutenberg ebook: ${gutenbergId}`);
      
      const url = `${GUTENBERG_API_BASE}/books/${gutenbergId}`;
      
      const response = await fetchWithTimeout(url, 20000);
      
      if (response.ok) {
        const data = await response.json() as GutenbergBook;
        return data;
      }
      return null;
    } catch (error) {
      console.warn(`Failed to fetch Gutenberg book ${id}:`, error);
      return null;
    }
  }

  async updateUserSubscription(userId: string, subscription: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string | null;
    subscriptionTier?: string;
    subscriptionStatus?: string;
    subscriptionEndDate?: Date | null;
  }): Promise<User | undefined> {
    try {
      console.log(`Updating subscription for user ${userId}:`, subscription);
      
      const updateData: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
      };
      
      if (subscription.stripeCustomerId !== undefined) {
        updateData.stripeCustomerId = subscription.stripeCustomerId;
      }
      if (subscription.stripeSubscriptionId !== undefined) {
        updateData.stripeSubscriptionId = subscription.stripeSubscriptionId;
      }
      if (subscription.subscriptionTier !== undefined) {
        updateData.subscriptionTier = subscription.subscriptionTier;
      }
      if (subscription.subscriptionEndDate !== undefined) {
        updateData.subscriptionEndDate = subscription.subscriptionEndDate;
      }
      // subscriptionStatus is persisted if column exists; wrapped in try/catch below
      if (subscription.subscriptionStatus !== undefined) {
        try {
          (updateData as any).subscriptionStatus = subscription.subscriptionStatus;
        } catch {
          // column may not exist yet
        }
      }
      
      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();
      
      console.log(`Successfully updated subscription for user ${updatedUser?.id}`);
      if (updatedUser) {
        this.localUsers.set(updatedUser.id, updatedUser);
      }
      return updatedUser;
    } catch (error: any) {
      // Mirror the createUser fallback: when the DB is unreachable due to a
      // quota / storage outage, update the in-memory user record so auth flows
      // (and tests) keep working.
      // Strictly gated to non-production: in production we surface the
      // failure to the caller rather than acknowledge a write that won't
      // survive a restart.
      const causeStr = typeof error?.cause?.message === "string" ? error.cause.message : "";
      const errStr = typeof error?.message === "string" ? error.message : "";
      const isOutage =
        process.env.NODE_ENV !== "production" &&
        (error?.cause?.code === "53100" ||
          /HTTP status 402/i.test(causeStr) ||
          /HTTP status 402/i.test(errStr) ||
          /exceeded the compute time quota/i.test(causeStr) ||
          /exceeded the compute time quota/i.test(errStr) ||
          /could not extend file/i.test(causeStr) ||
          /could not extend file/i.test(errStr));
      const memUser = this.localUsers.get(userId);
      if (isOutage && memUser) {
        const merged = {
          ...memUser,
          ...(subscription.stripeCustomerId !== undefined && { stripeCustomerId: subscription.stripeCustomerId }),
          ...(subscription.stripeSubscriptionId !== undefined && { stripeSubscriptionId: subscription.stripeSubscriptionId }),
          ...(subscription.subscriptionTier !== undefined && { subscriptionTier: subscription.subscriptionTier }),
          ...(subscription.subscriptionEndDate !== undefined && { subscriptionEndDate: subscription.subscriptionEndDate }),
          updatedAt: new Date(),
        } as User;
        this.localUsers.set(userId, merged);
        console.warn(`[Auth] DB unreachable — updated in-memory subscription for user ${userId}`);
        return merged;
      }
      console.error(`Error updating subscription for user ${userId}:`, error);
      return undefined;
    }
  }

  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined> {
    try {
      console.log(`Looking up user by Stripe customer ID: ${stripeCustomerId}`);
      const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, stripeCustomerId));
      return user;
    } catch (error) {
      console.error(`Error looking up user by Stripe customer ID:`, error);
      return undefined;
    }
  }

  // Purchase methods
  async getUserPurchases(userId: string): Promise<Purchase[]> {
    try {
      return await db.select().from(purchases).where(eq(purchases.userId, userId)).orderBy(desc(purchases.purchasedAt));
    } catch (error) {
      console.error(`Error getting purchases for user ${userId}:`, error);
      return [];
    }
  }

  async getUserPurchase(userId: string, bookId: string): Promise<Purchase | undefined> {
    try {
      const [purchase] = await db.select().from(purchases)
        .where(and(eq(purchases.userId, userId), eq(purchases.bookId, bookId)));
      return purchase;
    } catch (error) {
      console.error(`Error checking purchase for user ${userId}, book ${bookId}:`, error);
      return undefined;
    }
  }

  async createPurchase(purchase: InsertPurchase): Promise<Purchase> {
    const [created] = await db.insert(purchases).values(purchase).returning();
    return created;
  }

  // Listening history methods
  async getListeningHistory(userId: string, limit: number = 50): Promise<ListeningHistory[]> {
    try {
      const history = await db
        .select()
        .from(listeningHistory)
        .where(eq(listeningHistory.userId, userId))
        .orderBy(desc(listeningHistory.lastPlayedAt))
        .limit(limit);
      return history;
    } catch (error) {
      console.error(`Error getting listening history for user ${userId}:`, error);
      return [];
    }
  }

  async updateListeningProgress(userId: string, bookId: string, progress: {
    currentTime: number;
    bookTitle: string;
    bookAuthor?: string;
    bookCover?: string;
    totalDuration?: number;
  }): Promise<ListeningHistory> {
    try {
      // Check if entry already exists
      const [existing] = await db
        .select()
        .from(listeningHistory)
        .where(and(
          eq(listeningHistory.userId, userId),
          eq(listeningHistory.bookId, bookId)
        ));

      if (existing) {
        // Update existing entry
        const isCompleted = progress.totalDuration && progress.currentTime >= progress.totalDuration * 0.95;
        const [updated] = await db
          .update(listeningHistory)
          .set({
            currentTime: progress.currentTime,
            lastPlayedAt: new Date(),
            playCount: existing.playCount + 1,
            completedAt: isCompleted && !existing.completedAt ? new Date() : existing.completedAt,
            totalDuration: progress.totalDuration || existing.totalDuration,
          })
          .where(eq(listeningHistory.id, existing.id))
          .returning();
        return updated;
      } else {
        // Create new entry
        const [created] = await db
          .insert(listeningHistory)
          .values({
            userId,
            bookId,
            bookTitle: progress.bookTitle,
            bookAuthor: progress.bookAuthor,
            bookCover: progress.bookCover,
            currentTime: progress.currentTime,
            totalDuration: progress.totalDuration,
          })
          .returning();
        return created;
      }
    } catch (error) {
      console.error(`Error updating listening progress:`, error);
      throw error;
    }
  }

  async getContinueListening(userId: string, limit: number = 10): Promise<ListeningHistory[]> {
    try {
      // Get books that are in progress (started but not completed)
      const history = await db
        .select()
        .from(listeningHistory)
        .where(and(
          eq(listeningHistory.userId, userId)
        ))
        .orderBy(desc(listeningHistory.lastPlayedAt))
        .limit(limit);
      
      // Filter to only in-progress books (currentTime > 0 and not completed)
      return history.filter(h => 
        h.currentTime > 0 && 
        (!h.completedAt || (h.totalDuration && h.currentTime < h.totalDuration * 0.95))
      );
    } catch (error) {
      console.error(`Error getting continue listening for user ${userId}:`, error);
      return [];
    }
  }

  async getBookChapters(bookId: string): Promise<Chapter[]> {
    try {
      // First check database for chapters
      const dbChapters = await db
        .select()
        .from(chapters)
        .where(eq(chapters.bookId, bookId))
        .orderBy(asc(chapters.chapterNumber));
      
      if (dbChapters.length > 0) {
        return dbChapters;
      }

      // Fallback: LibriVox books have chapters from API
      if (bookId.startsWith("librivox-")) {
        const librivoxId = bookId.replace("librivox-", "");
        console.log(`Fetching chapters for LibriVox book: ${librivoxId}`);

        const url = `${LIBRIVOX_API_BASE}?id=${librivoxId}&format=json&extended=1`;
        const response = await fetchWithTimeout(url, 20000);

        if (response.ok) {
          const responseData = await response.json();
          
          if (responseData.books && Array.isArray(responseData.books) && responseData.books.length > 0) {
            const book = responseData.books[0] as LibriVoxBook;
            
            if (book.sections && Array.isArray(book.sections)) {
              let cumulativeTime = 0;
              return book.sections.map((section: LibriVoxSection) => {
                const sectionDuration = section.playtime ? parseInt(section.playtime, 10) : 0;
                const startTime = cumulativeTime;
                cumulativeTime += sectionDuration;
                
                return {
                  id: section.id,
                  bookId: bookId,
                  title: section.title || `Chapter ${section.section_number}`,
                  chapterNumber: parseInt(section.section_number, 10) || 0,
                  startTime: startTime,
                  endTime: cumulativeTime,
                  duration: sectionDuration,
                  pageStart: null,
                  pageEnd: null,
                };
              });
            }
          }
        }
      }

      return [];
    } catch (error) {
      console.error(`Error fetching chapters for book ${bookId}:`, error);
      return [];
    }
  }

  async createChapter(chapter: InsertChapter): Promise<Chapter> {
    const [created] = await db
      .insert(chapters)
      .values(chapter)
      .returning();
    return created;
  }

  async createChapters(chapterList: InsertChapter[]): Promise<Chapter[]> {
    if (chapterList.length === 0) return [];
    const created = await db
      .insert(chapters)
      .values(chapterList)
      .returning();
    return created;
  }

  async deleteBookChapters(bookId: string): Promise<boolean> {
    try {
      await db.delete(chapters).where(eq(chapters.bookId, bookId));
      return true;
    } catch (error) {
      console.error(`Error deleting chapters for book ${bookId}:`, error);
      return false;
    }
  }

  // Playlist Methods
  async getPlaylists(userId?: string): Promise<PlaylistWithCount[]> {
    try {
      const result = await db
        .select({
          playlist: playlists,
          itemCount: count(playlistItems.id),
        })
        .from(playlists)
        .leftJoin(playlistItems, eq(playlists.id, playlistItems.playlistId))
        .where(userId ? eq(playlists.userId, userId) : undefined)
        .groupBy(playlists.id)
        .orderBy(desc(playlists.updatedAt));

      return result.map(r => ({
        ...r.playlist,
        itemCount: Number(r.itemCount),
      }));
    } catch (error) {
      console.error("Error getting playlists:", error);
      return [];
    }
  }

  async getPlaylist(id: string): Promise<PlaylistWithCount | undefined> {
    try {
      const result = await db
        .select({
          playlist: playlists,
          itemCount: count(playlistItems.id),
        })
        .from(playlists)
        .leftJoin(playlistItems, eq(playlists.id, playlistItems.playlistId))
        .where(eq(playlists.id, id))
        .groupBy(playlists.id);

      if (result.length === 0) return undefined;

      const items = await this.getPlaylistItems(id);
      
      return {
        ...result[0].playlist,
        itemCount: Number(result[0].itemCount),
        items,
      };
    } catch (error) {
      console.error("Error getting playlist:", error);
      return undefined;
    }
  }

  async createPlaylist(playlist: InsertPlaylist): Promise<Playlist> {
    const [created] = await db
      .insert(playlists)
      .values(playlist)
      .returning();
    return created;
  }

  async updatePlaylist(id: string, updates: Partial<InsertPlaylist>): Promise<Playlist | undefined> {
    try {
      const [updated] = await db
        .update(playlists)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(playlists.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating playlist:", error);
      return undefined;
    }
  }

  async deletePlaylist(id: string): Promise<boolean> {
    try {
      await db.delete(playlists).where(eq(playlists.id, id));
      return true;
    } catch (error) {
      console.error("Error deleting playlist:", error);
      return false;
    }
  }

  async addToPlaylist(playlistId: string, book: { bookId: string; bookTitle: string; bookAuthor?: string; bookCover?: string }): Promise<PlaylistItem> {
    // Get current max position
    const items = await this.getPlaylistItems(playlistId);
    const maxPosition = items.reduce((max, item) => Math.max(max, item.position), -1);

    const [created] = await db
      .insert(playlistItems)
      .values({
        playlistId,
        bookId: book.bookId,
        bookTitle: book.bookTitle,
        bookAuthor: book.bookAuthor,
        bookCover: book.bookCover,
        position: maxPosition + 1,
      })
      .returning();
    
    // Update playlist's updatedAt
    await db.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, playlistId));
    
    return created;
  }

  async removeFromPlaylist(playlistId: string, bookId: string): Promise<boolean> {
    try {
      await db
        .delete(playlistItems)
        .where(and(eq(playlistItems.playlistId, playlistId), eq(playlistItems.bookId, bookId)));
      
      // Update playlist's updatedAt
      await db.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, playlistId));
      
      return true;
    } catch (error) {
      console.error("Error removing from playlist:", error);
      return false;
    }
  }

  async getPlaylistItems(playlistId: string): Promise<PlaylistItem[]> {
    try {
      return await db
        .select()
        .from(playlistItems)
        .where(eq(playlistItems.playlistId, playlistId))
        .orderBy(asc(playlistItems.position));
    } catch (error) {
      console.error("Error getting playlist items:", error);
      return [];
    }
  }

  async getCuratedPlaylists(): Promise<PlaylistWithCount[]> {
    try {
      const result = await db
        .select({
          playlist: playlists,
          itemCount: count(playlistItems.id),
        })
        .from(playlists)
        .leftJoin(playlistItems, eq(playlists.id, playlistItems.playlistId))
        .where(eq(playlists.isCurated, 1))
        .groupBy(playlists.id)
        .orderBy(playlists.category);

      return result.map(r => ({
        ...r.playlist,
        itemCount: Number(r.itemCount),
      }));
    } catch (error) {
      console.error("Error getting curated playlists:", error);
      return [];
    }
  }

  async getDJRecommendations(userId?: string): Promise<DJRecommendation[]> {
    const recommendations: DJRecommendation[] = [];
    const allBooks = await this.getBooks();
    
    // 1. Time-based recommendations
    const hour = new Date().getHours();
    let timeRecommendation: DJRecommendation;
    
    if (hour >= 22 || hour < 6) {
      // Night time - sleep stories
      const sleepBooks = allBooks.filter(b => 
        b.genre?.toLowerCase().includes("fiction") || 
        b.genre?.toLowerCase().includes("classic") ||
        b.title.toLowerCase().includes("story") ||
        b.title.toLowerCase().includes("tale")
      ).slice(0, 6);
      
      timeRecommendation = {
        id: "time-sleep",
        type: "time-based",
        title: "Wind Down Tonight",
        description: "Relaxing audiobooks perfect for bedtime",
        books: sleepBooks.length > 0 ? sleepBooks : allBooks.slice(0, 6),
      };
    } else if (hour >= 6 && hour < 12) {
      // Morning - motivational
      const morningBooks = allBooks.filter(b => 
        b.genre?.toLowerCase().includes("self") ||
        b.genre?.toLowerCase().includes("biography") ||
        b.genre?.toLowerCase().includes("history")
      ).slice(0, 6);
      
      timeRecommendation = {
        id: "time-morning",
        type: "time-based",
        title: "Start Your Day Right",
        description: "Inspiring audiobooks to energize your morning",
        books: morningBooks.length > 0 ? morningBooks : allBooks.slice(0, 6),
      };
    } else {
      // Afternoon/Evening - adventure and entertainment
      const afternoonBooks = allBooks.filter(b => 
        b.genre?.toLowerCase().includes("adventure") ||
        b.genre?.toLowerCase().includes("mystery") ||
        b.genre?.toLowerCase().includes("fiction")
      ).slice(0, 6);
      
      timeRecommendation = {
        id: "time-afternoon",
        type: "time-based",
        title: "Afternoon Adventures",
        description: "Engaging stories for your afternoon",
        books: afternoonBooks.length > 0 ? afternoonBooks : allBooks.slice(0, 6),
      };
    }
    recommendations.push(timeRecommendation);

    // 2. If logged in, add personalized recommendations
    if (userId) {
      const history = await this.getListeningHistory(userId, 20);
      
      if (history.length > 0) {
        // Continue listening
        const continueBooks = await this.getContinueListening(userId, 6);
        if (continueBooks.length > 0) {
          const bookIds = continueBooks.map(h => h.bookId);
          const books = allBooks.filter(b => bookIds.includes(b.id));
          if (books.length > 0) {
            recommendations.unshift({
              id: "continue",
              type: "continue",
              title: "Continue Listening",
              description: "Pick up where you left off",
              books,
            });
          }
        }

        // Similar to what you've listened to
        const listenedGenres = history
          .map(h => allBooks.find(b => b.id === h.bookId)?.genre)
          .filter(Boolean) as string[];
        
        if (listenedGenres.length > 0) {
          const topGenre = listenedGenres[0];
          const similarBooks = allBooks
            .filter(b => b.genre === topGenre && !history.some(h => h.bookId === b.id))
            .slice(0, 6);
          
          if (similarBooks.length > 0) {
            recommendations.push({
              id: "similar",
              type: "similar",
              title: `More ${topGenre}`,
              description: `Because you've been listening to ${topGenre}`,
              books: similarBooks,
            });
          }
        }
      }
    }

    // 3. Genre-based recommendations
    const genres = Array.from(new Set(allBooks.map(b => b.genre).filter(Boolean)));
    if (genres.length > 0) {
      const randomGenre = genres[Math.floor(Math.random() * genres.length)];
      const genreBooks = allBooks.filter(b => b.genre === randomGenre).slice(0, 6);
      
      if (genreBooks.length > 0) {
        recommendations.push({
          id: `genre-${randomGenre}`,
          type: "genre",
          title: `Explore ${randomGenre}`,
          description: `Discover great ${randomGenre} audiobooks`,
          books: genreBooks,
        });
      }
    }

    // 4. Mood-based (random selection for variety)
    const shuffled = [...allBooks].sort(() => Math.random() - 0.5).slice(0, 6);
    recommendations.push({
      id: "mood-discover",
      type: "mood",
      title: "Discover Something New",
      description: "Handpicked audiobooks just for you",
      books: shuffled,
    });

    return recommendations;
  }

  private generateCode(length = 8): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let code = "";
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async getReferralByCode(code: string): Promise<Referral | null> {
    const [referral] = await db.select().from(referrals).where(eq(referrals.referralCode, code));
    return referral || null;
  }

  async createReferral(referrerId: string): Promise<Referral> {
    const code = this.generateCode();
    const [referral] = await db.insert(referrals).values({
      referrerId,
      referralCode: code,
      status: "pending",
    }).returning();
    return referral;
  }

  async completeReferral(code: string, referredUserId: string): Promise<void> {
    const [referral] = await db.select().from(referrals).where(eq(referrals.referralCode, code));
    if (!referral) throw new Error("Referral not found");

    // Task #64 referral terms:
    //   - Referrer: 1 month free Plus (recorded as $4.99 / 499¢ credit equivalent for accounting + UI display)
    //   - Referee:  14-day Premium trial (premiumTrialEndDate + subscriptionTier="premium")
    const REFERRER_MONTH_FREE_CENTS = 499;
    const REFEREE_TRIAL_DAYS = 14;

    await db.update(referrals)
      .set({ status: "completed", referredUserId, creditAmount: REFERRER_MONTH_FREE_CENTS })
      .where(eq(referrals.id, referral.id));

    // Referrer reward: 1 month free credit (used by billing to discount next renewal)
    await db.update(users)
      .set({ referralCredits: sql`${users.referralCredits} + ${REFERRER_MONTH_FREE_CENTS}` })
      .where(eq(users.id, referral.referrerId));

    // Referee reward: 14-day Premium trial (only grant if not already on a paid tier)
    const [referee] = await db.select().from(users).where(eq(users.id, referredUserId)).limit(1);
    if (referee && (referee.subscriptionTier === "free" || !referee.subscriptionTier)) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + REFEREE_TRIAL_DAYS);
      await db.update(users)
        .set({
          subscriptionTier: "premium",
          subscriptionStatus: "trialing",
        })
        .where(eq(users.id, referredUserId));
      // premiumTrialEndDate lives on user_preferences; upsert so the trial end is tracked.
      const [existingPrefs] = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, referredUserId))
        .limit(1);
      if (existingPrefs) {
        await db.update(userPreferences)
          .set({ premiumTrialEndDate: trialEnd })
          .where(eq(userPreferences.userId, referredUserId));
      } else {
        await db.insert(userPreferences).values({
          userId: referredUserId,
          premiumTrialEndDate: trialEnd,
        });
      }
    }
  }

  async getUserReferrals(userId: string): Promise<Referral[]> {
    return db.select().from(referrals).where(eq(referrals.referrerId, userId)).orderBy(desc(referrals.createdAt));
  }

  async getUserReferralCode(userId: string): Promise<string> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user?.referralCode) return user.referralCode;

    const code = this.generateCode();
    await db.update(users).set({ referralCode: code }).where(eq(users.id, userId));
    return code;
  }

  // Word Bank — in-memory fallback when DB table is unavailable (512MB limit)
  private _wordBankDbAvailable = false;
  private _wordBankMemory = new Map<string, DbWordBankEntry[]>();

  setWordBankDbAvailable(available: boolean): void {
    this._wordBankDbAvailable = available;
  }

  async getWordBankCount(userId: string): Promise<number> {
    const entries = await this.getWordBankEntries(userId);
    return entries.length;
  }

  async getWordBankEntries(userId: string): Promise<DbWordBankEntry[]> {
    if (this._wordBankDbAvailable) {
      try {
        return await db.select().from(wordBankEntries)
          .where(eq(wordBankEntries.userId, userId))
          .orderBy(desc(wordBankEntries.savedAt));
      } catch {}
    }
    return this._wordBankMemory.get(userId) ?? [];
  }

  async addWordBankEntry(userId: string, data: { word: string; definition: string | null; imageUrl: string | null }): Promise<{ entry: DbWordBankEntry; isNew: boolean }> {
    const normalizedWord = data.word.toLowerCase();
    if (this._wordBankDbAvailable) {
      try {
        const [existing] = await db.select().from(wordBankEntries)
          .where(and(eq(wordBankEntries.userId, userId), eq(wordBankEntries.word, normalizedWord)))
          .limit(1);
        if (existing) return { entry: existing, isNew: false };
        const [entry] = await db.insert(wordBankEntries)
          .values({ userId, word: normalizedWord, definition: data.definition, imageUrl: data.imageUrl })
          .returning();
        return { entry, isNew: true };
      } catch {}
    }
    const memList = this._wordBankMemory.get(userId) ?? [];
    const existingMem = memList.find(e => e.word === normalizedWord);
    if (existingMem) return { entry: existingMem, isNew: false };
    const entry: DbWordBankEntry = {
      id: randomUUID(),
      userId,
      word: normalizedWord,
      definition: data.definition ?? null,
      imageUrl: data.imageUrl ?? null,
      savedAt: new Date(),
    };
    this._wordBankMemory.set(userId, [entry, ...memList]);
    return { entry, isNew: true };
  }

  async removeWordBankEntry(userId: string, entryId: string): Promise<boolean> {
    if (this._wordBankDbAvailable) {
      try {
        await db.delete(wordBankEntries).where(
          and(eq(wordBankEntries.id, entryId), eq(wordBankEntries.userId, userId))
        );
        return true;
      } catch {}
    }
    const existing = this._wordBankMemory.get(userId) ?? [];
    this._wordBankMemory.set(userId, existing.filter(e => e.id !== entryId));
    return true;
  }

  // === Plans ===

  async getPlans(): Promise<Plan[]> {
    return db.select().from(plans).orderBy(asc(plans.priceMonthlycents));
  }

  async getPlan(id: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan;
  }

  async getPlanByTier(tier: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.tier, tier));
    return plan;
  }

  async upsertPlan(plan: InsertPlan): Promise<Plan> {
    const [result] = await db
      .insert(plans)
      .values(plan)
      .onConflictDoUpdate({ target: plans.tier, set: { name: plan.name, priceMonthlycents: plan.priceMonthlycents, priceYearlyCents: plan.priceYearlyCents, trialDays: plan.trialDays, features: plan.features, isActive: plan.isActive } })
      .returning();
    return result;
  }

  // === Subscriptions ===

  async getSubscription(userId: string): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.createdAt)).limit(1);
    return sub;
  }

  async upsertSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const existing = await this.getSubscription(subscription.userId);
    if (existing) {
      const [updated] = await db
        .update(subscriptions)
        .set({ ...subscription, updatedAt: new Date() })
        .where(eq(subscriptions.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(subscriptions).values(subscription).returning();
    return created;
  }

  // === Entitlements ===

  async createEntitlement(entitlement: InsertEntitlement): Promise<Entitlement> {
    const [result] = await db.insert(entitlements).values(entitlement).returning();
    return result;
  }

  async getUserEntitlements(userId: string): Promise<Entitlement[]> {
    return db.select().from(entitlements).where(eq(entitlements.userId, userId)).orderBy(desc(entitlements.createdAt));
  }

  // === Listening Sessions ===

  async createListeningSession(session: InsertListeningSession): Promise<ListeningSession> {
    const [result] = await db.insert(listeningSessions).values(session).returning();
    return result;
  }

  async endListeningSession(sessionId: string, minutesListened: number, interruptedBy?: string): Promise<ListeningSession | undefined> {
    const [result] = await db
      .update(listeningSessions)
      .set({ endedAt: new Date(), minutesListened, interruptedBy: interruptedBy ?? null })
      .where(eq(listeningSessions.id, sessionId))
      .returning();
    return result;
  }

  // === Ad Rewards ===

  async createAdReward(reward: InsertAdReward): Promise<AdReward> {
    const [result] = await db.insert(adRewards).values(reward).returning();
    return result;
  }

  async getAdRewards(userId: string): Promise<AdReward[]> {
    return db.select().from(adRewards).where(eq(adRewards.userId, userId)).orderBy(desc(adRewards.grantedAt));
  }

  // === Accessibility Preferences ===

  async getAccessibilityPreferences(userId: string): Promise<AccessibilityPreferences | undefined> {
    const [prefs] = await db.select().from(accessibilityPreferences).where(eq(accessibilityPreferences.userId, userId));
    return prefs;
  }

  async upsertAccessibilityPreferences(userId: string, prefs: Omit<InsertAccessibilityPreferences, "userId">): Promise<AccessibilityPreferences> {
    const [result] = await db
      .insert(accessibilityPreferences)
      .values({ userId, ...prefs })
      .onConflictDoUpdate({ target: accessibilityPreferences.userId, set: { ...prefs, updatedAt: new Date() } })
      .returning();
    return result;
  }
}

export const storage = new ExternalAPIStorage();
