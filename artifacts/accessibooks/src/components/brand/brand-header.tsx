import { useState, useEffect } from "react";
import { Menu, X, Accessibility } from "lucide-react";
import { BrandWordmark } from "./brand-wordmark";
import { BrandButton } from "./brand-button";

interface NavItem {
  label: string;
  href: string;
}

interface BrandHeaderProps {
  navItems?: NavItem[];
  onSignIn?: () => void;
  onSignUp?: () => void;
}

const defaultNav: NavItem[] = [
  { label: "Features", href: "#features" },
  { label: "Accessibility", href: "#accessibility" },
  { label: "Audiences", href: "#audiences" },
  { label: "Pricing", href: "#pricing" },
];

export function BrandHeader({
  navItems = defaultNav,
  onSignIn,
  onSignUp,
}: BrandHeaderProps) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Scroll-spy: track which on-page section is in view so the matching nav
  // item gets a clear active treatment.
  useEffect(() => {
    const ids = navItems
      .map((i) => (i.href.startsWith("#") ? i.href.slice(1) : null))
      .filter((v): v is string => !!v);
    if (ids.length === 0) return;
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (targets.length === 0) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            visible.set(e.target.id, e.intersectionRatio);
          } else {
            visible.delete(e.target.id);
          }
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of visible) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        setActiveId(bestId);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [navItems]);

  const openA11yPanel = () => {
    document.dispatchEvent(new CustomEvent("accessibooks:open-accessibility"));
  };

  const isActive = (href: string) =>
    href.startsWith("#") && activeId === href.slice(1);

  return (
    <header
      role="banner"
      className="sticky top-0 z-30 backdrop-blur-md border-b"
      style={{
        backgroundColor: "color-mix(in srgb, var(--brand-cream) 88%, transparent)",
        borderColor: "var(--brand-line)",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
        <a
          href="#main-content"
          className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-navy)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-cream)]"
          aria-label="AccessiBooks home"
        >
          <BrandWordmark size="md" />
        </a>

        <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={active ? "location" : undefined}
                className="relative px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-[var(--brand-cream-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-navy)]"
                style={{
                  color: active ? "var(--brand-orange-deep)" : "var(--brand-ink)",
                  fontWeight: active ? 700 : 500,
                }}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded-full"
                    style={{ backgroundColor: "var(--brand-orange-deep)" }}
                  />
                )}
              </a>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <button
            type="button"
            onClick={openA11yPanel}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors hover:bg-[var(--brand-cream-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-navy)]"
            style={{ color: "var(--brand-ink)" }}
            aria-label="Open accessibility settings"
            title="Accessibility settings"
            data-testid="brand-header-a11y"
          >
            <Accessibility className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Accessibility settings</span>
          </button>
          {onSignIn && (
            <BrandButton variant="ghost" size="md" onClick={onSignIn} data-testid="brand-header-sign-in">
              Sign in
            </BrandButton>
          )}
          {onSignUp && (
            <span className="ml-1">
              <BrandButton variant="primary" size="md" onClick={onSignUp} data-testid="brand-header-sign-up">
                Sign up free
              </BrandButton>
            </span>
          )}
        </div>

        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-navy)]"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="brand-mobile-menu"
          onClick={() => setOpen((v) => !v)}
          style={{ color: "var(--brand-navy)" }}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div
          id="brand-mobile-menu"
          className="md:hidden border-t"
          style={{ borderColor: "var(--brand-line)", backgroundColor: "var(--brand-cream)" }}
        >
          <nav aria-label="Primary mobile" className="px-5 sm:px-8 py-4 flex flex-col gap-1">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="px-3 py-3 rounded-md text-base font-medium hover:bg-[var(--brand-cream-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-navy)]"
                style={{ color: "var(--brand-ink)" }}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="flex flex-col gap-2 pt-3 mt-2 border-t" style={{ borderColor: "var(--brand-line)" }}>
              {onSignIn && (
                <BrandButton
                  variant="outline"
                  size="md"
                  onClick={() => {
                    setOpen(false);
                    onSignIn();
                  }}
                >
                  Sign in
                </BrandButton>
              )}
              {onSignUp && (
                <BrandButton
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setOpen(false);
                    onSignUp();
                  }}
                >
                  Sign up free
                </BrandButton>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
