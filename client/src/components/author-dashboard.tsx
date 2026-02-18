import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Upload, BookOpen, BarChart3, User, Edit, Trash2, Eye, Loader2,
  FileAudio, FileText, Image, Plus, CheckCircle, Clock, XCircle,
  TrendingUp, Users, Headphones, BookOpenCheck
} from "lucide-react";

interface AuthorProfileData {
  exists: boolean;
  profile?: {
    id: string;
    userId: string;
    displayName: string;
    bio: string | null;
    website: string | null;
    socialLinks: any;
    profileImage: string | null;
    isVerified: boolean;
    totalPlays: number;
    totalListeners: number;
    createdAt: string;
  };
}

interface BookSubmission {
  id: string;
  title: string;
  author: string;
  description: string | null;
  contentType: string;
  audioUrl: string | null;
  contentUrl: string | null;
  coverImage: string | null;
  genre: string | null;
  language: string | null;
  status: string;
  narrator: string | null;
  tags: string[] | null;
  duration: number | null;
  pageCount: number | null;
  totalPlays: number | null;
  totalReads: number | null;
  createdAt: string;
}

interface AnalyticsData {
  totalPlays: number;
  totalReads: number;
  totalCompletions: number;
  uniqueListeners: number;
  books: {
    id: string;
    title: string;
    contentType: string;
    status: string;
    totalPlays: number;
    totalReads: number;
    coverImage: string | null;
    createdAt: string;
  }[];
  playsByDay: { date: string; plays: number; reads: number }[];
}

const GENRES = [
  "Fiction", "Non-Fiction", "Mystery", "Romance", "Science Fiction",
  "Fantasy", "Biography", "Self-Help", "History", "Business",
  "Children", "Young Adult", "Horror", "Thriller", "Poetry",
  "Science", "Technology", "Philosophy", "Religion", "Travel",
];

