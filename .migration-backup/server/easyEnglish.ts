import OpenAI from "openai";
import { db } from "./db";
import { easyEnglishCache, easyEnglishUsage, users, FREE_EASY_ENGLISH_MONTHLY_ALLOWANCE } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { stripe } from "./stripe";

const WORDS_PER_PAGE = 300;

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const EASY_ENGLISH_SYSTEM_PROMPT = `You are an Easy English writer. Convert the given text into Easy English. Easy English uses:
- Short sentences (max 15 words each)
- Simple, common words (avoid jargon, technical words, or complex vocabulary)
- Active voice
- One idea per sentence
- Concrete, specific language instead of abstract concepts
- Present tense where possible
- Direct address (you/we) where appropriate

Keep all the original meaning and information. Do not add new information. Return only the converted text, no explanations.`;

function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function getCachedConversion(bookId: string, chapterNumber: number, originalText: string): Promise<string | null> {
  const rows = await db.select()
    .from(easyEnglishCache)
    .where(and(
      eq(easyEnglishCache.bookId, bookId),
      eq(easyEnglishCache.chapterNumber, chapterNumber),
    ))
    .limit(1);

  if (rows.length > 0) {
    return rows[0].convertedText;
  }

  return null;
}

export async function convertToEasyEnglish(bookId: string, chapterNumber: number, originalText: string): Promise<string> {
  const cached = await getCachedConversion(bookId, chapterNumber, originalText);
  if (cached) {
    return cached;
  }

  const textToConvert = originalText.slice(0, 12000);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: EASY_ENGLISH_SYSTEM_PROMPT },
      { role: "user", content: textToConvert },
    ],
    max_tokens: 4000,
  });

  const convertedText = response.choices[0]?.message?.content || originalText;

  await db.insert(easyEnglishCache).values({
    bookId,
    chapterNumber,
    originalText: textToConvert,
    convertedText,
  }).onConflictDoNothing();

  return convertedText;
}

export async function getUserEasyEnglishUsage(userId: string): Promise<{ chaptersConverted: number; yearMonth: string }> {
  const yearMonth = getCurrentYearMonth();
  const rows = await db.select()
    .from(easyEnglishUsage)
    .where(and(
      eq(easyEnglishUsage.userId, userId),
      eq(easyEnglishUsage.yearMonth, yearMonth),
    ))
    .limit(1);

  if (rows.length > 0) {
    return { chaptersConverted: rows[0].chaptersConverted, yearMonth };
  }

  return { chaptersConverted: 0, yearMonth };
}

export async function incrementUserUsage(userId: string): Promise<void> {
  const yearMonth = getCurrentYearMonth();
  const existing = await db.select()
    .from(easyEnglishUsage)
    .where(and(
      eq(easyEnglishUsage.userId, userId),
      eq(easyEnglishUsage.yearMonth, yearMonth),
    ))
    .limit(1);

  if (existing.length > 0) {
    await db.update(easyEnglishUsage)
      .set({ chaptersConverted: existing[0].chaptersConverted + 1 })
      .where(and(
        eq(easyEnglishUsage.userId, userId),
        eq(easyEnglishUsage.yearMonth, yearMonth),
      ));
  } else {
    await db.insert(easyEnglishUsage).values({
      userId,
      yearMonth,
      chaptersConverted: 1,
    });
  }
}

export async function reportStripeUsage(stripeCustomerId: string): Promise<void> {
  if (!stripe) {
    console.warn("[EasyEnglish] Stripe not configured - skipping usage report");
    return;
  }

  const meterEventName = process.env.STRIPE_EASY_ENGLISH_METER_EVENT || "easy_english_chapter_conversion";

  try {
    await stripe.billing.meterEvents.create({
      event_name: meterEventName,
      payload: {
        stripe_customer_id: stripeCustomerId,
        value: "1",
      },
      identifier: `ee_${stripeCustomerId}_${Date.now()}`,
    });
    console.log(`[EasyEnglish] Reported usage meter event for customer ${stripeCustomerId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[EasyEnglish] Failed to report Stripe usage:", msg);
  }
}

export async function fetchCanonicalPageText(bookId: string, pageNumber: number, baseUrl: string): Promise<string | null> {
  try {
    const response = await fetch(`${baseUrl}/api/ebook/${bookId}/content`);
    if (!response.ok) return null;
    const fullText = await response.text();
    const allWords = fullText.split(/\s+/).filter(Boolean);
    const startIdx = (pageNumber - 1) * WORDS_PER_PAGE;
    const endIdx = startIdx + WORDS_PER_PAGE;
    const pageWords = allWords.slice(startIdx, endIdx);
    if (pageWords.length === 0) return null;
    return pageWords.join(" ");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[EasyEnglish] Failed to fetch canonical page text:", msg);
    return null;
  }
}

export async function getUserEasyEnglishStatus(userId: string): Promise<{
  freeChaptersRemaining: number | null;
  hasAddonSubscription: boolean;
  chaptersConvertedThisMonth: number;
  monthlyAllowance: number;
}> {
  const user = await db.select({ stripeEasyEnglishSubscriptionItemId: users.stripeEasyEnglishSubscriptionItemId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const hasAddonSubscription = !!(user[0]?.stripeEasyEnglishSubscriptionItemId);
  const { chaptersConverted } = await getUserEasyEnglishUsage(userId);

  // null = unlimited (paid subscriber); finite number = remaining free allowance
  const freeChaptersRemaining = hasAddonSubscription
    ? null
    : Math.max(0, FREE_EASY_ENGLISH_MONTHLY_ALLOWANCE - chaptersConverted);

  return {
    freeChaptersRemaining,
    hasAddonSubscription,
    chaptersConvertedThisMonth: chaptersConverted,
    monthlyAllowance: FREE_EASY_ENGLISH_MONTHLY_ALLOWANCE,
  };
}
