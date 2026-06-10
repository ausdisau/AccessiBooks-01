import { useState, type ReactNode } from "react";
import { MarketingFooter, MarketingNav } from "@/components/marketing-landing";

type MarketingPageShellProps = {
  children: ReactNode;
  onBrowseAsGuest?: () => void;
  loginModal: ReactNode;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
};

export function useMarketingAuthHandlers() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const openLogin = () => {
    setIsRegistering(false);
    setLoginOpen(true);
  };

  const openRegister = () => {
    setIsRegistering(true);
    setLoginOpen(true);
  };

  return {
    loginOpen,
    setLoginOpen,
    isRegistering,
    setIsRegistering,
    openLogin,
    openRegister,
  };
}

export function MarketingPageShell({
  children,
  onBrowseAsGuest,
  loginModal,
  onOpenLogin,
  onOpenRegister,
}: MarketingPageShellProps) {
  return (
    <div className="brand-surface min-h-screen flex flex-col">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      <MarketingNav onOpenLogin={onOpenLogin} onOpenRegister={onOpenRegister} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <MarketingFooter onBrowseAsGuest={onBrowseAsGuest} />
      {loginModal}
    </div>
  );
}
