import type { ReactNode } from "react";

interface SectionProps {
  children: ReactNode;
  id?: string;
  className?: string;
  /** Background tone */
  tone?: "cream" | "deep" | "navy";
  /** Vertical padding rhythm */
  spacing?: "md" | "lg" | "xl";
  ariaLabelledby?: string;
  ariaLabel?: string;
}

const toneStyles = {
  cream: { bg: "var(--brand-cream)", color: "var(--brand-ink)" },
  deep: { bg: "var(--brand-cream-deep)", color: "var(--brand-ink)" },
  navy: { bg: "var(--brand-navy-strong)", color: "var(--brand-cream)" },
};

const spacingStyles = {
  md: "py-12 sm:py-16",
  lg: "py-16 sm:py-24",
  xl: "py-20 sm:py-28 md:py-32",
};

export function Section({
  children,
  id,
  className = "",
  tone = "cream",
  spacing = "lg",
  ariaLabelledby,
  ariaLabel,
}: SectionProps) {
  const t = toneStyles[tone];
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledby}
      aria-label={ariaLabel}
      className={`${spacingStyles[spacing]} ${className}`}
      style={{ backgroundColor: t.bg, color: t.color }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">{children}</div>
    </section>
  );
}
