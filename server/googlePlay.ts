const SERPAPI_BASE = "https://serpapi.com/search.json";

const { SERPAPI_API_KEY } = process.env;

const googlePlayEnabled = !!SERPAPI_API_KEY;

if (googlePlayEnabled) {
  console.log("Google Play Books integration initialized (via SerpApi)");
} else {
  console.log("Google Play Books not configured - missing SERPAPI_API_KEY");
}

export interface GooglePlayBook {
  productId: string;
  title: string;
  authors: string[];
  coverUrl: string;
  rating?: number;
  reviewCount?: number;
  price?: string;
  originalPrice?: string;
  extractedPrice?: number;
  duration?: string;
  narrator?: string;
  released?: string;
  description?: string;
  categories?: string[];
  link: string;
  source: "google_play";
  type: "ebook" | "audiobook";
}

export type GooglePlayAudiobook = GooglePlayBook;

export function isGooglePlayEnabled(): boolean {
  return googlePlayEnabled;
}

async function serpApiRequest(params: Record<string, string>): Promise<any> {
  if (!SERPAPI_API_KEY) {
    throw new Error("SerpApi API key not configured");
  }

  const url = new URL(SERPAPI_BASE);
  url.searchParams.set("api_key", SERPAPI_API_KEY);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SerpApi request failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function searchGooglePlay(
  query: string,
  type: "ebook" | "audiobook" = "audiobook",
  limit: number = 20
): Promise<GooglePlayBook[]> {
  if (!googlePlayEnabled) return [];

  const urlSegment = type === "ebook" ? "/books/" : "/audiobooks/";
  const categoryKeywords = type === "ebook"
    ? ["ebook", "book", ""]
    : ["audiobook", "audio", ""];

  try {
    const data = await serpApiRequest({
      engine: "google_play_books",
      q: query,
      hl: "en",
      gl: "us",
    });

    const results: GooglePlayBook[] = [];
    const organicResults = data.organic_results || [];

    for (const section of organicResults) {
      const sectionTitle = (section.title || "").toLowerCase();
      const isMatchingSection = type === "audiobook"
        ? (sectionTitle.includes("audiobook") || sectionTitle === "")
        : (!sectionTitle.includes("audiobook") || sectionTitle === "");
      const items = section.items || [];

      for (const item of items) {
        if (results.length >= limit) break;

        const isMatchingType = type === "audiobook"
          ? (isMatchingSection ||
            (item.link && item.link.includes("/audiobooks/")) ||
            (item.category && item.category.toLowerCase().includes("audio")))
          : (isMatchingSection ||
            (item.link && item.link.includes("/books/") && !item.link.includes("/audiobooks/")) ||
            (item.category && !item.category.toLowerCase().includes("audio")));

        if (!isMatchingType) continue;

        const store = type === "ebook" ? "books" : "audiobooks";

        results.push({
          productId: item.product_id || "",
          title: item.title || "Untitled",
          authors: item.author ? [item.author] : [],
          coverUrl: item.thumbnail || "",
          rating: item.rating ?? undefined,
          price: item.price || (item.extracted_price ? `$${item.extracted_price}` : undefined),
          originalPrice: item.original_price || undefined,
          extractedPrice: item.extracted_price ?? undefined,
          categories: item.category ? [item.category] : [],
          link: item.link || `https://play.google.com/store/${store}/details?id=${item.product_id}`,
          source: "google_play",
          type,
        });
      }
    }

    if (results.length === 0) {
      const store = type === "ebook" ? "books" : "audiobooks";
      for (const section of organicResults) {
        for (const item of (section.items || [])) {
          if (results.length >= limit) break;
          results.push({
            productId: item.product_id || "",
            title: item.title || "Untitled",
            authors: item.author ? [item.author] : [],
            coverUrl: item.thumbnail || "",
            rating: item.rating ?? undefined,
            price: item.price || (item.extracted_price ? `$${item.extracted_price}` : undefined),
            originalPrice: item.original_price || undefined,
            extractedPrice: item.extracted_price ?? undefined,
            categories: item.category ? [item.category] : [],
            link: item.link || `https://play.google.com/store/${store}/details?id=${item.product_id}`,
            source: "google_play",
            type,
          });
        }
      }
    }

    return results;
  } catch (error) {
    console.error("Google Play search error:", error);
    return [];
  }
}

export async function searchGooglePlayAudiobooks(
  query: string,
  limit: number = 20
): Promise<GooglePlayBook[]> {
  return searchGooglePlay(query, "audiobook", limit);
}

export async function searchGooglePlayEbooks(
  query: string,
  limit: number = 20
): Promise<GooglePlayBook[]> {
  return searchGooglePlay(query, "ebook", limit);
}

export async function getGooglePlayBook(
  productId: string,
  store: "books" | "audiobooks" = "audiobooks"
): Promise<GooglePlayBook | null> {
  if (!googlePlayEnabled) return null;

  const type: "ebook" | "audiobook" = store === "books" ? "ebook" : "audiobook";
  const aboutKey = store === "books" ? "about_this_book" : "about_this_audiobook";

  try {
    const data = await serpApiRequest({
      engine: "google_play_product",
      store,
      product_id: productId,
      hl: "en",
      gl: "us",
    });

    const info = data.product_info;
    if (!info) return null;

    const authors = info.authors?.map((a: any) => a.name) || [];
    const narrator = store === "audiobooks"
      ? (info.extensions?.find((e: string) => e.startsWith("Narrated by"))?.replace("Narrated by ", "") || undefined)
      : undefined;
    const offer = info.offers?.[0];

    return {
      productId,
      title: info.title || "Untitled",
      authors,
      coverUrl: info.thumbnail || "",
      rating: info.rating ?? undefined,
      reviewCount: info.reviews ?? undefined,
      price: offer?.price ?? undefined,
      originalPrice: offer?.original_price ?? undefined,
      extractedPrice: offer?.extracted_price ?? undefined,
      duration: store === "audiobooks" ? (info.unabridged || undefined) : undefined,
      narrator,
      released: info.released || undefined,
      description: data[aboutKey]?.snippet || data.about_this_audiobook?.snippet || data.about_this_book?.snippet || undefined,
      categories: data.categories?.map((c: any) => c.name) || [],
      link: info.book_link?.link || `https://play.google.com/store/${store}/details?id=${productId}`,
      source: "google_play",
      type,
    };
  } catch (error) {
    console.error("Google Play product error:", error);
    return null;
  }
}

export async function getGooglePlayAudiobook(
  productId: string
): Promise<GooglePlayBook | null> {
  return getGooglePlayBook(productId, "audiobooks");
}

export async function getGooglePlayEbook(
  productId: string
): Promise<GooglePlayBook | null> {
  return getGooglePlayBook(productId, "books");
}

export async function getGooglePlaySimilar(
  productId: string,
  limit: number = 10,
  store: "books" | "audiobooks" = "audiobooks"
): Promise<GooglePlayBook[]> {
  if (!googlePlayEnabled) return [];

  const type: "ebook" | "audiobook" = store === "books" ? "ebook" : "audiobook";

  try {
    const data = await serpApiRequest({
      engine: "google_play_product",
      store,
      product_id: productId,
      hl: "en",
      gl: "us",
    });

    const results: GooglePlayBook[] = [];
    const similarSections = data.similar_results || [];

    for (const section of similarSections) {
      for (const item of (section.items || [])) {
        if (results.length >= limit) break;
        results.push({
          productId: item.product_id || "",
          title: item.title || "Untitled",
          authors: item.extension?.filter((e: string) => !["Science fiction & fantasy", "Mystery & thrillers", "Fiction", "Nonfiction", "Romance", "Biography & autobiography"].some(g => e.includes(g))) || [],
          coverUrl: item.thumbnail || "",
          rating: item.rating ?? undefined,
          price: item.price ?? undefined,
          originalPrice: item.original_price ?? undefined,
          extractedPrice: item.extracted_price ?? undefined,
          link: item.link || `https://play.google.com/store/${store}/details?id=${item.product_id}`,
          source: "google_play",
          type,
        });
      }
    }

    return results;
  } catch (error) {
    console.error("Google Play similar error:", error);
    return [];
  }
}
