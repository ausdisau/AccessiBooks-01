interface QuoteProps {
  children: React.ReactNode;
  attribution?: string;
  role?: string;
  className?: string;
}

export function Quote({ children, attribution, role, className = "" }: QuoteProps) {
  return (
    <figure
      className={[
        "rounded-2xl p-6 sm:p-8 h-full border-2",
        className,
      ].join(" ")}
      style={{
        backgroundColor: "var(--brand-cream)",
        borderColor: "var(--brand-line)",
      }}
    >
      <div
        aria-hidden="true"
        className="brand-display text-5xl leading-none mb-2"
        style={{ color: "var(--brand-orange)" }}
      >
        &ldquo;
      </div>
      <blockquote
        className="brand-display text-xl sm:text-2xl leading-snug font-medium"
        style={{ color: "var(--brand-navy)" }}
      >
        {children}
      </blockquote>
      {(attribution || role) && (
        <figcaption
          className="mt-4 text-sm font-medium"
          style={{ color: "var(--brand-ink-soft)" }}
        >
          {attribution && <span className="font-semibold">{attribution}</span>}
          {attribution && role && <span aria-hidden="true"> · </span>}
          {role && <span>{role}</span>}
        </figcaption>
      )}
    </figure>
  );
}
