import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface OnboardingFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

const GENRES = [
  "Fiction",
  "Non-Fiction",
  "Mystery",
  "Sci-Fi",
  "Fantasy",
  "Romance",
  "History",
  "Biography",
  "Self-Help",
  "Business",
  "Science",
  "Philosophy",
];

export function OnboardingFlow({ open, onOpenChange, onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(1);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  const preferencesMutation = useMutation({
    mutationFn: async (genres: string[]) => {
      const res = await apiRequest("PUT", "/api/user/preferences", {
        favoriteGenres: genres,
        onboardingCompleted: true,
      });
      return res.json();
    },
    onSuccess: () => {
      onComplete();
      onOpenChange(false);
      setStep(1);
      setSelectedGenres([]);
    },
  });

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else {
      preferencesMutation.mutate(selectedGenres);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {step === 1 ? (
          <>
            <DialogHeader className="text-center sm:text-center">
              <DialogTitle className="text-xl">What do you like to read?</DialogTitle>
              <DialogDescription>
                Pick your favorite genres so we can personalize your experience
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-3 gap-2 py-4">
              {GENRES.map((genre) => {
                const isSelected = selectedGenres.includes(genre);
                return (
                  <Button
                    key={genre}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className="h-auto py-2"
                    onClick={() => toggleGenre(genre)}
                  >
                    {genre}
                  </Button>
                );
              })}
            </div>

            <Button
              size="lg"
              className="w-full"
              disabled={selectedGenres.length === 0}
              onClick={handleNext}
            >
              Continue
            </Button>
          </>
        ) : (
          <>
            <DialogHeader className="text-center sm:text-center">
              <div className="mb-2 text-center text-4xl">🎉</div>
              <DialogTitle className="text-xl">You're all set!</DialogTitle>
              <DialogDescription>
                We'll personalize your experience based on your interests
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap justify-center gap-2 py-4">
              {selectedGenres.map((genre) => (
                <Badge key={genre} variant="secondary" className="text-sm">
                  {genre}
                </Badge>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button
                size="lg"
                className="flex-1"
                disabled={preferencesMutation.isPending}
                onClick={handleNext}
              >
                {preferencesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Get Started"
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
