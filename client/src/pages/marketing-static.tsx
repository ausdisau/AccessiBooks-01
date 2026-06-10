import type { ReactNode } from "react";
import { MarketingPageShell } from "@/components/marketing-page-shell";

type MarketingStaticPageProps = {
  title: string;
  description?: string;
  children: ReactNode;
  onBrowseAsGuest?: () => void;
  loginModal: ReactNode;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
};

export function MarketingStaticPage({
  title,
  description,
  children,
  onBrowseAsGuest,
  loginModal,
  onOpenLogin,
  onOpenRegister,
}: MarketingStaticPageProps) {
  return (
    <MarketingPageShell
      onBrowseAsGuest={onBrowseAsGuest}
      loginModal={loginModal}
      onOpenLogin={onOpenLogin}
      onOpenRegister={onOpenRegister}
    >
      <section
        className="py-16 sm:py-24"
        style={{ backgroundColor: "var(--brand-cream)", color: "var(--brand-ink)" }}
        aria-labelledby="static-page-heading"
      >
        <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
          <h1
            id="static-page-heading"
            className="brand-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight"
            style={{ color: "var(--brand-navy)" }}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-5 text-lg leading-relaxed" style={{ color: "var(--brand-ink-soft)" }}>
              {description}
            </p>
          )}
          <div className="mt-10 space-y-6 text-base leading-relaxed prose-brand">{children}</div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
