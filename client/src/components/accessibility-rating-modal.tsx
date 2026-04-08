import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Star, Award } from "lucide-react";
import type { DisabilityType } from "@shared/schema";
import { DISABILITY_TYPES } from "@shared/schema";

interface AccessibilityRatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookId: string;
  bookTitle: string;
}

const DISABILITY_LABELS: Record<DisabilityType, string> = {
  dyslexia: "Dyslexia",
  "low-vision": "Low Vision / Visual Impairment",
  motor: "Motor Impairment",
  hearing: "Hearing Impairment",
  cognitive: "Cognitive / Learning Disability",
  other: "Other / General",
};

const DISABILITY_DESCRIPTIONS: Record<DisabilityType, string> = {
  dyslexia: "Reading-related challenges, font and layout needs",
  "low-vision": "Visual acuity, contrast, text size needs",
  motor: "Navigation, touch target, voice control needs",
  hearing: "Caption, transcript, audio description needs",
  cognitive: "Simplicity, pacing, focus support needs",
  other: "General accessibility experience",
};

function StarRating({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className="p-0.5 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
          >
            <Star
              className={`h-6 w-6 transition-colors ${
                star <= (hovered || value)
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground"
              }`}
            />
          </button>
        ))}
        {value > 0 && (
          <span className="text-sm text-muted-foreground self-center ml-1">{value}/5</span>
        )}
      </div>
    </div>
  );
}

export function AccessibilityRatingModal({ isOpen, onClose, bookId, bookTitle }: AccessibilityRatingModalProps) {
  const [disabilityType, setDisabilityType] = useState<DisabilityType>("dyslexia");
  const [rating, setRating] = useState(0);
  const [screenReaderScore, setScreenReaderScore] = useState(0);
  const [navigationScore, setNavigationScore] = useState(0);
  const [contrastScore, setContrastScore] = useState(0);
  const [audioQualityScore, setAudioQualityScore] = useState(0);
  const [comments, setComments] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: (data: object) =>
      apiRequest("POST", `/api/books/${bookId}/a11y-reviews`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/books", bookId, "a11y-reviews"] });
      toast({
        title: "Review submitted!",
        description: "Thank you! Your accessibility rating helps other readers with similar needs.",
      });
      handleClose();
    },
    onError: () => {
      toast({
        title: "Submission failed",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setDisabilityType("dyslexia");
    setRating(0);
    setScreenReaderScore(0);
    setNavigationScore(0);
    setContrastScore(0);
    setAudioQualityScore(0);
    setComments("");
    onClose();
  };

  const handleSubmit = () => {
    if (rating === 0) {
      toast({ title: "Please add an overall rating", variant: "destructive" });
      return;
    }
    mutate({
      disabilityType,
      rating,
      screenReaderScore: screenReaderScore || null,
      navigationScore: navigationScore || null,
      contrastScore: contrastScore || null,
      audioQualityScore: audioQualityScore || null,
      comments: comments.trim() || null,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-emerald-600" />
            Rate Accessibility
          </DialogTitle>
          <DialogDescription>
            Share how accessible <strong>{bookTitle}</strong> is for your specific disability type.
            Your ratings help readers with similar needs find the right books.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Your disability type</Label>
            <RadioGroup
              value={disabilityType}
              onValueChange={(v) => setDisabilityType(v as DisabilityType)}
              className="grid grid-cols-1 gap-2"
            >
              {DISABILITY_TYPES.map((dtype) => (
                <div
                  key={dtype}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    disabilityType === dtype
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                      : "border-border hover:border-emerald-200 hover:bg-muted/50"
                  }`}
                  onClick={() => setDisabilityType(dtype)}
                >
                  <RadioGroupItem value={dtype} id={`dtype-${dtype}`} className="mt-0.5" />
                  <div>
                    <Label htmlFor={`dtype-${dtype}`} className="font-medium cursor-pointer">
                      {DISABILITY_LABELS[dtype]}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{DISABILITY_DESCRIPTIONS[dtype]}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-4">
            <Label className="text-sm font-semibold">Rate each dimension</Label>
            <div className="space-y-4 pl-2">
              <StarRating value={rating} onChange={setRating} label="Overall Accessibility *" />
              <StarRating value={audioQualityScore} onChange={setAudioQualityScore} label="Audio Quality" />
              <StarRating value={navigationScore} onChange={setNavigationScore} label="Navigation & Controls" />
              <StarRating value={contrastScore} onChange={setContrastScore} label="Visual Contrast & Readability" />
              <StarRating value={screenReaderScore} onChange={setScreenReaderScore} label="Screen Reader Compatibility" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comments" className="text-sm font-semibold">Comments (optional)</Label>
            <Textarea
              id="comments"
              placeholder="Share specific details about your experience — what worked well, what could improve..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground text-right">{comments.length}/2000</p>
          </div>

          <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
            Reviews are moderated before appearing publicly. Books with ≥5 ratings averaging 4.0+ earn the "AccessiBooks Certified" badge for that disability type.
          </p>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || rating === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isPending ? "Submitting..." : "Submit Rating"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
