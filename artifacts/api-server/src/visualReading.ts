import OpenAI from "openai";
import { db } from "./db";
import { bookVisuals } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const WORDS_PER_PAGE = 300;
const PAGES_PER_SCENE = 3;

interface SceneDescription {
  sceneIndex: number;
  pageStart: number;
  pageEnd: number;
  description: string;
  videoPrompt: string;
}

export async function extractScenes(bookText: string, bookTitle: string, bookGenre?: string): Promise<SceneDescription[]> {
  const words = bookText.split(/\s+/).filter(w => w.length > 0);
  const totalPages = Math.ceil(words.length / WORDS_PER_PAGE);
  const scenes: SceneDescription[] = [];
  const numScenes = Math.ceil(totalPages / PAGES_PER_SCENE);
  const maxScenes = Math.min(numScenes, 20);

  for (let i = 0; i < maxScenes; i++) {
    const pageStart = i * PAGES_PER_SCENE + 1;
    const pageEnd = Math.min((i + 1) * PAGES_PER_SCENE, totalPages);
    const wordStart = (pageStart - 1) * WORDS_PER_PAGE;
    const wordEnd = Math.min(pageEnd * WORDS_PER_PAGE, words.length);
    const passage = words.slice(wordStart, wordEnd).join(" ");

    if (passage.length < 50) continue;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a visual scene director. Given a passage from the book "${bookTitle}"${bookGenre ? ` (genre: ${bookGenre})` : ""}, extract the dominant visual scene. Return JSON with:
- "description": A brief 10-15 word summary of the scene
- "videoPrompt": A detailed 30-50 word cinematic prompt for AI video generation describing the visual scene, mood, lighting, camera angle, and atmosphere. Focus on landscapes, environments, objects, and atmosphere. Do not include text overlays or people's faces.`
          },
          {
            role: "user",
            content: passage.substring(0, 2000)
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        scenes.push({
          sceneIndex: i,
          pageStart,
          pageEnd,
          description: parsed.description || `Scene ${i + 1}`,
          videoPrompt: parsed.videoPrompt || parsed.description || `Scene from ${bookTitle}`,
        });
      }
    } catch (err: any) {
      console.warn(`[VisualReading] Failed to extract scene ${i} for "${bookTitle}":`, err.message);
      scenes.push({
        sceneIndex: i,
        pageStart,
        pageEnd,
        description: `Scene ${i + 1} from ${bookTitle}`,
        videoPrompt: `Cinematic atmospheric scene from a ${bookGenre || "literary"} book, soft lighting, ambient mood, slow camera pan`,
      });
    }
  }

  return scenes;
}

export async function saveScenesToDB(bookId: string, scenes: SceneDescription[]): Promise<void> {
  for (const scene of scenes) {
    await db.insert(bookVisuals).values({
      bookId,
      sceneIndex: scene.sceneIndex,
      pageStart: scene.pageStart,
      pageEnd: scene.pageEnd,
      sceneDescription: scene.description,
      videoPrompt: scene.videoPrompt,
      status: "pending",
    }).onConflictDoNothing();
  }
}

export async function getBookVisuals(bookId: string) {
  return db.select().from(bookVisuals)
    .where(eq(bookVisuals.bookId, bookId))
    .orderBy(asc(bookVisuals.sceneIndex));
}

export async function updateVisualVideo(id: string, videoUrl: string) {
  await db.update(bookVisuals)
    .set({ videoUrl, status: "ready" })
    .where(eq(bookVisuals.id, id));
}

export async function getVisualForPage(bookId: string, page: number) {
  const visuals = await getBookVisuals(bookId);
  return visuals.find(v => page >= v.pageStart && page <= v.pageEnd) || null;
}
