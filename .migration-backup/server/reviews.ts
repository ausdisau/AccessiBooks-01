import { db } from "./db";
import { reviews, reviewLikes, userFollows, externalRatings, authors } from "@shared/schema";
import type { Review, InsertReview, ReviewWithUser, AggregatedRatings, Author } from "@shared/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

const GOOGLE_BOOKS_API_BASE = "https://www.googleapis.com/books/v1";
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";
const OPEN_LIBRARY_API_BASE = "https://openlibrary.org";
const ITUNES_SEARCH_API_BASE = "https://itunes.apple.com";

async function fetchWithTimeout(url: string, timeout = 5000): Promise<Response> {
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

export async function createReview(data: InsertReview): Promise<Review> {
  const [review] = await db.insert(reviews).values(data).returning();
  return review;
}

export async function updateReview(id: string, userId: string, data: Partial<InsertReview>): Promise<Review | null> {
  const [review] = await db
    .update(reviews)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(reviews.id, id), eq(reviews.userId, userId)))
    .returning();
  return review || null;
}

export async function deleteReview(id: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(reviews)
    .where(and(eq(reviews.id, id), eq(reviews.userId, userId)))
    .returning();
  return result.length > 0;
}

export async function getReviewsByBook(bookId: string, currentUserId?: string): Promise<ReviewWithUser[]> {
  const bookReviews = await db
    .select({
      review: reviews,
      userId: sql<string>`users.id`,
      firstName: sql<string | null>`users.first_name`,
      lastName: sql<string | null>`users.last_name`,
      profileImageUrl: sql<string | null>`users.profile_image_url`,
    })
    .from(reviews)
    .innerJoin(sql`users`, sql`users.id = ${reviews.userId}`)
    .where(eq(reviews.bookId, bookId))
    .orderBy(desc(reviews.createdAt));

  const reviewIds = bookReviews.map(r => r.review.id);
  
  const likeCounts = reviewIds.length > 0 
    ? await db
        .select({
          reviewId: reviewLikes.reviewId,
          count: sql<number>`count(*)::int`,
        })
        .from(reviewLikes)
        .where(inArray(reviewLikes.reviewId, reviewIds))
        .groupBy(reviewLikes.reviewId)
    : [];

  const likeCountMap = new Map(likeCounts.map(l => [l.reviewId, l.count]));

  let userLikes: Set<string> = new Set();
  if (currentUserId && reviewIds.length > 0) {
    const likes = await db
      .select({ reviewId: reviewLikes.reviewId })
      .from(reviewLikes)
      .where(and(
        eq(reviewLikes.userId, currentUserId),
        inArray(reviewLikes.reviewId, reviewIds)
      ));
    userLikes = new Set(likes.map(l => l.reviewId));
  }

  return bookReviews.map(r => ({
    ...r.review,
    user: {
      id: r.userId,
      firstName: r.firstName,
      lastName: r.lastName,
      profileImageUrl: r.profileImageUrl,
    },
    likesCount: likeCountMap.get(r.review.id) || 0,
    isLiked: userLikes.has(r.review.id),
  }));
}

export async function getReviewsByUser(userId: string): Promise<Review[]> {
  return db.select().from(reviews).where(eq(reviews.userId, userId)).orderBy(desc(reviews.createdAt));
}

