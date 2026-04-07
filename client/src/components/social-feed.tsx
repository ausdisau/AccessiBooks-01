import { Star, ThumbsUp, BookOpen, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSocialFeed, useToggleReviewLike } from "@/hooks/use-reviews";
import { StarRating } from "@/components/book-reviews";
import { Link } from "wouter";
import type { ReviewWithUser } from "@shared/schema";

function FeedReviewCard({ review }: { review: ReviewWithUser & { bookTitle?: string } }) {
  const toggleLike = useToggleReviewLike();

  const handleLike = () => {
    toggleLike.mutate({ reviewId: review.id, bookId: review.bookId });
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
        <div className="flex items-start gap-3 mb-3">
          <Avatar>
            <AvatarImage src={review.user.profileImageUrl || undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">{displayName}</span>
              <span className="text-xs text-muted-foreground">{timeAgo}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              reviewed a book
            </p>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Book ID: {review.bookId}</span>
            </div>
            <StarRating rating={review.rating} readonly size="sm" />
          </div>
          
          {review.title && (
            <h4 className="font-semibold text-sm mb-1">{review.title}</h4>
          )}
          
          {review.content && (
            <p className="text-sm text-muted-foreground line-clamp-3">{review.content}</p>
          )}
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLike}
            disabled={toggleLike.isPending}
            className={review.isLiked ? "text-primary" : ""}
          >
            <ThumbsUp className={`h-4 w-4 mr-1 ${review.isLiked ? "fill-current" : ""}`} />
            {review.likesCount}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return date.toLocaleDateString();
}

export function SocialFeed() {
  const { data: feed, isLoading, error } = useSocialFeed();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-4">
              <div className="flex items-start gap-3 mb-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-20 w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Unable to load feed</p>
        </CardContent>
      </Card>
    );
  }

  if (!feed || feed.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">Your feed is empty</h3>
          <p className="text-muted-foreground mb-4">
            Follow other readers to see their reviews here
          </p>
          <Link href="/">
            <Button>Browse Library</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="social-feed">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Your Feed
          </CardTitle>
        </CardHeader>
      </Card>
      
      {feed.map((review) => (
        <FeedReviewCard key={review.id} review={review} />
      ))}
    </div>
  );
}
