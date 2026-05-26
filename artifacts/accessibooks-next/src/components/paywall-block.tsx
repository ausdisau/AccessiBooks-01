import { Lock } from "lucide-react";
import { useLocation } from "@/lib/wouter-compat";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PaywallBlockProps {
  requiredTier: "premium" | "plus";
  titleName: string;
}

export function PaywallBlock({ requiredTier, titleName }: PaywallBlockProps) {
  const [, navigate] = useLocation();

  const tierLabel = requiredTier === "premium" ? "Premium" : "Plus";
  const tierDescription =
    requiredTier === "premium"
      ? "full catalog access, offline downloads, and UHQ audio"
      : "ad-free listening and expanded catalog access";

  return (
    <Card
      role="region"
      aria-label="Content access required"
      className="border-2 border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20"
    >
      <CardContent className="flex flex-col items-center text-center gap-4 py-8 px-6">
        <div className="rounded-full bg-amber-100 dark:bg-amber-900/40 p-4">
          <Lock className="h-8 w-8 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            {tierLabel} title
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            <strong className="text-foreground">"{titleName}"</strong> requires a {tierLabel} subscription,
            which includes {tierDescription}.
          </p>
        </div>
        <Button
          className="focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => navigate("/pricing")}
        >
          See plans
        </Button>
        <p className="text-xs text-muted-foreground">
          Already subscribed?{" "}
          <a
            href="/billing"
            className="underline hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            Manage your plan
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
