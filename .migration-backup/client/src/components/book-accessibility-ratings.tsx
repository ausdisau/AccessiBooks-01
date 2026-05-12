import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccessibilityRatingModal } from "./accessibility-rating-modal";
import { Award, Star, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface DisabilityStats {
  count: number;
  avgRating: number;
  avgScreenReader: number;
  avgNavigation: number;
  avgContrast: number;
  avgAudioQuality: number;
  certified: boolean;
}

interface A11yReviewsResponse {
  reviews: unknown[];
  byDisabilityType: Record<string, DisabilityStats>;
  averages: { rating: number; total: number };
}

const DISABILITY_LABELS: Record<string, string> = {
  dyslexia: "Dyslexia",
  "low-vision": "Low Vision",
  motor: "Motor",
  hearing: "Hearing",
  cognitive: "Cognitive",
  other: "Other",
};

function StarBar({ score, max = 5 }: { score: number; max?: number }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right text-muted-foreground">{score > 0 ? score.toFixed(1) : "—"}</span>
    </div>
  );
}

function DisabilityTabContent({ stats }: { stats: DisabilityStats }) {
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              className={`h-4 w-4 ${s <= Math.round(stats.avgRating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
            />
          ))}
        </div>
        <span className="font-semibold text-sm">{stats.avgRating.toFixed(1)}/5</span>
        <span className="text-xs text-muted-foreground">({stats.count} {stats.count === 1 ? "rating" : "ratings"})</span>
        {stats.certified && (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs gap-1 border-emerald-200 dark:border-emerald-700">
            <Award className="h-3 w-3" />
            AccessiBooks Certified
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        {stats.avgAudioQuality > 0 && (
          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <span className="text-xs text-muted-foreground">Audio Quality</span>
            <StarBar score={stats.avgAudioQuality} />
          </div>
        )}
        {stats.avgNavigation > 0 && (
          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <span className="text-xs text-muted-foreground">Navigation</span>
            <StarBar score={stats.avgNavigation} />
          </div>
        )}
        {stats.avgContrast > 0 && (
          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <span className="text-xs text-muted-foreground">Visual Contrast</span>
            <StarBar score={stats.avgContrast} />
          </div>
        )}
        {stats.avgScreenReader > 0 && (
          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <span className="text-xs text-muted-foreground">Screen Reader</span>
            <StarBar score={stats.avgScreenReader} />
          </div>
        )}
      </div>
    </div>
  );
}

interface BookAccessibilityRatingsProps {
  bookId: string;
  bookTitle: string;
}

export function BookAccessibilityRatings({ bookId, bookTitle }: BookAccessibilityRatingsProps) {
  const { isAuthenticated } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery<A11yReviewsResponse>({
    queryKey: ["/api/books", bookId, "a11y-reviews"],
    queryFn: () => fetch(`/api/books/${bookId}/a11y-reviews`).then(r => r.json()),
  });

  const byType = data?.byDisabilityType ?? {};
  const activeTypes = Object.keys(byType).filter(k => byType[k].count > 0);
  const certifiedTypes = activeTypes.filter(k => byType[k].certified);
  const totalReviews = data?.averages.total ?? 0;
  const overallAvg = data?.averages.rating ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Accessibility Ratings</h3>
          {certifiedTypes.length > 0 && (
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs gap-1 border-emerald-200 dark:border-emerald-700">
              <Award className="h-3 w-3" />
              Certified
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setModalOpen(true)}
          className="text-xs h-7 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
        >
          <Award className="h-3 w-3 mr-1" />
          Rate Accessibility
        </Button>
      </div>

      {totalReviews === 0 ? (
        <div className="bg-muted/40 rounded-lg p-4 text-center space-y-2">
          <p className="text-sm text-muted-foreground">No accessibility ratings yet.</p>
          <p className="text-xs text-muted-foreground">Be the first to rate this book for your disability type!</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setExpanded(!expanded)}
          >
            <div className="flex items-center gap-2 text-sm">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`h-3.5 w-3.5 ${s <= Math.round(overallAvg) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                  />
                ))}
              </div>
              <span className="font-medium">{overallAvg.toFixed(1)}</span>
              <span className="text-muted-foreground text-xs">({totalReviews} ratings across {activeTypes.length} disability type{activeTypes.length !== 1 ? "s" : ""})</span>
            </div>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>

          {expanded && activeTypes.length > 0 && (
            <Tabs defaultValue={activeTypes[0]} className="mt-2">
              <TabsList className="h-8 flex-wrap gap-1 w-full justify-start bg-muted/50">
                {activeTypes.map((dtype) => (
                  <TabsTrigger key={dtype} value={dtype} className="text-xs h-6 px-2 data-[state=active]:bg-background">
                    {DISABILITY_LABELS[dtype] || dtype}
                    {byType[dtype].certified && <Award className="h-3 w-3 ml-1 text-emerald-600" />}
                  </TabsTrigger>
                ))}
              </TabsList>
              {activeTypes.map((dtype) => (
                <TabsContent key={dtype} value={dtype}>
                  <DisabilityTabContent stats={byType[dtype]} />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      )}

      {!isAuthenticated && (
        <p className="text-xs text-muted-foreground">Sign in to submit your own accessibility rating.</p>
      )}

      <AccessibilityRatingModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        bookId={bookId}
        bookTitle={bookTitle}
      />
    </div>
  );
}
