"use client";

import { type Dispatch, type SetStateAction } from "react";
import type { Book } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { PremiumUpgradeModal } from "@/components/premium-upgrade-modal";
import { PremiumPreviewPlayer } from "@/components/premium-preview-player";
import { EngagementUpsell } from "@/components/engagement-upsell";
import { CompletionModal, type CompletionData } from "@/components/completion-certificate";
import { KeyboardShortcutsOverlay } from "@/components/keyboard-shortcuts-overlay";
import { VoiceControlButton } from "@/components/voice-control-button";
import type { UseVoiceControlReturn } from "@/hooks/use-voice-control";

type EngagementUpsellState = {
  type: "book_complete" | "streak_milestone" | "listening_milestone";
  detail: string;
  open: boolean;
};

interface Props {
  showPreview: boolean;
  previewBook: Book | null;
  dismissPreview: () => void;
  handlePreviewUpgrade: () => void;
  showUpgradeModal: boolean;
  dismissUpgradeModal: (open?: boolean) => void;
  blockedContent: Book | null;
  handleUpgrade: () => void;
  isUpgrading: boolean;
  upgradeLimitType: "skip" | "device" | "loan" | null;
  engagementUpsell: EngagementUpsellState;
  setEngagementUpsell: Dispatch<SetStateAction<EngagementUpsellState>>;
  upgradeToPremium: (plan: "monthly" | "annual") => void;
  completionData: CompletionData | null;
  setCompletionData: Dispatch<SetStateAction<CompletionData | null>>;
  onSelectBookFromCompletion: (book: Book) => void;
  voiceControlEnabled: boolean;
  voiceControl: UseVoiceControlReturn;
  shortcutsOpen: boolean;
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>;
}

/**
 * Aggregated dialog/overlay layer for the authenticated shell. Receives all
 * relevant state as props from MainShell so the modals themselves can stay
 * stateless and the shell stays under the per-file size cap.
 */
export function AppModals(props: Props) {
  const {
    showPreview, previewBook, dismissPreview, handlePreviewUpgrade,
    showUpgradeModal, dismissUpgradeModal, blockedContent, handleUpgrade, isUpgrading, upgradeLimitType,
    engagementUpsell, setEngagementUpsell, upgradeToPremium,
    completionData, setCompletionData, onSelectBookFromCompletion,
    voiceControlEnabled, voiceControl,
    shortcutsOpen, setShortcutsOpen,
  } = props;

  return (
    <>
      {showPreview && previewBook && (
        <PremiumPreviewPlayer
          book={previewBook}
          onUpgrade={handlePreviewUpgrade}
          onDismiss={dismissPreview}
        />
      )}

      <PremiumUpgradeModal
        open={showUpgradeModal}
        onOpenChange={dismissUpgradeModal}
        book={blockedContent}
        onUpgrade={handleUpgrade}
        isUpgrading={isUpgrading}
        limitType={upgradeLimitType}
      />

      <EngagementUpsell
        type={engagementUpsell.type}
        detail={engagementUpsell.detail}
        open={engagementUpsell.open}
        onOpenChange={(open) => setEngagementUpsell((prev) => ({ ...prev, open }))}
        onUpgrade={(plan) => {
          setEngagementUpsell((prev) => ({ ...prev, open: false }));
          upgradeToPremium(plan || "monthly");
        }}
      />

      <CompletionModal
        data={completionData}
        onClose={() => setCompletionData(null)}
        onSelectBook={async (bookId) => {
          setCompletionData(null);
          const cached = (queryClient.getQueryData<{ data: Book[] }>(["/api/books"])?.data ?? []).find(
            (b) => b.id === bookId,
          );
          if (cached) {
            onSelectBookFromCompletion(cached);
            return;
          }
          try {
            const res = await fetch(`/api/books/${bookId}`);
            if (res.ok) {
              const book: Book = await res.json();
              onSelectBookFromCompletion(book);
            }
          } catch {
            // ignore
          }
        }}
      />

      {voiceControlEnabled && voiceControl.isSupported && (
        <VoiceControlButton voiceControl={voiceControl} />
      )}

      <KeyboardShortcutsOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
