import { useEffect, useRef, useState } from "react";
import { Book } from "@shared/schema";
import { AudioPlayer } from "@/components/audio-player";
import { BookReviews } from "@/components/book-reviews";
import { ShareButton } from "@/components/share-button";
import { ClipShareDialog } from "@/components/clip-share-dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Scissors } from "lucide-react";
import { AudioAdInterstitial, RewardedAdInterstitial, useAudioAds } from "@/components/audio-ad-interstitial";
import { useAudioContext } from "@/contexts/audio-context";
import { useRewardedAd } from "@/hooks/use-rewarded-ad";
import { useSubscription } from "@/hooks/use-subscription";
import { usePreferencesKernel } from "@/hooks/use-preferences-kernel";
import { RewardedAdOffer } from "@/components/RewardedAdOffer";
import { ActiveRewardBadge } from "@/components/ActiveRewardBadge";
import { useToast } from "@/hooks/use-toast";

interface PlayerProps {
  book: Book | null;
  onBackToLibrary: () => void;
  onViewAuthor?: (authorName: string) => void;
}

export function Player({ book, onBackToLibrary, onViewAuthor }: PlayerProps) {
  const { booksPlayed, incrementBooksPlayed, onAdComplete } = useAudioAds();
  const { onTrackEndCallback, onChapterEndCallback, currentTime } = useAudioContext();
  const [clipOpen, setClipOpen] = useState(false);
  const { tier } = useSubscription();
  const isFree = tier === "free";
  const { offer, isEligible, activeRewards, completeReward, startSession, isCompleting } = useRewardedAd();
  const { profile } = usePreferencesKernel();
  const rewardedAdPreference = profile.rewardedAdPreference ?? "ask";
  const { toast } = useToast();
  const [showRewardedAd, setShowRewardedAd] = useState(false);
  const [rewardedImpressionId, setRewardedImpressionId] = useState<string | null>(null);
  const [offerDismissed, setOfferDismissed] = useState(false);
  // Guard so an "always" auto-accept fires only once per offer
  const autoAcceptedOfferRef = useRef<string | null>(null);

  useEffect(() => {
    onTrackEndCallback.current = incrementBooksPlayed;
    onChapterEndCallback.current = incrementBooksPlayed;
    return () => {
      onTrackEndCallback.current = null;
      onChapterEndCallback.current = null;
    };
  }, [incrementBooksPlayed, onTrackEndCallback, onChapterEndCallback]);

  const handleAcceptOffer = async () => {
    if (!offer) return;
    try {
      const result = await startSession({ rewardType: offer.rewardType, bookId: book?.id });
      if (!result.ok || !result.impressionId) {
        toast({
          title: "Couldn't start ad",
          description: "Please try again.",
          variant: "destructive",
        });
        return;
      }
      setRewardedImpressionId(result.impressionId);
      setShowRewardedAd(true);
    } catch {
      toast({
        title: "Couldn't start ad",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  // Honor "always" preference: auto-accept the offer once when it appears.
  // Only fires for free-tier users, when an offer is eligible, the interstitial is
  // not already showing, the offer hasn't been dismissed this session, and we
  // haven't already auto-accepted this exact placement.
  useEffect(() => {
    if (
      isFree &&
      isEligible &&
      offer &&
      !showRewardedAd &&
      !offerDismissed &&
      rewardedAdPreference === "always" &&
      autoAcceptedOfferRef.current !== offer.adPlacementId
    ) {
      autoAcceptedOfferRef.current = offer.adPlacementId;
      handleAcceptOffer();
    }
  }, [isFree, isEligible, offer, showRewardedAd, offerDismissed, rewardedAdPreference]);

  const handleRewardedAdComplete = async (impressionId: string) => {
    setShowRewardedAd(false);
    setRewardedImpressionId(null);
    if (!offer) return;
    try {
      const result = await completeReward({
        impressionId,
        rewardType: offer.rewardType,
      });
      if (result.granted) {
        toast({
          title: "Perk unlocked!",
          description: result.reward?.label ?? offer.label,
        });
        setOfferDismissed(true);
      }
    } catch {
      toast({
        title: "Something went wrong",
        description: "Could not grant your perk. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!book) {
    return (
      <div className="text-center py-12">
        <h1 className="sr-only">Now Playing</h1>
        <p className="text-muted-foreground text-lg mb-4" data-testid="text-no-book">
          No book selected. Please select a book from the library.
        </p>
        <Button onClick={onBackToLibrary} data-testid="button-back-to-library">
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          Back to Library
        </Button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      {/* Full-bleed blurred cover art backdrop */}
      {book.coverImage && (
        <div
          className="fixed inset-0 -z-10 pointer-events-none"
          aria-hidden="true"
        >
          <img
            src={book.coverImage}
            alt=""
            className="w-full h-full object-cover scale-110"
            style={{ filter: "blur(60px) brightness(0.18) saturate(1.4)" }}
          />
          {/* Gradient overlay to fade bottom into background */}
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>
      )}

      <div className="space-y-8" data-testid="audio-player">
        <h1 className="sr-only">Now Playing</h1>
        <AudioAdInterstitial 
          booksPlayed={booksPlayed}
          onAdComplete={onAdComplete}
          onSkip={onAdComplete}
        />

        {showRewardedAd && offer && rewardedImpressionId && (
          <RewardedAdInterstitial
            rewardLabel={offer.label}
            rewardType={offer.rewardType}
            impressionId={rewardedImpressionId}
            onComplete={handleRewardedAdComplete}
            onCancel={() => {
              setShowRewardedAd(false);
              setRewardedImpressionId(null);
            }}
          />
        )}
        
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button 
            variant="ghost"
            size="sm"
            onClick={onBackToLibrary}
            className="text-muted-foreground hover:text-foreground"
            data-testid="button-back-to-library"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Library
          </Button>
          
          <div className="flex items-center gap-2">
            {isFree && activeRewards.length > 0 && (
              <ActiveRewardBadge rewards={activeRewards} />
            )}
            {book.author && onViewAuthor && (
              <Button 
                variant="ghost"
                size="sm"
                onClick={() => onViewAuthor(book.author)}
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-view-author"
              >
                <User className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {book.author}
              </Button>
            )}
            <ShareButton book={book} variant="button" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setClipOpen(true)}
              className="text-muted-foreground hover:text-foreground"
              data-testid="btn-open-clip-share"
            >
              <Scissors className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Clip
            </Button>
          </div>
          <ClipShareDialog
            open={clipOpen}
            onOpenChange={setClipOpen}
            bookId={book.id}
            bookTitle={book.title}
            currentTime={currentTime}
          />
        </div>

        {/* Rewarded ad offer */}
        {isFree &&
          isEligible &&
          offer &&
          !offerDismissed &&
          !showRewardedAd &&
          rewardedAdPreference === "ask" && (
            <RewardedAdOffer
              offer={offer}
              onAccept={handleAcceptOffer}
              onDismiss={() => setOfferDismissed(true)}
            />
          )}
        
        <AudioPlayer book={book} />
        
        <BookReviews 
          bookId={book.id} 
          title={book.title} 
          author={book.author}
          onViewAuthor={onViewAuthor}
        />
      </div>
    </div>
  );
}
