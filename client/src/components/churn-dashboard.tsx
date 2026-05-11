import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Users, Activity, TrendingDown } from "lucide-react";

interface ChurnRiskUser {
  userId: string;
  username: string;
  lastActiveAt: string;
  churnRisk: "high" | "medium" | "low";
  totalSessionsLast30d: number;
  winbackOfferSent: boolean;
}

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

function getRiskColor(risk: string) {
  const colorMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    high: "destructive",
    medium: "secondary",
    low: "outline",
  };
  return colorMap[risk] || "outline";
}

function getRiskLabel(risk: string): string {
  return risk.charAt(0).toUpperCase() + risk.slice(1);
}

export function ChurnDashboard() {
  const { data: churnUsers = [], isLoading } = useQuery<ChurnRiskUser[]>({
    queryKey: ["/api/admin/churn-risk"],
  });

  const totalAtRisk = churnUsers.length;
  const highRiskCount = churnUsers.filter((u) => u.churnRisk === "high").length;
  const mediumRiskCount = churnUsers.filter((u) => u.churnRisk === "medium").length;

  // Sort by risk level (high first, then medium)
  const sortedUsers = [...churnUsers].sort((a, b) => {
    const riskOrder = { high: 0, medium: 1, low: 2 };
    return riskOrder[a.churnRisk as keyof typeof riskOrder] - riskOrder[b.churnRisk as keyof typeof riskOrder];
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingDown className="h-6 w-6" />
            Churn Risk Dashboard
          </h2>
        </div>
        <div className="text-center py-10">
          <Activity className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-muted-foreground">Loading churn risk data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <TrendingDown className="h-6 w-6" />
          Churn Risk Dashboard
        </h2>
        <p className="text-muted-foreground mt-1">
          Monitor users at risk of churn and manage retention
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total At-Risk Users */}
        <Card className="dark:bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Total At-Risk Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAtRisk}</div>
            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-tight">need attention</p>
          </CardContent>
        </Card>

        {/* High Risk Count */}
        <Card className="dark:bg-card border-red-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              High Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {highRiskCount}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-tight">inactive 20+ days</p>
          </CardContent>
        </Card>

        {/* Medium Risk Count */}
        <Card className="dark:bg-card border-yellow-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-yellow-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              Medium Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">
              {mediumRiskCount}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-tight">inactive 10-20 days</p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* At-Risk Users Table */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" />
          At-Risk Users
        </h3>

        <Card className="dark:bg-card">
          <CardContent className="p-0">
            {sortedUsers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-muted-foreground text-sm uppercase tracking-widest">No at-risk users detected</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b">
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider h-10">Username</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider h-10">Last Active</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider h-10">Risk Level</TableHead>
                      <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider h-10">Sessions (30d)</TableHead>
                      <TableHead className="text-center text-[11px] font-bold uppercase tracking-wider h-10">Win-back</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedUsers.map((user) => (
                      <TableRow key={user.userId} className="hover:bg-muted/30">
                        <TableCell className="font-bold text-xs py-2">{user.username}</TableCell>
                        <TableCell className="text-[11px] text-muted-foreground uppercase tracking-tight py-2">
                          {getRelativeTime(user.lastActiveAt)}
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className={`text-[10px] h-5 px-1.5 font-bold uppercase tracking-wider ${
                            user.churnRisk === 'high' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
                            user.churnRisk === 'medium' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' : 
                            'bg-muted text-muted-foreground'
                          }`}>
                            {user.churnRisk}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold text-xs py-2">
                          {user.totalSessionsLast30d}
                        </TableCell>
                        <TableCell className="text-center py-2">
                          {user.winbackOfferSent ? (
                            <span className="inline-flex items-center rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-bold text-green-500 uppercase">
                              Sent
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground uppercase font-bold">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info Section */}
      {totalAtRisk > 0 && (
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                  Retention Insights
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {highRiskCount} users are highly at risk. Consider sending personalized win-back
                  offers, discounts, or content recommendations to re-engage them.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