export function AuthorDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [editingBook, setEditingBook] = useState<BookSubmission | null>(null);

  const { data: profileData, isLoading: profileLoading } = useQuery<AuthorProfileData>({
    queryKey: ["/api/author/profile"],
  });

  const { data: authorBooks, isLoading: booksLoading } = useQuery<BookSubmission[]>({
    queryKey: ["/api/author/books"],
    enabled: profileData?.exists === true,
  });

  const { data: analytics } = useQuery<AnalyticsData>({
    queryKey: ["/api/author/analytics"],
    enabled: profileData?.exists === true,
  });

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profileData?.exists && !showProfileSetup) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <BookOpen className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-3xl font-bold">Become an Author</h2>
        <p className="text-muted-foreground text-lg">
          Share your audiobooks and ebooks with thousands of listeners. Set up your author profile to start publishing.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
          <div className="text-center p-4">
            <Upload className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium">Upload Content</p>
          </div>
          <div className="text-center p-4">
            <BarChart3 className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium">Track Analytics</p>
          </div>
          <div className="text-center p-4">
            <Users className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium">Grow Audience</p>
          </div>
        </div>
        <Button size="lg" onClick={() => setShowProfileSetup(true)}>
          <Plus className="h-5 w-5 mr-2" />
          Create Author Profile
        </Button>
      </div>
    );
  }

  if (showProfileSetup || (!profileData?.exists)) {
    return (
      <ProfileSetupForm
        existingProfile={profileData?.profile}
        onComplete={() => {
          setShowProfileSetup(false);
          queryClient.invalidateQueries({ queryKey: ["/api/author/profile"] });
        }}
      />
    );
  }

  const profile = profileData.profile!;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {profile.displayName}
            {profile.isVerified && <CheckCircle className="h-5 w-5 text-blue-500" />}
          </h1>
          <p className="text-muted-foreground">Author Dashboard</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowProfileSetup(true)}>
            <Edit className="h-4 w-4 mr-1" />
            Edit Profile
          </Button>
          <Button size="sm" onClick={() => setShowUploadDialog(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Upload New
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={<Headphones className="h-5 w-5" />} label="Total Plays" value={analytics?.totalPlays || 0} />
        <StatCard icon={<BookOpenCheck className="h-5 w-5" />} label="Total Reads" value={analytics?.totalReads || 0} />
        <StatCard icon={<Users className="h-5 w-5" />} label="Unique Listeners" value={analytics?.uniqueListeners || 0} />
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Completions" value={analytics?.totalCompletions || 0} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">My Books</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          {booksLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !authorBooks?.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">No books yet</h3>
                <p className="text-muted-foreground mb-4">Upload your first audiobook or ebook to get started.</p>
                <Button onClick={() => setShowUploadDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Upload Your First Book
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {authorBooks.map((book) => (
                <BookListItem
                  key={book.id}
                  book={book}
                  onEdit={() => setEditingBook(book)}
                  onDelete={() => handleDeleteBook(book.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <AnalyticsView analytics={analytics} />
        </TabsContent>
      </Tabs>

      <UploadDialog
        open={showUploadDialog}
        onOpenChange={setShowUploadDialog}
        onSuccess={() => {
          setShowUploadDialog(false);
          queryClient.invalidateQueries({ queryKey: ["/api/author/books"] });
          queryClient.invalidateQueries({ queryKey: ["/api/author/analytics"] });
        }}
      />

      {editingBook && (
        <EditBookDialog
          book={editingBook}
          open={!!editingBook}
          onOpenChange={(open) => !open && setEditingBook(null)}
          onSuccess={() => {
            setEditingBook(null);
            queryClient.invalidateQueries({ queryKey: ["/api/author/books"] });
          }}
        />
      )}
    </div>
  );

  function handleDeleteBook(bookId: string) {
    if (!confirm("Are you sure you want to delete this book?")) return;
    apiRequest("DELETE", `/api/author/books/${bookId}`)
      .then(() => {
        toast({ title: "Book deleted" });
        queryClient.invalidateQueries({ queryKey: ["/api/author/books"] });
        queryClient.invalidateQueries({ queryKey: ["/api/author/analytics"] });
      })
      .catch(() => {
        toast({ title: "Failed to delete", variant: "destructive" });
      });
  }
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>
          <div>
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BookListItem({
  book,
  onEdit,
  onDelete,
}: {
  book: BookSubmission;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="w-16 h-20 rounded bg-muted flex-shrink-0 overflow-hidden">
            {book.coverImage ? (
              <img src={book.coverImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                {book.contentType === "audiobook" ? (
                  <FileAudio className="h-6 w-6 text-muted-foreground" />
                ) : (
                  <FileText className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold truncate">{book.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {book.contentType === "audiobook" ? "Audiobook" : "Ebook"}
                  {book.genre && ` · ${book.genre}`}
                  {book.language && ` · ${book.language}`}
                </p>
              </div>
              <Badge className={statusColors[book.status] || ""}>{book.status}</Badge>
            </div>
            {book.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{book.description}</p>
            )}
            <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Headphones className="h-3 w-3" />
                {(book.totalPlays || 0).toLocaleString()} plays
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {(book.totalReads || 0).toLocaleString()} reads
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(book.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit book">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete book" className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileSetupForm({
  existingProfile,
  onComplete,
}: {
  existingProfile?: AuthorProfileData["profile"];
  onComplete: () => void;
}) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(existingProfile?.displayName || "");
  const [bio, setBio] = useState(existingProfile?.bio || "");
  const [website, setWebsite] = useState(existingProfile?.website || "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/author/profile", {
        displayName,
        bio: bio || null,
        website: website || null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Profile saved" });
      onComplete();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save profile", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-lg mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>{existingProfile ? "Edit Profile" : "Set Up Author Profile"}</CardTitle>
          <CardDescription>Tell readers about yourself</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="displayName">Display Name *</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your author name"
            />
          </div>
          <div>
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Write a short bio..."
              rows={4}
            />
          </div>
          <div>
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yourwebsite.com"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || displayName.trim().length < 2}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {existingProfile ? "Save Changes" : "Create Profile"}
            </Button>
            {existingProfile && (
              <Button variant="outline" onClick={onComplete}>Cancel</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [contentType, setContentType] = useState("audiobook");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [language, setLanguage] = useState("English");
  const [narrator, setNarrator] = useState("");
  const [tags, setTags] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [ebookFile, setEbookFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setGenre("");
    setLanguage("English");
    setNarrator("");
    setTags("");
    setAudioFile(null);
    setEbookFile(null);
    setCoverFile(null);
    setIsUploading(false);
    setUploadProgress("");
  };

  const uploadFileToStorage = async (file: File, uploadType: string): Promise<string> => {
    setUploadProgress(`Uploading ${uploadType}...`);
    const urlRes = await apiRequest("POST", "/api/author/upload-url", {
      name: file.name,
      size: file.size,
      contentType: file.type,
      uploadType,
    });
    const { uploadURL, objectPath } = await urlRes.json();

    await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });

    return objectPath;
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (contentType === "audiobook" && !audioFile) {
      toast({ title: "Please select an audio file", variant: "destructive" });
      return;
    }
    if (contentType === "ebook" && !ebookFile) {
      toast({ title: "Please select an ebook file", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      let audioUrl = null;
      let contentUrl = null;
      let coverImage = null;

      if (audioFile) {
        audioUrl = await uploadFileToStorage(audioFile, "audio");
      }
      if (ebookFile) {
        contentUrl = await uploadFileToStorage(ebookFile, "ebook");
      }
      if (coverFile) {
        coverImage = await uploadFileToStorage(coverFile, "cover");
      }

      setUploadProgress("Saving metadata...");
      await apiRequest("POST", "/api/author/books", {
        title: title.trim(),
        description: description || null,
        contentType,
        genre: genre || null,
        language,
        audioUrl,
        contentUrl,
        coverImage,
        narrator: narrator || null,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      });

      toast({ title: "Book submitted for review!" });
      resetForm();
      onSuccess();
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      setUploadProgress("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload New Book</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Content Type</Label>
            <Select value={contentType} onValueChange={setContentType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="audiobook">Audiobook</SelectItem>
                <SelectItem value="ebook">Ebook</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="upload-title">Title *</Label>
            <Input id="upload-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Book title" />
          </div>

          <div>
            <Label htmlFor="upload-desc">Description</Label>
            <Textarea id="upload-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Book description..." rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Genre</Label>
              <Select value={genre} onValueChange={setGenre}>
                <SelectTrigger><SelectValue placeholder="Select genre" /></SelectTrigger>
                <SelectContent>
                  {GENRES.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="upload-lang">Language</Label>
              <Input id="upload-lang" value={language} onChange={(e) => setLanguage(e.target.value)} />
            </div>
          </div>

          {contentType === "audiobook" && (
            <div>
              <Label htmlFor="upload-narrator">Narrator</Label>
              <Input id="upload-narrator" value={narrator} onChange={(e) => setNarrator(e.target.value)} placeholder="Narrator name" />
            </div>
          )}

          <div>
            <Label htmlFor="upload-tags">Tags (comma-separated)</Label>
            <Input id="upload-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="adventure, classic, best-seller" />
          </div>

          <Separator />

          {contentType === "audiobook" && (
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <FileAudio className="h-4 w-4" />
                Audio File * (MP3, M4A, WAV - max 500MB)
              </Label>
              <Input
                type="file"
                accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav"
                onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              />
              {audioFile && <p className="text-xs text-muted-foreground mt-1">{audioFile.name} ({(audioFile.size / 1024 / 1024).toFixed(1)} MB)</p>}
            </div>
          )}

          {contentType === "ebook" && (
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4" />
                Ebook File * (PDF, EPUB - max 50MB)
              </Label>
              <Input
                type="file"
                accept=".pdf,.epub,application/pdf,application/epub+zip"
                onChange={(e) => setEbookFile(e.target.files?.[0] || null)}
              />
              {ebookFile && <p className="text-xs text-muted-foreground mt-1">{ebookFile.name} ({(ebookFile.size / 1024 / 1024).toFixed(1)} MB)</p>}
            </div>
          )}

          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Image className="h-4 w-4" />
              Cover Image (JPEG, PNG, WebP - max 5MB)
            </Label>
            <Input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
            />
            {coverFile && <p className="text-xs text-muted-foreground mt-1">{coverFile.name}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {uploadProgress}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Submit for Review
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditBookDialog({
  book,
  open,
  onOpenChange,
  onSuccess,
}: {
  book: BookSubmission;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(book.title);
  const [description, setDescription] = useState(book.description || "");
  const [genre, setGenre] = useState(book.genre || "");
  const [language, setLanguage] = useState(book.language || "English");
  const [narrator, setNarrator] = useState(book.narrator || "");
  const [tags, setTags] = useState(book.tags?.join(", ") || "");

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/author/books/${book.id}`, {
        title: title.trim(),
        description: description || null,
        genre: genre || null,
        language,
        narrator: narrator || null,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Book updated" });
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Book Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-desc">Description</Label>
            <Textarea id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Genre</Label>
              <Select value={genre} onValueChange={setGenre}>
                <SelectTrigger><SelectValue placeholder="Select genre" /></SelectTrigger>
                <SelectContent>
                  {GENRES.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-lang">Language</Label>
              <Input id="edit-lang" value={language} onChange={(e) => setLanguage(e.target.value)} />
            </div>
          </div>
          {book.contentType === "audiobook" && (
            <div>
              <Label htmlFor="edit-narrator">Narrator</Label>
              <Input id="edit-narrator" value={narrator} onChange={(e) => setNarrator(e.target.value)} />
            </div>
          )}
          <div>
            <Label htmlFor="edit-tags">Tags (comma-separated)</Label>
            <Input id="edit-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AnalyticsView({ analytics }: { analytics?: AnalyticsData }) {
  if (!analytics) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Analytics will appear once your content gets plays and reads.</p>
        </CardContent>
      </Card>
    );
  }

  const maxPlays = Math.max(...(analytics.playsByDay.map((d) => d.plays + d.reads) || [1]), 1);

  return (
    <div className="space-y-6">
      {analytics.playsByDay.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Activity (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-40">
              {analytics.playsByDay.map((day, i) => {
                const height = Math.max(((day.plays + day.reads) / maxPlays) * 100, 4);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-primary rounded-t transition-all hover:bg-primary/80"
                      style={{ height: `${height}%` }}
                      title={`${day.date}: ${day.plays} plays, ${day.reads} reads`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>{analytics.playsByDay[0]?.date || ""}</span>
              <span>{analytics.playsByDay[analytics.playsByDay.length - 1]?.date || ""}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Book Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.books.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No books published yet.</p>
          ) : (
            <div className="space-y-3">
              {analytics.books.map((book) => (
                <div key={book.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-10 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {book.coverImage ? (
                      <img src={book.coverImage} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{book.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {book.totalPlays} plays · {book.totalReads} reads
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">{book.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
