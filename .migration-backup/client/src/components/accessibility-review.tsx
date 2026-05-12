import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Star, Eye, Navigation, Contrast, Accessibility, Loader2 } from "lucide-react";

function ScoreCircle({ label, score, icon: Icon }: { label: string; score: number; icon: any }) {
  const color =
    score >= 4 ? "text-green-500 border-green-500/30 bg-green-500/10" :
    score >= 3 ? "text-yellow-500 border-yellow-500/30 bg-yellow-500/10" :
    "text-red-500 border-red-500/30 bg-red-500/10";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`h-16 w-16 rounded-full border-2 flex items-center justify-center ${color}`}>
        <span className="text-lg font-bold">{score.toFixed(1)}</span>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground dark:text-foreground">{label}</label>
        <Badge variant="secondary">{value}/5</Badge>
      </div>
      <Slider
        min={1}
        max={5}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}

export function AccessibilityReviewSection({ bookId }: { bookId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(3);
  const [screenReaderScore, setScreenReaderScore] = useState(3);
  const [navigationScore, setNavigationScore] = useState(3);
  const [contrastScore, setContrastScore] = useState(3);
  const [comments, setComments] = useState("");

  const reviewsQuery = useQuery({
    queryKey: ["/api/books", bookId, "a11y-reviews"],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/a11y-reviews`);
      if (!res.ok) throw new Error("Failed to fetch reviews");
      return res.json();
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/books/${bookId}/a11y-reviews`, {
        rating,
        screenReaderScore,
        navigationScore,
        contrastScore,
        comments,
      });
    },
    onSuccess: () => {
      toast({ title: "Review submitted!" });
      queryClient.invalidateQueries({ queryKey: ["/api/books", bookId, "a11y-reviews"] });
      setShowForm(false);
      setRating(3);
      setScreenReaderScore(3);
      setNavigationScore(3);
      setContrastScore(3);
      setComments("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to submit review", description: err.message, variant: "destructive" });
    },
  });

  const reviews = (reviewsQuery.data as any[]) || [];

  const avgScores = reviews.length > 0
    ? {
        rating: reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / reviews.length,
        screenReader: reviews.reduce((sum: number, r: any) => sum + (r.screenReaderScore || 0), 0) / reviews.length,
        navigation: reviews.reduce((sum: number, r: any) => sum + (r.navigationScore || 0), 0) / reviews.length,
        contrast: reviews.reduce((sum: number, r: any) => sum + (r.contrastScore || 0), 0) / reviews.length,
      }
    : { rating: 0, screenReader: 0, navigation: 0, contrast: 0 };

  return (
    <div className="space-y-6">
      <Card className="bg-card dark:bg-card border border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground dark:text-foreground">
            <Accessibility className="h-5 w-5 text-primary" />
            Accessibility Reviews
            {reviews.length > 0 && (
              <Badge variant="secondary" className="ml-2">{reviews.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reviews.length > 0 ? (
            <div className="flex items-center justify-center gap-8 py-4">
              <ScoreCircle label="Rating" score={avgScores.rating} icon={Star} />
              <ScoreCircle label="Screen Reader" score={avgScores.screenReader} icon={Eye} />
              <ScoreCircle label="Navigation" score={avgScores.navigation} icon={Navigation} />
              <ScoreCircle label="Contrast" score={avgScores.contrast} icon={Contrast} />
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4">
              No accessibility reviews yet. Be the first to rate this book's accessibility!
            </p>
          )}
        </CardContent>
      </Card>

      {reviews.length > 0 && (
        <Card className="bg-card dark:bg-card border border-border">
          <CardHeader>
            <CardTitle className="text-lg text-foreground dark:text-foreground">All Reviews</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {reviews.map((review: any, idx: number) => (
              <div
                key={review.id || idx}
                className="p-4 rounded-lg bg-muted/50 dark:bg-muted/20 space-y-2"
              >
                <div className="flex items-center gap-4 flex-wrap">
                  <Badge variant="outline">Rating: {review.rating}/5</Badge>
                  <Badge variant="outline">Screen Reader: {review.screenReaderScore}/5</Badge>
                  <Badge variant="outline">Navigation: {review.navigationScore}/5</Badge>
                  <Badge variant="outline">Contrast: {review.contrastScore}/5</Badge>
                </div>
                {review.comments && (
                  <p className="text-sm text-foreground dark:text-foreground">{review.comments}</p>
                )}
                {review.createdAt && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {user && !showForm && (
        <Button onClick={() => setShowForm(true)} className="w-full">
          <Star className="h-4 w-4 mr-2" />
          Write Review
        </Button>
      )}

      {showForm && (
        <Card className="bg-card dark:bg-card border border-border">
          <CardHeader>
            <CardTitle className="text-lg text-foreground dark:text-foreground">Submit Accessibility Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <SliderField label="Overall Rating" value={rating} onChange={setRating} />
            <SliderField label="Screen Reader Score" value={screenReaderScore} onChange={setScreenReaderScore} />
            <SliderField label="Navigation Score" value={navigationScore} onChange={setNavigationScore} />
            <SliderField label="Contrast Score" value={contrastScore} onChange={setContrastScore} />
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground dark:text-foreground">Comments</label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Describe your accessibility experience with this book..."
                rows={4}
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
                className="flex-1"
              >
                {submitMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                ) : (
                  "Submit Review"
                )}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {reviewsQuery.isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
