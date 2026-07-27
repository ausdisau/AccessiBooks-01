import { Bookmark, Progress } from "@shared/schema";

const BOOKMARKS_KEY = "accessibooks_bookmarks";
const PROGRESS_KEY = "accessibooks_progress";
const SETTINGS_KEY = "accessibooks_settings";
const STATS_KEY = "accessibooks_stats";
const COLLECTIONS_KEY = "accessibooks_collections";
const WORD_BANK_KEY = "accessibooks:word-bank";

export interface WordBankEntry {
  id: string;
  word: string;
  definition: string | null;
  imageUrl: string | null;
  savedAt: string;
}

const WORD_BANK_MILESTONES = [1, 5, 10, 25, 50];

export const wordBankService = {
  getAll(): WordBankEntry[] {
    try {
      const stored = localStorage.getItem(WORD_BANK_KEY);
      if (!stored) return [];
      return JSON.parse(stored);
    } catch {
      return [];
    }
  },

  has(word: string): boolean {
    return this.getAll().some(e => e.word.toLowerCase() === word.toLowerCase());
  },

  add(word: string, definition: string | null, imageUrl: string | null): { entry: WordBankEntry; milestone: number | null } {
    const entries = this.getAll();
    const existingIdx = entries.findIndex(e => e.word.toLowerCase() === word.toLowerCase());
    if (existingIdx >= 0) {
      return { entry: entries[existingIdx], milestone: null };
    }
    const entry: WordBankEntry = {
      id: crypto.randomUUID(),
      word: word.toLowerCase(),
      definition,
      imageUrl,
      savedAt: new Date().toISOString(),
    };
    const newEntries = [entry, ...entries];
    try {
      localStorage.setItem(WORD_BANK_KEY, JSON.stringify(newEntries));
    } catch (error) {
      console.error("Failed to save word bank entry:", error);
    }
    const newCount = newEntries.length;
    const milestone = WORD_BANK_MILESTONES.includes(newCount) ? newCount : null;
    return { entry, milestone };
  },

  remove(id: string): void {
    const entries = this.getAll().filter(e => e.id !== id);
    try {
      localStorage.setItem(WORD_BANK_KEY, JSON.stringify(entries));
    } catch (error) {
      console.error("Failed to remove word bank entry:", error);
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(WORD_BANK_KEY);
    } catch (error) {
      console.error("Failed to clear word bank:", error);
    }
  },
};

export interface ListeningStats {
  totalSecondsListened: number;
  booksStarted: number;
  booksCompleted: number;
  currentStreak: number;
  longestStreak: number;
  lastListenedDate: string | null;
  badges: string[];
}

export interface Collection {
  id: string;
  name: string;
  icon: string;
  bookIds: string[];
  createdAt: string;
}

export type ColorVisionMode = "none" | "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia";

export interface AccessibilitySettings {
  [key: string]: unknown;
  highContrast: boolean;
  dyslexiaFont: boolean;
  darkMode: boolean;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  saturation: number;
  invertColors: boolean;
  highlightLinks: boolean;
  highlightFocus: boolean;
  readingGuide: boolean;
  pauseAnimations: boolean;
  largerCursor: boolean;
  readingMask: boolean;
  activeProfile: string | null;
  themeFont?: string;
  wordSpacing?: number;
  colorVisionMode?: ColorVisionMode;
  captionsOn?: boolean;
  captionPosition?: "above" | "below";
  rewardedAdPreference?: "always" | "never" | "ask";
  focusMode?: boolean;
  voiceControlEnabled?: boolean;
  bionicReading?: boolean;
  colourOverlay?: string;
  colourOverlayOpacity?: number;
  sessionPacingMinutes?: number;
  comprehensionCheckIns?: boolean;
  chapterPreviews?: boolean;
  picturePauses?: boolean;
  symbolOverlay?: boolean;
  switchAccessMode?: boolean;
  karaokeFollowAlong?: boolean;
  focusShell?: boolean;
  preferredSignLanguage?: "BSL" | "ASL" | "AUSLAN";
  showSignAtChapterEnd?: boolean;
}

