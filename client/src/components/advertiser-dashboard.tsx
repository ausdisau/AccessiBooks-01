import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Plus, Mic, Square, Play, Pause, Upload, Trash2, BarChart3,
  DollarSign, Eye, MousePointer, Clock, Target, CheckCircle,
  AlertCircle, Loader2, Volume2, StopCircle, X
} from "lucide-react";

interface Campaign {
  id: string;
  advertiserId: number;
  name: string;
  description: string | null;
  status: string;
  budgetCents: number;
  spentCents: number;
  cpmBidCents: number;
  impressions: number;
  clicks: number;
  targetGenres: string[] | null;
  targetTimeSlots: string[] | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Creative {
  id: string;
  campaignId: string;
  name: string;
  audioUrl: string;
  duration: number;
  mimeType: string;
  fileSize: number | null;
  isRecorded: boolean;
  clickThroughUrl: string | null;
  companionImageUrl: string | null;
  status: string;
  createdAt: string;
}

interface CampaignStats {
  impressions: number;
  clicks: number;
  spent: number;
  completions: number;
  quartile25: number;
  quartile50: number;
  quartile75: number;
  budgetRemaining: number;
  ctr: string;
  completionRate: string;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    draft: "bg-gray-500/20 text-gray-400",
    active: "bg-green-500/20 text-green-400",
    paused: "bg-yellow-500/20 text-yellow-400",
    completed: "bg-blue-500/20 text-blue-400",
    pending: "bg-orange-500/20 text-orange-400",
    approved: "bg-green-500/20 text-green-400",
    rejected: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[status] || "bg-gray-500/20 text-gray-400"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function AudioRecorder({ onRecordingComplete }: { onRecordingComplete: (blob: Blob, duration: number) => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimeRef = useRef(0);

  const updateLevel = useCallback(() => {
    if (analyserRef.current) {
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(data);
      const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
      setAudioLevel(Math.min(100, (avg / 128) * 100));
    }
    animFrameRef.current = requestAnimationFrame(updateLevel);
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        if (timerRef.current) clearInterval(timerRef.current);
        const finalTime = recordingTimeRef.current;
        onRecordingComplete(blob, finalTime);
        stream.getTracks().forEach(t => t.stop());
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        audioCtx.close();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimeRef.current = 0;

      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime(recordingTimeRef.current);
      }, 1000);

      updateLevel();
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setAudioLevel(0);
    }
  };

