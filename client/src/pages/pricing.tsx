import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { SubscriptionCard } from "@/components/subscription-card";
import { MarketingPageShell } from "@/components/marketing-page-shell";
import { useAuth } from "@/hooks/useAuth";

type PricingPageProps = {
  onBrowseAsGuest?: () => void;
  loginModal: ReactNode;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
};

const GUEST_TIERS = [
  {
    name: "Free",
    price: "$0",
    summary: "Full accessibility features and the public-domain library with light ads.",
  },
  {
    name: "Plus",
    price: "$4.99/mo",
    summary: "Ad-free listening, better audio quality, and more TTS each day.",
  },
  {
    name: "Premium",
    price: "$9.99/mo",
    summary: "Offline downloads, HD audio, unlimited TTS, and family-friendly extras.",
  },
];

export function PricingPage({ onBrowseAsGuest, loginModal, onOpenLogin, onOpenRegister }: PricingPageProps) {
  const { isAuthenticated } = useAuth();

  return (
    <MarketingPageShell
      onBrowseAsGuest={onBrowseAsGuest}
      loginModal={loginModal}
      onOpenLogin={onOpenLogin}
      onOpenRegister={onOpenRegister}
    >
      <section
        className="py-16 sm:py-24"
        style={{ backgroundColor: "var(--brand-cream-deep)", color: "var(--brand-ink)" }}
        aria-labelledby="pricing-page-heading"
      >
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <p
            className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] mb-4"
            style={{ color: "var(--brand-orange-deep)" }}
          >
            Simple, fair pricing
          </p>
          <h1
            id="pricing-page-heading"
            className="brand-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight max-w-3xl"
            style={{ color: "var(--brand-navy)" }}
          >
            Start free. Upgrade only when it helps.
          </h1>
          <p className="mt-5 text-lg leading-relaxed max-w-2xl" style={{ color: "var(--brand-ink-soft)" }}>
            Every accessibility feature stays free. Paid plans remove ads, improve audio quality, and unlock offline
            listening when you need them.
          </p>

          {isAuthenticated ? (
            <div className="mt-12 rounded-2xl border-2 p-6 sm:p-10 bg-[var(--brand-cream)] border-[var(--brand-line)]">
              <SubscriptionCard />
            </div>
          ) : (
            <>
              <div className="mt-12 grid gap-6 md:grid-cols-3">
                {GUEST_TIERS.map((tier) => (
                  <article
                    key={tier.name}
                    className="rounded-2xl border-2 p-6"
                    style={{ backgroundColor: "var(--brand-cream)", borderColor: "var(--brand-line)" }}
                  >
                    <h2 className="brand-display text-2xl font-semibold" style={{ color: "var(--brand-navy)" }}>
                      {tier.name}
                    </h2>
                    <p className="mt-2 text-2xl font-bold" style={{ color: "var(--brand-orange-deep)" }}>
                      {tier.price}
                    </p>
                    <p className="mt-4 text-base leading-relaxed" style={{ color: "var(--brand-ink-soft)" }}>
                      {tier.summary}
                    </p>
                  </article>
                ))}
              </div>
              <div className="mt-10 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onOpenRegister}
                  className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-base font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]"
                  style={{ backgroundColor: "var(--brand-orange)" }}
                >
                  Create a free account
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </button>
                <Link
                  href="/"
                  className="inline-flex items-center rounded-lg px-6 py-3 text-base font-semibold border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-navy)]"
                  style={{ borderColor: "var(--brand-navy)", color: "var(--brand-navy)" }}
                >
                  Back to home
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </MarketingPageShell>
  );
}
