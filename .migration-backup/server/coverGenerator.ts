import { generateImageBuffer } from './replit_integrations/image/client';
import { objectStorageClient, ObjectStorageService } from './replit_integrations/object_storage/objectStorage';

const PLACEHOLDER_COVER_URL = '/placeholder-cover.jpg';
const COVER_PREFIX = 'public/generated-covers';

const objectStorageService = new ObjectStorageService();

function getObjectStorageCoverPath(bookId: string): string {
  const safeId = bookId.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `/objects/${COVER_PREFIX}/${safeId}.jpg`;
}

function parsePublicBucketPath(fullPath: string): { bucketName: string; objectName: string } | null {
  const p = fullPath.startsWith('/') ? fullPath : `/${fullPath}`;
  const parts = p.split('/').filter(Boolean);
  if (parts.length < 1) return null;
  return { bucketName: parts[0], objectName: parts.slice(1).join('/') };
}

export async function hasGeneratedCover(bookId: string): Promise<boolean> {
  try {
    const safeId = bookId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const file = await objectStorageService.searchPublicObject(`${COVER_PREFIX}/${safeId}.jpg`);
    return file !== null;
  } catch {
    return false;
  }
}

export async function getGeneratedCoverUrl(bookId: string): Promise<string | null> {
  if (await hasGeneratedCover(bookId)) {
    return getObjectStorageCoverPath(bookId);
  }
  return null;
}

/**
 * List bookIds that already have a generated cover in object storage
 * (under the public/generated-covers/ prefix).
 */
export async function listGeneratedCovers(): Promise<string[]> {
  try {
    const publicSearchPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
    const firstPath = publicSearchPaths.split(',')[0]?.trim();
    if (!firstPath) return [];
    const parsed = parsePublicBucketPath(`${firstPath}/${COVER_PREFIX}/`);
    if (!parsed) return [];
    const bucket = objectStorageClient.bucket(parsed.bucketName);
    const [files] = await bucket.getFiles({ prefix: parsed.objectName });
    return files
      .map(f => f.name)
      .filter(n => n.endsWith('.jpg'))
      .map(n => {
        const base = n.split('/').pop() || '';
        return base.replace(/\.jpg$/, '');
      });
  } catch (err) {
    console.warn('[CoverGenerator] listGeneratedCovers failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export function buildCoverPrompt(title: string, author: string, genre?: string, contentType?: string): string {
  const type = contentType || 'audiobook';
  const genreText = genre ? `, ${genre} genre` : '';

  const styleMap: Record<string, string> = {
    'fiction': 'dramatic lighting, rich colors, evocative imagery',
    'non-fiction': 'clean design, professional typography, minimalist',
    'mystery': 'dark atmospheric mood, shadows, intrigue',
    'romance': 'warm soft lighting, emotional, intimate',
    'science fiction': 'futuristic, cosmic, technology elements',
    'fantasy': 'magical, ethereal, mystical elements',
    'horror': 'dark, ominous, unsettling atmosphere',
    'biography': 'elegant, dignified, portrait style',
    'history': 'vintage aesthetic, historical elements',
    'self-help': 'uplifting, bright, positive energy',
    'thriller': 'tense atmosphere, high contrast, suspenseful',
    'classic': 'timeless, elegant, literary aesthetic',
  };

  const style = genre ? (styleMap[genre.toLowerCase()] || 'professional book cover design') : 'professional book cover design';

  return `Professional ${type} cover design for "${title}" by ${author}${genreText}. ${style}. High quality book cover art, no text, abstract artistic interpretation of the book's theme, suitable for digital display, clean composition, publishing quality.`;
}

export interface CoverGenerationResult {
  bookId: string;
  title: string;
  status: 'generated' | 'skipped' | 'error';
  coverUrl?: string;
  error?: string;
}

export async function generateCoverForBook(
  bookId: string,
  title: string,
  author: string,
  genre?: string,
  contentType?: string
): Promise<CoverGenerationResult> {
  if (await hasGeneratedCover(bookId)) {
    return { bookId, title, status: 'skipped', coverUrl: getObjectStorageCoverPath(bookId) };
  }

  try {
    const prompt = buildCoverPrompt(title, author, genre, contentType);
    const imageBuffer = await generateImageBuffer(prompt, "1024x1024");

    const publicSearchPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
    const firstPath = publicSearchPaths.split(',')[0]?.trim();
    if (!firstPath) {
      console.warn(`[CoverGenerator] PUBLIC_OBJECT_SEARCH_PATHS not configured — cannot upload cover for "${title}"`);
      return {
        bookId,
        title,
        status: 'error',
        coverUrl: PLACEHOLDER_COVER_URL,
        error: 'Object storage not configured',
      };
    }

    const safeId = bookId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const fullStoragePath = `${firstPath}/${COVER_PREFIX}/${safeId}.jpg`;
    const parsed = parsePublicBucketPath(fullStoragePath);
    if (!parsed) {
      throw new Error(`Could not parse storage path: ${fullStoragePath}`);
    }

    const bucket = objectStorageClient.bucket(parsed.bucketName);
    const file = bucket.file(parsed.objectName);
    await file.save(imageBuffer, { contentType: 'image/jpeg', resumable: false });

    const coverUrl = getObjectStorageCoverPath(bookId);

    // Persist the URL on the book record so the frontend can render it
    // directly without probing for the file.
    try {
      const { storage } = await import('./storage');
      await storage.updateBook(bookId, { coverImage: coverUrl });
    } catch (err) {
      console.warn(`[CoverGenerator] Generated cover but failed to persist URL on book ${bookId}:`, err instanceof Error ? err.message : err);
    }

    return { bookId, title, status: 'generated', coverUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[CoverGenerator] Cover generation failed for "${title}" (${bookId}):`, message);
    return {
      bookId,
      title,
      status: 'error',
      coverUrl: PLACEHOLDER_COVER_URL,
      error: message,
    };
  }
}

export async function generateCoversForBooks(
  books: Array<{ id: string; title: string; author: string; genre?: string | null; contentType?: string | null; coverImage?: string | null }>,
  onProgress?: (result: CoverGenerationResult, completed: number, total: number) => void
): Promise<CoverGenerationResult[]> {
  const needsCovers: typeof books = [];
  for (const b of books) {
    if (!b.coverImage && !(await hasGeneratedCover(b.id))) {
      needsCovers.push(b);
    }
  }

  const results: CoverGenerationResult[] = [];

  for (let i = 0; i < needsCovers.length; i++) {
    const book = needsCovers[i];
    const result = await generateCoverForBook(
      book.id,
      book.title,
      book.author,
      book.genre || undefined,
      book.contentType || undefined
    );
    results.push(result);
    onProgress?.(result, i + 1, needsCovers.length);

    if (i < needsCovers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return results;
}
