import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-[var(--brand-cream-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-navy)]"
              style={{ color: "var(--brand-ink)" }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {onSignIn && (
            <BrandButton variant="ghost" size="md" onClick={onSignIn} data-testid="brand-header-sign-in">
              Sign in
            </BrandButton>
          )}
          {onSignUp && (
            <BrandButton variant="primary" size="md" onClick={onSignUp} data-testid="brand-header-sign-up">
              Sign up free
            </BrandButton>
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
