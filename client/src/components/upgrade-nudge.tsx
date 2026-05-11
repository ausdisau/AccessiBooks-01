import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UpgradeNudgeProps {
  /** Tracking surface: "hub" | "player_endcard" | "library_filter" | "feature_gate" */
  surface: string;
  /** What benefit to highlight */
  reason?: string;
  onUpgrade?: () => void;
  /** Cap impressions per session — once dismissed in this session, hide for this surface */
  capPerSession?: boolean;
}

const SESSION_KEY = "ab_nudge_dismissed";

function getDismissedThisSession(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function markDismissedThisSession(surface: string) {
  try {
    const map = getDismissedThisSession();
    map[surface] = (map[surface] ?? 0) + 1;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function UpgradeNudge({ surface, reason, onUpgrade, capPerSession = true }: UpgradeNudgeProps) {
  const [hidden, setHidden] = useState(false);
  const { toast } = useToast();

  const { data: decision } = useQuery<{ show: boolean; reason?: string }>({
    queryKey: ["/api/nudge/should-show", surface],
    queryFn: async () => {
      const r = await apiRequest("POST", "/api/nudge/should-show", { surface });
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const dismiss = useMutation({
    mutationFn: async (mute30d: boolean) => {
      await apiRequest("POST", "/api/nudge/dismiss", { surface });
      if (mute30d) {
        const until = new Date();
        until.setDate(until.getDate() + 30);
        await apiRequest("PUT", "/api/a11y/preferences", {
          profile: { hideUpgradeNudgesUntil: until.toISOString() },
        });
        queryClient.invalidateQueries({ queryKey: ["/api/a11y/preferences"] });
        queryClient.invalidateQueries({ queryKey: ["/api/settings/summary"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/nudge/should-show", surface] });
    },
    onSuccess: (_, mute30d) => {
      setHidden(true);
      markDismissedThisSession(surface);
      if (mute30d) {
        toast({ title: "Got it — we'll hide upgrade prompts for 30 days.", duration: 3000 });
      }
    },
  });

  useEffect(() => {
    if (capPerSession) {
      const dismissed = getDismissedThisSession();
      if ((dismissed[surface] ?? 0) >= 1) setHidden(true);
    }
  }, [surface, capPerSession]);

  if (hidden || !decision?.show) return null;

  return (
    <Card
      role="region"
      aria-label="Upgrade suggestion"
      className="relative p-4 border-primary/30 bg-gradient-to-br from-primary/5 to-amber-500/5"
      data-testid={`upgrade-nudge-${surface}`}
    >
      <button
        type="button"
        onClick={() => dismiss.mutate(false)}
        className="absolute top-2 right-2 p-1 rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Dismiss upgrade suggestion"
        data-testid={`nudge-dismiss-${surface}`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <Crown className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">Try Plus or Premium</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {reason ?? "Ad-free listening, unlimited skips, and HD audio — your pace, no interruptions."}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button
              size="sm"
              onClick={() => {
                // Fire-and-forget conversion-attribution event for admin engagement analytics.
                apiRequest("POST", "/api/nudge/clicked", { surface }).catch(() => {});
                onUpgrade?.();
              }}
              data-testid={`nudge-upgrade-${surface}`}
            >
              See plans
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dismiss.mutate(true)}
              data-testid={`nudge-mute30-${surface}`}
            >
              Hide for 30 days
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
