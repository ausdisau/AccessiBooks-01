import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookAuslanCompanion } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Hand, Upload, Trash2, Eye, EyeOff, Loader2 } from "lucide-react";

const ACCEPTED_VIDEO = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // keep in sync with the server cap

function publicCompanionsKey(bookId: string) {
  return [`/api/books/${bookId}/auslan-companions`];
}
function adminCompanionsKey(bookId: string) {
  return [`/api/admin/books/${bookId}/auslan-companions`];
}

/**
 * Viewer shown to all users wherever a title is read/played. Renders the
 * human-produced Auslan sign-language video companion(s) alongside the book.
 * Renders nothing when no published companion exists.
 */
export function AuslanCompanionPanel({ bookId }: { bookId: string }) {
  const { data: companions = [], isLoading } = useQuery<BookAuslanCompanion[]>({
    queryKey: publicCompanionsKey(bookId),
  });

  if (isLoading || companions.length === 0) return null;

  return (
    <Card className="p-4 space-y-3" data-testid="auslan-companion-panel">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Hand className="h-4 w-4 text-indigo-600" aria-hidden="true" />
        Watch in Auslan
      </h3>
      <div className="space-y-4">
        {companions.map((c) => (
          <figure key={c.id} className="space-y-1.5">
            <video
              controls
              preload="metadata"
              src={c.objectPath}
              className="w-full rounded-md bg-black aspect-video"
              aria-label={`Auslan sign-language companion: ${c.title}`}
              data-testid={`auslan-video-${c.id}`}
            />
            <figcaption className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{c.title}</span>
              {c.description ? <span> — {c.description}</span> : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </Card>
  );
}

interface ManagerProps {
  bookId: string;
}

/**
 * Admin-only manager: upload a new companion video (presigned two-step upload),
 * publish/unpublish, and delete. Surfaced next to the viewer for admins.
 */
export function AuslanCompanionManager({ bookId }: ManagerProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [publishNow, setPublishNow] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  const { data: companions = [], isLoading } = useQuery<BookAuslanCompanion[]>({
    queryKey: adminCompanionsKey(bookId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: adminCompanionsKey(bookId) });
    qc.invalidateQueries({ queryKey: publicCompanionsKey(bookId) });
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setFile(null);
    setPublishNow(true);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ title: "Choose a video file", variant: "destructive" });
      return;
    }
    if (!ACCEPTED_VIDEO.includes(file.type)) {
      toast({ title: "Unsupported format", description: "Use MP4, WebM, OGG, or MOV.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      toast({ title: "File too large", description: "Videos must be under 500MB.", variant: "destructive" });
      return;
    }
    if (!title.trim()) {
      toast({ title: "Add a title", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const urlRes = await apiRequest("POST", `/api/admin/books/${bookId}/auslan-companions/upload-url`, {
        name: file.name,
        contentType: file.type,
        size: file.size,
      });
      const { uploadURL, objectPath } = await urlRes.json();

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) throw new Error("Upload failed");

      await apiRequest("POST", `/api/admin/books/${bookId}/auslan-companions`, {
        title: title.trim(),
        description: description.trim() || undefined,
        objectPath,
        mimeType: file.type,
        sizeBytes: file.size,
        status: publishNow ? "published" : "draft",
      });

      toast({ title: publishNow ? "Auslan companion published" : "Auslan companion saved as draft" });
      resetForm();
      invalidate();
    } catch (err: any) {
      toast({ title: "Could not upload companion", description: err?.message ?? "Try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BookAuslanCompanion["status"] }) =>
      apiRequest("PATCH", `/api/admin/books/${bookId}/auslan-companions/${id}`, { status }),
    onSuccess: () => invalidate(),
    onError: (err: any) =>
      toast({ title: "Update failed", description: err?.message ?? "Try again.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/books/${bookId}/auslan-companions/${id}`),
    onSuccess: () => {
      toast({ title: "Companion deleted" });
      invalidate();
    },
    onError: (err: any) =>
      toast({ title: "Delete failed", description: err?.message ?? "Try again.", variant: "destructive" }),
  });

  return (
    <Card className="p-4 space-y-4 border-dashed" data-testid="auslan-companion-manager">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Hand className="h-4 w-4 text-indigo-600" aria-hidden="true" />
        Auslan companions <Badge variant="secondary">Admin</Badge>
      </h3>

      <div className="space-y-2">
        <label className="text-xs font-medium" htmlFor={`auslan-title-${bookId}`}>Title</label>
        <Input
          id={`auslan-title-${bookId}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={240}
          placeholder="e.g. Chapter 1 — Auslan retelling"
          data-testid="input-auslan-title"
        />
        <label className="text-xs font-medium" htmlFor={`auslan-desc-${bookId}`}>Description (optional)</label>
        <Textarea
          id={`auslan-desc-${bookId}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder="Notes about this signed companion"
          data-testid="input-auslan-description"
        />
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_VIDEO.join(",")}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
          data-testid="input-auslan-file"
          aria-label="Auslan companion video file"
        />
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={publishNow}
            onChange={(e) => setPublishNow(e.target.checked)}
            data-testid="checkbox-auslan-publish"
          />
          Publish immediately (visible to all readers)
        </label>
        <Button onClick={handleUpload} disabled={isUploading} size="sm" data-testid="button-auslan-upload">
          {isUploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4 mr-1.5" aria-hidden="true" />}
          {isUploading ? "Uploading…" : "Upload companion"}
        </Button>
      </div>

      <div className="space-y-2 border-t pt-3">
        {isLoading && <p className="text-xs text-muted-foreground">Loading companions…</p>}
        {!isLoading && companions.length === 0 && (
          <p className="text-xs text-muted-foreground">No companions yet.</p>
        )}
        {companions.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 text-sm" data-testid={`auslan-row-${c.id}`}>
            <div className="min-w-0">
              <p className="truncate font-medium">{c.title}</p>
              <p className="text-xs text-muted-foreground">{c.language}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant={c.status === "published" ? "default" : "secondary"}>{c.status}</Badge>
              {c.status === "published" ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => statusMutation.mutate({ id: c.id, status: "archived" })}
                  disabled={statusMutation.isPending}
                  aria-label={`Unpublish ${c.title}`}
                  title="Unpublish"
                >
                  <EyeOff className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => statusMutation.mutate({ id: c.id, status: "published" })}
                  disabled={statusMutation.isPending}
                  aria-label={`Publish ${c.title}`}
                  title="Publish"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive"
                onClick={() => {
                  if (confirm(`Delete "${c.title}"? This cannot be undone.`)) deleteMutation.mutate(c.id);
                }}
                disabled={deleteMutation.isPending}
                aria-label={`Delete ${c.title}`}
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
