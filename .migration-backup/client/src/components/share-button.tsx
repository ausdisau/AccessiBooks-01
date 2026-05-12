import { Share2, Copy, Twitter, Facebook } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Book } from "@shared/schema";

interface ShareButtonProps {
  book?: Book;
  achievement?: { name: string; icon: string };
  variant?: "icon" | "button";
}

export function ShareButton({ book, achievement, variant = "icon" }: ShareButtonProps) {
  const { toast } = useToast();

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = book ? `${baseUrl}/book/${book.id}` : baseUrl;

  const getShareText = () => {
    if (book) {
      return `I'm listening to ${book.title} by ${book.author} on AccessiBooks!`;
    }
    if (achievement) {
      return `I just earned the ${achievement.name} achievement on AccessiBooks!`;
    }
    return "Check out AccessiBooks!";
  };

  const shareText = getShareText();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied!", description: "Share link copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const shareTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "width=550,height=420");
  };

  const shareFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "width=550,height=420");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "button" ? (
          <Button variant="outline" size="sm">
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
        ) : (
          <Button variant="ghost" size="icon">
            <Share2 className="h-4 w-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={copyLink}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={shareTwitter}>
          <Twitter className="mr-2 h-4 w-4" />
          Share on Twitter/X
        </DropdownMenuItem>
        <DropdownMenuItem onClick={shareFacebook}>
          <Facebook className="mr-2 h-4 w-4" />
          Share on Facebook
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