export async function toggleReviewLike(reviewId: string, userId: string): Promise<boolean> {
  const existing = await db
    .select()
    .from(reviewLikes)
    .where(and(eq(reviewLikes.reviewId, reviewId), eq(reviewLikes.userId, userId)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(reviewLikes)
      .where(and(eq(reviewLikes.reviewId, reviewId), eq(reviewLikes.userId, userId)));
    return false;
  } else {
    await db.insert(reviewLikes).values({ reviewId, userId });
    return true;
  }
}

export async function followUser(followerId: string, followingId: string): Promise<boolean> {
  if (followerId === followingId) return false;
  
  const existing = await db
    .select()
    .from(userFollows)
    .where(and(eq(userFollows.followerId, followerId), eq(userFollows.followingId, followingId)))
    .limit(1);

  if (existing.length > 0) return true;

  await db.insert(userFollows).values({ followerId, followingId });
  return true;
}

export async function unfollowUser(followerId: string, followingId: string): Promise<boolean> {
  const result = await db
    .delete(userFollows)
    .where(and(eq(userFollows.followerId, followerId), eq(userFollows.followingId, followingId)))
    .returning();
  return result.length > 0;
}

export async function getFollowers(userId: string): Promise<string[]> {
  const followers = await db
    .select({ followerId: userFollows.followerId })
    .from(userFollows)
    .where(eq(userFollows.followingId, userId));
  return followers.map(f => f.followerId);
}

export async function getFollowing(userId: string): Promise<string[]> {
  const following = await db
    .select({ followingId: userFollows.followingId })
    .from(userFollows)
    .where(eq(userFollows.followerId, userId));
  return following.map(f => f.followingId);
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const result = await db
    .select()
    .from(userFollows)
    .where(and(eq(userFollows.followerId, followerId), eq(userFollows.followingId, followingId)))
    .limit(1);
  return result.length > 0;
}

export async function getSocialFeed(userId: string, limit = 20): Promise<ReviewWithUser[]> {
  const following = await getFollowing(userId);
  if (following.length === 0) return [];

  const feedReviews = await db
    .select({
      review: reviews,
      userId: sql<string>`users.id`,
      firstName: sql<string | null>`users.first_name`,
      lastName: sql<string | null>`users.last_name`,
      profileImageUrl: sql<string | null>`users.profile_image_url`,
    })
    .from(reviews)
    .innerJoin(sql`users`, sql`users.id = ${reviews.userId}`)
    .where(inArray(reviews.userId, following))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);

  const reviewIds = feedReviews.map(r => r.review.id);
  
  const likeCounts = reviewIds.length > 0
    ? await db
        .select({
          reviewId: reviewLikes.reviewId,
          count: sql<number>`count(*)::int`,
        })
        .from(reviewLikes)
        .where(inArray(reviewLikes.reviewId, reviewIds))
        .groupBy(reviewLikes.reviewId)
    : [];

  const likeCountMap = new Map(likeCounts.map(l => [l.reviewId, l.count]));

  const userLikes = reviewIds.length > 0
    ? await db
        .select({ reviewId: reviewLikes.reviewId })
        .from(reviewLikes)
        .where(and(
          eq(reviewLikes.userId, userId),
          inArray(reviewLikes.reviewId, reviewIds)
        ))
    : [];
  const userLikesSet = new Set(userLikes.map(l => l.reviewId));

  return feedReviews.map(r => ({
    ...r.review,
    user: {
      id: r.userId,
      firstName: r.firstName,
      lastName: r.lastName,
      profileImageUrl: r.profileImageUrl,
    },
    likesCount: likeCountMap.get(r.review.id) || 0,
    isLiked: userLikesSet.has(r.review.id),
  }));
}

