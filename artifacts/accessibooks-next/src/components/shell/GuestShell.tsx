"use client";

import { useCallback, useState } from "react";
import type { Book } from "@shared/schema";
import { useAccessibility } from "@/hooks/use-accessibility";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { localStorageService } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { AccessibilityControls } from "@/components/accessibility-controls";
import { SearchAutocomplete } from "@/components/search-autocomplete";
import { AccessiBooksLogo } from "@/components/accessibooks-logo";
import { Footer } from "@/components/footer";
import { Library } from "@/page-views/library";
import { LoginModal } from "@/components/LoginModal";
import { KeyboardShortcutsOverlay } from "@/components/keyboard-shortcuts-overlay";
import { SignUpPrompt } from "@/components/sign-up-prompt";
import { AiChatPanel } from "@/components/ai-chat-panel";
import { AccessibilityCoachPanel } from "@/components/accessibility-coach-panel";
import { Gift, HeartHandshake, MessageCircle } from "lucide-react";

/**
 * Anonymous browsing chrome. Shown when the visitor has clicked "Browse as
 * guest" on the landing page. Every book interaction prompts the visitor to
 * sign up rather than playing audio, matching the original App.tsx
 * `GuestBrowseApp` behaviour.
 */
export function GuestShell({ onExitGuest: _onExitGuest }: { onExitGuest: () => void }) {
  const [signUpPromptOpen, setSignUpPromptOpen] = useState(false);
  const [signUpAction, setSignUpAction] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const { toggleHighContrast } = useAccessibility();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const toggleFocusMode = useCallback(() => {
    const s = localStorageService.getSettings();
    const next = !s.focusMode;
    localStorageService.saveSettings({ ...s, focusMode: next });
    document.documentElement.classList.toggle("focus-mode", next);
    document.dispatchEvent(new CustomEvent("accessibooks:settings-changed"));
  }, []);

  useKeyboardShortcuts({
    onHighContrast: toggleHighContrast,
    onOpenShortcuts: () => setShortcutsOpen(true),
    onToggleFocusMode: toggleFocusMode,
  });

  const promptSignUp = (action: string) => {
    setSignUpAction(action);
    setSignUpPromptOpen(true);
  };

  const handleGuestSelectBook = (_book: Book) => {
    promptSignUp("listen to books and save your progress");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      <header className="bg-card border-b border-border" role="banner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <AccessiBooksLogo />
            <div className="hidden md:flex flex-1 max-w-md mx-8">
              <SearchAutocomplete onSelectBook={handleGuestSelectBook} />
            </div>
            <div className="flex items-center space-x-4">
              <AccessibilityControls />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCoachOpen(true)}
                aria-label="Open Accessibility Coach"
                data-testid="button-accessibility-coach"
                className="p-2 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                title="Accessibility Coach"
              >
                <HeartHandshake className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChatOpen(true)}
                aria-label="Open AI chat assistant"
                data-testid="button-ai-chat"
                className="p-2"
                title="AI Assistant"
              >
                <MessageCircle className="h-5 w-5" />
              </Button>
              <Button variant="ghost" onClick={() => { setIsRegistering(false); setLoginOpen(true); }}>
                Sign In
              </Button>
              <Button onClick={() => { setIsRegistering(true); setLoginOpen(true); }}>
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </header>
      <AiChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
      <AccessibilityCoachPanel isOpen={coachOpen} onClose={() => setCoachOpen(false)} />

      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Gift className="h-4 w-4 text-primary" />
            <span>Sign up today and get <strong>250 XP bonus</strong>, a welcome badge, and a <strong>7-day free premium trial</strong>!</span>
          </div>
          <Button size="sm" onClick={() => { setIsRegistering(true); setLoginOpen(true); }}>
            Claim Now
          </Button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6" id="main-content">
        <Library onSelectBook={handleGuestSelectBook} />
      </main>

      <Footer />

      <SignUpPrompt
        open={signUpPromptOpen}
        onOpenChange={setSignUpPromptOpen}
        action={signUpAction}
        onSignUp={() => { setSignUpPromptOpen(false); setIsRegistering(true); setLoginOpen(true); }}
        onSignIn={() => { setSignUpPromptOpen(false); setIsRegistering(false); setLoginOpen(true); }}
      />

      <LoginModal
        open={loginOpen}
        onOpenChange={setLoginOpen}
        isRegistering={isRegistering}
        setIsRegistering={setIsRegistering}
      />

      <KeyboardShortcutsOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
