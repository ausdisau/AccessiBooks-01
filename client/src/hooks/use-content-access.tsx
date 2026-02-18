import { useState, useCallback } from "react";
import { Book } from "@shared/schema";
import { useSubscription } from "./use-subscription";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";

export function useContentAccess() {
  const { user } = useAuth();
  const { isPremium, upgradeToPremium, isUpgrading } = useSubscription();
  const { toast } = useToast();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [blockedContent, setBlockedContent] = useState<Book | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewBook, setPreviewBook] = useState<Book | null>(null);

  const checkAccess = useCallback((book: Book): boolean => {
    if (!book.isPremium) {
      return true;
    }

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to access this content.",
        variant: "destructive",
      });
      return false;
    }

    if (isPremium) {
      return true;
    }

    setPreviewBook(book);
    setShowPreview(true);
    return false;
  }, [user, isPremium, toast]);

  const dismissPreview = useCallback(() => {
    setShowPreview(false);
    setPreviewBook(null);
  }, []);

  const handlePreviewUpgrade = useCallback(() => {
    const book = previewBook;
    setShowPreview(false);
    setPreviewBook(null);
    setBlockedContent(book);
    setShowUpgradeModal(true);
  }, [previewBook]);

  const dismissUpgradeModal = useCallback(() => {
    setShowUpgradeModal(false);
    setBlockedContent(null);
  }, []);

  const handleUpgrade = useCallback(() => {
    upgradeToPremium();
  }, [upgradeToPremium]);

  return {
    checkAccess,
    showUpgradeModal,
    blockedContent,
    dismissUpgradeModal,
    handleUpgrade,
    isUpgrading,
    isPremium,
    showPreview,
    previewBook,
    dismissPreview,
    handlePreviewUpgrade,
  };
}
