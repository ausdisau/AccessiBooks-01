import { usePlaybackRules } from "@/hooks/use-monetization";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Shuffle, Crown, Volume2, Wifi } from "lucide-react";

interface PlaybackRulesBannerProps {
  contentType?: "album" | "playlist" | "single";
}

export function PlaybackRulesBanner({ contentType = "single" }: PlaybackRulesBannerProps) {
  const { data: rules, isLoading } = usePlaybackRules(contentType);

  if (isLoading || !rules || rules.isPremium) {
    return null;
  }

  const restrictions = [];

  if (rules.shuffleRequired) {
    restrictions.push({
      icon: <Shuffle className="h-4 w-4" />,
      text: "Shuffle play only for albums",
    });
  }

  if (rules.quality === "low") {
    restrictions.push({
      icon: <Volume2 className="h-4 w-4" />,
      text: `${rules.bitrate}kbps audio quality`,
    });
  }

  if (!rules.offlineEnabled) {
    restrictions.push({
      icon: <Wifi className="h-4 w-4" />,
      text: "Online streaming only",
    });
  }

  if (restrictions.length === 0) {
    return null;
  }

  return (
    <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
      <AlertDescription className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          {restrictions.map((restriction, index) => (
            <div key={index} className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 text-sm">
              {restriction.icon}
              <span>{restriction.text}</span>
            </div>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-amber-700 hover:text-amber-800 dark:text-amber-300"
          onClick={() => window.location.href = "/api/subscription/create-checkout"}
        >
          <Crown className="h-4 w-4 mr-1" />
          Remove limits
        </Button>
      </AlertDescription>
    </Alert>
  );
}

interface ShuffleModeEnforcerProps {
  contentType: "album" | "playlist" | "single";
  isShuffleEnabled: boolean;
  onToggleShuffle: (enabled: boolean) => void;
}

export function ShuffleModeEnforcer({
  contentType,
  isShuffleEnabled,
  onToggleShuffle,
}: ShuffleModeEnforcerProps) {
  const { data: rules } = usePlaybackRules(contentType);

  if (!rules || rules.isPremium || !rules.shuffleRequired) {
    return null;
  }

  if (!isShuffleEnabled) {
    onToggleShuffle(true);
  }

  return (
    <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
      <Shuffle className="h-4 w-4" />
      <span>Shuffle is required for albums on Free tier</span>
      <Button
        size="sm"
        variant="link"
        className="text-amber-700 p-0 h-auto"
        onClick={() => window.location.href = "/api/subscription/create-checkout"}
      >
        Play in order with Premium
      </Button>
    </div>
  );
}
