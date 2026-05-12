import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload, Plus, CheckCircle, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function SubmitContent() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState("audiobook");
  const [audioUrl, setAudioUrl] = useState("");
  const [contentUrl, setContentUrl] = useState("");
  const [genre, setGenre] = useState("");

  const { data: submissions = [] } = useQuery<any[]>({
    queryKey: ["/api/submissions"],
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/submissions", {
        title, author, description, contentType,
        audioUrl: audioUrl || null,
        contentUrl: contentUrl || null,
        genre: genre || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      toast({ title: "Content submitted!", description: "Your submission is pending review." });
      setOpen(false);
      setTitle(""); setAuthor(""); setDescription(""); setAudioUrl(""); setContentUrl(""); setGenre("");
    },
    onError: () => {
      toast({ title: "Failed to submit", variant: "destructive" });
    },
  });

  const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
    pending: { icon: Clock, color: "bg-yellow-500", label: "Pending Review" },
    approved: { icon: CheckCircle, color: "bg-green-500", label: "Approved" },
    rejected: { icon: XCircle, color: "bg-red-500", label: "Rejected" },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Submit Content
          </span>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Submit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Submit Your Content</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Share public domain readings or your original works with the community.
                </p>
                <Input placeholder="Title *" value={title} onChange={e => setTitle(e.target.value)} />
                <Input placeholder="Author *" value={author} onChange={e => setAuthor(e.target.value)} />
                <Textarea placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
                <Select value={contentType} onValueChange={setContentType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="audiobook">Audiobook</SelectItem>
                    <SelectItem value="ebook">Ebook</SelectItem>
                  </SelectContent>
                </Select>
                {contentType === "audiobook" && (
                  <Input placeholder="Audio URL (MP3, M4A)" value={audioUrl} onChange={e => setAudioUrl(e.target.value)} />
                )}
                {contentType === "ebook" && (
                  <Input placeholder="Content URL (EPUB, PDF, text)" value={contentUrl} onChange={e => setContentUrl(e.target.value)} />
                )}
                <Input placeholder="Genre (e.g., Fiction, Science)" value={genre} onChange={e => setGenre(e.target.value)} />
                <Button 
                  className="w-full" 
                  onClick={() => submitMutation.mutate()}
                  disabled={!title || !author || submitMutation.isPending}
                >
                  {submitMutation.isPending ? "Submitting..." : "Submit for Review"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No submissions yet. Share your content with the community!
          </p>
        ) : (
          <div className="space-y-3">
            {submissions.map((sub: any) => {
              const status = statusConfig[sub.status] || statusConfig.pending;
              const StatusIcon = status.icon;
              return (
                <div key={sub.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">{sub.title}</p>
                    <p className="text-xs text-muted-foreground">{sub.author} - {sub.contentType}</p>
                  </div>
                  <Badge className={`${status.color} text-white text-xs`}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {status.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
