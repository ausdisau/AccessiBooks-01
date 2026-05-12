import { useState, useCallback } from "react";
import { Book } from "@shared/schema";
import { useSubscription } from "./use-subscription";
import { useAuth } from "./useAuth";
import type { UpgradeLimitType } from "@/components/premium-upgrade-modal";

export function useContentAccess() {
  const { user } = useAuth();
  const { isPremium, upgradeToPremium, isUpgrading } = useSubscription();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [blockedContent, setBlockedContent] = useState<Book | null>(null);
  const [upgradeLimitType, setUpgradeLimitType] = useState<UpgradeLimitType>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewBook, setPreviewBook] = useState<Book | null>(null);

  const checkAccess = useCallback((_book: Book): boolean => {
    return true;
  }, []);

  const triggerUpgradeModal = useCallback((limitType: UpgradeLimitType, book?: Book | null) => {
    setUpgradeLimitType(limitType);
    setBlockedContent(book || null);
    setShowUpgradeModal(true);
  }, []);

  const dismissPreview = useCallback(() => {
    setShowPreview(false);
    setPreviewBook(null);
  }, []);

  const handlePreviewUpgrade = useCallback(() => {
    const book = previewBook;
    setShowPreview(false);
    setPreviewBook(null);
    setBlockedContent(book);
    setUpgradeLimitType(null);
    setShowUpgradeModal(true);
  }, [previewBook]);

  const dismissUpgradeModal = useCallback(() => {
    setShowUpgradeModal(false);
    setBlockedContent(null);
    setUpgradeLimitType(null);
  }, []);

  const handleUpgrade = useCallback(() => {
    upgradeToPremium("monthly");
  }, [upgradeToPremium]);

  return {
    checkAccess,
    showUpgradeModal,
    blockedContent,
    upgradeLimitType,
    dismissUpgradeModal,
    handleUpgrade,
    triggerUpgradeModal,
    isUpgrading,
    isPremium,
    showPreview,
    previewBook,
    dismissPreview,
    handlePreviewUpgrade,
  };
}
