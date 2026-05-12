import { useAudioContext } from "@/contexts/audio-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Moon, X } from "lucide-react";

const SLEEP_OPTIONS = [
  { label: "5 minutes", value: 5 },
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "45 minutes", value: 45 },
  { label: "1 hour", value: 60 },
  { label: "End of chapter", value: -1 },
];

function formatRemaining(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}:${remainingMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function SleepTimer() {
  const { sleepTimer, sleepTimerRemaining, setSleepTimer, cancelSleepTimer } = useAudioContext();

  const handleSelect = (minutes: number) => {
    if (minutes === -1) {
      setSleepTimer(30);
    } else {
      setSleepTimer(minutes);
    }
  };

  if (sleepTimerRemaining !== null) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full">
        <Moon className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-primary">
          {formatRemaining(sleepTimerRemaining)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 hover:bg-primary/20"
          onClick={cancelSleepTimer}
          aria-label="Cancel sleep timer"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          aria-label="Set sleep timer"
        >
          <Moon className="h-4 w-4" />
          <span className="hidden sm:inline">Sleep</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
          Sleep Timer
        </div>
        <DropdownMenuSeparator />
        {SLEEP_OPTIONS.filter(opt => opt.value !== -1).map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => handleSelect(option.value)}
            className="cursor-pointer"
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
