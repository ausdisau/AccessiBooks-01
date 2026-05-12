import { WifiOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ConnectionStatusType = "connected" | "reconnecting" | "disconnected" | "offline";

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  attempt?: number;
  onRetry?: () => void;
  className?: string;
}

export function ConnectionStatus({ status, attempt, onRetry, className = "" }: ConnectionStatusProps) {
  if (status === "connected") {
    return (
      <span className={`flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400 ${className}`}>
        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        LIVE
      </span>
    );
  }

  if (status === "reconnecting") {
    return (
      <span className={`flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 ${className}`}>
        <Loader2 className="w-3 h-3 animate-spin" />
        Reconnecting{attempt !== undefined && attempt > 0 ? ` (${attempt})` : "…"}
      </span>
    );
  }

  if (status === "disconnected") {
    return (
      <span className={`flex items-center gap-1.5 text-xs font-medium text-destructive ${className}`}>
        <span className="w-2 h-2 bg-destructive rounded-full" />
        Connection lost
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-xs ml-1"
            onClick={onRetry}
          >
            Retry
          </Button>
        )}
      </span>
    );
  }

  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium text-destructive ${className}`}>
      <WifiOff className="w-3 h-3" />
      Offline
    </span>
  );
}