export const localStorageService = {
  // Bookmarks
  getBookmarks(bookId: string): Bookmark[] {
    try {
      const stored = localStorage.getItem(BOOKMARKS_KEY);
      if (!stored) return [];
      
      const allBookmarks: Bookmark[] = JSON.parse(stored);
      return allBookmarks.filter(bookmark => bookmark.bookId === bookId);
    } catch {
      return [];
    }
  },

  addBookmark(bookmark: Bookmark): void {
    try {
      const stored = localStorage.getItem(BOOKMARKS_KEY);
      const bookmarks: Bookmark[] = stored ? JSON.parse(stored) : [];
      
      bookmarks.push(bookmark);
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    } catch (error) {
      console.error("Failed to save bookmark:", error);
    }
  },

  removeBookmark(bookmarkId: string): void {
    try {
      const stored = localStorage.getItem(BOOKMARKS_KEY);
      if (!stored) return;
      
      const bookmarks: Bookmark[] = JSON.parse(stored);
      const filtered = bookmarks.filter(bookmark => bookmark.id !== bookmarkId);
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error("Failed to remove bookmark:", error);
    }
  },

  // Progress
  getProgress(bookId: string): Progress | null {
    try {
      const stored = localStorage.getItem(PROGRESS_KEY);
      if (!stored) return null;
      
      const allProgress: Progress[] = JSON.parse(stored);
      return allProgress.find(progress => progress.bookId === bookId) || null;
    } catch {
      return null;
    }
  },

  saveProgress(progress: Progress): void {
    try {
      const stored = localStorage.getItem(PROGRESS_KEY);
      const allProgress: Progress[] = stored ? JSON.parse(stored) : [];
      
      const existingIndex = allProgress.findIndex(p => p.bookId === progress.bookId);
      if (existingIndex >= 0) {
        allProgress[existingIndex] = progress;
      } else {
        allProgress.push(progress);
      }
      
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(allProgress));
    } catch (error) {
      console.error("Failed to save progress:", error);
    }
  },

  // Settings
  getSettings(): AccessibilitySettings {
    const defaultSettings: AccessibilitySettings = {
      highContrast: false,
      dyslexiaFont: false,
      darkMode: false,
      fontSize: 100,
      letterSpacing: 0,
      lineHeight: 100,
      saturation: 100,
      invertColors: false,
      highlightLinks: false,
      highlightFocus: false,
      readingGuide: false,
      pauseAnimations: false,
      largerCursor: false,
      readingMask: false,
      activeProfile: null,
      wordSpacing: 0,
      colorVisionMode: "none",
      captionsOn: false,
      captionPosition: "below",
      focusMode: false,
      voiceControlEnabled: false,
      bionicReading: false,
      colourOverlay: "",
      colourOverlayOpacity: 0.15,
      sessionPacingMinutes: 0,
      comprehensionCheckIns: false,
      symbolOverlay: false,
      switchAccessMode: false,
      focusShell: false,
      preferredSignLanguage: "ASL" as "BSL" | "ASL" | "AUSLAN",
      showSignAtChapterEnd: false,
    };
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (!stored) {
        return defaultSettings;
      }
      return { ...defaultSettings, ...JSON.parse(stored) };
    } catch {
      return defaultSettings;
    }
  },

  saveSettings(settings: AccessibilitySettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  },

  // Listening Stats
  getStats(): ListeningStats {
    const defaultStats: ListeningStats = {
      totalSecondsListened: 0,
      booksStarted: 0,
      booksCompleted: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastListenedDate: null,
      badges: [],
    };
    try {
      const stored = localStorage.getItem(STATS_KEY);
      if (!stored) return defaultStats;
      return { ...defaultStats, ...JSON.parse(stored) };
    } catch {
      return defaultStats;
    }
  },

  updateStats(update: Partial<ListeningStats>): void {
    try {
      const current = this.getStats();
      const newStats = { ...current, ...update };
      localStorage.setItem(STATS_KEY, JSON.stringify(newStats));
    } catch (error) {
      console.error("Failed to save stats:", error);
    }
  },

  addListeningTime(seconds: number): void {
    const stats = this.getStats();
    const today = new Date().toISOString().split("T")[0];
    let newStreak = stats.currentStreak;
    
    if (stats.lastListenedDate) {
      const lastDate = new Date(stats.lastListenedDate);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (stats.lastListenedDate === today) {
        // Same day, streak continues
      } else if (lastDate.toISOString().split("T")[0] === yesterday.toISOString().split("T")[0]) {
        // Yesterday, increment streak
        newStreak += 1;
      } else {
        // Streak broken
        newStreak = 1;
      }
    } else {
      newStreak = 1;
    }
    
    const newBadges = [...stats.badges];
    const totalHours = (stats.totalSecondsListened + seconds) / 3600;
    
    // Award badges based on milestones
    if (totalHours >= 1 && !newBadges.includes("first_hour")) newBadges.push("first_hour");
    if (totalHours >= 10 && !newBadges.includes("ten_hours")) newBadges.push("ten_hours");
    if (totalHours >= 50 && !newBadges.includes("fifty_hours")) newBadges.push("fifty_hours");
    if (totalHours >= 100 && !newBadges.includes("hundred_hours")) newBadges.push("hundred_hours");
    if (newStreak >= 7 && !newBadges.includes("week_streak")) newBadges.push("week_streak");
    if (newStreak >= 30 && !newBadges.includes("month_streak")) newBadges.push("month_streak");
    
    this.updateStats({
      totalSecondsListened: stats.totalSecondsListened + seconds,
      currentStreak: newStreak,
      longestStreak: Math.max(stats.longestStreak, newStreak),
      lastListenedDate: today,
      badges: newBadges,
    });
  },

  markBookStarted(): void {
    const stats = this.getStats();
    this.updateStats({ booksStarted: stats.booksStarted + 1 });
  },

  markBookCompleted(): void {
    const stats = this.getStats();
    const newBadges = [...stats.badges];
    const newCompleted = stats.booksCompleted + 1;
    
    if (newCompleted >= 1 && !newBadges.includes("first_book")) newBadges.push("first_book");
    if (newCompleted >= 5 && !newBadges.includes("five_books")) newBadges.push("five_books");
    if (newCompleted >= 10 && !newBadges.includes("ten_books")) newBadges.push("ten_books");
    if (newCompleted >= 25 && !newBadges.includes("twentyfive_books")) newBadges.push("twentyfive_books");
    
    this.updateStats({ 
      booksCompleted: newCompleted,
      badges: newBadges,
    });
  },

  // Collections
  getCollections(): Collection[] {
    try {
      const stored = localStorage.getItem(COLLECTIONS_KEY);
      if (!stored) return [];
      return JSON.parse(stored);
    } catch {
      return [];
    }
  },

  createCollection(name: string, icon: string): Collection {
    const collection: Collection = {
      id: crypto.randomUUID(),
      name,
      icon,
      bookIds: [],
      createdAt: new Date().toISOString(),
    };
    const collections = this.getCollections();
    collections.push(collection);
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    return collection;
  },

  addBookToCollection(collectionId: string, bookId: string): void {
    const collections = this.getCollections();
    const collection = collections.find(c => c.id === collectionId);
    if (collection && !collection.bookIds.includes(bookId)) {
      collection.bookIds.push(bookId);
      localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    }
  },

  removeBookFromCollection(collectionId: string, bookId: string): void {
    const collections = this.getCollections();
    const collection = collections.find(c => c.id === collectionId);
    if (collection) {
      collection.bookIds = collection.bookIds.filter(id => id !== bookId);
      localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    }
  },

  deleteCollection(collectionId: string): void {
    const collections = this.getCollections().filter(c => c.id !== collectionId);
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
  },
};
