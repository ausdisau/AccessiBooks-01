import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Users, Copy, Check, Gift, DollarSign, Share2, ExternalLink, Loader2 } from "lucide-react";
import type { Referral } from "@shared/schema";

interface ReferralStats {
  totalReferrals: number;
  completedReferrals: number;
  creditsEarned: number;
}

export function ReferralsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: codeData, isLoading: codeLoading } = useQuery<{ code: string }>({
    queryKey: ["/api/referral/code"],
    enabled: !!user,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ReferralStats>({
    queryKey: ["/api/referral/stats"],
    enabled: !!user,
  });

  const { data: history, isLoading: historyLoading } = useQuery<Referral[]>({
    queryKey: ["/api/referral/history"],
    enabled: !!user,
  });

  const referralCode = codeData?.code || "";
  const shareUrl = referralCode
    ? `${window.location.origin}?ref=${referralCode}`
    : "";

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: "Copied!", description: "Referral link copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Please sign in to access the referral program.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (codeLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="page-hero">
        <div className="flex items-center gap-3 mb-2">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Gift className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="page-title text-3xl">Referral Program</h1>
        </div>
        <p className="text-muted-foreground">
          Give friends a 14-day Premium trial — earn 1 free month of Plus for each one who joins.
        </p>
      </div>

      <Card className="dark:bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Your Referral Link
          </CardTitle>
          <CardDescription>
            Your friend gets a 14-day Premium trial when they sign up. You get 1 month of Plus free, on us.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium dark:text-gray-300">Referral Code</label>
            <div className="flex gap-2">
              <Input
                value={referralCode}
                readOnly
                className="font-mono text-lg bg-muted dark:bg-muted"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(referralCode)}
                className="shrink-0"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium dark:text-gray-300">Share Link</label>
            <div className="flex gap-2">
              <Input
                value={shareUrl}
                readOnly
                className="bg-muted dark:bg-muted text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(shareUrl)}
                className="shrink-0"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                const text = `Join me on AccessiBooks — use my link for a 14-day Premium trial: ${shareUrl}`;
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "width=550,height=420");
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Share on X
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank", "width=550,height=420");
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Share on Facebook
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="dark:bg-card">
          <CardContent className="pt-6">
            <div className="text-center">
              <Users className="h-8 w-8 mx-auto text-blue-500 mb-2" />
              <div className="text-3xl font-bold dark:text-white">{stats?.totalReferrals || 0}</div>
              <div className="text-sm text-muted-foreground">Total Referrals</div>
            </div>
          </CardContent>
        </Card>
        <Card className="dark:bg-card">
          <CardContent className="pt-6">
            <div className="text-center">
              <Check className="h-8 w-8 mx-auto text-green-500 mb-2" />
              <div className="text-3xl font-bold dark:text-white">{stats?.completedReferrals || 0}</div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
          </CardContent>
        </Card>
        <Card className="dark:bg-card">
          <CardContent className="pt-6">
            <div className="text-center">
              <DollarSign className="h-8 w-8 mx-auto text-yellow-500 mb-2" />
              <div className="text-3xl font-bold dark:text-white">
                ${((stats?.creditsEarned || 0) / 100).toFixed(2)}
              </div>
              <div className="text-sm text-muted-foreground">Free months earned (Plus equivalent)</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="dark:bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Referral History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            </div>
          ) : !history || history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No referrals yet. Share your link to get started!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((referral) => (
                <div
                  key={referral.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 dark:bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      referral.status === "completed" || referral.status === "rewarded"
                        ? "bg-green-500"
                        : "bg-yellow-500"
                    }`} />
                    <div>
                      <div className="text-sm font-medium dark:text-white">
                        {referral.referralCode}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {referral.createdAt ? new Date(referral.createdAt).toLocaleDateString() : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      referral.status === "completed" || referral.status === "rewarded"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                    }`}>
                      {referral.status}
                    </span>
                    <span className="text-sm font-medium dark:text-white">
                      ${(referral.creditAmount / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
