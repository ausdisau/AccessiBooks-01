import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Server,
  Database,
  Users,
  Clock,
  RefreshCw,
  BookOpen,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface HealthData {
  totalBooks: number;
  totalUsers: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
  };
  uptime: number;
  seederStatus: {
    source: string;
    status: string;
    totalSeeded: number;
  }[];
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function getStatusColor(status: string) {
  const colorMap: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    running: "default",
    paused: "secondary",
    completed: "outline",
    error: "destructive",
    idle: "outline",
  };
  return colorMap[status] || "outline";
}

function getStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function AdminHealthDashboard() {
  const { toast } = useToast();

  const { data: health, isLoading, refetch } = useQuery<HealthData>({
    queryKey: ["/api/admin/health"],
  });

  const startSeederMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/seed/start", {}),
    onSuccess: () => {
      toast({
        title: "Seeder started",
        description: "Catalog seeding has been initiated",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/health"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start seeder",
        variant: "destructive",
      });
    },
  });

  const stopSeederMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/seed/stop", {}),
    onSuccess: () => {
      toast({
        title: "Seeder stopped",
        description: "Catalog seeding has been stopped",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/health"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to stop seeder",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Server className="h-6 w-6" />
            System Health
          </h2>
        </div>
        <div className="text-center py-10">
          <Activity className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-muted-foreground">Loading health data...</p>
        </div>
      </div>
    );
  }

  const memoryPercent = health
    ? Math.round((health.memoryUsage.heapUsed / health.memoryUsage.heapTotal) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Server className="h-6 w-6" />
            System Health
          </h2>
          <p className="text-muted-foreground mt-1">
            Monitor system resources and catalog seeding status
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* System Overview Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Books */}
        <Card className="dark:bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              Total Books
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health?.totalBooks || 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-tight">in catalog</p>
          </CardContent>
        </Card>

        {/* Total Users */}
        <Card className="dark:bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health?.totalUsers || 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-tight">registered</p>
          </CardContent>
        </Card>

        {/* Memory Usage */}
        <Card className="dark:bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Database className="h-3.5 w-3.5" />
              Memory Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight">
                <span className="text-muted-foreground">
                  {health?.memoryUsage.heapUsed || 0}MB / {health?.memoryUsage.heapTotal || 0}MB
                </span>
                <span>{memoryPercent}%</span>
              </div>
              <Progress value={memoryPercent} className="h-1.5" />
            </div>
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card className="dark:bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Uptime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {health ? formatUptime(health.uptime) : "N/A"}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-tight">server running</p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Catalog Seeder Status Table */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Catalog Seeder Status
        </h3>

        <Card className="dark:bg-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b">
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider h-10">Source</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider h-10">Status</TableHead>
                    <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider h-10">Titles Seeded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {health?.seederStatus.map((seeder) => (
                    <TableRow key={seeder.source} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-xs py-2">{seeder.source}</TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className={`text-[10px] h-5 px-1.5 font-bold uppercase tracking-wider ${
                          seeder.status === 'running' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 
                          seeder.status === 'error' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
                          'bg-muted text-muted-foreground'
                        }`}>
                          {seeder.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-xs py-2">
                        {seeder.totalSeeded.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Quick Actions
        </h3>

        <Card className="dark:bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => startSeederMutation.mutate()}
                disabled={startSeederMutation.isPending}
                className="gap-2"
              >
                {startSeederMutation.isPending && (
                  <Activity className="h-4 w-4 animate-spin" />
                )}
                Start Seeder
              </Button>

              <Button
                variant="outline"
                onClick={() => stopSeederMutation.mutate()}
                disabled={stopSeederMutation.isPending}
                className="gap-2"
              >
                {stopSeederMutation.isPending && (
                  <Activity className="h-4 w-4 animate-spin" />
                )}
                Stop Seeder
              </Button>

              <Button
                variant="ghost"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/admin/health"] });
                  toast({
                    title: "Stats refreshed",
                    description: "Health data has been updated",
                  });
                }}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh Stats
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
