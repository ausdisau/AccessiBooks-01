import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/use-subscription";
import { Lock, MessageSquare, Heart, ChevronLeft, ChevronRight, Plus, Flag } from "lucide-react";
import { Link } from "@/lib/wouter-compat";
import { AdSlot } from "@/components/AdSlot";

interface Topic {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  iconEmoji: string | null;
  premiumOnlyPost: boolean;
  premiumOnlyView: boolean;
  isAccessibilityCategory: boolean;
  canPost: boolean;
  canView: boolean;
}

interface Thread {
  id: string;
  topicId: string;
  authorDisplayName: string;
  kind: string;
  title: string;
  body: string;
  isPinned: boolean;
  isLocked: boolean;
  replyCount: number;
  reactionCount: number;
  lastActivityAt: string;
  createdAt: string;
}

interface Reply {
  id: string;
  threadId: string;
  authorDisplayName: string;
  body: string;
  reactionCount: number;
  createdAt: string;
}

const PAGE_SIZE = 20;

export default function CommunityPage() {
  const { user } = useAuth() as { user: { subscriptionTier?: string | null } | null | undefined };
  const { tier } = useSubscription();
  const isPaid = tier === "plus" || tier === "premium" || tier === "institutional";
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [composerOpen, setComposerOpen] = useState(false);
  const { toast } = useToast();

  const { data: topicsData, isLoading: topicsLoading } = useQuery<{ topics: Topic[] }>({
    queryKey: ["/api/bulletin/topics"],
  });
  const topics = topicsData?.topics ?? [];

  const currentTopic = topics.find(t => t.id === selectedTopicId) ?? topics[0];
  const topicId = currentTopic?.id;

  const { data: threadsData, isLoading: threadsLoading } = useQuery<{
    threads: Thread[]; page: number; total: number; hasMore: boolean;
    premiumGated?: boolean; upgradeReason?: string;
  }>({
    queryKey: ["/api/bulletin/threads", topicId, page],
    queryFn: async () => {
      const url = `/api/bulletin/threads?topicId=${topicId}&page=${page}&pageSize=${PAGE_SIZE}`;
      const r = await fetch(url, { credentials: "include" });
      return r.json();
    },
    enabled: !!topicId,
  });

  const totalPages = Math.max(1, Math.ceil((threadsData?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="container max-w-6xl mx-auto p-4 space-y-6" data-testid="page-community">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" aria-hidden="true" />
          Community Bulletin
        </h1>
        <p className="text-muted-foreground mt-1">
          Conversation, accessibility tips, and announcements — paged, no infinite scroll.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        <nav aria-label="Topics" className="space-y-2">
          {topicsLoading ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : (
            topics.map(t => {
              const active = currentTopic?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setSelectedTopicId(t.id); setPage(1); }}
                  aria-current={active ? "page" : undefined}
                  data-testid={`topic-${t.slug}`}
                  className={`w-full text-left p-3 rounded-md border transition focus-visible:ring-2 focus-visible:ring-primary ${
                    active ? "bg-primary/10 border-primary" : "border-border hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true">{t.iconEmoji ?? "📌"}</span>
                    <span className="font-medium text-sm flex-1">{t.name}</span>
                    {t.premiumOnlyView && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Premium only" />}
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                  )}
                </button>
              );
            })
          )}
        </nav>

        <main>
          {currentTopic && (
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-xl font-semibold">{currentTopic.name}</h2>
              {currentTopic.canPost && user && (
                <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="btn-new-thread">
                      <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> New thread
                    </Button>
                  </DialogTrigger>
                  <ThreadComposer
                    topicId={currentTopic.id}
                    onClose={() => setComposerOpen(false)}
                  />
                </Dialog>
              )}
              {!currentTopic.canPost && currentTopic.premiumOnlyPost && (
                <Badge variant="outline">
                  <Lock className="h-3 w-3 mr-1" aria-hidden="true" /> Plus & Premium can post
                </Badge>
              )}
            </div>
          )}

          {threadsData?.premiumGated && (
            <Card className="p-6 text-center">
              <Lock className="h-8 w-8 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
              <p className="font-medium">{threadsData.upgradeReason ?? "This topic is for Plus and Premium members."}</p>
              <Link href="/pricing">
                <Button className="mt-3" data-testid="btn-upgrade-from-topic">See plans</Button>
              </Link>
            </Card>
          )}

          {threadsLoading && (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {!threadsLoading && (threadsData?.threads ?? []).length === 0 && !threadsData?.premiumGated && (
            <Card className="p-6 text-center text-muted-foreground">
              No threads yet — be the first to start a conversation.
            </Card>
          )}

          <ul className="space-y-3">
            {(threadsData?.threads ?? []).flatMap((t, idx) => {
              const items = [
                <li key={t.id}>
                  <ThreadCard
                    thread={t}
                    expanded={activeThreadId === t.id}
                    onToggle={() => setActiveThreadId(activeThreadId === t.id ? null : t.id)}
                  />
                </li>,
              ];
              // Sponsored bulletin slot: one labeled placement after the 3rd thread.
              // Suppressed in accessibility/disability-themed topics per ad rules.
              if (!isPaid && idx === 2 && currentTopic && !currentTopic.isAccessibilityCategory) {
                items.push(
                  <li key={`sponsored-${t.id}`} aria-label="Sponsored thread" data-testid="bulletin-sponsored-slot">
                    <div className="rounded-md border-2 border-dashed border-muted-foreground/30 p-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 px-1">Sponsored</p>
                      <AdSlot placementId="community-thread" />
                    </div>
                  </li>
                );
              }
              return items;
            })}
          </ul>

          {/* Pagination — explicit page controls, no infinite scroll */}
          {(threadsData?.total ?? 0) > PAGE_SIZE && (
            <nav aria-label="Thread pagination" className="flex items-center justify-between mt-6">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                data-testid="btn-page-prev"
              >
                <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground" aria-live="polite">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                disabled={!threadsData?.hasMore}
                onClick={() => setPage(p => p + 1)}
                data-testid="btn-page-next"
              >
                Next <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
              </Button>
            </nav>
          )}
        </main>
      </div>
    </div>
  );
}

function ThreadCard({ thread, expanded, onToggle }: { thread: Thread; expanded: boolean; onToggle: () => void }) {
  const { user } = useAuth() as { user: { id?: string; subscriptionTier?: string | null } | null | undefined };
  const { toast } = useToast();
  const [replyBody, setReplyBody] = useState("");

  const { data: detail, isLoading: detailLoading } = useQuery<{ thread: Thread; replies: Reply[] }>({
    queryKey: ["/api/bulletin/threads", thread.id, "detail"],
    queryFn: async () => {
      const r = await fetch(`/api/bulletin/threads/${thread.id}`, { credentials: "include" });
      return r.json();
    },
    enabled: expanded,
  });

  const reactM = useMutation({
    mutationFn: async (targetId: string) => {
      const r = await apiRequest("POST", "/api/bulletin/react", { targetType: "thread", targetId, emoji: "👍" });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bulletin/threads"] });
    },
  });

  const replyM = useMutation({
    mutationFn: async (body: string) => {
      const r = await apiRequest("POST", `/api/bulletin/threads/${thread.id}/replies`, { body });
      return r.json();
    },
    onSuccess: () => {
      setReplyBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/bulletin/threads", thread.id, "detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bulletin/threads"] });
      toast({ title: "Reply posted", duration: 2000 });
    },
  });

  const reportM = useMutation({
    mutationFn: async (vars: { targetType: "thread" | "reply"; targetId: string }) => {
      await apiRequest("POST", "/api/bulletin/report", { ...vars, reason: "user-reported" });
    },
    onSuccess: () => toast({ title: "Reported — thank you. Moderators will review.", duration: 3000 }),
  });

  return (
    <Card data-testid={`thread-card-${thread.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              {thread.isPinned && <Badge variant="secondary">Pinned</Badge>}
              {thread.kind === "announcement" && <Badge>Announcement</Badge>}
              <button
                onClick={onToggle}
                className="text-left hover:underline focus-visible:ring-2 focus-visible:ring-primary rounded"
                aria-expanded={expanded}
                data-testid={`thread-toggle-${thread.id}`}
              >
                {thread.title}
              </button>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              by {thread.authorDisplayName} · {thread.replyCount} replies · {thread.reactionCount} reactions
            </p>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm">{thread.body}</p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => reactM.mutate(thread.id)}
              data-testid={`thread-react-${thread.id}`}
              aria-label="React to thread"
            >
              <Heart className="h-4 w-4 mr-1" aria-hidden="true" /> {thread.reactionCount}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => reportM.mutate({ targetType: "thread", targetId: thread.id })}
              data-testid={`thread-report-${thread.id}`}
            >
              <Flag className="h-4 w-4 mr-1" aria-hidden="true" /> Report
            </Button>
          </div>

          {detailLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <ul className="space-y-2 border-l-2 border-border pl-3">
              {(detail?.replies ?? []).map(r => (
                <li key={r.id} className="text-sm" data-testid={`reply-${r.id}`}>
                  <p className="font-medium">{r.authorDisplayName}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{r.body}</p>
                </li>
              ))}
              {(detail?.replies ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">No replies yet.</li>
              )}
            </ul>
          )}

          {!thread.isLocked && user && (
            <form
              onSubmit={(e) => { e.preventDefault(); if (replyBody.trim()) replyM.mutate(replyBody.trim()); }}
              className="space-y-2"
            >
              <label htmlFor={`reply-${thread.id}`} className="text-sm font-medium">Your reply</label>
              <Textarea
                id={`reply-${thread.id}`}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="Be kind, be specific."
                data-testid={`reply-input-${thread.id}`}
              />
              <Button
                type="submit"
                size="sm"
                disabled={!replyBody.trim() || replyM.isPending}
                data-testid={`reply-submit-${thread.id}`}
              >
                Post reply
              </Button>
            </form>
          )}
          {thread.isLocked && <p className="text-xs text-muted-foreground">This thread is locked.</p>}
        </CardContent>
      )}
    </Card>
  );
}

function ThreadComposer({ topicId, onClose }: { topicId: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/bulletin/threads", { topicId, title, body });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bulletin/threads"] });
      toast({ title: "Thread posted", duration: 2000 });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Couldn't post", description: err?.message, variant: "destructive" });
    },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Start a new thread</DialogTitle>
      </DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); if (title.trim() && body.trim()) m.mutate(); }} className="space-y-3">
        <div>
          <label htmlFor="thread-title" className="text-sm font-medium">Title</label>
          <Input
            id="thread-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={240}
            required
            data-testid="thread-title-input"
          />
        </div>
        <div>
          <label htmlFor="thread-body" className="text-sm font-medium">Body</label>
          <Textarea
            id="thread-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            maxLength={8000}
            required
            data-testid="thread-body-input"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!title.trim() || !body.trim() || m.isPending} data-testid="thread-submit">
            Post
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