async function fetchGoogleBooksRating(title: string, author: string): Promise<{ rating: number; count: number } | null> {
  try {
    const query = encodeURIComponent(`${title} ${author}`);
    const url = `${GOOGLE_BOOKS_API_BASE}/volumes?q=${query}&maxResults=1${GOOGLE_BOOKS_API_KEY ? `&key=${GOOGLE_BOOKS_API_KEY}` : ''}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.items?.[0]?.volumeInfo) return null;
    
    const info = data.items[0].volumeInfo;
    if (!info.averageRating) return null;
    
    return {
      rating: info.averageRating,
      count: info.ratingsCount || 0,
    };
  } catch (error) {
    console.warn("Error fetching Google Books rating:", error);
    return null;
  }
}

async function fetchiTunesRating(title: string, author: string): Promise<{ rating: number; count: number } | null> {
  try {
    const query = encodeURIComponent(`${title} ${author}`);
    const url = `${ITUNES_SEARCH_API_BASE}/search?term=${query}&entity=audiobook&limit=1`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results?.[0]) return null;
    
    const item = data.results[0];
    if (!item.averageUserRating) return null;
    
    return {
      rating: item.averageUserRating,
      count: item.userRatingCount || 0,
    };
  } catch (error) {
    console.warn("Error fetching iTunes rating:", error);
    return null;
  }
}

export async function getAggregatedRatings(bookId: string, title: string, author: string): Promise<AggregatedRatings> {
  const userReviews = await db
    .select({ rating: reviews.rating })
    .from(reviews)
    .where(eq(reviews.bookId, bookId));

  const userAvg = userReviews.length > 0
    ? userReviews.reduce((sum, r) => sum + r.rating, 0) / userReviews.length
    : undefined;

  const [googleRating, itunesRating] = await Promise.all([
    fetchGoogleBooksRating(title, author),
    fetchiTunesRating(title, author),
  ]);

  const sources: AggregatedRatings['sources'] = [];
  let totalWeight = 0;
  let weightedSum = 0;
  let totalReviews = userReviews.length;

  if (userReviews.length > 0 && userAvg !== undefined) {
    sources.push({ name: "AccessiBooks", rating: userAvg, reviewCount: userReviews.length });
    weightedSum += userAvg * userReviews.length;
    totalWeight += userReviews.length;
  }

  if (googleRating) {
    sources.push({ name: "Google Books", rating: googleRating.rating, reviewCount: googleRating.count });
    weightedSum += googleRating.rating * googleRating.count;
    totalWeight += googleRating.count;
    totalReviews += googleRating.count;
  }

  if (itunesRating) {
    sources.push({ name: "Apple Books", rating: itunesRating.rating, reviewCount: itunesRating.count });
    weightedSum += itunesRating.rating * itunesRating.count;
    totalWeight += itunesRating.count;
    totalReviews += itunesRating.count;
  }

  const averageRating = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return {
    averageRating: Math.round(averageRating * 10) / 10,
    totalReviews,
    userRating: userAvg ? Math.round(userAvg * 10) / 10 : undefined,
    sources,
  };
}

export async function getAuthorByName(authorName: string): Promise<Author | null> {
  const [cachedAuthor] = await db
    .select()
    .from(authors)
    .where(eq(authors.name, authorName))
    .limit(1);

  if (cachedAuthor) {
    const hoursSinceUpdate = (Date.now() - new Date(cachedAuthor.lastUpdated!).getTime()) / (1000 * 60 * 60);
    if (hoursSinceUpdate < 24) {
      return cachedAuthor;
    }
  }

  try {
    const searchUrl = `${OPEN_LIBRARY_API_BASE}/search/authors.json?q=${encodeURIComponent(authorName)}&limit=1`;
    const searchResponse = await fetchWithTimeout(searchUrl);
    if (!searchResponse.ok) return cachedAuthor || null;

    const searchData = await searchResponse.json();
    if (!searchData.docs?.[0]) return cachedAuthor || null;

    const authorKey = searchData.docs[0].key;
    const authorUrl = `${OPEN_LIBRARY_API_BASE}/authors/${authorKey}.json`;
    const authorResponse = await fetchWithTimeout(authorUrl);
    if (!authorResponse.ok) return cachedAuthor || null;

    const authorData = await authorResponse.json();

    const photoUrl = authorData.photos?.[0]
      ? `https://covers.openlibrary.org/a/id/${authorData.photos[0]}-M.jpg`
      : null;

    const bio = typeof authorData.bio === 'string' 
      ? authorData.bio 
      : authorData.bio?.value || null;

    const authorRecord: Partial<Author> = {
      name: authorData.name || authorName,
      bio,
      birthDate: authorData.birth_date || null,
      deathDate: authorData.death_date || null,
      photoUrl,
      openLibraryKey: authorKey,
      wikipedia: authorData.wikipedia || null,
      lastUpdated: new Date(),
    };

    if (cachedAuthor) {
      const [updated] = await db
        .update(authors)
        .set(authorRecord)
        .where(eq(authors.id, cachedAuthor.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db.insert(authors).values(authorRecord as any).returning();
      return inserted;
    }
  } catch (error) {
    console.warn("Error fetching author from Open Library:", error);
    return cachedAuthor || null;
  }
}

export async function getAuthorWorks(authorKey: string, limit = 20): Promise<any[]> {
  try {
    const url = `${OPEN_LIBRARY_API_BASE}/authors/${authorKey}/works.json?limit=${limit}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return [];

    const data = await response.json();
    return (data.entries || []).map((work: any) => ({
      key: work.key,
      title: work.title,
      firstPublishYear: work.first_publish_year,
      coverId: work.covers?.[0],
      coverUrl: work.covers?.[0] 
        ? `https://covers.openlibrary.org/b/id/${work.covers[0]}-M.jpg`
        : null,
    }));
  } catch (error) {
    console.warn("Error fetching author works:", error);
    return [];
  }
}
