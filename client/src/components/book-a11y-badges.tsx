import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Type, ZoomIn, GraduationCap, Mic, Bot, Clock } from "lucide-react";
import type { Book } from "@shared/schema";

const READING_LEVEL_LABEL: Record<number, string> = {
  1: "Very Easy",
  2: "Easy",
  3: "Moderate",
  4: "Advanced",
};

export type ChapterLength = "short" | "medium" | "long" | null;

/**
 * Classify a book's chapter length using its total duration as a proxy.
 * Per Task #69: missing values render as "not specified" — never re-index.
 *  - short: less than 5 hours
 *  - medium: 5–15 hours
 *  - long: more than 15 hours
 *  - null: duration not specified (audiobooks only — ebooks have no duration)
 */
export function classifyChapterLength(book: Pick<Book, "duration" | "contentType">): ChapterLength {
  if (book.contentType !== "audiobook") return null;
  const d = book.duration ?? 0;
  if (d <= 0) return null;
  const hours = d / 3600;
  if (hours < 5) return "short";
  if (hours <= 15) return "medium";
  return "long";
}

interface BookA11yBadgesProps {
  book: Pick<Book, "transcriptAvailable" | "narrationType" | "readingLevel" | "duration" | "contentType">;
  /** Optional accessibility metadata fetched separately (dyslexia font / large text). */
  metadata?: { hasDyslexiaFont?: boolean; hasLargeText?: boolean } | null;
  /** Show empty/"not specified" placeholder when no badges apply. Default true. */
  showEmpty?: boolean;
  size?: "sm" | "md";
}

interface BadgeSpec {
  key: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  ariaLabel: string;
  tooltip: string;
  className: string;
}

/**
 * A small, accessible badge row summarising what accessibility metadata
 * is known about a book: transcript, dyslexia font, large text, reading
 * level and narration type. Each badge is keyboard-focusable and carries
 * a short explanation in its accessible name (Task #69).
 */
export function BookA11yBadges({ book, metadata, showEmpty = true, size = "sm" }: BookA11yBadgesProps) {
  const badges: BadgeSpec[] = [];

  if (book.transcriptAvailable) {
    badges.push({
      key: "transcript",
      icon: FileText,
      label: "Transcript",
      ariaLabel: "Interactive transcript available",
      tooltip: "An interactive transcript is available alongside the audio.",
      className: "bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200 border-sky-200 dark:border-sky-700",
    });
  }

  if (metadata?.hasDyslexiaFont) {
    badges.push({
      key: "dyslexia-font",
      icon: Type,
      label: "Dyslexia font",
      ariaLabel: "Dyslexia-friendly font available",
      tooltip: "A dyslexia-friendly font (such as OpenDyslexic) can be applied while reading.",
      className: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 border-amber-200 dark:border-amber-700",
    });
  }

  if (metadata?.hasLargeText) {
    badges.push({
      key: "large-text",
      icon: ZoomIn,
      label: "Large text",
      ariaLabel: "Large-text edition available",
      tooltip: "A large-text edition is available for easier reading.",
      className: "bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-200 border-violet-200 dark:border-violet-700",
    });
  }

  if (book.readingLevel && READING_LEVEL_LABEL[book.readingLevel]) {
    const lvl = READING_LEVEL_LABEL[book.readingLevel];
    badges.push({
      key: "reading-level",
      icon: GraduationCap,
      label: lvl,
      ariaLabel: `Reading level: ${lvl}`,
      tooltip: `This title is rated ${lvl} on our reading-level scale.`,
      className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700",
    });
  }

  if (book.narrationType === "human") {
    badges.push({
      key: "narration-human",
      icon: Mic,
      label: "Human narration",
      ariaLabel: "Narration type: human-narrated",
      tooltip: "This audiobook is read by a human narrator.",
      className: "bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200 border-rose-200 dark:border-rose-700",
    });
  } else if (book.narrationType === "ai") {
    badges.push({
      key: "narration-ai",
      icon: Bot,
      label: "AI narration",
      ariaLabel: "Narration type: AI-generated",
      tooltip: "This audiobook uses AI-generated narration.",
      className: "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700",
    });
  }

  const chapterLength = classifyChapterLength(book);
  if (chapterLength) {
    const text =
      chapterLength === "short" ? "Short" : chapterLength === "medium" ? "Medium" : "Long";
    badges.push({
      key: "chapter-length",
      icon: Clock,
      label: `${text} listen`,
      ariaLabel: `Length: ${text} (under 5 hours / 5–15 hours / over 15 hours)`,
      tooltip:
        chapterLength === "short"
          ? "Short listen — under 5 hours total."
          : chapterLength === "medium"
            ? "Medium listen — 5 to 15 hours total."
            : "Long listen — more than 15 hours total.",
      className: "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-200 border-indigo-200 dark:border-indigo-700",
    });
  }

  if (badges.length === 0) {
    if (!showEmpty) return null;
    return (
      <p
        className="text-[10px] text-muted-foreground italic"
        data-testid="a11y-badges-empty"
        aria-label="Accessibility details not specified for this title"
      >
        Accessibility details not specified
      </p>
    );
  }

  const padding = size === "md" ? "px-2 py-0.5 text-xs" : "px-1.5 py-0 text-[10px]";

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="flex flex-wrap gap-1"
        role="list"
        aria-label="Accessibility features"
        data-testid="a11y-badges"
      >
        {badges.map(({ key, icon: Icon, label, ariaLabel, tooltip, className }) => (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                role="listitem"
                tabIndex={0}
                aria-label={ariaLabel}
                data-testid={`a11y-badge-${key}`}
                className={`gap-1 font-medium border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${padding} ${className}`}
              >
                <Icon className="h-3 w-3" aria-hidden={true} />
                {label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top">{tooltip}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