  const togglePause = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
      setIsPaused(false);
    } else {
      mediaRecorderRef.current.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      setIsPaused(true);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="space-y-4 p-4 border border-border rounded-lg bg-card" role="region" aria-label="Audio recorder">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className={`h-5 w-5 ${isRecording ? "text-red-500 animate-pulse" : "text-muted-foreground"}`} aria-hidden="true" />
          <span className="font-medium">Record Audio Ad</span>
        </div>
        {isRecording && (
          <span className="text-sm font-mono text-red-500" aria-live="polite">
            {formatTime(recordingTime)}
          </span>
        )}
      </div>

      {isRecording && (
        <div className="h-3 bg-muted rounded-full overflow-hidden" role="meter" aria-label="Audio level" aria-valuenow={audioLevel}>
          <div
            className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-75"
            style={{ width: `${audioLevel}%` }}
          />
        </div>
      )}

      <div className="flex gap-2">
        {!isRecording ? (
          <Button onClick={startRecording} variant="default" className="gap-2" aria-label="Start recording">
            <Mic className="h-4 w-4" aria-hidden="true" />
            Start Recording
          </Button>
        ) : (
          <>
            <Button onClick={togglePause} variant="outline" className="gap-2" aria-label={isPaused ? "Resume recording" : "Pause recording"}>
              {isPaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
              {isPaused ? "Resume" : "Pause"}
            </Button>
            <Button onClick={stopRecording} variant="destructive" className="gap-2" aria-label="Stop recording">
              <Square className="h-4 w-4" aria-hidden="true" />
              Stop
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Record an audio ad directly in your browser. Recommended length: 15-30 seconds.</p>
    </div>
  );
}

function AudioPreview({ src, onRemove }: { src: string; onRemove?: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  return (
    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg" role="region" aria-label="Audio preview">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (audioRef.current) {
            if (isPlaying) {
              audioRef.current.pause();
            } else {
              audioRef.current.play();
            }
          }
        }}
        aria-label={isPlaying ? "Pause preview" : "Play preview"}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <div className="flex-1">
        <Progress value={duration > 0 ? (currentTime / duration) * 100 : 0} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{Math.floor(currentTime)}s</span>
          <span>{Math.floor(duration)}s</span>
        </div>
      </div>
      {onRemove && (
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label="Remove audio">
          <X className="h-4 w-4" />
        </Button>
      )}
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
      />
    </div>
  );
}

function CampaignForm({ campaign, onSaved }: { campaign?: Campaign; onSaved: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(campaign?.name || "");
  const [description, setDescription] = useState(campaign?.description || "");
  const [budgetDollars, setBudgetDollars] = useState(campaign ? (campaign.budgetCents / 100).toString() : "");
  const [cpmDollars, setCpmDollars] = useState(campaign ? (campaign.cpmBidCents / 100).toString() : "");
  const [targetGenres, setTargetGenres] = useState(campaign?.targetGenres?.join(", ") || "");
  const [startDate, setStartDate] = useState(campaign?.startDate?.split("T")[0] || "");
  const [endDate, setEndDate] = useState(campaign?.endDate?.split("T")[0] || "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        description: description || null,
        budgetCents: Math.round(parseFloat(budgetDollars) * 100),
        cpmBidCents: Math.round(parseFloat(cpmDollars) * 100),
        targetGenres: targetGenres ? targetGenres.split(",").map(g => g.trim()).filter(Boolean) : null,
        startDate: startDate || null,
        endDate: endDate || null,
      };
      if (campaign) {
        return apiRequest("PATCH", `/api/self-serve-ads/campaigns/${campaign.id}`, body);
      }
      return apiRequest("POST", "/api/self-serve-ads/campaigns", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/self-serve-ads/campaigns"] });
      toast({ title: campaign ? "Campaign updated" : "Campaign created" });
      onSaved();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="campaign-name">Campaign Name</Label>
        <Input id="campaign-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Audio Campaign" />
      </div>
      <div>
        <Label htmlFor="campaign-desc">Description (optional)</Label>
        <Textarea id="campaign-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of your campaign" rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="campaign-budget">Total Budget ($)</Label>
          <Input id="campaign-budget" type="number" step="0.01" min="1" value={budgetDollars} onChange={(e) => setBudgetDollars(e.target.value)} placeholder="50.00" />
          <p className="text-xs text-muted-foreground mt-1">Minimum $1.00</p>
        </div>
        <div>
          <Label htmlFor="campaign-cpm">CPM Bid ($)</Label>
          <Input id="campaign-cpm" type="number" step="0.01" min="0.50" value={cpmDollars} onChange={(e) => setCpmDollars(e.target.value)} placeholder="2.00" />
          <p className="text-xs text-muted-foreground mt-1">Cost per 1,000 impressions. Min $0.50</p>
        </div>
      </div>
      <div>
        <Label htmlFor="campaign-genres">Target Genres (optional, comma-separated)</Label>
        <Input id="campaign-genres" value={targetGenres} onChange={(e) => setTargetGenres(e.target.value)} placeholder="fiction, science, history" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="campaign-start">Start Date (optional)</Label>
          <Input id="campaign-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="campaign-end">End Date (optional)</Label>
          <Input id="campaign-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <Button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending || !name || !budgetDollars || !cpmDollars}
        className="w-full"
      >
        {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
        {campaign ? "Update Campaign" : "Create Campaign"}
      </Button>
    </div>
  );
}

function CreativeManager({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [creativeName, setCreativeName] = useState("");
  const [clickUrl, setClickUrl] = useState("");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: creatives = [], isLoading } = useQuery<Creative[]>({
    queryKey: ["/api/self-serve-ads/campaigns", campaignId, "creatives"],
    queryFn: async () => {
      const res = await fetch(`/api/self-serve-ads/campaigns/${campaignId}/creatives`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load creatives");
      return res.json();
    },
  });

  const handleRecordingComplete = (blob: Blob, duration: number) => {
    setRecordedBlob(blob);
    setRecordedDuration(duration);
    setRecordedUrl(URL.createObjectURL(blob));
    setUploadedFile(null);
    setUploadedUrl(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setUploadedUrl(URL.createObjectURL(file));
    setRecordedBlob(null);
    setRecordedUrl(null);
  };

  const uploadAndCreateCreative = async () => {
    const audioSource = recordedBlob || uploadedFile;
    if (!audioSource || !creativeName) return;

    setUploading(true);
    try {
      const contentType = audioSource instanceof File ? audioSource.type : "audio/webm";
      const fileName = audioSource instanceof File ? audioSource.name : `recording-${Date.now()}.webm`;

      const uploadRes = await apiRequest("POST", "/api/self-serve-ads/upload-url", {
        fileName,
        contentType,
        fileSize: audioSource.size,
      });
      const { uploadUrl } = await uploadRes.json();

      await fetch(uploadUrl, {
        method: "PUT",
        body: audioSource,
        headers: { "Content-Type": contentType },
      });

      const urlObj = new URL(uploadUrl);
      const objectPath = urlObj.pathname;

      const normalizeRes = await apiRequest("POST", `/api/self-serve-ads/campaigns/${campaignId}/creatives`, {
        name: creativeName,
        audioUrl: objectPath,
        duration: recordedDuration || 0,
        mimeType: contentType,
        fileSize: audioSource.size,
        isRecorded: !!recordedBlob,
        clickThroughUrl: clickUrl || null,
      });

      if (normalizeRes.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/self-serve-ads/campaigns", campaignId, "creatives"] });
        toast({ title: "Creative added successfully" });
        resetForm();
        setShowAddDialog(false);
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (creativeId: string) => {
      return apiRequest("DELETE", `/api/self-serve-ads/campaigns/${campaignId}/creatives/${creativeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/self-serve-ads/campaigns", campaignId, "creatives"] });
      toast({ title: "Creative removed" });
    },
  });

  const resetForm = () => {
    setCreativeName("");
    setClickUrl("");
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordedDuration(0);
    setUploadedFile(null);
    setUploadedUrl(null);
  };

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Ad Creatives ({creatives.length})</h4>
        <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Creative
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Audio Creative</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label htmlFor="creative-name">Creative Name</Label>
                <Input id="creative-name" value={creativeName} onChange={(e) => setCreativeName(e.target.value)} placeholder="My Audio Ad" />
              </div>

              <Separator />

              <AudioRecorder onRecordingComplete={handleRecordingComplete} />

              <div className="text-center text-sm text-muted-foreground">or</div>

              <div>
                <Button variant="outline" className="w-full gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Upload Audio File
                </Button>
                <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileSelect} />
                <p className="text-xs text-muted-foreground mt-1">Supported: MP3, WAV, OGG, WebM. Max 20MB.</p>
              </div>

              {(recordedUrl || uploadedUrl) && (
                <AudioPreview
                  src={recordedUrl || uploadedUrl!}
                  onRemove={() => { setRecordedBlob(null); setRecordedUrl(null); setUploadedFile(null); setUploadedUrl(null); }}
                />
              )}

              <div>
                <Label htmlFor="click-url">Click-Through URL (optional)</Label>
                <Input id="click-url" value={clickUrl} onChange={(e) => setClickUrl(e.target.value)} placeholder="https://example.com" />
              </div>

              <Button
                onClick={uploadAndCreateCreative}
                disabled={uploading || !creativeName || (!recordedBlob && !uploadedFile)}
                className="w-full"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                    Uploading...
                  </>
                ) : (
                  "Save Creative"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {creatives.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No creatives yet. Add an audio ad to get started.</p>
      ) : (
        <div className="space-y-2">
          {creatives.map((creative) => (
            <div key={creative.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{creative.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {creative.isRecorded ? "Recorded" : "Uploaded"} · {creative.duration}s · <StatusBadge status={creative.status} />
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteMutation.mutate(creative.id)}
                disabled={deleteMutation.isPending}
                aria-label={`Delete creative ${creative.name}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignStats({ campaignId }: { campaignId: string }) {
  const { data: stats, isLoading } = useQuery<CampaignStats>({
    queryKey: ["/api/self-serve-ads/campaigns", campaignId, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/self-serve-ads/campaigns/${campaignId}/stats`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
  });

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!stats) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Eye} label="Impressions" value={stats.impressions.toLocaleString()} />
        <StatCard icon={MousePointer} label="Clicks" value={stats.clicks.toLocaleString()} />
        <StatCard icon={Target} label="CTR" value={stats.ctr} />
        <StatCard icon={DollarSign} label="Spent" value={formatCents(stats.spent)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={CheckCircle} label="Completions" value={stats.completions.toLocaleString()} />
        <StatCard icon={BarChart3} label="Completion Rate" value={stats.completionRate} />
        <StatCard icon={Clock} label="25% Listened" value={stats.quartile25.toLocaleString()} />
        <StatCard icon={DollarSign} label="Budget Left" value={formatCents(stats.budgetRemaining)} />
      </div>

      <div>
        <p className="text-sm text-muted-foreground mb-1">Listen-Through Funnel</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Start: {stats.impressions}</span>
          <span>→</span>
          <span>25%: {stats.quartile25}</span>
          <span>→</span>
          <span>50%: {stats.quartile50}</span>
          <span>→</span>
          <span>75%: {stats.quartile75}</span>
          <span>→</span>
          <span>Complete: {stats.completions}</span>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="p-3 bg-muted/30 rounded-lg text-center">
      <Icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" aria-hidden="true" />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function CampaignDetail({ campaign, onBack }: { campaign: Campaign; onBack: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("creatives");

  const submitMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/self-serve-ads/campaigns/${campaign.id}/submit`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/self-serve-ads/campaigns"] });
      toast({ title: "Campaign submitted and now active!" });
    },
    onError: (err: any) => {
      toast({ title: "Cannot submit", description: err.message, variant: "destructive" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/self-serve-ads/campaigns/${campaign.id}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/self-serve-ads/campaigns"] });
      toast({ title: campaign.status === "paused" ? "Campaign resumed" : "Campaign paused" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/self-serve-ads/campaigns/${campaign.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/self-serve-ads/campaigns"] });
      toast({ title: "Campaign deleted" });
      onBack();
    },
  });

  const budgetPct = campaign.budgetCents > 0 ? Math.min(100, (campaign.spentCents / campaign.budgetCents) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
        <div className="flex-1">
          <h3 className="text-xl font-bold">{campaign.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={campaign.status} />
            <span className="text-sm text-muted-foreground">CPM: {formatCents(campaign.cpmBidCents)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {campaign.status === "draft" && (
            <Button size="sm" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
              {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go Live"}
            </Button>
          )}
          {(campaign.status === "active" || campaign.status === "paused") && (
            <Button size="sm" variant="outline" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
              {campaign.status === "paused" ? "Resume" : "Pause"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
            {editing ? "Cancel" : "Edit"}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Budget Usage</span>
          <span className="text-sm text-muted-foreground">{formatCents(campaign.spentCents)} / {formatCents(campaign.budgetCents)}</span>
        </div>
        <Progress value={budgetPct} className="h-2" />
      </div>

      {editing ? (
        <CampaignForm campaign={campaign} onSaved={() => setEditing(false)} />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="creatives">Creatives</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>
          <TabsContent value="creatives" className="mt-4">
            <CreativeManager campaignId={campaign.id} />
          </TabsContent>
          <TabsContent value="performance" className="mt-4">
            <CampaignStats campaignId={campaign.id} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export function AdvertiserDashboard() {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/self-serve-ads/campaigns"],
  });

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  if (selectedCampaign) {
    return <CampaignDetail campaign={selectedCampaign} onBack={() => setSelectedCampaignId(null)} />;
  }

  return (
    <div className="space-y-6" role="region" aria-label="Advertiser Dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Advertiser Dashboard</h2>
          <p className="text-muted-foreground mt-1">Create and manage audio ad campaigns with CPM bidding</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Campaign</DialogTitle>
            </DialogHeader>
            <CampaignForm onSaved={() => setShowCreate(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <DollarSign className="h-8 w-8 mx-auto mb-2 text-green-500" aria-hidden="true" />
            <p className="text-2xl font-bold">{campaigns.length}</p>
            <p className="text-sm text-muted-foreground">Total Campaigns</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Eye className="h-8 w-8 mx-auto mb-2 text-blue-500" aria-hidden="true" />
            <p className="text-2xl font-bold">{campaigns.reduce((s, c) => s + c.impressions, 0).toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Total Impressions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 text-purple-500" aria-hidden="true" />
            <p className="text-2xl font-bold">{formatCents(campaigns.reduce((s, c) => s + c.spentCents, 0))}</p>
            <p className="text-sm text-muted-foreground">Total Spent</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-lg font-medium mb-2">No campaigns yet</h3>
            <p className="text-muted-foreground mb-4">Create your first audio ad campaign to reach audiobook listeners.</p>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create Your First Campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const budgetPct = campaign.budgetCents > 0 ? Math.min(100, (campaign.spentCents / campaign.budgetCents) * 100) : 0;
            return (
              <Card
                key={campaign.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedCampaignId(campaign.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedCampaignId(campaign.id); } }}
                aria-label={`Campaign: ${campaign.name}, Status: ${campaign.status}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium">{campaign.name}</h3>
                      <StatusBadge status={campaign.status} />
                    </div>
                    <span className="text-sm text-muted-foreground">CPM: {formatCents(campaign.cpmBidCents)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                    <span>{campaign.impressions.toLocaleString()} impressions · {campaign.clicks} clicks</span>
                    <span>{formatCents(campaign.spentCents)} / {formatCents(campaign.budgetCents)}</span>
                  </div>
                  <Progress value={budgetPct} className="h-1.5" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="bg-muted/20 border-dashed">
        <CardContent className="py-6">
          <h3 className="font-medium mb-2">How It Works</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Create a campaign with your budget and CPM bid</li>
            <li>Record or upload audio ad creatives (15-30 seconds recommended)</li>
            <li>Submit your campaign to go live</li>
            <li>Your ads play for audiobook listeners. Higher CPM bids get priority.</li>
            <li>Track impressions, clicks, and listen-through rates in real time</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
