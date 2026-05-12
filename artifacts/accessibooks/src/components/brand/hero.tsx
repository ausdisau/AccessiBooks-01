import type { ReactNode } from "react";

interface HeroProps {
  eyebrow?: string;
  headline: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  art?: ReactNode;
  className?: string;
}

export function Hero({ eyebrow, headline, body, actions, art, className = "" }: HeroProps) {
  return (
    <div
      className={`grid gap-10 md:gap-14 md:grid-cols-12 items-center ${className}`}
    >
      <div className="md:col-span-7 max-w-2xl">
        {eyebrow && (
          <p
            className="mb-5 text-xs sm:text-sm font-semibold uppercase tracking-[0.22em]"
            style={{ color: "var(--brand-orange-deep)" }}
          >
            {eyebrow}
          </p>
        )}
        <h1
          className="brand-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold leading-[1.05]"
          style={{ color: "var(--brand-navy)" }}
        >
          {headline}
        </h1>
        {body && (
          <div
            className="mt-6 text-lg sm:text-xl leading-relaxed max-w-prose"
            style={{ color: "var(--brand-ink-soft)" }}
          >
            {body}
          </div>
        )}
        {actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
      </div>
      {art && (
        <div className="md:col-span-5">
          <div className="relative">{art}</div>
        </div>
      )}
    </div>
  );
}
