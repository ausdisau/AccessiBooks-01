import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Loader2, Mic } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useSubscription } from "@/hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";

type VoicePack = {
  id: string;
  name: string;
  description: string | null;
  voices: string[];
  priceCents: number;
  isPremiumIncluded: boolean;
  previewUrl: string | null;
  isOwned?: boolean;
  isLocked?: boolean;
};

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
}

export function VoicePacksPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPremium } = useSubscription();

  const { data: packs = [], isLoading } = useQuery<VoicePack[]>({
    queryKey: ["/api/voice-packs"],
  });

  const purchaseMutation = useMutation({
    mutationFn: (packId: string) => apiRequest("POST", `/api/voice-packs/${packId}/purchase`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voice-packs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voice-packs/owned"] });
      toast({ title: "Voice pack unlocked", description: "Your new voices are ready in the reader." });
    },
    onError: () => {
      toast({
        title: "Purchase failed",
        description: "We could not complete the purchase. Try again or check billing settings.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="panel-voice-packs">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Premium voice packs</h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          AI narration voices for text-to-speech reading. Premium subscribers include eligible packs automatically.
        </p>
      </div>

      {packs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Voice packs are not available yet. Check back soon.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {packs.map((pack) => {
            const owned = !pack.isLocked;
            const includedWithPremium = pack.isPremiumIncluded && isPremium;

            return (
              <Card key={pack.id} className={owned ? "border-primary/40" : undefined}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Mic className="h-5 w-5 text-primary" aria-hidden="true" />
                      <CardTitle className="text-lg">{pack.name}</CardTitle>
                    </div>
                    {includedWithPremium && (
                      <Badge variant="secondary" className="shrink-0">
                        <Crown className="h-3 w-3 mr-1" aria-hidden="true" />
                        Premium
                      </Badge>
                    )}
                  </div>
                  {pack.description && <CardDescription>{pack.description}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {pack.voices.length} voice{pack.voices.length === 1 ? "" : "s"}: {pack.voices.join(", ")}
                  </p>
                  {owned ? (
                    <Badge>Unlocked</Badge>
                  ) : (
                    <Button
                      onClick={() => purchaseMutation.mutate(pack.id)}
                      disabled={purchaseMutation.isPending}
                      data-testid={`button-buy-voice-pack-${pack.id}`}
                    >
                      {purchaseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Buy for {formatPrice(pack.priceCents)}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
