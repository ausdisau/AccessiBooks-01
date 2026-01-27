import fs from 'fs';
import path from 'path';

const GENERATED_COVERS_DIR = path.join(process.cwd(), 'client', 'public', 'generated-covers');

export function ensureCoversDir() {
  if (!fs.existsSync(GENERATED_COVERS_DIR)) {
    fs.mkdirSync(GENERATED_COVERS_DIR, { recursive: true });
  }
}

export function getGeneratedCoverPath(bookId: string): string {
  const safeId = bookId.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `/generated-covers/${safeId}.png`;
}

export function hasGeneratedCover(bookId: string): boolean {
  const safeId = bookId.replace(/[^a-zA-Z0-9-_]/g, '_');
  const filePath = path.join(GENERATED_COVERS_DIR, `${safeId}.png`);
  return fs.existsSync(filePath);
}

export function getGeneratedCoverUrl(bookId: string): string | null {
  if (hasGeneratedCover(bookId)) {
    return getGeneratedCoverPath(bookId);
  }
  return null;
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

export interface PendingCover {
  bookId: string;
  title: string;
  author: string;
  genre?: string;
  contentType?: string;
  prompt: string;
  outputPath: string;
}

const pendingCovers: Map<string, PendingCover> = new Map();

export function queueCoverGeneration(
  bookId: string,
  title: string,
  author: string,
  genre?: string,
  contentType?: string
): PendingCover | null {
  if (hasGeneratedCover(bookId)) {
    return null;
  }
  
  const safeId = bookId.replace(/[^a-zA-Z0-9-_]/g, '_');
  const outputPath = `client/public/generated-covers/${safeId}.png`;
  const prompt = buildCoverPrompt(title, author, genre, contentType);
  
  const pending: PendingCover = {
    bookId,
    title,
    author,
    genre,
    contentType,
    prompt,
    outputPath
  };
  
  pendingCovers.set(bookId, pending);
  return pending;
}

export function getPendingCovers(): PendingCover[] {
  return Array.from(pendingCovers.values());
}

export function markCoverGenerated(bookId: string): void {
  pendingCovers.delete(bookId);
}

export function listGeneratedCovers(): string[] {
  ensureCoversDir();
  try {
    return fs.readdirSync(GENERATED_COVERS_DIR)
      .filter(f => f.endsWith('.png'))
      .map(f => f.replace('.png', ''));
  } catch {
    return [];
  }
}
