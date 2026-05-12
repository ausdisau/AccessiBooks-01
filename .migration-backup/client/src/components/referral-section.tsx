import { useQuery, useMutation } from "@tanstack/react-query";
import { Users, Copy, Share2, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ReferralStats {
  referralCode: string | null;
  totalReferred: number;
  convertedCount: number;
  pendingCount: number;
}

export function ReferralSection() {
  const { toast } = useToast();

  // Fetch referral stats
  const { data, isLoading } = useQuery<ReferralStats>({
    queryKey: ["/api/referrals/stats"],
  });

  // Generate referral code mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/referrals/generate");
      return response.json();
    },
    onSuccess: () => {
      // Invalidate the stats query to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/stats"] });
      toast({
        title: "Success",
        description: "Referral link generated!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate referral link",
        variant: "destructive",
      });
    },
  });

  const referralCode = data?.referralCode;
  const referralUrl = referralCode
    ? `${typeof window !== "undefined" ? window.location.origin : ""}?ref=${referralCode}`
    : "";

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      toast({
        title: "Copied!",
        description: "Referral link copied to clipboard",
      });
      // Invalidate stats query after copy
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/stats"] });
    } catch {
      toast({
        title: "Failed to copy",
        variant: "destructive",
      });
    }
  };

  const shareTwitter = () => {
    const text = `Join me on AccessiBooks and get 500 XP + 7 days premium! Check it out here: ${referralUrl}`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "width=550,height=420");
  };

  const shareFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralUrl)}`;
    window.open(url, "_blank", "width=550,height=420");
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-6 w-6" />
            Invite Friends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-6 w-6" />
          Invite Friends
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Description */}
        <p className="text-muted-foreground">
          Share your referral link and earn 500 XP + 7 days premium for each friend who joins!
        </p>

        {/* Generate or Show Referral Code */}
        {!referralCode ? (
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="w-full"
          >
            {generateMutation.isPending ? "Generating..." : "Generate My Referral Link"}
          </Button>
        ) : (
          <div className="space-y-4">
            {/* Referral Link Display */}
            <div className="flex gap-2">
              <Input
                type="text"
                value={referralUrl}
                readOnly
                className="bg-muted"
              />
              <Button
                onClick={copyToClipboard}
                variant="outline"
                size="icon"
                className="shrink-0"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            {/* Share Buttons */}
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={copyToClipboard}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Link
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={shareTwitter}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Share on Twitter/X
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={shareFacebook}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Share on Facebook
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="bg-muted/50">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {data?.totalReferred || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Total Invited
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-muted/50">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold flex items-center justify-center gap-1">
                      <Check className="h-5 w-5 text-green-600" />
                      {data?.convertedCount || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Joined
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-muted/50">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {data?.pendingCount || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Pending
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
