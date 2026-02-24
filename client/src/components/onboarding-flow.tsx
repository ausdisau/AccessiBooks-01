import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Headphones,
  BookOpen,
  Mic,
  Newspaper,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Clock,
  CalendarDays,
  Coffee,
  Check,
  Library,
  Star,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Book } from "@shared/schema";

interface OnboardingFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

const TOTAL_STEPS = 6;

const GENRES = [
  "Fiction",
  "Mystery",
  "Sci-Fi",
  "Romance",
  "History",
  "Biography",
  "Self-Help",
  "Fantasy",
  "Thriller",
  "Science",
  "Technology",
  "Business",
];

const GENRE_EMOJIS: Record<string, string> = {
  Fiction: "📖",
  Mystery: "🔍",
  "Sci-Fi": "🚀",
  Romance: "💕",
  History: "📜",
  Biography: "👤",
  "Self-Help": "🌱",
  Fantasy: "🐉",
  Thriller: "🎭",
  Science: "🔬",
  Technology: "💻",
  Business: "📊",
};

const CONTENT_TYPES = [
  { id: "audiobooks", label: "Audiobooks", icon: Headphones, description: "Listen on the go" },
  { id: "ebooks", label: "Ebooks", icon: BookOpen, description: "Read anywhere" },
  { id: "podcasts", label: "Podcasts", icon: Mic, description: "Discover shows" },
  { id: "magazines", label: "Magazines", icon: Newspaper, description: "Stay informed" },
];

const LISTENING_HABITS = [
  { id: "daily", label: "I listen daily", icon: Clock, description: "Every single day" },
  { id: "few-times", label: "A few times a week", icon: CalendarDays, description: "3-4 times weekly" },
  { id: "when-free", label: "When I have time", icon: Coffee, description: "Casual listener" },
];

