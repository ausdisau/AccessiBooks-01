const SERPAPI_BASE = "https://serpapi.com/search.json";

const { SERPAPI_API_KEY } = process.env;

const googlePlayEnabled = !!SERPAPI_API_KEY;

if (googlePlayEnabled) {
  console.log("Google Play Audiobooks integration initialized (via SerpApi)");
} else {
  console.log("Google Play Audiobooks not configured - missing SERPAPI_API_KEY");
}

export interface GooglePlayAudiobook {
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
}

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

export async function searchGooglePlayAudiobooks(
  query: string,
  limit: number = 20
): Promise<GooglePlayAudiobook[]> {
  if (!googlePlayEnabled) return [];

  try {
    const data = await serpApiRequest({
      engine: "google_play_books",
      q: query,
      hl: "en",
      gl: "us",
    });

    const results: GooglePlayAudiobook[] = [];
    const organicResults = data.organic_results || [];

    for (const section of organicResults) {
      const sectionTitle = (section.title || "").toLowerCase();
      const isAudiobookSection = sectionTitle.includes("audiobook") || sectionTitle === "";
      const items = section.items || [];

      for (const item of items) {
        if (results.length >= limit) break;
        const isAudiobook = isAudiobookSection ||
          (item.link && item.link.includes("/audiobooks/")) ||
          (item.category && item.category.toLowerCase().includes("audio"));

        if (!isAudiobook) continue;

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
          link: item.link || `https://play.google.com/store/audiobooks/details?id=${item.product_id}`,
          source: "google_play",
        });
      }
    }

    if (results.length === 0) {
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
            link: item.link || `https://play.google.com/store/books/details?id=${item.product_id}`,
            source: "google_play",
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

export async function getGooglePlayAudiobook(
  productId: string
): Promise<GooglePlayAudiobook | null> {
  if (!googlePlayEnabled) return null;

  try {
    const data = await serpApiRequest({
      engine: "google_play_product",
      store: "audiobooks",
      product_id: productId,
      hl: "en",
      gl: "us",
    });

    const info = data.product_info;
    if (!info) return null;

    const authors = info.authors?.map((a: any) => a.name) || [];
    const narrator = info.extensions?.find((e: string) => e.startsWith("Narrated by"))?.replace("Narrated by ", "") || undefined;
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
      duration: info.unabridged || undefined,
      narrator,
      released: info.released || undefined,
      description: data.about_this_audiobook?.snippet || undefined,
      categories: data.categories?.map((c: any) => c.name) || [],
      link: info.book_link?.link || `https://play.google.com/store/audiobooks/details?id=${productId}`,
      source: "google_play",
    };
  } catch (error) {
    console.error("Google Play product error:", error);
    return null;
  }
}

export async function getGooglePlaySimilar(
  productId: string,
  limit: number = 10
): Promise<GooglePlayAudiobook[]> {
  if (!googlePlayEnabled) return [];

  try {
    const data = await serpApiRequest({
      engine: "google_play_product",
      store: "audiobooks",
      product_id: productId,
      hl: "en",
      gl: "us",
    });

    const results: GooglePlayAudiobook[] = [];
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
          link: item.link || `https://play.google.com/store/audiobooks/details?id=${item.product_id}`,
          source: "google_play",
        });
      }
    }

    return results;
  } catch (error) {
    console.error("Google Play similar error:", error);
    return [];
  }
}
