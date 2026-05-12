import type { ReactNode } from "react";

interface FeatureCardProps {
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  className?: string;
}

export function FeatureCard({ icon, title, description, className = "" }: FeatureCardProps) {
  return (
    <article
      className={[
        "rounded-2xl p-6 sm:p-7 h-full transition-colors",
        "border-2",
        className,
      ].join(" ")}
      style={{
        backgroundColor: "var(--brand-cream)",
        borderColor: "var(--brand-line)",
      }}
    >
      {icon && (
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
          style={{
            backgroundColor: "var(--brand-cream-deep)",
            color: "var(--brand-orange-deep)",
          }}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <h3
        className="brand-display text-xl sm:text-2xl font-semibold mb-2 leading-tight"
        style={{ color: "var(--brand-navy)" }}
      >
        {title}
      </h3>
      <p className="text-base leading-relaxed" style={{ color: "var(--brand-ink-soft)" }}>
        {description}
      </p>
    </article>
  );
}
