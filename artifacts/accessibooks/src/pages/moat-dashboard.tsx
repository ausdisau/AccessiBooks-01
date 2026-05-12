import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Gauge, FileText, Settings, Building2, MousePointer, Loader2, Activity } from "lucide-react";

const METRIC_CARDS = [
  { key: "totalA11yReviews", label: "Total A11y Reviews", icon: Star, color: "text-yellow-500" },
  { key: "avgA11yScore", label: "Avg A11y Score", icon: Gauge, color: "text-blue-500" },
  { key: "transcriptCoverage", label: "Transcript Coverage %", icon: FileText, color: "text-green-500" },
  { key: "prefsSyncedUsers", label: "Prefs Synced Users", icon: Settings, color: "text-purple-500" },
  { key: "institutionalOrgs", label: "Institutional Orgs", icon: Building2, color: "text-orange-500" },
  { key: "recommendationClicks", label: "Recommendation Clicks", icon: MousePointer, color: "text-pink-500" },
];

export default function MoatDashboard() {
  const { toast } = useToast();

  const metricsQuery = useQuery({
    queryKey: ["/api/admin/moat-metrics"],
  });

  const snapshotMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/moat-metrics/snapshot");
    },
    onSuccess: () => {
      toast({ title: "Snapshot saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/moat-metrics"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to take snapshot", description: err.message, variant: "destructive" });
    },
  });

  const metrics = metricsQuery.data as any;

  const formatValue = (key: string, value: any) => {
    if (value === undefined || value === null) return "—";
    if (key === "avgA11yScore") return Number(value).toFixed(1);
    if (key === "transcriptCoverage") return `${Number(value).toFixed(0)}%`;
    return Number(value).toLocaleString();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 operator-shell">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold flex items-center gap-3 text-foreground dark:text-foreground">
            <Activity className="h-8 w-8 text-primary" />
            Accessibility Moat Dashboard
          </h1>
          <p className="text-muted-foreground">Monitor the health and depth of your accessibility moat</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm">
            Admin
          </Badge>
          <Button
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending}
          >
            {snapshotMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              "Take Snapshot"
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {metricsQuery.isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="bg-card dark:bg-card">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-lg" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-8 w-20" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          : METRIC_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.key} className="bg-card dark:bg-card border border-border hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-lg bg-muted/50 dark:bg-muted/20 flex items-center justify-center">
                        <Icon className={`h-6 w-6 ${card.color}`} />
                      </div>
                      <div>
                        <p className="text-3xl font-bold text-foreground dark:text-foreground">
                          {formatValue(card.key, metrics?.[card.key])}
                        </p>
                        <p className="text-sm text-muted-foreground">{card.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {metricsQuery.isError && (
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive font-medium">Failed to load moat metrics</p>
            <p className="text-sm text-muted-foreground mt-1">Make sure you have admin access and the API is available.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => metricsQuery.refetch()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
