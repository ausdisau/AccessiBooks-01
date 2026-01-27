import { Book } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, Lock, Check } from "lucide-react";

interface PremiumUpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  onUpgrade: () => void;
  isUpgrading: boolean;
}

export function PremiumUpgradeModal({
  open,
  onOpenChange,
  book,
  onUpgrade,
  isUpgrading,
}: PremiumUpgradeModalProps) {
  const contentType = book?.contentType || "audiobook";
  const contentAction = contentType === "audiobook" ? "listen to" : "read";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-yellow-500 rounded-full p-2">
              <Lock className="h-5 w-5 text-white" />
            </div>
            <DialogTitle>Premium Content</DialogTitle>
          </div>
          <DialogDescription>
            {book ? (
              <>
                <strong>"{book.title}"</strong> by {book.author} is premium content.
                Upgrade to AccessiBooks Premium to {contentAction} this and thousands of other titles.
              </>
            ) : (
              "This content requires a Premium subscription."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border">
            <Crown className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="font-semibold">AccessiBooks Premium</p>
              <p className="text-sm text-muted-foreground">$9.99/month</p>
            </div>
          </div>

          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              Access to all commercial audiobooks & ebooks
            </li>
            <li className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              High-quality audio streaming
            </li>
            <li className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              Unlimited skips and offline downloads
            </li>
            <li className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              Ad-free experience
            </li>
          </ul>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={onUpgrade}
            disabled={isUpgrading}
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
          >
            <Crown className="h-4 w-4 mr-2" />
            {isUpgrading ? "Processing..." : "Upgrade to Premium"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