export function OnboardingFlow({ open, onOpenChange, onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(1);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>([]);
  const [listeningHabit, setListeningHabit] = useState<string>("");
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [isTransitioning, setIsTransitioning] = useState(false);

  const { data: allBooksResponse } = useQuery<{ data: Book[] }>({
    queryKey: ["/api/books", "onboarding"],
    queryFn: async () => {
      const res = await fetch("/api/books?limit=100");
      if (!res.ok) throw new Error("Failed to fetch books");
      return res.json();
    },
    enabled: open && step >= 5,
  });
  const allBooks = allBooksResponse?.data;

  const recommendedBooks = useCallback(() => {
    if (!allBooks || allBooks.length === 0) return [];
    const matched = allBooks.filter(
      (book) => book.genre && selectedGenres.some((g) => book.genre!.toLowerCase().includes(g.toLowerCase()))
    );
    const pool = matched.length >= 3 ? matched : allBooks;
    return pool.slice(0, 4);
  }, [allBooks, selectedGenres]);

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const toggleContentType = (id: string) => {
    setSelectedContentTypes((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const animateStep = (newStep: number) => {
    setDirection(newStep > step ? "forward" : "backward");
    setIsTransitioning(true);
    setTimeout(() => {
      setStep(newStep);
      setIsTransitioning(false);
    }, 150);
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      animateStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      animateStep(step - 1);
    }
  };

  const handleComplete = async () => {
    const preferences = {
      genres: selectedGenres,
      contentTypes: selectedContentTypes,
      listeningHabit,
      completedAt: new Date().toISOString(),
    };
    localStorage.setItem("accessibooks-onboarding-preferences", JSON.stringify(preferences));
    localStorage.setItem("onboarding-completed", "true");
    localStorage.setItem("accessibooks_onboarding_done", "true");

    try {
      await apiRequest("PUT", "/api/user/preferences", {
        favoriteGenres: selectedGenres,
        preferredContentTypes: selectedContentTypes,
        listeningHabit,
        onboardingCompleted: true,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/user/preferences"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
    } catch (error) {
      console.error("Failed to sync preferences to backend:", error);
    }

    onComplete();
    onOpenChange(false);
    setStep(1);
    setSelectedGenres([]);
    setSelectedContentTypes([]);
    setListeningHabit("");
  };

  const canProceed = () => {
    switch (step) {
      case 1: return true;
      case 2: return selectedGenres.length >= 2;
      case 3: return selectedContentTypes.length >= 1;
      case 4: return listeningHabit !== "";
      case 5: return true;
      case 6: return true;
      default: return false;
    }
  };

  const progressPercent = (step / TOTAL_STEPS) * 100;

  const transitionClass = isTransitioning
    ? "opacity-0 translate-y-2"
    : "opacity-100 translate-y-0";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden bg-background dark:bg-gray-950 border dark:border-gray-800">
        <DialogTitle className="sr-only">Onboarding</DialogTitle>

        {step > 1 && (
          <div className="px-6 pt-5 pb-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground dark:text-gray-400">
                Step {step} of {TOTAL_STEPS}
              </span>
              <span className="text-xs font-medium text-muted-foreground dark:text-gray-400">
                {Math.round(progressPercent)}%
              </span>
            </div>
            <Progress value={progressPercent} className="h-1.5" />
          </div>
        )}

        <div
          className={`px-6 pb-6 ${step === 1 ? "pt-6" : "pt-4"} transition-all duration-200 ease-in-out ${transitionClass}`}
        >
          {step === 1 && <WelcomeStep onNext={handleNext} />}
          {step === 2 && (
            <GenreStep
              selected={selectedGenres}
              onToggle={toggleGenre}
              onNext={handleNext}
              onBack={handleBack}
              canProceed={canProceed()}
            />
          )}
          {step === 3 && (
            <ContentTypeStep
              selected={selectedContentTypes}
              onToggle={toggleContentType}
              onNext={handleNext}
              onBack={handleBack}
              canProceed={canProceed()}
            />
          )}
          {step === 4 && (
            <ListeningHabitStep
              selected={listeningHabit}
              onSelect={setListeningHabit}
              onNext={handleNext}
              onBack={handleBack}
              canProceed={canProceed()}
            />
          )}
          {step === 5 && (
            <RecommendationsStep
              books={recommendedBooks()}
              genres={selectedGenres}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {step === 6 && (
            <DoneStep
              genres={selectedGenres}
              contentTypes={selectedContentTypes}
              habit={listeningHabit}
              onComplete={handleComplete}
              onBack={handleBack}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center space-y-6 py-4">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
        <Headphones className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground dark:text-white">
          Welcome to AccessiBooks
        </h2>
        <p className="text-muted-foreground dark:text-gray-400 text-base">
          Your Accessible Audio Library
        </p>
      </div>
      <p className="text-sm text-muted-foreground dark:text-gray-500 max-w-xs mx-auto">
        Let's personalize your experience in just a few quick steps. It only takes a minute!
      </p>
      <Button
        size="lg"
        className="w-full mt-4"
        onClick={onNext}
      >
        Get Started
        <ChevronRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

function GenreStep({
  selected,
  onToggle,
  onNext,
  onBack,
  canProceed,
}: {
  selected: string[];
  onToggle: (genre: string) => void;
  onNext: () => void;
  onBack: () => void;
  canProceed: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-foreground dark:text-white">
          What interests you?
        </h2>
        <p className="text-sm text-muted-foreground dark:text-gray-400">
          Pick at least 2 genres you enjoy
        </p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {GENRES.map((genre) => {
          const isSelected = selected.includes(genre);
          return (
            <button
              key={genre}
              onClick={() => onToggle(genre)}
              className={`relative flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition-all duration-150 ${
                isSelected
                  ? "border-primary bg-primary/10 dark:bg-primary/20 text-primary"
                  : "border-border dark:border-gray-700 hover:border-primary/50 text-foreground dark:text-gray-300"
              }`}
            >
              {isSelected && (
                <div className="absolute top-1 right-1">
                  <Check className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <span className="text-xl">{GENRE_EMOJIS[genre]}</span>
              <span className="text-xs font-medium leading-tight">{genre}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Badge variant="secondary" className="text-xs dark:bg-gray-800 dark:text-gray-300">
          {selected.length} selected
        </Badge>
        {!canProceed && (
          <span className="text-xs text-muted-foreground dark:text-gray-500">
            Select at least 2
          </span>
        )}
      </div>

      <NavigationButtons onBack={onBack} onNext={onNext} canProceed={canProceed} />
    </div>
  );
}

function ContentTypeStep({
  selected,
  onToggle,
  onNext,
  onBack,
  canProceed,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
  canProceed: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-foreground dark:text-white">
          What do you enjoy?
        </h2>
        <p className="text-sm text-muted-foreground dark:text-gray-400">
          Choose your preferred content types (at least 1)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CONTENT_TYPES.map((ct) => {
          const isSelected = selected.includes(ct.id);
          const Icon = ct.icon;
          return (
            <button
              key={ct.id}
              onClick={() => onToggle(ct.id)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-150 ${
                isSelected
                  ? "border-primary bg-primary/10 dark:bg-primary/20"
                  : "border-border dark:border-gray-700 hover:border-primary/50"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted dark:bg-gray-800 text-muted-foreground dark:text-gray-400"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-center">
                <p className={`text-sm font-semibold ${isSelected ? "text-primary" : "text-foreground dark:text-gray-200"}`}>
                  {ct.label}
                </p>
                <p className="text-xs text-muted-foreground dark:text-gray-500">
                  {ct.description}
                </p>
              </div>
              {isSelected && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          );
        })}
      </div>

      <NavigationButtons onBack={onBack} onNext={onNext} canProceed={canProceed} />
    </div>
  );
}

function ListeningHabitStep({
  selected,
  onSelect,
  onNext,
  onBack,
  canProceed,
}: {
  selected: string;
  onSelect: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
  canProceed: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-foreground dark:text-white">
          How often do you listen?
        </h2>
        <p className="text-sm text-muted-foreground dark:text-gray-400">
          This helps us tailor recommendations
        </p>
      </div>

      <div className="space-y-3">
        {LISTENING_HABITS.map((habit) => {
          const isSelected = selected === habit.id;
          const Icon = habit.icon;
          return (
            <button
              key={habit.id}
              onClick={() => onSelect(habit.id)}
              className={`w-full flex items-center gap-4 rounded-xl border-2 p-4 transition-all duration-150 ${
                isSelected
                  ? "border-primary bg-primary/10 dark:bg-primary/20"
                  : "border-border dark:border-gray-700 hover:border-primary/50"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted dark:bg-gray-800 text-muted-foreground dark:text-gray-400"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className={`text-sm font-semibold ${isSelected ? "text-primary" : "text-foreground dark:text-gray-200"}`}>
                  {habit.label}
                </p>
                <p className="text-xs text-muted-foreground dark:text-gray-500">
                  {habit.description}
                </p>
              </div>
              {isSelected && (
                <Check className="h-5 w-5 text-primary ml-auto shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      <NavigationButtons onBack={onBack} onNext={onNext} canProceed={canProceed} />
    </div>
  );
}

function RecommendationsStep({
  books,
  genres,
  onNext,
  onBack,
}: {
  books: Book[];
  genres: string[];
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <div className="mx-auto w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-2">
          <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-foreground dark:text-white">
          Picks for you
        </h2>
        <p className="text-sm text-muted-foreground dark:text-gray-400">
          Based on your interests in {genres.slice(0, 3).join(", ")}
          {genres.length > 3 ? ` +${genres.length - 3} more` : ""}
        </p>
      </div>

      {books.length > 0 ? (
        <div className="space-y-2">
          {books.map((book) => (
            <Card key={book.id} className="dark:bg-gray-900 dark:border-gray-800">
              <CardContent className="flex items-center gap-3 p-3">
                <div className="w-12 h-16 rounded-md bg-muted dark:bg-gray-800 overflow-hidden shrink-0 flex items-center justify-center">
                  {book.coverImage ? (
                    <img
                      src={book.coverImage}
                      alt={book.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground dark:text-white truncate">
                    {book.title}
                  </p>
                  <p className="text-xs text-muted-foreground dark:text-gray-400 truncate">
                    {book.author}
                  </p>
                  {book.genre && (
                    <Badge variant="secondary" className="mt-1 text-[10px] dark:bg-gray-800 dark:text-gray-300">
                      {book.genre}
                    </Badge>
                  )}
                </div>
                <Star className="h-4 w-4 text-amber-500 shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <Library className="h-10 w-10 text-muted-foreground dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground dark:text-gray-500">
            We'll find great picks for you once you start exploring!
          </p>
        </div>
      )}

      <NavigationButtons onBack={onBack} onNext={onNext} canProceed nextLabel="Almost done" />
    </div>
  );
}

function DoneStep({
  genres,
  contentTypes,
  habit,
  onComplete,
  onBack,
}: {
  genres: string[];
  contentTypes: string[];
  habit: string;
  onComplete: () => void;
  onBack: () => void;
}) {
  const habitLabel = LISTENING_HABITS.find((h) => h.id === habit)?.label || habit;

  return (
    <div className="text-center space-y-5 py-2">
      <div className="text-5xl">🎉</div>
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-foreground dark:text-white">
          You're all set!
        </h2>
        <p className="text-sm text-muted-foreground dark:text-gray-400">
          Your personalized experience is ready
        </p>
      </div>

      <div className="space-y-3 text-left">
        <div className="rounded-xl bg-muted/50 dark:bg-gray-900 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground dark:text-gray-500">
            Your interests
          </p>
          <div className="flex flex-wrap gap-1.5">
            {genres.map((g) => (
              <Badge key={g} variant="secondary" className="text-xs dark:bg-gray-800 dark:text-gray-300">
                {GENRE_EMOJIS[g]} {g}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-muted/50 dark:bg-gray-900 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground dark:text-gray-500">
            Content &amp; Habits
          </p>
          <div className="flex flex-wrap gap-1.5">
            {contentTypes.map((ct) => (
              <Badge key={ct} variant="outline" className="text-xs capitalize dark:border-gray-700 dark:text-gray-300">
                {ct}
              </Badge>
            ))}
            <Badge variant="outline" className="text-xs dark:border-gray-700 dark:text-gray-300">
              {habitLabel}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onBack} className="dark:border-gray-700 dark:text-gray-300">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Button size="lg" className="flex-1" onClick={onComplete}>
          Start Exploring
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function NavigationButtons({
  onBack,
  onNext,
  canProceed = true,
  nextLabel = "Continue",
}: {
  onBack: () => void;
  onNext: () => void;
  canProceed?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="flex gap-2 pt-2">
      <Button variant="outline" onClick={onBack} className="dark:border-gray-700 dark:text-gray-300">
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back
      </Button>
      <Button className="flex-1" onClick={onNext} disabled={!canProceed}>
        {nextLabel}
        <ChevronRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
