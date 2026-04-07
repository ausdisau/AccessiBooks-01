import { useState } from "react";
import { Star, ThumbsUp, User, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBookReviews,
  useAggregatedRatings,
  useCreateReview,
  useToggleReviewLike,
  useFollowUser,
  useIsFollowing,
} from "@/hooks/use-reviews";
import { useAuth } from "@/hooks/useAuth";
import type { ReviewWithUser, AggregatedRatings } from "@shared/schema";
import { Link } from "wouter";

interface StarRatingProps {
  rating: number;
  onRatingChange?: (rating: number) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
}

function StarRating({ rating, onRatingChange, readonly = false, size = "md" }: StarRatingProps) {
  const sizeClass = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-6 h-6" }[size];
  
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onRatingChange?.(star)}
          className={`${readonly ? "cursor-default" : "cursor-pointer hover:scale-110 transition-transform"}`}
        >
          <Star
            className={`${sizeClass} ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300 dark:text-gray-600"}`}
          />
        </button>
      ))}
    </div>
  );
}

function RatingSourceBadge({ source }: { source: AggregatedRatings["sources"][0] }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
      <span className="text-sm font-medium">{source.name}</span>
      <StarRating rating={source.rating} readonly size="sm" />
      <span className="text-xs text-muted-foreground">({source.reviewCount})</span>
    </div>
  );
}

function AggregatedRatingsDisplay({ bookId, title, author }: { bookId: string; title: string; author: string }) {
  const { data: ratings, isLoading } = useAggregatedRatings(bookId, title, author);

  if (isLoading) {
    return (
      <div className="flex gap-2">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
    );
  }

  if (!ratings) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-3xl font-bold">{ratings.averageRating.toFixed(1)}</span>
          <StarRating rating={ratings.averageRating} readonly size="lg" />
        </div>
        <span className="text-muted-foreground">
          {ratings.totalReviews.toLocaleString()} reviews
        </span>
      </div>
      
      {ratings.sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ratings.sources.map((source) => (
            <RatingSourceBadge key={source.name} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewForm({ bookId, onSuccess }: { bookId: string; onSuccess?: () => void }) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const createReview = useCreateReview();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) return;

    await createReview.mutateAsync({ bookId, rating, title: title || undefined, content: content || undefined });
    setRating(0);
    setTitle("");
    setContent("");
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Your Rating</label>
        <StarRating rating={rating} onRatingChange={setRating} size="lg" />
      </div>
      
      <Input
        placeholder="Review title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      
      <Textarea
        placeholder="Share your thoughts about this book..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
      />
      
      <Button type="submit" disabled={rating === 0 || createReview.isPending}>
        {createReview.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Posting...
          </>
        ) : (
          "Post Review"
        )}
      </Button>
    </form>
  );
}

function ReviewCard({ review, bookId }: { review: ReviewWithUser; bookId: string }) {
  const { user: currentUser } = useAuth();
  const toggleLike = useToggleReviewLike();
  const followUser = useFollowUser();
  const { data: followStatus } = useIsFollowing(review.user.id);

  const handleLike = () => {
    toggleLike.mutate({ reviewId: review.id, bookId });
  };

  const handleFollow = () => {
    if (currentUser?.id !== review.user.id) {
      followUser.mutate(review.user.id);
    }
  };

  const displayName = review.user.firstName && review.user.lastName
    ? `${review.user.firstName} ${review.user.lastName}`
    : review.user.firstName || "Anonymous Reader";

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const timeAgo = formatTimeAgo(new Date(review.createdAt!));

  return (
    <Card className="mb-4">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={review.user.profileImageUrl || undefined} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{displayName}</span>
                {currentUser && currentUser.id !== review.user.id && !followStatus?.following && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={handleFollow}
                    disabled={followUser.isPending}
                  >
                    Follow
                  </Button>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{timeAgo}</span>
            </div>
          </div>
          <StarRating rating={review.rating} readonly size="sm" />
        </div>

        {review.title && (
          <h4 className="font-semibold mb-2">{review.title}</h4>
        )}
        
        {review.content && (
          <p className="text-muted-foreground mb-3">{review.content}</p>
        )}

        <div className="flex items-center gap-4 text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLike}
            disabled={toggleLike.isPending}
            className={review.isLiked ? "text-primary" : ""}
          >
            <ThumbsUp className={`h-4 w-4 mr-1 ${review.isLiked ? "fill-current" : ""}`} />
            Helpful ({review.likesCount})
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  return date.toLocaleDateString();
}

interface BookReviewsProps {
  bookId: string;
  title: string;
  author: string;
  onViewAuthor?: (authorName: string) => void;
}

export function BookReviews({ bookId, title, author, onViewAuthor }: BookReviewsProps) {
  const { user } = useAuth();
  const { data: reviews, isLoading } = useBookReviews(bookId);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6" data-testid="book-reviews">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Reviews & Ratings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AggregatedRatingsDisplay bookId={bookId} title={title} author={author} />
        </CardContent>
      </Card>

      {user && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Write a Review</CardTitle>
          </CardHeader>
          <CardContent>
            {showForm ? (
              <ReviewForm bookId={bookId} onSuccess={() => setShowForm(false)} />
            ) : (
              <Button onClick={() => setShowForm(true)}>
                <Star className="mr-2 h-4 w-4" />
                Rate this book
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Community Reviews</span>
            <span className="text-sm font-normal text-muted-foreground">
              {reviews?.length || 0} reviews
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ))}
            </div>
          ) : reviews?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No reviews yet. Be the first to share your thoughts!</p>
            </div>
          ) : (
            <div>
              {reviews?.map((review) => (
                <ReviewCard key={review.id} review={review} bookId={bookId} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-center">
        <Button variant="outline" onClick={() => onViewAuthor?.(author)}>
          View more by {author}
        </Button>
      </div>
    </div>
  );
}

export { StarRating, AggregatedRatingsDisplay, ReviewCard };
