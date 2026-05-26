import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Shield, AlertTriangle, CheckCircle, XCircle, Eye, Flag, Loader2, CalendarPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function CreateEventPanel() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("group_listen");
  const [hostDisplayName, setHostDisplayName] = useState("AccessiBooks");
  const [scheduledStartAt, setScheduledStartAt] = useState("");
  const [scheduledEndAt, setScheduledEndAt] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/events", {
        eventType,
        title,
        description,
        hostDisplayName,
        scheduledStartAt: new Date(scheduledStartAt).toISOString(),
        scheduledEndAt: new Date(scheduledEndAt).toISOString(),
      }),
    onSuccess: () => {
      toast({ title: "Event scheduled", description: "Listeners can now RSVP from the Events page." });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setOpen(false);
      setTitle(""); setDescription(""); setScheduledStartAt(""); setScheduledEndAt("");
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't create event", description: err.message, variant: "destructive" });
    },
  });

  const valid = title.trim() && description.trim() && scheduledStartAt && scheduledEndAt &&
    new Date(scheduledEndAt).getTime() > new Date(scheduledStartAt).getTime();

  return (
    <Card data-testid="admin-events-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5" aria-hidden="true" />
              Live events
            </CardTitle>
            <CardDescription>Schedule listening parties, author Q&amp;As, and live readings.</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="btn-create-event">Create event</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New live event</DialogTitle>
                <DialogDescription>Visible to all members once published.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="evt-title">Title</Label>
                  <Input id="evt-title" value={title} onChange={e => setTitle(e.target.value)} data-testid="input-event-title" />
                </div>
                <div>
                  <Label htmlFor="evt-desc">Description</Label>
                  <Textarea id="evt-desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} data-testid="input-event-desc" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="evt-type">Type</Label>
                    <select
                      id="evt-type"
                      value={eventType}
                      onChange={e => setEventType(e.target.value)}
                      className="w-full border rounded-md h-10 px-3 bg-background"
                      data-testid="input-event-type"
                    >
                      <option value="group_listen">Group listen</option>
                      <option value="author_qa">Author Q&amp;A</option>
                      <option value="launch_party">Launch party</option>
                      <option value="community_ama">Community AMA</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="evt-host">Host name</Label>
                    <Input id="evt-host" value={hostDisplayName} onChange={e => setHostDisplayName(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="evt-start">Starts</Label>
                    <Input id="evt-start" type="datetime-local" value={scheduledStartAt} onChange={e => setScheduledStartAt(e.target.value)} data-testid="input-event-start" />
                  </div>
                  <div>
                    <Label htmlFor="evt-end">Ends</Label>
                    <Input id="evt-end" type="datetime-local" value={scheduledEndAt} onChange={e => setScheduledEndAt(e.target.value)} data-testid="input-event-end" />
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={!valid || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                  data-testid="btn-submit-event"
                >
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Schedule event
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
    </Card>
  );
}

interface ContentReporter {
  id: string;
  username: string;
  email: string;
}

interface ContentReport {
  id: string;
  reporterId: string;
  reporter: ContentReporter;
  contentType: string;
  contentId: string;
  reason: string;
  description?: string;
  status: "pending" | "approved" | "removed" | "dismissed";
  createdAt: string;
  details?: {
    title?: string;
    author?: string;
  };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusIcon(status: string) {
  const iconProps = { className: "h-4 w-4" };
  switch (status) {
    case "pending":
      return <AlertTriangle {...iconProps} className="text-yellow-600" />;
    case "approved":
      return <CheckCircle {...iconProps} className="text-green-600" />;
    case "removed":
      return <XCircle {...iconProps} className="text-red-600" />;
    case "dismissed":
      return <Eye {...iconProps} className="text-gray-600" />;
    default:
      return <Flag {...iconProps} />;
  }
}

function getStatusBadge(status: string) {
  const variants: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    approved: "bg-green-500/10 text-green-500 border-green-500/20",
    removed: "bg-red-500/10 text-red-500 border-red-500/20",
    dismissed: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  };
  return (
    <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-wider ${variants[status] || ""}`}>
      {status}
    </Badge>
  );
}

function ReportActionButtons({
  reportId,
  status,
  onActionComplete,
}: {
  reportId: string;
  status: string;
  onActionComplete: () => void;
}) {
  const { toast } = useToast();

  const approveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/admin/reports/${reportId}`, {
        status: "approved",
      }),
    onSuccess: () => {
      toast({
        title: "Report Approved",
        description: "Report has been marked as reviewed",
      });
      onActionComplete();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve report",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/admin/reports/${reportId}`, {
        status: "removed",
      }),
    onSuccess: () => {
      toast({
        title: "Content Removed",
        description: "Content has been removed",
      });
      onActionComplete();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove content",
        variant: "destructive",
      });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/admin/reports/${reportId}`, {
        status: "dismissed",
      }),
    onSuccess: () => {
      toast({
        title: "Report Dismissed",
        description: "Report has been dismissed",
      });
      onActionComplete();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to dismiss report",
        variant: "destructive",
      });
    },
  });

  const isLoading =
    approveMutation.isPending ||
    removeMutation.isPending ||
    dismissMutation.isPending;

  return (
    <div className="flex gap-2 flex-wrap">
      <Button
        size="sm"
        variant="outline"
        onClick={() => approveMutation.mutate()}
        disabled={isLoading || status !== "pending"}
      >
        {approveMutation.isPending && (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        )}
        Approve
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => removeMutation.mutate()}
        disabled={isLoading || status === "removed"}
      >
        {removeMutation.isPending && (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        )}
        Remove Content
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => dismissMutation.mutate()}
        disabled={isLoading}
      >
        {dismissMutation.isPending && (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        )}
        Dismiss
      </Button>
    </div>
  );
}

function ReportCard({
  report,
  onActionComplete,
}: {
  report: ContentReport;
  onActionComplete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border bg-card hover:bg-muted/30 transition-colors rounded-lg overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
                {report.contentType}
              </span>
              {getStatusBadge(report.status)}
            </div>
            <p className="text-sm font-medium leading-none mb-1">
              Reported by {report.reporter?.username || report.reporter?.email}
            </p>
            <p className="text-xs text-muted-foreground font-medium">{report.reason}</p>
            <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-tight">
              {formatDate(report.createdAt)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setExpanded(!expanded)}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>

        {expanded && (
          <div className="pt-3 mt-3 border-t border-border animate-in fade-in slide-in-from-top-1">
            <div className="grid gap-4 mb-4">
              {report.description && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                    Description
                  </p>
                  <p className="text-sm">{report.description}</p>
                </div>
              )}
              {report.details?.title && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                    Content
                  </p>
                  <p className="text-sm font-medium">
                    {report.details.title}
                    {report.details.author && <span className="text-muted-foreground font-normal ml-1">by {report.details.author}</span>}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                  Content ID
                </p>
                <p className="text-xs font-mono bg-muted p-1 rounded inline-block">{report.contentId}</p>
              </div>
            </div>
            <ReportActionButtons
              reportId={report.id}
              status={report.status}
              onActionComplete={onActionComplete}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminModerationPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "pending" | "reviewed">("all");

  const { data: reports, isLoading, error } = useQuery<ContentReport[]>({
    queryKey: ["/api/admin/reports"],
    retry: false,
  });

  const handleActionComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
  };

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Access Denied</h3>
              <p className="text-sm text-muted-foreground">
                You do not have permission to access the moderation panel.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredReports =
    filter === "all"
      ? reports || []
      : filter === "pending"
        ? (reports || []).filter((r) => r.status === "pending")
        : (reports || []).filter((r) => r.status !== "pending");

  const counts = {
    all: reports?.length || 0,
    pending: (reports || []).filter((r) => r.status === "pending").length,
    reviewed: (reports || []).filter((r) => r.status !== "pending").length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 operator-shell">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="rounded-full bg-primary/10 p-3">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Moderation</h1>
          <p className="text-muted-foreground mt-1">
            Review and manage user reports for inappropriate content
          </p>
        </div>
      </div>

      {/* Admin event scheduling */}
      <CreateEventPanel />

      {/* Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="all">
            All
            <Badge variant="secondary" className="ml-2">
              {counts.all}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending
            <Badge variant="secondary" className="ml-2">
              {counts.pending}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="reviewed">
            Reviewed
            <Badge variant="secondary" className="ml-2">
              {counts.reviewed}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Reports List */}
        <TabsContent value={filter} className="space-y-4 mt-6">
          {isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ) : filteredReports.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Flag className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="font-semibold mb-2">No Reports</h3>
                  <p className="text-sm text-muted-foreground">
                    {filter === "pending"
                      ? "No pending reports to review"
                      : "No reports found"}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredReports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onActionComplete={handleActionComplete}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
